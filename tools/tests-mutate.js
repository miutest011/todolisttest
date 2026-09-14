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

test('变异工具：能判断某个文件有没有被测试页加载', () => {
  assertEqual(isLoadedByTestPage(SAMPLE_TEST_HTML, 'logs.js'), true, 'logs.js 加载了');
  assertEqual(isLoadedByTestPage(SAMPLE_TEST_HTML, 'tools/test-runner.js'), true, 'tools 里的也认得');
  assertEqual(isLoadedByTestPage(SAMPLE_TEST_HTML, 'tags.js'), false, '没加载的要认出来，不然改了也白改，还会误报"没抓到"');
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

test('变异工具：拼测试页时只换掉被改的那个脚本，其它照旧', () => {
  const page = buildMutantPage(SAMPLE_TEST_HTML, 'http://localhost:4173/tools/', 'logs.js', 'data:改过的');

  assertEqual(
    parseTestScripts(page.replace(/"/g, "'")),
    ['../app.js', 'data:改过的', 'test-runner.js', 'tests.js'],
    '只有 logs.js 换成了改过的代码'
  );
  assert(page.includes('<base href="http://localhost:4173/tools/">'), '要有 <base>，不然其它脚本的相对路径找不到');
  assert(page.includes('__syntaxErrors'), '要记下加载时的语法错误');
});

test('变异工具：对照组（什么都不改）的脚本列表和原来一模一样', () => {
  const page = buildMutantPage(SAMPLE_TEST_HTML, 'http://localhost:4173/tools/', null, null);

  assertEqual(parseTestScripts(page.replace(/"/g, "'")), parseTestScripts(SAMPLE_TEST_HTML), '一个都不能换');
});

test('变异工具：脚本地址里有 $ 也不会把测试页拼坏', () => {
  const page = buildMutantPage(SAMPLE_TEST_HTML, 'http://localhost:4173/tools/', 'app.js', "data:$&$'");

  assert(page.includes('"data:$&$\'"'), '地址要原样放进去');
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

test('变异清单：每条都填全了，文件确实被测试页加载，改动确实有改变', async () => {
  if (location.protocol === 'file:') {
    skip('要读项目里的文件，需要用 python3 tools/dev-server.py 打开测试页');
  }

  const [listText, testHtml] = await Promise.all([
    fetch('mutations.js?t=' + Date.now()).then((response) => response.text()),
    fetch('test.html?t=' + Date.now()).then((response) => response.text())
  ]);
  // 清单文件只是定义了一个 MUTATIONS 数组，拿出来看看
  const mutations = new Function(listText + '\nreturn MUTATIONS;')();

  assert(mutations.length > 0, '清单是空的，这条检查本身可能写错了');
  mutations.forEach((m, index) => {
    const label = `第 ${index + 1} 条「${m.name}」`;
    assert(m.group && m.name && m.file && typeof m.find === 'string' && typeof m.replace === 'string', label + '缺字段');
    assert(m.find !== '', label + '的 find 是空的');
    assert(m.find !== m.replace, label + '的 find 和 replace 一样，等于没改');
    assert(isLoadedByTestPage(testHtml, m.file), `${label}改的是 ${m.file}，但测试页没加载它`);
  });

  const names = mutations.map((m) => m.name);
  assertEqual(names.length, new Set(names).size, '名字不能重复，不然结果对不上是哪一条');
});
