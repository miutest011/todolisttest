// 变异测试的"发动机"：把一处代码故意改坏，塞进一个隐藏的测试页里跑一遍，读回结果。
// 界面在 mutate.html，要改哪些地方列在 mutations.js。
//
// 为什么要这个工具：测试全绿不能证明测试有用 —— 抓不到 bug 的测试也是绿的。
// 唯一的验证办法是故意改坏代码、看测试会不会红。以前每一处都要手动"改文件 → 刷新 → 看结果 → 改回来"，
// 慢，还容易忘了改回来。这里全在内存里做，磁盘上的文件从头到尾不动。
//
// 能改测试页加载的脚本，也能改测试用 fetch 去读的文件（style.css、index.html、sw.js）。
//
// 上半部分的小函数不碰页面，tests-mutate.js 里有测试盯着；
// 最下面的 runMutant 要开 iframe，靠 mutate.html 每次运行前的两个"自检"来保证它没坏。

// ---- 读测试页 ----
// test.html 里 `const SCRIPTS = [...]` 那一行列出了要加载哪些脚本（路径相对 tools/ 目录）。
// 找不到这一行返回 null —— 说明 test.html 的写法变了，这个工具要跟着改
function parseTestScripts(testHtml) {
  const match = testHtml.match(/const SCRIPTS = \[([^\]]*)\];/);
  if (!match) return null;
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

// 测试页里的路径换成"相对项目根目录"的路径，和 mutations.js 里 file 的写法对上：
// '../app.js' → 'app.js'，'test-runner.js' → 'tools/test-runner.js'
function scriptToProjectPath(script) {
  return script.startsWith('../') ? script.slice(3) : 'tools/' + script;
}

// 这个文件是不是测试页用 <script> 加载的脚本。
// 是脚本的话，把改过的代码换进脚本列表；
// 不是（style.css、index.html、sw.js 这些测试用 fetch 去读的文件），就得拦住 fetch 换内容 —— 见 buildMutantPage
function isTestScript(testHtml, file) {
  const scripts = parseTestScripts(testHtml) || [];
  return scripts.some((script) => scriptToProjectPath(script) === file);
}

// ---- 改代码 ----
// 在源代码里把 find 换成 replace。find 必须正好出现一次：
// 一处都没有，说明代码后来改过、这条变异过期了；出现好几处，就不知道该改哪一处。
//
// 注意这里不能用 source.replace(find, replace)：replace 里要是有 $& $' 这种写法
// （代码里的模板字符串 `${…}` 就很容易凑出来），会被当成特殊符号展开，改出来的代码就不是你写的样子了
function applyMutation(source, find, replace) {
  const count = source.split(find).length - 1;
  if (count !== 1) return { ok: false, count: count, code: null };

  const at = source.indexOf(find);
  return { ok: true, count: 1, code: source.slice(0, at) + replace + source.slice(at + find.length) };
}

// 把改过的代码变成能直接放进 <script src> 的地址。
// 测试页加载脚本时会在地址后面加 ?t=时间戳（防缓存）。对 data: 地址来说，多出来的这几个字
// 会变成代码的最后一截，直接语法错误 —— 所以末尾先补一个 //，让它落进注释里
function toScriptUrl(code) {
  return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(code + '\n//');
}

