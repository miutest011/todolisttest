// 手机上用起来顺不顺手：右下角的新建按钮、新建面板、防止页面被放大、
// 一次只展开一个清单、打字时收起底部。
// 复用前面几个文件里的工具（setup、click、logItem、listTag、tagChip……），所以排在它们后面加载。

// 有几条检查要看"真实的样式"（按钮是不是浮着的、输入框字号多大），
// 但测试页平时不加载 style.css。这里临时把它加进来，这条测试跑完就拿掉。
//
// 同时要把测试页自己的样式先关掉：test.html 里写了 button { margin-bottom: 20px }，
// 会把 App 里的 + 按钮也往上顶 20px —— 手机上根本没有这条规则，量出来的位置却不一样，
// 测的就不是真实的样子了（真踩过：量出来"撤销提示压在按钮上"，其实是测试页的样式在捣乱）
async function useAppStyles() {
  if (location.protocol === 'file:') {
    skip('要读 style.css，需要用 python3 tools/dev-server.py 打开测试页');
  }
  const css = await fetch('../style.css?t=' + Date.now()).then((response) => response.text());

  const pageStyles = [...document.querySelectorAll('style, link[rel="stylesheet"]')];
  pageStyles.forEach((sheet) => { sheet.disabled = true; });

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  onCleanup(() => {
    style.remove();
    pageStyles.forEach((sheet) => { sheet.disabled = false; });
  });
}

function rectsOverlap(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}


// ========== 右下角的新建按钮 ==========

test('新建按钮：清单页和打卡页都有，底部原来的"+ 新建"不见了', () => {
  const { root } = setup({ categories: ['工作'] });

  const fab = root.querySelector('.fab');
  assert(fab, '清单页有 + 按钮');
  assertEqual(fab.getAttribute('aria-label'), '新建任务', '按钮上只有个 + 号，要告诉读屏软件它是干嘛的');
  assertEqual(root.querySelector('#new-category-btn'), null, '列表底部的旧按钮去掉了');

  openLogsTab(root);
  assertEqual(root.querySelector('.fab').getAttribute('aria-label'), '新增打卡', '打卡页也有，说的是新增打卡');
  assertEqual(root.querySelector('.new-log-btn'), null, '打卡列表底部的旧按钮也去掉了');
});

test('新建按钮："今天"页和详情页上没有', () => {
  const { root } = setup({ categories: ['工作'], logItems: [logItem('喝水')] });
  addTodo('工作', '写周报');

  click(tabButton(root, '今天'));
  assertEqual(root.querySelector('.fab'), null, '今天页新建任务要选清单、设日期，是另一个功能');

  openTasksTab(root);
  click(root.querySelector('.todo-item'));
  assertEqual(root.querySelector('.fab'), null, '任务详情页没有');

  click(root.querySelector('.back-btn'));
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');
  assertEqual(root.querySelector('.fab'), null, '打卡详情页没有');
});

test('新建按钮：菜单开着时点它，只关菜单、不开面板', () => {
  const { root } = setup({ categories: ['工作'] });

  click(root.querySelector('.category-header .menu-btn'));
  assert(root.querySelector('.menu'), '先确认菜单开了');

  click(root.querySelector('.fab'));

  assertEqual(root.querySelector('.menu'), null, '菜单关了');
  assertEqual(root.querySelector('.popup-card'), null, '这一下只是用来关菜单的，别顺手开面板');
});

test('新建按钮：浮在右下角，在底部标签栏上方，不跟着列表滚走', async () => {
  await useAppStyles();
  const { root } = setup({ categories: ['工作'] });

  const fab = root.querySelector('.fab');
  const fabRect = fab.getBoundingClientRect();
  const barRect = root.querySelector('.tab-bar').getBoundingClientRect();

  assertEqual(getComputedStyle(fab).position, 'fixed', '固定在屏幕上，清单再多也不用滑到底去点');
  assert(fabRect.bottom <= barRect.top, `要在标签栏上方，不能被挡住（按钮底 ${fabRect.bottom}，标签栏顶 ${barRect.top}）`);
  assert(fabRect.right <= window.innerWidth && fabRect.left > window.innerWidth / 2, '在屏幕右半边，而且没出界');
});

