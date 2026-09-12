// 打卡（QuickLog）
//
// 和待办清单是两块互不相干的数据，各存各的。
// 这个文件用到 app.js 里的公共工具（storage、nowFn、confirmFn、render、createMenu、
// createRenameInput、createDetailRow、formatDateTime、closeMenuIfOpen），
// 所以页面里必须排在 app.js 后面加载。

const LOG_DAY_MS = 24 * 60 * 60 * 1000;
const LOG_WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];   // 月历周一开头

// ---- 数据 ----
// 每个打卡项目长这样：
//   { id, name, createdAt, entries: ['2026-09-10T12:30:00.000Z', ...] }
//
// 只记"每一次打卡的时间"，不单独存"总次数"。
// 总次数、上次打卡、月历全都从 entries 算出来 —— 要是只存一个数字，
// 就不知道每天打了几次，月历也就没法画了。
//
// 用 id 认人，不用名字：清单当初用名字当标识，改个名得同步好几处地方；
// 打卡从一开始就用 id，改名只需要改名字这一个字段
let logItems = [];

// ---- 界面状态 ----
// 这些全都要在 resetLogViewState() 里重置，否则会在测试之间、或者重开 App 时泄漏
let logDetailId = null;        // 正在看哪个打卡项目的详情（null = 没在看）
let logCalendarMonth = null;   // 详情页月历正在看哪个月，形如 '2026-09'
let logSelectedDay = null;     // 详情页选中了哪一天，形如 '2026-09-11'（底下列的是这天的记录）
let backfillingDay = null;     // 正在给哪一天补录（也是 '2026-09-11' 这种日期）
let addingLogItem = false;     // 是否正在输入新打卡项目的名字
let editingLogItemId = null;   // 正在改名的打卡项目
let undoToast = null;          // 刚打完卡时底部的"撤销"提示：{ itemId, entry }
let undoToastTimer = null;
let undoToastDuration = 4000;  // 撤销提示显示多久（毫秒）

function useToastDuration(ms) {    // 测试时改短，免得真等 4 秒
  undoToastDuration = ms;
}

function resetLogViewState() {
  logDetailId = null;
  logCalendarMonth = null;
  logSelectedDay = null;
  backfillingDay = null;
  addingLogItem = false;
  editingLogItemId = null;
  hideUndoToast();
}

// ---- 读写存储 ----
function loadLogItems() {
  const saved = storage.getItem('logItems');
  return saved ? JSON.parse(saved) : [];
}

function saveLogItems() {
  storage.setItem('logItems', JSON.stringify(logItems));
}

function findLogItem(id) {
  return logItems.find((item) => item.id === id) || null;
}

