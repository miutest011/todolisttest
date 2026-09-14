// 打卡功能的测试。
// 复用 tests.js 里的 setup / click / press / textsOf 等工具，所以要排在它后面加载。

// 造一个打卡项目。id 固定成 'log-名字'，测试里好引用
function logItem(name, entries = [], extra = {}) {
  return Object.assign(
    { id: 'log-' + name, name: name, createdAt: FIXED_NOW, entries: entries },
    extra
  );
}

// 用本地时间构造一次打卡。月历是按本地日期算的，测试也用本地时间写最直观
function localIso(year, month, day, hour = 12, minute = 0) {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

function openLogsTab(root) {
  click(tabButton(root, '打卡'));
}

function logRow(root, name) {
  return [...root.querySelectorAll('.log-item')]
    .find((li) => li.querySelector('.log-name').textContent === name);
}

function calendarCell(root, day) {
  return [...root.querySelectorAll('.calendar-cell')].find((cell) => {
    const dayEl = cell.querySelector('.calendar-day');
    return dayEl && dayEl.textContent === String(day);
  });
}

function openLogDetailByTap(root, name) {
  click(logRow(root, name).querySelector('.log-name'));
}

// 详情页顶部三个小方块里的数字
function statValue(root, label) {
  const tile = [...root.querySelectorAll('.stat-tile')]
    .find((el) => el.querySelector('.stat-label').textContent === label);
  return tile ? tile.querySelector('.stat-value').textContent : null;
}

// 点月历上的某一天，下面的记录列表会跟着换
function selectDay(root, day) {
  click(calendarCell(root, day));
}

// FIXED_NOW 换算成本地时间是几号（不同时区可能是 8 / 9 / 10 号，所以别写死）
function fixedTodayDay() {
  return new Date(FIXED_NOW).getDate();
}

// 测试里"现在"固定在 FIXED_NOW（2026-09-09T10:00Z）。
// 换成本地时间，不管在哪个时区都还是 2026 年 9 月，所以"当月"写死成 2026-09


// ========== 打卡：数据 ==========

test('打卡：新增项目，带 id、名字和空记录，并保存', () => {
  const { storage } = setup();

  const ok = addLogItem('  喝水  ');

  assertEqual(ok, true, '应该新增成功');
  assertEqual(logItems.length, 1, '应该有一个打卡项目');
  assertEqual(
    pick(logItems[0], ['name', 'entries']),
    { name: '喝水', entries: [] },
    '名字要去掉首尾空格，记录一开始是空的'
  );
  assert(typeof logItems[0].id === 'string' && logItems[0].id !== '', '要有 id —— 以后认人靠它，不靠名字');
  assertEqual(stored(storage, 'logItems'), logItems, '要保存到存储里');
});

test('打卡：空名字和重名都不能新增', () => {
  setup({ logItems: [logItem('喝水')] });

  assertEqual(addLogItem('   '), false, '空名字不该新增');
  assertEqual(addLogItem('喝水'), false, '重名不该新增，否则列表里分不清谁是谁');
  assertEqual(logItems.length, 1, '应该还是只有一个');
});

test('打卡：记一次就追加一条当前时间的记录，并保存', () => {
  const { storage } = setup({ logItems: [logItem('喝水')] });

  recordLog('log-喝水');
  recordLog('log-喝水');

  assertEqual(logItems[0].entries, [FIXED_NOW, FIXED_NOW], '每次都记下当前时间');
  assertEqual(stored(storage, 'logItems')[0].entries.length, 2, '要保存到存储里');
});

test('打卡：改名只改名字，id 和记录原样保留', () => {
  const entries = [localIso(2026, 9, 1), localIso(2026, 9, 2)];
  setup({ logItems: [logItem('喝水', entries)] });

  renameLogItem('log-喝水', '多喝水');

  assertEqual(logItems[0].name, '多喝水', '名字应该改了');
  assertEqual(logItems[0].id, 'log-喝水', 'id 不该变 —— 这正是用 id 的好处：改名不用到处同步');
  assertEqual(logItems[0].entries, entries, '打卡记录不该受影响');
});

test('打卡：删除有记录的项目要先确认，点取消什么都不删', () => {
  setup({ logItems: [logItem('喝水', [localIso(2026, 9, 1)])] });
  let message = null;
  useConfirm((text) => { message = text; return false; });

  const result = deleteLogItem('log-喝水');

  assertEqual(result, false, '取消时应该返回 false');
  assertEqual(logItems.length, 1, '不该被删');
  assert(message && message.includes('1'), '提示里要说清楚会丢几次记录，实际：' + message);
});

test('打卡：确认之后，项目连同记录一起删掉', () => {
  const { storage } = setup({
    logItems: [logItem('喝水', [localIso(2026, 9, 1)]), logItem('健身')]
  });
  useConfirm(() => true);

  deleteLogItem('log-喝水');

  assertEqual(logItems.map((item) => item.name), ['健身'], '只删掉指定的那个');
  assertEqual(stored(storage, 'logItems').length, 1, '删除结果要保存');
});

test('打卡：删除还没打过卡的项目，不用确认', () => {
  setup({ logItems: [logItem('喝水')] });
  let asked = false;
  useConfirm(() => { asked = true; return true; });

  deleteLogItem('log-喝水');

  assertEqual(asked, false, '没有记录可丢，就别打扰用户');
  assertEqual(logItems.length, 0, '应该删掉了');
});

test('打卡：按本地日期统计每天几次，半夜的打卡不会跑到隔壁那天', () => {
  // 同一天的凌晨 0:30 和晚上 23:30。
  // 要是图省事直接取 ISO 字符串前 10 位（UTC 日期），只要不在 UTC 时区，
  // 这两条里总有一条会被算到前一天或后一天
  setup({
    logItems: [logItem('喝水', [localIso(2026, 9, 10, 0, 30), localIso(2026, 9, 10, 23, 30)])]
  });

  const counts = countLogsByDay(logItems[0]);

  assertEqual(counts['2026-09-10'], 2, '两次都该算在 9 月 10 日，实际：' + JSON.stringify(counts));
});

test('打卡：上次打卡说成人话（还没打过 / 今天 / 昨天 / N 天前）', () => {
  setup();

  assertEqual(describeLastLog(logItem('a')), '还没打过卡', '没有记录时');
  assertEqual(describeLastLog(logItem('b', [FIXED_NOW])), '今天', '今天刚打过');
  assertEqual(describeLastLog(logItem('c', [isoAfter(-24 * 60)])), '昨天', '昨天打过');
  assertEqual(
    describeLastLog(logItem('d', [isoAfter(-5 * 24 * 60), isoAfter(-24 * 60)])),
    '昨天',
    '看的是最近一次，不是最早一次'
  );
  assertEqual(describeLastLog(logItem('e', [isoAfter(-5 * 24 * 60)])), '5 天前', '好几天前');
});

test('打卡：月历周一开头，1 号对得上星期几', () => {
  setup();

  // 2026 年 9 月 1 日是周二：前面空一格（周一那格），一共 30 天
  const cells = logMonthCells('2026-09');

  assertEqual(cells.slice(0, 2), [null, 1], '1 号应该落在周二那一格');
  assertEqual(cells.filter((day) => day !== null).length, 30, '9 月有 30 天');
  assertEqual(cells[cells.length - 1], 30, '最后一格是 30 号');
});

test('打卡：闰年二月有 29 天', () => {
  setup();

  assertEqual(logMonthCells('2028-02').filter((day) => day !== null).length, 29, '2028 年是闰年');
  assertEqual(logMonthCells('2027-02').filter((day) => day !== null).length, 28, '2027 年不是闰年');
});

test('打卡：翻月份会自动跨年', () => {
  setup();

  assertEqual(shiftLogMonth('2026-12', 1), '2027-01', '12 月往后是明年 1 月');
  assertEqual(shiftLogMonth('2026-01', -1), '2025-12', '1 月往前是去年 12 月');
});

test('打卡：删某一条记录只删那一条', () => {
  const a = localIso(2026, 9, 1);
  const b = localIso(2026, 9, 2);
  const c = localIso(2026, 9, 3);
  setup({ logItems: [logItem('喝水', [a, b, c])] });

  removeLogEntry('log-喝水', b);

  assertEqual(logItems[0].entries, [a, c], '只该删掉中间那条');
});


// ========== 打卡：列表页 ==========

test('打卡页：底部有"打卡"标签，能切过去', () => {
  const { root } = setup();

  openLogsTab(root);

  assertEqual(currentTab, 'logs', '应该切到打卡页');
  assert(root.querySelector('.logs-view'), '应该显示打卡页');
  assert(tabButton(root, '打卡').classList.contains('active'), '"打卡"应该高亮');
});

test('打卡页：没有项目时有空状态提示', () => {
  const { root } = setup();

  openLogsTab(root);

  assert(root.querySelector('.logs-view .empty-state'), '空着的时候要告诉用户这里能干嘛');
});

test('打卡页：列出所有项目，右边数字是累计总次数', () => {
  const { root } = setup({
    logItems: [
      logItem('喝水', [localIso(2026, 8, 1), localIso(2026, 9, 1), localIso(2026, 9, 2)]),
      logItem('健身')
    ]
  });

  openLogsTab(root);

  assertEqual(textsOf(root, '.log-name'), ['喝水', '健身'], '两个项目都该列出来');
  assertEqual(logRow(root, '喝水').querySelector('.log-count').textContent, '3', '是累计总次数，跨月的也要算上');
  assertEqual(logRow(root, '健身').querySelector('.log-count').textContent, '0', '没打过就是 0');
  assert(
    logRow(root, '健身').querySelector('.log-meta').textContent.includes('还没打过卡'),
    '没打过卡要说清楚'
  );
});

test('打卡页：点"+ 新增打卡"，输入名字回车就创建', () => {
  const { root } = setup();
  openLogsTab(root);

  click(root.querySelector('.new-log-btn'));
  const input = root.querySelector('.add-input');
  assert(input, '点了之后应该出现输入框');

  typeInto(input, '喝水');
  press(input, 'Enter');

  assertEqual(logItems.map((item) => item.name), ['喝水'], '应该创建成功');
  assert(logRow(root, '喝水'), '列表里应该出现');
  assertEqual(root.querySelector('.add-input'), null, '创建完输入框应该收起来');
});

test('快速记录：点右边数字次数 +1，不会进详情页', () => {
  const { root } = setup({ logItems: [logItem('喝水')] });
  openLogsTab(root);

  click(logRow(root, '喝水').querySelector('.log-count'));

  assertEqual(logItems[0].entries.length, 1, '应该记了一次');
  assertEqual(logDetailId, null, '点数字只是记一次，不该跳进详情页');
  assertEqual(logRow(root, '喝水').querySelector('.log-count').textContent, '1', '数字要立刻变成 1');
});

test('快速记录：点卡片其它地方进详情页，不会顺手记一次', () => {
  const { root } = setup({ logItems: [logItem('喝水')] });
  openLogsTab(root);

  openLogDetailByTap(root, '喝水');

  assertEqual(logDetailId, 'log-喝水', '应该进入详情页');
  assertEqual(logItems[0].entries.length, 0, '进详情页不该顺带记一次');
});

test('撤销：打完卡出现撤销提示，点撤销只撤掉刚才那一次', () => {
  const earlier = localIso(2026, 9, 1, 8, 0);
  const { root } = setup({ logItems: [logItem('喝水', [earlier])] });
  openLogsTab(root);

  click(logRow(root, '喝水').querySelector('.log-count'));
  assert(root.querySelector('.undo-toast'), '应该出现撤销提示');
  assert(root.querySelector('.undo-toast').textContent.includes('喝水'), '提示里要说清楚记的是哪一个');

  click(root.querySelector('.undo-btn'));

  assertEqual(logItems[0].entries, [earlier], '只撤掉刚才那一次，之前的记录要留着');
  assertEqual(root.querySelector('.undo-toast'), null, '撤销完提示要消失');
  assertEqual(logRow(root, '喝水').querySelector('.log-count').textContent, '1', '数字要变回去');
});

test('撤销：提示过一会儿自己消失，已经记下的不受影响', async () => {
  const { root } = setup({ logItems: [logItem('喝水')] });
  useToastDuration(30);
  openLogsTab(root);

  click(logRow(root, '喝水').querySelector('.log-count'));
  assert(root.querySelector('.undo-toast'), '先确认提示出现了');

  await sleep(100);

  assertEqual(root.querySelector('.undo-toast'), null, '过了时间提示应该自己消失');
  assertEqual(logItems[0].entries.length, 1, '提示消失不等于撤销，记录要保留');
});

test('撤销：重新打开应用时，上一次的撤销提示不会残留', () => {
  const { root } = setup({ logItems: [logItem('喝水')] });
  openLogsTab(root);
  click(logRow(root, '喝水').querySelector('.log-count'));
  assert(root.querySelector('.undo-toast'), '先确认提示出现了');

  initApp(root);   // 模拟重新打开

  assertEqual(undoToast, null, '状态要清掉，否则会在测试之间、或者重开 App 时泄漏');
  assertEqual(root.querySelector('.undo-toast'), null, '界面上也不该还有提示');
});


// ========== 打卡：详情页 ==========

test('打卡详情：顶部三个小方块显示总次数、本月和上次打卡', () => {
  const { root } = setup({
    logItems: [logItem('喝水', [localIso(2026, 8, 20), localIso(2026, 9, 2), FIXED_NOW])]
  });
  openLogsTab(root);

  openLogDetailByTap(root, '喝水');

  assertEqual(root.querySelectorAll('.stat-tile').length, 3, '应该是横排三个小方块');
  assertEqual(statValue(root, '总次数'), '3', '总次数不对');
  assertEqual(statValue(root, '本月'), '2', '只该数 9 月的');
  assertEqual(statValue(root, '上次打卡'), '今天', '上次打卡要说人话');
});

test('打卡详情：打过卡的日子用手写圈圈出，不显示次数', () => {
  const { root } = setup({
    logItems: [logItem('喝水', [
      localIso(2026, 9, 5, 9), localIso(2026, 9, 5, 20), localIso(2026, 9, 6, 9)
    ])]
  });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');

  assertEqual(root.querySelector('.calendar-title').textContent, '2026-09', '默认显示当月');
  assert(calendarCell(root, 5).querySelector('.hand-circle'), '5 号打过卡，应该被圈出来');
  assert(calendarCell(root, 6).querySelector('.hand-circle'), '6 号打过卡，应该被圈出来');
  assertEqual(calendarCell(root, 7).querySelector('.hand-circle'), null, '7 号没打卡，不该有圈');
  // 5 号打了两次，但圈还是一个 —— 打了几次看下面的记录列表
  assertEqual(calendarCell(root, 5).querySelectorAll('.hand-circle').length, 1, '打几次都只圈一个圈');
  assertEqual(root.querySelector('.calendar-count'), null, '月历上不再显示次数');
});

test('打卡详情：今天用灰底圆标出，并且默认就选中今天', () => {
  const { root } = setup({ logItems: [logItem('喝水', [FIXED_NOW])] });
  openLogsTab(root);

  openLogDetailByTap(root, '喝水');

  const todayCell = calendarCell(root, fixedTodayDay());
  assert(todayCell.classList.contains('today'), '今天那一格要标出来');
  assert(todayCell.classList.contains('selected'), '刚进详情页默认看今天的记录');
  assertEqual(root.querySelectorAll('.log-entry').length, 1, '下面应该列着今天那一次');
});

test('打卡详情：点别的日期，下面就换成那天的记录', () => {
  const { root } = setup({
    logItems: [logItem('喝水', [
      localIso(2026, 9, 3, 8, 30), localIso(2026, 9, 3, 20, 15), localIso(2026, 9, 6, 9, 0)
    ])]
  });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');

  selectDay(root, 3);

  assertEqual(root.querySelectorAll('.log-entry').length, 2, '3 号打了两次');
  assert(calendarCell(root, 3).classList.contains('selected'), '3 号应该变成选中状态');
  assert(!calendarCell(root, 6).classList.contains('selected'), '同一时间只能选中一天');

  selectDay(root, 6);

  assertEqual(root.querySelectorAll('.log-entry').length, 1, '6 号只打了一次');
  assert(!calendarCell(root, 3).classList.contains('selected'), '3 号应该不再是选中状态');
});

test('打卡详情：选中没打过卡的日子，会说这天还没有打卡', () => {
  const { root } = setup({ logItems: [logItem('喝水', [localIso(2026, 9, 3, 8)])] });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');

  selectDay(root, 7);

  assertEqual(root.querySelectorAll('.log-entry').length, 0, '7 号没有记录');
  assert(root.querySelector('.log-entries-empty'), '空着的时候要给一句提示，而不是什么都不显示');
});

test('打卡详情：月历能翻到上个月，选中那天就看到当时的记录', () => {
  const { root } = setup({ logItems: [logItem('喝水', [localIso(2026, 8, 20, 9)])] });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');

  assertEqual(calendarCell(root, 20).querySelector('.hand-circle'), null, '9 月 20 号没打卡');

  click(root.querySelector('.calendar-nav[data-offset="-1"]'));

  assertEqual(root.querySelector('.calendar-title').textContent, '2026-08', '应该翻到 8 月');
  assert(calendarCell(root, 20).querySelector('.hand-circle'), '8 月 20 号应该被圈出来');
  assert(calendarCell(root, 1).classList.contains('selected'), '翻到别的月份时默认选中这个月 1 号');

  selectDay(root, 20);

  assertEqual(root.querySelectorAll('.log-entry').length, 1, '应该看到 8 月 20 号那一次');
});

test('打卡详情：在详情页点数字也能记一次', () => {
  const { root } = setup({ logItems: [logItem('喝水')] });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');

  click(root.querySelector('.detail-card .log-count'));

  assertEqual(logItems[0].entries.length, 1, '应该记了一次');
  assertEqual(logDetailId, 'log-喝水', '应该还待在详情页');
  assertEqual(statValue(root, '总次数'), '1', '小方块里的数字要跟着更新');
  assertEqual(root.querySelectorAll('.log-entry').length, 1, '今天的记录列表里应该立刻多一条');
  assert(calendarCell(root, fixedTodayDay()).querySelector('.hand-circle'), '今天应该被圈出来了');
});

test('打卡详情：可以删掉某一条记录，要先确认', () => {
  const morning = localIso(2026, 9, 3, 8, 0);
  const evening = localIso(2026, 9, 3, 20, 0);
  const { root } = setup({ logItems: [logItem('喝水', [morning, evening])] });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');
  selectDay(root, 3);

  assertEqual(root.querySelectorAll('.log-entry').length, 2, '3 号有两条记录');

  useConfirm(() => false);
  click(root.querySelector('.log-entry-remove'));
  assertEqual(logItems[0].entries.length, 2, '点取消不该删');

  useConfirm(() => true);
  click(root.querySelector('.log-entry-remove'));   // 新的在上，第一条是晚上那次

  assertEqual(logItems[0].entries, [morning], '应该只删掉晚上那一次');
  assertEqual(root.querySelectorAll('.log-entry').length, 1, '列表里应该只剩一条');
});

test('打卡详情：顶部用的是同一套悬浮圆按钮', () => {
  const { root } = setup({ logItems: [logItem('喝水')] });
  openLogsTab(root);

  openLogDetailByTap(root, '喝水');

  const header = root.querySelector('.page-header');
  assert(header, '打卡详情页顶部也该有这一行');
  assert(header.querySelector('.back-btn.round-btn'), '左边是圆形的返回按钮');
  assert(header.querySelector('.back-btn svg'), '返回箭头是画出来的 SVG');
  assert(header.querySelector('.menu-btn.round-btn'), '右边是圆形的 ⋯ 菜单按钮');
  assertEqual(root.querySelector('.detail-card .menu-btn'), null, '菜单挪到顶部了，卡片里不该还留一个');
});

test('打卡详情：⋯ 菜单里改名', () => {
  const { root } = setup({ logItems: [logItem('喝水', [localIso(2026, 9, 1)])] });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');

  click(root.querySelector('.page-header .menu-btn'));
  click(menuItemNamed(root, '重命名'));
  const input = root.querySelector('.edit-input');
  assert(input, '应该出现改名输入框');

  typeInto(input, '多喝水');
  press(input, 'Enter');

  assertEqual(logItems[0].name, '多喝水', '应该改名成功');
  assertEqual(logItems[0].entries.length, 1, '记录不该受影响');
  assertEqual(root.querySelector('.detail-title').textContent, '多喝水', '标题要跟着变');
});

test('打卡详情：⋯ 菜单里删除后回到打卡列表', () => {
  const { root } = setup({ logItems: [logItem('喝水', [localIso(2026, 9, 1)])] });
  useConfirm(() => true);
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');

  click(root.querySelector('.page-header .menu-btn'));
  click(menuItemNamed(root, '删除打卡项目'));

  assertEqual(logItems.length, 0, '应该删掉了');
  assertEqual(logDetailId, null, '删完应该退出详情页');
  assert(root.querySelector('.logs-view'), '应该回到打卡列表');
});

test('打卡详情：不显示标签栏，返回后回到打卡页', () => {
  const { root } = setup({ logItems: [logItem('喝水')] });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');

  assertEqual(root.querySelector('.tab-bar'), null, '详情页是盖在上面的一层');

  click(root.querySelector('.back-btn'));

  assert(root.querySelector('.logs-view'), '返回应该回到打卡页，而不是清单页');
  assert(root.querySelector('.tab-bar'), '标签栏应该回来了');
});

test('打卡详情：重新打开应用时，详情页状态会清掉', () => {
  const { root } = setup({ logItems: [logItem('喝水')] });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');
  assertEqual(logDetailId, 'log-喝水', '先确认进了详情页');

  initApp(root);

  assertEqual(logDetailId, null, '上次 currentTab 泄漏就是这么来的，这回提前防住');
  assertEqual(logCalendarMonth, null, '月历翻到哪个月也要清掉');
  assertEqual(logSelectedDay, null, '选中了哪一天同样要清掉');
  assert(root.querySelector('#category-list'), '应该回到清单页');
});


// ========== 打卡：补录 ==========
// FIXED_NOW 换成本地时间一定落在 2026 年 9 月（不管什么时区），
// 只是几号可能是 8/9/10，所以这里都相对"今天"来取
function pastDay() {
  return fixedTodayDay() - 3;
}

function futureDay() {
  return fixedTodayDay() + 3;
}

function pastDayKey() {
  return `2026-09-${String(pastDay()).padStart(2, '0')}`;
}

test('补录：过去没打卡的日子，会出现补录入口', () => {
  const { root } = setup({ logItems: [logItem('喝水')] });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');

  selectDay(root, pastDay());

  assert(root.querySelector('.backfill-btn'), '过去空着的日子应该能补录');
});

test('补录：今天不显示补录入口（直接点大数字更快）', () => {
  const { root } = setup({ logItems: [logItem('喝水')] });
  openLogsTab(root);

  openLogDetailByTap(root, '喝水');   // 默认就选中今天

  assertEqual(root.querySelector('.backfill-btn'), null, '今天有更快的方式：点大数字');
  assert(root.querySelector('.log-entries-empty'), '还是要说一句今天还没打卡');
});

test('补录：还没到的日子不显示补录入口', () => {
  const { root } = setup({ logItems: [logItem('喝水')] });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');

  selectDay(root, futureDay());

  assertEqual(root.querySelector('.backfill-btn'), null, '将来的日子没法补录');
});

test('补录：那天已经有记录时不显示补录入口', () => {
  const { root } = setup({ logItems: [logItem('喝水', [localIso(2026, 9, 3, 9)])] });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');

  selectDay(root, 3);

  assertEqual(root.querySelector('.backfill-btn'), null, '有记录就不需要补录了');
});

test('补录：填个时间就补上一次，落在选中那天（深夜也不会跑到第二天）', () => {
  const { root, storage } = setup({ logItems: [logItem('喝水')] });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');
  selectDay(root, pastDay());

  click(root.querySelector('.backfill-btn'));
  const input = root.querySelector('.backfill-time');
  assert(input, '点补录应该出现填时间的输入框');
  assertEqual(input.value, '12:00', '默认给个中午，省得每次都要从头选');

  typeInto(input, '23:30');
  click(root.querySelector('.backfill-confirm'));

  assertEqual(logItems[0].entries.length, 1, '应该补上一条');
  assertEqual(logDateKey(logItems[0].entries[0]), pastDayKey(), '这条要算在选中那天，而不是第二天');
  assertEqual(stored(storage, 'logItems')[0].entries.length, 1, '要保存下来');
});

test('补录：填的是本地时间，凌晨和深夜都落在当天', () => {
  setup({ logItems: [logItem('喝水')] });

  // 只挑一个时间点是不够的：本机在 UTC-7，"把用户填的时间当成 UTC"这种 bug，
  // 单用 23:30 根本看不出来（23:30Z 换算回本地还是当天）。
  // 凌晨和深夜各来一次，不管在哪个时区都能把它逼出来 ——
  // 这条测试就是变异测试逼出来的，原来那条是靠运气过的
  backfillLog('log-喝水', '2026-09-06', '00:30');
  backfillLog('log-喝水', '2026-09-06', '23:30');

  const counts = countLogsByDay(logItems[0]);

  assertEqual(counts['2026-09-06'], 2, '两次都该算在 9 月 6 日，实际：' + JSON.stringify(counts));
});

test('补录：补完之后那天被圈出来、次数加一、记录列表里也出现', () => {
  const { root } = setup({ logItems: [logItem('喝水')] });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');
  selectDay(root, pastDay());

  click(root.querySelector('.backfill-btn'));
  typeInto(root.querySelector('.backfill-time'), '09:15');
  click(root.querySelector('.backfill-confirm'));

  assertEqual(statValue(root, '总次数'), '1', '总次数要跟着变');
  assert(calendarCell(root, pastDay()).querySelector('.hand-circle'), '那天应该被圈出来');
  assertEqual(textsOf(root, '.log-entry-time'), ['09:15'], '记录列表里应该出现补录的那一次');
  assertEqual(root.querySelector('.backfill-btn'), null, '这天有记录了，不该再显示补录入口');
});

test('补录：点取消不会加记录', () => {
  const { root } = setup({ logItems: [logItem('喝水')] });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');
  selectDay(root, pastDay());

  click(root.querySelector('.backfill-btn'));
  click(root.querySelector('.backfill-cancel'));

  assertEqual(logItems[0].entries.length, 0, '取消就不该加');
  assert(root.querySelector('.backfill-btn'), '应该回到"+ 补录一次"那个按钮');
});

test('补录：时间空着不会加记录', () => {
  const { root } = setup({ logItems: [logItem('喝水')] });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');
  selectDay(root, pastDay());

  click(root.querySelector('.backfill-btn'));
  typeInto(root.querySelector('.backfill-time'), '');
  click(root.querySelector('.backfill-confirm'));

  assertEqual(logItems[0].entries.length, 0, '没填时间就别加了');
});

test('补录：重新打开应用时，补录状态会清掉', () => {
  const { root } = setup({ logItems: [logItem('喝水')] });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');
  selectDay(root, pastDay());
  click(root.querySelector('.backfill-btn'));
  assertEqual(backfillingDay, pastDayKey(), '先确认进入了补录状态');

  initApp(root);

  assertEqual(backfillingDay, null, '界面状态都要在重置里清掉，这是踩过的坑');
});

test('补录：补上的记录和平常的一样，可以删掉', () => {
  const { root } = setup({ logItems: [logItem('喝水')] });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');
  selectDay(root, pastDay());

  click(root.querySelector('.backfill-btn'));
  typeInto(root.querySelector('.backfill-time'), '10:00');
  click(root.querySelector('.backfill-confirm'));

  useConfirm(() => true);
  click(root.querySelector('.log-entry-remove'));

  assertEqual(logItems[0].entries.length, 0, '补录的记录也能删');
  assert(root.querySelector('.backfill-btn'), '删完之后又能补录了');
});


// ========== 打卡：兼容、工程检查、性能 ==========

// ========== 打卡：标签与归档 ==========

// 造一个标签。id 固定成 'tag-名字'，测试里好引用
function logTag(name) {
  return { id: 'tag-' + name, name: name };
}

// 顶部标签行里的某一个（包括"所有""已归档""+ 新增"）
function tagChip(root, text) {
  return [...root.querySelectorAll('.tag-bar .tag-chip')].find((el) => el.textContent === text);
}

// 新增编辑区 / 详情页里可以点选的标签
function tagOption(root, text) {
  return [...root.querySelectorAll('.tag-option')].find((el) => el.textContent === text);
}

function visibleLogNames(root) {
  return textsOf(root, '.log-item .log-name');
}

function touchDown(element, x = 10, y = 10) {
  element.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, pointerType: 'touch', clientX: x, clientY: y
  }));
}

