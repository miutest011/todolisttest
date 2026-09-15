// 清单页的标签和归档。
// 标签界面是和打卡页共用的（tags.js），界面细节已经在 tests-logs.js 里测过一遍，
// 这里重点测清单自己的规则：像文件夹一样只能放一个标签、按名字记所以改名要同步、
// 归档后任务不打扰人、筛选状态下排序不出错。
// 复用 tests.js 和 tests-logs.js 里的工具（setup、click、tagChip、touchDown……），所以排在它们后面加载。

// 造一个清单标签。id 固定成 'ltag-名字'，测试里好引用
function listTag(name) {
  return { id: 'ltag-' + name, name: name };
}

function openTasksTab(root) {
  click(tabButton(root, '清单'));
}

function visibleCategoryNames(root) {
  return textsOf(root, '#category-list .category-name');
}

function categoryHeaderNamed(root, name) {
  return [...root.querySelectorAll('.category-header')]
    .find((header) => header.querySelector('.category-name').textContent === name);
}

function openCategoryMenu(root, name) {
  click(categoryHeaderNamed(root, name).querySelector('.menu-btn'));
}

// 四个清单：工作、学习放在"公司"下；生活放在"家里"下；旧项目已归档
function listTagSetup(extra = {}) {
  return setup(Object.assign({
    categories: ['工作', '生活', '学习', '旧项目'],
    listTags: [listTag('公司'), listTag('家里')],
    categoryMeta: {
      '工作': { tagId: 'ltag-公司', archived: false },
      '生活': { tagId: 'ltag-家里', archived: false },
      '学习': { tagId: 'ltag-公司', archived: false },
      '旧项目': { tagId: null, archived: true }
    }
  }, extra));
}


// ========== 清单标签：数据 ==========

test('清单标签：新增带 id 并保存；空名、重名、叫"所有""已归档"都不行', () => {
  const { storage } = setup({ listTags: [listTag('公司')] });

  const tag = addListTag('  家里  ');

  assert(tag && tag.id, '返回新标签，带 id');
  assertEqual(listTags.map((t) => t.name), ['公司', '家里'], '去掉空格，排在后面');
  assertEqual(stored(storage, 'listTags'), listTags, '要保存');
  assertEqual(addListTag(''), null, '空名不行');
  assertEqual(addListTag('公司'), null, '重名不行');
  assertEqual(addListTag('所有'), null, '和固定项同名不行');
  assertEqual(addListTag('已归档'), null, '和固定项同名不行');
});

test('清单标签：和打卡的标签互不相干，两边可以各有一个同名的', () => {
  setup({ logTags: [logTag('健身')] });

  assert(addListTag('健身'), '打卡里有"健身"，清单里也能建');
  assertEqual(logTags.map((t) => t.name), ['健身'], '打卡的标签不受影响');
  assertEqual(listTags.map((t) => t.name), ['健身'], '清单的标签单独存');
});

test('清单标签：改名只改名字，清单还在这个标签下', () => {
  listTagSetup();

  assertEqual(renameListTag('ltag-公司', '单位'), true, '改名成功');
  assertEqual(categoryTagOf('工作'), 'ltag-公司', '清单记的是 id，不用跟着改');
  assertEqual(categoriesInFilter('ltag-公司'), ['工作', '学习'], '筛选照样有效');
  assertEqual(renameListTag('ltag-公司', '家里'), false, '不能和别的标签重名');
});

test('清单标签：删除有清单在用的标签要确认，取消就不删', () => {
  listTagSetup();
  let message = null;
  useConfirm((text) => { message = text; return false; });

  assertEqual(deleteListTag('ltag-公司'), false, '取消返回 false');
  assert(findListTag('ltag-公司'), '标签还在');
  assertEqual(categoryTagOf('工作'), 'ltag-公司', '清单还在标签下');
  assert(message && message.includes('2') && message.includes('不会删掉'), '说清几个清单、清单本身不会删，实际：' + message);
});

