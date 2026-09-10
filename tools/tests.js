// 所有测试用例。加了新功能之后，在这里补上对应的测试。

// ---- 每条测试都用这个开场 ----
// 它会准备一份干净的假数据环境，并把应用挂到一个临时元素上。
// 用的是内存里的假存储，所以测试不会读也不会改你浏览器里的真实待办数据。
// 测试里把"现在"固定成这一刻，时间相关的判断才有确定答案
const FIXED_NOW = '2026-09-09T10:00:00.000Z';
const FIXED_NOW_MS = new Date(FIXED_NOW).getTime();

// 相对"现在"往后 minutes 分钟的时间
function isoAfter(minutes) {
  return new Date(FIXED_NOW_MS + minutes * 60 * 1000).toISOString();
}

function setup(data = {}) {
  const storage = createMemoryStorage();
  if (data.categories) storage.setItem('categories', JSON.stringify(data.categories));
  if (data.todos) storage.setItem('todos', JSON.stringify(data.todos));
  if (data.collapsed) storage.setItem('collapsed', JSON.stringify(data.collapsed));

  useStorage(storage);
  useConfirm(() => true);           // 默认"用户点了确定"，需要时在测试里改
  useNow(() => new Date(FIXED_NOW)); // 把时间冻住

  // 假的通知：把弹过的内容记下来，不会真的弹到你屏幕上
  const notifications = [];
  useNotifier({
    permission: () => 'granted',
    request: () => undefined,
    show: (title, options) => {
      notifications.push({ title: title, body: options ? options.body : '' });
      return true;
    }
  });

  // 假的附件仓库，代替 IndexedDB
  const blobs = createMemoryBlobStore();
  useBlobStore(blobs);

  const root = document.createElement('div');
  document.body.appendChild(root);
  onCleanup(() => root.remove());   // 这条测试跑完就把临时元素删掉

  initApp(root);
  return { root, storage, notifications, blobs };
}

// 造一个假文件，用来测附件
function fakeFile(name, type, contents = 'x') {
  return new File([contents], name, { type: type });
}