// 三个项目：跑步带"健身"，读书带"学习"，旧习惯已归档
function taggedSetup() {
  return setup({
    logTags: [logTag('健身'), logTag('学习')],
    logItems: [
      logItem('跑步', [], { tagIds: ['tag-健身'] }),
      logItem('读书', [], { tagIds: ['tag-学习'] }),
      logItem('旧习惯', [], { archived: true })
    ]
  });
}

test('标签：新增带 id 并保存；空名、重名、叫"所有"或"已归档"都不行', () => {
  const { storage } = setup({ logTags: [logTag('健身')] });

  const tag = addLogTag('  学习  ');

  assert(tag && tag.id, '应该返回新标签，带 id');
  assertEqual(logTags.map((t) => t.name), ['健身', '学习'], '名字去掉空格，排在已有标签后面');
  assertEqual(stored(storage, 'logTags'), logTags, '要保存到存储里');

  assertEqual(addLogTag('   '), null, '空名不行');
  assertEqual(addLogTag('健身'), null, '重名不行');
  assertEqual(addLogTag('所有'), null, '"所有"是固定项，重名会让顶部分不清');
  assertEqual(addLogTag('已归档'), null, '"已归档"同理');
  assertEqual(logTags.length, 2, '上面这些都不该建出来');
});