test('新建按钮：列表底部留出了空，最后一项不会被它挡住', async () => {
  await useAppStyles();
  const { root } = setup({ categories: ['工作'], logItems: [logItem('喝水')] });

  const check = (label) => {
    const view = root.querySelector('.fab').parentNode;
    const padding = parseFloat(getComputedStyle(view).paddingBottom);
    const fabHeight = root.querySelector('.fab').getBoundingClientRect().height;
    assert(padding >= fabHeight, `${label}底部要留出至少一个按钮高的空（留了 ${padding}px，按钮 ${fabHeight}px）`);
  };

  check('清单页');
  openLogsTab(root);
  check('打卡页');
});

test('新建按钮：打卡后的"撤销"提示在按钮上方，不会压在按钮上', async () => {
  await useAppStyles();
  // 名字长一点，提示就宽，最容易压到按钮
  const { root } = setup({ logItems: [logItem('每天早上起床后喝一大杯温水')] });
  openLogsTab(root);

  click(root.querySelector('.log-count'));

  const toastRect = root.querySelector('.undo-toast').getBoundingClientRect();
  const fabRect = root.querySelector('.fab').getBoundingClientRect();
  // 只看左右会侥幸通过：测试页窗口很宽时两者本来就隔得远。所以直接要求提示整个在按钮上面
  assert(toastRect.bottom <= fabRect.top, `提示的底边（${toastRect.bottom}）要在按钮顶边（${fabRect.top}）之上`);
  assertEqual(rectsOverlap(toastRect, fabRect), false, '两者不能叠在一起');
});


// ========== 新建面板 ==========

test('新建面板：点 + 打开，标题对、光标自动在名字框里', () => {
  const { root } = setup({ categories: ['工作'] });

  click(root.querySelector('.fab'));

  assert(root.querySelector('.popup-overlay'), '有暗色遮罩');
  assertEqual(root.querySelector('.popup-title').textContent, '新建任务', '标题说清在建什么');
  assert(document.activeElement === root.querySelector('.popup-card .add-input'), '光标直接在名字框里，点开就能打字');

  openLogsTab(root);
  click(root.querySelector('.fab'));
  assertEqual(root.querySelector('.popup-title').textContent, '新增打卡', '打卡页的面板');
});

test('新建面板：点卡片外面的暗色区域就关掉，点卡片里面不会', () => {
  const { root } = setup({ categories: ['工作'], listTags: [listTag('公司')] });
  click(root.querySelector('.fab'));

  click(root.querySelector('.popup-title'));
  click(root.querySelector('.popup-card'));
  assert(root.querySelector('.popup-card'), '点卡片里面（标题、空白处）不该关');

  click(root.querySelector('.popup-overlay'));
  assertEqual(root.querySelector('.popup-card'), null, '点外面关掉');
  assertEqual(taskDraft, null, '状态也清了');
});

test('新建面板：按 Esc 或点"取消"都关掉，什么都不建', () => {
  const { root } = setup({ categories: ['工作'] });

  click(root.querySelector('.fab'));
  typeInto(root.querySelector('.popup-card .add-input'), '写周报');
  press(root.querySelector('.popup-card .add-input'), 'Escape');
  assertEqual(root.querySelector('.popup-card'), null, 'Esc 关掉');

  click(root.querySelector('.fab'));
  typeInto(root.querySelector('.popup-card .add-input'), '写周报');
  click(root.querySelector('.popup-cancel'));
  assertEqual(root.querySelector('.popup-card'), null, '取消关掉');

  assertEqual(todos, [], '两次都没加');
});