// ---- 模拟用户操作的小工具 ----
function click(element) {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function press(element, key) {
  element.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
}

function typeInto(element, text) {
  element.value = text;
}

function textsOf(root, selector) {
  return [...root.querySelectorAll(selector)].map((el) => el.textContent);
}

function menuItemNamed(root, text) {
  return [...root.querySelectorAll('.menu-item')].find((el) => el.textContent === text);
}

function stored(storage, key) {
  const value = storage.getItem(key);
  return value === null ? null : JSON.parse(value);
}

// 只挑出关心的几个字段来比较。
// 别直接拿整个任务对象去比 —— 以后每加一个新字段（比如后来加的时间字段），
// 那种写法都会误报一次失败
function pick(object, keys) {
  const result = {};
  keys.forEach((key) => { result[key] = object[key]; });
  return result;
}

// 深拷贝一份快照，用来对比"操作前后有没有意外改动"
function snapshot(value) {
  return JSON.parse(JSON.stringify(value));
}


// ========== 添加任务 ==========

test('添加任务：存进数组，也写进存储', () => {
  const { storage } = setup({ categories: ['工作'] });

  addTodo('工作', '写周报');

  assertEqual(todos.length, 1, '应该有一条任务');
  assertEqual(
    pick(todos[0], ['text', 'done', 'category']),
    { text: '写周报', done: false, category: '工作' },
    '内存里的数据不对'
  );
  assertEqual(stored(storage, 'todos'), todos, '存储里的数据应该和内存完全一致');
});

test('添加任务：空白内容不会被添加', () => {
  setup({ categories: ['工作'] });

  const added = addTodo('工作', '   ');

  assertEqual(added, false, '空内容应该返回 false');
  assertEqual(todos.length, 0, '不应该添加任何任务');
});

test('添加任务：自动去掉首尾空格', () => {
  setup({ categories: ['工作'] });

  addTodo('工作', '  写周报  ');

  assertEqual(todos[0].text, '写周报', '首尾空格应该被去掉');
});


// ========== 完成 / 重命名 / 移动 / 删除任务 ==========

test('勾选任务：切换完成状态并保存', () => {
  const { storage } = setup({ categories: ['工作'], todos: [{ text: '写周报', done: false, category: '工作' }] });

  toggleTodo(0);
  assertEqual(todos[0].done, true, '第一次点击应该变成已完成');
  assertEqual(stored(storage, 'todos')[0].done, true, '完成状态应该被保存');

  toggleTodo(0);
  assertEqual(todos[0].done, false, '再点一次应该变回未完成');
});

test('重命名任务：改文字，空内容则不改', () => {
  setup({ categories: ['工作'], todos: [{ text: '开会', done: false, category: '工作' }] });

  renameTodo(0, '开周会');
  assertEqual(todos[0].text, '开周会', '应该改成新名字');

  renameTodo(0, '   ');
  assertEqual(todos[0].text, '开周会', '空内容不应该覆盖原来的名字');
});

test('移动任务：换一个清单，别的字段不变', () => {
  setup({
    categories: ['工作', '生活'],
    todos: [{ text: '买菜', done: true, category: '工作' }]
  });

  const before = snapshot(todos[0]);

  moveTodo(0, '生活');

  assertEqual(todos[0].category, '生活', '应该换到新清单');
  // 把清单名换回原值再整体比较：除了归属，别的字段都不该动
  assertEqual({ ...todos[0], category: before.category }, before, '不该顺手改坏别的字段');
});

test('删除任务：删掉的是指定的那一条', () => {
  setup({
    categories: ['工作'],
    todos: [
      { text: '第一条', done: false, category: '工作' },
      { text: '第二条', done: false, category: '工作' },
      { text: '第三条', done: false, category: '工作' }
    ]
  });

  deleteTodo(1);

  assertEqual(todos.map((t) => t.text), ['第一条', '第三条'], '应该只删掉中间那条');
});


// ========== 新建 / 重命名 / 排序 / 删除清单 ==========

test('新建清单：重名和空名字都不会被创建', () => {
  setup({ categories: ['工作'] });

  assertEqual(addCategory('生活'), true, '新名字应该创建成功');
  assertEqual(addCategory('工作'), false, '重名不应该重复创建');
  assertEqual(addCategory('  '), false, '空名字不应该创建');
  assertEqual(categories, ['工作', '生活'], '最终应该只有两个清单');
});

test('重命名清单：里面任务的归属会一起改', () => {
  const { storage } = setup({
    categories: ['工作', '生活'],
    todos: [
      { text: '写周报', done: false, category: '工作' },
      { text: '买菜', done: false, category: '生活' }
    ]
  });

  renameCategory('工作', '工作安排');

  assertEqual(categories, ['工作安排', '生活'], '清单名应该改了');
  assertEqual(todos[0].category, '工作安排', '原来属于"工作"的任务要跟着改');
  assertEqual(todos[1].category, '生活', '别的清单的任务不应该受影响');
  assertEqual(stored(storage, 'todos')[0].category, '工作安排', '改完要保存');
});

test('重命名清单：折叠状态记录也会一起改', () => {
  setup({ categories: ['工作'], collapsed: ['工作'] });

  renameCategory('工作', '工作安排');

  assertEqual(collapsed, ['工作安排'], '折叠记录里的名字也要跟着改，否则折叠状态会丢');
});

test('重命名清单：重名或空名字都不生效', () => {
  setup({ categories: ['工作', '生活'] });

  assertEqual(renameCategory('工作', '生活'), false, '不能改成已有的清单名');
  assertEqual(renameCategory('工作', '  '), false, '不能改成空名字');
  assertEqual(categories, ['工作', '生活'], '清单列表不应该有变化');
});

test('清单排序：上移下移会和相邻的交换位置', () => {
  setup({ categories: ['工作', '生活', '学习'] });

  moveCategory('生活', -1);
  assertEqual(categories, ['生活', '工作', '学习'], '上移后应该和前一个交换');

  moveCategory('生活', 1);
  assertEqual(categories, ['工作', '生活', '学习'], '下移后应该换回来');
});

test('清单排序：已经在头尾时不会越界', () => {
  setup({ categories: ['工作', '生活'] });

  assertEqual(moveCategory('工作', -1), false, '第一个不能再上移');
  assertEqual(moveCategory('生活', 1), false, '最后一个不能再下移');
  assertEqual(categories, ['工作', '生活'], '顺序不应该变');
});


// ========== 删除清单的确认提示 ==========

test('删除空清单：不会弹确认', () => {
  setup({ categories: ['工作', '空清单'] });
  let asked = false;
  useConfirm(() => { asked = true; return true; });

  deleteCategory('空清单');

  assertEqual(asked, false, '空清单不该打扰用户');
  assertEqual(categories, ['工作'], '清单应该被删掉');
});

test('删除有任务的清单：会弹确认，提示里带任务数量', () => {
  setup({
    categories: ['工作'],
    todos: [
      { text: '写周报', done: false, category: '工作' },
      { text: '开会', done: true, category: '工作' }
    ]
  });
  let message = null;
  useConfirm((text) => { message = text; return false; });

  deleteCategory('工作');

  assert(message !== null, '应该弹出确认提示');
  assert(message.includes('2'), '提示里应该说明有几条任务，实际提示：' + message);
});

test('删除清单：用户点取消，什么都不会被删', () => {
  setup({
    categories: ['工作'],
    todos: [{ text: '写周报', done: false, category: '工作' }]
  });
  useConfirm(() => false);

  const result = deleteCategory('工作');

  assertEqual(result, false, '取消时应该返回 false');
  assertEqual(categories, ['工作'], '清单不应该被删');
  assertEqual(todos.length, 1, '任务不应该被删');
});

test('删除清单：用户点确定，清单和里面的任务一起删掉', () => {
  const { storage } = setup({
    categories: ['工作', '生活'],
    todos: [
      { text: '写周报', done: false, category: '工作' },
      { text: '开会', done: true, category: '工作' },
      { text: '买菜', done: false, category: '生活' }
    ],
    collapsed: ['工作']
  });
  useConfirm(() => true);

  deleteCategory('工作');

  assertEqual(categories, ['生活'], '清单应该被删掉');
  assertEqual(todos.map((t) => t.text), ['买菜'], '里面的任务（含已完成）都要删掉，别的清单不受影响');
  assertEqual(collapsed, [], '折叠记录也要清掉');
  assertEqual(stored(storage, 'todos').length, 1, '删除结果要保存');
});


// ========== 折叠 ==========

test('折叠清单：状态会被保存下来', () => {
  const { storage } = setup({ categories: ['工作'] });

  toggleCollapse('工作');
  assertEqual(collapsed, ['工作'], '应该记录为已折叠');
  assertEqual(stored(storage, 'collapsed'), ['工作'], '折叠状态要保存');

  toggleCollapse('工作');
  assertEqual(collapsed, [], '再点一次应该展开');
});


// ========== 存储与老数据兼容 ==========

test('数据持久化：存进去再读出来，内容一致', () => {
  const { storage } = setup({ categories: ['工作'] });
  addTodo('工作', '写周报');
  toggleTodo(0);
  setDue(0, '2026-09-10T09:00', '60');
  const before = snapshot(todos);

  // 模拟"关掉网页再打开"：用同一份存储重新启动一次
  const root2 = document.createElement('div');
  document.body.appendChild(root2);
  onCleanup(() => root2.remove());
  useStorage(storage);
  initApp(root2);

  // 整个对象逐字段比较，任何一个字段没存下来都会被抓到
  assertEqual(todos, before, '重新打开后数据应该和关闭前一模一样');
});

test('老数据兼容：没有 category 字段的任务会放进第一个清单', () => {
  setup({
    categories: ['工作', '生活'],
    todos: [{ text: '老任务', done: false }]
  });

  assertEqual(todos[0].category, '工作', '老数据应该被放进第一个清单，而不是消失');
});

test('老数据兼容：任务的清单不在列表里时，自动补上这个清单', () => {
  setup({
    categories: ['工作'],
    todos: [{ text: '健身', done: false, category: '其他' }]
  });

  assert(categories.includes('其他'), '否则这条任务在界面上会看不见');
});


// ========== 界面渲染 ==========

test('界面：任务按清单分组显示', () => {
  const { root } = setup({
    categories: ['工作', '生活'],
    todos: [
      { text: '写周报', done: false, category: '工作' },
      { text: '买菜', done: false, category: '生活' }
    ]
  });

  const sections = [...root.querySelectorAll('.category')];
  assertEqual(sections.length, 2, '应该有两个清单区块');
  assertEqual(textsOf(sections[0], '.todo-text'), ['写周报'], '第一个区块里应该只有工作的任务');
  assertEqual(textsOf(sections[1], '.todo-text'), ['买菜'], '第二个区块里应该只有生活的任务');
});

test('界面：折叠后任务不显示，箭头变成 ▸', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '写周报', done: false, category: '工作' }],
    collapsed: ['工作']
  });

  assertEqual(root.querySelectorAll('.todo-item').length, 0, '折叠时不应该画出任务');
  assertEqual(root.querySelector('.arrow').textContent, '▸', '箭头应该是收起状态');
});

