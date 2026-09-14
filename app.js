// 待办清单的全部逻辑。
// 页面（index.html）和测试（tools/test.html）都加载这个文件。

// ---- 可替换的外部依赖 ----
// 正常运行时用浏览器真实的 localStorage 和 confirm；
// 跑测试时会换成假的，这样测试不会动到你的真实数据、也不会真的弹窗。
let storage = window.localStorage;
let confirmFn = (message) => window.confirm(message);
let appEl = null;

// "现在几点"也做成可替换的：测试时可以把时间冻在某一刻，
// 才能精确验证"提醒该不该响"
let nowFn = () => new Date();

// 系统通知。浏览器不支持或者用户没授权时安全地什么都不做，
// show() 返回有没有真的弹出来
let notifier = {
  permission: () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission),
  request: () => (typeof Notification === 'undefined' ? undefined : Notification.requestPermission()),
  show: (title, options) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
    new Notification(title, options);
    return true;
  }
};

// 附件仓库。localStorage 只能存文字、总共才 5MB 左右，放不下图片视频，
// 所以附件的内容单独存进 IndexedDB（浏览器自带的本地数据库，能直接存文件）。
// 任务本身只记住附件的 id 和文件名，内容按 id 去这里取。
function createIndexedDbBlobStore(dbName) {
  let dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('files');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return dbPromise;
  }

  function run(mode, action) {
    return open().then((db) => new Promise((resolve, reject) => {
      const request = action(db.transaction('files', mode).objectStore('files'));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
  }

  return {
    save: (id, blob) => run('readwrite', (store) => store.put(blob, id)),
    load: (id) => run('readonly', (store) => store.get(id)),
    remove: (id) => run('readwrite', (store) => store.delete(id))
  };
}

let blobStore = createIndexedDbBlobStore('todolist-files');

function useStorage(newStorage) {
  storage = newStorage;
}

function useBlobStore(newStore) {
  blobStore = newStore;
}

function useConfirm(newConfirm) {
  confirmFn = newConfirm;
}

function useNow(newNow) {
  nowFn = newNow;
}

function useNotifier(newNotifier) {
  notifier = newNotifier;
}

// 提醒的可选项。minutes 表示提前多少分钟，null 表示不提醒
const REMIND_OPTIONS = [
  { label: '不提醒', minutes: null },
  { label: '准时提醒', minutes: 0 },
  { label: '提前 5 分钟', minutes: 5 },
  { label: '提前 30 分钟', minutes: 30 },
  { label: '提前 1 小时', minutes: 60 },
  { label: '提前 1 天', minutes: 1440 }
];

// 第一次打开时默认有这两个清单，之后用户可以自己加
const DEFAULT_CATEGORIES = ['工作', '生活'];

// ---- 所有会变化的状态都放在这里，界面完全由它们决定 ----
let categories = [];        // 清单名字的数组
let todos = [];             // 每一项是 { text, done, category }
let collapsed = [];         // 当前被折叠起来的清单名字
let listTags = [];          // 清单页自己的标签 [{ id, name }]，和打卡的标签互不相干
// 每个清单放在哪个标签下、有没有归档：{ '工作': { tagId: 'ltag-…', archived: false } }
// 标签像文件夹，一个清单最多放在一个标签下。归档了的清单不在任何标签下。
// 只记"有标签或已归档"的清单，没记的就是默认值（不在标签下、没归档）。
// 注意这里是按清单名字记的（和任务、折叠状态一样），所以清单改名时要跟着改
let categoryMeta = {};
let addingTaskIn = null;    // 正在哪个清单里输入新任务
let addingCategory = false; // 是否正在输入新清单的名字
let editingTaskIndex = null;// 正在重命名的任务（它在 todos 里的位置）
let editingCategory = null; // 正在重命名的清单名字
let openMenuKey = null;     // 哪个三点菜单是展开的，例如 'task-2'、'category-工作'
let detailIndex = null;     // 正在看哪条任务的详情页（null = 看列表页）
let editingDueFor = null;   // 正在给哪条任务设置截止时间
let attachmentError = null; // 附件保存失败时的提示文字
let expandedGroups = [];    // 哪些"已完成/已放弃"分组是展开的，只记在内存里
let currentTab = 'tasks';   // 底部标签栏当前在哪一页：tasks（清单）/ today（今天）/ logs（打卡）
let suppressNextClick = false;  // 拖动结束后紧跟着的那一次点击要忽略掉
let listTagFilter = 'all';  // 清单页顶部选中了哪个：'all'（所有）/ 'archived'（已归档）/ 某个标签的 id

// 把"临时"的界面状态清空（数据状态不动）
function resetViewState() {
  addingTaskIn = null;
  addingCategory = false;
  editingTaskIndex = null;
  editingCategory = null;
  openMenuKey = null;
  detailIndex = null;
  editingDueFor = null;
  attachmentError = null;
  expandedGroups = [];
  currentTab = 'tasks';      // 每次打开都从"清单"页开始
  suppressNextClick = false; // 万一上一次拖拽没正常收尾，别把下一次点击也吞掉
  listTagFilter = 'all';     // 清单页每次打开都从"所有"开始
  resetTagViewState();       // 标签输入框、长按管理条（在 tags.js 里，两页共用）
  resetLogViewState();       // 打卡模块自己的界面状态（在 logs.js 里）
}

// 启动：把应用挂到某个页面元素上，读出数据，画出来
function initApp(element) {
  appEl = element;
  resetViewState();
  categories = loadCategories();
  todos = loadTodos();
  collapsed = loadCollapsed();
  listTags = loadListTags();   // 先读标签：读清单归属时要对照它，把已经不存在的标签去掉
  categoryMeta = loadCategoryMeta();
  logTags = loadLogTags();     // 同理，打卡也是先读标签再读项目
  logItems = loadLogItems();
  render();
}

// ---- 读写存储 ----
function loadCategories() {
  const saved = storage.getItem('categories');
  return saved ? JSON.parse(saved) : [...DEFAULT_CATEGORIES];
}

function saveCategories() {
  storage.setItem('categories', JSON.stringify(categories));
}

function loadTodos() {
  const saved = storage.getItem('todos');
  const parsed = saved ? JSON.parse(saved) : [];

  parsed.forEach((todo) => {
    // 老数据可能没有 category 字段，放进第一个清单
    if (!todo.category) {
      todo.category = categories[0];
    }
    // 任务的分类如果不在清单列表里，补一个清单，免得任务看不见
    if (!categories.includes(todo.category)) {
      categories.push(todo.category);
      saveCategories();
    }
    // 加时间功能之前存的老任务没有这几个字段，补上默认值，
    // 否则详情页读到 undefined 会出问题
    // 任务状态从"完成/未完成"两态改成了三态（未完成 / 已完成 / 已放弃）。
    // 用一个 status 字段而不是再加一个 abandoned 布尔值，
    // 是为了让"既完成又放弃"这种自相矛盾的状态根本没法出现
    if (!('status' in todo)) {
      todo.status = todo.done ? 'done' : 'active';
    }
    delete todo.done;      // 老字段清掉，免得两个地方都记状态、以后对不上

    if (!('createdAt' in todo)) todo.createdAt = null;
    if (!('dueAt' in todo)) todo.dueAt = null;
    if (!('remindBefore' in todo)) todo.remindBefore = null;
    if (!('reminded' in todo)) todo.reminded = false;
    if (!('note' in todo)) todo.note = '';
    if (!('attachments' in todo)) todo.attachments = [];
    if (!('pinned' in todo)) todo.pinned = false;
  });

  return parsed;
}

function saveTodos() {
  storage.setItem('todos', JSON.stringify(todos));
}

function loadCollapsed() {
  const saved = storage.getItem('collapsed');
  return saved ? JSON.parse(saved) : [];
}

function saveCollapsed() {
  storage.setItem('collapsed', JSON.stringify(collapsed));
}

function loadListTags() {
  const saved = storage.getItem('listTags');
  return saved ? JSON.parse(saved) : [];
}

function saveListTags() {
  storage.setItem('listTags', JSON.stringify(listTags));
}

// 读"清单放在哪个标签下、有没有归档"时顺手把数据理干净：
// 已经不存在的清单去掉；指向不存在的标签的去掉；已归档的不该还在标签下。
// 要对照清单列表和标签列表，所以必须排在读这两样之后
function loadCategoryMeta() {
  const saved = storage.getItem('categoryMeta');
  const parsed = saved ? JSON.parse(saved) : {};
  const meta = {};

  categories.forEach((category) => {
    const entry = parsed[category];
    if (!entry) return;
    const archived = entry.archived === true;
    const tagId = !archived && findListTag(entry.tagId) ? entry.tagId : null;
    if (archived || tagId) meta[category] = { tagId: tagId, archived: archived };
  });

  return meta;
}

function saveCategoryMeta() {
  storage.setItem('categoryMeta', JSON.stringify(categoryMeta));
}

// ---- 时间相关的小工具 ----
// 存进 localStorage 的时间统一用 ISO 格式的字符串（例如 '2026-09-09T09:20:00.000Z'），
// 它带时区信息，不会因为换台电脑就错乱

// 显示用：2026-09-09 17:20
function formatDateTime(isoText) {
  if (!isoText) return '';
  const date = new Date(isoText);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
         ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 给 <input type="datetime-local"> 用的格式：2026-09-09T17:20（本地时间，没有时区）
function toDateTimeInputValue(isoText) {
  if (!isoText) return '';
  const date = new Date(isoText);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
         `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 把提醒设置翻译成人话
function remindLabel(minutes) {
  const option = REMIND_OPTIONS.find((item) => item.minutes === minutes);
  return option ? option.label : '不提醒';
}

// ---- 画界面 ----
// 任何操作都只做两件事：改上面的状态变量 → 调用 render()
// 给附件预览生成的临时链接。每次重画前要释放掉，否则文件会一直占着内存
let objectUrls = [];

function releaseObjectUrls() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
}

function render() {
  if (!appEl) return;
  releaseObjectUrls();
  appEl.innerHTML = '';

  // 详情页是"盖在上面"的一层，这时不显示底部标签栏，
  // 靠"← 返回"退回来，导航层级更清楚
  if (detailIndex !== null) {
    appEl.appendChild(createDetailPage(detailIndex));
  } else if (logDetailId !== null) {
    appEl.appendChild(createLogDetailPage(logDetailId));
  } else {
    const views = { tasks: createTasksView, today: createTodayView, logs: createLogsView };
    appEl.appendChild((views[currentTab] || createTasksView)());
    appEl.appendChild(createTabBar());
  }

  // 刚打完卡时的"撤销"提示，浮在最上层
  if (undoToast) {
    appEl.appendChild(createUndoToast());
  }

  // 页面重画会让输入框消失，画完之后要把光标重新放回去。
  // 同时有好几个输入框时，标了 data-autofocus 的优先（比如新增打卡时正在输新标签名）
  const focusEl = appEl.querySelector('[data-autofocus]') || appEl.querySelector('.add-input, .edit-input');
  if (focusEl) {
    focusEl.focus();
    if (focusEl.classList.contains('edit-input')) {
      focusEl.select();
    }
  }
}

// ---- 拖拽排序 ----
// 用指针事件（pointerdown / pointermove / pointerup）自己实现，
// 因为浏览器自带的 HTML5 拖拽在手机上完全不工作。
//
// 手感上仿的是 iPhone 桌面挪 App 的感觉：
//   手机上按住不放约半秒 → 这一块"浮起来"跟着手指走；
//   电脑上按住鼠标挪动一点就开始拖，不用等。
// 浮起来的其实是一个副本（ghost），原来那块留在原地变淡当占位，
// 拖到哪里就把占位插到哪里，松手时把页面顺序写回数据。

let longPressDelay = 450;        // 触屏上按住多久开始拖动
const MOVE_THRESHOLD = 8;        // 移动超过这么多像素就不算"按住不动"了
const EDGE_SIZE = 70;            // 拖到离屏幕边缘这么近时自动滚动
const EDGE_SPEED = 12;

function useLongPressDelay(ms) {  // 测试时改成 0，免得每条测试都要等半秒
  longPressDelay = ms;
}

// 清单里任务的显示顺序：置顶的在最上面，然后是没做完的，
// 已完成和已放弃的收进各自的折叠分组，排在最后。
// 列表渲染和拖拽算落点都用这一个函数，免得两边规则不一致导致拖动错位
function displayOrderKey(todo) {
  if (todo.status === 'done') return 2;
  if (todo.status === 'abandoned') return 3;
  return todo.pinned ? 0 : 1;
}

function compareForDisplay(a, b) {
  return displayOrderKey(a) - displayOrderKey(b);
}

// 找出应该插到哪个元素前面：第一个"中线在指针下方"的元素。
// 都不满足就返回 null，表示放到最后
function findDropTarget(container, pointerY, dragging) {
  const items = [...container.children].filter((el) => el !== dragging);
  return items.find((el) => {
    const rect = el.getBoundingClientRect();
    return pointerY < rect.top + rect.height / 2;
  }) || null;
}

// 拖到屏幕上下边缘时自动滚动，否则长列表根本拖不到远处
function autoScroll(pointerY) {
  if (pointerY < EDGE_SIZE) {
    window.scrollBy(0, -EDGE_SPEED);
  } else if (pointerY > window.innerHeight - EDGE_SIZE) {
    window.scrollBy(0, EDGE_SPEED);
  }
}

// handle: 按在哪个元素上才开始拖
// findContainer(x, y): 指针当前落在哪个容器上（任务能拖到别的清单，所以要动态找）
// onDrop(): 松手时把页面顺序写回数据
// movedElement: 实际被搬动的元素。不传就等于 handle 自己。
//   清单是"按住标题栏、搬动整个区块"，所以这两个不是同一个元素
function makeDraggable(handle, findContainer, onDrop, movedElement) {
  const item = movedElement || handle;

  handle.addEventListener('pointerdown', (event) => {
    // 按在勾选框、置顶、菜单这些控件上时不启动拖动，它们有自己的事情要做
    if (event.target.closest('button, input, textarea, select, .checkbox')) return;
    if (event.button > 0) return;   // 只响应左键

    const startX = event.clientX;
    const startY = event.clientY;
    const isTouch = event.pointerType === 'touch';

    let dragging = false;
    let ghost = null;
    let timer = null;

    function beginDrag() {
      timer = null;
      dragging = true;

      // 复制一份浮在最上层，跟着手指走；原来那块留在原地变淡，充当占位
      const rect = item.getBoundingClientRect();
      ghost = item.cloneNode(true);
      ghost.classList.add('drag-ghost');
      ghost.style.width = rect.width + 'px';
      ghost.style.left = rect.left + 'px';
      ghost.style.top = rect.top + 'px';
      document.body.appendChild(ghost);

      item.classList.add('drag-source');
    }

    function cancelLongPress() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    }

    // 手机上按住不放才开始拖；电脑上不用等
    if (isTouch) {
      timer = setTimeout(beginDrag, longPressDelay);
    }

    function onPointerMove(moveEvent) {
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);

      if (!dragging) {
        if (isTouch) {
          // 长按还没到就滑动了，说明用户是想滚页面，别抢
          if (distance > MOVE_THRESHOLD) cancelLongPress();
          return;
        }
        if (distance <= MOVE_THRESHOLD) return;
        // 鼠标不用等长按：动一下就开始拖，并且这一次移动也要立刻算数，
        // 不然会白白浪费第一次移动，手感上就是"迟钝一下才跟上"
        beginDrag();
      }

      // 只跟着上下走。左右锁住，竖排列表这样更稳
      ghost.style.transform = `translateY(${moveEvent.clientY - startY}px) scale(1.03)`;
      autoScroll(moveEvent.clientY);

      const container = findContainer(moveEvent.clientX, moveEvent.clientY) || item.parentNode;
      const target = findDropTarget(container, moveEvent.clientY, item);
      // insertBefore 的第二个参数是 null 时就是追加到末尾，正好合用
      container.insertBefore(item, target);
    }

    // 拖动过程中要拦住页面滚动。
    // 这个监听必须写成 passive: false，否则浏览器不许我们拦
    function onTouchMove(touchEvent) {
      if (dragging) touchEvent.preventDefault();
    }

    function onPointerUp() {
      cancelLongPress();
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      document.removeEventListener('touchmove', onTouchMove);

      if (!dragging) return;      // 只是点了一下，交给点击事件去处理

      ghost.remove();
      item.classList.remove('drag-source');
      // 刚拖完，紧接着会来一个 click 事件，要拦掉，否则会误进详情页
      suppressNextClick = true;
      onDrop();
    }

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
  });
}

function shouldIgnoreClick() {
  if (!suppressNextClick) return false;
  suppressNextClick = false;
  return true;
}

// 指针停在哪个清单的任务区上（把整块区域都算进去，这样拖进空清单也容易对准）。
// 只看纵向位置：任务是竖着排的，拖动时指针很容易偏到卡片左右外面去，
// 要求横向也对准的话会经常判不中
function findTaskContainerAt(x, y) {
  const sections = [...appEl.querySelectorAll('.category')];
  const hit = sections.find((section) => {
    const rect = section.getBoundingClientRect();
    return y >= rect.top && y <= rect.bottom;
  });
  // 折叠起来的清单没有任务列表，不能往里放
  return hit ? hit.querySelector('ul') : null;
}

// 松手后：读出这条任务现在在页面上的位置，写回数据
function commitTodoDrag(item) {
  const list = item.parentNode;
  const section = list.closest('.category');
  if (!section) return;

  moveTodoToPosition(
    Number(item.dataset.index),
    section.dataset.category,
    [...list.children].indexOf(item)
  );
}

// 松手后：按页面上的顺序重排清单。
// 筛选状态下页面上只有一部分清单，要先把它们的新顺序拼回完整列表
function commitCategoryDrag() {
  const container = appEl.querySelector('#category-list');
  const visibleNames = [...container.children].map((section) => section.dataset.category);
  applyCategoryOrder(mergeVisibleCategoryOrder(visibleNames));
}

// ---- 底部标签栏 ----
const TABS = [
  { key: 'tasks', label: '清单', icon: 'list' },
  { key: 'today', label: '今天', icon: 'calendar' },
  { key: 'logs', label: '打卡', icon: 'checkCircle' }
];

function createTabBar() {
  const bar = document.createElement('nav');
  bar.className = 'tab-bar';

  TABS.forEach((tab) => {
    const btn = document.createElement('button');
    btn.className = currentTab === tab.key ? 'tab active' : 'tab';
    btn.dataset.tab = tab.key;
    btn.addEventListener('click', () => {
      if (closeMenuIfOpen()) return;
      currentTab = tab.key;
      // 标签的输入框和长按管理条是两页共用的状态，换页时收起，别带到另一页去
      resetTagViewState();
      render();
    });

    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = tab.label;

    btn.append(createIcon(tab.icon, 'tab-icon'), label);
    bar.appendChild(btn);
  });

  return bar;
}

// ---- "清单"标签页：原来的整个页面 ----
// 这一页不放大标题：点进 App 之前就知道这是待办清单了，
// 再写一遍"我的待办清单"只是白占地方
function createTasksView() {
  const view = document.createElement('div');

  // 选中的标签万一已经不在了，退回"所有"，别停在一个看不见的筛选上
  if (listTagFilter !== 'all' && listTagFilter !== 'archived' && !findListTag(listTagFilter)) {
    listTagFilter = 'all';
  }

  // 顶部标签行（和打卡页共用，在 tags.js 里）
  view.appendChild(createTagBar(listTagSet));

  const shown = categoriesInFilter(listTagFilter);
  const message = listEmptyMessage(shown);
  if (message) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = message;
    view.appendChild(empty);
  }

  // 清单单独放一个容器里，拖拽排序时要靠它来算位置
  const categoryList = document.createElement('div');
  categoryList.id = 'category-list';
  shown.forEach((category) => {
    categoryList.appendChild(createCategorySection(category));
  });

  view.appendChild(categoryList);
  // "已归档"下面不给新建入口：新建的清单不是归档状态，建完会立刻从这一页消失
  if (listTagFilter !== 'archived') {
    view.appendChild(createNewCategoryRow());
  }
  return view;
}

// 筛选后一个清单都没有时说什么。一个清单都没建过的新用户不用提示，下面就是"+ 新建清单"
function listEmptyMessage(shown) {
  if (shown.length > 0) return '';
  if (listTagFilter === 'archived') {
    return '还没有归档的清单。暂时不用的清单，可以在它的 ⋯ 菜单里归档。';
  }
  if (listTagFilter === 'all') {
    return categories.length > 0 ? '没有正在用的清单，归档了的在「已归档」里。' : '';
  }
  return '这个标签下还没有清单。停在这里新建清单，或者在清单的 ⋯ 菜单里放进来。';
}

// ---- "今天"标签页 ----
// 把所有清单里今天到期和已经过期的任务汇总到一起。
// 不需要新的数据结构，就是对现有的 dueAt 做一次筛选
function startOfToday() {
  const now = nowFn();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function createTodayView() {
  const view = document.createElement('div');
  view.className = 'today-view';

  const dayStart = startOfToday();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;   // 明天零点

  const overdue = [];
  const today = [];

  todos.forEach((todo, index) => {
    if (todo.status !== 'active') return;   // 做完的和放弃的不用再操心
    if (!todo.dueAt) return;                // 没设截止时间的不算"今天要做"
    if (isCategoryArchived(todo.category)) return;   // 归档了的清单暂时不用，别来打扰

    const due = new Date(todo.dueAt).getTime();
    if (due < dayStart) {
      overdue.push({ todo: todo, index: index });
    } else if (due < dayEnd) {
      today.push({ todo: todo, index: index });
    }
  });

  // "今天"页保留标题：它说明的是"你正在看哪一页"，不是 App 名字
  const title = document.createElement('h1');
  title.textContent = '今天';
  view.appendChild(title);

  const date = document.createElement('div');
  date.className = 'view-subtitle';
  date.textContent = formatDate(nowFn());
  view.appendChild(date);

  if (overdue.length === 0 && today.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '今天没有到期的任务。给任务设置截止时间后，它们会出现在这里。';
    view.appendChild(empty);
    return view;
  }

  if (overdue.length > 0) {
    view.appendChild(createTodaySection('已过期', overdue, 'overdue'));
  }
  if (today.length > 0) {
    view.appendChild(createTodaySection('今天到期', today, ''));
  }

  return view;
}

function createTodaySection(label, items, extraClass) {
  const box = document.createElement('section');
  box.className = 'today-section';

  const header = document.createElement('div');
  header.className = extraClass ? 'today-section-title ' + extraClass : 'today-section-title';
  header.textContent = `${label} ${items.length}`;
  box.appendChild(header);

  const list = document.createElement('ul');
  items.forEach((item) => {
    // 这一页的任务来自不同清单，所以关掉拖拽（这里没有"顺序"可言），
    // 并且额外标出它属于哪个清单
    const li = createTodoItem(item.todo, item.index, { draggable: false });

    const meta = document.createElement('span');
    meta.className = 'todo-meta';
    meta.textContent = item.todo.category + ' · ' + formatDateTime(item.todo.dueAt).slice(11);
    li.insertBefore(meta, li.querySelector('.pin-btn') || li.querySelector('.menu-anchor'));

    list.appendChild(li);
  });
  box.appendChild(list);

  return box;
}

function formatDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${weekdays[date.getDay()]}`;
}

// 一个清单区块：标题栏 + 任务列表 + "添加任务"那一行
function createCategorySection(category) {
  const section = document.createElement('section');
  section.className = 'category';
  section.dataset.category = category;    // 拖拽时靠它认出这是哪个清单
  section.appendChild(createCategoryHeader(category, section));

  // 折叠状态下就不画下面的内容了
  if (!collapsed.includes(category)) {
    // 先挑出这个清单里的任务，记住它们在 todos 里的真实位置
    const items = [];
    todos.forEach((todo, index) => {
      if (todo.category === category) {
        items.push({ todo: todo, index: index });
      }
    });

    // 置顶的在上。sort 是稳定的，所以同一档之间保持原有顺序
    items.sort((a, b) => compareForDisplay(a.todo, b.todo));

    // 没做完的直接铺在清单里，做完的和放弃的各自收进折叠分组，
    // 这样清单再长也不会被历史记录撑爆
    const list = document.createElement('ul');
    items
      .filter((item) => item.todo.status === 'active')
      .forEach((item) => list.appendChild(createTodoItem(item.todo, item.index)));

    section.appendChild(list);
    section.appendChild(createAddTaskRow(category));
    section.appendChild(createSubGroup(category, 'done', '已完成',
      items.filter((item) => item.todo.status === 'done')));
    section.appendChild(createSubGroup(category, 'abandoned', '已放弃',
      items.filter((item) => item.todo.status === 'abandoned')));
  }

  return section;
}

// "已完成 / 已放弃"这样的折叠分组。一条都没有时不显示。
// 展开状态只记在内存里，不存起来 —— 每次打开默认收起，
// 因为这个分组本来就是为了让清单看起来短
function createSubGroup(category, kind, label, items) {
  const box = document.createElement('div');
  if (items.length === 0) return box;

  box.className = 'sub-group';

  const key = category + '/' + kind;
  const expanded = expandedGroups.includes(key);

  const header = document.createElement('div');
  header.className = 'sub-group-header';
  header.addEventListener('click', () => {
    if (shouldIgnoreClick()) return;
    if (closeMenuIfOpen()) return;
    expandedGroups = expanded
      ? expandedGroups.filter((name) => name !== key)
      : expandedGroups.concat(key);
    render();
  });

  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.textContent = expanded ? '▾' : '▸';

  const title = document.createElement('span');
  title.className = 'sub-group-title';
  title.textContent = `${label} ${items.length}`;

  header.append(arrow, title);
  box.appendChild(header);

  if (expanded) {
    const list = document.createElement('ul');
    items.forEach((item) => list.appendChild(createTodoItem(item.todo, item.index)));
    box.appendChild(list);
  }

  return box;
}

// 清单标题栏：点名字改名，点其它地方折叠/展开，右边是三点菜单
// section 是这个标题栏所属的清单区块 —— 拖动时移动的是整块，不是光一个标题栏
function createCategoryHeader(category, section) {
  const header = document.createElement('div');
  header.className = 'category-header';
  // 点标题栏任何地方（名字也算）都是折叠/展开。改名走 ⋯ 菜单
  header.addEventListener('click', () => {
    if (shouldIgnoreClick()) return;
    if (closeMenuIfOpen()) return;
    toggleCollapse(category);
  });

  // 按住标题栏就能拖动整个清单
  makeDraggable(
    header,
    () => appEl.querySelector('#category-list'),
    commitCategoryDrag,
    section
  );

  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.textContent = collapsed.includes(category) ? '▸' : '▾';
  header.appendChild(arrow);

  if (editingCategory === category) {
    header.appendChild(createRenameInput(
      category,
      (newName) => {
        renameCategory(category, newName);
        editingCategory = null;
        render();
      },
      () => {
        editingCategory = null;
        render();
      }
    ));
    return header;
  }

  const name = document.createElement('span');
  name.className = 'category-name';
  name.textContent = category;
  // 这里不再拦点击：让它冒泡到标题栏，统一是折叠/展开。改名走 ⋯ 菜单

  // 标题上的数字只数还要做的，已完成和已放弃的都不算
  const remaining = todos.filter(
    (todo) => todo.category === category && todo.status === 'active'
  ).length;
  const count = document.createElement('span');
  count.className = 'category-count';
  count.textContent = remaining > 0 ? remaining : '';

  header.append(name, count, createCategoryMenu(category));
  return header;
}

// 一条任务：勾选框 + 文字 + 三点菜单，点空白处进详情页
function createTodoItem(todo, index, options = {}) {
  const li = document.createElement('li');
  li.className = 'todo-item';
  li.dataset.index = index;      // 拖拽松手时靠它认出这是哪一条任务
  if (todo.status !== 'active') {
    li.classList.add(todo.status);     // done 或 abandoned
  }
  // 点这一行的任何地方（文字也算）都是进详情页。
  // 改名放在详情页和 ⋯ 菜单里 —— 一行里塞两个功能，手机上必然误触
  li.addEventListener('click', () => {
    if (shouldIgnoreClick()) return;
    if (closeMenuIfOpen()) return;
    detailIndex = index;
    render();
  });

  // 整行都能拖，不用去够某个小手柄。
  // "今天"那一页的任务来自不同清单，排序无从谈起，所以在那里关掉拖拽
  if (options.draggable !== false) {
    makeDraggable(li, findTaskContainerAt, () => commitTodoDrag(li));
  }

  const checkbox = createCheckbox(todo, index);

  if (editingTaskIndex === index) {
    li.append(checkbox, createRenameInput(
      todo.text,
      (newText) => {
        renameTodo(index, newText);
        editingTaskIndex = null;
        render();
      },
      () => {
        editingTaskIndex = null;
        render();
      }
    ));
    return li;
  }

  const textSpan = document.createElement('span');
  textSpan.className = 'todo-text';
  textSpan.textContent = todo.text;
  // 这里不再拦点击：让它冒泡到整行，统一进详情页

  li.append(checkbox, textSpan);
  // 已完成和已放弃的都收在分组里，置顶按钮对它们没有意义，就不显示了
  if (todo.status === 'active') {
    li.appendChild(createPinButton(index));
  }
  li.appendChild(createTodoMenu(index));
  return li;
}

// 置顶按钮，放在三个点前面。已置顶时常亮，没置顶时鼠标移上去才显现。
// 用文字箭头而不是 emoji：emoji 在手机上是彩色的，跟这套灰白界面不搭
function createPinButton(index) {
  const todo = todos[index];
  const btn = document.createElement('button');
  btn.className = todo.pinned ? 'pin-btn pinned' : 'pin-btn';
  btn.appendChild(createIcon('arrowUp', 'btn-icon'));
  btn.title = todo.pinned ? '取消置顶' : '置顶';
  btn.addEventListener('click', (event) => {
    event.stopPropagation();     // 不要进详情页
    togglePin(index);
  });
  return btn;
}

// ---- 图标 ----
// 用 SVG 画，不用文字符号（✓ ✕ ↑）。
// 文字符号的位置随字体基线浮动，只能用 top: -4px 这种负数硬凑，
// 换个设备就又歪了 —— SVG 是画出来的，配合 flex 居中永远是正的。
//
// 下面这些线条画法（24×24 画布、圆头圆角、只描边不填充）是 Feather / Lucide
// 这类免费图标库的通用规格，想换别的图标，去它们网站复制一段 path 贴进来就行
const ICON_PATHS = {
  check: 'M20 6L9 17l-5-5',
  cross: 'M18 6L6 18M6 6l12 12',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  chevronLeft: 'M15 18l-6-6 6-6',
  calendar: 'M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM16 2v4M8 2v4M3 10h18',
  checkCircle: 'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3',
  // 手写风格的圈：起笔和收笔故意错开一点、椭圆也不对称，看起来像笔圈出来的。
  // 打卡月历用它圈出打过卡的日子
  handCircle: 'M15.5 3.2 C9.5 1.9 3.6 5.6 3.1 11 C2.6 16.3 7.4 21 13.2 21 C18.6 21 22.6 17.2 22.1 12.2 C21.6 7.4 17.5 3.8 12.4 3.6 C10.9 3.55 9.4 3.8 8 4.4'
};

function createIcon(name, className) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');   // 跟着 CSS 的 color 走
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', className);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICON_PATHS[name]);
  svg.appendChild(path);

  return svg;
}

function createCheckbox(todo, index) {
  const checkbox = document.createElement('span');
  checkbox.className = 'checkbox';
  // 已完成显示灰色的勾，已放弃显示灰色的叉
  if (todo.status !== 'active') {
    checkbox.classList.add(todo.status);
    checkbox.appendChild(createIcon(todo.status === 'done' ? 'check' : 'cross', 'box-icon'));
  }
  checkbox.addEventListener('click', (event) => {
    event.stopPropagation();       // 不要进详情页
    toggleTodo(index);
  });
  return checkbox;
}

// 没在输入时是一行灰色的"+ 添加任务"，点了之后变成输入框
function createAddTaskRow(category) {
  if (addingTaskIn !== category) {
    const row = document.createElement('div');
    row.className = 'add-task';
    row.textContent = '+ 添加任务';
    row.addEventListener('click', () => {
      if (closeMenuIfOpen()) return;
      addingTaskIn = category;
      render();
    });
    return row;
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'add-input';
  input.placeholder = '输入任务，回车添加';

  // render() 会把输入框删掉重画，删除时浏览器也会触发一次 blur，
  // 这个开关用来区分"用户点到别处了"和"是我们自己重画导致的"
  let skipBlur = false;

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      skipBlur = true;
      // 加成功了就保持输入框打开，方便连续添加；空着按回车就结束添加
      if (!addTodo(category, input.value)) {
        addingTaskIn = null;
        render();
      }
    } else if (event.key === 'Escape') {
      skipBlur = true;
      addingTaskIn = null;
      render();
    }
  });

  input.addEventListener('blur', () => {
    if (skipBlur) return;
    addingTaskIn = null;
    render();
  });

  return input;
}