test('新建面板：重新打开应用时，开着的面板不会留着', () => {
  const { root } = setup({ categories: ['工作'] });
  // 三个面板都真的打开一遍 —— 只开其中一个的话，另外两个"状态是空的"本来就成立，查了等于没查
  // （真踩过：+ 从新建清单改成新建任务后，这里没跟着改，"漏重置新建清单面板"的变异就没被抓到）
  click(root.querySelector('.fab'));
  click(root.querySelector('.tag-row .menu-btn'));
  click(menuItemNamed(root, '新建清单'));
  openLogsTab(root);
  click(root.querySelector('.fab'));
  assert(taskDraft && categoryDraft && logItemDraft, '先确认三个面板都开着');

  initApp(root);

  assertEqual([taskDraft, categoryDraft, logItemDraft], [null, null, null], '几个面板的状态都清掉');
  assertEqual(root.querySelector('.popup-card'), null, '页面上也没有');
});


// ========== 防止页面被放大 ==========

test('防缩放：页面设置里不许缩放，也拦住了 iPhone 的双指手势', async () => {
  if (location.protocol === 'file:') {
    skip('要读项目里的文件，需要用 python3 tools/dev-server.py 打开测试页');
  }
  const html = await fetch('../index.html?t=' + Date.now()).then((response) => response.text());
  const viewport = (html.match(/<meta name="viewport" content="([^"]+)"/) || [])[1] || '';

  assert(viewport.includes('maximum-scale=1'), 'viewport 里要有 maximum-scale=1，实际：' + viewport);
  assert(viewport.includes('user-scalable=no'), 'viewport 里要有 user-scalable=no，实际：' + viewport);
  assert(viewport.includes('viewport-fit=cover'), '原来的 viewport-fit=cover 不能丢，不然刘海屏会留白');
  assert(/addEventListener\('gesturestart',[^;]*preventDefault\(\)/.test(html), 'iPhone 的 Safari 会无视 user-scalable=no，要拦住 gesturestart');
});

test('防缩放：快速连点两下不会放大页面（打卡页连点数字时最容易触发）', async () => {
  await useAppStyles();
  setup();

  assertEqual(getComputedStyle(document.documentElement).touchAction, 'manipulation', '整个页面要关掉"连点两下放大"');
});

test('防缩放：所有输入框字号都不小于 16px（小于 16px 时 iPhone 一点进去就自动放大）', async () => {
  await useAppStyles();
  const { root } = setup({ categories: ['工作'], logItems: [logItem('喝水')], listTags: [listTag('公司')] });
  const checked = new Set();

  const checkAll = (where) => {
    const fields = [...root.querySelectorAll('input:not([type="file"]), textarea, select')];
    assert(fields.length > 0, `${where}：没找到输入框，这一步可能没走对`);
    fields.forEach((field) => {
      const size = parseFloat(getComputedStyle(field).fontSize);
      const name = field.className || field.tagName;
      checked.add(name);
      assert(size >= 16, `${where}的 .${name} 字号是 ${size}px`);
    });
  };

  // 清单页：添加任务、清单改名、顶部新建标签、新建清单面板（名字 + 面板里新建标签）
  click(root.querySelector('.add-task'));
  checkAll('添加任务');
  click(root.querySelector('.category-header .menu-btn'));
  click(menuItemNamed(root, '重命名'));
  checkAll('清单改名');
  press(root.querySelector('.edit-input'), 'Escape');
  click(tagChip(root, '+ 新增'));
  checkAll('顶部新建标签');
  press(root.querySelector('.tag-input'), 'Escape');
  click(root.querySelector('.fab'));
  checkAll('新建任务面板');
  click(root.querySelector('.popup-cancel'));
  click(root.querySelector('.tag-row .menu-btn'));
  click(menuItemNamed(root, '新建清单'));
  click(tagOption(root, '+ 新增标签'));
  checkAll('新建清单面板');
  click(root.querySelector('.popup-cancel'));

  // 任务详情页：备注、截止时间、提醒方式
  addTodo('工作', '写周报');
  click(root.querySelector('.todo-item'));
  click(root.querySelector('.icon-btn'));
  checkAll('任务详情页');
  click(root.querySelector('.back-btn'));

  // 打卡：新增面板、补录时间
  openLogsTab(root);
  click(root.querySelector('.fab'));
  checkAll('新增打卡面板');
  click(root.querySelector('.popup-cancel'));
  openLogDetailByTap(root, '喝水');
  selectDay(root, fixedTodayDay() - 3);
  click(root.querySelector('.backfill-btn'));
  checkAll('补录');

  // 确认真的查到了各种输入框，而不是某一步没打开、查了个寂寞
  ['add-input', 'edit-input', 'tag-input', 'note-input', 'due-input', 'remind-select', 'backfill-time']
    .forEach((name) => assert(checked.has(name), `没查到 .${name}，检查不完整`));
});



// ========== 一次只展开一个清单 ==========

// 页面上某个清单区块里的任务文字
function tasksIn(root, category) {
  const section = [...root.querySelectorAll('.category')].find((s) => s.dataset.category === category);
  return section ? textsOf(section, '.todo-text') : null;
}

function headerOf(root, category) {
  return [...root.querySelectorAll('.category')].find((s) => s.dataset.category === category).querySelector('.category-header');
}

test('一次只展开一个清单：点开一个，其它的自动收起；再点一下就收起来', () => {
  const { root, storage } = setup({
    categories: ['工作', '生活', '学习'],
    todos: [
      { text: '写周报', status: 'active', category: '工作' },
      { text: '买菜', status: 'active', category: '生活' }
    ],
    expandedCategory: '工作'
  });
  assertEqual([tasksIn(root, '工作'), tasksIn(root, '生活')], [['写周报'], []], '一开始只展开工作');

  click(headerOf(root, '生活'));
  assertEqual([tasksIn(root, '工作'), tasksIn(root, '生活')], [[], ['买菜']], '点生活：生活展开，工作自动收起');
  assertEqual(
    [...root.querySelectorAll('.category-header')].map((h) => h.getAttribute('aria-expanded')),
    ['false', 'true', 'false'],
    '标着"展开"的也只有生活一个'
  );
  assertEqual(stored(storage, 'expandedCategory'), '生活', '要保存，下次打开还是它');

  click(headerOf(root, '生活'));
  assertEqual(tasksIn(root, '生活'), [], '再点一下收起来');
  assertEqual(expandedCategory, null, '现在一个都没展开');
});

test('一次只展开一个清单：第一次打开时展开第一个清单', () => {
  const { storage } = setup({ categories: ['工作', '生活'] });

  assertEqual(expandedCategory, '工作', '什么记录都没有时，展开第一个');
  assertEqual(stored(storage, 'expandedCategory'), '工作', '顺手存下来');
});

test('一次只展开一个清单：老版本的"折叠记录"会换算过来，老记录删掉', () => {
  const { storage } = setup({ categories: ['工作', '生活', '学习'], collapsed: ['工作'] });

  assertEqual(expandedCategory, '生活', '老版本里第一个没折叠的是生活，展开它');
  assertEqual(storage.getItem('collapsed'), null, '老记录删掉，免得两处都记展开状态');
  assertEqual(stored(storage, 'expandedCategory'), '生活', '新记录存好');
});

test('一次只展开一个清单：记录里的清单已经不在了，就一个都不展开', () => {
  setup({ categories: ['工作'], expandedCategory: '早就删了的清单' });

  assertEqual(expandedCategory, null, '不能指着一个不存在的清单');
});

test('一次只展开一个清单：新建的清单直接展开，马上就能往里加任务', () => {
  const { root } = setup({ categories: ['工作'], expandedCategory: '工作' });

  addCategory('生活');

  assertEqual(expandedCategory, '生活', '新清单展开');
  assert(root.querySelector('.category[data-category="生活"] .add-task'), '"+ 添加任务"就在眼前');
});


// ========== 把任务拖进收起来的清单 ==========

test('拖任务到收起来的清单上：放进那个清单的最前面，两个清单都保持原样', () => {
  const { root } = setup({
    categories: ['工作', '生活'],
    todos: [
      { text: '写周报', status: 'active', category: '工作' },
      { text: '开会', status: 'active', category: '工作' },
      { text: '买菜', status: 'active', category: '生活' }
    ],
    expandedCategory: '工作'
  });

  const target = headerOf(root, '生活').getBoundingClientRect();
  drag(itemNamed(root, '开会'), target.top + target.height / 2);

  assertEqual(todos.filter((t) => t.category === '生活').map((t) => t.text), ['开会', '买菜'], '放进了生活，排在最前面');
  assertEqual(tasksIn(root, '工作'), ['写周报'], '工作里少了它');
  assertEqual(expandedCategory, '工作', '还是工作展开着：往往要一口气拖好几条过去，页面别跳');
});

test('拖任务到收起来的清单上：拖着经过时，占位行出现在那个清单下面', () => {
  const { root } = setup({
    categories: ['工作', '生活'],
    todos: [{ text: '写周报', status: 'active', category: '工作' }],
    expandedCategory: '工作'
  });

  const item = itemNamed(root, '写周报');
  const target = headerOf(root, '生活').getBoundingClientRect();
  // 只按下、移动，先不松手 —— 松手之后再查就晚了（之前有过一条假测试就是这么来的）
  item.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 50, clientY: item.getBoundingClientRect().top + 5 }));
  document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 50, clientY: target.top + target.height / 2 }));

  const placeholder = root.querySelector('.drag-source');
  assert(placeholder && placeholder.closest('.category').dataset.category === '生活', '占位行应该挪到了生活这个清单里');
  assert(placeholder.parentNode.classList.contains('collapsed-drop'), '落在收起清单的那个空列表里');

  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
});