test('清单标签：确认删除后，清单和任务都在，只是不在标签下了', () => {
  const { storage } = listTagSetup({ todos: [{ text: '写周报', status: 'active', category: '工作' }] });

  deleteListTag('ltag-公司');

  assertEqual(listTags.map((t) => t.name), ['家里'], '标签删了');
  assertEqual(categories, ['工作', '生活', '学习', '旧项目'], '清单一个不少');
  assertEqual(todos.map((t) => t.text), ['写周报'], '任务还在');
  assertEqual([categoryTagOf('工作'), categoryTagOf('学习')], [null, null], '不在任何标签下了');
  assertEqual(stored(storage, 'categoryMeta')['工作'], undefined, '归属的变化要保存');
});

test('清单标签：像文件夹一样只能放一个，放进别的标签就从原来那个拿出来', () => {
  const { storage } = listTagSetup();

  setCategoryTag('工作', 'ltag-家里');

  assertEqual(categoryTagOf('工作'), 'ltag-家里', '换到了家里');
  assertEqual(categoriesInFilter('ltag-公司'), ['学习'], '公司下面不再有它');
  assertEqual(categoriesInFilter('ltag-家里'), ['工作', '生活'], '家里下面多了它');
  assertEqual(stored(storage, 'categoryMeta')['工作'].tagId, 'ltag-家里', '要保存');

  setCategoryTag('工作', null);
  assertEqual(categoryTagOf('工作'), null, '"不放进标签"');
  assertEqual(stored(storage, 'categoryMeta')['工作'], undefined, '回到默认值时不留多余记录');

  assertEqual(setCategoryTag('工作', 'ltag-不存在'), false, '不存在的标签放不进去');
});

test('清单归档：拿掉标签；取消归档后标签不会自己回来；归档的放不进标签', () => {
  const { storage } = listTagSetup();

  archiveCategory('工作');
  assertEqual([isCategoryArchived('工作'), categoryTagOf('工作')], [true, null], '归档并拿掉标签');
  assertEqual(stored(storage, 'categoryMeta')['工作'], { tagId: null, archived: true }, '要保存');
  assertEqual(setCategoryTag('工作', 'ltag-公司'), false, '归档的不能放进标签');

  unarchiveCategory('工作');
  assertEqual([isCategoryArchived('工作'), categoryTagOf('工作')], [false, null], '取消归档，标签是空的');
});

test('清单改名：所在的标签和归档状态跟着走（它们是按名字记的）', () => {
  const { storage } = listTagSetup();

  renameCategory('工作', '上班');
  renameCategory('旧项目', '老项目');

  assertEqual(categoryTagOf('上班'), 'ltag-公司', '改名后还在公司下');
  assertEqual(isCategoryArchived('老项目'), true, '改名后还是归档的');
  assertEqual(categoryMeta['工作'], undefined, '旧名字的记录不能留着');
  assertEqual(Object.keys(stored(storage, 'categoryMeta')).sort(), ['上班', '学习', '生活', '老项目'].sort(), '存下来的也跟着改');
});

test('清单删除：归属记录一起清掉，再建同名清单不会莫名其妙出现在标签下', () => {
  const { storage } = listTagSetup();

  deleteCategory('工作');
  assertEqual(stored(storage, 'categoryMeta')['工作'], undefined, '记录清掉了');

  addCategory('工作');
  assertEqual([categoryTagOf('工作'), isCategoryArchived('工作')], [null, false], '新清单干干净净');
});

test('清单标签：读数据时顺手理干净', () => {
  setup({
    categories: ['工作', '生活', '学习'],
    listTags: [listTag('公司')],
    categoryMeta: {
      '工作': { tagId: 'ltag-公司', archived: false },
      '生活': { tagId: 'ltag-早就删了', archived: false },
      '学习': { tagId: 'ltag-公司', archived: true },
      '不存在的清单': { tagId: 'ltag-公司', archived: false }
    }
  });

  assertEqual(categoryTagOf('工作'), 'ltag-公司', '正常的留着');
  assertEqual(categoryTagOf('生活'), null, '指向不存在标签的去掉');
  assertEqual([isCategoryArchived('学习'), categoryTagOf('学习')], [true, null], '归档的不该在标签下');
  assertEqual(Object.keys(categoryMeta).sort(), ['学习', '工作'].sort(), '不存在的清单和没用的记录都不留');
});

