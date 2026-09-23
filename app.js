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

// 到点的提醒由谁来弹。
// 纯网页版没人接手（null）：只能在网页开着的时候自己弹（见 checkReminders）。
// 装成 iOS 应用之后由外壳接手：把"什么时候、弹什么字"整张单子交给系统，
// 到点由 iOS 弹通知 —— app 关着也会响，这是网页怎么写都做不到的。
// 接手的人要有 replaceAll(提醒单子)：每次都是整张单子换一遍，所以单子里不用带 id
let reminderScheduler = null;

function useReminderScheduler(scheduler) {
  reminderScheduler = scheduler;
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
// 一次只展开一个清单：点开一个，其它的自动收起。记的是展开着的那个清单的名字，null = 全都收着。
// 清单多的时候页面短；右下角 + 新建任务时，也就知道默认该放进哪个清单
let expandedCategory = null;
let listTags = [];          // 清单页自己的标签 [{ id, name }]，和打卡的标签互不相干
// 每个清单放在哪个标签下、有没有归档：{ '工作': { tagId: 'ltag-…', archived: false } }
// 标签像文件夹，一个清单最多放在一个标签下。归档了的清单不在任何标签下。
// 只记"有标签或已归档"的清单，没记的就是默认值（不在标签下、没归档）。
// 注意这里是按清单名字记的（和任务、折叠状态一样），所以清单改名时要跟着改
let categoryMeta = {};
let categoryDraft = null;   // 正在新建的清单 { name, tagId }，null = 新建面板没打开
let taskDraft = null;       // 正在新建的任务 { text, category }，null = 新建任务面板没打开
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
let lastRemindersJson = null;   // 上次交给系统的提醒单子，没变就不再打扰它（重画很频繁）
let dataNotice = null;      // 导出 / 导入之后给用户的一句话

// 把"临时"的界面状态清空（数据状态不动）
function resetViewState() {
  categoryDraft = null;
  taskDraft = null;
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
  lastRemindersJson = null;  // 换了一份数据，下次重画要重新交一张单子
  dataNotice = null;
  resetTagViewState();       // 标签输入框、长按管理条（在 tags.js 里，两页共用）
  resetLogViewState();       // 打卡模块自己的界面状态（在 logs.js 里）
}

// 启动：把应用挂到某个页面元素上，读出数据，画出来
function initApp(element) {
  appEl = element;
  resetViewState();
  reloadFromStorage();
  render();
}

// 把存储里的数据全读进内存。启动时用，导入别人的数据之后也用（那时界面状态不用动）
function reloadFromStorage() {
  categories = loadCategories();
  todos = loadTodos();
  expandedCategory = loadExpandedCategory();   // 要对照清单列表，所以排在读清单之后
  listTags = loadListTags();   // 先读标签：读清单归属时要对照它，把已经不存在的标签去掉
  categoryMeta = loadCategoryMeta();
  logTags = loadLogTags();     // 同理，打卡也是先读标签再读项目
  logItems = loadLogItems();
}

// 点"导出数据"：把内容算出来，交给浏览器下载（装成应用之后是系统的分享）
function startExport() {
  dataNotice = null;
  return exportData()
    .then((text) => {
      fileSaver(exportFileName(), text);
      dataNotice = '已导出，存好这个文件就等于备份了一份';
      render();
    })
    .catch((error) => {
      dataNotice = '导出失败：' + errorText(error);
      render();
    });
}

// 点"导入数据"：先问一句（会覆盖现在的全部数据），再让用户挑文件
function startImport() {
  dataNotice = null;
  if (!confirmFn('导入会用文件里的数据替换掉现在的全部内容（包括打卡记录），确定吗？')) {
    return Promise.resolve();
  }

  return Promise.resolve(filePicker())
    .then((text) => {
      if (text === null || text === undefined) return;   // 用户点了取消
      return Promise.resolve(importData(text)).then(() => {
        dataNotice = '导入完成';
        render();
      });
    })
    .catch((error) => {
      dataNotice = '导入失败：' + errorText(error);
      render();
    });
}

function errorText(error) {
  return error && error.message ? error.message : '文件读不出来';
}

// ---- 读写存储 ----

// ---- 导出 / 导入全部数据 ----
// 为什么要有：装成 iOS 应用之后，应用里那份数据和 Safari 里那份是各存各的（浏览器就是这么规定的），
// 搬家、备份、换手机全靠它。导出的就是一个 .json 文件，用记事本打开也看得懂。
//
// 附件（图片、视频、录音）存在 IndexedDB 里，没法直接写进 JSON，
// 所以转成 base64（把二进制写成一串字母数字）一起带走。附件多的话文件会挺大，这是必然的
const EXPORT_VERSION = 1;

// 要带走的存储键。加了新的存储键，记得加进来 —— 有测试盯着这件事
const EXPORTED_KEYS = ['categories', 'todos', 'expandedCategory', 'listTags', 'categoryMeta', 'logTags', 'logItems'];

// 导出的文件存到哪：网页版交给浏览器下载
function downloadFile(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// 装成应用之后由外壳换成系统的"分享"。传 null 换回网页的做法
let fileSaver = downloadFile;

function useFileSaver(saver) {
  fileSaver = saver || downloadFile;
}

// 让用户挑一个文件，挑好了给出它的内容；挑到一半取消的话给 null。
// 做成可替换的有两个原因：测试里不能真弹系统的选文件窗口（会把整套测试卡在那儿），
// 装成应用之后外壳也要换成系统自己的文件选择
function pickFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const file = input.files[0];
      resolve(file ? file.text() : null);
    });
    input.click();
  });
}

let filePicker = pickFile;

function useFilePicker(picker) {
  filePicker = picker || pickFile;
}

