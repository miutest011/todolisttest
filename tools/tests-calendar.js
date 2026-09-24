// 日历页：月 / 周 / 日三种视图、有任务的日子标小圆点、切哪天看哪天。
// 原来这一页叫"今天"，就是一个筛出来的列表，没任务时一片空白 —— 改成日历就是为了这个。
// "这一页的任务怎么显示"（分组、不能拖、不带置顶、点进详情页）那些规则没变，还在 tests.js 里。
// 复用 tests.js、tests-logs.js 里的工具，所以排在它们后面加载。

function openCalendar(root) {
  click(tabButton(root, '日历'));
}

function calendarDayCell(root, day) {
  return [...root.querySelectorAll('.calendar-cell')].find((cell) => {
    const number = cell.querySelector('.calendar-day');
    return number && number.textContent === String(day);
  });
}

function weekDayCell(root, day) {
  return [...root.querySelectorAll('.week-day')].find(
    (cell) => cell.querySelector('.week-day-number').textContent === String(day)
  );
}

function switchTo(root, label) {
  click([...root.querySelectorAll('.view-switch-btn')].find((btn) => btn.textContent === label));
}

// 冻住的"现在"是 2026-09-09 10:00 UTC。测试里的日子都按本地时区算，别自己拼 ISO 字符串
const TODAY = dateKey(FIXED_NOW);
const THIS_MONTH = monthKey(FIXED_NOW);

// 今天的某个钟点
function todayAt(hour) {
  const [year, month, day] = TODAY.split('-').map(Number);
  return new Date(year, month - 1, day, hour).toISOString();
}

// 相对今天前后几天的某个钟点
function dayAt(offset, hour = 9) {
  const [year, month, day] = TODAY.split('-').map(Number);
  return new Date(year, month - 1, day + offset, hour).toISOString();
}

function calendarSetup(extra = {}) {
  return setup(Object.assign({
    categories: ['工作', '生活'],
    todos: [
      { text: '今天的事', status: 'active', category: '工作', dueAt: todayAt(15) },
      { text: '后天的事', status: 'active', category: '生活', dueAt: dayAt(2, 10) }
    ]
  }, extra));
}


// ========== 月视图 ==========

test('日历：默认就是月视图，选中今天，画的是本月', () => {
  const { root } = calendarSetup();
  openCalendar(root);

  assertEqual(calendarView, 'month', '默认月视图：一眼看完整个月，最不空');
  assertEqual(root.querySelector('.calendar-title').textContent, formatMonthLabel(THIS_MONTH), '画的是本月，写成中文的年月');
  assert(calendarDayCell(root, Number(TODAY.slice(8))).classList.contains('selected'), '默认选中今天');
  assert(calendarDayCell(root, Number(TODAY.slice(8))).classList.contains('today'), '今天有自己的标记');
});

test('日历：有任务的日子带小圆点，没任务的不带', () => {
  const { root } = calendarSetup();
  openCalendar(root);

  const today = Number(TODAY.slice(8));
  assert(calendarDayCell(root, today).querySelector('.task-dot'), '今天有任务，要有点');
  assert(calendarDayCell(root, Number(dateKey(dayAt(2)).slice(8))).querySelector('.task-dot'), '后天也有');
  assertEqual(calendarDayCell(root, Number(dateKey(dayAt(1)).slice(8))).querySelector('.task-dot'), null, '明天没任务，不该有点');
});

test('日历：做完的、放弃的、归档清单里的、没设截止时间的都不画点', () => {
  const { root } = setup({
    categories: ['工作', '旧项目'],
    categoryMeta: { '旧项目': { tagId: null, archived: true } },
    todos: [
      { text: '做完了', status: 'done', category: '工作', dueAt: todayAt(9) },
      { text: '放弃了', status: 'abandoned', category: '工作', dueAt: todayAt(10) },
      { text: '归档清单里的', status: 'active', category: '旧项目', dueAt: todayAt(11) },
      { text: '没设时间', status: 'active', category: '工作' }
    ]
  });
  openCalendar(root);

  assertEqual(calendarDayCell(root, Number(TODAY.slice(8))).querySelector('.task-dot'), null,
    '这些都不该算"今天要做的"，和原来今天页一个规矩');
  assert(root.querySelector('.day-empty'), '下面也不该列出它们');
});