test('界面：已完成的任务带 done 样式，标题只数未完成的', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: '写周报', done: true, category: '工作' },
      { text: '开会', done: false, category: '工作' }
    ]
  });

  const items = root.querySelectorAll('.todo-item');
  assert(items[0].classList.contains('done'), '已完成的任务应该有 done 样式类');
  assert(!items[1].classList.contains('done'), '未完成的任务不该有 done 样式类');
  assertEqual(root.querySelector('.category-count').textContent, '1', '标题上的数字应该只数未完成的');
});


// ========== 界面交互 ==========

test('交互：点任务文字进入重命名，回车保存', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '开会', done: false, category: '工作' }]
  });

  click(root.querySelector('.todo-text'));
  const input = root.querySelector('.edit-input');
  assert(input, '点文字之后应该出现输入框');

  typeInto(input, '开周会');
  press(input, 'Enter');

  assertEqual(todos[0].text, '开周会', '回车应该保存新名字');
  assertEqual(root.querySelector('.edit-input'), null, '保存后应该退出编辑状态');
});

test('交互：重命名时按 Esc 取消，不改动内容', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '开会', done: false, category: '工作' }]
  });

  click(root.querySelector('.todo-text'));
  const input = root.querySelector('.edit-input');
  typeInto(input, '不想要的名字');
  press(input, 'Escape');

  assertEqual(todos[0].text, '开会', 'Esc 应该放弃修改');
});

test('交互：点勾选框只切换完成状态，不会进详情页', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '写周报', done: false, category: '工作' }]
  });

  click(root.querySelector('.checkbox'));

  assertEqual(todos[0].done, true, '应该被标记为完成');
  assertEqual(detailIndex, null, '不应该跳到详情页（靠 stopPropagation 拦住）');
});

test('交互：点任务空白处进入详情页，点返回回到列表', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '写周报', done: false, category: '工作' }]
  });

  click(root.querySelector('.todo-item'));

  assertEqual(detailIndex, 0, '应该进入第一条任务的详情页');
  assertEqual(root.querySelector('.detail-title').textContent, '写周报', '详情页标题不对');
  assertEqual(root.querySelectorAll('.category').length, 0, '详情页上不应该还显示清单列表');

  click(root.querySelector('.back-btn'));
  assertEqual(detailIndex, null, '返回后应该回到列表页');
});

test('交互：点清单名字进入改名，不会顺便折叠', () => {
  const { root } = setup({ categories: ['工作'] });

  click(root.querySelector('.category-name'));

  assert(root.querySelector('.edit-input'), '应该出现改名输入框');
  assertEqual(collapsed, [], '点名字不应该触发折叠');
});

test('交互：点标题栏空白处折叠，不会进入改名', () => {
  const { root } = setup({ categories: ['工作'] });

  click(root.querySelector('.category-header'));

  assertEqual(collapsed, ['工作'], '应该折叠起来');
  assertEqual(root.querySelector('.edit-input'), null, '不应该进入改名状态');
});