function exportFileName() {
  const d = nowFn();
  const pad = (n) => String(n).padStart(2, '0');
  return `待办清单-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
}

// 把 Blob 转成 base64 字符串（FileReader 给的是 "data:类型;base64,内容"，取逗号后面那截）
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, type) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: type });
}

// 返回导出文件的内容（一段 JSON 文字）
function exportData() {
  const data = {};
  EXPORTED_KEYS.forEach((key) => {
    const saved = storage.getItem(key);
    if (saved !== null) data[key] = JSON.parse(saved);
  });

  // 附件的内容按 id 一个个取出来。取不到的（数据对不上、文件早没了）跳过，
  // 不能因为一个附件丢了就整个导不出来
  const wanted = todos.flatMap((todo) => todo.attachments || []);
  const loading = wanted.map((attachment) => (
    Promise.resolve(blobStore.load(attachment.id))
      .then((blob) => (blob ? blobToBase64(blob).then((base64) => ({ id: attachment.id, type: blob.type, base64: base64 })) : null))
      .catch(() => null)
  ));

  return Promise.all(loading).then((files) => JSON.stringify({
    app: 'todolist',
    version: EXPORT_VERSION,
    exportedAt: nowFn().toISOString(),
    data: data,
    files: files.filter((file) => file !== null)
  }, null, 2));
}

// 导入是"搬家"，不是"合并"：整份数据换掉。
// 合并要处理重名清单、同一条任务算不算重复，规则很难讲清楚，也容易悄悄弄错，不如说明白"会覆盖"
function importData(text) {
  const parsed = JSON.parse(text);   // 不是 JSON 的话这里就抛错，由调用的地方提示
  if (!parsed || parsed.app !== 'todolist') {
    throw new Error('这不像是本应用导出的文件');
  }
  if (parsed.version > EXPORT_VERSION) {
    throw new Error('这个文件是更新版本的应用导出的，先把应用更新一下');
  }

  EXPORTED_KEYS.forEach((key) => {
    // 文件里没有的键要删掉，不能留着旧数据 —— 否则导入一份"没有打卡项目"的备份之后，
    // 旧的打卡项目还在，看起来就像导入失败了
    if (parsed.data && key in parsed.data) {
      storage.setItem(key, JSON.stringify(parsed.data[key]));
    } else {
      storage.removeItem(key);
    }
  });

  const files = parsed.files || [];
  return Promise.all(files.map((file) => blobStore.save(file.id, base64ToBlob(file.base64, file.type))))
    .then(() => {
      reloadFromStorage();
      render();
    });
}

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

// 展开着的是哪个清单。
// 老版本记的是"哪些清单折叠了"（可以好几个同时展开），第一次读的时候换算过来：
// 展开原来第一个没折叠的清单，然后把老记录删掉 —— 两处都记展开状态，早晚会对不上
function loadExpandedCategory() {
  const saved = storage.getItem('expandedCategory');
  if (saved !== null) {
    const name = JSON.parse(saved);
    return categories.includes(name) ? name : null;
  }

  const old = storage.getItem('collapsed');
  const oldCollapsed = old ? JSON.parse(old) : [];
  const name = categories.find((category) => !oldCollapsed.includes(category)) || null;
  storage.removeItem('collapsed');
  storage.setItem('expandedCategory', JSON.stringify(name));
  return name;
}

function saveExpandedCategory() {
  storage.setItem('expandedCategory', JSON.stringify(expandedCategory));
}

function isCollapsed(category) {
  return category !== expandedCategory;
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

  // 重画时旧输入框被删掉，浏览器不一定会为它发"失去焦点"。画完按实际情况再对一遍，
  // 否则可能出现：输入框早没了，底部标签栏却一直藏着回不来
  syncTypingState();

  // 任务、截止时间、清单归档状态都可能刚被改过，把交给系统的提醒单子也对一遍
  syncReminders();
}

// ---- 打字时收起底部的标签栏和 + 按钮 ----
// iPhone 弹出键盘时，会把贴在屏幕底部的东西一起顶到键盘上面，挡住正在输入的地方。
// 所以光标在输入框里的时候，给整个应用加上 typing，由 CSS 把它们藏起来（只在触屏设备上，见 style.css）
function isTextField(element) {
  if (!element || !['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) return false;
  // 选附件用的是个藏起来的文件输入框，点它弹的是选文件，不是键盘
  return element.type !== 'file';
}

// focused 是"焦点现在在谁身上"，不传就看当前的
function syncTypingState(focused = document.activeElement) {
  if (!appEl) return;
  appEl.classList.toggle('typing', isTextField(focused) && appEl.contains(focused));
}

document.addEventListener('focusin', (event) => syncTypingState(event.target));
// 失去焦点时看焦点要去哪：从一个输入框跳到另一个输入框，键盘不会收起，标签栏也就先别放出来
document.addEventListener('focusout', (event) => syncTypingState(event.relatedTarget));

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
  let step = 0;
  if (pointerY < EDGE_SIZE) step = -EDGE_SPEED;
  else if (pointerY > window.innerHeight - EDGE_SIZE) step = EDGE_SPEED;
  if (step === 0) return;

  // 清单页、打卡页上整个网页是不动的，滚的是下面那一块（见 createScrollingPage）。
  // 还去滚整个网页的话，拖到屏幕边上就再也滚不动了
  const scroller = appEl && appEl.querySelector('.page-scroll');
  if (scroller) {
    scroller.scrollTop += step;
  } else {
    window.scrollBy(0, step);
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

// ---- 手指滑动：详情页往右滑返回、列表左右滑切换标签 ----
// 两个手势都是左右滑，共用一套"先看往哪边走，再决定管不管"：
// 手指刚动的那几像素看不出想干什么，走过 MOVE_THRESHOLD 才定方向——
// 左右为主就归我们（拦住页面滚动）；上下为主，这一整下都不管，页面照常滚。
// 为什么定下来就不改：边滑边改主意的话，页面会一会儿滚一会儿不滚，手感很乱。
// 只认手指：电脑上鼠标按住一拖是拖动排序，而且电脑上点返回键、点标签都很方便，用不着
const SWIPE_DISTANCE = 80;       // 滑过这么远，松手就算数
const FLING_TIME = 300;          // 从按下到松手不超过这么多毫秒，算"甩了一下"……
const FLING_DISTANCE = 24;       // ……甩的话滑这么远就够了。太短的不算，免得手指抖一下就触发

// options：
//   canStart(event)：按下时问一句，这一下要不要跟
//   canLock(dx)：方向定下来时再问一句（比如返回只认往右滑）。dx 往右为正
//   onMove(dx)：手指在动，让页面跟着走
//   onRelease(dx, committed)：手指离开。committed = 滑得够远或者甩得够快；
//     被系统打断（来电话之类，pointercancel）也会调它，那时 committed 一定是 false
function trackSwipe(target, options) {
  target.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || !options.canStart(event)) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const startTime = event.timeStamp;
    let state = 'deciding';      // 'deciding' 还没定方向 / 'mine' 归我们 / 'ignored' 这一下不管
    let distance = 0;

    function onPointerMove(moveEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (state === 'deciding') {
        if (Math.hypot(dx, dy) <= MOVE_THRESHOLD) return;
        // 屏幕上有浮起来的副本，说明是长按之后在拖任务，这一下归拖动，不是滑动
        const draggingItem = document.querySelector('.drag-ghost') !== null;
        const mine = Math.abs(dx) > Math.abs(dy) && !draggingItem && options.canLock(dx);
        state = mine ? 'mine' : 'ignored';
      }
      if (state !== 'mine') return;

      distance = dx;
      options.onMove(distance);
    }

    // 拦住页面滚动：横着滑的时候别让页面跟着上下走，不然会斜着飘。
    // 和拖动一样，必须写成 passive: false 浏览器才许拦
    function onTouchMove(touchEvent) {
      if (state === 'mine') touchEvent.preventDefault();
    }

    function onEnd(endEvent) {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onEnd);
      document.removeEventListener('pointercancel', onEnd);
      document.removeEventListener('touchmove', onTouchMove);
      if (state !== 'mine') return;

      const far = Math.abs(distance) >= SWIPE_DISTANCE;
      const fast = endEvent.timeStamp - startTime <= FLING_TIME && Math.abs(distance) >= FLING_DISTANCE;
      options.onRelease(distance, endEvent.type === 'pointerup' && (far || fast));
    }

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onEnd);
    document.addEventListener('pointercancel', onEnd);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
  });
}

// 松手时没滑够：让跟着手指挪开的那块慢慢回到原位（不加过渡的话是"啪"地跳回去）
function springBack(element) {
  element.style.transition = 'transform 0.2s ease-out';
  element.style.transform = '';
}

// 换页之后让新内容从某一边轻轻滑进来（fromX 为负 = 从左边）。
// 不加这一下的话内容是"瞬间换掉"的，看不出刚才翻了一页
function slideIn(element, fromX) {
  if (!element || !element.animate) return;   // 老浏览器没有 animate，没动画也不影响用
  element.animate(
    [{ transform: `translateX(${fromX}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: 200, easing: 'ease-out' }
  );
}

