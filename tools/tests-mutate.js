// 变异测试工具（mutate-runner.js）自己的测试。
//
// 这个工具是用来检验"测试靠不靠谱"的，要是它自己算错了 ——
// 比如改代码时悄悄改错了地方、或者把"代码跑不起来"算成"测试抓到了" ——
// 它给出的每个结论都是假的。所以它不碰页面的那几个小函数，在这里逐个钉住。
// 真正开 iframe 跑的部分，靠 mutate.html 每次运行前的两个自检（对照组、必死变异）来保证。

const SAMPLE_TEST_HTML =
  '<!DOCTYPE html>\n<html>\n<head>\n<title>测试</title>\n</head>\n<body>\n<script>\n' +
  "  const SCRIPTS = ['../app.js', '../logs.js', 'test-runner.js', 'tests.js'];\n" +
  '</script>\n</body>\n</html>';

test('变异工具：从测试页里读出要加载的脚本；写法变了就返回 null', () => {
  assertEqual(parseTestScripts(SAMPLE_TEST_HTML), ['../app.js', '../logs.js', 'test-runner.js', 'tests.js'], '按顺序读出来');
  assertEqual(parseTestScripts('<html>没有脚本列表</html>'), null, '找不到时要明确说找不到，而不是返回空列表假装没事');
});

test('变异工具：测试页里的路径换成相对项目根目录的路径', () => {
  assertEqual(scriptToProjectPath('../app.js'), 'app.js', '上一层的就是项目根目录');
  assertEqual(scriptToProjectPath('test-runner.js'), 'tools/test-runner.js', '同一层的在 tools/ 里');
});

test('变异工具：能分清哪些文件是测试页加载的脚本', () => {
  assertEqual(isTestScript(SAMPLE_TEST_HTML, 'logs.js'), true, 'logs.js 是脚本');
  assertEqual(isTestScript(SAMPLE_TEST_HTML, 'tools/test-runner.js'), true, 'tools 里的也认得');
  assertEqual(isTestScript(SAMPLE_TEST_HTML, 'style.css'), false, 'style.css 不是脚本，要走"拦截 fetch"那条路');
});

test('变异工具：find 正好出现一次才改；零次或多次都不改', () => {
  assertEqual(applyMutation('a = 1;\nb = 2;', 'b = 2;', 'b = 3;'), { ok: true, count: 1, code: 'a = 1;\nb = 3;' }, '正好一处，照改');
  assertEqual(applyMutation('a = 1;', 'b = 2;', 'x'), { ok: false, count: 0, code: null }, '找不到：代码改过了，变异过期');
  assertEqual(applyMutation('x; x;', 'x;', 'y;'), { ok: false, count: 2, code: null }, '好几处：不知道改哪一处，宁可不改');
});

test('变异工具：替换内容里有 $ 时原样放进去，不会被展开', () => {
  // 用 String.replace 的话，$& 会变成"被替换的原文"，$\' 会变成"原文后面的所有内容"
  const result = applyMutation('const a = 1;', 'const a = 1;', "const a = `$&${x}$'`;");

  assertEqual(result.code, "const a = `$&${x}$'`;", '改出来的必须就是写在清单里的样子');
});

test('变异工具：生成的脚本地址被加上 ?t=时间戳 之后，代码仍然是合法的', () => {
  const url = toScriptUrl('window.answer = 42;');
  const prefix = 'data:text/javascript;charset=utf-8,';
  assert(url.startsWith(prefix), '是一个 JavaScript 的 data: 地址');

  // 测试页加载脚本时会在地址后面接上 ?t=…，模拟一下，再看代码能不能编译
  const codeAsLoaded = decodeURIComponent(url.slice(prefix.length)) + '?t=1234567890';
  let compileError = null;
  try {
    new Function(codeAsLoaded);
  } catch (e) {
    compileError = e;
  }
  assert(compileError === null, '多出来的 ?t= 要落进注释里，否则每条变异都会变成"语法错误"，实际：' + compileError);
});

// 从拼好的测试页里读出脚本列表（拼的时候用的是双引号）
function mutantScripts(page) {
  const match = page.match(/const SCRIPTS = (\[[^\]]*\]);/);
  return match ? JSON.parse(match[1]) : null;
}

test('变异工具：改脚本时，只换掉被改的那个，其它照旧', () => {
  const page = buildMutantPage(SAMPLE_TEST_HTML, 'http://localhost:4173/tools/', 'logs.js', 'window.mutated = 1;');
  const list = mutantScripts(page);

  assertEqual([list[0], list[2], list[3]], ['../app.js', 'test-runner.js', 'tests.js'], '别的脚本不动');
  assert(list[1].startsWith('data:text/javascript'), 'logs.js 换成了改过的代码，实际：' + list[1].slice(0, 40));
  assert(decodeURIComponent(list[1]).includes('window.mutated = 1;'), '换进去的就是改过的那份');
  assert(page.includes('<base href="http://localhost:4173/tools/">'), '要有 <base>，不然其它脚本的相对路径找不到');
  assert(page.includes('__syntaxErrors'), '要记下加载时的语法错误');
  assertEqual(page.includes('mutantPath'), false, '改脚本时用不着拦截 fetch');
});