test('交互：连续添加任务时输入框会保持打开', () => {
  const { root } = setup({ categories: ['工作'] });

  click(root.querySelector('.add-task'));
  const input = root.querySelector('.add-input');
  assert(input, '点了"+ 添加任务"应该出现输入框');

  typeInto(input, '第一条');
  press(input, 'Enter');

  assertEqual(todos.length, 1, '任务应该被添加');
  assert(root.querySelector('.add-input'), '加完一条后输入框应该还在，方便继续输入');

  // 空着回车 = 结束添加
  press(root.querySelector('.add-input'), 'Enter');
  assertEqual(root.querySelector('.add-input'), null, '空着回车应该结束添加');
});


// ========== 三点菜单 ==========

test('菜单：点三个点打开，点页面别处关闭', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '写周报', done: false, category: '工作' }]
  });

  click(root.querySelector('.todo-item .menu-btn'));
  assert(root.querySelector('.menu'), '点三个点应该展开菜单');

  click(document.body);
  assertEqual(root.querySelector('.menu'), null, '点页面别处应该关掉菜单');
});

test('菜单：菜单开着时点任务，只关菜单不进详情页', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '写周报', done: false, category: '工作' }]
  });

  click(root.querySelector('.todo-item .menu-btn'));
  click(root.querySelector('.todo-item'));

  assertEqual(openMenuKey, null, '菜单应该被关掉');
  assertEqual(detailIndex, null, '这一下不应该顺带进详情页');
});

test('菜单：任务菜单的"移动到"只列出别的清单', () => {
  const { root } = setup({
    categories: ['工作', '生活', '学习'],
    todos: [{ text: '写周报', done: false, category: '工作' }]
  });

  click(root.querySelector('.todo-item .menu-btn'));
  const names = textsOf(root, '.menu-item');

  assert(names.includes('生活') && names.includes('学习'), '应该能移动到别的清单');
  assertEqual(names.filter((n) => n === '工作').length, 0, '不应该出现自己所在的清单');
});

test('菜单：点"移动到"里的清单名，任务就换清单了', () => {
  const { root } = setup({
    categories: ['工作', '生活'],
    todos: [{ text: '写周报', done: false, category: '工作' }]
  });

  click(root.querySelector('.todo-item .menu-btn'));
  click(menuItemNamed(root, '生活'));

  assertEqual(todos[0].category, '生活', '任务应该被移到生活清单');
});

// 注意：每次点击都会让页面重画，之前拿到的元素引用就作废了。
// 所以每一步操作之后都要重新从 root 上查一遍，不能把元素存起来跨点击使用。
function categoryHeaderAt(root, position) {
  return root.querySelectorAll('.category-header')[position];
}

test('菜单：第一个清单没有"上移"', () => {
  const { root } = setup({ categories: ['工作', '生活'] });

  click(categoryHeaderAt(root, 0).querySelector('.menu-btn'));
  const menu = textsOf(categoryHeaderAt(root, 0), '.menu-item');

  assert(menu.length > 0, '菜单应该是展开的，实际一项都没读到');
  assert(!menu.includes('上移'), '第一个清单不该有"上移"');
  assert(menu.includes('下移'), '第一个清单应该有"下移"');
});

test('菜单：最后一个清单没有"下移"', () => {
  const { root } = setup({ categories: ['工作', '生活'] });

  click(categoryHeaderAt(root, 1).querySelector('.menu-btn'));
  const menu = textsOf(categoryHeaderAt(root, 1), '.menu-item');

  assert(menu.length > 0, '菜单应该是展开的，实际一项都没读到');
  assert(menu.includes('上移'), '最后一个清单应该有"上移"');
  assert(!menu.includes('下移'), '最后一个清单不该有"下移"');
});

test('菜单：点"下移"之后清单顺序真的变了', () => {
  const { root } = setup({ categories: ['工作', '生活'] });

  click(categoryHeaderAt(root, 0).querySelector('.menu-btn'));
  click(menuItemNamed(root, '下移'));

  assertEqual(categories, ['生活', '工作'], '顺序应该交换');
  assertEqual(textsOf(root, '.category-name'), ['生活', '工作'], '界面上的顺序也要跟着变');
});


// ========== 开始时间 ==========

test('开始时间：创建任务时自动记录当前时间', () => {
  setup({ categories: ['工作'] });

  addTodo('工作', '写周报');

  assertEqual(todos[0].createdAt, FIXED_NOW, '开始时间应该是创建那一刻的系统时间');
  assertEqual(todos[0].dueAt, null, '截止时间初始应该是空的');
  assertEqual(todos[0].remindBefore, null, '初始应该是不提醒');
});

test('开始时间：只在详情页显示，列表页不显示', () => {
  const { root } = setup({ categories: ['工作'] });
  addTodo('工作', '写周报');

  assertEqual(root.querySelectorAll('.detail-row').length, 0, '列表页不该出现时间信息');

  click(root.querySelector('.todo-item'));
  const labels = textsOf(root, '.detail-label');
  assert(labels.includes('开始时间'), '详情页应该有"开始时间"这一行');
});

test('开始时间：详情页显示成 年-月-日 时:分 的样子', () => {
  const { root } = setup({ categories: ['工作'] });
  addTodo('工作', '写周报');
  click(root.querySelector('.todo-item'));

  const value = textsOf(root, '.detail-value')[1];   // 第一行是清单，第二行是开始时间
  assert(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value), '时间格式不对，实际显示：' + value);
});