function makeLogId() {
  return 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

// ---- 日期工具 ----
// 把一个时间换成"本地日期"，形如 '2026-09-10'。
//
// 千万别偷懒直接取 ISO 字符串的前 10 位：那是 UTC 的日期，不是你手机上的日期。
// 比如在比 UTC 慢 7 小时的时区，晚上 8 点打的卡存成 ISO 是第二天凌晨 3 点，
// 取前 10 位就会被算到第二天去
function logDateKey(value) {
  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function logMonthKey(value) {
  return logDateKey(value).slice(0, 7);
}

// 在 '2026-09' 这样的月份上加减几个月，会自动跨年
function shiftLogMonth(monthKey, offset) {
  const [year, month] = monthKey.split('-').map(Number);
  return logMonthKey(new Date(year, month - 1 + offset, 1));
}

// 月历的格子：前面补几个空格，让 1 号对上星期几（周一开头），然后是 1 号到月底
function logMonthCells(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const firstWeekday = new Date(year, month - 1, 1).getDay();   // 周日=0 … 周六=6
  const leadingBlanks = (firstWeekday + 6) % 7;                 // 换算成 周一=0 … 周日=6
  const daysInMonth = new Date(year, month, 0).getDate();       // "下个月的第 0 天"就是这个月最后一天

  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  return cells;
}

function logDayStart(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// ---- 统计：全部从 entries 算出来 ----
function countLogsByDay(item) {
  const counts = {};
  item.entries.forEach((entry) => {
    const key = logDateKey(entry);
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function countLogsInMonth(item, monthKey) {
  return item.entries.filter((entry) => logMonthKey(entry) === monthKey).length;
}

function lastLogEntry(item) {
  // 同样格式的 ISO 时间字符串可以直接比大小
  return item.entries.reduce(
    (latest, entry) => (latest === null || entry > latest ? entry : latest),
    null
  );
}

function describeLastLog(item) {
  const last = lastLogEntry(item);
  if (last === null) return '还没打过卡';

  // 按"隔了几个日历日"算，而不是"隔了几个 24 小时"：
  // 昨晚 11 点打的卡，今早 8 点看应该是"昨天"，而不是"今天"
  const days = Math.round((logDayStart(nowFn()) - logDayStart(last)) / LOG_DAY_MS);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  return `${days} 天前`;
}

// ---- 操作 ----
// 约定和 app.js 一样：会改界面的操作自己负责保存和重画；
// recordLog / removeLogEntry 只改数据，由调用方决定什么时候重画
function addLogItem(name) {
  const trimmed = name.trim();
  if (trimmed === '' || logItems.some((item) => item.name === trimmed)) return false;

  logItems.push({
    id: makeLogId(),
    name: trimmed,
    createdAt: nowFn().toISOString(),
    entries: []
  });
  saveLogItems();
  render();
  return true;
}

function renameLogItem(id, newName) {
  const item = findLogItem(id);
  const trimmed = newName.trim();
  if (!item || trimmed === '' || trimmed === item.name) return false;
  if (logItems.some((other) => other.id !== id && other.name === trimmed)) return false;

  // 因为是用 id 认人，这里只改名字就完事了，不用去同步别的地方
  item.name = trimmed;
  saveLogItems();
  render();
  return true;
}

function deleteLogItem(id) {
  const item = findLogItem(id);
  if (!item) return false;

  if (item.entries.length > 0) {
    const ok = confirmFn(`「${item.name}」有 ${item.entries.length} 次打卡记录，删除后这些记录都会没有，确定吗？`);
    if (!ok) return false;
  }

  logItems = logItems.filter((other) => other.id !== id);
  if (logDetailId === id) logDetailId = null;
  if (undoToast && undoToast.itemId === id) hideUndoToast();

  saveLogItems();
  render();
  return true;
}

// 记一次：把当前时间追加进去，返回这条记录（撤销时要用它找回这一条）
function recordLog(id) {
  const item = findLogItem(id);
  if (!item) return null;

  const entry = nowFn().toISOString();
  item.entries.push(entry);
  saveLogItems();
  return entry;
}

// 删掉某一条记录。同一时刻刚好有两条一模一样的，也只删一条
function removeLogEntry(id, entry) {
  const item = findLogItem(id);
  if (!item) return false;

  const position = item.entries.lastIndexOf(entry);
  if (position === -1) return false;

  item.entries.splice(position, 1);
  saveLogItems();
  return true;
}

// 补录：给过去的某一天补上一次。
// dateKey 形如 '2026-09-06'，timeText 形如 '19:30'
function backfillLog(id, dateKey, timeText) {
  const item = findLogItem(id);
  if (!item || !timeText) return false;

  // 'YYYY-MM-DDTHH:mm' 这种不带时区的写法，浏览器会按本地时间解析 —— 正是我们要的：
  // 用户补的是"那天晚上 11 点半"，指的当然是他自己那边的 11 点半
  const moment = new Date(`${dateKey}T${timeText}`);
  if (isNaN(moment.getTime())) return false;

  item.entries.push(moment.toISOString());
  saveLogItems();
  backfillingDay = null;
  render();
  return true;
}

// 点数字：记一次，并在底部给一个"撤销"的机会（手机上很容易点错）
function quickLog(id) {
  const entry = recordLog(id);
  if (entry === null) return;
  showUndoToast(id, entry);
  render();
}

function showUndoToast(itemId, entry) {
  hideUndoToast();
  undoToast = { itemId: itemId, entry: entry };
  undoToastTimer = setTimeout(() => {
    undoToastTimer = null;
    undoToast = null;
    render();
  }, undoToastDuration);
}

function hideUndoToast() {
  if (undoToastTimer !== null) {
    clearTimeout(undoToastTimer);
    undoToastTimer = null;
  }
  undoToast = null;
}

// 撤销的是"刚才点的那一次"，不是"列表里最后一条"：按记录的时间找到它再删
function undoQuickLog() {
  if (!undoToast) return;
  removeLogEntry(undoToast.itemId, undoToast.entry);
  hideUndoToast();
  render();
}

function openLogDetail(id) {
  logDetailId = id;
  logCalendarMonth = logMonthKey(nowFn());   // 每次进来都先看当月
  logSelectedDay = logDateKey(nowFn());      // 底下默认列出今天的记录
  render();
}

// ---- "打卡"标签页 ----
function createLogsView() {
  const view = document.createElement('div');
  view.className = 'logs-view';

  const title = document.createElement('h1');
  title.textContent = '打卡';
  view.appendChild(title);

  if (logItems.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '还没有打卡项目。比如"喝水""健身""给猫驱虫"，新增一个试试。';
    view.appendChild(empty);
  }

  const list = document.createElement('ul');
  logItems.forEach((item) => list.appendChild(createLogItemRow(item)));
  view.appendChild(list);

  view.appendChild(createNewLogItemRow());
  return view;
}

// 一个打卡项目：左边是名字和"上次打卡"，右边一个大数字（累计总次数）
function createLogItemRow(item) {
  const li = document.createElement('li');
  li.className = 'log-item';
  li.dataset.id = item.id;
  // 点卡片进详情；点右边的数字是记一次（数字按钮自己会拦住点击，不会冒泡到这里）
  li.addEventListener('click', () => {
    if (closeMenuIfOpen()) return;
    openLogDetail(item.id);
  });

  const info = document.createElement('div');
  info.className = 'log-info';

  const name = document.createElement('span');
  name.className = 'log-name';
  name.textContent = item.name;

  const meta = document.createElement('span');
  meta.className = 'log-meta';
  meta.textContent = item.entries.length > 0
    ? '上次：' + describeLastLog(item)
    : describeLastLog(item);

  info.append(name, meta);
  li.append(info, createLogCountButton(item));
  return li;
}

// 大数字按钮：列表页和详情页共用
function createLogCountButton(item) {
  const btn = document.createElement('button');
  btn.className = 'log-count';
  btn.textContent = String(item.entries.length);
  btn.title = '点一下记一次';
  btn.addEventListener('click', (event) => {
    event.stopPropagation();   // 不要顺带进详情页
    if (closeMenuIfOpen()) return;
    quickLog(item.id);
  });
  return btn;
}

// 列表底部的"+ 新增打卡"，点了之后变成输入框。写法和"+ 新建清单"一样
function createNewLogItemRow() {
  if (!addingLogItem) {
    const btn = document.createElement('button');
    btn.className = 'new-log-btn';
    btn.textContent = '+ 新增打卡';
    btn.addEventListener('click', () => {
      if (closeMenuIfOpen()) return;
      addingLogItem = true;
      render();
    });
    return btn;
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'add-input';
  input.placeholder = '打卡项目名称，回车创建';

  // render() 重画时输入框被删掉，浏览器也会触发一次 blur，用这个开关区分
  let skipBlur = false;

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      skipBlur = true;
      addingLogItem = false;
      // 名字为空或重名时不会新增，但输入框还是要收起来
      if (!addLogItem(input.value)) render();
    } else if (event.key === 'Escape') {
      skipBlur = true;
      addingLogItem = false;
      render();
    }
  });

  input.addEventListener('blur', () => {
    if (skipBlur) return;
    addingLogItem = false;
    render();
  });

  return input;
}

// ---- 打卡详情页 ----
function createLogDetailPage(id) {
  const item = findLogItem(id);
  const page = document.createElement('div');

  const back = document.createElement('button');
  back.className = 'back-btn';
  back.textContent = '← 返回';
  back.addEventListener('click', () => {
    logDetailId = null;
    editingLogItemId = null;
    render();
  });
  page.appendChild(back);

  // 万一这个项目已经不在了，就只留一个返回按钮
  if (!item) return page;

  const card = document.createElement('div');
  card.className = 'detail-card';

  if (editingLogItemId === id) {
    card.appendChild(createRenameInput(
      item.name,
      (newName) => {
        // 先退出改名状态再改名，这样改名时那一次重画就已经是最终的样子
        editingLogItemId = null;
        if (!renameLogItem(id, newName)) render();
      },
      () => {
        editingLogItemId = null;
        render();
      }
    ));
  } else {
    const title = document.createElement('span');
    title.className = 'detail-title';
    title.textContent = item.name;
    title.addEventListener('click', () => {
      editingLogItemId = id;
      render();
    });

    card.append(title, createLogCountButton(item), createMenu('log-' + id, [
      { text: '重命名', action: () => { editingLogItemId = id; render(); } },
      { type: 'divider' },
      { text: '删除打卡项目', danger: true, action: () => deleteLogItem(id) }
    ]));
  }
  page.appendChild(card);

  page.appendChild(createLogStats(item));
  page.appendChild(createLogCalendar(item));
  page.appendChild(createLogEntryList(item));
  return page;
}

// 横排的三个小方块：总次数 / 本月 / 上次打卡
function createLogStats(item) {
  const row = document.createElement('div');
  row.className = 'stat-row';

  const stats = [
    { label: '总次数', value: String(item.entries.length) },
    { label: '本月', value: String(countLogsInMonth(item, logMonthKey(nowFn()))) },
    // 这里用"今天 / 昨天 / 5 天前"而不是完整时间，小方块塞不下那么长
    { label: '上次打卡', value: describeLastLog(item) }
  ];

  stats.forEach((stat) => {
    const tile = document.createElement('div');
    tile.className = 'stat-tile';

    const value = document.createElement('span');
    value.className = 'stat-value';
    value.textContent = stat.value;

    const label = document.createElement('span');
    label.className = 'stat-label';
    label.textContent = stat.label;

    tile.append(value, label);
    row.appendChild(tile);
  });

  return row;
}

function createLogCalendar(item) {
  const box = document.createElement('div');
  box.className = 'log-calendar';

  const header = document.createElement('div');
  header.className = 'calendar-header';

  const title = document.createElement('span');
  title.className = 'calendar-title';
  title.textContent = logCalendarMonth;

  header.append(
    createCalendarNav('‹', '上个月', -1),
    title,
    createCalendarNav('›', '下个月', 1)
  );
  box.appendChild(header);

  const weekdays = document.createElement('div');
  weekdays.className = 'calendar-weekdays';
  LOG_WEEKDAYS.forEach((name) => {
    const cell = document.createElement('div');
    cell.className = 'calendar-weekday';
    cell.textContent = name;
    weekdays.appendChild(cell);
  });
  box.appendChild(weekdays);

  // 先一次性算好"每天几次"，别在每个格子里把所有记录重新数一遍
  const counts = countLogsByDay(item);
  const today = logDateKey(nowFn());

  const grid = document.createElement('div');
  grid.className = 'calendar-grid';

  logMonthCells(logCalendarMonth).forEach((day) => {
    const cell = document.createElement('div');

    if (day === null) {
      cell.className = 'calendar-cell blank';   // 月初用来占位的空格子
      grid.appendChild(cell);
      return;
    }

    cell.className = 'calendar-cell';
    const key = `${logCalendarMonth}-${String(day).padStart(2, '0')}`;
    cell.dataset.date = key;

    if (key === today) cell.classList.add('today');
    if (key === logSelectedDay) cell.classList.add('selected');

    // 打过卡就圈一个手写风格的圈。圈要先放，日期数字盖在上面
    if (counts[key]) {
      cell.classList.add('logged');
      cell.appendChild(createIcon('handCircle', 'hand-circle'));
    }

    const dayEl = document.createElement('span');
    dayEl.className = 'calendar-day';
    dayEl.textContent = String(day);
    cell.appendChild(dayEl);

    cell.addEventListener('click', () => {
      logSelectedDay = key;
      render();
    });

    grid.appendChild(cell);
  });

  box.appendChild(grid);
  return box;
}

function createCalendarNav(symbol, label, offset) {
  const btn = document.createElement('button');
  btn.className = 'calendar-nav';
  btn.dataset.offset = String(offset);
  btn.textContent = symbol;
  btn.title = label;
  btn.addEventListener('click', () => {
    logCalendarMonth = shiftLogMonth(logCalendarMonth, offset);
    // 选中的日子要跟着换到这个月，否则下面列的还是上个月那天的记录
    logSelectedDay = `${logCalendarMonth}-01`;
    render();
  });
  return btn;
}

// '2026-09-11' → '9 月 11 日'
function formatDayLabel(dateKey) {
  const [, month, day] = dateKey.split('-').map(Number);
  return `${month} 月 ${day} 日`;
}

// 月历下面：选中那天的每一次打卡，可以单独删掉某一条（比如事后才发现点错了）
function createLogEntryList(item) {
  const box = document.createElement('div');
  box.className = 'log-entries';

  const entries = item.entries
    .filter((entry) => logDateKey(entry) === logSelectedDay)
    .sort()
    .reverse();    // 新的在上面

  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = `${formatDayLabel(logSelectedDay)} · ${entries.length} 次`;
  box.appendChild(label);

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'log-entries-empty';
    empty.textContent = '这天还没有打卡';
    box.appendChild(empty);

    // 已经过去、又没打卡的日子可以补录。
    // 今天不给这个入口 —— 直接点大数字更快；还没到的日子当然也补不了。
    // 日期都是 'YYYY-MM-DD' 这种定长格式，直接比字符串大小就是比先后
    if (logSelectedDay < logDateKey(nowFn())) {
      box.appendChild(createBackfillRow(item));
    }

    return box;
  }

  entries.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'log-entry';

    const time = document.createElement('span');
    time.className = 'log-entry-time';
    // 日期已经写在上面的标题里了，这里只显示几点几分
    time.textContent = formatDateTime(entry).slice(11);

    const remove = document.createElement('button');
    remove.className = 'log-entry-remove';
    remove.textContent = '×';
    remove.title = '删除这一次';
    remove.addEventListener('click', () => {
      // 删了就找不回来，先问一句
      if (!confirmFn(`删除 ${formatDateTime(entry)} 这一次打卡？`)) return;
      removeLogEntry(item.id, entry);
      render();
    });

    row.append(time, remove);
    box.appendChild(row);
  });

  return box;
}

// "+ 补录一次"：点一下变成填时间的小编辑区，和别处的内联编辑一个套路
function createBackfillRow(item) {
  if (backfillingDay !== logSelectedDay) {
    const btn = document.createElement('button');
    btn.className = 'backfill-btn';
    btn.textContent = '+ 补录一次';
    btn.addEventListener('click', () => {
      backfillingDay = logSelectedDay;
      render();
    });
    return btn;
  }

  const box = document.createElement('div');
  box.className = 'backfill-editor';

  const input = document.createElement('input');
  input.type = 'time';
  input.className = 'backfill-time';
  input.value = '12:00';      // 给个默认值，多数时候不用改
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      backfillLog(item.id, logSelectedDay, input.value);
    } else if (event.key === 'Escape') {
      backfillingDay = null;
      render();
    }
  });

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'backfill-confirm';
  confirmBtn.textContent = '确定';
  confirmBtn.addEventListener('click', () => backfillLog(item.id, logSelectedDay, input.value));

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'backfill-cancel';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', () => {
    backfillingDay = null;
    render();
  });

  box.append(input, confirmBtn, cancelBtn);
  return box;
}

// ---- 撤销提示 ----
function createUndoToast() {
  const item = findLogItem(undoToast.itemId);

  const toast = document.createElement('div');
  toast.className = 'undo-toast';

  const text = document.createElement('span');
  text.textContent = `已记录「${item ? item.name : ''}」`;

  const btn = document.createElement('button');
  btn.className = 'undo-btn';
  btn.textContent = '撤销';
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    undoQuickLog();
  });

  toast.append(text, btn);
  return toast;
}