test('变异工具：对照组（什么都不改）一个脚本都不换，也不拦截 fetch', () => {
  const page = buildMutantPage(SAMPLE_TEST_HTML, 'http://localhost:4173/tools/', null, null);

  assertEqual(mutantScripts(page), parseTestScripts(SAMPLE_TEST_HTML), '一个都不能换');
  assertEqual(page.includes('mutantPath'), false, '也不装拦截器');
});

test('变异工具：改的内容里有 $ 也不会把测试页拼坏', () => {
  const page = buildMutantPage(SAMPLE_TEST_HTML, 'http://localhost:4173/tools/', 'style.css', "a$&b$'c");

  assert(page.includes(JSON.stringify("a$&b$'c")), '内容要原样放进去，$& 不能被展开');
});

test('变异工具：改的不是脚本（比如 style.css）时，测试 fetch 它拿到的是改过的内容', async () => {
  const mutated = 'body { color: red; }</script><script>window.__escaped = true;</script>';
  // 一个极小的"测试页"：只 fetch 一下被改的文件和一个没被改的文件，把拿到的内容记下来
  const tinyPage =
    '<html><head></head><body><script>const SCRIPTS = [];</script><script>' +
    'Promise.all([fetch("../style.css").then(function (r) { return r.text(); }),' +
    '             fetch("../index.html").then(function (r) { return r.text(); })])' +
    '  .then(function (texts) { window.__got = texts; });' +
    '</script></body></html>';
  // 测试页所在的 tools/ 目录。
  // 用 document.baseURI 而不是 location.href：这条测试在 mutate.html 的隐藏测试页里跑时，
  // location.href 是 about:srcdoc，算不出目录（真踩过：自检因此没通过）；baseURI 会认 <base>
  const baseHref = new URL('.', document.baseURI).href;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-10000px;width:10px;height:10px;';
  document.body.appendChild(iframe);
  onCleanup(() => iframe.remove());
  iframe.srcdoc = buildMutantPage(tinyPage, baseHref, 'style.css', mutated);

  for (let i = 0; i < 50 && !(iframe.contentWindow && iframe.contentWindow.__got); i++) {
    await sleep(50);
  }
  const got = iframe.contentWindow.__got;

  assert(got, '小测试页没跑完');
  assertEqual(got[0], mutated, 'fetch 被改的文件，要拿到改过的内容（一个字都不差）');
  assert(got[1].includes('<meta name="viewport"'), 'fetch 别的文件，照常拿到真实内容');
  assertEqual(iframe.contentWindow.__escaped, undefined, '内容里的 </script> 不能把拦截器那段脚本截断、让后面的内容被当成代码跑');
});

test('变异工具：结局判断', () => {
  const base = { count: 1, syntaxErrors: [], finished: true, summary: '', failed: [], unstable: false };
  const as = (patch) => classifyMutant(Object.assign({}, base, patch));

  assertEqual(as({ count: 0 }), 'stale', '找不到原文 → 过期');
  assertEqual(as({ count: 2 }), 'stale', '好几处 → 也算过期');
  assertEqual(as({ syntaxErrors: ['Unexpected token'], failed: ['一大片'] }), 'broken', '语法错误导致的失败不算测试的功劳');
  assertEqual(as({ summary: '加载失败：../app.js' }), 'broken', '加载失败时一条失败都不列，不能当成"没抓到"');
  assertEqual(as({ finished: false }), 'timeout', '没跑完');
  assertEqual(as({ failed: ['某条测试'] }), 'killed', '有测试失败 → 抓到了');
  assertEqual(as({ unstable: true }), 'killed', '两遍结果不一样也说明测试察觉到了');
  assertEqual(as({}), 'survived', '全绿 → 没抓到');
});

test('变异清单：每条都填全了，文件确实存在，改动确实有改变', async () => {
  if (location.protocol === 'file:') {
    skip('要读项目里的文件，需要用 python3 tools/dev-server.py 打开测试页');
  }

  const listText = await fetch('mutations.js?t=' + Date.now()).then((response) => response.text());
  // 清单文件只是定义了一个 MUTATIONS 数组，拿出来看看
  const mutations = new Function(listText + '\nreturn MUTATIONS;')();

  assert(mutations.length > 0, '清单是空的，这条检查本身可能写错了');
  mutations.forEach((m, index) => {
    const label = `第 ${index + 1} 条「${m.name}」`;
    assert(m.group && m.name && m.file && typeof m.find === 'string' && typeof m.replace === 'string', label + '缺字段');
    assert(m.find !== '', label + '的 find 是空的');
    assert(m.find !== m.replace, label + '的 find 和 replace 一样，等于没改');
  });

  // 文件路径写错的话，mutate.html 会读不到文件
  const files = [...new Set(mutations.map((m) => m.file))];
  const statuses = await Promise.all(files.map((file) => fetch('../' + file + '?t=' + Date.now()).then((r) => r.status)));
  files.forEach((file, index) => assertEqual(statuses[index], 200, `清单里的文件 ${file} 读不到`));

  const names = mutations.map((m) => m.name);
  assertEqual(names.length, new Set(names).size, '名字不能重复，不然结果对不上是哪一条');
});
