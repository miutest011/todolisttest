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
    find: '  setCategoryMeta(category, null, true);\n  if (addingTaskIn',
    replace: '  setCategoryMeta(category, categoryTagOf(category), true);\n  if (addingTaskIn'
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
    name: '"已归档"下也显示新建清单',
    file: 'app.js',
    find: "if (listTagFilter !== 'archived') {\n    view.classList.add('has-fab');",
    replace: "if (true) {\n    view.classList.add('has-fab');"
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
    find: '  addingTaskIn = null;\n  categoryDraft = null;\n',
    replace: '  addingTaskIn = null;\n'
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