// 这些情况下手指一动不当成手势：
// 按在输入框里（可能是在选文字、挪光标）；正在打字（键盘开着，这时一滑多半是想收键盘或滚动）；
// 有菜单开着（手指一碰应该先是关菜单）
function canStartSwipe(event) {
  if (event.target.closest && event.target.closest('input, textarea, select')) return false;
  return !isTextField(document.activeElement) && openMenuKey === null;
}

// 现在在哪个详情页，就返回"从这个详情页回去"的函数；不在详情页返回 null
function detailPageBack() {
  if (detailIndex !== null) return closeTaskDetail;
  if (logDetailId !== null) return closeLogDetail;
  return null;
}

// 详情页手指往右滑，回到列表（任务详情、打卡详情都是）。
// 方向和 iPhone 自带的返回一致：从左往右滑，详情页跟着往右移出去，底下的列表露出来。
// 一开始做的是"往下拉返回"，用户实际用下来觉得不顺手，改成了这个——大家更习惯左右滑返回。
// 挂在整个网页上，而不是详情页那个元素上：详情页内容短的时候，下面一大片空白不属于它，
// 按在空白处滑也应该能回去。所以只在这里挂一次，按下时再看现在是不是在详情页
trackSwipe(document, {
  canStart: (event) => {
    if (!appEl || !appEl.isConnected || detailPageBack() === null) return false;
    return canStartSwipe(event);
  },
  canLock: (dx) => dx > 0,     // 只认往右滑。往左滑不返回：方向反了就不是"退回上一页"的意思了
  onMove: (dx) => {
    const page = appEl.querySelector('.detail-page');
    if (!page) return;
    // 整页跟着手指往右走，一眼看得出"再滑就回去了"
    page.style.transition = 'none';
    page.style.transform = `translateX(${dx}px)`;
  },
  onRelease: (dx, committed) => {
    const back = detailPageBack();
    if (committed && back) {
      back();
      // 详情页是往右移出去的，底下的列表就该是从左边补上来的
      slideIn(appEl.querySelector('.page'), -30);
      return;
    }
    const page = appEl.querySelector('.detail-page');
    if (page) springBack(page);
  }
});

