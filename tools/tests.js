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
  // 老版本存的"哪些清单折叠了"，只有测数据迁移时才会传
  if (data.collapsed) storage.setItem('collapsed', JSON.stringify(data.collapsed));
  // 展开着的是哪个清单。不传的话，第一次打开默认展开第一个清单
  if ('expandedCategory' in data) storage.setItem('expandedCategory', JSON.stringify(data.expandedCategory));
  if (data.logItems) storage.setItem('logItems', JSON.stringify(data.logItems));
  if (data.logTags) storage.setItem('logTags', JSON.stringify(data.logTags));
  if (data.listTags) storage.setItem('listTags', JSON.stringify(data.listTags));
  if (data.categoryMeta) storage.setItem('categoryMeta', JSON.stringify(data.categoryMeta));

  useStorage(storage);
  useConfirm(() => true);           // 默认"用户点了确定"，需要时在测试里改
  useNow(() => new Date(FIXED_NOW)); // 把时间冻住
  useLongPressDelay(0);              // 长按判定改成 0，测试不用真等半秒
  // 撤销提示的时长恢复默认。有测试会把它改短，不还原的话会泄漏到后面的测试里
  useToastDuration(4000);
  // 提醒默认没人接手（纯网页的样子）；存文件、选文件也换回网页的做法
  useReminderScheduler(null);
  useFileSaver(null);
  useFilePicker(null);

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

  onCleanup(() => {
    // 万一某条测试在拖到一半时失败了，这里要收拾干净：
    // 补一个 pointerup 让拖拽正常结束（它会摘掉挂在 document 上的监听），
    // 再把可能残留的悬浮副本删掉。
    // 不然残留的监听会在后面的测试里乱开枪，查起来非常难受
    try {
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    } catch (e) {
      /* 收尾失败不该影响测试结果 */
    }
    document.querySelectorAll('.drag-ghost').forEach((ghost) => ghost.remove());
    root.remove();
  });

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

// 连点两下。故意不发 dblclick：iPhone 上那个事件经常不发，
// 代码是自己数两次点击间隔的，测试也要照着真实情况来
// 让某个输入框真的拿到光标。拿不到就跳过这条测试 ——
// iOS Safari 只认用户亲手点的焦点，代码调 .focus() 不生效，
// 于是所有靠 document.activeElement 判断的测试在那边都会红（在真 WebKit 里跑才发现的）
function focusOrSkip(field) {
  field.focus();
  if (document.activeElement !== field) {
    skip('这个浏览器不让代码给输入框设焦点（iOS Safari 就是这样），这条只能在电脑上测');
  }
  return field;
}

function doubleClick(element) {
  click(element);
  click(element);
}

function press(element, key) {
  element.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
}

function typeInto(element, text) {
  element.value = text;
}

// 模拟一次拖拽：在元素上按下 → 移到某个高度 → 松手。
// 拖拽代码把 pointermove / pointerup 挂在 document 上，所以后两步要发给 document。
// 默认模拟鼠标（移动超过阈值就开始拖）；pointerType 传 'touch' 就是模拟手指长按
function drag(element, toY, pointerType = 'mouse') {
  const from = element.getBoundingClientRect();
  const startY = from.top + from.height / 2;

  element.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, clientX: 50, clientY: startY, pointerType: pointerType
  }));
  document.dispatchEvent(new PointerEvent('pointermove', {
    bubbles: true, clientX: 50, clientY: toY, pointerType: pointerType
  }));
  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: pointerType }));
}

// 只按下再松开，不移动
function tapWithoutMoving(element) {
  element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 50 }));
  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function textsOf(root, selector) {
  return [...root.querySelectorAll(selector)].map((el) => el.textContent);
}

function menuItemNamed(root, text) {
  return [...root.querySelectorAll('.menu-item')].find((el) => el.textContent === text);
}

function itemNamed(root, text) {
  return [...root.querySelectorAll('.todo-item')]
    .find((li) => li.querySelector('.todo-text').textContent === text);
}

// 展开"已完成 / 已放弃"折叠分组
function expandGroup(root, label) {
  const header = [...root.querySelectorAll('.sub-group-header')]
    .find((el) => el.textContent.includes(label));
  if (header) click(header);
  return header;
}

function groupHeader(root, label) {
  return [...root.querySelectorAll('.sub-group-header')]
    .find((el) => el.textContent.includes(label));
}

// 按左边的标签取详情页某一行的内容。
// 别用"第几行"去取 —— 加一行新字段就会把测试全打乱

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
    pick(todos[0], ['text', 'status', 'category']),
    { text: '写周报', status: 'active', category: '工作' },
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
  const { storage } = setup({ categories: ['工作'], todos: [{ text: '写周报', status: 'active', category: '工作' }] });

  toggleTodo(0);
  assertEqual(todos[0].status, 'done', '第一次点击应该变成已完成');
  assertEqual(stored(storage, 'todos')[0].status, 'done', '完成状态应该被保存');

  toggleTodo(0);
  assertEqual(todos[0].status, 'active', '再点一次应该变回未完成');
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

test('重命名清单：展开着的清单改名后还是展开的', () => {
  const { storage } = setup({ categories: ['工作', '生活'], expandedCategory: '工作' });

  renameCategory('工作', '工作安排');

  assertEqual(expandedCategory, '工作安排', '展开记录里的名字也要跟着改，否则一改名它就收起来了');
  assertEqual(stored(storage, 'expandedCategory'), '工作安排', '要保存');
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
    expandedCategory: '工作'
  });
  useConfirm(() => true);

  deleteCategory('工作');

  assertEqual(categories, ['生活'], '清单应该被删掉');
  assertEqual(todos.map((t) => t.text), ['买菜'], '里面的任务（含已完成）都要删掉，别的清单不受影响');
  assertEqual(expandedCategory, null, '删的正是展开着的清单，展开记录也要清掉');
  assertEqual(stored(storage, 'todos').length, 1, '删除结果要保存');
});


// ========== 折叠 ==========