test('标签：改名只改名字，项目还在这个标签下', () => {
  taggedSetup();

  assertEqual(renameLogTag('tag-健身', '运动'), true, '应该改成功');
  assertEqual(findLogTag('tag-健身').name, '运动', '名字改了');
  assertEqual(findLogItem('log-跑步').tagIds, ['tag-健身'], '项目身上记的是 id，不用跟着改');
  assertEqual(logItemsInFilter('tag-健身').map((i) => i.name), ['跑步'], '筛选照样有效');

  assertEqual(renameLogTag('tag-健身', '学习'), false, '不能改成别的标签的名字');
  assertEqual(renameLogTag('tag-健身', '已归档'), false, '不能改成固定项的名字');
});

test('标签：删除有项目在用的标签要确认，取消就不删', () => {
  taggedSetup();
  let message = null;
  useConfirm((text) => { message = text; return false; });

  assertEqual(deleteLogTag('tag-健身'), false, '取消时返回 false');
  assert(findLogTag('tag-健身'), '标签还在');
  assertEqual(findLogItem('log-跑步').tagIds, ['tag-健身'], '项目身上的标签也还在');
  assert(message && message.includes('1') && message.includes('不会删掉'), '提示要说清几个项目、项目本身不会删，实际：' + message);
});

test('标签：确认删除后，项目和记录都在，只是身上少了这个标签', () => {
  const { storage } = setup({
    logTags: [logTag('健身'), logTag('户外')],
    logItems: [logItem('跑步', [FIXED_NOW], { tagIds: ['tag-健身', 'tag-户外'] })]
  });

  deleteLogTag('tag-健身');

  assertEqual(logTags.map((t) => t.name), ['户外'], '标签删掉了');
  assertEqual(logItems.length, 1, '项目不能跟着删');
  assertEqual(pick(logItems[0], ['entries', 'tagIds']), { entries: [FIXED_NOW], tagIds: ['tag-户外'] }, '记录还在，只少了被删的标签');
  assertEqual(stored(storage, 'logItems')[0].tagIds, ['tag-户外'], '项目的变化也要保存');
});