test('清单标签：冷启动时归属能读回来（先读标签、再读归属）', () => {
  const { root } = listTagSetup();

  // 模拟手机上真正重新打开：内存里什么都没有，只有存储里的数据
  listTags = [];
  categoryMeta = {};
  categories = [];
  initApp(root);

  assertEqual(categoryTagOf('工作'), 'ltag-公司', '先读归属再读标签的话，对照时标签列表是空的，归属会被全部清掉');
  assertEqual(isCategoryArchived('旧项目'), true, '归档状态也要读回来');
});

test('清单标签：所有 = 没归档的；某个标签 = 放在它下面的；已归档 = 归档了的', () => {
  listTagSetup();

  assertEqual(categoriesInFilter('all'), ['工作', '生活', '学习'], '"所有"不含已归档');
  assertEqual(categoriesInFilter('ltag-公司'), ['工作', '学习'], '按原来的顺序');
  assertEqual(categoriesInFilter('archived'), ['旧项目'], '只列归档的');
});

test('筛选状态下排序：看得见的几个换顺序，看不见的原地不动', () => {
  listTagSetup();
  listTagFilter = 'ltag-公司';

  // 页面上只看得到 工作、学习，拖成了 学习、工作
  assertEqual(mergeVisibleCategoryOrder(['学习', '工作']), ['学习', '生活', '工作', '旧项目'], '生活和旧项目的位置不变');
});


// ========== 清单标签：界面 ==========

test('清单页顶部：所有 / 自己的标签 / 已归档 / + 新增，默认"所有"，看不到归档的清单', () => {
  const { root } = listTagSetup();

  assertEqual(textsOf(root, '.tag-bar .tag-chip'), ['所有', '公司', '家里', '已归档', '+ 新增'], '和打卡页一样的顺序');
  assertEqual(textsOf(root, '.tag-chip.active'), ['所有'], '默认选中所有');
  assertEqual(visibleCategoryNames(root), ['工作', '生活', '学习'], '归档的不在"所有"里');
});

test('清单页顶部：点标签只看这个标签下的清单；"已归档"下没有 + 按钮', () => {
  const { root } = listTagSetup();

  click(tagChip(root, '公司'));
  assertEqual(visibleCategoryNames(root), ['工作', '学习'], '只剩公司的');
  assertEqual(textsOf(root, '.tag-chip.active'), ['公司'], '高亮跟着走');

  click(tagChip(root, '已归档'));
  assertEqual(visibleCategoryNames(root), ['旧项目'], '只剩归档的');
  assertEqual(root.querySelector('.fab'), null, '任务只能放进没归档的清单，建完不会出现在这一页，所以不给入口');
});

test('清单页顶部：用"+ 新增"建标签，长按能改名和删除（共用组件在清单页也好用）', async () => {
  const { root } = listTagSetup();

  click(tagChip(root, '+ 新增'));
  const input = root.querySelector('.tag-bar .tag-input');
  assert(document.activeElement === input, '光标自动放进去');
  typeInto(input, '副业');
  press(input, 'Enter');
  assertEqual(listTags.map((t) => t.name), ['公司', '家里', '副业'], '建到了清单的标签里');
  assertEqual(logTags, [], '没有跑到打卡那边去');

  touchDown(tagChip(root, '副业'));
  await sleep(20);
  click(root.querySelector('.tag-rename'));
  const rename = root.querySelector('.tag-manager .edit-input');
  typeInto(rename, '兼职');
  press(rename, 'Enter');
  assert(tagChip(root, '兼职'), '改名成功');

  click(root.querySelector('.tag-delete'));
  assertEqual(tagChip(root, '兼职'), undefined, '删除成功');
});

// 点标签行右边的 ⋯ → 新建清单，打开新建清单的面板（右下角的 + 是新建任务）
function openCategoryPanel(root) {
  click(root.querySelector('.tag-row .menu-btn'));
  click(menuItemNamed(root, '新建清单'));
  return root.querySelector('.popup-card');
}