// 底部的"+ 新建清单"，点了之后同样变成输入框
function createNewCategoryRow() {
  if (!addingCategory) {
    const btn = document.createElement('button');
    btn.id = 'new-category-btn';
    btn.textContent = '+ 新建清单';
    btn.addEventListener('click', () => {
      if (closeMenuIfOpen()) return;
      addingCategory = true;
      render();
    });
    return btn;
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'add-input';
  input.placeholder = '清单名称，回车创建';

  let skipBlur = false;

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      skipBlur = true;
      // 停在某个标签下新建的，直接放进这个标签。名字为空或重名时内部会忽略
      addCategory(input.value, findListTag(listTagFilter) ? listTagFilter : null);
      addingCategory = false;
      render();
    } else if (event.key === 'Escape') {
      skipBlur = true;
      addingCategory = false;
      render();
    }
  });

  input.addEventListener('blur', () => {
    if (skipBlur) return;
    addingCategory = false;
    render();
  });

  return input;
}

// 重命名用的输入框：回车保存、Esc 取消、点到别处也算保存。清单和任务共用。
// finished 保证只结束一次：回车结束后页面会重画、输入框被删掉，
// 浏览器还会再触发一次 blur，这时候要忽略掉
function createRenameInput(currentText, onCommit, onCancel) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'edit-input';
  input.value = currentText;

  let finished = false;

  function finish(cancelled) {
    if (finished) return;
    finished = true;
    if (cancelled) {
      onCancel();
    } else {
      onCommit(input.value.trim());
    }
  }

  input.addEventListener('click', (event) => event.stopPropagation());

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      finish(false);
    } else if (event.key === 'Escape') {
      finish(true);
    }
  });

  input.addEventListener('blur', () => finish(false));

  return input;
}