// 拼出"用了改过的文件"的测试页。
// file 为 null 时什么都不换 —— 用来跑"没改过"的对照组。
//   - 改的是测试页加载的脚本：把脚本列表里那一项换成改过的代码
//   - 改的是别的文件（比如 style.css、index.html）：测试是用 fetch 去读它们的，
//     所以在测试页最前面装一个"拦截器"，谁 fetch 这个文件就把改过的内容给谁
function buildMutantPage(testHtml, baseHref, file, code) {
  const scripts = parseTestScripts(testHtml);
  const asScript = file !== null && isTestScript(testHtml, file);
  const list = scripts.map((script) => (
    asScript && scriptToProjectPath(script) === file ? toScriptUrl(code) : script
  ));

  // <base> 让测试页里的相对路径（其它脚本、../index.html）照常能找到。
  // 另外记下加载时的语法错误：改出语法错误的变异会让一大片测试失败，但那不叫"测试抓到了 bug"
  let head =
    `<head><base href="${baseHref}">` +
    '<script>window.__syntaxErrors = [];' +
    'addEventListener("error", function (e) { if (e.error && e.error.name === "SyntaxError") __syntaxErrors.push(e.message); });' +
    '</script>';

  if (file !== null && !asScript) {
    const path = new URL(file, new URL('../', baseHref)).pathname;
    // 内容要塞进 <script> 里：JSON 能处理引号换行，但不管 < 号，
    // 内容里要是有 </script> 会把这段脚本提前截断，所以把 < 也转义掉
    const text = JSON.stringify(code).replace(/</g, '\\u003c');
    head +=
      '<script>(function () {' +
      'var realFetch = window.fetch;' +
      `var mutantPath = ${JSON.stringify(path)};` +
      `var mutantText = ${text};` +
      'window.fetch = function (input, init) {' +
      '  var url = new URL(typeof input === "string" ? input : input.url, document.baseURI);' +
      '  if (url.pathname === mutantPath) return Promise.resolve(new Response(mutantText, { status: 200 }));' +
      '  return realFetch.apply(this, arguments);' +
      '};' +
      '})();</script>';
  }

  // 两处都用函数当第二个参数，理由同 applyMutation：别让 $ 被展开
  return testHtml
    .replace('<head>', () => head)
    .replace(/const SCRIPTS = \[[^\]]*\];/, () => 'const SCRIPTS = ' + JSON.stringify(list) + ';');
}

// ---- 判断结果 ----
// 一条变异最后是什么结局：
//   stale     过期了：find 在文件里不是正好一处
//   broken    改出了语法错误、或者脚本加载失败，代码根本跑不起来（不算测试的功劳）
//   timeout   测试页一直没跑完
//   killed    抓到了：有测试失败（或者两遍结果不一样）
//   survived  没抓到：测试全绿 —— 要去查（改的是 style.css 这类文件时，也可能是根本没有测试去读它）
function classifyMutant(run) {
  if (run.count !== 1) return 'stale';
  // 加载失败时测试页只写一句"加载失败"、一条失败都不列，不单独判断的话会被当成"没抓到"
  if (run.syntaxErrors.length > 0 || run.summary.includes('加载失败')) return 'broken';
  if (!run.finished) return 'timeout';
  if (run.failed.length > 0 || run.unstable) return 'killed';
  return 'survived';
}

// ---- 真的跑一遍（要开 iframe）----
// options: { testHtml, baseHref, source, file, find, replace, timeoutMs }
//   source 为 null 表示跑对照组（什么都不改）
async function runMutant(options) {
  let file = null;
  let code = null;
  let count = 1;

  if (options.source !== null) {
    const mutated = applyMutation(options.source, options.find, options.replace);
    count = mutated.count;
    if (!mutated.ok) {
      return { status: 'stale', count: count, summary: '', failed: [], syntaxErrors: [] };
    }
    file = options.file;
    code = mutated.code;
  }

  const iframe = document.createElement('iframe');
  iframe.className = 'mutant-frame';
  // 放在屏幕外面但保留正常大小：拖拽类的测试要算元素位置，尺寸是 0 的话会乱
  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:420px;height:800px;border:0;';
  document.body.appendChild(iframe);
  iframe.srcdoc = buildMutantPage(options.testHtml, options.baseHref, file, code);

  const deadline = Date.now() + (options.timeoutMs || 60000);
  let finished = false;
  let summary = '';
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const el = iframe.contentDocument && iframe.contentDocument.getElementById('summary');
    summary = el ? el.textContent : '';
    // 测试页跑完会把汇总写上；"正在运行"是还在跑
    if (summary !== '' && !summary.includes('正在运行')) {
      finished = true;
      break;
    }
  }

  const doc = iframe.contentDocument;
  const run = {
    count: count,
    finished: finished,
    summary: summary,
    failed: [...doc.querySelectorAll('.result.fail')].map((row) => row.firstChild.textContent.replace(/^✗ /, '')),
    // 两遍结果不一样时，测试页会出一条提到"状态泄漏"的警告条
    unstable: [...doc.querySelectorAll('.banner')].some((b) => b.textContent.includes('状态泄漏')),
    syntaxErrors: (iframe.contentWindow.__syntaxErrors || []).slice()
  };
  iframe.remove();

  run.status = classifyMutant(run);
  return run;
}