test('折叠清单：展开 / 收起会被保存下来', () => {
  const { storage } = setup({ categories: ['工作'], expandedCategory: '工作' });

  toggleCollapse('工作');
  assertEqual(expandedCategory, null, '点展开着的清单，收起来');
  assertEqual(stored(storage, 'expandedCategory'), null, '要保存');

  toggleCollapse('工作');
  assertEqual(expandedCategory, '工作', '再点一次展开');
  assertEqual(stored(storage, 'expandedCategory'), '工作', '要保存');
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

  const sections = () => [...root.querySelectorAll('.category')];
  assertEqual(sections().length, 2, '应该有两个清单区块');
  assertEqual(textsOf(sections()[0], '.todo-text'), ['写周报'], '第一个区块里应该只有工作的任务');

  // 一次只展开一个清单，展开生活再看它的
  toggleCollapse('生活');
  assertEqual(textsOf(sections()[1], '.todo-text'), ['买菜'], '第二个区块里应该只有生活的任务');
});

test('界面：收起的清单不显示任务；标题前没有三角，收起状态悄悄告诉读屏软件', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '写周报', done: false, category: '工作' }],
    expandedCategory: null
  });

  const header = root.querySelector('.category-header');
  assertEqual(root.querySelectorAll('.todo-item').length, 0, '收起时不应该画出任务');
  assertEqual(header.querySelector('.arrow'), null, '标题前不放三角（用户觉得不需要、也不好看）');
  assertEqual(header.getAttribute('aria-expanded'), 'false', '看不到三角了，读屏软件要靠这个知道它收着');

  click(header);
  assertEqual(root.querySelector('.category-header').getAttribute('aria-expanded'), 'true', '展开后跟着变');
});

test('界面：已完成的收进折叠分组，标题只数未完成的', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: '写周报', status: 'done', category: '工作' },
      { text: '开会', status: 'active', category: '工作' }
    ]
  });

  assertEqual(textsOf(root, '.todo-text'), ['开会'], '默认只显示未完成的，已完成的收在分组里');
  assertEqual(root.querySelector('.category-count').textContent, '1', '标题上的数字应该只数未完成的');

  expandGroup(root, '已完成');
  assert(itemNamed(root, '写周报').classList.contains('done'), '已完成的任务应该有 done 样式类');
  assert(!itemNamed(root, '开会').classList.contains('done'), '未完成的任务不该有 done 样式类');
});


// ========== 界面交互 ==========

test('交互：点任务文字也是进详情页，不会误触发改名', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '开会', done: false, category: '工作' }]
  });

  click(root.querySelector('.todo-text'));

  assertEqual(detailIndex, 0, '点文字应该进详情页');
  assertEqual(root.querySelector('.edit-input'), null, '不该进入改名状态 —— 手机上文字占了一行的大半，很容易误触');
});

test('交互：详情页里点标题改名，回车保存', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '开会', done: false, category: '工作' }]
  });
  click(root.querySelector('.todo-item'));

  click(root.querySelector('.detail-title'));
  const input = root.querySelector('.edit-input');
  assert(input, '详情页点标题之后应该出现输入框');

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
  click(root.querySelector('.todo-item'));

  click(root.querySelector('.detail-title'));
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

  assertEqual(todos[0].status, 'done', '应该被标记为完成');
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

test('交互：点清单名字也是折叠，不会误触发改名', () => {
  const { root } = setup({ categories: ['工作'] });

  click(root.querySelector('.category-name'));

  assertEqual(expandedCategory, null, '点名字应该收起（第一次打开时第一个清单是展开的）');
  assertEqual(root.querySelector('.edit-input'), null, '不该进入改名状态');
});

test('交互：点标题栏空白处折叠', () => {
  const { root } = setup({ categories: ['工作'] });

  click(root.querySelector('.category-header'));

  assertEqual(expandedCategory, null, '应该收起来');
});

test('交互：清单改名仍然可以从 ⋯ 菜单进入', () => {
  const { root } = setup({ categories: ['工作'] });

  click(root.querySelector('.category-header .menu-btn'));
  click(menuItemNamed(root, '重命名'));

  const input = root.querySelector('.edit-input');
  assert(input, '菜单里的重命名应该能打开输入框');

  typeInto(input, '工作安排');
  press(input, 'Enter');

  assertEqual(categories, ['工作安排'], '应该改名成功');
});

test('交互：任务改名仍然可以从 ⋯ 菜单进入', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '开会', done: false, category: '工作' }]
  });

  click(root.querySelector('.todo-item .menu-btn'));
  click(menuItemNamed(root, '重命名'));

  const input = root.querySelector('.edit-input');
  assert(input, '菜单里的重命名应该能打开输入框');

  typeInto(input, '开周会');
  press(input, 'Enter');

  assertEqual(todos[0].text, '开周会', '应该改名成功');
});

test('交互：连续添加任务 —— 在新建任务面板里按回车，加完面板还开着，接着输下一条', () => {
  // 以前靠清单底下的"+ 添加任务"连续加；那一行去掉后，这个本事搬到了右下角 + 的面板里
  const { root } = setup({ categories: ['工作', '生活'], expandedCategory: '生活' });

  click(root.querySelector('.fab'));
  const input = root.querySelector('.popup-card .add-input');
  typeInto(input, '第一条');
  press(input, 'Enter');

  assertEqual(todos.map((t) => t.text), ['第一条'], '任务应该被添加');
  const again = root.querySelector('.popup-card .add-input');
  assert(again, '加完一条后面板应该还在，方便继续输入');
  assertEqual(again.value, '', '名字清空了，直接输下一条');
  assert(document.activeElement === again, '光标还在输入框里，键盘不用重新弹');
  assertEqual(textsOf(root, '.popup-card .list-option.selected'), ['生活'], '还放进同一个清单');

  typeInto(again, '第二条');
  press(again, 'Enter');
  assertEqual(todos.map((t) => [t.text, t.category]), [['第一条', '生活'], ['第二条', '生活']], '第二条也加进了生活');

  // 空着回车 = 加完了
  press(root.querySelector('.popup-card .add-input'), 'Enter');
  assertEqual(root.querySelector('.popup-card'), null, '空着回车应该结束添加');
  assertEqual(todos.length, 2, '空着回车不会加一条空任务');
});