// ---- 页面顶部：一左一右两个悬浮圆按钮 ----
// 左边返回、右边 ⋯ 菜单。做成通用的，以后别的页面要"返回 + 菜单"直接调它就行。
// menu 传 { key, items } 就有右边的菜单；不传就只有返回按钮
function createPageHeader(onBack, menu) {
  const header = document.createElement('div');
  header.className = 'page-header';

  const back = document.createElement('button');
  back.className = 'round-btn back-btn';
  back.title = '返回';
  back.appendChild(createIcon('chevronLeft', 'round-icon'));
  back.addEventListener('click', onBack);
  header.appendChild(back);

  if (menu) {
    header.appendChild(createMenu(menu.key, menu.items, 'round-btn'));
  }

  return header;
}

// ---- 三点菜单 ----
// key 用来标记"哪个菜单"，items 是菜单里的每一项。
// buttonClass 可以给那个 ⋯ 按钮加样式（页面顶部用的是圆形悬浮款）
function createMenu(key, items, buttonClass) {
  const anchor = document.createElement('div');
  anchor.className = 'menu-anchor';

  const btn = document.createElement('button');
  btn.className = buttonClass ? 'menu-btn ' + buttonClass : 'menu-btn';
  btn.textContent = '⋯';
  if (openMenuKey === key) {
    btn.classList.add('open');
  }
  btn.addEventListener('click', (event) => {
    event.stopPropagation();       // 不要触发整行的点击，也不要被 document 的"关菜单"逻辑关掉
    openMenuKey = openMenuKey === key ? null : key;
    render();
  });
  anchor.appendChild(btn);

  if (openMenuKey === key) {
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.addEventListener('click', (event) => event.stopPropagation());

    items.forEach((item) => {
      if (item.type === 'label') {
        const label = document.createElement('div');
        label.className = 'menu-label';
        label.textContent = item.text;
        menu.appendChild(label);
      } else if (item.type === 'divider') {
        const divider = document.createElement('div');
        divider.className = 'menu-divider';
        menu.appendChild(divider);
      } else {
        const row = document.createElement('div');
        row.className = item.danger ? 'menu-item danger' : 'menu-item';
        if (item.checked) row.classList.add('checked');   // 右边打个勾（勾是 CSS 画的，文字不变）
        row.textContent = item.text;
        row.addEventListener('click', () => {
          openMenuKey = null;
          item.action();
        });
        menu.appendChild(row);
      }
    });

    anchor.appendChild(menu);
  }

  return anchor;
}