test('标签：没有项目在用的标签，直接删不用确认', () => {
  setup({ logTags: [logTag('健身')] });
  let asked = false;
  useConfirm(() => { asked = true; return true; });

  deleteLogTag('tag-健身');

  assertEqual(asked, false, '没什么可丢的，别打扰用户');
  assertEqual(logTags.length, 0, '应该删掉了');
});

test('标签：新增项目可以带标签，不存在的和重复的会被去掉', () => {
  setup({ logTags: [logTag('健身')] });

  addLogItem('跑步', ['tag-健身', 'tag-健身', 'tag-不存在']);

  assertEqual(pick(logItems[0], ['tagIds', 'archived']), { tagIds: ['tag-健身'], archived: false }, '只留真实存在的，且不重复');
});

test('标签：给项目加上、再去掉标签，都会保存', () => {
  const { storage } = setup({ logTags: [logTag('健身'), logTag('户外')], logItems: [logItem('跑步')] });

  toggleLogItemTag('log-跑步', 'tag-健身');
  toggleLogItemTag('log-跑步', 'tag-户外');
  assertEqual(findLogItem('log-跑步').tagIds, ['tag-健身', 'tag-户外'], '一个项目可以有多个标签');

  toggleLogItemTag('log-跑步', 'tag-健身');
  assertEqual(findLogItem('log-跑步').tagIds, ['tag-户外'], '再点一次就去掉');
  assertEqual(stored(storage, 'logItems')[0].tagIds, ['tag-户外'], '要保存');
});