test('交互：清单底下不再有"+ 添加任务"（和右下角的 + 重复了）', () => {
  const { root } = setup({ categories: ['工作'], expandedCategory: '工作' });

  assert(root.querySelector('.category[data-category="工作"] ul'), '先确认工作是展开着的');
  assertEqual(root.querySelector('.add-task'), null, '展开的清单底下没有"+ 添加任务"');
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

test('开始时间：照样记着，但列表页和详情页都不显示（用户觉得没必要）', () => {
  const { root } = setup({ categories: ['工作'] });
  addTodo('工作', '写周报');
  assert(todos[0].createdAt, '数据里还记着，以后要用还有');

  click(root.querySelector('.todo-item'));
  assertEqual(root.textContent.includes('开始时间'), false, '详情页上不再有"开始时间"');
  assertEqual(root.textContent.includes(formatDateTime(todos[0].createdAt)), false, '也不显示那个时间');
});

test('老数据兼容：没有时间字段的老任务不会出错', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '老任务', done: false, category: '工作' }]
  });

  assertEqual(todos[0].createdAt, null, '缺失的开始时间应该补成 null');
  assertEqual(todos[0].reminded, false, '缺失的提醒标记应该补成 false');

  click(root.querySelector('.todo-item'));
  assert(root.querySelector('.detail-card'), '老任务的详情页能正常打开');
  assertEqual(root.querySelector('.due-text'), null, '没有截止时间，闹钟旁边不写时间');
});


// ========== 截止时间 ==========

test('截止时间：没设时只有一个闹钟图标，点它能打开编辑区，再点收起', () => {
  const { root } = setup({ categories: ['工作'] });
  addTodo('工作', '写周报');
  click(root.querySelector('.todo-item'));

  const alarm = root.querySelector('.due-btn');
  assert(alarm.querySelector('svg'), '闹钟是画出来的图标');
  assertEqual(alarm.classList.contains('has-due'), false, '没设时间，不是红的');
  assertEqual(alarm.querySelector('.due-text'), null, '只有图标，不写字');
  assertEqual(root.querySelector('.due-editor'), null, '一开始不该显示编辑区');

  click(alarm);

  assert(root.querySelector('.due-editor'), '点闹钟应该展开编辑区');
  assert(root.querySelector('.due-input'), '编辑区里应该有选时间的输入框');
  assert(root.querySelector('.remind-select'), '编辑区里应该有选提醒方式的下拉框');

  click(root.querySelector('.due-btn'));
  assertEqual(root.querySelector('.due-editor'), null, '再点一次闹钟收起');
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
  const alarm = root.querySelector('.due-btn');
  assert(alarm.classList.contains('has-due'), '设了时间，闹钟标红');
  assert(alarm.querySelector('.due-text').textContent.endsWith('09:00'), '闹钟旁边写上几点，实际：' + alarm.querySelector('.due-text').textContent);
  assert(alarm.getAttribute('aria-label').includes('提前 1 小时'), '提醒合进了闹钟里：读屏软件要能听到提醒方式，而且说成人话');
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

test('截止时间：没设截止时间时，闹钟也不提提醒', () => {
  const { root } = setup({ categories: ['工作'] });
  addTodo('工作', '写周报');
  click(root.querySelector('.todo-item'));

  assertEqual(root.querySelector('.due-btn').getAttribute('aria-label'), '设置截止时间和提醒', '没设截止时间就没有提醒可言，只说能去设置');
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
    ],
    expandedCategory: '生活'
  });

  togglePin(2);   // 把"做饭"置顶

  assertEqual(textsOf(root.querySelectorAll('.category')[1], '.todo-text'), ['做饭', '买菜'], '置顶只在生活清单内生效');
  toggleCollapse('工作');
  assertEqual(textsOf(root.querySelectorAll('.category')[0], '.todo-text'), ['写周报'], '工作清单不该受影响');
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


// ========== 完成的任务沉到最下面 ==========

test('完成分组：做完的任务从主列表移进"已完成"分组', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: 'A', status: 'active', category: '工作' },
      { text: 'B', status: 'active', category: '工作' },
      { text: 'C', status: 'active', category: '工作' }
    ]
  });

  toggleTodo(0);   // 把 A 标记为完成

  assertEqual(textsOf(root, '.todo-text'), ['B', 'C'], '主列表里不该再有 A');
  assert(groupHeader(root, '已完成').textContent.includes('1'), '分组标题上应该显示有 1 条');

  expandGroup(root, '已完成');
  assert(itemNamed(root, 'A'), '展开后应该能看到 A');
});

test('完成分组：分组默认是收起的', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: 'A', status: 'active', category: '工作' },
      { text: 'B', status: 'done', category: '工作' }
    ]
  });

  assert(groupHeader(root, '已完成'), '应该有"已完成"分组');
  assertEqual(itemNamed(root, 'B'), undefined, '默认收起，不该直接显示出来');

  expandGroup(root, '已完成');
  assert(itemNamed(root, 'B'), '展开后应该看得到');

  expandGroup(root, '已完成');
  assertEqual(itemNamed(root, 'B'), undefined, '再点一次应该收起来');
});

test('完成分组：一条都没有时不显示这个分组', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: 'A', status: 'active', category: '工作' }]
  });

  assertEqual(groupHeader(root, '已完成'), undefined, '没有已完成的任务就不该显示分组');
  assertEqual(groupHeader(root, '已放弃'), undefined, '没有放弃的任务就不该显示分组');
});

test('完成分组：主列表里置顶的在最上面，其余保持原顺序', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: '普通', status: 'active', category: '工作' },
      { text: '做完的', status: 'done', category: '工作' },
      { text: '置顶的', status: 'active', category: '工作', pinned: true }
    ]
  });

  assertEqual(textsOf(root, '.todo-text'), ['置顶的', '普通'], '置顶的在最上，做完的收进分组');
});

test('完成分组：标记完成时会自动取消置顶', () => {
  const { storage } = setup({
    categories: ['工作'],
    todos: [{ text: '写周报', status: 'active', category: '工作', pinned: true }]
  });

  toggleTodo(0);

  assertEqual(todos[0].pinned, false, '做完了就该取消置顶，否则置顶状态留着也没用');
  assertEqual(stored(storage, 'todos')[0].pinned, false, '取消置顶要保存下来');
});

test('完成分组：已完成的任务不显示置顶按钮', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: '没做完', status: 'active', category: '工作' },
      { text: '做完了', status: 'done', category: '工作' }
    ]
  });
  expandGroup(root, '已完成');

  assert(itemNamed(root, '没做完').querySelector('.pin-btn'), '未完成的应该有置顶按钮');
  assertEqual(itemNamed(root, '做完了').querySelector('.pin-btn'), null, '已完成的置顶按钮没有意义，不该显示');
});