// ========== 右下角 + 是新建任务 ==========

function openTaskPanel(root) {
  click(root.querySelector('.fab'));
  return root.querySelector('.popup-card');
}

function typeTaskName(root, text) {
  const input = root.querySelector('.popup-card .add-input');
  typeInto(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return input;
}

test('新建任务：默认放进展开着的清单，回车就加进去', () => {
  const { root } = setup({ categories: ['工作', '生活'], expandedCategory: '生活' });

  openTaskPanel(root);
  assertEqual(textsOf(root, '.popup-card .list-option'), ['工作', '生活'], '列出可以放的清单');
  assertEqual(textsOf(root, '.popup-card .list-option.selected'), ['生活'], '默认选中展开着的生活');

  press(typeTaskName(root, '买菜'), 'Enter');

  assertEqual(pick(todos[0], ['text', 'category', 'status']), { text: '买菜', category: '生活', status: 'active' }, '加进了生活');
  assertEqual(tasksIn(root, '生活'), ['买菜'], '页面上看得到');
  assertEqual(root.querySelector('.popup-card'), null, '面板收起');
});

test('新建任务：展开着的清单不在当前页面上时，默认放进页面上的第一个', () => {
  const { root } = setup({
    categories: ['工作', '生活', '学习'],
    listTags: [listTag('公司')],
    categoryMeta: { '学习': { tagId: 'ltag-公司', archived: false } },
    expandedCategory: '工作'
  });

  click(tagChip(root, '公司'));
  openTaskPanel(root);
  assertEqual(textsOf(root, '.popup-card .list-option.selected'), ['学习'], '工作被筛掉了，默认选公司下的第一个');
  click(root.querySelector('.popup-cancel'));

  click(tagChip(root, '所有'));
  toggleCollapse('工作');   // 全都收起来
  openTaskPanel(root);
  assertEqual(textsOf(root, '.popup-card .list-option.selected'), ['工作'], '一个都没展开时，默认第一个');
});

test('新建任务：点别的清单就换过去，打的字不会丢；加完展开那个清单', () => {
  const { root, storage } = setup({ categories: ['工作', '生活'], expandedCategory: '工作' });

  openTaskPanel(root);
  typeTaskName(root, '买菜');
  click([...root.querySelectorAll('.popup-card .list-option')].find((o) => o.textContent === '生活'));

  assertEqual(textsOf(root, '.popup-card .list-option.selected'), ['生活'], '只能选一个，换成了生活');
  assertEqual(root.querySelector('.popup-card .add-input').value, '买菜', '点清单会重画，打的字不能丢');

  click(root.querySelector('.popup-submit'));

  assertEqual(todos[0].category, '生活', '"添加"按钮也能加');
  assertEqual(expandedCategory, '生活', '展开放进去的那个清单，让人看到刚加的任务');
  assertEqual(stored(storage, 'expandedCategory'), '生活', '展开状态要保存');
  assertEqual(tasksIn(root, '生活'), ['买菜'], '看得到');
});

test('新建任务：放进一个不在当前筛选里的清单，加完切回"所有"', () => {
  const { root } = setup({
    categories: ['工作', '生活'],
    listTags: [listTag('公司')],
    categoryMeta: { '工作': { tagId: 'ltag-公司', archived: false } },
    expandedCategory: '工作'
  });
  click(tagChip(root, '公司'));

  openTaskPanel(root);
  typeTaskName(root, '买菜');
  click([...root.querySelectorAll('.popup-card .list-option')].find((o) => o.textContent === '生活'));
  click(root.querySelector('.popup-submit'));

  assertEqual(textsOf(root, '.tag-chip.active'), ['所有'], '生活不在公司下，不切回所有的话就看不到刚加的任务');
  assertEqual(tasksIn(root, '生活'), ['买菜'], '看得到');
});

test('新建任务：名字空着不加；归档了的清单不能选', () => {
  const { root } = setup({
    categories: ['工作', '旧项目'],
    categoryMeta: { '旧项目': { tagId: null, archived: true } },
    expandedCategory: '工作'
  });

  openTaskPanel(root);
  assertEqual(textsOf(root, '.popup-card .list-option'), ['工作'], '归档的清单不列出来');
  click(root.querySelector('.popup-submit'));

  assertEqual(todos, [], '空名字不加');
  assertEqual(root.querySelector('.popup-card'), null, '面板收起');
});

test('新建任务：清单都归档了（没地方放）时，不显示 + 按钮', () => {
  const { root } = setup({ categories: ['旧项目'], categoryMeta: { '旧项目': { tagId: null, archived: true } } });

  assertEqual(root.querySelector('.fab'), null, '没有能放任务的清单');
});

test('新建清单：在标签行右边的 ⋯ 里；打卡页的标签行没有这个 ⋯', () => {
  const { root } = setup({ categories: ['工作'] });

  click(root.querySelector('.tag-row .menu-btn'));
  assertEqual(textsOf(root, '.tag-row .menu-item'), ['新建清单'], '菜单里是新建清单');
  click(menuItemNamed(root, '新建清单'));
  assertEqual(root.querySelector('.popup-title').textContent, '新建清单', '打开的是新建清单的面板');
  click(root.querySelector('.popup-cancel'));

  openLogsTab(root);
  assertEqual(root.querySelector('.tag-row .menu-btn'), null, '打卡页用不着，不放');
});


// ========== 打字时收起底部的标签栏和 + 按钮 ==========

// 测试页所在的浏览器窗口没有焦点时（比如开着测试页、人在别的窗口），
// .focus() / .blur() 只会改 document.activeElement，不会发 focusin / focusout 事件 —— 真踩过，两条测试因此失败。
// 手机上真实使用时这两个事件一定会发，所以这里按真实浏览器的顺序自己补发：
// 先离开旧输入框（此时焦点已经不在它身上），发 focusout 并带上"焦点要去哪"，再进新输入框、发 focusin。
// 窗口有焦点时浏览器自己也会发一遍，处理函数重复跑两次结果一样，不影响
function focusField(field) {
  field.focus();
  field.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
}

function leaveField(field, next = null) {
  field.blur();
  field.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: next }));
  if (next) focusField(next);
}