test('日历：点某一天，下面换成那天的任务', () => {
  const { root } = calendarSetup();
  openCalendar(root);

  click(calendarDayCell(root, Number(dateKey(dayAt(2)).slice(8))));

  assertEqual(textsOf(root, '.todo-text'), ['后天的事'], '列的是点中那天的');
  assert(calendarDayCell(root, Number(dateKey(dayAt(2)).slice(8))).classList.contains('selected'), '点中的那天高亮');
  // 不写"9 月 25 日"这种小标题：上面日历里高亮的那天已经说清楚了，写了反而挤
  assertEqual(textsOf(root, '.today-section-title'), [], '这一组不该有小标题');
});

test('日历：过期的任务只在看今天时单独列出来，看别的日子不跟着跑', () => {
  const { root } = calendarSetup({
    todos: [
      { text: '过期了', status: 'active', category: '工作', dueAt: dayAt(-3, 9) },
      { text: '后天的事', status: 'active', category: '生活', dueAt: dayAt(2, 10) }
    ]
  });
  openCalendar(root);

  assertEqual(textsOf(root, '.today-section-title')[0].slice(0, 3), '已过期', '看今天时，过期的排在最前面');
  assert(textsOf(root, '.todo-text').includes('过期了'), '过期的事翻不到就忘了，要摆在今天这儿');

  click(calendarDayCell(root, Number(dateKey(dayAt(2)).slice(8))));
  assertEqual(textsOf(root, '.todo-text'), ['后天的事'], '看别的日子时不该再冒出来');

  click(calendarDayCell(root, Number(dateKey(dayAt(-3)).slice(8))));
  assertEqual(textsOf(root, '.todo-text'), ['过期了'], '它本来那天照样看得到');
});

test('日历：翻到上个月默认选中 1 号，翻回本月回到今天', () => {
  const { root } = calendarSetup();
  openCalendar(root);

  click(calendarNav(root, '上个月'));
  assertEqual(root.querySelector('.calendar-title').textContent, formatMonthLabel(shiftMonth(THIS_MONTH, -1)), '翻到上个月');
  assertEqual(calendarDay, shiftMonth(THIS_MONTH, -1) + '-01', '选中那个月 1 号，否则下面列的还是上个月那天的任务');

  click(calendarNav(root, '下个月'));
  assertEqual(calendarDay, TODAY, '翻回本月时直接回到今天 —— 这是最常看的那天');
});


test('日历：日期换算不会被时区带偏（把日期字符串再换一遍还是同一天）', () => {
  // 只有日期没有时间的字符串（'2026-08-01'）丢进 new Date() 会被当成 UTC 零点，
  // 在西边的时区上倒退一天。踩过一次：月历上点一下"上个月"直接翻过去两个月
  assertEqual(dateKey('2026-08-01'), '2026-08-01', '换一遍还是同一天');
  assertEqual(monthKey('2026-08-01'), '2026-08', '月份也不能倒退');
  assertEqual(monthKey(shiftDays('2026-08-01', -1)), '2026-07', '真要往前一天才是上个月');
  assertEqual(dateKey(new Date(2026, 7, 1, 0, 30)), '2026-08-01', '给时间点也照样算本地日期');
});


// ========== 周视图、日视图 ==========

test('日历：周视图是一行七天（周一开头），包含今天、点哪天选哪天', () => {
  const { root } = calendarSetup();
  openCalendar(root);
  switchTo(root, '周');

  // 光看"一二三四五六日"这七个字没用：它们原来是按格子排第几个写的，日期错了也照样显示对 ——
  // 变异测试就是这么抓到的。要看每一格真正是哪一天
  const days = [...root.querySelectorAll('.week-day')].map((cell) => cell.dataset.date);
  assertEqual(days.length, 7, '一行七天');
  const [year, month, day] = days[0].split('-').map(Number);
  assertEqual(new Date(year, month - 1, day).getDay(), 1, '第一格得真是星期一，实际那天是 ' + days[0]);
  assertEqual(days, days.map((_, i) => shiftDays(days[0], i)), '七天要连着');
  assert(days.includes(TODAY), '这一周里得有今天');
  assertEqual(textsOf(root, '.week-day-name'), ['一', '二', '三', '四', '五', '六', '日'], '名字也对得上');
  assertEqual(root.querySelectorAll('.calendar-grid').length, 0, '周视图里不画整月');

  const today = Number(TODAY.slice(8));
  assert(weekDayCell(root, today).classList.contains('today'), '今天在这一周里');
  assert(weekDayCell(root, today).classList.contains('selected'), '默认还是选中今天');
  assert(weekDayCell(root, today).querySelector('.task-dot'), '有任务的日子同样标点');

  const other = Number(dateKey(dayAt(1)).slice(8));
  click(weekDayCell(root, other));
  assertEqual(calendarDay, dateKey(dayAt(1)), '点哪天选哪天');
});