test('完成分组：取消完成后回到主列表', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: 'A', status: 'active', category: '工作' },
      { text: 'B', status: 'done', category: '工作' }
    ]
  });

  toggleTodo(1);   // 把 B 改回未完成

  assertEqual(textsOf(root, '.todo-text'), ['A', 'B'], 'B 应该回到主列表');
  assertEqual(todos[1].status, 'active', '状态应该改回来了');
  assertEqual(groupHeader(root, '已完成'), undefined, '分组空了就不该再显示');
});

test('完成分组：拖拽落点和页面看到的顺序一致', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: '普通', status: 'active', category: '工作' },
      { text: '做完的', status: 'done', category: '工作' },
      { text: '置顶的', status: 'active', category: '工作', pinned: true }
    ]
  });
  assertEqual(textsOf(root, '.todo-text'), ['置顶的', '普通'], '先确认初始顺序');

  // 把"普通"（页面上第 2 个）拖到第 1 个位置
  const items = [...root.querySelectorAll('.todo-item')];
  moveTodoToPosition(Number(items[1].dataset.index), '工作', 0);

  // "普通"没置顶，所以会落在置顶的下面 —— 这是规则决定的，不是 bug
  assertEqual(textsOf(root, '.todo-text'), ['置顶的', '普通'], '置顶的优先级更高，普通任务插不到它上面');
});


// ========== 放弃 ==========

test('放弃：菜单里可以放弃，任务进入"已放弃"分组', () => {
  const { root, storage } = setup({
    categories: ['工作'],
    todos: [
      { text: '学法语', status: 'active', category: '工作' },
      { text: '写周报', status: 'active', category: '工作' }
    ]
  });

  click(itemNamed(root, '学法语').querySelector('.menu-btn'));
  click(menuItemNamed(root, '放弃这条'));

  assertEqual(todos[0].status, 'abandoned', '状态应该是已放弃');
  assertEqual(stored(storage, 'todos')[0].status, 'abandoned', '要保存下来');
  assertEqual(textsOf(root, '.todo-text'), ['写周报'], '主列表里不该再有它');
  assert(groupHeader(root, '已放弃').textContent.includes('1'), '应该出现"已放弃 1"的分组');
});

test('放弃：不是删除，记录还完整留着', () => {
  const { storage } = setup({
    categories: ['工作'],
    todos: [{ text: '学法语', status: 'active', category: '工作', note: '买了本教材' }]
  });

  abandonTodo(0);

  assertEqual(todos.length, 1, '放弃不该把记录删掉 —— 这正是它和删除的区别');
  assertEqual(todos[0].text, '学法语', '内容还在');
  assertEqual(todos[0].note, '买了本教材', '备注也还在');
  assertEqual(stored(storage, 'todos').length, 1, '存储里也还在');
});

test('放弃：勾选框显示成灰色的叉', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '学法语', status: 'abandoned', category: '工作' }]
  });
  expandGroup(root, '已放弃');

  const checkbox = itemNamed(root, '学法语').querySelector('.checkbox');
  assert(checkbox.classList.contains('abandoned'), '应该是"已放弃"的样子（灰色叉），而不是打勾');
  assert(!checkbox.classList.contains('done'), '不该被当成已完成');
});

test('放弃：可以重新拾起，回到未完成', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '学法语', status: 'abandoned', category: '工作' }]
  });
  expandGroup(root, '已放弃');

  click(itemNamed(root, '学法语').querySelector('.menu-btn'));
  click(menuItemNamed(root, '重新拾起'));

  assertEqual(todos[0].status, 'active', '应该回到未完成');
  assertEqual(textsOf(root, '.todo-text'), ['学法语'], '应该回到主列表');
});

test('放弃：点勾选框也能直接恢复成未完成', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '学法语', status: 'abandoned', category: '工作' }]
  });
  expandGroup(root, '已放弃');

  click(itemNamed(root, '学法语').querySelector('.checkbox'));

  assertEqual(todos[0].status, 'active', '点勾选框应该恢复成未完成');
});

test('放弃：已放弃的菜单里没有"标记为完成"', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '学法语', status: 'abandoned', category: '工作' }]
  });
  expandGroup(root, '已放弃');

  click(itemNamed(root, '学法语').querySelector('.menu-btn'));
  const names = textsOf(root, '.menu-item');

  assert(names.includes('重新拾起'), '应该有"重新拾起"');
  assert(!names.includes('标记为完成'), '已经放弃的任务不该还能直接标记为完成');
});

test('放弃：放弃时会取消置顶，标题数字也不再算它', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: '学法语', status: 'active', category: '工作', pinned: true },
      { text: '写周报', status: 'active', category: '工作' }
    ]
  });

  abandonTodo(0);

  assertEqual(todos[0].pinned, false, '放弃了就该取消置顶');
  assertEqual(root.querySelector('.category-count').textContent, '1', '标题数字只该数还要做的');
});

test('放弃：已放弃的任务不会再提醒', () => {
  const { notifications } = setup({
    categories: ['工作'],
    todos: [{
      text: '学法语', status: 'abandoned', category: '工作',
      createdAt: FIXED_NOW, dueAt: isoAfter(-60), remindBefore: 60, reminded: false
    }]
  });

  checkReminders();

  assertEqual(notifications.length, 0, '都放弃了就别再提醒了');
});

test('放弃：已完成和已放弃分成两个独立分组', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: '做完的', status: 'done', category: '工作' },
      { text: '放弃的', status: 'abandoned', category: '工作' }
    ]
  });

  assert(groupHeader(root, '已完成').textContent.includes('1'), '应该有"已完成 1"');
  assert(groupHeader(root, '已放弃').textContent.includes('1'), '应该有"已放弃 1"');

  expandGroup(root, '已完成');
  assert(itemNamed(root, '做完的'), '展开已完成应该看到做完的');
  assertEqual(itemNamed(root, '放弃的'), undefined, '两个分组应该各自独立展开');
});

test('放弃：详情页看得出这条是放弃了还是做完了', () => {
  // 以前靠"状态：已放弃"那一行；这一行去掉后，靠勾选框里的叉和划掉的标题
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '学法语', status: 'abandoned', category: '工作' }]
  });
  expandGroup(root, '已放弃');
  click(itemNamed(root, '学法语'));

  assert(root.querySelector('.detail-card .checkbox.abandoned'), '勾选框显示成放弃的样子（叉），不是勾');
  assert(root.querySelector('.detail-card').classList.contains('abandoned'), '卡片标成放弃，标题会被划掉');
  assertEqual(root.textContent.includes('状态'), false, '不再有"状态"那一行');
});