test('归档：去掉所有标签；取消归档后标签不会自己回来；归档的项目不能加标签', () => {
  const { storage } = setup({
    logTags: [logTag('健身'), logTag('户外')],
    logItems: [logItem('跑步', [FIXED_NOW], { tagIds: ['tag-健身', 'tag-户外'] })]
  });

  archiveLogItem('log-跑步');
  assertEqual(pick(logItems[0], ['archived', 'tagIds', 'entries']), { archived: true, tagIds: [], entries: [FIXED_NOW] }, '归档去掉标签，记录留着');
  assertEqual(stored(storage, 'logItems')[0].archived, true, '要保存');

  assertEqual(toggleLogItemTag('log-跑步', 'tag-健身'), false, '归档的不能加标签');
  assertEqual(logItems[0].tagIds, [], '确实没加上');

  unarchiveLogItem('log-跑步');
  assertEqual(pick(logItems[0], ['archived', 'tagIds']), { archived: false, tagIds: [] }, '取消归档，标签是空的');
});

test('标签：老数据没有标签字段时补上默认值，指向不存在标签的 id 会被去掉', () => {
  setup({
    logTags: [logTag('健身')],
    logItems: [
      { id: 'log-老项目', name: '老项目', createdAt: FIXED_NOW, entries: [] },
      logItem('跑步', [], { tagIds: ['tag-健身', 'tag-早就删了'] }),
      logItem('怪数据', [], { archived: true, tagIds: ['tag-健身'] })
    ]
  });

  assertEqual(pick(findLogItem('log-老项目'), ['tagIds', 'archived']), { tagIds: [], archived: false }, '老数据补默认值');
  assertEqual(findLogItem('log-跑步').tagIds, ['tag-健身'], '不存在的标签 id 去掉，存在的留着');
  assertEqual(findLogItem('log-怪数据').tagIds, [], '已归档的不该带标签');
});

