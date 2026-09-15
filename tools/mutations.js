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
    name: '"今天"页不排除归档清单的任务',
    file: 'app.js',
    find: '    if (isCategoryArchived(todo.category)) return;   // 归档了的清单暂时不用，别来打扰\n',
    replace: ''
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
    find: "    items: [{ text: '新建清单', action: openCategoryDraft }]",
    replace: "    items: []"
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
    find: "    taskDraft = { text: '', category: draft.category };   // 还放进同一个清单",
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
    name: '今天页的标题放进了会滚的那块',
    file: 'app.js',
    find: "  title.textContent = '今天';\n  top.appendChild(title);",
    replace: "  title.textContent = '今天';\n  body.appendChild(title);"
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
    name: '今天页的任务又带上了置顶按钮',
    file: 'app.js',
    find: "{ draggable: false, pinnable: false }",
    replace: "{ draggable: false }"
  },
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

  // ---------- 手指滑动：下拉返回、左右滑切换标签 ----------
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '详情页往下翻过了，往下拉也返回',
    file: 'app.js',
    find: "    if (window.scrollY > 0) return false;\n",
    replace: ""
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '详情页往上滑也返回',
    file: 'app.js',
    find: "canLock: (dy) => dy > 0,",
    replace: "canLock: (dy) => dy !== 0,"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '不比横竖哪边走得多（斜着、横着拉也算下拉）',
    file: 'app.js',
    find: "const mine = Math.abs(along) > Math.abs(across) && !draggingItem && options.canLock(along);",
    replace: "const mine = !draggingItem && options.canLock(along);"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '方向定了还会改（先往上再往下也算）',
    file: 'app.js',
    find: "      if (state === 'deciding') {",
    replace: "      if (state !== 'mine') {"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '长按拖任务时左右晃也切换标签',
    file: 'app.js',
    find: "const mine = Math.abs(along) > Math.abs(across) && !draggingItem && options.canLock(along);",
    replace: "const mine = Math.abs(along) > Math.abs(across) && options.canLock(along);"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '鼠标拖也算手势',
    file: 'app.js',
    find: "if (event.pointerType !== 'touch' || !options.canStart(event)) return;",
    replace: "if (!options.canStart(event)) return;"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '滑动时不拦页面滚动',
    file: 'app.js',
    find: "if (state === 'mine') touchEvent.preventDefault();",
    replace: "if (false) touchEvent.preventDefault();"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '被系统打断（pointercancel）也算数',
    file: 'app.js',
    find: "options.onRelease(distance, endEvent.type === 'pointerup' && (far || fast));",
    replace: "options.onRelease(distance, far || fast);"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '快速一甩不算，只认滑得远',
    file: 'app.js',
    find: "const fast = endEvent.timeStamp - startTime <= FLING_TIME && Math.abs(distance) >= FLING_DISTANCE;",
    replace: "const fast = false;"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '"甩"不看时间（慢慢滑一小段也算）',
    file: 'app.js',
    find: "const fast = endEvent.timeStamp - startTime <= FLING_TIME && Math.abs(distance) >= FLING_DISTANCE;",
    replace: "const fast = Math.abs(distance) >= FLING_DISTANCE;"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '"甩"不看距离（手指抖一下也算）',
    file: 'app.js',
    find: "const fast = endEvent.timeStamp - startTime <= FLING_TIME && Math.abs(distance) >= FLING_DISTANCE;",
    replace: "const fast = endEvent.timeStamp - startTime <= FLING_TIME;"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '详情页拉得不够，松手不弹回',
    file: 'app.js',
    find: "    const page = appEl.querySelector('.detail-page');\n    if (page) springBack(page);\n",
    replace: ""
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '详情页不跟着手指走',
    file: 'app.js',
    find: "    page.style.transform = `translateY(${dy}px)`;\n",
    replace: ""
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '打字时（键盘开着）也能滑',
    file: 'app.js',
    find: "  return !isTextField(document.activeElement) && openMenuKey === null;",
    replace: "  return openMenuKey === null;"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '菜单开着也能滑',
    file: 'app.js',
    find: "  return !isTextField(document.activeElement) && openMenuKey === null;",
    replace: "  return !isTextField(document.activeElement);"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '按在输入框里也能滑',
    file: 'app.js',
    find: "  if (event.target.closest && event.target.closest('input, textarea, select')) return false;\n",
    replace: ""
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '下拉返回只认详情页元素，按在下面空白处拉不动',
    file: 'app.js',
    find: "if (!appEl || !appEl.isConnected || detailPageBack() === null) return false;",
    replace: "if (!appEl || !appEl.contains(event.target) || detailPageBack() === null) return false;"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '列表页往下拉也被拦（列表往上翻不动）',
    file: 'app.js',
    find: "if (!appEl || !appEl.isConnected || detailPageBack() === null) return false;",
    replace: "if (!appEl || !appEl.isConnected) return false;"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '打卡详情页下拉时关的是任务详情',
    file: 'app.js',
    find: "  if (logDetailId !== null) return closeLogDetail;",
    replace: "  if (logDetailId !== null) return closeTaskDetail;"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '清单页没接上左右滑',
    file: 'app.js',
    find: "  enableTagSwipe(body, listTagSet);",
    replace: "  // enableTagSwipe(body, listTagSet);"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '清单页左右滑改的是打卡页的标签',
    file: 'app.js',
    find: "  enableTagSwipe(body, listTagSet);",
    replace: "  enableTagSwipe(body, logTagSet);"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '打卡页没接上左右滑',
    file: 'logs.js',
    find: "  enableTagSwipe(body, logTagSet);",
    replace: "  // enableTagSwipe(body, logTagSet);"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '左右滑方向反了',
    file: 'tags.js',
    find: "+ (dx < 0 ? 1 : -1);",
    replace: "+ (dx < 0 ? -1 : 1);"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '到头了绕回另一头',
    file: 'tags.js',
    find: "  return index >= 0 && index < order.length ? order[index] : null;",
    replace: "  return order[(index + order.length) % order.length];"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '左右滑的顺序和顶部不一样（已归档排在前面）',
    file: 'tags.js',
    find: "  return ['all', ...set.tags().map((tag) => tag.id), 'archived'];",
    replace: "  return ['all', 'archived', ...set.tags().map((tag) => tag.id)];"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '到头了没有橡皮筋，和能翻过去时一样挪',
    file: 'tags.js',
    find: "=== null ? 0.15 : 0.5;",
    replace: "=== null ? 0.5 : 0.5;"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '列表没滑够，松手不弹回',
    file: 'tags.js',
    find: "        springBack(scroller);\n        return;",
    replace: "        return;"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '换了标签不收起"改名 / 删除"',
    file: 'tags.js',
    find: "      managingTagId = null;\n      renamingTagId = null;\n      render();\n      showSwipedIn(dx);",
    replace: "      render();\n      showSwipedIn(dx);"
  },
  {
    group: '手指滑动：下拉返回、左右滑切换标签',
    name: '换到的标签不挪进看得见的地方',
    file: 'tags.js',
    find: "    bar.scrollLeft += (chipRect.left + chipRect.width / 2) - (barRect.left + barRect.width / 2);\n",
    replace: ""
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