function createCategoryMenu(category) {
  // 上移下移按页面上看得见的清单算，筛选状态下才不会"点了没反应"
  const visible = categoriesInFilter(listTagFilter);
  const position = visible.indexOf(category);
  const items = [
    { text: '重命名', action: () => { editingCategory = category; render(); } }
  ];

  if (position > 0) {
    items.push({ text: '上移', action: () => moveCategory(category, -1) });
  }
  if (position !== -1 && position < visible.length - 1) {
    items.push({ text: '下移', action: () => moveCategory(category, 1) });
  }

  // 放到哪个标签下。像文件夹一样只能选一个，当前所在的打勾
  const archived = isCategoryArchived(category);
  if (!archived && listTags.length > 0) {
    const current = categoryTagOf(category);
    items.push({ type: 'divider' });
    items.push({ type: 'label', text: '放到标签' });
    listTags.forEach((tag) => {
      items.push({
        text: tag.name,
        checked: tag.id === current,
        action: () => setCategoryTag(category, tag.id)
      });
    });
    if (current) {
      items.push({ text: '不放进标签', action: () => setCategoryTag(category, null) });
    }
  }

  items.push({ type: 'divider' });
  items.push(archived
    ? { text: '取消归档', action: () => unarchiveCategory(category) }
    : { text: '归档', action: () => archiveCategory(category) });
  items.push({ text: '删除清单', danger: true, action: () => deleteCategory(category) });

  return createMenu('category-' + category, items);
}