function typeCategoryName(root, name) {
  const input = root.querySelector('.popup-card .add-input');
  typeInto(input, name);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return input;
}

test('新建清单：停在某个标签下新建，默认放进这个标签', () => {
  const { root } = listTagSetup();
  click(tagChip(root, '家里'));

  openCategoryPanel(root);
  assertEqual(textsOf(root, '.popup-card .tag-option.selected'), ['家里'], '面板里默认选中当前标签');
  press(typeCategoryName(root, '装修'), 'Enter');

  assertEqual(categoryTagOf('装修'), 'ltag-家里', '放进了家里');
  assertEqual(visibleCategoryNames(root), ['生活', '装修'], '就在眼前');
  assertEqual(root.querySelector('.popup-card'), null, '面板收起');
});

test('新建清单：在"所有"下新建，默认不放进任何标签', () => {
  const { root } = listTagSetup();

  openCategoryPanel(root);
  assertEqual(textsOf(root, '.popup-card .tag-option.selected'), [], '一个都没选');
  press(typeCategoryName(root, '杂事'), 'Enter');

  assertEqual(categoryTagOf('杂事'), null, '不在标签下');
});

test('新建清单：面板里的标签像文件夹一样只能选一个，再点一下就是不放', () => {
  const { root } = listTagSetup();

  openCategoryPanel(root);
  typeCategoryName(root, '装修');
  click(tagOption(root, '公司'));
  click(tagOption(root, '家里'));
  assertEqual(textsOf(root, '.popup-card .tag-option.selected'), ['家里'], '选家里就换掉公司，不是两个都选');
  assertEqual(root.querySelector('.popup-card .add-input').value, '装修', '点标签不能把打的名字清掉');

  click(tagOption(root, '家里'));
  assertEqual(textsOf(root, '.popup-card .tag-option.selected'), [], '再点一下取消');

  click(tagOption(root, '公司'));
  click(root.querySelector('.popup-submit'));
  assertEqual(categoryTagOf('装修'), 'ltag-公司', '点"创建"按钮也行，放进了最后选的那个');
});

test('新建清单：在"公司"下却放进了"家里"，建完切回"所有"，免得以为没建成', () => {
  const { root } = listTagSetup();
  click(tagChip(root, '公司'));

  openCategoryPanel(root);
  typeCategoryName(root, '装修');
  click(tagOption(root, '家里'));
  click(root.querySelector('.popup-submit'));

  assertEqual(textsOf(root, '.tag-chip.active'), ['所有'], '切回所有');
  assert(visibleCategoryNames(root).includes('装修'), '看得到刚建的');
});

test('新建清单：在面板里新建标签，自动选上它', () => {
  const { root } = listTagSetup();

  openCategoryPanel(root);
  typeCategoryName(root, '装修');
  click(tagOption(root, '公司'));
  click(tagOption(root, '+ 新增标签'));
  const tagInput = root.querySelector('.popup-card .tag-input');
  assert(document.activeElement === tagInput, '光标进标签输入框');
  typeInto(tagInput, '副业');
  press(tagInput, 'Enter');

  assertEqual(textsOf(root, '.popup-card .tag-option.selected'), ['副业'], '新标签选上，原来的公司换掉');
  assertEqual(root.querySelector('.popup-card .add-input').value, '装修', '名字还在');
  assert(listTags.some((t) => t.name === '副业'), '建到了清单的标签里');
});

test('新建清单：名字空着点创建，什么都不建，面板收起', () => {
  const { root } = listTagSetup();

  openCategoryPanel(root);
  click(root.querySelector('.popup-submit'));

  assertEqual(categories.length, 4, '没建出来');
  assertEqual(root.querySelector('.popup-card'), null, '面板收起');
});