test('老数据兼容：没有时间字段的老任务不会出错', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '老任务', done: false, category: '工作' }]
  });

  assertEqual(todos[0].createdAt, null, '缺失的开始时间应该补成 null');
  assertEqual(todos[0].reminded, false, '缺失的提醒标记应该补成 false');

  click(root.querySelector('.todo-item'));
  const values = textsOf(root, '.detail-value');
  assert(values.includes('未记录'), '老任务的开始时间应该显示"未记录"，而不是空白或报错');
});


// ========== 截止时间 ==========

test('截止时间：初始显示"未设置"，点时钟图标能打开编辑区', () => {
  const { root } = setup({ categories: ['工作'] });
  addTodo('工作', '写周报');
  click(root.querySelector('.todo-item'));

  assert(textsOf(root, '.detail-value').includes('未设置'), '初始应该显示未设置');
  assertEqual(root.querySelector('.due-editor'), null, '一开始不该显示编辑区');

  click(root.querySelector('.icon-btn'));

  assert(root.querySelector('.due-editor'), '点时钟图标应该展开编辑区');
  assert(root.querySelector('.due-input'), '编辑区里应该有选时间的输入框');
  assert(root.querySelector('.remind-select'), '编辑区里应该有选提醒方式的下拉框');
});

test('截止时间：保存后写进数据，并显示在详情页', () => {
  const { root, storage } = setup({ categories: ['工作'] });
  addTodo('工作', '写周报');

  setDue(0, '2026-09-10T09:00', '60');

  const expected = new Date('2026-09-10T09:00').getTime();
  assertEqual(new Date(todos[0].dueAt).getTime(), expected, '截止时间存的时刻不对');
  assertEqual(todos[0].remindBefore, 60, '提醒设置应该是提前 60 分钟');
  assertEqual(new Date(stored(storage, 'todos')[0].dueAt).getTime(), expected, '截止时间要保存下来');

  click(root.querySelector('.todo-item'));
  const labels = textsOf(root, '.detail-label');
  assert(labels.includes('截止时间') && labels.includes('提醒'), '详情页应该显示截止时间和提醒两行');
  assert(textsOf(root, '.detail-value').includes('提前 1 小时'), '提醒方式应该显示成人话');
});

test('截止时间：没选日期时不保存', () => {
  setup({ categories: ['工作'] });
  addTodo('工作', '写周报');

  const saved = setDue(0, '', '60');

  assertEqual(saved, false, '没选日期应该返回 false');
  assertEqual(todos[0].dueAt, null, '不该写入截止时间');
});

test('截止时间：清除后连提醒设置一起清掉', () => {
  setup({
    categories: ['工作'],
    todos: [{ text: '交报告', done: false, category: '工作', createdAt: FIXED_NOW, dueAt: isoAfter(60), remindBefore: 60, reminded: true }]
  });

  clearDue(0);

  assertEqual(todos[0].dueAt, null, '截止时间应该被清空');
  assertEqual(todos[0].remindBefore, null, '提醒设置也要一起清掉');
  assertEqual(todos[0].reminded, false, '提醒标记要重置');
});

test('截止时间：改了时间后，之前提醒过的标记会重置', () => {
  setup({
    categories: ['工作'],
    todos: [{ text: '交报告', done: false, category: '工作', createdAt: FIXED_NOW, dueAt: isoAfter(60), remindBefore: 60, reminded: true }]
  });

  setDue(0, '2026-09-20T09:00', '60');

  assertEqual(todos[0].reminded, false, '换了新的截止时间，应该重新提醒一次');
});

test('截止时间：详情页里"未设置"时不显示提醒那一行', () => {
  const { root } = setup({ categories: ['工作'] });
  addTodo('工作', '写周报');
  click(root.querySelector('.todo-item'));

  assert(!textsOf(root, '.detail-label').includes('提醒'), '没设截止时间就没有提醒可言');
});


// ========== 到点提醒 ==========

test('提醒：还没到时间不会弹通知', () => {
  const { notifications } = setup({
    categories: ['工作'],
    todos: [{ text: '交报告', done: false, category: '工作', createdAt: FIXED_NOW, dueAt: isoAfter(120), remindBefore: 60, reminded: false }]
  });

  checkReminders();   // 离截止还有 120 分钟，设的是提前 60 分钟

  assertEqual(notifications.length, 0, '还没到提醒时间，不该打扰用户');
});

test('提醒：到点了弹一次通知，内容里带任务名', () => {
  const { notifications } = setup({
    categories: ['工作'],
    todos: [{ text: '交报告', done: false, category: '工作', createdAt: FIXED_NOW, dueAt: isoAfter(60), remindBefore: 60, reminded: false }]
  });

  checkReminders();   // 离截止正好 60 分钟，设的是提前 60 分钟 → 该响了

  assertEqual(notifications.length, 1, '应该弹出一条通知');
  assert(notifications[0].body.includes('交报告'), '通知内容里应该有任务名，实际：' + notifications[0].body);
  assertEqual(todos[0].reminded, true, '弹过之后要标记为已提醒');
});