function createTodoMenu(index) {
  return createMenu('task-' + index, todoMenuItems(index));
}

// 菜单里有哪些项。单独抽出来，是因为列表里的 ⋯ 和详情页顶部的 ⋯ 要用同一套内容
function todoMenuItems(index) {
  const todo = todos[index];
  const items = [
    { text: '重命名', action: () => { editingTaskIndex = index; render(); } }
  ];

  if (todo.status === 'active') {
    items.push({ text: '标记为完成', action: () => setStatus(index, 'done') });
    items.push({ text: '放弃这条', action: () => abandonTodo(index) });
  } else if (todo.status === 'done') {
    items.push({ text: '标记为未完成', action: () => setStatus(index, 'active') });
    items.push({ text: '放弃这条', action: () => abandonTodo(index) });
  } else {
    items.push({ text: '重新拾起', action: () => setStatus(index, 'active') });
  }

  // 其它清单，用来做"移动到"。归档了的清单不列：暂时不用的地方，不该往里放东西
  const others = categories.filter((name) => name !== todo.category && !isCategoryArchived(name));
  if (others.length > 0) {
    items.push({ type: 'divider' });
    items.push({ type: 'label', text: '移动到' });
    others.forEach((name) => {
      items.push({ text: name, action: () => moveTodo(index, name) });
    });
  }

  items.push({ type: 'divider' });
  items.push({ text: '删除任务', danger: true, action: () => deleteTodo(index) });

  return items;
}