test('标签：所有 = 没归档的；某个标签 = 带它的；已归档 = 归档了的', () => {
  taggedSetup();

  assertEqual(logItemsInFilter('all').map((i) => i.name), ['跑步', '读书'], '"所有"不含已归档');
  assertEqual(logItemsInFilter('tag-健身').map((i) => i.name), ['跑步'], '只列带这个标签的');
  assertEqual(logItemsInFilter('archived').map((i) => i.name), ['旧习惯'], '只列归档了的');
});

test('打卡页顶部：所有 / 自己的标签 / 已归档 / + 新增，默认选中"所有"', () => {
  const { root } = taggedSetup();
  openLogsTab(root);

  assertEqual(textsOf(root, '.tag-bar .tag-chip'), ['所有', '健身', '学习', '已归档', '+ 新增'], '顺序：用户标签夹在中间');
  assertEqual(textsOf(root, '.tag-chip.active'), ['所有'], '默认选中所有，且只选中一个');
  assertEqual(visibleLogNames(root), ['跑步', '读书'], '"所有"下看不到归档的');
});

test('打卡页顶部：点标签就只看这一类，高亮跟着走', () => {
  const { root } = taggedSetup();
  openLogsTab(root);

  click(tagChip(root, '健身'));
  assertEqual(visibleLogNames(root), ['跑步'], '只剩带"健身"的');
  assertEqual(textsOf(root, '.tag-chip.active'), ['健身'], '高亮换到健身');

  click(tagChip(root, '已归档'));
  assertEqual(visibleLogNames(root), ['旧习惯'], '只剩归档的');
  assertEqual(root.querySelector('.new-log-btn'), null, '已归档下不给新增入口：新建的不是归档状态，会立刻消失');

  click(tagChip(root, '所有'));
  assertEqual(visibleLogNames(root), ['跑步', '读书'], '回到所有');
  assert(root.querySelector('.new-log-btn'), '新增入口回来了');
});

test('打卡页顶部：各种"没有东西"时的提示说得清楚', () => {
  const { root } = setup({ logTags: [logTag('健身')], logItems: [logItem('旧习惯', [], { archived: true })] });
  openLogsTab(root);

  assert(root.querySelector('.empty-state').textContent.includes('已归档'), '"所有"是空的但有归档项目时，要告诉用户去哪找');

  click(tagChip(root, '健身'));
  assert(root.querySelector('.empty-state').textContent.includes('这个标签下'), '空标签要说明怎么加进来');

  deleteLogItem('log-旧习惯');
  click(tagChip(root, '已归档'));
  assert(root.querySelector('.empty-state').textContent.includes('⋯'), '没有归档项目时，说明从哪里归档');
});

test('打卡页顶部：点"+ 新增"输入名字回车，新标签出现在"已归档"前面', () => {
  const { root, storage } = taggedSetup();
  openLogsTab(root);

  click(tagChip(root, '+ 新增'));
  const input = root.querySelector('.tag-bar .tag-input');
  assert(input, '应该变成输入框');
  assert(document.activeElement === input, '光标要自动放进去');

  typeInto(input, '户外');
  press(input, 'Enter');

  assertEqual(textsOf(root, '.tag-bar .tag-chip'), ['所有', '健身', '学习', '户外', '已归档', '+ 新增'], '新标签排在自定义标签最后');
  assertEqual(root.querySelector('.tag-input'), null, '输入框收起');
  assertEqual(stored(storage, 'logTags').length, 3, '保存了');
});

test('打卡页顶部：新增标签时按 Esc 不创建', () => {
  const { root } = taggedSetup();
  openLogsTab(root);

  click(tagChip(root, '+ 新增'));
  const input = root.querySelector('.tag-input');
  typeInto(input, '户外');
  press(input, 'Escape');

  assertEqual(logTags.length, 2, '不该建出来');
  assertEqual(root.querySelector('.tag-input'), null, '输入框收起');
});