// ========== 老数据迁移到三状态 ==========

test('迁移：老数据的 done: true 变成 status: done', () => {
  setup({
    categories: ['工作'],
    todos: [
      { text: '做完的', done: true, category: '工作' },
      { text: '没做的', done: false, category: '工作' }
    ]
  });

  assertEqual(todos[0].status, 'done', '老的 done: true 应该变成已完成');
  assertEqual(todos[1].status, 'active', '老的 done: false 应该变成未完成');
  assert(!('done' in todos[0]), '老字段应该清掉，否则两个地方都记状态早晚会对不上');
});


// ========== 详情页的操作菜单 ==========

test('详情页：顶部是一左一右两个悬浮圆按钮', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '写周报', status: 'active', category: '工作' }]
  });

  click(root.querySelector('.todo-item'));

  const header = root.querySelector('.page-header');
  assert(header, '详情页顶部应该有这一行');
  assert(header.querySelector('.back-btn.round-btn'), '左边是圆形的返回按钮');
  assert(header.querySelector('.back-btn svg'), '返回箭头是画出来的 SVG，不是文字符号');
  assert(header.querySelector('.menu-btn.round-btn'), '右边是圆形的 ⋯ 菜单按钮');
  assertEqual(root.querySelector('.detail-card .menu-btn'), null, '菜单已经挪到顶部，卡片里不该还留一个');
});

test('详情页：菜单里能改名、移动、标记完成', () => {
  const { root } = setup({
    categories: ['工作', '生活'],
    todos: [{ text: '写周报', done: false, category: '工作' }]
  });
  click(root.querySelector('.todo-item'));

  click(root.querySelector('.page-header .menu-btn'));
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

  click(root.querySelector('.page-header .menu-btn'));
  click(menuItemNamed(root, '删除任务'));

  assertEqual(todos.length, 0, '任务应该被删掉');
  assertEqual(detailIndex, null, '删完应该回到列表页');
  assert(root.querySelector('.category'), '应该显示清单列表');
});


// ========== 拖拽排序：数据部分 ==========

test('拖拽排序：同一个清单内，把任务挪到指定位置', () => {
  const { root, storage } = setup({
    categories: ['工作'],
    todos: [
      { text: 'A', done: false, category: '工作' },
      { text: 'B', done: false, category: '工作' },
      { text: 'C', done: false, category: '工作' }
    ]
  });

  moveTodoToPosition(0, '工作', 2);   // 把 A 拖到最后

  assertEqual(textsOf(root, '.todo-text'), ['B', 'C', 'A'], '页面顺序不对');
  assertEqual(stored(storage, 'todos').map((t) => t.text), ['B', 'C', 'A'], '新顺序要保存下来');
});

test('拖拽排序：把任务往前拖', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: 'A', done: false, category: '工作' },
      { text: 'B', done: false, category: '工作' },
      { text: 'C', done: false, category: '工作' }
    ]
  });

  moveTodoToPosition(2, '工作', 0);   // 把 C 拖到最前

  assertEqual(textsOf(root, '.todo-text'), ['C', 'A', 'B'], '页面顺序不对');
});

test('拖拽排序：可以把任务拖到别的清单里的指定位置', () => {
  const { root } = setup({
    categories: ['工作', '生活'],
    todos: [
      { text: '写周报', done: false, category: '工作' },
      { text: '买菜', done: false, category: '生活' },
      { text: '做饭', done: false, category: '生活' }
    ],
    expandedCategory: '生活'
  });

  moveTodoToPosition(0, '生活', 1);   // 把"写周报"拖到生活清单的中间

  const sections = [...root.querySelectorAll('.category')];
  assertEqual(todos.filter((t) => t.category === '工作').length, 0, '工作清单应该空了');
  assertEqual(textsOf(sections[1], '.todo-text'), ['买菜', '写周报', '做饭'], '应该插在买菜和做饭之间');
  assertEqual(todos.find((t) => t.text === '写周报').category, '生活', '所属清单要跟着改');
});

test('拖拽排序：可以拖进空清单', () => {
  const { root } = setup({
    categories: ['工作', '生活'],
    todos: [{ text: '写周报', done: false, category: '工作' }],
    expandedCategory: '生活'
  });

  moveTodoToPosition(0, '生活', 0);

  const sections = [...root.querySelectorAll('.category')];
  assertEqual(textsOf(sections[1], '.todo-text'), ['写周报'], '应该出现在生活清单里');
});

test('拖拽排序：位置超出范围时放到最后，不会出错', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: 'A', done: false, category: '工作' },
      { text: 'B', done: false, category: '工作' }
    ]
  });

  moveTodoToPosition(0, '工作', 99);

  assertEqual(textsOf(root, '.todo-text'), ['B', 'A'], '越界的位置应该当成"放到最后"');
});

test('拖拽排序：拖动不会弄丢别的字段', () => {
  setup({
    categories: ['工作'],
    todos: [
      { text: 'A', done: true, category: '工作', createdAt: FIXED_NOW, dueAt: isoAfter(60), remindBefore: 60, reminded: true, note: '备注', attachments: [], pinned: false },
      { text: 'B', done: false, category: '工作' }
    ]
  });
  const before = snapshot(todos[0]);

  moveTodoToPosition(0, '工作', 1);

  const after = todos.find((t) => t.text === 'A');
  assertEqual(after, before, '除了位置，任务本身的内容不该有任何变化');
});

test('拖拽排序：清单可以按新顺序重排', () => {
  const { root, storage } = setup({ categories: ['工作', '生活', '学习'] });

  const ok = applyCategoryOrder(['学习', '工作', '生活']);

  assertEqual(ok, true, '应该重排成功');
  assertEqual(textsOf(root, '.category-name'), ['学习', '工作', '生活'], '页面顺序不对');
  assertEqual(stored(storage, 'categories'), ['学习', '工作', '生活'], '新顺序要保存');
});

test('拖拽排序：清单顺序对不上时拒绝写入，避免弄丢数据', () => {
  setup({ categories: ['工作', '生活'] });

  assertEqual(applyCategoryOrder(['工作']), false, '少了一个清单，应该拒绝');
  assertEqual(applyCategoryOrder(['工作', '工作']), false, '重复的名字，应该拒绝');
  assertEqual(applyCategoryOrder(['工作', '不存在的']), false, '出现了不存在的清单，应该拒绝');
  assertEqual(categories, ['工作', '生活'], '被拒绝时原来的清单不该受影响');
});