// 点页面上任何别的地方都关掉菜单。
// 返回 true 表示"这一下只是用来关菜单的"，调用方就不要再做别的事了
function closeMenuIfOpen() {
  if (openMenuKey === null) return false;
  openMenuKey = null;
  render();
  return true;
}

document.addEventListener('click', () => {
  closeMenuIfOpen();
});

// ---- 详情页 ----
function createDetailPage(index) {
  const todo = todos[index];
  const page = document.createElement('div');

  // 顶部一左一右两个悬浮圆按钮，⋯ 菜单从卡片里挪到了右上角
  const header = createPageHeader(
    () => {
      detailIndex = null;
      editingDueFor = null;
      render();
    },
    { key: 'task-' + index, items: todoMenuItems(index) }
  );

  const card = document.createElement('div');
  card.className = todo.status === 'active' ? 'detail-card' : 'detail-card ' + todo.status;
  card.append(createCheckbox(todo, index));

  // 详情页里也能直接改名：和列表里共用 editingTaskIndex 这个状态
  if (editingTaskIndex === index) {
    card.appendChild(createRenameInput(
      todo.text,
      (newText) => {
        renameTodo(index, newText);
        editingTaskIndex = null;
        render();
      },
      () => {
        editingTaskIndex = null;
        render();
      }
    ));
  } else {
    const title = document.createElement('span');
    title.className = 'detail-title';
    title.textContent = todo.text;
    title.addEventListener('click', () => {
      editingTaskIndex = index;
      render();
    });
    card.appendChild(title);
    if (todo.status === 'active') {
      card.appendChild(createPinButton(index));
    }
  }

  page.append(header, card);

  const statusLabels = { active: '未完成', done: '已完成', abandoned: '已放弃' };
  page.appendChild(createDetailRow('状态', statusLabels[todo.status]));
  page.appendChild(createDetailRow('清单', todo.category));
  // 开始时间 = 创建这条任务的时间，只在详情页显示
  page.appendChild(createDetailRow('开始时间', todo.createdAt ? formatDateTime(todo.createdAt) : '未记录'));

  if (editingDueFor === index) {
    page.appendChild(createDueEditor(index));
  } else {
    // 截止时间那一行右边有个可以点的时钟图标
    const dueRow = createDetailRow('截止时间', todo.dueAt ? formatDateTime(todo.dueAt) : '未设置');
    const clockBtn = document.createElement('button');
    clockBtn.className = 'icon-btn';
    clockBtn.textContent = '🕐';
    clockBtn.title = '设置截止时间';
    clockBtn.addEventListener('click', () => {
      editingDueFor = index;
      render();
    });
    dueRow.appendChild(clockBtn);
    page.appendChild(dueRow);

    // 没设截止时间就没有提醒可言，这一行就不显示了
    if (todo.dueAt) {
      page.appendChild(createDetailRow('提醒', remindLabel(todo.remindBefore)));

      // 设了提醒但浏览器不给弹通知，得告诉用户一声，否则会以为坏了
      if (todo.remindBefore !== null && notifier.permission() !== 'granted') {
        const notice = document.createElement('div');
        notice.className = 'notice';
        notice.textContent = notifier.permission() === 'denied'
          ? '⚠️ 浏览器的通知权限被拒绝了，到点不会弹提醒。可以在浏览器设置里重新允许。'
          : '⚠️ 还没允许通知，到点可能不会弹提醒。';
        page.appendChild(notice);
      }
    }
  }

  page.appendChild(createNoteSection(index));
  page.appendChild(createAttachmentSection(index));

  return page;
}

// 备注：一个多行输入框，失去焦点时保存。
// 这里故意不重画界面 —— 输入框里显示的已经是最新内容，重画只会打断用户
function createNoteSection(index) {
  const box = document.createElement('div');
  box.className = 'note-box';

  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = '备注';

  const textarea = document.createElement('textarea');
  textarea.className = 'note-input';
  textarea.rows = 4;
  textarea.placeholder = '写点什么……';
  textarea.value = todos[index].note;
  textarea.addEventListener('blur', () => saveNote(index, textarea.value));

  box.append(label, textarea);
  return box;
}

// 附件区：已有附件的预览 + 一个"添加附件"按钮
function createAttachmentSection(index) {
  const todo = todos[index];
  const box = document.createElement('div');
  box.className = 'attach-box';

  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = `附件${todo.attachments.length > 0 ? '（' + todo.attachments.length + '）' : ''}`;
  box.appendChild(label);

  todo.attachments.forEach((attachment) => {
    box.appendChild(createAttachmentItem(index, attachment));
  });

  // 真正的文件选择框藏起来，用好看的按钮去触发它
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.className = 'file-input';
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      addAttachments(index, fileInput.files);
    }
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'attach-add';
  addBtn.textContent = '+ 添加附件（图片 / 视频 / 录音 / 文件）';
  addBtn.addEventListener('click', () => fileInput.click());

  box.append(fileInput, addBtn);

  if (attachmentError) {
    const error = document.createElement('div');
    error.className = 'notice';
    error.textContent = '⚠️ ' + attachmentError;
    box.appendChild(error);
  }

  return box;
}

// 一个附件：图片显示缩略图，音视频能直接播放，其它类型显示文件名
function createAttachmentItem(todoIndex, attachment) {
  const row = document.createElement('div');
  row.className = 'attach-item';

  const preview = document.createElement('div');
  preview.className = 'attach-preview';

  // 文件内容存在 IndexedDB 里，是异步取的：先占位，取到了再填进去
  blobStore.load(attachment.id).then((blob) => {
    if (!blob) {
      preview.textContent = '（文件丢失）';
      return;
    }
    const url = URL.createObjectURL(blob);
    objectUrls.push(url);      // 记下来，下次重画时释放掉，免得占内存

    if (attachment.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = url;
      preview.appendChild(img);
    } else if (attachment.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      preview.appendChild(video);
    } else if (attachment.type.startsWith('audio/')) {
      const audio = document.createElement('audio');
      audio.src = url;
      audio.controls = true;
      preview.appendChild(audio);
    } else {
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.name;
      link.textContent = '📄 ' + attachment.name;
      preview.appendChild(link);
    }
  });

  const info = document.createElement('div');
  info.className = 'attach-info';
  info.textContent = `${attachment.name} · ${formatFileSize(attachment.size)}`;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'attach-remove';
  removeBtn.textContent = '×';
  removeBtn.title = '删除附件';
  removeBtn.addEventListener('click', () => removeAttachment(todoIndex, attachment.id));

  row.append(preview, info, removeBtn);
  return row;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// 详情页里的一行：左边灰色标签，右边内容
function createDetailRow(label, value) {
  const row = document.createElement('div');
  row.className = 'detail-row';

  const labelEl = document.createElement('span');
  labelEl.className = 'detail-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('span');
  valueEl.className = value === '未设置' || value === '未记录' ? 'detail-value empty' : 'detail-value';
  valueEl.textContent = value;

  row.append(labelEl, valueEl);
  return row;
}

// 点了时钟图标之后展开的编辑区：选时间 + 选提醒方式
function createDueEditor(index) {
  const todo = todos[index];
  const box = document.createElement('div');
  box.className = 'due-editor';

  const dateInput = document.createElement('input');
  dateInput.type = 'datetime-local';
  dateInput.className = 'due-input';
  dateInput.value = toDateTimeInputValue(todo.dueAt);

  const select = document.createElement('select');
  select.className = 'remind-select';
  REMIND_OPTIONS.forEach((option) => {
    const optionEl = document.createElement('option');
    optionEl.value = option.minutes === null ? '' : String(option.minutes);
    optionEl.textContent = option.label;
    if (todo.remindBefore === option.minutes) {
      optionEl.selected = true;
    }
    select.appendChild(optionEl);
  });

  const actions = document.createElement('div');
  actions.className = 'due-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-primary';
  saveBtn.textContent = '保存';
  saveBtn.addEventListener('click', () => setDue(index, dateInput.value, select.value));

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-plain';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', () => {
    editingDueFor = null;
    render();
  });

  actions.append(saveBtn, cancelBtn);

  // 已经设过截止时间才需要"清除"
  if (todo.dueAt) {
    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn-danger';
    clearBtn.textContent = '清除';
    clearBtn.addEventListener('click', () => clearDue(index));
    actions.appendChild(clearBtn);
  }

  box.append(
    labelledField('截止时间', dateInput),
    labelledField('提醒', select),
    actions
  );
  return box;
}