test('打字时：光标进输入框就给应用加上 typing，离开就去掉', () => {
  const { root } = setup({ categories: ['工作'], expandedCategory: '工作' });
  addTodo('工作', '写周报');
  click(root.querySelector('.todo-item'));      // 任务详情页：备注框不会自动拿到光标

  const note = root.querySelector('.note-input');
  assertEqual(root.classList.contains('typing'), false, '还没点进备注框，标签栏该在');

  focusField(note);
  assert(root.classList.contains('typing'), '点进备注框，开始打字');

  leaveField(note);
  assertEqual(root.classList.contains('typing'), false, '光标离开，标签栏要回来');
});

test('打字时：从一个输入框跳到另一个输入框，中间不会把标签栏放出来', () => {
  const { root } = setup({ categories: ['工作'], expandedCategory: '工作' });
  click(root.querySelector('.fab'));
  const first = root.querySelector('.popup-card .add-input');
  assert(root.classList.contains('typing'), '先确认在打字');

  // 在应用里临时放一个输入框，模拟焦点从一个输入框移到另一个
  const other = document.createElement('input');
  root.appendChild(other);

  // focusout 那一刻焦点已经离开旧输入框、还没落到新输入框上。这时要是去掉 typing，标签栏会闪一下。
  // 注意要在 window 上听：事件从里往外传，挂在 root 上的话会比 app.js 挂在 document 上的处理先跑，
  // 那时 typing 还没被动过，永远是 true —— 这条测试就成了假测试
  const seen = [];
  const record = () => seen.push(root.classList.contains('typing'));
  window.addEventListener('focusout', record);
  onCleanup(() => window.removeEventListener('focusout', record));

  leaveField(first, other);

  assertEqual(seen, [true], '跳转的那一刻 typing 还在（看的是焦点要去哪，而不是焦点现在在哪）');
  assert(root.classList.contains('typing'), '到了新输入框，还是在打字');
});