// ========== 拖拽排序：界面部分 ==========

test('拖拽：整行任意位置都能拖，松手后顺序真的变了', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: 'A', done: false, category: '工作' },
      { text: 'B', done: false, category: '工作' },
      { text: 'C', done: false, category: '工作' }
    ]
  });

  const items = [...root.querySelectorAll('.todo-item')];
  // 直接按在整行上（不再需要瞄准某个小手柄），拖到 C 的下面
  drag(items[0], items[2].getBoundingClientRect().bottom);

  assertEqual(todos.map((t) => t.text), ['B', 'C', 'A'], '数据里的顺序应该跟着变');
});

test('拖拽：拖动时会浮起一份跟手的副本，松手后收掉', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: 'A', done: false, category: '工作' },
      { text: 'B', done: false, category: '工作' }
    ]
  });

  const item = root.querySelector('.todo-item');
  const startY = item.getBoundingClientRect().top;

  item.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 50, clientY: startY }));
  document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 50, clientY: startY + 60 }));

  const ghost = document.querySelector('.drag-ghost');
  assert(ghost, '拖动时应该有一份浮起来的副本');
  assert(ghost.style.transform.includes('translateY'), '副本应该跟着指针走，实际：' + ghost.style.transform);
  assert(item.classList.contains('drag-source'), '原来那块应该变成占位状态');

  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

  assertEqual(document.querySelector('.drag-ghost'), null, '松手后浮起的副本要收掉');
  assert(!item.classList.contains('drag-source'), '占位状态也要清掉');
});

test('拖拽：手机上按住不动才开始拖，直接滑动是滚页面', async () => {
  useLongPressDelay(60);   // 这条测试要真的等一下，才能区分"按住"和"划过"
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: 'A', done: false, category: '工作' },
      { text: 'B', done: false, category: '工作' }
    ]
  });
  useLongPressDelay(60);   // setup 会重置成 0，这里再设一次

  const items = [...root.querySelectorAll('.todo-item')];
  const startY = items[0].getBoundingClientRect().top;

  // 手指按下后立刻滑走 —— 这是想滚动页面，不该触发拖拽
  items[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 50, clientY: startY, pointerType: 'touch' }));
  document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 50, clientY: startY + 100, pointerType: 'touch' }));
  await sleep(120);
  document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 50, clientY: startY + 200, pointerType: 'touch' }));

  assertEqual(document.querySelector('.drag-ghost'), null, '滑动应该是滚页面，不该变成拖拽');

  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
  assertEqual(todos.map((t) => t.text), ['A', 'B'], '顺序不该变');
});

test('拖拽：手机上按住不动超过时间，就能开始拖', async () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: 'A', done: false, category: '工作' },
      { text: 'B', done: false, category: '工作' }
    ]
  });
  useLongPressDelay(30);

  const items = [...root.querySelectorAll('.todo-item')];
  const startY = items[0].getBoundingClientRect().top;

  items[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 50, clientY: startY, pointerType: 'touch' }));
  await sleep(60);   // 按住不动，等长按生效
  document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 50, clientY: items[1].getBoundingClientRect().bottom, pointerType: 'touch' }));

  assert(document.querySelector('.drag-ghost'), '按住够久之后应该浮起来了');

  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
  assertEqual(todos.map((t) => t.text), ['B', 'A'], '松手后顺序应该变了');
});

test('拖拽：只是点一下没拖动的话，不会改数据', () => {
  const { root, storage } = setup({
    categories: ['工作'],
    todos: [
      { text: 'A', done: false, category: '工作' },
      { text: 'B', done: false, category: '工作' }
    ]
  });
  const before = stored(storage, 'todos');

  tapWithoutMoving(root.querySelector('.todo-item'));

  assertEqual(stored(storage, 'todos'), before, '没拖动就不该改数据');
});

test('拖拽：拖完之后紧跟的那次点击不会误进详情页', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: 'A', done: false, category: '工作' },
      { text: 'B', done: false, category: '工作' }
    ]
  });

  const items = [...root.querySelectorAll('.todo-item')];
  drag(items[0], items[1].getBoundingClientRect().bottom);
  // 真实浏览器里，松手后还会补一个 click 事件
  items[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

  assertEqual(detailIndex, null, '刚拖完不该顺带进详情页');
});

test('拖拽：拖动清单不会顺带把它折叠起来', () => {
  const { root } = setup({ categories: ['工作', '生活'] });

  const headers = [...root.querySelectorAll('.category-header')];
  drag(headers[0], headers[1].getBoundingClientRect().bottom);
  headers[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

  assertEqual(expandedCategory, '工作', '拖动不该触发展开 / 收起（第一个清单一开始是展开的）');
  assertEqual(categories, ['生活', '工作'], '顺序应该换过来了');
});

test('拖拽：按在勾选框上不会启动拖动', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: 'A', done: false, category: '工作' },
      { text: 'B', done: false, category: '工作' }
    ]
  });

  const checkbox = root.querySelector('.checkbox');
  checkbox.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 100 }));
  document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 50, clientY: 400 }));

  assertEqual(document.querySelector('.drag-ghost'), null, '勾选框上的按压应该留给勾选，不该变成拖拽');

  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
});


// ========== 底部标签栏 ==========

function tabButton(root, label) {
  return [...root.querySelectorAll('.tab')].find((el) => el.textContent.includes(label));
}

test('标签栏：每次启动都回到"清单"页', () => {
  const { root } = setup({ categories: ['工作'] });

  currentTab = 'calendar';
  initApp(root);      // 模拟重新打开应用

  assertEqual(currentTab, 'tasks', '启动时应该回到清单页，而不是停在上次的标签');
});

test('标签栏：默认停在"清单"页', () => {
  const { root } = setup({ categories: ['工作'] });

  assertEqual(currentTab, 'tasks', '默认应该是清单页');
  assert(tabButton(root, '清单').classList.contains('active'), '"清单"应该是高亮状态');
  assert(!tabButton(root, '日历').classList.contains('active'), '"今天"不该是高亮状态');
  assert(root.querySelector('#category-list'), '清单页应该显示清单列表');
});