test('日历：周视图左右翻是一次七天', () => {
  const { root } = calendarSetup();
  openCalendar(root);
  switchTo(root, '周');

  click(calendarNav(root, '下一周'));
  assertEqual(calendarDay, shiftDays(TODAY, 7), '往后一周');
  click(calendarNav(root, '上一周'));
  assertEqual(calendarDay, TODAY, '再翻回来');
});

test('日历：日视图写清楚是哪天、星期几，左右翻是一天', () => {
  const { root } = calendarSetup();
  openCalendar(root);
  switchTo(root, '日');

  const title = root.querySelector('.calendar-title').textContent;
  assert(title.includes(formatMonthLabel(THIS_MONTH)), '年月要写出来，实际：' + title);
  assert(title.includes(String(Number(TODAY.slice(8))) + ' 日'), '也要写出是几号');
  assert(title.includes('周'), '还要写星期几');
  assert(title.includes('今天'), '看的正好是今天时缀一句（日视图上没有"今天"那个标记）');
  assertEqual(textsOf(root, '.todo-text'), ['今天的事'], '下面是这天的任务');

  click(calendarNav(root, '后一天'));
  assertEqual(calendarDay, shiftDays(TODAY, 1), '往后一天');
  assert(!root.querySelector('.calendar-title').textContent.includes('今天'), '不是今天了就别再叫"今天"');
  assert(root.querySelector('.day-empty'), '明天没任务，要说一声');

  click(calendarNav(root, '前一天'));
  assertEqual(calendarDay, TODAY, '再翻回来');
});

test('日历：换视图不影响正在看哪一天', () => {
  const { root } = calendarSetup();
  openCalendar(root);

  click(calendarDayCell(root, Number(dateKey(dayAt(2)).slice(8))));
  switchTo(root, '周');
  assertEqual(calendarDay, dateKey(dayAt(2)), '切到周视图还是那天');
  assertEqual(textsOf(root, '.todo-text'), ['后天的事'], '下面列的也还是那天的');

  switchTo(root, '日');
  assertEqual(calendarDay, dateKey(dayAt(2)), '切到日视图同样');
});


test('日历：同一天的任务按几点到期排，早的在前', () => {
  const { root } = calendarSetup({
    todos: [
      { text: '下午三点', status: 'active', category: '工作', dueAt: todayAt(15) },
      { text: '上午九点', status: 'active', category: '工作', dueAt: todayAt(9) },
      { text: '中午十二点', status: 'active', category: '工作', dueAt: todayAt(12) }
    ]
  });
  openCalendar(root);

  assertEqual(textsOf(root, '.todo-text'), ['上午九点', '中午十二点', '下午三点'],
    '一天之内按时间先后，不是按当初添加的顺序');
});

test('日历：切换按钮上要标出现在看的是哪个视图', () => {
  const { root } = calendarSetup();
  openCalendar(root);

  const active = () => [...root.querySelectorAll('.view-switch-btn')]
    .filter((btn) => btn.classList.contains('active'))
    .map((btn) => btn.textContent);

  assertEqual(active(), ['月'], '默认月视图，按钮上要看得出来');
  switchTo(root, '周');
  assertEqual(active(), ['周'], '切了之后标在新的那个上');
  assertEqual(root.querySelectorAll('.view-switch-btn.active').length, 1, '同时只能有一个是选中的');
});


// ========== 样子 ==========