// 指针停在哪个清单的任务区上（把整块区域都算进去，这样拖进空清单也容易对准）。
// 只看纵向位置：任务是竖着排的，拖动时指针很容易偏到卡片左右外面去，
// 要求横向也对准的话会经常判不中
function findTaskContainerAt(x, y) {
  const sections = [...appEl.querySelectorAll('.category')];
  const hit = sections.find((section) => {
    const rect = section.getBoundingClientRect();
    return y >= rect.top && y <= rect.bottom;
  });
  // 展开的清单拿到的是任务列表；收起来的清单拿到的是那个看不见的空列表，拖进去就放进这个清单
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
  const { page: view, top, body } = createScrollingPage('tasks-view');

  // 选中的标签万一已经不在了，退回"所有"，别停在一个看不见的筛选上
  if (listTagFilter !== 'all' && listTagFilter !== 'archived' && !findListTag(listTagFilter)) {
    listTagFilter = 'all';
  }

  // 顶部标签行（和打卡页共用，在 tags.js 里）
  // 标签行右边放一个 ⋯："新建清单"一年也用不了几次，不值得占着右下角那个最显眼的位置
  top.appendChild(createTagBar(listTagSet, {
    key: 'page-lists',
    items: [
      { text: '新建清单', action: openCategoryDraft },
      // 导出 / 导入放这里：一年用不了几次，但得找得到。
      // 装成 iOS 应用之后，应用里的数据和 Safari 里的是各存各的，搬家就靠这两项
      { text: '导出数据', action: startExport },
      { text: '导入数据', action: startImport }
    ]
  }));
  enableTagSwipe(body, listTagSet);   // 列表区左右滑切换标签（在 tags.js 里，打卡页也用）

  if (dataNotice) {
    const notice = document.createElement('div');
    notice.className = 'data-notice';
    notice.textContent = dataNotice;
    body.appendChild(notice);
  }

  const shown = categoriesInFilter(listTagFilter);
  const message = listEmptyMessage(shown);
  if (message) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = message;
    body.appendChild(empty);
  }

  // 清单单独放一个容器里，拖拽排序时要靠它来算位置
  const categoryList = document.createElement('div');
  categoryList.id = 'category-list';
  shown.forEach((category) => {
    categoryList.appendChild(createCategorySection(category));
  });

  body.appendChild(categoryList);
  // 右下角的 + 是"新建任务"：这一页上最常做的事。
  // "已归档"下面不给：任务只能放进没归档的清单，建完不会出现在这一页。
  // 一个没归档的清单都没有时也不给：任务总得放进某个清单里
  if (listTagFilter !== 'archived' && categoriesInFilter('all').length > 0) {
    view.classList.add('has-fab');    // 列表底部多留点空，别让最后一个清单的 ⋯ 被 + 按钮挡住
    view.appendChild(createFab('新建任务', openTaskDraft));
  }
  if (taskDraft !== null) {
    view.appendChild(createTaskDraftPanel());
  }
  if (categoryDraft !== null) {
    view.appendChild(createCategoryDraftPanel());
  }
  return view;
}

// 展开的空清单下面那行小字。点它弹出新建任务面板 —— 和右下角 + 一样；
// 清单正展开着，面板默认放进的就是它。
// 归档了的清单不能再往里放任务（面板里也选不到它），所以只说没有内容，不说"点击添加"，点了也没反应
function createEmptyListHint(category) {
  const hint = document.createElement('div');
  hint.className = 'empty-list-hint';

  if (isCategoryArchived(category)) {
    hint.textContent = '该清单内还没有内容';
    return hint;
  }

  hint.textContent = '该清单内还没有内容，点击添加';
  hint.classList.add('clickable');
  hint.setAttribute('role', 'button');
  hint.addEventListener('click', () => {
    if (shouldIgnoreClick()) return;
    if (closeMenuIfOpen()) return;
    openTaskDraft();
  });
  return hint;
}

// 筛选后一个清单都没有时说什么
function listEmptyMessage(shown) {
  if (shown.length > 0) return '';
  if (listTagFilter === 'archived') {
    return '还没有归档的清单。暂时不用的清单，可以在它的 ⋯ 菜单里归档。';
  }
  if (listTagFilter === 'all') {
    return categories.length > 0
      ? '没有正在用的清单，归档了的在「已归档」里。'
      : '还没有清单。点右上角的 ⋯ 新建一个。';
  }
  return '这个标签下还没有清单。点右上角的 ⋯ 新建，或者在清单的 ⋯ 菜单里放进来。';
}

// ---- 新建清单 ----
function openCategoryDraft() {
  // 正停在某个标签下的话，默认就放进这个标签
  categoryDraft = { name: '', tagId: findListTag(listTagFilter) ? listTagFilter : null };
  render();
}

// 面板里：名字 + 放进哪个标签（像文件夹，只能选一个，再点一下就是不放）
function createCategoryDraftPanel() {
  const draft = categoryDraft;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'add-input';
  input.placeholder = '清单名称';
  // 点标签会让页面重画、输入框被重新造一个，所以边打字边把名字记下来，不然一点标签字就没了
  input.value = draft.name;
  input.addEventListener('input', () => {
    draft.name = input.value;
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      draft.name = input.value;
      submitCategoryDraft();
    } else if (event.key === 'Escape') {
      cancelCategoryDraft();
    }
  });

  const picker = createTagPicker(
    listTagSet,
    draft.tagId ? [draft.tagId] : [],
    (tagId) => {
      draft.tagId = draft.tagId === tagId ? null : tagId;
      render();
    },
    'lists-draft',
    (tag) => {
      draft.tagId = tag.id;    // 在这里新建的标签，当然是想放进去的
      render();
    }
  );

  return createPopupCard({
    title: '新建清单',
    body: [input, picker],     // 不写"放到标签"：一排标签、选中的蓝底，一看就懂
    onSubmit: submitCategoryDraft,
    onCancel: cancelCategoryDraft
  });
}