test('新增打卡：可以顺手选标签，点标签不会把已经打的名字清掉', () => {
  const { root } = taggedSetup();
  openLogsTab(root);

  click(root.querySelector('.new-log-btn'));
  const input = root.querySelector('.log-draft .add-input');
  typeInto(input, '游泳');
  input.dispatchEvent(new Event('input', { bubbles: true }));

  click(tagOption(root, '健身'));    // 页面会重画，输入框是新造的

  assertEqual(root.querySelector('.log-draft .add-input').value, '游泳', '名字不能丢 —— 手机上这种事特别让人抓狂');
  assertEqual(textsOf(root, '.tag-option.selected'), ['健身'], '点了的标签高亮');

  press(root.querySelector('.log-draft .add-input'), 'Enter');

  assertEqual(findLogItemByName('游泳').tagIds, ['tag-健身'], '建出来的项目带着选的标签');
  assertEqual(root.querySelector('.log-draft'), null, '编辑区收起');
});

test('新增打卡：点"创建"按钮也能建，点"取消"什么都不建', () => {
  const { root } = taggedSetup();
  openLogsTab(root);

  click(root.querySelector('.new-log-btn'));
  typeInto(root.querySelector('.log-draft .add-input'), '游泳');
  click(root.querySelector('.log-draft-cancel'));
  assertEqual(findLogItemByName('游泳'), null, '取消不该建');
  assertEqual(root.querySelector('.log-draft'), null, '取消后收起');

  click(root.querySelector('.new-log-btn'));
  const input = root.querySelector('.log-draft .add-input');
  typeInto(input, '游泳');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  click(root.querySelector('.log-draft-create'));
  assert(findLogItemByName('游泳'), '点创建应该建出来');
});

test('新增打卡：停在某个标签下时，默认带上这个标签，建完还在这个标签下', () => {
  const { root } = taggedSetup();
  openLogsTab(root);
  click(tagChip(root, '健身'));

  click(root.querySelector('.new-log-btn'));
  assertEqual(textsOf(root, '.tag-option.selected'), ['健身'], '默认选上当前标签');

  const input = root.querySelector('.log-draft .add-input');
  typeInto(input, '游泳');
  press(input, 'Enter');

  assertEqual(findLogItemByName('游泳').tagIds, ['tag-健身'], '带上了');
  assertEqual(textsOf(root, '.tag-chip.active'), ['健身'], '还停在健身');
  assert(visibleLogNames(root).includes('游泳'), '新项目就在眼前');
});

test('新增打卡：在某个标签下却取消了这个标签，建完切回"所有"，免得以为没建成', () => {
  const { root } = taggedSetup();
  openLogsTab(root);
  click(tagChip(root, '健身'));

  click(root.querySelector('.new-log-btn'));
  click(tagOption(root, '健身'));      // 取消掉默认带的
  const input = root.querySelector('.log-draft .add-input');
  typeInto(input, '游泳');
  press(input, 'Enter');

  assertEqual(textsOf(root, '.tag-chip.active'), ['所有'], '切回所有');
  assert(visibleLogNames(root).includes('游泳'), '看得到刚建的');
});

test('新增打卡：在编辑区里新建标签，自动给这个项目选上，名字也还在', () => {
  const { root } = taggedSetup();
  openLogsTab(root);

  click(root.querySelector('.new-log-btn'));
  const nameInput = root.querySelector('.log-draft .add-input');
  typeInto(nameInput, '游泳');
  nameInput.dispatchEvent(new Event('input', { bubbles: true }));

  click(tagOption(root, '+ 新增标签'));
  const tagInput = root.querySelector('.log-draft .tag-input');
  assert(tagInput, '应该出现标签输入框');
  assert(document.activeElement === tagInput, '光标要进标签输入框，而不是上面的名字输入框');

  typeInto(tagInput, '水上');
  press(tagInput, 'Enter');

  assertEqual(textsOf(root, '.tag-option.selected'), ['水上'], '新标签自动选上');
  assertEqual(root.querySelector('.log-draft .add-input').value, '游泳', '名字还在');
  assert(tagChip(root, '水上'), '顶部也出现了');
});

test('打卡详情：点标签给项目加上 / 去掉', () => {
  const { root } = taggedSetup();
  openLogsTab(root);
  openLogDetailByTap(root, '跑步');

  assertEqual(textsOf(root, '.log-item-tags .tag-option.selected'), ['健身'], '已有的标签是选中状态');

  click(tagOption(root, '学习'));
  assertEqual(findLogItem('log-跑步').tagIds, ['tag-健身', 'tag-学习'], '加上了');

  click(tagOption(root, '健身'));
  assertEqual(findLogItem('log-跑步').tagIds, ['tag-学习'], '去掉了');
  assertEqual(textsOf(root, '.log-item-tags .tag-option.selected'), ['学习'], '界面跟着变');
});

test('打卡详情：在详情页新建标签，直接加到这个项目上', () => {
  const { root } = taggedSetup();
  openLogsTab(root);
  openLogDetailByTap(root, '跑步');

  click(tagOption(root, '+ 新增标签'));
  const input = root.querySelector('.log-item-tags .tag-input');
  typeInto(input, '户外');
  press(input, 'Enter');

  const outdoor = logTags.find((t) => t.name === '户外');
  assert(outdoor, '标签建出来了');
  assertEqual(findLogItem('log-跑步').tagIds, ['tag-健身', outdoor.id], '直接加到了这个项目上');
});

test('打卡详情：⋯ 菜单归档后标签清空，菜单变成"取消归档"，列表里去了"已归档"', () => {
  const { root } = taggedSetup();
  openLogsTab(root);
  openLogDetailByTap(root, '跑步');

  click(root.querySelector('.page-header .menu-btn'));
  click(menuItemNamed(root, '归档'));

  assertEqual(findLogItem('log-跑步').tagIds, [], '标签清空');
  assertEqual(root.querySelector('.tag-option'), null, '归档的项目不显示可选标签');
  assert(root.querySelector('.log-tags-hint'), '给一句说明，不然用户以为标签坏了');

  click(root.querySelector('.page-header .menu-btn'));
  assert(menuItemNamed(root, '取消归档'), '菜单里换成取消归档');
  assertEqual(menuItemNamed(root, '归档'), undefined, '不再有"归档"');
  click(root.querySelector('.page-header .menu-btn'));

  click(root.querySelector('.back-btn'));
  assertEqual(visibleLogNames(root), ['读书'], '"所有"里不见了');
  click(tagChip(root, '已归档'));
  assertEqual(visibleLogNames(root), ['跑步', '旧习惯'], '去了已归档（按原来的顺序排）');
});

test('打卡详情：已归档的点"取消归档"，回到"所有"里', () => {
  const { root } = taggedSetup();
  openLogsTab(root);
  click(tagChip(root, '已归档'));
  openLogDetailByTap(root, '旧习惯');

  click(root.querySelector('.page-header .menu-btn'));
  click(menuItemNamed(root, '取消归档'));

  assertEqual(findLogItem('log-旧习惯').archived, false, '取消归档了');
  assert(root.querySelector('.log-item-tags .tag-option'), '又能选标签了');
});