test('日历：今天是蓝字不给底色，选中是实心圆；月视图和周视图一个样', async () => {
  await useAppStyles();
  const { root } = calendarSetup();
  openCalendar(root);

  // 先选到别的天，这样"今天"和"选中"能同时看到
  const otherDay = Number(dateKey(dayAt(1)).slice(8));
  click(calendarDayCell(root, otherDay));

  // 把值当场抄下来：getComputedStyle 给的是实时对象，等下切到周视图、这些元素被删掉之后，
  // 再去读就全成空字符串了（真踩过）
  const look = (element) => {
    const style = getComputedStyle(element);
    return { color: style.color, background: style.backgroundColor, radius: style.borderRadius, width: style.width };
  };

  const monthToday = look(calendarDayCell(root, Number(TODAY.slice(8))).querySelector('.calendar-day'));
  const monthPicked = look(calendarDayCell(root, otherDay).querySelector('.calendar-day'));

  assertEqual(monthToday.background, 'rgba(0, 0, 0, 0)', '今天不给底色，底色留给"选中"');
  assert(monthToday.color !== monthPicked.color, '今天要有自己的颜色（蓝字）');
  assert(monthPicked.background !== 'rgba(0, 0, 0, 0)', '选中的那天是个实心圆');
  // 圆角算出来可能是 '50%'，也可能是像素，两种写法都认
  const halfWidth = (parseFloat(monthPicked.width) || 26) / 2;
  assert(monthPicked.radius.includes('%')
    ? parseFloat(monthPicked.radius) >= 50
    : parseFloat(monthPicked.radius) >= halfWidth,
    '要是个圆，不是方块，实际圆角：' + monthPicked.radius);

  switchTo(root, '周');
  const weekToday = look(weekDayCell(root, Number(TODAY.slice(8))).querySelector('.week-day-number'));
  const weekPicked = look(weekDayCell(root, otherDay).querySelector('.week-day-number'));

  assertEqual([weekToday.color, weekToday.background], [monthToday.color, monthToday.background],
    '周视图的"今天"要和月视图一模一样');
  assertEqual([weekPicked.color, weekPicked.background], [monthPicked.color, monthPicked.background],
    '周视图的"选中"也要一样（原来这里是淡蓝方框，两边对不上）');
});

test('日历：有任务的小圆点不会被数字的圆盖住，选中那天也看得见', async () => {
  await useAppStyles();
  const { root } = calendarSetup();
  openCalendar(root);

  const todayCell = calendarDayCell(root, Number(TODAY.slice(8)));   // 今天有任务，而且默认就选中
  const dot = todayCell.querySelector('.task-dot');
  assert(dot, '今天有任务，要有小圆点');
  assert(getComputedStyle(dot).display !== 'none', '选中的那天也得看得见这个点');

  const dotBox = dot.getBoundingClientRect();
  const numberBox = todayCell.querySelector('.calendar-day').getBoundingClientRect();
  assert(dotBox.top >= numberBox.bottom - 0.5,
    `小圆点要落在数字圆下面（点的上边 ${Math.round(dotBox.top)}，圆的下边 ${Math.round(numberBox.bottom)}）`);
  assert(dotBox.bottom <= todayCell.getBoundingClientRect().bottom, '也别掉出格子外面');
});


// ========== 顶上那行日期 ==========

test('日历：三种视图顶上都写着年月，写法一致', () => {
  const { root } = calendarSetup();
  openCalendar(root);

  const title = () => root.querySelector('.calendar-title').textContent;
  assertEqual(title(), formatMonthLabel(THIS_MONTH), '月视图');

  switchTo(root, '周');
  assert(title().includes(formatMonthLabel(THIS_MONTH)),
    '周视图也要写年月：翻远了光看 21 22 23 这几个数字，不知道是哪个月，实际：' + title());

  switchTo(root, '日');
  assert(title().includes(formatMonthLabel(THIS_MONTH)), '日视图同样，实际：' + title());
});

test('日历：周视图跨月时，两个月份都写出来', () => {
  const { root } = calendarSetup();
  openCalendar(root);
  switchTo(root, '周');

  // 挪到月底那一周（这一周一定跨月）
  const [year, month] = THIS_MONTH.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  calendarDay = `${THIS_MONTH}-${lastDay}`;
  render();

  const days = [...root.querySelectorAll('.week-day')].map((cell) => cell.dataset.date);
  const title = root.querySelector('.calendar-title').textContent;
  if (monthKey(days[0]) === monthKey(days[6])) {
    skip('这个月最后一周正好没跨月，换个月份才测得到');
  }
  assert(title.includes(String(Number(monthKey(days[0]).slice(5))) + ' 月'), '写了头一个月，实际：' + title);
  assert(title.includes(String(Number(monthKey(days[6]).slice(5))) + ' 月'), '也写了后一个月，实际：' + title);
});