test('标签栏：点"今天"能切过去，再点"清单"能切回来', () => {
  const { root } = setup({ categories: ['工作'] });

  click(tabButton(root, '日历'));
  assertEqual(currentTab, 'calendar', '应该切到今天页');
  assert(root.querySelector('.calendar-view'), '应该显示今天页');
  assertEqual(root.querySelector('#category-list'), null, '不该还显示清单列表');
  assert(tabButton(root, '日历').classList.contains('active'), '"今天"应该高亮了');

  click(tabButton(root, '清单'));
  assertEqual(currentTab, 'tasks', '应该切回清单页');
  assert(root.querySelector('#category-list'), '清单列表应该回来了');
});

test('标签栏：详情页上不显示标签栏', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '写周报', status: 'active', category: '工作' }]
  });

  click(root.querySelector('.todo-item'));

  assertEqual(root.querySelector('.tab-bar'), null, '详情页是盖在上面的一层，靠"返回"退出');

  click(root.querySelector('.back-btn'));
  assert(root.querySelector('.tab-bar'), '退回来之后标签栏应该还在');
});


// ========== "今天"页 ==========

test('日历：默认选中今天，列出今天到期的任务', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: '今天要交', status: 'active', category: '工作', dueAt: isoAfter(60) },
      { text: '没设时间', status: 'active', category: '工作' }
    ]
  });

  click(tabButton(root, '日历'));

  assertEqual(textsOf(root, '.todo-text'), ['今天要交'], '只该显示今天到期的');
});

test('日历：看今天时，过期的任务单独一组排在前面', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: '今天要交', status: 'active', category: '工作', dueAt: isoAfter(60) },
      { text: '早该交了', status: 'active', category: '工作', dueAt: isoAfter(-60 * 48) }
    ]
  });

  click(tabButton(root, '日历'));

  const sections = textsOf(root, '.today-section-title');
  assert(sections[0].includes('已过期'), '过期的应该排在最前面，实际：' + sections);
  assertEqual(textsOf(root, '.todo-text'), ['早该交了', '今天要交'], '顺序不对');
});

test('日历：汇总所有清单的任务，并标出属于哪个清单', () => {
  const { root } = setup({
    categories: ['工作', '生活'],
    todos: [
      { text: '交报告', status: 'active', category: '工作', dueAt: isoAfter(60) },
      { text: '买菜', status: 'active', category: '生活', dueAt: isoAfter(120) }
    ]
  });

  click(tabButton(root, '日历'));

  assertEqual(textsOf(root, '.todo-text'), ['交报告', '买菜'], '两个清单的任务都该出现');
  const metas = textsOf(root, '.todo-meta');
  assert(metas[0].includes('工作') && metas[1].includes('生活'), '应该标出所属清单，实际：' + metas);
});

test('日历：已完成和已放弃的不再出现', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: '做完了', status: 'done', category: '工作', dueAt: isoAfter(60) },
      { text: '放弃了', status: 'abandoned', category: '工作', dueAt: isoAfter(60) },
      { text: '还没做', status: 'active', category: '工作', dueAt: isoAfter(60) }
    ]
  });

  click(tabButton(root, '日历'));

  assertEqual(textsOf(root, '.todo-text'), ['还没做'], '今天页只该显示还要做的');
});

test('日历：明天到期的不算在今天名下', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '明天的事', status: 'active', category: '工作', dueAt: isoAfter(60 * 30) }]
  });

  click(tabButton(root, '日历'));

  assertEqual(textsOf(root, '.todo-text'), [], '30 小时之后到期的不该出现在今天');
  assert(root.querySelector('.day-empty'), '这天没有任务时要说一声，别只剩一个光日历');
});

test('日历：一条带截止时间的任务都没有时，提示怎么让任务出现在这里', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '没设时间', status: 'active', category: '工作' }]
  });

  click(tabButton(root, '日历'));

  const empty = root.querySelector('.day-empty');
  assert(empty, '应该有提示');
  assert(empty.textContent.includes('截止时间'), '光说"没有任务"没用，要告诉用户怎么办');
});

test('日历：点任务能进详情页', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '交报告', status: 'active', category: '工作', dueAt: isoAfter(60) }]
  });
  click(tabButton(root, '日历'));

  click(root.querySelector('.todo-item'));

  assertEqual(detailIndex, 0, '应该能从今天页进详情');
  assertEqual(root.querySelector('.detail-title').textContent, '交报告', '进的应该是这条任务的详情');
});

test('日历：勾选完成后，任务从这一页消失', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '交报告', status: 'active', category: '工作', dueAt: isoAfter(60) }]
  });
  click(tabButton(root, '日历'));

  click(root.querySelector('.checkbox'));

  assertEqual(todos[0].status, 'done', '应该标记为完成');
  assertEqual(textsOf(root, '.todo-text'), [], '做完了就不该再占着今天这一页');
});

test('日历：这一页的任务不能拖动排序', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: 'A', status: 'active', category: '工作', dueAt: isoAfter(60) },
      { text: 'B', status: 'active', category: '工作', dueAt: isoAfter(120) }
    ]
  });
  click(tabButton(root, '日历'));

  const items = [...root.querySelectorAll('.todo-item')];
  const startY = items[0].getBoundingClientRect().top;

  // 注意：要在拖动"进行中"检查有没有浮起副本。
  // 等松手之后再查是查不出问题的 —— 那时候副本本来就已经被移除了，
  // 那样写的测试永远不会失败，等于没写
  items[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 50, clientY: startY }));
  document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 50, clientY: startY + 80 }));

  assertEqual(document.querySelector('.drag-ghost'), null, '这一页混着不同清单，没有"顺序"可言，不该能拖');

  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  assertEqual(todos.map((t) => t.text), ['A', 'B'], '数据顺序不该变');
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