test('打字时：输入框被重画删掉了（比如回车加完任务），typing 也要去掉，标签栏不能一直藏着', () => {
  const { root } = setup({ categories: ['工作'], expandedCategory: '工作' });
  click(root.querySelector('.fab'));
  typeTaskName(root, '写周报');
  assert(root.classList.contains('typing'), '先确认在打字');

  press(root.querySelector('.popup-card .add-input'), 'Enter');   // 面板收起，输入框没了

  assertEqual(root.querySelector('.popup-card'), null, '面板收起了');
  assertEqual(root.classList.contains('typing'), false, '输入框都没了，标签栏要回来');
});

test('打字时：只在触屏设备上藏起标签栏、+ 按钮和撤销提示，电脑上不藏', async () => {
  await useAppStyles();
  setup();

  const sheet = [...document.styleSheets].find((s) => s.ownerNode && s.ownerNode.textContent.includes('--text-input'));
  const hides = (rule) => rule.style && rule.style.display === 'none' &&
    ['.typing .tab-bar', '.typing .fab', '.typing .undo-toast'].every((sel) => rule.selectorText.includes(sel));

  const touchRules = [...sheet.cssRules]
    .filter((rule) => rule.media && rule.media.mediaText.includes('hover: none'))
    .flatMap((rule) => [...rule.cssRules]);
  assert(touchRules.some(hides), '触屏设备（hover: none）里要有一条把 .typing 下的标签栏、+、撤销提示都藏起来的规则');

  const topLevel = [...sheet.cssRules].filter((rule) => rule.selectorText);
  assertEqual(topLevel.some((rule) => rule.selectorText.includes('.typing')), false, '不能写在触屏判断外面，不然电脑上打字时标签栏也会消失');
});