test('日历：双击顶上那行日期回到今天（月 / 周 / 日都行）', () => {
  const { root } = calendarSetup();
  openCalendar(root);

  const goFarAndBack = (label) => {
    switchTo(root, label);
    calendarDay = shiftDays(TODAY, 40);      // 翻到很远的地方
    render();
    assert(calendarDay !== TODAY, label + '视图：先确认翻走了');

    doubleClick(root.querySelector('.calendar-title'));
    assertEqual(calendarDay, TODAY, label + '视图：双击标题就回到今天，不用一格一格翻回来');
  };

  goFarAndBack('月');
  goFarAndBack('周');
  goFarAndBack('日');
});

test('日历：两下点得太慢不算（隔久了是两次单击，不是连点两下）', async () => {
  const { root } = calendarSetup();
  openCalendar(root);
  calendarDay = shiftDays(TODAY, 40);
  render();

  const title = root.querySelector('.calendar-title');
  click(title);
  // 写死 380，不引用 DOUBLE_TAP_GAP：变异测试会把那个常量改大，
  // 引用它的话这里就跟着睡了 100 秒，直接超时（真踩过）
  await sleep(380);
  click(title);

  assertEqual(calendarDay, shiftDays(TODAY, 40), '隔了半天才点第二下，不该跳回今天');
});

test('日历：单击标题不动（只有连点两下才回今天，免得翻页时手一抖就跳走）', () => {
  const { root } = calendarSetup();
  openCalendar(root);
  calendarDay = shiftDays(TODAY, 40);
  render();

  click(root.querySelector('.calendar-title'));
  assertEqual(calendarDay, shiftDays(TODAY, 40), '单击不该有反应');
});

test('打卡详情：月历上双击月份也回到今天（和日历页一个操作）', () => {
  const { root } = setup({ logItems: [logItem('喝水')] });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');

  click(calendarNav(root, '上个月'));
  assertEqual(logCalendarMonth, shiftMonth(THIS_MONTH, -1), '先翻走');

  doubleClick(root.querySelector('.calendar-title'));
  assertEqual(logCalendarMonth, THIS_MONTH, '回到本月');
  assertEqual(logSelectedDay, TODAY, '下面列的也回到今天');
});


// ========== 记住选的视图 ==========

test('日历：选了哪个视图会存起来，重开应用还是它', () => {
  const { root, storage } = calendarSetup();
  openCalendar(root);
  switchTo(root, '周');

  assertEqual(JSON.parse(storage.getItem('calendarView')), 'week', '存下来了');

  const again = document.createElement('div');
  document.body.appendChild(again);
  onCleanup(() => again.remove());
  initApp(again);                       // 重开应用（用的是同一份假存储）
  openCalendar(again);

  assertEqual(calendarView, 'week', '还是上次选的周视图');
  assert(again.querySelector('.week-days'), '画出来的也是周视图');
  assertEqual(calendarDay, TODAY, '但看的日子回到今天 —— 每次打开都从今天开始');
});

test('日历：存的视图名字不认识时退回月视图，别让页面画不出来', () => {
  const { root, storage } = calendarSetup();
  storage.setItem('calendarView', JSON.stringify('年'));   // 比如以后删掉了某个视图

  initApp(root);
  openCalendar(root);

  assertEqual(calendarView, 'month', '退回月视图');
  assert(root.querySelector('.calendar-grid'), '照样画得出来');
});

test('日历：视图选择会跟着导出 / 导入一起走', async () => {
  const { root } = calendarSetup();
  openCalendar(root);
  switchTo(root, '日');

  const text = await exportData();
  assertEqual(JSON.parse(text).data.calendarView, 'day', '导出的备份里带着它');

  setup({ categories: ['工作'] });
  await importData(text);
  assertEqual(calendarView, 'day', '导进来之后也是日视图');
});