function submitCategoryDraft() {
  const draft = categoryDraft;
  categoryDraft = null;
  addingTagIn = null;

  // 名字为空或重名时不会新建，但面板还是要收起来
  if (!addCategory(draft.name, draft.tagId)) {
    render();
    return;
  }

  // 正在看"公司"，却把新清单放进了别的标签：建完它不在当前页面上，看起来像没建成 —— 切回"所有"
  if (listTagFilter !== 'all' && listTagFilter !== draft.tagId) {
    listTagFilter = 'all';
    render();
  }
}

function cancelCategoryDraft() {
  categoryDraft = null;
  addingTagIn = null;
  render();
}

// ---- 新建任务（右下角的 +）----
// 默认放进展开着的那个清单 —— 你正在看的就是它。
// 它不在当前页面上（比如被筛选掉了、或者全都收着）时，放进页面上的第一个清单
function defaultTaskCategory() {
  const shown = categoriesInFilter(listTagFilter);
  if (shown.includes(expandedCategory)) return expandedCategory;
  if (shown.length > 0) return shown[0];
  return categoriesInFilter('all')[0] || null;
}

// 新建任务的草稿：名字、放进哪个清单、截止时间和提醒（dueAt / remindBefore），
// editingDue 表示面板里的闹钟设置区是不是展开着
function newTaskDraft(category) {
  return { text: '', category: category, dueAt: null, remindBefore: null, editingDue: false };
}

function openTaskDraft() {
  taskDraft = newTaskDraft(defaultTaskCategory());
  render();
}

// 面板里：任务名 + 放进哪个清单（只能选一个）
function createTaskDraftPanel() {
  const draft = taskDraft;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'add-input';
  input.placeholder = '任务名称';
  // 点清单会让页面重画、输入框被重新造一个，所以边打字边记下来，不然一点清单字就没了
  input.value = draft.text;
  input.addEventListener('input', () => {
    draft.text = input.value;
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      draft.text = input.value;
      submitTaskDraft(true);     // 回车：加完留着面板，接着输下一条
    } else if (event.key === 'Escape') {
      cancelTaskDraft();
    }
  });

  // 一排清单，选中的是蓝底 —— 不用再写"放进清单"几个字，一看就懂。
  // 长得和选标签的那排一样。归档了的清单不列：暂时不用的地方，不该往里放东西
  const picker = document.createElement('div');
  picker.className = 'tag-picker';
  categoriesInFilter('all').forEach((category) => {
    const option = document.createElement('button');
    option.className = 'tag-option list-option';
    option.textContent = category;
    if (category === draft.category) option.classList.add('selected');
    option.addEventListener('click', () => {
      draft.category = category;
      render();
    });
    picker.appendChild(option);
  });

  // 这一排最后是闹钟，和详情页"清单标签旁边是闹钟"一个样子、一样的逻辑
  picker.appendChild(createDueButton(draft.dueAt, draft.remindBefore, () => {
    draft.editingDue = !draft.editingDue;
    render();
  }));

  const body = [input, picker];
  if (draft.editingDue) {
    body.push(createDueEditor(draft.dueAt, draft.remindBefore, {
      onSave: (inputValue, remindValue) => {
        const parsed = parseDueInput(inputValue, remindValue);
        if (!parsed) return;      // 没选日期就不保存，设置区留着
        draft.dueAt = parsed.dueAt;
        draft.remindBefore = parsed.remindBefore;
        draft.editingDue = false;
        // 和详情页一样：要提醒的话，趁用户刚点完按钮申请通知权限（浏览器只在用户操作时才允许弹）
        if (parsed.remindBefore !== null) ensureNotifyPermission();
        render();
      },
      onCancel: () => {
        draft.editingDue = false;
        render();
      },
      onClear: () => {
        draft.dueAt = null;
        draft.remindBefore = null;
        draft.editingDue = false;
        render();
      }
    }));
  }

  return createPopupCard({
    title: '新建任务',
    body: body,
    submitText: '添加',
    // 包一层再传：点击时浏览器会把"点击事件"塞给第一个参数，直接传 submitTaskDraft 的话，
    // keepOpen 就成了那个事件（算"真"），点"添加"也不收起了
    onSubmit: () => submitTaskDraft(false),
    onCancel: cancelTaskDraft
  });
}

// keepOpen 为 true（按回车）时，加完留着面板、清空名字，方便一口气加好几条 ——
// 原来清单底下的"+ 添加任务"就是这样用的，去掉它之后这个本事不能丢。
// 点"添加"按钮时加完就收起；空着按回车 = 加完了，也收起
function submitTaskDraft(keepOpen) {
  const draft = taskDraft;
  taskDraft = null;

  // 名字空着、或者选的清单已经不能用了（被删、被归档），什么都不加，面板收起来
  const usable = categoriesInFilter('all').includes(draft.category);
  if (draft.text.trim() === '' || !usable) {
    render();
    return;
  }

  // 加完要让人看到它：展开放进去的那个清单；它不在当前筛选里的话，切回"所有"
  expandedCategory = draft.category;
  saveExpandedCategory();
  if (!categoriesInFilter(listTagFilter).includes(draft.category)) {
    listTagFilter = 'all';
  }
  if (keepOpen) {
    // 接着输下一条：还放进同一个清单，但时间清空 —— 每条任务的时间一般不一样，带着上一条的容易设错
    taskDraft = newTaskDraft(draft.category);
  }
  addTodo(draft.category, draft.text, { dueAt: draft.dueAt, remindBefore: draft.remindBefore });
}

function cancelTaskDraft() {
  taskDraft = null;
  render();
}