test('提醒：同一条任务不会重复提醒', () => {
  const { notifications } = setup({
    categories: ['工作'],
    todos: [{ text: '交报告', done: false, category: '工作', createdAt: FIXED_NOW, dueAt: isoAfter(60), remindBefore: 60, reminded: false }]
  });

  checkReminders();
  checkReminders();
  checkReminders();

  assertEqual(notifications.length, 1, '定时器每分钟都会检查，但同一条只能提醒一次');
});

test('提醒：提前 1 天的时间点算得对', () => {
  const { notifications } = setup({
    categories: ['工作'],
    todos: [
      { text: '刚好到点', done: false, category: '工作', createdAt: FIXED_NOW, dueAt: isoAfter(1440), remindBefore: 1440, reminded: false },
      { text: '还差一分钟', done: false, category: '工作', createdAt: FIXED_NOW, dueAt: isoAfter(1441), remindBefore: 1440, reminded: false }
    ]
  });

  checkReminders();

  assertEqual(notifications.length, 1, '只有正好到点的那条该提醒');
  assert(notifications[0].body.includes('刚好到点'), '提醒错了任务：' + notifications[0].body);
});

test('提醒：选了"不提醒"的任务不会响', () => {
  const { notifications } = setup({
    categories: ['工作'],
    todos: [{ text: '交报告', done: false, category: '工作', createdAt: FIXED_NOW, dueAt: isoAfter(-60), remindBefore: null, reminded: false }]
  });

  checkReminders();   // 早就过了截止时间，但用户选的是不提醒

  assertEqual(notifications.length, 0, '用户选了不提醒就不该弹');
});

test('提醒：已完成的任务不会响', () => {
  const { notifications } = setup({
    categories: ['工作'],
    todos: [{ text: '交报告', done: true, category: '工作', createdAt: FIXED_NOW, dueAt: isoAfter(-60), remindBefore: 60, reminded: false }]
  });

  checkReminders();

  assertEqual(notifications.length, 0, '已经做完的任务不用再提醒');
});

test('提醒：没设截止时间的任务不会响', () => {
  const { notifications } = setup({
    categories: ['工作'],
    todos: [{ text: '随便记一笔', done: false, category: '工作', createdAt: FIXED_NOW, dueAt: null, remindBefore: 60, reminded: false }]
  });

  checkReminders();

  assertEqual(notifications.length, 0, '没有截止时间就无从算起');
});

test('提醒：通知被浏览器拦下时，不标记为已提醒', () => {
  setup({
    categories: ['工作'],
    todos: [{ text: '交报告', done: false, category: '工作', createdAt: FIXED_NOW, dueAt: isoAfter(60), remindBefore: 60, reminded: false }]
  });
  // 模拟用户拒绝了通知权限
  useNotifier({ permission: () => 'denied', request: () => undefined, show: () => false });

  checkReminders();

  assertEqual(todos[0].reminded, false, '没真的弹出来就不算提醒过，以后授权了还能收到');
});

test('提醒：选了提醒才申请通知权限，选"不提醒"不打扰用户', () => {
  setup({ categories: ['工作'] });
  addTodo('工作', '写周报');
  addTodo('工作', '买咖啡');

  let requested = 0;
  useNotifier({
    permission: () => 'default',
    request: () => { requested++; return undefined; },
    show: () => false
  });

  setDue(1, '2026-09-10T09:00', '');     // 不提醒
  assertEqual(requested, 0, '不提醒就不该弹权限申请');

  setDue(0, '2026-09-10T09:00', '60');   // 提前 1 小时提醒
  assertEqual(requested, 1, '选了提醒才应该申请通知权限');
});

test('提醒：没授权通知时，详情页会给出提示', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '交报告', done: false, category: '工作', createdAt: FIXED_NOW, dueAt: isoAfter(60), remindBefore: 60, reminded: false }]
  });
  useNotifier({ permission: () => 'denied', request: () => undefined, show: () => false });

  click(root.querySelector('.todo-item'));

  const notice = root.querySelector('.notice');
  assert(notice, '权限被拒绝时应该提示用户，否则会以为提醒功能坏了');
  assert(notice.textContent.includes('通知'), '提示内容应该说清楚是通知的问题');
});


// ========== 备注 ==========

test('备注：初始为空，写完保存下来', () => {
  const { storage } = setup({ categories: ['工作'] });
  addTodo('工作', '写周报');

  assertEqual(todos[0].note, '', '新任务的备注应该是空的');

  saveNote(0, '记得附上上季度数据');

  assertEqual(todos[0].note, '记得附上上季度数据', '备注应该被记下来');
  assertEqual(stored(storage, 'todos')[0].note, '记得附上上季度数据', '备注要保存到存储里');
});

test('备注：详情页里失去焦点时自动保存', () => {
  const { root } = setup({ categories: ['工作'] });
  addTodo('工作', '写周报');
  click(root.querySelector('.todo-item'));

  const textarea = root.querySelector('.note-input');
  assert(textarea, '详情页应该有备注输入框');

  textarea.value = '顺手写的备注';
  textarea.dispatchEvent(new FocusEvent('blur'));

  assertEqual(todos[0].note, '顺手写的备注', '点到别处应该自动保存备注');
});

test('备注：老数据没有备注字段也不会出错', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '老任务', done: false, category: '工作' }]
  });

  assertEqual(todos[0].note, '', '缺失的备注应该补成空字符串');

  click(root.querySelector('.todo-item'));
  assertEqual(root.querySelector('.note-input').value, '', '备注框应该是空的，而不是显示 undefined');
});