test('清单 ⋯ 菜单：列出所有标签，当前所在的打勾，点别的就换过去', () => {
  const { root } = listTagSetup();
  click(tagChip(root, '公司'));

  openCategoryMenu(root, '工作');
  assertEqual(textsOf(root, '.menu-item.checked'), ['公司'], '当前所在的打勾，而且只有一个');
  assert(menuItemNamed(root, '家里'), '别的标签也列出来');
  assert(menuItemNamed(root, '不放进标签'), '在标签下的才有"不放进标签"');

  click(menuItemNamed(root, '家里'));

  assertEqual(categoryTagOf('工作'), 'ltag-家里', '换过去了');
  assertEqual(visibleCategoryNames(root), ['学习'], '正在看"公司"，它就从这里消失了');
});

test('清单 ⋯ 菜单："不放进标签"；不在标签下的清单没有这一项', () => {
  const { root } = listTagSetup();

  openCategoryMenu(root, '工作');
  click(menuItemNamed(root, '不放进标签'));
  assertEqual(categoryTagOf('工作'), null, '拿出来了');

  openCategoryMenu(root, '工作');
  assertEqual(textsOf(root, '.menu-item.checked'), [], '没有打勾的');
  assertEqual(menuItemNamed(root, '不放进标签'), undefined, '已经不在标签下，就不显示这一项');
});

test('清单 ⋯ 菜单：一个标签都没有时，不显示"放到标签"那一组', () => {
  const { root } = setup({ categories: ['工作'] });

  openCategoryMenu(root, '工作');

  assertEqual(textsOf(root, '.menu-label').includes('放到标签'), false, '没有标签可选，就别占地方');
  assert(menuItemNamed(root, '归档'), '归档还是有的');
});

test('清单 ⋯ 菜单：归档后去了"已归档"，那里的菜单是"取消归档"，也不能放进标签', () => {
  const { root } = listTagSetup();

  openCategoryMenu(root, '工作');
  click(menuItemNamed(root, '归档'));
  assertEqual(visibleCategoryNames(root), ['生活', '学习'], '"所有"里不见了');

  click(tagChip(root, '已归档'));
  assertEqual(visibleCategoryNames(root), ['工作', '旧项目'], '按原来的顺序出现在已归档里');

  openCategoryMenu(root, '工作');
  assert(menuItemNamed(root, '取消归档'), '有取消归档');
  assertEqual(menuItemNamed(root, '归档'), undefined, '没有"归档"');
  assertEqual(textsOf(root, '.menu-label').includes('放到标签'), false, '归档的不能放进标签');

  click(menuItemNamed(root, '取消归档'));
  assertEqual(visibleCategoryNames(root), ['旧项目'], '从已归档里出去了');
});

test('筛选状态下拖拽清单：排好的顺序能保存，看不见的清单不受影响', () => {
  const { root, storage } = listTagSetup();
  click(tagChip(root, '公司'));

  // 页面上是 工作、学习，把工作拖到学习下面
  drag(categoryHeaderNamed(root, '工作'), categoryHeaderNamed(root, '学习').closest('.category').getBoundingClientRect().bottom);

  assertEqual(categories, ['学习', '生活', '工作', '旧项目'], '以前这里会因为"清单对不上"被拒绝，什么都不保存');
  assertEqual(stored(storage, 'categories'), categories, '保存了');
  assertEqual(visibleCategoryNames(root), ['学习', '工作'], '页面上顺序对');
});

test('筛选状态下 ⋯ 菜单的上移下移：和看得见的邻居换', () => {
  const { root } = listTagSetup();
  click(tagChip(root, '公司'));

  openCategoryMenu(root, '工作');
  assertEqual(menuItemNamed(root, '上移'), undefined, '在这一页它是第一个，不能上移');
  click(menuItemNamed(root, '下移'));

  // 数组里"工作"的邻居是看不见的"生活"，要是和它换，页面上看起来就是"点了没反应"
  assertEqual(visibleCategoryNames(root), ['学习', '工作'], '和看得见的"学习"换了');
  assertEqual(categories, ['学习', '生活', '工作', '旧项目'], '生活原地不动');
});