// ---- "今天"标签页 ----
// 把所有清单里今天到期和已经过期的任务汇总到一起。
// 不需要新的数据结构，就是对现有的 dueAt 做一次筛选
function startOfToday() {
  const now = nowFn();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function createTodayView() {
  // 标题和日期固定在上面，下面的任务自己滚（骨架见 createScrollingPage）
  const { page: view, top, body } = createScrollingPage('today-view');

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
  top.appendChild(title);

  const date = document.createElement('div');
  date.className = 'view-subtitle';
  date.textContent = formatDate(nowFn());
  top.appendChild(date);

  if (overdue.length === 0 && today.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '今天没有到期的任务。给任务设置截止时间后，它们会出现在这里。';
    body.appendChild(empty);
    return view;
  }

  if (overdue.length > 0) {
    body.appendChild(createTodaySection('已过期', overdue, 'overdue'));
  }
  if (today.length > 0) {
    body.appendChild(createTodaySection('今天到期', today, ''));
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
    // 这一页混着不同清单的任务：没有"顺序"可言，不能拖；置顶也说不清是在这一页置顶还是在原清单里置顶，不放
    const li = createTodoItem(item.todo, item.index, { draggable: false, pinnable: false });

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

  // 收起来的清单不画下面的内容
  if (!isCollapsed(category)) {
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
    // 清单底下原来有一行"+ 添加任务"，和右下角的 + 重复了，去掉。新建任务一律走右下角的 +

    // 一条任务都没有的清单，展开和收起看起来一模一样（标题下面都是空的），分不清点没点开。
    // 所以展开时给一行小字。只剩已完成 / 已放弃的清单不用：下面有"已完成 3"这样的分组，看得出是展开的
    if (items.length === 0) {
      section.appendChild(createEmptyListHint(category));
    }
    section.appendChild(createSubGroup(category, 'done', '已完成',
      items.filter((item) => item.todo.status === 'done')));
    section.appendChild(createSubGroup(category, 'abandoned', '已放弃',
      items.filter((item) => item.todo.status === 'abandoned')));
  } else {
    // 收起来的清单也放一个空的任务列表，平时看不见。
    // 一次只展开一个清单，别的清单全都收着 —— 没有它的话，任务就再也拖不进别的清单了。
    // 拖着任务经过这个清单时，那一行占位会落进这里（正好显示"会放到这儿"），松手就放进这个清单的最前面
    const dropZone = document.createElement('ul');
    dropZone.className = 'collapsed-drop';
    section.appendChild(dropZone);
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

  // 清单标题前面不放三角：展开着的清单下面就是它的任务，一眼就看得出，三角只是多一个不好看的符号。
  // 但读屏软件"看"不到下面有没有东西，所以用 aria-expanded 悄悄告诉它（界面上看不见）
  header.setAttribute('role', 'button');
  header.setAttribute('aria-expanded', String(!isCollapsed(category)));

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
  // 已完成和已放弃的都收在分组里，置顶按钮对它们没有意义，就不显示了；
  // 调用方也可以说不要（"今天"页）
  if (todo.status === 'active' && options.pinnable !== false) {
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
  plus: 'M12 5v14M5 12h14',
  // 闹钟（Lucide 的 alarm-clock）：表盘 + 指针 + 头上两只"耳朵" + 两条腿
  alarm: 'M12 5a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 9v4l2 2M5 3L2 6M22 6l-3-3M6.38 18.7L4 21M17.64 18.67L20 21',
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

// ---- 清单页、今天页、打卡页共用的页面骨架：上面固定，下面自己滚 ----
// 为什么不让整个网页一起滚：那样标签行会跟着滚走，右边还会冒出网页的滚动条，
// 滑到头时整页还会弹一下 —— 一看就是网页，不像 App。
// 所以整个页面钉在屏幕上不动（样式在 style.css 的 .page），只让下面装列表的那一块自己滚，并且把滚动条藏起来。
//
// 返回 { page, top, body }：标题、标签行放进 top，列表放进 body；右下角的 + 和新建面板放进 page
function createScrollingPage(className) {
  const page = document.createElement('div');
  page.className = className ? 'page ' + className : 'page';

  const top = document.createElement('div');
  top.className = 'page-top';

  const body = document.createElement('div');
  body.className = 'page-scroll';

  page.append(top, body);
  return { page: page, top: top, body: body };
}

// ---- 右下角悬浮的新建按钮 ----
// 清单多了以后，"新建"要是放在列表最底下，每次都得滑到底才点得到。
// 浮在右下角就一直够得着。清单页和打卡页共用，以后别的页面要"新建"也用它
function createFab(label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'fab';
  btn.title = label;
  btn.setAttribute('aria-label', label);   // 按钮上只有一个 + 号，读屏软件要靠这个知道它是干嘛的
  btn.appendChild(createIcon('plus', 'fab-icon'));
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (closeMenuIfOpen()) return;
    onClick();
  });
  return btn;
}

// ---- 新建面板：半透明遮罩 + 靠上方的卡片 + 取消 / 创建 ----
// 只管外面这个"壳"，卡片里放什么由调用方决定（打卡要名字 + 多选标签，清单要名字 + 单选标签）。
//
// 为什么靠上方而不是贴底：iPhone 上网页弹出键盘时，贴底的东西常被键盘盖住或跳来跳去；
// 放在上方，键盘从下面升起来怎么都挡不住它。
//
// options: { title, body: [元素…], submitText, onSubmit, onCancel }
function createPopupCard(options) {
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  // 点卡片外面的暗色区域 = 取消。点卡片里面不算（事件目标是卡片里的东西，不是遮罩本身）
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) options.onCancel();
  });

  const card = document.createElement('div');
  card.className = 'popup-card';
  card.setAttribute('role', 'dialog');

  const title = document.createElement('div');
  title.className = 'popup-title';
  title.textContent = options.title;
  card.appendChild(title);

  options.body.forEach((element) => card.appendChild(element));

  const actions = document.createElement('div');
  actions.className = 'popup-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'popup-cancel';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', options.onCancel);

  const submitBtn = document.createElement('button');
  submitBtn.className = 'popup-submit';
  submitBtn.textContent = options.submitText || '创建';
  submitBtn.addEventListener('click', options.onSubmit);

  actions.append(cancelBtn, submitBtn);
  card.appendChild(actions);
  overlay.appendChild(card);
  return overlay;
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
// 从任务详情页回到列表。左上角返回键和往右滑都走这里
function closeTaskDetail() {
  detailIndex = null;
  editingDueFor = null;
  render();
}