// ========== 附件 ==========

test('附件：添加后，文件内容进仓库、信息记在任务上', async () => {
  const { blobs, storage } = setup({ categories: ['工作'] });
  addTodo('工作', '写周报');

  await addAttachments(0, [fakeFile('图表.png', 'image/png', '假装是图片')]);

  assertEqual(todos[0].attachments.length, 1, '任务上应该记录了一个附件');
  assertEqual(todos[0].attachments[0].name, '图表.png', '文件名不对');
  assertEqual(todos[0].attachments[0].type, 'image/png', '文件类型不对');
  assertEqual(blobs.files.size, 1, '文件内容应该存进附件仓库');
  assertEqual(stored(storage, 'todos')[0].attachments.length, 1, '附件信息要保存下来');
});

test('附件：一次可以添加多个', async () => {
  const { blobs } = setup({ categories: ['工作'] });
  addTodo('工作', '写周报');

  await addAttachments(0, [
    fakeFile('图.png', 'image/png'),
    fakeFile('录音.m4a', 'audio/mp4'),
    fakeFile('视频.mp4', 'video/mp4')
  ]);

  assertEqual(todos[0].attachments.length, 3, '三个文件都该加上');
  assertEqual(blobs.files.size, 3, '三个文件的内容都该存进仓库');
});

test('附件：删除时，任务上的记录和仓库里的文件一起清掉', async () => {
  const { blobs } = setup({ categories: ['工作'] });
  addTodo('工作', '写周报');
  await addAttachments(0, [fakeFile('图.png', 'image/png')]);
  const id = todos[0].attachments[0].id;

  await removeAttachment(0, id);

  assertEqual(todos[0].attachments.length, 0, '任务上不该再有这个附件');
  assertEqual(blobs.files.size, 0, '仓库里的文件也要删掉，否则会一直占着空间');
});

test('附件：删除任务时，它的附件文件也一起删掉', async () => {
  const { blobs } = setup({ categories: ['工作'] });
  addTodo('工作', '写周报');
  await addAttachments(0, [fakeFile('图.png', 'image/png'), fakeFile('文档.pdf', 'application/pdf')]);

  await deleteTodo(0);

  assertEqual(blobs.files.size, 0, '任务都删了，它的附件不该继续留在仓库里');
});

test('附件：删除清单时，里面任务的附件也一起删掉', async () => {
  const { blobs } = setup({ categories: ['工作'] });
  addTodo('工作', '写周报');
  await addAttachments(0, [fakeFile('图.png', 'image/png')]);
  useConfirm(() => true);

  deleteCategory('工作');
  await Promise.resolve();   // 等附件删除的异步操作走完

  assertEqual(blobs.files.size, 0, '清单连任务带附件都该清干净');
});

test('附件：存不下时给出提示，不会留下打不开的空附件', async () => {
  const { root } = setup({ categories: ['工作'] });
  addTodo('工作', '写周报');

  // 模拟空间不足：保存文件直接失败
  useBlobStore({
    save: () => Promise.reject(new Error('空间不足')),
    load: () => Promise.resolve(null),
    remove: () => Promise.resolve()
  });

  click(root.querySelector('.todo-item'));
  await addAttachments(0, [fakeFile('大视频.mp4', 'video/mp4')]);

  assertEqual(todos[0].attachments.length, 0, '存失败就不该在任务上记这个附件');
  assert(root.querySelector('.notice'), '应该给用户看到失败提示');
});

test('附件：详情页显示附件数量和文件名', async () => {
  const { root } = setup({ categories: ['工作'] });
  addTodo('工作', '写周报');
  await addAttachments(0, [fakeFile('图表.png', 'image/png')]);

  click(root.querySelector('.todo-item'));

  assert(textsOf(root, '.section-label').some((t) => t.includes('附件（1）')), '附件标题上应该显示数量');
  assert(root.querySelector('.attach-info').textContent.includes('图表.png'), '应该显示文件名');
});

test('附件：老数据没有附件字段也不会出错', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '老任务', done: false, category: '工作' }]
  });

  assertEqual(todos[0].attachments, [], '缺失的附件字段应该补成空数组');

  click(root.querySelector('.todo-item'));
  assert(root.querySelector('.attach-add'), '详情页应该正常显示添加附件按钮');
});


// ========== 置顶 ==========

test('置顶：切换状态并保存', () => {
  const { storage } = setup({ categories: ['工作'] });
  addTodo('工作', '写周报');

  assertEqual(todos[0].pinned, false, '新任务默认不置顶');

  togglePin(0);
  assertEqual(todos[0].pinned, true, '应该变成置顶');
  assertEqual(stored(storage, 'todos')[0].pinned, true, '置顶状态要保存');

  togglePin(0);
  assertEqual(todos[0].pinned, false, '再点一次应该取消置顶');
});

test('置顶：置顶的任务排到清单最前面', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: '第一条', done: false, category: '工作' },
      { text: '第二条', done: false, category: '工作' },
      { text: '第三条', done: false, category: '工作' }
    ]
  });

  togglePin(2);   // 把第三条置顶

  assertEqual(textsOf(root, '.todo-text'), ['第三条', '第一条', '第二条'], '置顶的应该排最前，其余保持原顺序');
});

