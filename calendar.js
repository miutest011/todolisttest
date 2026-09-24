// 日历页（底部标签栏中间那个），以及打卡详情页里的那个月历。
//
// 为什么单独一个文件：月历两处在用（日历页、打卡详情页），日历页自己还有月 / 周 / 日三种视图。
// 和 tags.js 一个思路——共用的那块界面单独放，省得两边各写一份、改了一边忘了另一边。
//
// 用到 app.js 里的 render、todos、nowFn、createTodoItem 这些，所以排在 app.js 后面加载。

// ---- 日期工具（打卡那边也用这几个）----
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];   // 周一开头

// 把一个时间换成"本地日期"，形如 '2026-09-10'。
//
// 千万别偷懒直接取 ISO 字符串的前 10 位：那是 UTC 的日期，不是你手机上的日期。
// 比如在比 UTC 慢 7 小时的时区，晚上 8 点的事情存成 ISO 是第二天凌晨 3 点，
// 取前 10 位就会被算到第二天去
function dateKey(value) {
  // 传进来的可能已经是 '2026-09-23' 这样的日期了。这时候千万别再丢进 new Date()：
  // 只有日期没有时间的字符串会被当成 UTC 零点，在西边的时区上整整倒退一天（真踩过，
  // 月历上点"上个月"一下翻过去两个月）
  if (isDateKey(value)) return value;

  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function monthKey(value) {
  return dateKey(value).slice(0, 7);
}

// 在 '2026-09' 这样的月份上加减几个月，会自动跨年
function shiftMonth(month, offset) {
  const [year, monthNumber] = month.split('-').map(Number);
  return monthKey(new Date(year, monthNumber - 1 + offset, 1));
}

// 在 '2026-09-30' 这样的日子上加减几天，会自动跨月跨年
function shiftDays(key, offset) {
  const [year, month, day] = key.split('-').map(Number);
  return dateKey(new Date(year, month - 1, day + offset));
}

// 月历的格子：前面补几个空格，让 1 号对上星期几（周一开头），然后是 1 号到月底
function monthCells(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstWeekday = new Date(year, monthNumber - 1, 1).getDay();   // 周日=0 … 周六=6
  const leadingBlanks = (firstWeekday + 6) % 7;                       // 换算成 周一=0 … 周日=6
  const daysInMonth = new Date(year, monthNumber, 0).getDate();       // "下个月的第 0 天"就是这个月最后一天

  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  return cells;
}

// 这一周的七天（周一开头），key 是这周里的任意一天
function weekCells(key) {
  return WEEKDAYS.map((name, index) => shiftDays(key, index - weekdayIndex(key)));
}

// 星期几：周一=0 … 周日=6（JS 自带的是周日=0，换算一下）
function weekdayIndex(key) {
  const [year, month, day] = key.split('-').map(Number);
  return (new Date(year, month - 1, day).getDay() + 6) % 7;
}

// '2026-09-11' → '9 月 11 日'
function formatDayLabel(key) {
  const [, month, day] = key.split('-').map(Number);
  return `${month} 月 ${day} 日`;
}

// '2026-09' → '2026 年 9 月'。三种视图顶上那行统一用中文写法，
// 别一个地方写 2026-09、另一个地方写 2026 年 9 月
function formatMonthLabel(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${year} 年 ${monthNumber} 月`;
}

// 一周有可能跨月（甚至跨年），那就把两头都写出来，否则只看一个月份会以为翻错了
function formatWeekLabel(days) {
  const first = monthKey(days[0]);
  const last = monthKey(days[days.length - 1]);
  if (first === last) return formatMonthLabel(first);
  if (first.slice(0, 4) === last.slice(0, 4)) {
    return `${formatMonthLabel(first)} - ${Number(last.slice(5))} 月`;
  }
  return `${formatMonthLabel(first)} - ${formatMonthLabel(last)}`;
}

// 连点两下（电脑上就是双击）。
// 为什么不用浏览器自带的 dblclick：iPhone 上双击是系统的手势（缩放、选词），
// 这个事件经常根本不发 —— 在模拟器里实测就是没反应。自己数两次点击的间隔最稳，
// 电脑上的鼠标双击也照样认
// 两下之间隔多久还算"连点两下"（毫秒）。
// 配套的魔数：tests-calendar.js 里"点得太慢不算"那条要等得比这个久一点，改这里记得改那边
const DOUBLE_TAP_GAP = 300;

function onDoubleTap(element, handler) {
  let lastTap = 0;

  element.addEventListener('click', (event) => {
    if (event.timeStamp - lastTap <= DOUBLE_TAP_GAP) {
      lastTap = 0;              // 认过一次就清零，连点三下不会算成两次
      handler();
      return;
    }
    lastTap = event.timeStamp;
  });
}

// 三种视图共用的表头：左右两个翻页箭头夹着中间的标题。
// 连点两下标题回到今天 —— 翻远了想回来，不用一格一格翻回去
function createNavHeader({ title, prev, next, onPrev, onNext, onToday }) {
  const header = document.createElement('div');
  header.className = 'calendar-header';

  const label = document.createElement('span');
  label.className = 'calendar-title';
  label.textContent = title;

  if (onToday) {
    label.classList.add('can-go-today');
    label.title = '双击回到今天';
    onDoubleTap(label, onToday);
  }

  header.append(createCalendarNav('‹', prev, onPrev), label, createCalendarNav('›', next, onNext));
  return header;
}

// ---- 共用的月历格子 ----
// 日子怎么标、点了怎么办，由用它的那一页决定：
//   month: '2026-09'，selected: '2026-09-11' 或 null
//   decorate(cell, key)：往某一天的格子里加点东西（打卡页加手写圈，日历页加小圆点）
//   onPick(key)：点了某一天
//   onShiftMonth(offset)：点了上个月 / 下个月
//   onToday()：双击了标题（回到今天）。不传就不给双击
function createMonthGrid({ month, selected, decorate, onPick, onShiftMonth, onToday }) {
  const box = document.createElement('div');
  box.className = 'log-calendar';

  box.appendChild(createNavHeader({
    title: formatMonthLabel(month),
    prev: '上个月',
    next: '下个月',
    onPrev: () => onShiftMonth(-1),
    onNext: () => onShiftMonth(1),
    onToday: onToday
  }));

  const weekdays = document.createElement('div');
  weekdays.className = 'calendar-weekdays';
  WEEKDAYS.forEach((name) => {
    const cell = document.createElement('div');
    cell.className = 'calendar-weekday';
    cell.textContent = name;
    weekdays.appendChild(cell);
  });
  box.appendChild(weekdays);

  const todayKey = dateKey(nowFn());

  const grid = document.createElement('div');
  grid.className = 'calendar-grid';

  monthCells(month).forEach((day) => {
    const cell = document.createElement('div');

    if (day === null) {
      cell.className = 'calendar-cell blank';   // 月初用来占位的空格子
      grid.appendChild(cell);
      return;
    }

    cell.className = 'calendar-cell';
    const key = `${month}-${String(day).padStart(2, '0')}`;
    cell.dataset.date = key;

    if (key === todayKey) cell.classList.add('today');
    if (key === selected) cell.classList.add('selected');

    // 标记先放，日期数字盖在上面（打卡那个手写圈是画在数字底下的）
    if (decorate) decorate(cell, key);

    const dayEl = document.createElement('span');
    dayEl.className = 'calendar-day';
    dayEl.textContent = String(day);
    cell.appendChild(dayEl);

    cell.addEventListener('click', () => onPick(key));
    grid.appendChild(cell);
  });

  box.appendChild(grid);
  return box;
}

function createCalendarNav(symbol, label, onClick) {
  const btn = document.createElement('button');
  btn.className = 'calendar-nav';
  btn.textContent = symbol;
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.addEventListener('click', onClick);
  return btn;
}

// ---- 日历页的界面状态 ----
const CALENDAR_VIEWS = [
  { key: 'month', label: '月' },
  { key: 'week', label: '周' },
  { key: 'day', label: '日' }
];

let calendarView = 'month';   // 看哪种视图。会存起来：下次打开还是上次选的那个
let calendarDay = null;       // 正在看哪一天，形如 '2026-09-23'。每次打开应用回到今天

function resetCalendarViewState() {
  calendarDay = null;         // 下次画的时候会补成今天
}

function loadCalendarView() {
  const saved = storage.getItem('calendarView');
  const value = saved ? JSON.parse(saved) : 'month';
  // 存的值万一不认识（比如以后删掉了某个视图），退回月视图，别让页面画不出来
  return CALENDAR_VIEWS.some((view) => view.key === value) ? value : 'month';
}

function saveCalendarView() {
  storage.setItem('calendarView', JSON.stringify(calendarView));
}

// ---- 哪些任务算在哪一天 ----
// 和原来的"今天"页一个规矩：做完的、放弃的、归档清单里的、没设截止时间的都不算
function plannedTasks() {
  return todos
    .map((todo, index) => ({ todo: todo, index: index }))
    .filter(({ todo }) => (
      todo.status === 'active' && todo.dueAt && !isCategoryArchived(todo.category)
    ));
}

function tasksDueOn(key) {
  return plannedTasks()
    .filter(({ todo }) => dateKey(todo.dueAt) === key)
    .sort((a, b) => a.todo.dueAt.localeCompare(b.todo.dueAt));   // 一天之内按几点排
}

// 过了期还没做完的。只在看"今天"时单独列出来 —— 不然这些事翻不到就忘了
function overdueTasks() {
  const dayStart = startOfToday();
  return plannedTasks()
    .filter(({ todo }) => new Date(todo.dueAt).getTime() < dayStart)
    .sort((a, b) => a.todo.dueAt.localeCompare(b.todo.dueAt));
}

// 哪些日子有任务（画小圆点用）。一次算好，别在每个格子里把所有任务重新过一遍
function daysWithTasks() {
  const days = {};
  plannedTasks().forEach(({ todo }) => { days[dateKey(todo.dueAt)] = true; });
  return days;
}

// ---- 日历页 ----
function createCalendarView() {
  const { page: view, top, body } = createScrollingPage('calendar-view');

  if (calendarDay === null) calendarDay = dateKey(nowFn());

  top.appendChild(createViewSwitch());
  top.appendChild(createCalendarBlock());

  const todayKey = dateKey(nowFn());
  const overdue = calendarDay === todayKey ? overdueTasks() : [];
  const due = tasksDueOn(calendarDay);

  if (overdue.length > 0) {
    body.appendChild(createTaskGroup('已过期', overdue, 'overdue'));
  }
  if (due.length > 0) {
    // 不写"今天到期"这种小标题：上面的日历已经把"在看哪天"说清楚了，
    // 再写一行反而挤着日历。"已过期"那组留着 —— 它说的是另一回事，不写就分不出来
    body.appendChild(createTaskGroup(null, due, ''));
  }
  if (overdue.length === 0 && due.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'day-empty';
    // 一条设了截止时间的任务都没有时，光说"这天没有"没用，要告诉他怎么让任务出现在这里
    if (plannedTasks().length === 0) {
      empty.textContent = '还没有设了截止时间的任务。给任务设置截止时间后，它们会出现在这里。';
    } else {
      empty.textContent = calendarDay === todayKey ? '今天没有到期的任务' : `${formatDayLabel(calendarDay)}没有到期的任务`;
    }
    body.appendChild(empty);
  }

  return view;
}

// 右上角的 月 / 周 / 日
function createViewSwitch() {
  const box = document.createElement('div');
  box.className = 'view-switch';

  CALENDAR_VIEWS.forEach(({ key, label }) => {
    const btn = document.createElement('button');
    btn.className = key === calendarView ? 'view-switch-btn active' : 'view-switch-btn';
    btn.textContent = label;
    btn.dataset.view = key;
    btn.setAttribute('aria-pressed', key === calendarView ? 'true' : 'false');
    btn.addEventListener('click', () => {
      if (closeMenuIfOpen()) return;
      calendarView = key;
      saveCalendarView();     // 记住，下次打开还是这个
      render();
    });
    box.appendChild(btn);
  });

  return box;
}

function createCalendarBlock() {
  if (calendarView === 'week') return createWeekStrip();
  if (calendarView === 'day') return createDayHeader();
  return createMonthBlock();
}

function createMonthBlock() {
  const marked = daysWithTasks();

  return createMonthGrid({
    month: monthKey(calendarDay),
    selected: calendarDay,
    decorate: (cell, key) => {
      if (marked[key]) cell.appendChild(createTaskDot());
    },
    onPick: (key) => {
      if (closeMenuIfOpen()) return;
      calendarDay = key;
      render();
    },
    onShiftMonth: (offset) => {
      // 翻月份时选中的日子跟着走到那个月，否则下面列的还是上个月那天的任务。
      // 翻到的正好是本月就回到今天，这是最常用的那一天
      const month = shiftMonth(monthKey(calendarDay), offset);
      const todayKey = dateKey(nowFn());
      calendarDay = month === monthKey(todayKey) ? todayKey : `${month}-01`;
      render();
    },
    onToday: goToToday
  });
}

// 一行七天。上面占的地方小，屏幕大部分留给任务列表。
// 顶上要写年月：翻远了之后，光看 21 22 23 这几个数字根本不知道是哪个月
function createWeekStrip() {
  const box = document.createElement('div');
  box.className = 'week-block';

  const days = weekCells(calendarDay);

  box.appendChild(createNavHeader({
    title: formatWeekLabel(days),
    prev: '上一周',
    next: '下一周',
    onPrev: () => { calendarDay = shiftDays(calendarDay, -7); render(); },
    onNext: () => { calendarDay = shiftDays(calendarDay, 7); render(); },
    onToday: goToToday
  }));

  const row = document.createElement('div');
  row.className = 'week-days';
  const marked = daysWithTasks();
  const todayKey = dateKey(nowFn());

  days.forEach((key) => {
    const cell = document.createElement('button');
    cell.className = 'week-day';
    cell.dataset.date = key;
    if (key === todayKey) cell.classList.add('today');
    if (key === calendarDay) cell.classList.add('selected');

    const name = document.createElement('span');
    name.className = 'week-day-name';
    // 按这一天真正是星期几来写，而不是按它排在第几个 ——
    // 按位置写的话，日期排错了名字看着还是对的，谁也发现不了
    name.textContent = WEEKDAYS[weekdayIndex(key)];

    const number = document.createElement('span');
    number.className = 'week-day-number';
    number.textContent = String(Number(key.slice(8)));

    cell.append(name, number);
    if (marked[key]) cell.appendChild(createTaskDot());

    cell.addEventListener('click', () => {
      if (closeMenuIfOpen()) return;
      calendarDay = key;
      render();
    });
    row.appendChild(cell);
  });

  box.appendChild(row);
  return box;
}

// 只看一天：左右翻一天，中间写清楚是哪天、星期几
function createDayHeader() {
  const label = `${formatMonthLabel(monthKey(calendarDay))} ${Number(calendarDay.slice(8))} 日 周${WEEKDAYS[weekdayIndex(calendarDay)]}`;

  return createNavHeader({
    // 看的正好是今天时在后面缀一句，因为日视图上没有"今天"那个标记
    title: calendarDay === dateKey(nowFn()) ? `${label} · 今天` : label,
    prev: '前一天',
    next: '后一天',
    onPrev: () => { calendarDay = shiftDays(calendarDay, -1); render(); },
    onNext: () => { calendarDay = shiftDays(calendarDay, 1); render(); },
    onToday: goToToday
  });
}

// 双击顶上那行日期就回到今天。翻远了想回来，不用一格一格翻
function goToToday() {
  calendarDay = dateKey(nowFn());
  render();
}

function createTaskDot() {
  const dot = document.createElement('span');
  dot.className = 'task-dot';
  return dot;
}

// 任务分组（"已过期 2"这样的小标题加一串任务）。
// 这一页上的任务不给拖拽也不给置顶：这里的任务来自不同清单，排序和"置顶到哪"都说不清
// label 传 null 就不画小标题
function createTaskGroup(label, items, extraClass) {
  const box = document.createElement('section');
  box.className = 'today-section';

  if (label !== null) {
    const header = document.createElement('div');
    header.className = extraClass ? 'today-section-title ' + extraClass : 'today-section-title';
    header.textContent = `${label} ${items.length}`;
    box.appendChild(header);
  }

  const list = document.createElement('ul');
  items.forEach(({ todo, index }) => {
    const li = createTodoItem(todo, index, { draggable: false, pinnable: false });

    // 这里混着不同清单的任务，所以额外标出它属于哪个清单、当天几点到期
    const meta = document.createElement('span');
    meta.className = 'todo-meta';
    meta.textContent = todo.category + ' · ' + formatDateTime(todo.dueAt).slice(11);
    li.insertBefore(meta, li.querySelector('.pin-btn') || li.querySelector('.menu-anchor'));

    list.appendChild(li);
  });
  box.appendChild(list);

  return box;
}