test('归档的清单：任务不出现在"今天"页，取消归档后回来', () => {
  const { root } = listTagSetup({
    todos: [
      { text: '交报告', status: 'active', category: '工作', dueAt: isoAfter(60) },
      { text: '整理旧文件', status: 'active', category: '旧项目', dueAt: isoAfter(60) }
    ]
  });

  click(tabButton(root, '今天'));
  assertEqual(textsOf(root, '.todo-text'), ['交报告'], '归档清单里的任务不来打扰');

  unarchiveCategory('旧项目');
  assertEqual(textsOf(root, '.todo-text').sort(), ['交报告', '整理旧文件'].sort(), '取消归档后回来了');
});

test('归档的清单：任务到点不提醒，取消归档后照常提醒', () => {
  const { notifications } = listTagSetup({
    todos: [{ text: '整理旧文件', status: 'active', category: '旧项目',
              createdAt: FIXED_NOW, dueAt: isoAfter(30), remindBefore: 60, reminded: false }]
  });

  checkReminders();
  assertEqual(notifications.length, 0, '归档了就不提醒');
  assertEqual(todos[0].reminded, false, '也不能标记成"提醒过"，不然取消归档后就再也收不到了');

  unarchiveCategory('旧项目');
  checkReminders();
  assertEqual(notifications.length, 1, '取消归档后照常提醒');
});

test('任务的"移动到"不列出归档的清单', () => {
  const { root } = listTagSetup({ todos: [{ text: '写周报', status: 'active', category: '工作' }] });

  click(root.querySelector('.todo-item .menu-btn'));
  const menu = textsOf(root, '.menu-item');

  assert(menu.includes('生活'), '正常的清单能移过去');
  assertEqual(menu.includes('旧项目'), false, '归档了的清单不该往里放东西');
});

test('清单页：各种"没有东西"时的提示；一个清单都没有时告诉用户点右上角的 ⋯', () => {
  const { root } = setup({ categories: ['旧项目'], listTags: [listTag('公司')], categoryMeta: { '旧项目': { tagId: null, archived: true } } });

  assert(root.querySelector('.empty-state').textContent.includes('已归档'), '全归档了，告诉用户去哪找');

  click(tagChip(root, '公司'));
  assert(root.querySelector('.empty-state').textContent.includes('这个标签下'), '空标签说明怎么放进来');

  useConfirm(() => true);
  deleteCategory('旧项目');
  click(tagChip(root, '已归档'));
  assert(root.querySelector('.empty-state').textContent.includes('⋯'), '说明从哪里归档');

  click(tagChip(root, '所有'));
  assert(root.querySelector('.empty-state').textContent.includes('右上角'), '新建清单在右上角的 ⋯ 里，要告诉用户去哪点');
  assertEqual(root.querySelector('.fab'), null, '一个清单都没有，新建任务也没地方放，不显示 +');
});

test('两页的筛选互不影响：打卡页选了标签，清单页还是"所有"', () => {
  const { root } = listTagSetup({ logTags: [logTag('健身')] });

  openLogsTab(root);
  click(tagChip(root, '健身'));
  openTasksTab(root);

  assertEqual(textsOf(root, '.tag-chip.active'), ['所有'], '清单页的筛选单独记');
  openLogsTab(root);
  assertEqual(textsOf(root, '.tag-chip.active'), ['健身'], '打卡页的也还在');
});

test('换底部页面时，收起标签输入框和长按管理条', () => {
  const { root } = listTagSetup({ logTags: [logTag('健身')] });

  tagChip(root, '公司').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  assert(root.querySelector('.tag-manager'), '先确认管理条出来了');

  openLogsTab(root);
  openTasksTab(root);

  assertEqual(root.querySelector('.tag-manager'), null, '回来时不该还开着');
  assertEqual([addingTagIn, managingTagId], [null, null], '状态清掉了');
});

test('清单标签：重新打开应用时，清单页的筛选回到"所有"', () => {
  const { root } = listTagSetup();
  click(tagChip(root, '公司'));

  initApp(root);

  assertEqual(listTagFilter, 'all', '界面状态要重置');
  assertEqual(visibleCategoryNames(root), ['工作', '生活', '学习'], '回到"所有"');
});
