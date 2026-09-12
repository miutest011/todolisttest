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

test('打卡详情：⋯ 菜单里改名', () => {
  const { root } = setup({ logItems: [logItem('喝水', [localIso(2026, 9, 1)])] });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');

  click(root.querySelector('.detail-card .menu-btn'));
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

  click(root.querySelector('.detail-card .menu-btn'));
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