function createDetailPage(index) {
  const todo = todos[index];
  const page = document.createElement('div');
  page.className = 'detail-page';     // 右滑返回时靠这个找到要跟着手指走的整页

  // 顶部一左一右两个悬浮圆按钮，⋯ 菜单从卡片里挪到了右上角
  const header = createPageHeader(closeTaskDetail, { key: 'task-' + index, items: todoMenuItems(index) });

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
    // 详情页不放置顶按钮：置顶是"在清单里排前面"，在清单里点就行，放在这里只会让人分不清是在哪置顶
  }

  page.append(header, card);

  // 标题下面一行：属于哪个清单（虚线框的标签）+ 闹钟。
  // 原来这里是"状态 / 清单 / 开始时间 / 截止时间 / 提醒"一行行的表格：
  // 状态看勾选框就知道，开始时间没人关心（数据照样记着，只是不显示），截止时间和提醒合进闹钟里
  const meta = document.createElement('div');
  meta.className = 'detail-meta';

  const listChip = document.createElement('span');
  listChip.className = 'list-chip';
  listChip.textContent = todo.category;

  meta.append(listChip, createDueButton(todo.dueAt, todo.remindBefore, () => {
    editingDueFor = editingDueFor === index ? null : index;   // 再点一次收起
    render();
  }));
  page.appendChild(meta);

  if (editingDueFor === index) {
    page.appendChild(createDueEditor(todo.dueAt, todo.remindBefore, {
      onSave: (inputValue, remindValue) => setDue(index, inputValue, remindValue),
      onCancel: () => {
        editingDueFor = null;
        render();
      },
      onClear: () => clearDue(index)
    }));
  }

  // 设了提醒但浏览器不给弹通知，得告诉用户一声，否则会以为坏了
  if (todo.dueAt && todo.remindBefore !== null && notifier.permission() !== 'granted') {
    const notice = document.createElement('div');
    notice.className = 'notice';
    notice.textContent = notifier.permission() === 'denied'
      ? '⚠️ 浏览器的通知权限被拒绝了，到点不会弹提醒。可以在浏览器设置里重新允许。'
      : '⚠️ 还没允许通知，到点可能不会弹提醒。';
    page.appendChild(notice);
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
// 闹钟：截止时间和提醒合在这一个按钮里，点开就能设置。详情页和新建任务面板共用。
// 没设时间：只有一个灰色的闹钟。设了时间：闹钟变红，旁边写上什么时候到期。
// 提醒没有单独显示在界面上（地方小），但读屏软件和鼠标悬停时能听到 / 看到。
// 点了之后做什么由调用方决定（详情页是展开编辑区，面板里也是，但记在不同的地方）
function createDueButton(dueAt, remindBefore, onClick) {
  const btn = document.createElement('button');
  btn.className = dueAt ? 'due-btn has-due' : 'due-btn';
  btn.appendChild(createIcon('alarm', 'due-icon'));

  if (dueAt) {
    const time = document.createElement('span');
    time.className = 'due-text';
    time.textContent = formatDueShort(dueAt);
    btn.appendChild(time);
    const label = `截止 ${formatDateTime(dueAt)}，${remindLabel(remindBefore)}`;
    btn.title = label;
    btn.setAttribute('aria-label', label);
  } else {
    btn.title = '设置截止时间和提醒';
    btn.setAttribute('aria-label', '设置截止时间和提醒');
  }

  btn.addEventListener('click', onClick);
  return btn;
}

// 闹钟旁边的时间写得短一点：今天 22:50 / 明天 09:00 / 9月20日 09:00 / 2027年1月3日 09:00
// 按本地日期比，不能拿 ISO 字符串的前 10 位比（那是 UTC 日期，晚上的时间会算错天）
function formatDueShort(isoText) {
  const due = new Date(isoText);
  const pad = (n) => String(n).padStart(2, '0');
  const time = `${pad(due.getHours())}:${pad(due.getMinutes())}`;

  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.round((new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() - startOfToday()) / dayMs);
  if (days === 0) return `今天 ${time}`;
  if (days === 1) return `明天 ${time}`;
  if (days === -1) return `昨天 ${time}`;

  const sameYear = due.getFullYear() === nowFn().getFullYear();
  const date = `${due.getMonth() + 1}月${due.getDate()}日`;
  return sameYear ? `${date} ${time}` : `${due.getFullYear()}年${date} ${time}`;
}

// 点了时钟图标之后展开的编辑区：选时间 + 选提醒方式
// 闹钟下面展开的设置区：选时间 + 选提醒方式。详情页和新建任务面板共用。
// 选完交给调用方：actions.onSave(输入框的值, 提醒的值) / onCancel() / onClear()
function createDueEditor(dueAt, remindBefore, actionsFor) {
  const box = document.createElement('div');
  box.className = 'due-editor';

  const dateInput = document.createElement('input');
  dateInput.type = 'datetime-local';
  dateInput.className = 'due-input';
  dateInput.value = toDateTimeInputValue(dueAt);

  const select = document.createElement('select');
  select.className = 'remind-select';
  REMIND_OPTIONS.forEach((option) => {
    const optionEl = document.createElement('option');
    optionEl.value = option.minutes === null ? '' : String(option.minutes);
    optionEl.textContent = option.label;
    if (remindBefore === option.minutes) {
      optionEl.selected = true;
    }
    select.appendChild(optionEl);
  });

  const actions = document.createElement('div');
  actions.className = 'due-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-primary';
  saveBtn.textContent = '保存';
  saveBtn.addEventListener('click', () => actionsFor.onSave(dateInput.value, select.value));

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-plain';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', () => actionsFor.onCancel());

  actions.append(saveBtn, cancelBtn);

  // 已经设过截止时间才需要"清除"
  if (dueAt) {
    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn-danger';
    clearBtn.textContent = '清除';
    clearBtn.addEventListener('click', () => actionsFor.onClear());
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
// due：新建时就带上截止时间和提醒（新建任务面板里用闹钟设的），不传就是没设
function addTodo(category, text, due = {}) {
  const trimmed = text.trim();
  if (trimmed === '') return false;
  const dueAt = due.dueAt || null;

  todos.push({
    text: trimmed,
    status: 'active',                   // active / done / abandoned
    category: category,
    createdAt: nowFn().toISOString(),   // 创建时把当前系统时间记下来
    dueAt: dueAt,                       // 截止时间：新建时用闹钟设，或者以后在详情页里设
    // 提前多少分钟提醒，null = 不提醒。没有截止时间就谈不上提醒。注意 0（准时提醒）也是设了
    remindBefore: dueAt && due.remindBefore !== undefined ? due.remindBefore : null,
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
  expandedCategory = trimmed;    // 新建的清单直接展开，马上就能往里加任务

  saveCategories();
  saveExpandedCategory();
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

// 点清单标题：展开它，其它的自动收起；点的正是展开着的那个，就把它收起来
function toggleCollapse(category) {
  expandedCategory = expandedCategory === category ? null : category;
  saveExpandedCategory();
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
// 把闹钟设置区里填的值变成要存的数据。没选日期返回 null（不保存）。
// 详情页和新建任务面板共用，免得两边换算得不一样
function parseDueInput(inputValue, remindValue) {
  if (inputValue === '') return null;
  return {
    dueAt: new Date(inputValue).toISOString(),   // 不带时区的写法按本地时间解析，正是用户填的那个时间
    remindBefore: remindValue === '' ? null : Number(remindValue)
  };
}

function setDue(index, inputValue, remindValue) {
  const parsed = parseDueInput(inputValue, remindValue);
  if (!parsed) return false;      // 没选日期就不保存

  const todo = todos[index];
  todo.dueAt = parsed.dueAt;
  todo.remindBefore = parsed.remindBefore;
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

    // 交给系统之后，这条早就排在 iOS 那边、到点它自己弹过了（app 关着也弹），
    // 这里只把"已经提醒过"记下来，不能再弹一遍，否则一打开应用就是一串重复通知
    const shown = reminderScheduler !== null || notifier.show('待办提醒', {
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

// ---- 交给系统的提醒单子 ----
// iOS 一个应用最多只能排 64 条等着弹的通知，多的直接不收。
// 所以只交最近的 60 条：留点余地，而且人也不会真的指望三个月后那条
const MAX_SCHEDULED_REMINDERS = 60;

// 还没提醒过、时间还没到的提醒，按时间先后排。
// 时间已经过了的不交给系统（排一条"过去的闹钟"没有意义），它们由 checkReminders 在打开应用时收尾
function pendingReminders() {
  const now = nowFn().getTime();

  return todos
    .filter((todo) => (
      todo.dueAt
      && todo.remindBefore !== null
      && !todo.reminded
      && todo.status === 'active'
      && !isCategoryArchived(todo.category)
      && new Date(todo.dueAt).getTime() - todo.remindBefore * 60 * 1000 > now
    ))
    .map((todo) => ({
      fireAt: new Date(new Date(todo.dueAt).getTime() - todo.remindBefore * 60 * 1000).toISOString(),
      title: '待办提醒',
      body: `${todo.text}（截止 ${formatDateTime(todo.dueAt)}）`
    }))
    .sort((a, b) => a.fireAt.localeCompare(b.fireAt))
    .slice(0, MAX_SCHEDULED_REMINDERS);
}

// 每次重画完调一次（见 render）。单子和上次一模一样就不交了 ——
// 重画很频繁（点一下就重画），每次都让系统把通知全撤了重排没必要
function syncReminders() {
  if (reminderScheduler === null) return;

  const list = pendingReminders();
  const text = JSON.stringify(list);
  if (text === lastRemindersJson) return;

  lastRemindersJson = text;
  reminderScheduler.replaceAll(list);
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
  if (expandedCategory === oldName) expandedCategory = trimmed;
  // 放在哪个标签下、有没有归档，也是按名字记的
  if (categoryMeta[oldName]) {
    categoryMeta[trimmed] = categoryMeta[oldName];
    delete categoryMeta[oldName];
  }

  saveCategories();
  saveTodos();
  saveExpandedCategory();
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
  if (expandedCategory === category) expandedCategory = null;
  delete categoryMeta[category];  // 不删的话，以后再建个同名清单会莫名其妙出现在某个标签下
  deleteAttachmentsOf(removed);   // 连带删掉这些任务的附件文件
  if (editingCategory === category) editingCategory = null;

  saveCategories();
  saveTodos();
  saveExpandedCategory();
  saveCategoryMeta();
  render();
  return true;
}