test('自检：assertEqual 拒绝比较两个页面元素（它们转成 JSON 都一样）', () => {
  const a = document.createElement('input');
  const b = document.createElement('div');

  let error = null;
  try {
    assertEqual(a, b, '两个不同的元素');
  } catch (e) {
    error = e;
  }
  assert(error && error.message.includes('assert(a === b'), '必须报错并告诉写测试的人该怎么改，实际：' + (error && error.message));

  // 和 null 比是正常用法（"这个元素应该已经不在了"），不能误伤
  let threwOnNull = false;
  try {
    assertEqual(null, null, '元素已经不在');
  } catch (e) {
    threwOnNull = true;
  }
  assert(!threwOnNull, '和 null 比较不该被拦');
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

test('自检：skip() 发出的是"跳过"信号，不是普通的失败', () => {
  let signal = null;
  try {
    skip('演示用');
  } catch (e) {
    signal = e;
  }

  assert(signal !== null, 'skip() 必须中断这条测试');
  assertEqual(signal.skipped, true, '要带上 skipped 标记，运行器才能把"跳过"和真正的失败区分开');
  assertEqual(outcomeOf({ skipped: true, error: null }), 'skip', '运行器要把它算成"跳过"');
  assertEqual(outcomeOf({ skipped: false, error: new Error('x') }), 'fail', '普通错误还是算失败');
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


// ========== 详情页：清单标签 + 闹钟 ==========

test('日历页：任务不带置顶按钮（说不清是在这一页置顶还是在原清单置顶）；清单页里照样有', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '交报告', status: 'active', category: '工作', dueAt: isoAfter(60) }],
    expandedCategory: '工作'
  });

  assert(itemNamed(root, '交报告').querySelector('.pin-btn'), '清单页里有置顶按钮');

  click(tabButton(root, '日历'));
  assert(itemNamed(root, '交报告'), '今天页里有这条任务');
  assertEqual(itemNamed(root, '交报告').querySelector('.pin-btn'), null, '今天页里没有置顶按钮');
  assert(itemNamed(root, '交报告').querySelector('.menu-btn'), '⋯ 菜单还在');
});

test('详情页：卡片里没有置顶按钮，也不再有"状态""开始时间"这些行', () => {
  const { root } = setup({
    categories: ['工作'],
    todos: [{ text: '写周报', status: 'active', category: '工作', createdAt: FIXED_NOW }],
    expandedCategory: '工作'
  });
  click(root.querySelector('.todo-item'));

  assertEqual(root.querySelector('.detail-card .pin-btn'), null, '置顶在清单里点就行，详情页不放');
  assertEqual(root.querySelector('.pin-btn'), null, '整个详情页都没有');
  ['状态', '开始时间', '截止时间', '提醒'].forEach((word) => {
    assertEqual(root.textContent.includes(word), false, `不再有"${word}"这一行`);
  });
});

test('详情页：标题下面一行是清单标签和闹钟', () => {
  const { root } = setup({
    categories: ['工作', 'Vibe Coding'],
    todos: [{ text: '写周报', status: 'active', category: 'Vibe Coding' }],
    expandedCategory: 'Vibe Coding'
  });
  click(root.querySelector('.todo-item'));

  const meta = root.querySelector('.detail-meta');
  assert(meta, '有这一行');
  assert(meta.previousElementSibling === root.querySelector('.detail-card'), '紧跟在标题卡片下面');
  assertEqual([...meta.children].map((el) => el.className.split(' ')[0]), ['list-chip', 'due-btn'], '先是清单标签，旁边是闹钟');
  assertEqual(meta.querySelector('.list-chip').textContent, 'Vibe Coding', '标签上写的是所在的清单');
});

test('详情页：清单标签是虚线框；闹钟没设时间是灰的，设了时间变红', async () => {
  await useAppStyles();
  const { root } = setup({
    categories: ['工作'],
    todos: [
      { text: '没时间的', status: 'active', category: '工作' },
      { text: '有时间的', status: 'active', category: '工作', dueAt: isoAfter(60) }
    ],
    expandedCategory: '工作'
  });
  const danger = 'rgb(224, 82, 82)';   // style.css 的 --danger

  click(itemNamed(root, '没时间的'));
  assertEqual(getComputedStyle(root.querySelector('.list-chip')).borderTopStyle, 'dashed', '清单标签用虚线框');
  assert(getComputedStyle(root.querySelector('.due-icon')).color !== danger, '没设时间的闹钟不是红的');
  click(root.querySelector('.back-btn'));

  click(itemNamed(root, '有时间的'));
  assertEqual(getComputedStyle(root.querySelector('.due-icon')).color, danger, '设了时间的闹钟是红的');
});

test('详情页：闹钟旁边的时间说得短：今天 / 明天 / 昨天 / 几月几日 / 跨年带上年份', () => {
  setup();
  // 按本地的"今天零点"往后推，不管测试机在哪个时区都对得上
  const at = (days, hours, minutes) => new Date(startOfToday() + days * 86400000 + (hours * 60 + minutes) * 60000).toISOString();
  const today = new Date(startOfToday());

  assertEqual(formatDueShort(at(0, 22, 50)), '今天 22:50', '今天');
  assertEqual(formatDueShort(at(0, 0, 5)), '今天 00:05', '今天凌晨也是今天（别按 UTC 日期算错天）');
  assertEqual(formatDueShort(at(1, 9, 0)), '明天 09:00', '明天');
  assertEqual(formatDueShort(at(-1, 23, 30)), '昨天 23:30', '昨天（已经过期的）');

  const later = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5, 8, 0);
  const expectedLater = later.getFullYear() === today.getFullYear()
    ? `${later.getMonth() + 1}月${later.getDate()}日 08:00`
    : `${later.getFullYear()}年${later.getMonth() + 1}月${later.getDate()}日 08:00`;
  assertEqual(formatDueShort(later.toISOString()), expectedLater, '再往后就写几月几日');

  const nextYear = new Date(today.getFullYear() + 1, 0, 3, 9, 0);
  assertEqual(formatDueShort(nextYear.toISOString()), `${today.getFullYear() + 1}年1月3日 09:00`, '不是今年的带上年份');
});

test('详情页：在闹钟里设好时间保存后，闹钟变红、写上时间，编辑区收起', () => {
  const { root } = setup({ categories: ['工作'], expandedCategory: '工作' });
  addTodo('工作', '写周报');
  click(root.querySelector('.todo-item'));

  click(root.querySelector('.due-btn'));
  const tomorrow = new Date(startOfToday() + 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  root.querySelector('.due-input').value = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T18:30`;
  root.querySelector('.remind-select').value = '60';
  click([...root.querySelectorAll('.due-editor button')].find((b) => b.textContent === '保存'));

  assertEqual(root.querySelector('.due-editor'), null, '保存后收起');
  const alarm = root.querySelector('.due-btn');
  assert(alarm.classList.contains('has-due'), '闹钟变红');
  assertEqual(alarm.querySelector('.due-text').textContent, '明天 18:30', '写上时间');
});
