// 所有测试用例。加了新功能之后，在这里补上对应的测试。

// ---- 每条测试都用这个开场 ----
// 它会准备一份干净的假数据环境，并把应用挂到一个临时元素上。
// 用的是内存里的假存储，所以测试不会读也不会改你浏览器里的真实待办数据。
function setup(data = {}) {
  const storage = createMemoryStorage();
  if (data.categories) storage.setItem('categories', JSON.stringify(data.categories));
  if (data.todos) storage.setItem('todos', JSON.stringify(data.todos));
  if (data.collapsed) storage.setItem('collapsed', JSON.stringify(data.collapsed));

  useStorage(storage);
  useConfirm(() => true);           // 默认"用户点了确定"，需要时在测试里改

  const root = document.createElement('div');
  document.body.appendChild(root);
  onCleanup(() => root.remove());   // 这条测试跑完就把临时元素删掉

  initApp(root);
  return { root, storage };
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


// ========== 添加任务 ==========

test('添加任务：存进数组，也写进存储', () => {
  const { storage } = setup({ categories: ['工作'] });

  addTodo('工作', '写周报');

  assertEqual(todos, [{ text: '写周报', done: false, category: '工作' }], '内存里的数据不对');
  assertEqual(stored(storage, 'todos'), todos, '存储里的数据应该和内存一致');
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

  moveTodo(0, '生活');

  assertEqual(todos[0], { text: '买菜', done: true, category: '生活' }, '只应该改变所属清单');
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

  // 模拟"关掉网页再打开"：用同一份存储重新启动一次
  const root2 = document.createElement('div');
  document.body.appendChild(root2);
  onCleanup(() => root2.remove());
  useStorage(storage);
  initApp(root2);

  assertEqual(todos, [{ text: '写周报', done: true, category: '工作' }], '重新打开后数据应该还在');
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
