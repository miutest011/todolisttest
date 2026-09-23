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

// ---- 共用的月历格子 ----
// 日子怎么标、点了怎么办，由用它的那一页决定：
//   month: '2026-09'，selected: '2026-09-11' 或 null
//   decorate(cell, key)：往某一天的格子里加点东西（打卡页加手写圈，日历页加小圆点）
//   onPick(key)：点了某一天
//   onShiftMonth(offset)：点了上个月 / 下个月
function createMonthGrid({ month, selected, decorate, onPick, onShiftMonth }) {
  const box = document.createElement('div');
  box.className = 'log-calendar';

  const header = document.createElement('div');
  header.className = 'calendar-header';

  const title = document.createElement('span');
  title.className = 'calendar-title';
  title.textContent = month;

  header.append(
    createCalendarNav('‹', '上个月', () => onShiftMonth(-1)),
    title,
    createCalendarNav('›', '下个月', () => onShiftMonth(1))
  );
  box.appendChild(header);

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
    body.appendChild(createTaskGroup(calendarDay === todayKey ? '今天到期' : formatDayLabel(calendarDay), due, ''));
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
    }
  });
}

// 一行七天。上面占的地方小，屏幕大部分留给任务列表
function createWeekStrip() {
  const box = document.createElement('div');
  box.className = 'week-strip';

  box.appendChild(createCalendarNav('‹', '上一周', () => {
    calendarDay = shiftDays(calendarDay, -7);
    render();
  }));

  const days = document.createElement('div');
  days.className = 'week-days';
  const marked = daysWithTasks();
  const todayKey = dateKey(nowFn());

  weekCells(calendarDay).forEach((key) => {
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
    days.appendChild(cell);
  });

  box.appendChild(days);
  box.appendChild(createCalendarNav('›', '下一周', () => {
    calendarDay = shiftDays(calendarDay, 7);
    render();
  }));

  return box;
}

// 只看一天：左右翻一天，中间写清楚是哪天、星期几
function createDayHeader() {
  const box = document.createElement('div');
  box.className = 'day-header';

  box.appendChild(createCalendarNav('‹', '前一天', () => {
    calendarDay = shiftDays(calendarDay, -1);
    render();
  }));

  const title = document.createElement('div');
  title.className = 'day-title';
  const [year] = calendarDay.split('-').map(Number);
  const weekday = WEEKDAYS[weekdayIndex(calendarDay)];
  title.textContent = calendarDay === dateKey(nowFn())
    ? `今天 · ${formatDayLabel(calendarDay)} 周${weekday}`
    : `${year} 年 ${formatDayLabel(calendarDay)} 周${weekday}`;
  box.appendChild(title);

  box.appendChild(createCalendarNav('›', '后一天', () => {
    calendarDay = shiftDays(calendarDay, 1);
    render();
  }));

  return box;
}

function createTaskDot() {
  const dot = document.createElement('span');
  dot.className = 'task-dot';
  return dot;
}

// 任务分组（"已过期 2"这样的小标题加一串任务）。
// 这一页上的任务不给拖拽也不给置顶：这里的任务来自不同清单，排序和"置顶到哪"都说不清
function createTaskGroup(label, items, extraClass) {
  const box = document.createElement('section');
  box.className = 'today-section';

  const header = document.createElement('div');
  header.className = extraClass ? 'today-section-title ' + extraClass : 'today-section-title';
  header.textContent = `${label} ${items.length}`;
  box.appendChild(header);

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