test('置顶：只在自己所在的清单里排前面，不会跑到别的清单去', () => {
  const { root } = setup({
    categories: ['工作', '生活'],
    todos: [
      { text: '写周报', done: false, category: '工作' },
      { text: '买菜', done: false, category: '生活' },
      { text: '做饭', done: false, category: '生活' }
    ]
  });

  togglePin(2);   // 把"做饭"置顶

  const sections = [...root.querySelectorAll('.category')];
  assertEqual(textsOf(sections[0], '.todo-text'), ['写周报'], '工作清单不该受影响');
  assertEqual(textsOf(sections[1], '.todo-text'), ['做饭', '买菜'], '置顶只在生活清单内生效');
});

test('置顶：点列表里的置顶按钮就能切换', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '写周报', done: false, category: '工作' }]
  });

  click(root.querySelector('.todo-item .pin-btn'));

  assertEqual(todos[0].pinned, true, '点按钮应该置顶');
  assertEqual(detailIndex, null, '点置顶按钮不该跳进详情页');
  assert(root.querySelector('.pin-btn').classList.contains('pinned'), '置顶后按钮应该是高亮状态');
});


// ========== 详情页的操作菜单 ==========

test('详情页：有置顶按钮和三点菜单', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '写周报', done: false, category: '工作' }]
  });

  click(root.querySelector('.todo-item'));

  assert(root.querySelector('.detail-card .pin-btn'), '详情页应该有置顶按钮');
  assert(root.querySelector('.detail-card .menu-btn'), '详情页应该有三点菜单按钮');
});

test('详情页：菜单里能改名、移动、标记完成', () => {
  const { root } = setup({
    categories: ['工作', '生活'],
    todos: [{ text: '写周报', done: false, category: '工作' }]
  });
  click(root.querySelector('.todo-item'));

  click(root.querySelector('.detail-card .menu-btn'));
  const names = textsOf(root, '.menu-item');

  assert(names.includes('重命名'), '菜单里应该有重命名');
  assert(names.includes('标记为完成'), '菜单里应该有标记完成');
  assert(names.includes('生活'), '菜单里应该能移到别的清单');
  assert(names.includes('删除任务'), '菜单里应该有删除');
});

test('详情页：点标题就能改名', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '开会', done: false, category: '工作' }]
  });
  click(root.querySelector('.todo-item'));

  click(root.querySelector('.detail-title'));
  const input = root.querySelector('.edit-input');
  assert(input, '点标题应该出现输入框');

  typeInto(input, '开周会');
  press(input, 'Enter');

  assertEqual(todos[0].text, '开周会', '应该改名成功');
  assertEqual(detailIndex, 0, '改完还应该待在详情页');
});

test('详情页：菜单里删除任务后回到列表页', async () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '写周报', done: false, category: '工作' }]
  });
  click(root.querySelector('.todo-item'));

  click(root.querySelector('.detail-card .menu-btn'));
  click(menuItemNamed(root, '删除任务'));

  assertEqual(todos.length, 0, '任务应该被删掉');
  assertEqual(detailIndex, null, '删完应该回到列表页');
  assert(root.querySelector('.category'), '应该显示清单列表');
});


// ========== 自检：验证测试工具本身可靠 ==========

test('自检：值不相等时 assertEqual 确实会报错', () => {
  let threw = false;
  try {
    assertEqual(1, 2, '故意失败');
  } catch (e) {
    threw = true;
  }
  assert(threw, 'assertEqual 必须在值不同时抛错，否则测试会假装全部通过');
});

test('自检：条件为假时 assert 确实会报错', () => {
  let threw = false;
  try {
    assert(false, '故意失败');
  } catch (e) {
    threw = true;
  }
  assert(threw, 'assert 必须在条件为假时抛错');
});

test('自检：异步测试失败时不会被悄悄吞掉', async () => {
  // 运行器就是这样调用每条测试的：await fn()。
  // 如果哪天有人把 await 去掉了，async 测试里的失败就会被吞掉、全部假装通过
  const failingTest = () => Promise.reject(new Error('故意失败'));

  let caught = false;
  try {
    await failingTest();
  } catch (e) {
    caught = true;
  }

  assert(caught, '异步测试的失败必须能被抓到');
  // 注意：这里只能检查 runTests 的类型，绝对不能真的调用它 —— 它会把所有测试再跑一遍，
  // 包括这一条，然后无限递归
  assertEqual(runTests.constructor.name, 'AsyncFunction',
    'runTests 必须是 async 函数，否则来不及等异步测试跑完就下结论');
});

test('自检：每条测试的数据互相独立', () => {
  setup({ categories: ['工作'] });
  addTodo('工作', '上一条测试留下的任务');
  assertEqual(todos.length, 1, '先确认加进去了');

  setup({ categories: ['工作'] });   // 重新开一个干净环境
  assertEqual(todos.length, 0, '新环境不应该看到上一条测试的数据');
});

test('自检：跑测试不会碰到浏览器里的真实数据', () => {
  // 某些打开方式下浏览器会禁止访问 localStorage（直接读会抛错），
  // 这时候读不到就当作 '读不到'，前后一致即可 —— 真实数据本来也动不了
  function realTodos() {
    try {
      return window.localStorage.getItem('todos');
    } catch (e) {
      return '读不到（浏览器禁止访问）';
    }
  }

  const before = realTodos();

  setup({ categories: ['工作'] });
  addTodo('工作', '这条只应该存在于假存储里');
  deleteCategory('工作');

  assertEqual(realTodos(), before, '测试绝对不能改动你真实的待办数据');
});