function labelledField(labelText, fieldEl) {
  const wrap = document.createElement('label');
  wrap.className = 'field';

  const label = document.createElement('span');
  label.className = 'detail-label';
  label.textContent = labelText;

  wrap.append(label, fieldEl);
  return wrap;
}

// ---- 各种操作 ----
// 约定：每个操作函数自己负责保存数据和重画界面，
// 能失败的操作（比如名字为空）返回 true/false 表示做没做成
function addTodo(category, text) {
  const trimmed = text.trim();
  if (trimmed === '') return false;

  todos.push({
    text: trimmed,
    status: 'active',                   // active / done / abandoned
    category: category,
    createdAt: nowFn().toISOString(),   // 创建时把当前系统时间记下来
    dueAt: null,                        // 截止时间，用户在详情页里设
    remindBefore: null,                 // 提前多少分钟提醒，null = 不提醒
    reminded: false,                    // 这条的提醒是不是已经弹过了
    note: '',                           // 备注
    attachments: [],                    // 附件，只存 { id, name, type, size }
    pinned: false                       // 是否置顶
  });
  saveTodos();
  render();
  return true;
}

// tagId：新清单直接放进哪个标签（停在某个标签下新建时用），不放就传 null
function addCategory(name, tagId = null) {
  const trimmed = name.trim();
  // 名字为空或者已经有同名清单，就什么都不做
  if (trimmed === '' || categories.includes(trimmed)) return false;

  categories.push(trimmed);
  // 万一有个同名的老记录（理论上删清单时已经清掉了），新清单也不该继承它
  delete categoryMeta[trimmed];
  if (findListTag(tagId)) categoryMeta[trimmed] = { tagId: tagId, archived: false };

  saveCategories();
  saveCategoryMeta();
  render();
  return true;
}

// ---- 清单的标签和归档 ----
// 交给 tags.js 里共用界面的"标签集"：告诉它清单页的标签在哪、怎么改
const listTagSet = {
  scope: 'lists',
  tags: () => listTags,
  filter: () => listTagFilter,
  setFilter: (filter) => { listTagFilter = filter; },
  add: (name) => addListTag(name),
  rename: (id, name) => renameListTag(id, name),
  remove: (id) => deleteListTag(id)
};

function findListTag(id) {
  return listTags.find((tag) => tag.id === id) || null;
}

function categoryTagOf(category) {
  return categoryMeta[category] ? categoryMeta[category].tagId : null;
}

function isCategoryArchived(category) {
  return Boolean(categoryMeta[category] && categoryMeta[category].archived);
}

// 改某个清单的归属。回到默认值（不在标签下、没归档）时把记录删掉，免得存一堆没用的
function setCategoryMeta(category, tagId, archived) {
  if (tagId || archived) {
    categoryMeta[category] = { tagId: tagId, archived: archived };
  } else {
    delete categoryMeta[category];
  }
}

// 返回新建的标签，建不成（空名、重名、叫"所有""已归档"）返回 null
function addListTag(name) {
  const trimmed = name.trim();
  if (!isValidTagName(listTags, trimmed)) return null;

  const tag = { id: makeTagId('ltag'), name: trimmed };
  listTags.push(tag);
  saveListTags();
  render();
  return tag;
}

function renameListTag(id, newName) {
  const tag = findListTag(id);
  const trimmed = newName.trim();
  if (!tag || trimmed === tag.name || !isValidTagName(listTags, trimmed, id)) return false;

  tag.name = trimmed;     // 清单记的是标签 id，所以只改这一处
  saveListTags();
  render();
  return true;
}

// 删标签不删清单：放在这个标签下的清单还在，只是不在任何标签下了
function deleteListTag(id) {
  const tag = findListTag(id);
  if (!tag) return false;

  const users = categories.filter((category) => categoryTagOf(category) === id);
  if (users.length > 0) {
    const ok = confirmFn(`有 ${users.length} 个清单放在「${tag.name}」标签下。删除标签不会删掉这些清单和里面的任务，确定吗？`);
    if (!ok) return false;
  }

  listTags = listTags.filter((other) => other.id !== id);
  users.forEach((category) => setCategoryMeta(category, null, false));
  // 正停在这个标签下的话，它没了就回到"所有"
  if (listTagFilter === id) listTagFilter = 'all';

  saveListTags();
  saveCategoryMeta();
  render();
  return true;
}

// 把清单放进某个标签（像放进文件夹，原来在哪个标签下就从那里拿出来）。
// tagId 传 null 就是"不放进标签"。归档了的清单不能放
function setCategoryTag(category, tagId) {
  if (!categories.includes(category) || isCategoryArchived(category)) return false;
  if (tagId !== null && !findListTag(tagId)) return false;

  setCategoryMeta(category, tagId, false);
  saveCategoryMeta();
  render();
  return true;
}

// 归档：暂时不用的清单。拿掉它的标签；里面的任务不再出现在"今天"页、也不再提醒
function archiveCategory(category) {
  if (!categories.includes(category) || isCategoryArchived(category)) return false;

  setCategoryMeta(category, null, true);
  if (addingTaskIn === category) addingTaskIn = null;
  saveCategoryMeta();
  render();
  return true;
}

// 取消归档。归档时拿掉的标签找不回来了，要用的话重新放
function unarchiveCategory(category) {
  if (!isCategoryArchived(category)) return false;

  setCategoryMeta(category, null, false);
  saveCategoryMeta();
  render();
  return true;
}

// 顶部选中某一项时，下面列出哪些清单（按原来的顺序）
function categoriesInFilter(filter) {
  if (filter === 'archived') return categories.filter((category) => isCategoryArchived(category));
  if (filter === 'all') return categories.filter((category) => !isCategoryArchived(category));
  return categories.filter((category) => categoryTagOf(category) === filter);
}

// 筛选状态下页面上只看得到一部分清单，拖完只知道"这几个"的新顺序。
// 把它们按新顺序填回原来占的那几个位置，看不见的清单原地不动
function mergeVisibleCategoryOrder(visibleNames) {
  const visible = new Set(visibleNames);
  let next = 0;
  return categories.map((category) => (visible.has(category) ? visibleNames[next++] : category));
}

function toggleCollapse(category) {
  if (collapsed.includes(category)) {
    collapsed = collapsed.filter((name) => name !== category);
  } else {
    collapsed.push(category);
  }
  saveCollapsed();
  render();
}

// 点勾选框：没做完的标记为完成；已完成或已放弃的都恢复成未完成
function toggleTodo(index) {
  const todo = todos[index];
  setStatus(index, todo.status === 'active' ? 'done' : 'active');
}

// 放弃：不删除，只是收进"已放弃"分组。
// 留着是为了知道自己尝试过，哪天想重新捡起来也还在
function abandonTodo(index) {
  setStatus(index, 'abandoned');
}

function setStatus(index, status) {
  const todo = todos[index];
  todo.status = status;

  // 已完成和已放弃都会沉到分组里去，置顶就没意义了，顺手取消掉
  if (status !== 'active') {
    todo.pinned = false;
  }

  saveTodos();
  render();
}

function renameTodo(index, newText) {
  const trimmed = newText.trim();
  if (trimmed === '') return false;

  todos[index].text = trimmed;
  saveTodos();
  render();
  return true;
}

// 保存截止时间和提醒设置。inputValue 来自 <input type="datetime-local">，
// 形如 '2026-09-09T17:20'（本地时间）；remindValue 是分钟数的字符串，'' 表示不提醒
function setDue(index, inputValue, remindValue) {
  if (inputValue === '') return false;      // 没选日期就不保存

  const todo = todos[index];
  todo.dueAt = new Date(inputValue).toISOString();
  todo.remindBefore = remindValue === '' ? null : Number(remindValue);
  todo.reminded = false;                    // 时间改了，之前提醒过也要重新算

  saveTodos();
  editingDueFor = null;

  // 要提醒的话，趁着用户刚点完按钮（浏览器只在用户操作时才允许弹权限申请）
  if (todo.remindBefore !== null) {
    ensureNotifyPermission();
  }

  render();
  return true;
}

