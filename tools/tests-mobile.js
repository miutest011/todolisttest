// 手机上用起来顺不顺手：右下角的新建按钮、新建面板、防止页面被放大。
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
  assertEqual(fab.getAttribute('aria-label'), '新建清单', '按钮上只有个 + 号，要告诉读屏软件它是干嘛的');
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
  assertEqual(root.querySelector('.popup-title').textContent, '新建清单', '标题说清在建什么');
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
  assertEqual(categoryDraft, null, '状态也清了');
});

test('新建面板：按 Esc 或点"取消"都关掉，什么都不建', () => {
  const { root } = setup({ categories: ['工作'] });

  click(root.querySelector('.fab'));
  typeInto(root.querySelector('.popup-card .add-input'), '生活');
  press(root.querySelector('.popup-card .add-input'), 'Escape');
  assertEqual(root.querySelector('.popup-card'), null, 'Esc 关掉');

  click(root.querySelector('.fab'));
  typeInto(root.querySelector('.popup-card .add-input'), '生活');
  click(root.querySelector('.popup-cancel'));
  assertEqual(root.querySelector('.popup-card'), null, '取消关掉');

  assertEqual(categories, ['工作'], '两次都没建');
});

test('新建面板：重新打开应用时，开着的面板不会留着', () => {
  const { root } = setup({ categories: ['工作'] });
  click(root.querySelector('.fab'));
  openLogsTab(root);
  click(root.querySelector('.fab'));

  initApp(root);

  assertEqual([categoryDraft, logItemDraft], [null, null], '两边的面板状态都清掉');
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