test('标签管理：手机上长按标签，出现改名 / 删除，抬手补发的那次点击不会把它关掉', async () => {
  const { root } = taggedSetup();
  openLogsTab(root);

  touchDown(tagChip(root, '健身'));
  await sleep(20);

  const manager = root.querySelector('.tag-manager');
  assert(manager, '长按后应该出现操作条');
  assert(manager.textContent.includes('健身'), '要说清在管理哪个标签');
  assert(tagChip(root, '健身').classList.contains('managing'), '被长按的标签有标记');

  click(tagChip(root, '健身'));    // 手指抬起后浏览器补发的点击
  assert(root.querySelector('.tag-manager'), '不能一闪就没');

  click(tagChip(root, '学习'));
  assertEqual(root.querySelector('.tag-manager'), null, '点别的标签就收起');
});

test('标签管理：按住时手指滑动（在横着滑标签行）不算长按', async () => {
  const { root } = taggedSetup();
  openLogsTab(root);
  useLongPressDelay(30);     // 留一点时间让"滑动"发生在长按判定之前

  const chip = tagChip(root, '健身');
  touchDown(chip, 10, 10);
  chip.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'touch', clientX: 60, clientY: 10 }));
  await sleep(60);

  assertEqual(root.querySelector('.tag-manager'), null, '滑动不该弹出操作条');
});

test('标签管理：电脑上右键也能打开；"所有""已归档"不能管理', () => {
  const { root } = taggedSetup();
  openLogsTab(root);

  tagChip(root, '所有').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  tagChip(root, '已归档').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  assertEqual(root.querySelector('.tag-manager'), null, '固定项不能改名删除');

  tagChip(root, '学习').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  assert(root.querySelector('.tag-manager'), '右键打开');

  click(root.querySelector('.tag-done'));
  assertEqual(root.querySelector('.tag-manager'), null, '点完成收起');
});

test('标签管理：改名', () => {
  const { root } = taggedSetup();
  openLogsTab(root);
  tagChip(root, '健身').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

  click(root.querySelector('.tag-rename'));
  const input = root.querySelector('.tag-manager .edit-input');
  assertEqual(input.value, '健身', '输入框里是原名');

  typeInto(input, '运动');
  press(input, 'Enter');

  assert(tagChip(root, '运动'), '顶部显示新名字');
  assertEqual(tagChip(root, '健身'), undefined, '旧名字没了');
});

test('标签管理：删掉正在看的标签，回到"所有"', () => {
  const { root } = taggedSetup();
  openLogsTab(root);
  click(tagChip(root, '健身'));
  tagChip(root, '健身').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

  click(root.querySelector('.tag-delete'));

  assertEqual(tagChip(root, '健身'), undefined, '标签没了');
  assertEqual(textsOf(root, '.tag-chip.active'), ['所有'], '回到所有，不能停在一个不存在的标签上');
  assertEqual(root.querySelector('.tag-manager'), null, '操作条收起');
  assertEqual(visibleLogNames(root), ['跑步', '读书'], '项目都还在');
});

test('标签：重新打开应用时，选中的标签、输入、管理、新增编辑区全都清掉', () => {
  const { root } = taggedSetup();
  openLogsTab(root);
  click(tagChip(root, '健身'));
  click(tagChip(root, '+ 新增'));
  tagChip(root, '学习').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  click(root.querySelector('.new-log-btn'));

  initApp(root);

  assertEqual(
    { logTagFilter, addingTagIn, managingTagId, renamingTagId, logItemDraft },
    { logTagFilter: 'all', addingTagIn: null, managingTagId: null, renamingTagId: null, logItemDraft: null },
    '界面状态都要回到初始值'
  );
  assertEqual(logTags.length, 2, '标签数据本身要读回来');
});

test('标签：冷启动时项目身上的标签能读回来（先读标签、再读项目）', () => {
  const { root } = taggedSetup();

  // 模拟手机上真正重新打开 App：内存里什么都没有，只有存储里的数据。
  // 不清空的话，上一步（甚至上一条测试）留在内存里的标签会"碰巧"让读取顺序错了也能通过
  logTags = [];
  logItems = [];
  initApp(root);

  assertEqual(findLogItem('log-跑步').tagIds, ['tag-健身'], '先读项目再读标签的话，对照时标签列表还是空的，所有标签都会被当成不存在清掉');
});

function findLogItemByName(name) {
  return logItems.find((item) => item.name === name) || null;
}

test('打卡：老用户没有打卡数据时一切正常，也不影响待办', () => {
  const { root, storage } = setup({
    categories: ['工作'],
    todos: [{ text: '写周报', status: 'active', category: '工作' }]
  });

  assertEqual(logItems, [], '没有打卡数据时应该是空列表');
  assertEqual(storage.getItem('logItems'), null, '光是打开不该凭空写入打卡数据');

  openLogsTab(root);
  addLogItem('喝水');

  assertEqual(todos.map((todo) => todo.text), ['写周报'], '打卡和待办是两块数据，互不影响');
  assert(stored(storage, 'todos'), '待办数据还在');
});

test('工程：index.html 加载的本地脚本都在 sw.js 的缓存列表里', async () => {
  // 漏掉的话，装成 App 离线打开时会缺文件 —— 而其它测试是抓不到这个问题的
  if (location.protocol === 'file:') {
    skip('要读项目里的文件，需要用 python3 tools/dev-server.py 打开测试页');
  }

  const [html, sw] = await Promise.all([
    fetch('../index.html').then((response) => response.text()),
    fetch('../sw.js').then((response) => response.text())
  ]);

  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((src) => !/^https?:/.test(src));
  const cachedFiles = [...sw.matchAll(/'\.\/([^']+)'/g)].map((match) => match[1]);

  assert(scripts.length > 0, '没从 index.html 里找到任何脚本，这条检查本身可能写错了');

  scripts.forEach((src) => {
    assert(
      cachedFiles.includes(src.replace(/^\.\//, '')),
      `index.html 加载了 ${src}，但 sw.js 的缓存列表里没有它 —— 装成 App 离线打开时会缺这个文件`
    );
  });
});

test('性能：几千条打卡记录时，列表和详情页依然渲染得很快', () => {
  // 每 4 小时打一次卡，一共 3650 次（大约 600 天）
  const entries = [];
  for (let i = 0; i < 3650; i++) {
    entries.push(isoAfter(-i * 4 * 60));
  }
  const { root } = setup({ logItems: [logItem('喝水', entries)] });

  const start = performance.now();
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');
  const elapsed = performance.now() - start;

  assert(root.querySelector('.log-calendar'), '应该进到了详情页');
  assert(elapsed < 300, `切到打卡页再进详情页一共用了 ${Math.round(elapsed)}ms，数据多了会卡`);
});