function clearDue(index) {
  const todo = todos[index];
  todo.dueAt = null;
  todo.remindBefore = null;
  todo.reminded = false;

  saveTodos();
  editingDueFor = null;
  render();
}

function ensureNotifyPermission() {
  if (notifier.permission() !== 'default') return;

  const result = notifier.request();
  // 申请结果是异步回来的，回来之后重画一下，好把"没授权"的提示去掉
  if (result && typeof result.then === 'function') {
    result.then(() => render());
  }
}

// 检查有没有到点该提醒的任务。
// 由定时器每分钟调一次；测试里可以把时间冻住后直接调用
function checkReminders() {
  const now = nowFn().getTime();
  let changed = false;

  todos.forEach((todo) => {
    if (!todo.dueAt) return;             // 没设截止时间
    if (todo.remindBefore === null) return;  // 用户选了不提醒
    if (todo.reminded) return;           // 已经提醒过了，不重复打扰
    if (todo.status !== 'active') return;    // 做完的和放弃的都不用提醒
    if (isCategoryArchived(todo.category)) return;   // 清单归档了也不提醒。取消归档后还没过点的照常提醒

    const fireAt = new Date(todo.dueAt).getTime() - todo.remindBefore * 60 * 1000;
    if (now < fireAt) return;            // 还没到时候

    const shown = notifier.show('待办提醒', {
      body: `${todo.text}（截止 ${formatDateTime(todo.dueAt)}）`
    });

    // 只有真的弹出来了才算提醒过。被浏览器拦掉的话保持未提醒，
    // 等用户以后授权了还能收到
    if (shown) {
      todo.reminded = true;
      changed = true;
    }
  });

  if (changed) {
    saveTodos();
  }
}

let reminderTimer = null;

// 由 index.html 启动。测试不调用它，而是直接调 checkReminders()
function startReminderTimer() {
  if (reminderTimer !== null) {
    clearInterval(reminderTimer);
  }
  checkReminders();     // 先补上关着网页期间错过的提醒
  reminderTimer = setInterval(checkReminders, 60 * 1000);
}

// 把第 fromIndex 条任务放到 targetCategory 里的第 position 个位置（按页面上看到的顺序数）。
// 拖拽松手时调用；也可以单独调用，所以测试起来很方便
function moveTodoToPosition(fromIndex, targetCategory, position) {
  const moved = todos[fromIndex];
  if (!moved || !categories.includes(targetCategory)) return false;

  const rest = todos.filter((todo, index) => index !== fromIndex);
  moved.category = targetCategory;

  // 按清单重新组装整个数组，顺序和页面上看到的一致
  const result = [];
  categories.forEach((category) => {
    const items = rest.filter((todo) => todo.category === category);

    if (category === targetCategory) {
      // 位置是按页面上看到的顺序数的，所以这里要用同一套排序规则
      items.sort(compareForDisplay);
      const at = Math.max(0, Math.min(position, items.length));
      items.splice(at, 0, moved);
    }

    result.push(...items);
  });

  todos = result;
  saveTodos();
  render();
  return true;
}

// 按给定的顺序重排清单。只接受"和现有清单一模一样、只是顺序不同"的输入，
// 免得页面上出了意外就把数据弄丢
function applyCategoryOrder(names) {
  const sameSet = names.length === categories.length &&
    names.every((name) => categories.includes(name)) &&
    new Set(names).size === names.length;
  if (!sameSet) return false;

  categories = names;
  saveCategories();
  render();
  return true;
}

function moveTodo(index, newCategory) {
  todos[index].category = newCategory;
  saveTodos();
  render();
}

function togglePin(index) {
  todos[index].pinned = !todos[index].pinned;
  saveTodos();
  render();
}

function saveNote(index, text) {
  todos[index].note = text;
  saveTodos();
}

function addAttachments(index, files) {
  const todo = todos[index];
  attachmentError = null;

  const jobs = [...files].map((file) => {
    const id = 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    // 先把文件内容存进 IndexedDB，存成功了再把信息记到任务上，
    // 否则会出现"任务说有附件、实际打不开"的情况
    return blobStore.save(id, file).then(() => {
      todo.attachments.push({
        id: id,
        name: file.name,
        type: file.type || '',
        size: file.size
      });
    });
  });

  return Promise.all(jobs)
    .then(() => {
      saveTodos();
      render();
    })
    .catch((error) => {
      // 最常见的是空间不够（视频很容易撑爆），得让用户知道
      attachmentError = '附件保存失败：' + (error && error.message ? error.message : '可能是本地空间不足');
      render();
    });
}

function removeAttachment(index, attachmentId) {
  const todo = todos[index];
  todo.attachments = todo.attachments.filter((item) => item.id !== attachmentId);
  saveTodos();
  render();
  return blobStore.remove(attachmentId);
}

// 删任务时把它的附件文件也删掉，否则文件会一直占着空间却没人认领
function deleteAttachmentsOf(list) {
  const jobs = [];
  list.forEach((todo) => {
    (todo.attachments || []).forEach((attachment) => {
      jobs.push(blobStore.remove(attachment.id));
    });
  });
  return Promise.all(jobs);
}

function deleteTodo(index) {
  const removed = todos.splice(index, 1);
  saveTodos();
  detailIndex = null;      // 万一是在详情页删的，回到列表页
  render();
  return deleteAttachmentsOf(removed);
}

function renameCategory(oldName, newName) {
  const trimmed = newName.trim();
  // 名字为空、没改、或者和别的清单重名，都不动
  if (trimmed === '' || trimmed === oldName || categories.includes(trimmed)) return false;

  categories[categories.indexOf(oldName)] = trimmed;
  // 里面的任务、折叠状态都记的是清单名字，要一起改
  todos.forEach((todo) => {
    if (todo.category === oldName) {
      todo.category = trimmed;
    }
  });
  collapsed = collapsed.map((name) => (name === oldName ? trimmed : name));
  // 放在哪个标签下、有没有归档，也是按名字记的
  if (categoryMeta[oldName]) {
    categoryMeta[trimmed] = categoryMeta[oldName];
    delete categoryMeta[oldName];
  }

  saveCategories();
  saveTodos();
  saveCollapsed();
  saveCategoryMeta();
  render();
  return true;
}

function moveCategory(category, offset) {
  // 和"页面上看得见的"相邻清单交换。筛选状态下，数组里的邻居可能正好是看不见的那个，
  // 和它换的话用户会觉得点了没反应
  const visible = categoriesInFilter(listTagFilter);
  const from = visible.indexOf(category);
  const to = from + offset;
  if (from === -1 || to < 0 || to >= visible.length) return false;

  const other = visible[to];
  const a = categories.indexOf(category);
  const b = categories.indexOf(other);
  categories[a] = other;
  categories[b] = category;

  saveCategories();
  render();
  return true;
}

function deleteCategory(category) {
  const count = todos.filter((todo) => todo.category === category).length;

  // 清单里还有任务的话，先问一下用户
  if (count > 0) {
    const ok = confirmFn(`清单「${category}」里有 ${count} 条任务（含已完成），删除清单会把它们一起删掉，确定吗？`);
    if (!ok) return false;
  }

  const removed = todos.filter((todo) => todo.category === category);

  categories = categories.filter((name) => name !== category);
  todos = todos.filter((todo) => todo.category !== category);
  collapsed = collapsed.filter((name) => name !== category);
  delete categoryMeta[category];  // 不删的话，以后再建个同名清单会莫名其妙出现在某个标签下
  deleteAttachmentsOf(removed);   // 连带删掉这些任务的附件文件
  if (addingTaskIn === category) addingTaskIn = null;
  if (editingCategory === category) editingCategory = null;

  saveCategories();
  saveTodos();
  saveCollapsed();
  saveCategoryMeta();
  render();
  return true;
}
