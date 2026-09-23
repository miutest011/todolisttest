// 变异清单：故意把代码改坏的地方。tools/mutate.html 会一条条改、一条条跑测试，看测试能不能发现。
//
// 每条长这样：
//   group    分组，方便只跑某一块（一般写功能名）
//   name     改坏了什么。写成"bug 长什么样"，而不是"改了哪行"
//   file     改哪个文件，路径相对项目根目录：'app.js'、'logs.js'、'tools/test-runner.js'……
//   find     要被替换的原文，必须在文件里正好出现一次
//   replace  换成什么
//
// 怎么加：做完新功能、写完测试之后，想想"这个功能最可能怎么坏"，每种坏法加一条。
// 从代码里原样复制 find（包括缩进和注释），换行写成 \n。
//
// 代码改过之后，有的 find 会对不上，页面上会标成"已过期"。
// 那不是测试的问题 —— 照着新代码把 find 更新一下，或者那段代码已经不在了就删掉这一条。

const MUTATIONS = [
  // ---------- 基础 ----------
  {
    group: '基础',
    name: '重置时漏掉"当前在哪个标签页"（状态泄漏）',
    file: 'app.js',
    find: "  currentTab = 'tasks';      // 每次打开都从\"清单\"页开始\n",
    replace: ''
  },
  {
    group: '基础',
    name: '勾选框漏掉 stopPropagation（点勾选框会顺带进详情页）',
    file: 'app.js',
    find: '    event.stopPropagation();       // 不要进详情页\n    toggleTodo(index);',
    replace: '    toggleTodo(index);'
  },
  {
    group: '基础',
    name: '删任务时不删附件文件',
    file: 'app.js',
    find: '  return deleteAttachmentsOf(removed);',
    replace: '  return Promise.resolve();'
  },
  {
    group: '基础',
    name: '置顶的任务不排到前面',
    file: 'app.js',
    find: 'return todo.pinned ? 0 : 1;',
    replace: 'return 1;'
  },
  {
    group: '基础',
    name: '提醒后不做标记（每分钟重复弹）',
    file: 'app.js',
    find: '      todo.reminded = true;\n',
    replace: ''
  },
  {
    group: '基础',
    name: '打卡的数字按钮漏掉 stopPropagation（记一次顺带进详情页）',
    file: 'logs.js',
    find: '    event.stopPropagation();   // 不要顺带进详情页\n',
    replace: ''
  },

  // ---------- 打卡：标签与归档 ----------
  {
    group: '打卡标签',
    name: '"所有"里也列出已归档的',
    file: 'logs.js',
    find: "if (filter === 'all') return logItems.filter((item) => !item.archived);",
    replace: "if (filter === 'all') return logItems.slice();"
  },
  {
    group: '打卡标签',
    name: '归档时不清掉标签',
    file: 'logs.js',
    find: '  item.archived = true;\n  item.tagIds = [];',
    replace: '  item.archived = true;'
  },
  {
    group: '打卡标签',
    name: '删标签时不从项目身上去掉',
    file: 'logs.js',
    find: '  users.forEach((item) => {\n    item.tagIds = item.tagIds.filter((tagId) => tagId !== id);\n  });',
    replace: ''
  },
  {
    group: '打卡标签',
    name: '新增打卡时不记下打的名字（点标签就清空）',
    file: 'logs.js',
    find: "  input.addEventListener('input', () => {\n    draft.name = input.value;\n  });",
    replace: ''
  },
  {
    group: '打卡标签',
    name: '重置时漏掉"选中了哪个标签"',
    file: 'logs.js',
    find: "  logTagFilter = 'all';        // 每次打开都从\"所有\"开始\n",
    replace: ''
  },
  {
    group: '打卡标签',
    name: '启动时先读项目、再读标签（冷启动标签全丢）',
    file: 'app.js',
    find: '  logTags = loadLogTags();     // 同理，打卡也是先读标签再读项目\n  logItems = loadLogItems();',
    replace: '  logItems = loadLogItems();\n  logTags = loadLogTags();'
  },
  {
    group: '打卡标签',
    name: '在某个标签下新增时不默认带上它',
    file: 'logs.js',
    find: 'tagIds: findLogTag(logTagFilter) ? [logTagFilter] : []',
    replace: 'tagIds: []'
  },
  {
    group: '打卡标签',
    name: '取消默认标签后建完不切回"所有"',
    file: 'logs.js',
    find: "    logTagFilter = 'all';\n    render();",
    replace: '    render();'
  },
  {
    group: '打卡标签',
    name: '读数据时不清理标签 id',
    file: 'logs.js',
    find: 'item.tagIds = item.archived ? [] : cleanLogTagIds(item.tagIds);',
    replace: 'item.tagIds = item.tagIds || [];'
  },
  {
    group: '打卡标签',
    name: '"已归档"下面也显示新增入口',
    file: 'logs.js',
    find: "if (logTagFilter !== 'archived') {\n    view.classList.add('has-fab');",
    replace: "if (true) {\n    view.classList.add('has-fab');"
  },
  {
    group: '打卡标签',
    name: '详情页里新建的标签不加到项目上',
    file: 'logs.js',
    find: '(tag) => toggleLogItemTag(item.id, tag.id)    // 在这里新建的标签',
    replace: '(tag) => {}    // 在这里新建的标签'
  },
  {
    group: '打卡标签',
    name: '重画时不优先把光标放进 data-autofocus 的输入框',
    file: 'app.js',
    find: "appEl.querySelector('[data-autofocus]') || ",
    replace: ''
  },

  // ---------- 共用标签组件（tags.js）----------
  {
    group: '共用标签组件',
    name: '标签可以叫"所有""已归档"',
    file: 'tags.js',
    find: "if (name === '' || RESERVED_TAG_NAMES.includes(name)) return false;",
    replace: "if (name === '') return false;"
  },
  {
    group: '共用标签组件',
    name: '长按后浏览器补发的点击把操作条关掉',
    file: 'tags.js',
    find: 'if (!tag || managingTagId !== tag.id) {',
    replace: 'if (true) {'
  },
  {
    group: '共用标签组件',
    name: '长按时手指滑动不取消（横着滑标签行也会弹出操作条）',
    file: 'tags.js',
    find: '> MOVE_THRESHOLD) cancel();',
    replace: '> MOVE_THRESHOLD) {}'
  },

  // ---------- 清单：标签与归档 ----------
  {
    group: '清单标签',
    name: '"所有"里含归档的清单',
    file: 'app.js',
    find: "if (filter === 'all') return categories.filter((category) => !isCategoryArchived(category));",
    replace: "if (filter === 'all') return categories.slice();"
  },
  {
    group: '清单标签',
    name: '归档的清单也能放进标签',
    file: 'app.js',
    find: '  if (!categories.includes(category) || isCategoryArchived(category)) return false;\n  if (tagId !== null',
    replace: '  if (!categories.includes(category)) return false;\n  if (tagId !== null'
  },
  {
    group: '清单标签',
    name: '清单改名时不同步标签归属',
    file: 'app.js',
    find: '  if (categoryMeta[oldName]) {\n    categoryMeta[trimmed] = categoryMeta[oldName];\n    delete categoryMeta[oldName];\n  }\n',
    replace: ''
  },
  {
    group: '清单标签',
    name: '删清单时不清归属记录',
    file: 'app.js',
    find: '  delete categoryMeta[category];  // 不删的话',
    replace: '  // 不删的话'
  },
  {
    group: '清单标签',
    name: '筛选状态下拖拽不拼回完整顺序（松手就弹回去）',
    file: 'app.js',
    find: 'applyCategoryOrder(mergeVisibleCategoryOrder(visibleNames));',
    replace: 'applyCategoryOrder(visibleNames);'
  },
  {
    group: '清单标签',
    name: '筛选状态下上移下移和数组里的邻居换',
    file: 'app.js',
    find: '  const visible = categoriesInFilter(listTagFilter);\n  const from = visible.indexOf(category);',
    replace: '  const visible = categories;\n  const from = visible.indexOf(category);'
  },
  {
    group: '清单标签',
    name: '归档清单的任务照样提醒',
    file: 'app.js',
    find: '    if (isCategoryArchived(todo.category)) return;   // 清单归档了也不提醒。取消归档后还没过点的照常提醒\n',
    replace: ''
  },
  {
    group: '清单标签',
    name: '任务"移动到"列出归档的清单',
    file: 'app.js',
    find: ' && !isCategoryArchived(name));',
    replace: ');'
  },
  {
    group: '清单标签',
    name: '启动时先读归属、再读标签',
    file: 'app.js',
    find: '  listTags = loadListTags();   // 先读标签：读清单归属时要对照它，把已经不存在的标签去掉\n  categoryMeta = loadCategoryMeta();',
    replace: '  categoryMeta = loadCategoryMeta();\n  listTags = loadListTags();'
  },
  {
    group: '清单标签',
    name: '归档清单时不拿掉标签',
    file: 'app.js',
    find: '  setCategoryMeta(category, null, true);\n  saveCategoryMeta();',
    replace: '  setCategoryMeta(category, categoryTagOf(category), true);\n  saveCategoryMeta();'
  },
  {
    group: '清单标签',
    name: '重置时漏掉清单页的筛选',
    file: 'app.js',
    find: "  listTagFilter = 'all';     // 清单页每次打开都从\"所有\"开始\n",
    replace: ''
  },
  {
    group: '清单标签',
    name: '换底部页面时不收起标签输入框和管理条',
    file: 'app.js',
    find: '      resetTagViewState();\n      render();',
    replace: '      render();'
  },
  {
    group: '清单标签',
    name: '删清单标签时不清清单归属',
    file: 'app.js',
    find: '  users.forEach((category) => setCategoryMeta(category, null, false));\n',
    replace: ''
  },
  {
    group: '清单标签',
    name: '菜单里当前所在的标签不打勾',
    file: 'app.js',
    find: "if (item.checked) row.classList.add('checked');",
    replace: ';'
  },
  {
    group: '清单标签',
    name: '归档清单的菜单里也有"放到标签"',
    file: 'app.js',
    find: 'if (!archived && listTags.length > 0) {',
    replace: 'if (listTags.length > 0) {'
  },
  {
    group: '清单标签',
    name: '"已归档"下也显示 + 按钮（清单页）',
    file: 'app.js',
    find: "if (listTagFilter !== 'archived' && categoriesInFilter('all').length > 0) {",
    replace: "if (categoriesInFilter('all').length > 0) {"
  },
  {
    group: '清单标签',
    name: '读数据时归档的清单还带着标签',
    file: 'app.js',
    find: 'const tagId = !archived && findListTag(entry.tagId) ? entry.tagId : null;',
    replace: 'const tagId = findListTag(entry.tagId) ? entry.tagId : null;'
  },
  {
    group: '清单标签',
    name: '清单页建的标签跑到打卡里去',
    file: 'app.js',
    find: '  add: (name) => addListTag(name),',
    replace: '  add: (name) => addLogTag(name),'
  },
  {
    group: '清单标签',
    name: '"不放进标签"一直显示',
    file: 'app.js',
    find: "    if (current) {\n      items.push({ text: '不放进标签'",
    replace: "    if (true) {\n      items.push({ text: '不放进标签'"
  },

  // ---------- 新建按钮、新建面板、防缩放 ----------
  {
    group: '新建按钮与防缩放',
    name: '打卡页没有 + 按钮',
    file: 'logs.js',
    find: "    view.appendChild(createFab('新增打卡', openLogItemDraft));\n",
    replace: ''
  },
  {
    group: '新建按钮与防缩放',
    name: '菜单开着时点 +，不先关菜单就直接开面板',
    file: 'app.js',
    find: '    if (closeMenuIfOpen()) return;\n    onClick();',
    replace: '    onClick();'
  },
  {
    group: '新建按钮与防缩放',
    name: '点面板卡片里面也会把面板关掉',
    file: 'app.js',
    find: 'if (event.target === overlay) options.onCancel();',
    replace: 'options.onCancel();'
  },
  {
    group: '新建按钮与防缩放',
    name: '列表底部不留空（最后一项被 + 按钮挡住）',
    file: 'app.js',
    find: "    view.classList.add('has-fab');    // 列表底部多留点空",
    replace: '    // 列表底部多留点空'
  },
  {
    group: '新建按钮与防缩放',
    name: '新建清单面板不默认选中当前标签',
    file: 'app.js',
    find: "  categoryDraft = { name: '', tagId: findListTag(listTagFilter) ? listTagFilter : null };",
    replace: "  categoryDraft = { name: '', tagId: null };"
  },
  {
    group: '新建按钮与防缩放',
    name: '新建清单面板里的标签选了就取消不掉',
    file: 'app.js',
    find: '      draft.tagId = draft.tagId === tagId ? null : tagId;',
    replace: '      draft.tagId = tagId;'
  },
  {
    group: '新建按钮与防缩放',
    name: '新建清单面板不记下打的名字（点标签就清空）',
    file: 'app.js',
    find: "  input.addEventListener('input', () => {\n    draft.name = input.value;\n  });",
    replace: ''
  },
  {
    group: '新建按钮与防缩放',
    name: '新建清单放进别的标签后不切回"所有"',
    file: 'app.js',
    find: "  if (listTagFilter !== 'all' && listTagFilter !== draft.tagId) {",
    replace: '  if (false) {'
  },
  {
    group: '新建按钮与防缩放',
    name: '重置时漏掉新建清单的面板',
    file: 'app.js',
    find: '  categoryDraft = null;\n  taskDraft = null;\n',
    replace: '  taskDraft = null;\n'
  },
  {
    group: '新建按钮与防缩放',
    name: '+ 按钮没有固定在屏幕上（跟着列表滚走）',
    file: 'style.css',
    find: '  .fab {\n    position: fixed;',
    replace: '  .fab {\n    position: absolute;'
  },
  {
    group: '新建按钮与防缩放',
    name: '+ 按钮放太低，被底部标签栏挡住',
    file: 'style.css',
    find: 'bottom: calc(72px + env(safe-area-inset-bottom));\n    z-index: 150;',
    replace: 'bottom: calc(16px + env(safe-area-inset-bottom));\n    z-index: 150;'
  },
  {
    group: '新建按钮与防缩放',
    name: '"撤销"提示没挪到 + 按钮上方',
    file: 'style.css',
    find: '  .has-fab ~ .undo-toast {\n    bottom: calc(140px + env(safe-area-inset-bottom));',
    replace: '  .has-fab ~ .undo-toast {\n    bottom: calc(76px + env(safe-area-inset-bottom));'
  },
  {
    group: '新建按钮与防缩放',
    name: '输入框字号小于 16px（iPhone 点进去会自动放大）',
    file: 'style.css',
    find: '    --text-input: 16px;',
    replace: '    --text-input: 15px;'
  },
  {
    group: '新建按钮与防缩放',
    name: '没关掉"连点两下放大"',
    file: 'style.css',
    find: '    touch-action: manipulation;',
    replace: '    touch-action: auto;'
  },
  {
    group: '新建按钮与防缩放',
    name: 'viewport 里没禁止缩放',
    file: 'index.html',
    find: 'maximum-scale=1, user-scalable=no, ',
    replace: ''
  },
  {
    group: '新建按钮与防缩放',
    name: '没拦 iPhone 的双指缩放手势',
    file: 'index.html',
    find: "  document.addEventListener('gesturestart', (event) => event.preventDefault());",
    replace: '  // （拦截被删掉了）'
  },

  // ---------- 清单页：一次展开一个、+ 新建任务、打字时收起底部 ----------
  {
    group: '清单页：展开、新建任务、打字',
    name: '点展开着的清单不会收起来',
    file: 'app.js',
    find: "  expandedCategory = expandedCategory === category ? null : category;",
    replace: "  expandedCategory = category;"
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '所有清单都展开（一次展开一个没生效）',
    file: 'app.js',
    find: "  return category !== expandedCategory;",
    replace: "  return false;"
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '迁移后不删老的折叠记录',
    file: 'app.js',
    find: "  storage.removeItem('collapsed');\n",
    replace: ""
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '迁移时不管老记录，总是展开第一个',
    file: 'app.js',
    find: "categories.find((category) => !oldCollapsed.includes(category)) || null",
    replace: "categories[0] || null"
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '记录里的清单不存在了还照样当成展开的',
    file: 'app.js',
    find: "    return categories.includes(name) ? name : null;",
    replace: "    return name;"
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '清单改名后就收起来了（没同步展开记录）',
    file: 'app.js',
    find: "  if (expandedCategory === oldName) expandedCategory = trimmed;\n",
    replace: ""
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '删掉展开着的清单后，展开记录还指着它',
    file: 'app.js',
    find: "  if (expandedCategory === category) expandedCategory = null;\n",
    replace: ""
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '收起来的清单没有放任务的地方（任务拖不进别的清单）',
    file: 'app.js',
    find: "    section.appendChild(dropZone);\n",
    replace: ""
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '新建的清单不自动展开',
    file: 'app.js',
    find: "  expandedCategory = trimmed;    // 新建的清单直接展开",
    replace: "  // 新建的清单直接展开"
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '新建任务不默认放进展开着的清单',
    file: 'app.js',
    find: "  if (shown.includes(expandedCategory)) return expandedCategory;\n",
    replace: ""
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '新建任务后不展开放进去的清单',
    file: 'app.js',
    find: "  expandedCategory = draft.category;\n  saveExpandedCategory();\n  if (!categoriesInFilter",
    replace: "  if (!categoriesInFilter"
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '新建任务放进筛选外的清单后不切回"所有"',
    file: 'app.js',
    find: "  if (!categoriesInFilter(listTagFilter).includes(draft.category)) {",
    replace: "  if (false) {"
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '新建任务面板不记下打的字（点清单就清空）',
    file: 'app.js',
    find: "  input.addEventListener('input', () => {\n    draft.text = input.value;\n  });",
    replace: ""
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '新建任务面板里能选归档的清单',
    file: 'app.js',
    find: "  categoriesInFilter('all').forEach((category) => {\n    const option",
    replace: "  categories.forEach((category) => {\n    const option"
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '没有能放任务的清单时也显示 +',
    file: 'app.js',
    find: "if (listTagFilter !== 'archived' && categoriesInFilter('all').length > 0) {",
    replace: "if (listTagFilter !== 'archived') {"
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '标签行右边的 ⋯ 里没有"新建清单"',
    file: 'app.js',
    find: "      { text: '新建清单', action: openCategoryDraft },",
    replace: "      { text: '', action: openCategoryDraft },"
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '光标进输入框时不加 typing',
    file: 'app.js',
    find: "document.addEventListener('focusin', (event) => syncTypingState(event.target));",
    replace: ""
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '失去焦点时看"焦点现在在哪"而不是"要去哪"（跳输入框时标签栏闪一下）',
    file: 'app.js',
    find: "document.addEventListener('focusout', (event) => syncTypingState(event.relatedTarget));",
    replace: "document.addEventListener('focusout', () => syncTypingState());"
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '重画后不再对一遍 typing（输入框没了，标签栏却一直藏着）',
    file: 'app.js',
    find: "  // 否则可能出现：输入框早没了，底部标签栏却一直藏着回不来\n  syncTypingState();",
    replace: "  // 否则可能出现：输入框早没了，底部标签栏却一直藏着回不来"
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '打字时藏标签栏的规则没限定在触屏上（电脑上打字标签栏也消失）',
    file: 'style.css',
    find: "  @media (hover: none) {\n    .typing .tab-bar,",
    replace: "  @media all {\n    .typing .tab-bar,"
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '打字时没藏 + 按钮',
    file: 'style.css',
    find: "    .typing .fab,\n",
    replace: ""
  },

  {
    group: '清单页：展开、新建任务、打字',
    name: '清单标题的"展开 / 收起"告诉读屏软件时标反了',
    file: 'app.js',
    find: "header.setAttribute('aria-expanded', String(!isCollapsed(category)));",
    replace: "header.setAttribute('aria-expanded', String(isCollapsed(category)));"
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '清单标题前面又出现了三角',
    file: 'app.js',
    find: "  header.setAttribute('role', 'button');\n",
    replace: "  header.setAttribute('role', 'button');\n  const arrow = document.createElement('span');\n  arrow.className = 'arrow';\n  arrow.textContent = isCollapsed(category) ? '▸' : '▾';\n  header.appendChild(arrow);\n"
  },

  {
    group: '清单页：展开、新建任务、打字',
    name: '按回车加完任务就收起（不能连续添加了）',
    file: 'app.js',
    find: "    taskDraft = newTaskDraft(draft.category);",
    replace: "    taskDraft = null;"
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '点"添加"按钮加完也不收起（点击事件被当成了"留着面板"）',
    file: 'app.js',
    find: "    onSubmit: () => submitTaskDraft(false),",
    replace: "    onSubmit: submitTaskDraft,"
  },
  {
    group: '清单页：展开、新建任务、打字',
    name: '清单底下又出现了"+ 添加任务"',
    file: 'app.js',
    find: "    section.appendChild(list);\n",
    replace: "    section.appendChild(list);\n    const addRow = document.createElement('div');\n    addRow.className = 'add-task';\n    addRow.textContent = '+ 添加任务';\n    section.appendChild(addRow);\n"
  },

  // ---------- 清单页、打卡页：上面固定、下面自己滚 ----------
  {
    group: '清单页、打卡页：上面固定、下面自己滚',
    name: '清单页的标签行放进了会滚的那块（跟着滚走）',
    file: 'app.js',
    find: "  top.appendChild(createTagBar(listTagSet, {",
    replace: "  body.appendChild(createTagBar(listTagSet, {"
  },
  {
    group: '清单页、打卡页：上面固定、下面自己滚',
    name: '打卡页的标题放进了会滚的那块',
    file: 'logs.js',
    find: "  top.appendChild(title);",
    replace: "  body.appendChild(title);"
  },
  {
    group: '清单页、打卡页：上面固定、下面自己滚',
    name: '拖到屏幕边上时还去滚整个网页（清单那块滚不动）',
    file: 'app.js',
    find: "  if (scroller) {\n    scroller.scrollTop += step;",
    replace: "  if (false) {\n    scroller.scrollTop += step;"
  },
  {
    group: '清单页、打卡页：上面固定、下面自己滚',
    name: '页面没钉在屏幕上（整个网页一起滚，标签行跟着走）',
    file: 'style.css',
    find: "  .page {\n    position: fixed;",
    replace: "  .page {\n    position: static;"
  },
  {
    group: '清单页、打卡页：上面固定、下面自己滚',
    name: '滚动条没藏（电脑、安卓）',
    file: 'style.css',
    find: "    scrollbar-width: none;             /* 藏滚动条（电脑、安卓） */",
    replace: "    scrollbar-width: auto;"
  },
  {
    group: '清单页、打卡页：上面固定、下面自己滚',
    name: '滚动条没藏（iPhone）',
    file: 'style.css',
    find: "  .page-scroll::-webkit-scrollbar {\n    display: none;",
    replace: "  .page-scroll::-webkit-scrollbar {\n    display: block;"
  },
  {
    group: '清单页、打卡页：上面固定、下面自己滚',
    name: '有 + 按钮的页面，列表底部没多留空（最后一项被挡住）',
    file: 'style.css',
    find: "    padding-bottom: calc(80px + 72px + env(safe-area-inset-bottom));",
    replace: "    padding-bottom: calc(80px + env(safe-area-inset-bottom));"
  },

  {
    group: '清单页、打卡页：上面固定、下面自己滚',
    name: '手机上顶部留白的规则没生效（标签行上面空一大块）',
    file: 'style.css',
    find: "  @media (max-width: 600px) {\n    .page {\n      padding-top: max(var(--space-6), env(safe-area-inset-top));",
    replace: "  @media (max-width: 600px) {\n    .page-never {\n      padding-top: max(var(--space-6), env(safe-area-inset-top));"
  },

  {
    group: '清单页、打卡页：上面固定、下面自己滚',
    name: '新建面板的遮罩又盖到了状态栏（关掉后顶上留一条灰）',
    file: 'style.css',
    find: "    top: env(safe-area-inset-top);\n    right: 0;",
    replace: "    top: 0;\n    right: 0;"
  },
  {
    group: '清单页、打卡页：上面固定、下面自己滚',
    name: '固定的页面没有底色（状态栏可能停在灰色上）',
    file: 'style.css',
    find: "    background: var(--surface);\n    top: 0;",
    replace: "    top: 0;"
  },

  // ---------- 详情页：清单标签 + 闹钟；今天页不放置顶 ----------
  {
    group: '详情页：清单标签 + 闹钟；今天页不放置顶',
    name: '详情页卡片里又出现了置顶按钮',
    file: 'app.js',
    find: "    card.appendChild(title);\n    // 详情页不放置顶按钮",
    replace: "    card.appendChild(title);\n    card.appendChild(createPinButton(index));\n    // 详情页不放置顶按钮"
  },
  {
    group: '详情页：清单标签 + 闹钟；今天页不放置顶',
    name: '闹钟设了时间也不变红',
    file: 'app.js',
    find: "btn.className = dueAt ? 'due-btn has-due' : 'due-btn';",
    replace: "btn.className = 'due-btn';"
  },
  {
    group: '详情页：清单标签 + 闹钟；今天页不放置顶',
    name: '闹钟旁边不写时间',
    file: 'app.js',
    find: "    btn.appendChild(time);\n",
    replace: ""
  },
  {
    group: '详情页：清单标签 + 闹钟；今天页不放置顶',
    name: '提醒没合进闹钟（读屏软件听不到提醒方式）',
    file: 'app.js',
    find: "const label = `截止 ${formatDateTime(dueAt)}，${remindLabel(remindBefore)}`;",
    replace: "const label = `截止 ${formatDateTime(dueAt)}`;"
  },
  {
    group: '详情页：清单标签 + 闹钟；今天页不放置顶',
    name: '再点一次闹钟不收起编辑区',
    file: 'app.js',
    find: "editingDueFor = editingDueFor === index ? null : index;",
    replace: "editingDueFor = index;"
  },
  {
    group: '详情页：清单标签 + 闹钟；今天页不放置顶',
    name: '闹钟的"今天 / 明天"按 UTC 日期算（晚上的时间会算错天）',
    file: 'app.js',
    find: "new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()",
    replace: "new Date(isoText.slice(0, 10)).getTime()"
  },
  {
    group: '详情页：清单标签 + 闹钟；今天页不放置顶',
    name: '不是今年的时间不带年份',
    file: 'app.js',
    find: "return sameYear ? `${date} ${time}` : `${due.getFullYear()}年${date} ${time}`;",
    replace: "return `${date} ${time}`;"
  },
  {
    group: '详情页：清单标签 + 闹钟；今天页不放置顶',
    name: '清单标签不是虚线框',
    file: 'style.css',
    find: "    border: 1px dashed var(--border);",
    replace: "    border: 1px solid var(--border);"
  },
  {
    group: '详情页：清单标签 + 闹钟；今天页不放置顶',
    name: '闹钟设了时间，图标还是灰的',
    file: 'style.css',
    find: "  .due-btn.has-due .due-icon {\n    color: var(--danger);",
    replace: "  .due-btn.has-due .due-icon {\n    color: var(--text-faint);"
  },

  // ---------- 新建任务面板：闹钟、不写"放进清单" ----------
  {
    group: '新建任务面板：闹钟、不写"放进清单"',
    name: '新建任务面板又显示"放进清单"几个字',
    file: 'app.js',
    find: "  const body = [input, picker];",
    replace: "  const label = document.createElement('div');\n  label.className = 'popup-label';\n  label.textContent = '放进清单';\n  const body = [input, label, picker];"
  },
  {
    group: '新建任务面板：闹钟、不写"放进清单"',
    name: '新建任务面板里没有闹钟',
    file: 'app.js',
    find: "  picker.appendChild(createDueButton(draft.dueAt, draft.remindBefore, () => {",
    replace: "  (createDueButton(draft.dueAt, draft.remindBefore, () => {"
  },
  {
    group: '新建任务面板：闹钟、不写"放进清单"',
    name: '面板里设的时间没带到新任务上',
    file: 'app.js',
    find: "addTodo(draft.category, draft.text, { dueAt: draft.dueAt, remindBefore: draft.remindBefore });",
    replace: "addTodo(draft.category, draft.text);"
  },
  {
    group: '新建任务面板：闹钟、不写"放进清单"',
    name: '新建时"准时提醒"（0）被当成没设提醒',
    file: 'app.js',
    find: "remindBefore: dueAt && due.remindBefore !== undefined ? due.remindBefore : null,",
    replace: "remindBefore: dueAt && due.remindBefore ? due.remindBefore : null,"
  },
  {
    group: '新建任务面板：闹钟、不写"放进清单"',
    name: '面板里保存时间后设置区不收起',
    file: 'app.js',
    find: "        draft.remindBefore = parsed.remindBefore;\n        draft.editingDue = false;",
    replace: "        draft.remindBefore = parsed.remindBefore;"
  },
  {
    group: '新建任务面板：闹钟、不写"放进清单"',
    name: '面板里设了提醒不申请通知权限',
    file: 'app.js',
    find: "        if (parsed.remindBefore !== null) ensureNotifyPermission();\n",
    replace: ""
  },
  {
    group: '新建任务面板：闹钟、不写"放进清单"',
    name: '回车连续添加时，下一条带着上一条的时间',
    file: 'app.js',
    find: "    taskDraft = newTaskDraft(draft.category);",
    replace: "    taskDraft = Object.assign(newTaskDraft(draft.category), { dueAt: draft.dueAt, remindBefore: draft.remindBefore });"
  },
  {
    group: '新建任务面板：闹钟、不写"放进清单"',
    name: '面板里点"清除"没清掉时间',
    file: 'app.js',
    find: "        draft.dueAt = null;\n        draft.remindBefore = null;",
    replace: "        draft.remindBefore = null;"
  },
  {
    group: '新建任务面板：闹钟、不写"放进清单"',
    name: '选中的清单不是蓝底',
    file: 'style.css',
    find: "  .tag-option.selected {\n    color: var(--surface);\n    background: var(--accent);",
    replace: "  .tag-option.selected {\n    color: var(--surface);\n    background: var(--surface);"
  },

  {
    group: '新建任务面板：闹钟、不写"放进清单"',
    name: '清单那一排贴着输入框（中间没留空）',
    file: 'style.css',
    find: "  .popup-card .add-input + .tag-picker {\n    margin-top: var(--space-3);",
    replace: "  .popup-card .add-input + .tag-picker {\n    margin-top: 0;"
  },

  // ---------- 空清单提示；新建面板都不写小标题 ----------
  {
    group: '空清单提示；新建面板都不写小标题',
    name: '新建清单面板又显示"放到标签"',
    file: 'app.js',
    find: "    body: [input, picker],     // 不写\"放到标签\"",
    replace: "    body: [input, Object.assign(document.createElement('div'), { className: 'popup-label', textContent: '放到标签' }), picker],     // 不写\"放到标签\""
  },
  {
    group: '空清单提示；新建面板都不写小标题',
    name: '新增打卡面板又显示"标签"两个字',
    file: 'logs.js',
    find: "    body: [input, picker],     // 不写\"标签\"两个字",
    replace: "    body: [input, Object.assign(document.createElement('div'), { className: 'popup-label', textContent: '标签' }), picker],     // 不写\"标签\"两个字"
  },
  {
    group: '空清单提示；新建面板都不写小标题',
    name: '展开的空清单下面没有提示（分不清展开没展开）',
    file: 'app.js',
    find: "      section.appendChild(createEmptyListHint(category));\n",
    replace: ""
  },
  {
    group: '空清单提示；新建面板都不写小标题',
    name: '只剩已完成任务的清单也说"还没有内容"',
    file: 'app.js',
    find: "    if (items.length === 0) {\n      section.appendChild(createEmptyListHint(category));",
    replace: "    if (items.filter((item) => item.todo.status === 'active').length === 0) {\n      section.appendChild(createEmptyListHint(category));"
  },
  {
    group: '空清单提示；新建面板都不写小标题',
    name: '点空清单的提示不弹新建任务面板',
    file: 'app.js',
    find: "    openTaskDraft();\n  });\n  return hint;",
    replace: "  });\n  return hint;"
  },
  {
    group: '空清单提示；新建面板都不写小标题',
    name: '菜单开着时点空清单提示，也顺手弹了面板',
    file: 'app.js',
    find: "    if (closeMenuIfOpen()) return;\n    openTaskDraft();",
    replace: "    closeMenuIfOpen();\n    openTaskDraft();"
  },
  {
    group: '空清单提示；新建面板都不写小标题',
    name: '归档的空清单也说"点击添加"',
    file: 'app.js',
    find: "  if (isCategoryArchived(category)) {\n    hint.textContent = '该清单内还没有内容';",
    replace: "  if (false) {\n    hint.textContent = '该清单内还没有内容';"
  },

  // ---------- 手指滑动：右滑返回、左右滑切换标签 ----------
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '详情页往左滑也返回（方向反了也算）',
    file: 'app.js',
    find: "canLock: (dx) => dx > 0,",
    replace: "canLock: (dx) => dx !== 0,"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '不比横竖哪边走得多（斜着、上下滑也算）',
    file: 'app.js',
    find: "const mine = Math.abs(dx) > Math.abs(dy) && !draggingItem && options.canLock(dx);",
    replace: "const mine = !draggingItem && options.canLock(dx);"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '方向定了还会改（先往左再往右也算）',
    file: 'app.js',
    find: "      if (state === 'deciding') {",
    replace: "      if (state !== 'mine') {"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '长按拖任务时左右晃也切换标签',
    file: 'app.js',
    find: "const mine = Math.abs(dx) > Math.abs(dy) && !draggingItem && options.canLock(dx);",
    replace: "const mine = Math.abs(dx) > Math.abs(dy) && options.canLock(dx);"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '鼠标拖也算手势',
    file: 'app.js',
    find: "if (event.pointerType !== 'touch' || !options.canStart(event)) return;",
    replace: "if (!options.canStart(event)) return;"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '滑动时不拦页面滚动',
    file: 'app.js',
    find: "if (state === 'mine') touchEvent.preventDefault();",
    replace: "if (false) touchEvent.preventDefault();"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '被系统打断（pointercancel）也算数',
    file: 'app.js',
    find: "options.onRelease(distance, endEvent.type === 'pointerup' && (far || fast));",
    replace: "options.onRelease(distance, far || fast);"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '快速一甩不算，只认滑得远',
    file: 'app.js',
    find: "const fast = endEvent.timeStamp - startTime <= FLING_TIME && Math.abs(distance) >= FLING_DISTANCE;",
    replace: "const fast = false;"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '"甩"不看时间（慢慢滑一小段也算）',
    file: 'app.js',
    find: "const fast = endEvent.timeStamp - startTime <= FLING_TIME && Math.abs(distance) >= FLING_DISTANCE;",
    replace: "const fast = Math.abs(distance) >= FLING_DISTANCE;"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '"甩"不看距离（手指抖一下也算）',
    file: 'app.js',
    find: "const fast = endEvent.timeStamp - startTime <= FLING_TIME && Math.abs(distance) >= FLING_DISTANCE;",
    replace: "const fast = endEvent.timeStamp - startTime <= FLING_TIME;"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '详情页滑得不够，松手不弹回',
    file: 'app.js',
    find: "    const page = appEl.querySelector('.detail-page');\n    if (page) springBack(page);\n",
    replace: ""
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '详情页不跟着手指走',
    file: 'app.js',
    find: "    page.style.transform = `translateX(${dx}px)`;\n",
    replace: ""
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '打字时（键盘开着）也能滑',
    file: 'app.js',
    find: "  return !isTextField(document.activeElement) && openMenuKey === null;",
    replace: "  return openMenuKey === null;"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '菜单开着也能滑',
    file: 'app.js',
    find: "  return !isTextField(document.activeElement) && openMenuKey === null;",
    replace: "  return !isTextField(document.activeElement);"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '按在输入框里也能滑',
    file: 'app.js',
    find: "  if (event.target.closest && event.target.closest('input, textarea, select')) return false;\n",
    replace: ""
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '右滑返回只认详情页元素，按在下面空白处滑不动',
    file: 'app.js',
    find: "if (!appEl || !appEl.isConnected || detailPageBack() === null) return false;",
    replace: "if (!appEl || !appEl.contains(event.target) || detailPageBack() === null) return false;"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '详情页往下翻过之后就返回不了了',
    file: 'app.js',
    find: "    if (!appEl || !appEl.isConnected || detailPageBack() === null) return false;\n",
    replace: "    if (!appEl || !appEl.isConnected || detailPageBack() === null) return false;\n    if (window.scrollY > 0) return false;\n"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '打卡详情页右滑时关的是任务详情',
    file: 'app.js',
    find: "  if (logDetailId !== null) return closeLogDetail;",
    replace: "  if (logDetailId !== null) return closeTaskDetail;"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '清单页没接上左右滑',
    file: 'app.js',
    find: "  enableTagSwipe(body, listTagSet);",
    replace: "  // enableTagSwipe(body, listTagSet);"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '清单页左右滑改的是打卡页的标签',
    file: 'app.js',
    find: "  enableTagSwipe(body, listTagSet);",
    replace: "  enableTagSwipe(body, logTagSet);"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '打卡页没接上左右滑',
    file: 'logs.js',
    find: "  enableTagSwipe(body, logTagSet);",
    replace: "  // enableTagSwipe(body, logTagSet);"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '左右滑方向反了',
    file: 'tags.js',
    find: "+ (dx < 0 ? 1 : -1);",
    replace: "+ (dx < 0 ? -1 : 1);"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '到头了绕回另一头',
    file: 'tags.js',
    find: "  return index >= 0 && index < order.length ? order[index] : null;",
    replace: "  return order[(index + order.length) % order.length];"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '左右滑的顺序和顶部不一样（已归档排在前面）',
    file: 'tags.js',
    find: "  return ['all', ...set.tags().map((tag) => tag.id), 'archived'];",
    replace: "  return ['all', 'archived', ...set.tags().map((tag) => tag.id)];"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '到头了没有橡皮筋，和能翻过去时一样挪',
    file: 'tags.js',
    find: "=== null ? 0.15 : 0.5;",
    replace: "=== null ? 0.5 : 0.5;"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '列表没滑够，松手不弹回',
    file: 'tags.js',
    find: "        springBack(scroller);\n        return;",
    replace: "        return;"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '换了标签不收起"改名 / 删除"',
    file: 'tags.js',
    find: "      managingTagId = null;\n      renamingTagId = null;\n      render();\n      showSwipedIn(dx);",
    replace: "      render();\n      showSwipedIn(dx);"
  },
  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '换到的标签不挪进看得见的地方',
    file: 'tags.js',
    find: "    bar.scrollLeft += (chipRect.left + chipRect.width / 2) - (barRect.left + barRect.width / 2);\n",
    replace: ""
  },

  {
    group: '手指滑动：右滑返回、左右滑切换标签',
    name: '网页横向没夹住（右滑返回时整页能跟着横着拖）',
    file: 'style.css',
    find: "    overflow-x: clip;",
    replace: "    overflow-x: visible;"
  },

  // ---------- 装成应用：提醒交给系统、导出导入 ----------
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '交给系统之后自己又弹一遍（打开应用就是一串重复通知）',
    file: 'app.js',
    find: "const shown = reminderScheduler !== null || notifier.show('待办提醒', {",
    replace: "const shown = notifier.show('待办提醒', {"
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '过了点的提醒也交给系统（排一个过去的闹钟）',
    file: 'app.js',
    find: "      && new Date(todo.dueAt).getTime() - todo.remindBefore * 60 * 1000 > now\n",
    replace: ""
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '交给系统的时间没算提前量（说好提前半小时，到点才响）',
    file: 'app.js',
    find: "      fireAt: new Date(new Date(todo.dueAt).getTime() - todo.remindBefore * 60 * 1000).toISOString(),",
    replace: "      fireAt: new Date(new Date(todo.dueAt).getTime()).toISOString(),"
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '单子不按时间排（超过 60 条时留下的就不是最近的）',
    file: 'app.js',
    find: "    .sort((a, b) => a.fireAt.localeCompare(b.fireAt))\n",
    replace: ""
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '已经提醒过的又交一遍',
    file: 'app.js',
    find: "      && !todo.reminded\n",
    replace: ""
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '做完、放弃的任务还在提醒',
    file: 'app.js',
    find: "      && todo.status === 'active'\n",
    replace: ""
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '归档清单里的任务还在提醒',
    file: 'app.js',
    find: "      && !isCategoryArchived(todo.category)\n",
    replace: ""
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '不限 60 条（iOS 只收 64 条，多的会被丢掉）',
    file: 'app.js',
    find: "    .slice(0, MAX_SCHEDULED_REMINDERS);",
    replace: ";"
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '每次重画都让系统把通知全撤了重排',
    file: 'app.js',
    find: "  if (text === lastRemindersJson) return;\n",
    replace: ""
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '换了一份数据不重新交单子（系统那边早撤空了）',
    file: 'app.js',
    find: "  lastRemindersJson = null;  // 换了一份数据，下次重画要重新交一张单子\n",
    replace: ""
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '重画完不对提醒单子（改完时间不告诉系统）',
    file: 'app.js',
    find: "  syncReminders();\n}",
    replace: "}"
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '导出不带附件（图片视频全丢）',
    file: 'app.js',
    find: "    files: files.filter((file) => file !== null)",
    replace: "    files: []"
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '导出不写版本号',
    file: 'app.js',
    find: "    version: EXPORT_VERSION,\n",
    replace: ""
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '导出的附件内容没去掉前缀（导回来是坏的）',
    file: 'app.js',
    find: "    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');",
    replace: "    reader.onload = () => resolve(String(reader.result));"
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '导出名单漏掉打卡项目',
    file: 'app.js',
    find: "const EXPORTED_KEYS = ['categories', 'todos', 'expandedCategory', 'listTags', 'categoryMeta', 'logTags', 'logItems', 'calendarView'];",
    replace: "const EXPORTED_KEYS = ['categories', 'todos', 'expandedCategory', 'listTags', 'categoryMeta', 'logTags', 'calendarView'];"
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '导出的文件名不带日期（备份多了分不清）',
    file: 'app.js',
    find: "  return `待办清单-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;",
    replace: "  return '待办清单.json';"
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '导入不挡别的应用的文件',
    file: 'app.js',
    find: "  if (!parsed || parsed.app !== 'todolist') {",
    replace: "  if (false) {"
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '导入不挡更新版本导出的文件',
    file: 'app.js',
    find: "  if (parsed.version > EXPORT_VERSION) {",
    replace: "  if (false) {"
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '导入时文件里没有的数据不清掉（旧数据留着冒充）',
    file: 'app.js',
    find: "    } else {\n      storage.removeItem(key);\n    }",
    replace: "    }"
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '导入完不把数据读进内存',
    file: 'app.js',
    find: "      reloadFromStorage();\n      render();",
    replace: "      render();"
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '导入完不重画（界面还是旧的）',
    file: 'app.js',
    find: "      reloadFromStorage();\n      render();",
    replace: "      reloadFromStorage();"
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '导入前不问一句就覆盖',
    file: 'app.js',
    find: "  if (!confirmFn('导入会用文件里的数据替换掉现在的全部内容（包括打卡记录），确定吗？')) {",
    replace: "  if (false) {"
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '用户在选文件时点了取消，还是照样导入',
    file: 'app.js',
    find: "      if (text === null || text === undefined) return;   // 用户点了取消\n",
    replace: ""
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '菜单里没有导出 / 导入',
    file: 'app.js',
    find: "      { text: '导出数据', action: startExport },\n      { text: '导入数据', action: startImport }\n",
    replace: "\n"
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '导出 / 导入之后界面上没有任何回音',
    file: 'app.js',
    find: "  if (dataNotice) {\n    const notice = document.createElement('div');",
    replace: "  if (false) {\n    const notice = document.createElement('div');"
  },

  // ---------- 外壳桥接（native.js）----------
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '在普通浏览器里也去找外壳的信箱（网页版直接坏掉）',
    file: 'native.js',
    find: "  if (!bridge) return false;        // 在普通浏览器里打开，照常走网页那一套",
    replace: "  if (false) return false;"
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '提醒消息的 type 写错（外壳收到了也不知道要干什么）',
    file: 'native.js',
    find: "    replaceAll: (list) => bridge.postMessage({ type: 'reminders', list: list })",
    replace: "    replaceAll: (list) => bridge.postMessage({ type: 'reminder', list: list })"
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '提醒单子是空的交过去（外壳把通知全撤了、不再排）',
    file: 'native.js',
    find: "    replaceAll: (list) => bridge.postMessage({ type: 'reminders', list: list })",
    replace: "    replaceAll: (list) => bridge.postMessage({ type: 'reminders', list: [] })"
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '导出没把文件名带给外壳',
    file: 'native.js',
    find: "  useFileSaver((filename, text) => bridge.postMessage({ type: 'export', filename: filename, text: text }));",
    replace: "  useFileSaver((filename, text) => bridge.postMessage({ type: 'export', filename: '', text: text }));"
  },
  {
    group: '装成应用：提醒交给系统、导出导入',
    name: '导入用完不摘掉回调（下次选的文件被上次那份接走）',
    file: 'native.js',
    find: "      window.nativeFileChosen = null;    // 一次性的，用完就摘掉，免得下次被旧的接走\n",
    replace: ""
  },

  // ---------- 日历页：月 / 周 / 日 ----------
  {
    group: '日历页：月 / 周 / 日',
    name: '有任务的日子不标小圆点（又变回一片空白）',
    file: 'calendar.js',
    find: "      if (marked[key]) cell.appendChild(createTaskDot());\n",
    replace: ""
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '做完、放弃的任务也算在日历上',
    file: 'calendar.js',
    find: "      todo.status === 'active' && todo.dueAt && !isCategoryArchived(todo.category)",
    replace: "      todo.dueAt && !isCategoryArchived(todo.category)"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '归档清单里的任务也算在日历上',
    file: 'calendar.js',
    find: "      todo.status === 'active' && todo.dueAt && !isCategoryArchived(todo.category)",
    replace: "      todo.status === 'active' && todo.dueAt"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '一天之内不按时间先后排',
    file: 'calendar.js',
    find: "    .sort((a, b) => a.todo.dueAt.localeCompare(b.todo.dueAt));   // 一天之内按几点排\n",
    replace: "\n"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '点某一天不换（下面列的还是原来那天）',
    file: 'calendar.js',
    find: "    onPick: (key) => {\n      if (closeMenuIfOpen()) return;\n      calendarDay = key;\n      render();\n    },",
    replace: "    onPick: (key) => {\n      if (closeMenuIfOpen()) return;\n      render();\n    },"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '看哪天都把过期任务列出来',
    file: 'calendar.js',
    find: "  const overdue = calendarDay === todayKey ? overdueTasks() : [];",
    replace: "  const overdue = overdueTasks();"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '过期的任务一条都不列（翻不到就忘了）',
    file: 'calendar.js',
    find: "  const overdue = calendarDay === todayKey ? overdueTasks() : [];",
    replace: "  const overdue = [];"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '翻月份时选中的日子不跟着走',
    file: 'calendar.js',
    find: "      calendarDay = month === monthKey(todayKey) ? todayKey : `${month}-01`;\n",
    replace: ""
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '翻回本月时不回到今天',
    file: 'calendar.js',
    find: "      calendarDay = month === monthKey(todayKey) ? todayKey : `${month}-01`;",
    replace: "      calendarDay = `${month}-01`;"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '周视图翻页只翻一天',
    file: 'calendar.js',
    find: "    calendarDay = shiftDays(calendarDay, 7);",
    replace: "    calendarDay = shiftDays(calendarDay, 1);"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '周视图不是周一开头',
    file: 'calendar.js',
    find: "  return (new Date(year, month - 1, day).getDay() + 6) % 7;",
    replace: "  return new Date(year, month - 1, day).getDay();"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '日视图翻页一下翻一周',
    file: 'calendar.js',
    find: "    calendarDay = shiftDays(calendarDay, 1);\n    render();\n  }));\n\n  return box;\n}\n\nfunction createTaskDot()",
    replace: "    calendarDay = shiftDays(calendarDay, 7);\n    render();\n  }));\n\n  return box;\n}\n\nfunction createTaskDot()"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '换了视图不存起来（下次打开又变回月视图）',
    file: 'calendar.js',
    find: "      saveCalendarView();     // 记住，下次打开还是这个\n",
    replace: ""
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '存了不认识的视图名字时不退回月视图',
    file: 'calendar.js',
    find: "  return CALENDAR_VIEWS.some((view) => view.key === value) ? value : 'month';",
    replace: "  return value;"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '重开应用后还停在上次看的那天，不回到今天',
    file: 'calendar.js',
    find: "  calendarDay = null;         // 下次画的时候会补成今天",
    replace: "  // calendarDay 不重置"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '日期字符串又丢回 new Date（时区一偏就差一天）',
    file: 'calendar.js',
    find: "  if (isDateKey(value)) return value;\n",
    replace: ""
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '月历不标今天',
    file: 'calendar.js',
    find: "    if (key === todayKey) cell.classList.add('today');\n    if (key === selected) cell.classList.add('selected');",
    replace: "    if (key === selected) cell.classList.add('selected');"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '月历不高亮选中的那天',
    file: 'calendar.js',
    find: "    if (key === todayKey) cell.classList.add('today');\n    if (key === selected) cell.classList.add('selected');",
    replace: "    if (key === todayKey) cell.classList.add('today');"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '周视图不高亮选中的那天',
    file: 'calendar.js',
    find: "    if (key === calendarDay) cell.classList.add('selected');\n",
    replace: ""
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '视图切换按钮不显示当前选的是哪个',
    file: 'calendar.js',
    find: "    btn.className = key === calendarView ? 'view-switch-btn active' : 'view-switch-btn';",
    replace: "    btn.className = 'view-switch-btn';"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '日历页的任务又能拖动排序了',
    file: 'calendar.js',
    find: "    const li = createTodoItem(todo, index, { draggable: false, pinnable: false });",
    replace: "    const li = createTodoItem(todo, index, { draggable: true, pinnable: false });"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '日历页的任务又带上了置顶按钮',
    file: 'calendar.js',
    find: "    const li = createTodoItem(todo, index, { draggable: false, pinnable: false });",
    replace: "    const li = createTodoItem(todo, index, { draggable: false, pinnable: true });"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '这天没有任务时什么都不说',
    file: 'calendar.js',
    find: "    body.appendChild(empty);\n  }\n\n  return view;\n}",
    replace: "  }\n\n  return view;\n}"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '一条带截止时间的任务都没有时，不告诉用户该怎么办',
    file: 'calendar.js',
    find: "    if (plannedTasks().length === 0) {\n      empty.textContent = '还没有设了截止时间的任务。给任务设置截止时间后，它们会出现在这里。';\n    } else {",
    replace: "    if (false) {\n      empty.textContent = '';\n    } else {"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '日历页的任务不标出属于哪个清单、几点到期',
    file: 'calendar.js',
    find: "    li.insertBefore(meta, li.querySelector('.pin-btn') || li.querySelector('.menu-anchor'));\n",
    replace: ""
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '日历跟着任务列表一起滚走了（顶部就该固定）',
    file: 'calendar.js',
    find: "  top.appendChild(createViewSwitch());\n  top.appendChild(createCalendarBlock());",
    replace: "  body.appendChild(createViewSwitch());\n  body.appendChild(createCalendarBlock());"
  },
  {
    group: '日历页：月 / 周 / 日',
    name: '视图选择不跟着导出走（换手机就丢）',
    file: 'app.js',
    find: "const EXPORTED_KEYS = ['categories', 'todos', 'expandedCategory', 'listTags', 'categoryMeta', 'logTags', 'logItems', 'calendarView'];",
    replace: "const EXPORTED_KEYS = ['categories', 'todos', 'expandedCategory', 'listTags', 'categoryMeta', 'logTags', 'logItems'];"
  },

  // ---------- 测试工具自己 ----------
  {
    group: '测试工具',
    name: 'assertEqual 不再拦"比较两个页面元素"',
    file: 'tools/test-runner.js',
    find: 'if (isPageNode(actual) && isPageNode(expected)) {',
    replace: 'if (false) {'
  },
  {
    group: '测试工具',
    name: '变异工具用 String.replace 改代码（$ 会被展开）',
    file: 'tools/mutate-runner.js',
    find: 'code: source.slice(0, at) + replace + source.slice(at + find.length)',
    replace: 'code: source.replace(find, replace)'
  },
  {
    group: '测试工具',
    name: '变异工具不管 find 出现几处都照改',
    file: 'tools/mutate-runner.js',
    find: 'if (count !== 1) return { ok: false, count: count, code: null };',
    replace: 'if (count === 0) return { ok: false, count: count, code: null };'
  },
  {
    group: '测试工具',
    name: '变异工具生成脚本地址时不补 //（?t= 会变成语法错误）',
    file: 'tools/mutate-runner.js',
    find: "encodeURIComponent(code + '\\n//')",
    replace: 'encodeURIComponent(code)'
  },
  {
    group: '测试工具',
    name: '变异工具把 tools/ 下的脚本路径认错',
    file: 'tools/mutate-runner.js',
    find: ": 'tools/' + script;",
    replace: ': script;'
  },
  {
    group: '测试工具',
    name: '变异工具改 style.css 这类文件时，测试读到的还是原文件',
    file: 'tools/mutate-runner.js',
    find: 'if (url.pathname === mutantPath) return',
    replace: 'if (false) return'
  },
  {
    group: '测试工具',
    name: '变异工具不转义 <（改的内容里有 </script> 就把拦截器截断）',
    file: 'tools/mutate-runner.js',
    find: "JSON.stringify(code).replace(/</g, '\\\\u003c')",
    replace: 'JSON.stringify(code)'
  },
  {
    group: '测试工具',
    name: '变异工具把"加载失败"当成"没抓到"',
    file: 'tools/mutate-runner.js',
    find: " || run.summary.includes('加载失败')) return 'broken';",
    replace: ") return 'broken';"
  }
];
