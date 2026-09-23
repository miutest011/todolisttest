// 为"装成 iOS 应用"做的两件事：
// ① 把到点的提醒交给系统（app 关着也能响，纯网页做不到）；
// ② 导出 / 导入全部数据（应用里的数据和 Safari 里的各存各的，搬家靠它）。
// 这里测的是网页这一半 —— 外壳那一半（Swift）不在这套测试里，只能装到手机上试。
// 复用 tests.js、tests-logs.js 里的工具，所以排在它们后面加载。

// 假的"系统"：先照常 setup，再把它装上（setup 会把可替换的依赖复位，装早了会被冲掉），
// 然后重画一次 —— 真实的外壳也是这个顺序：应用一启动就接手，之后每次重画都会对一遍单子。
// 返回值 rounds 是"交出去过几张单子、每张是什么"
function setupWithScheduler(data) {
  const context = setup(data);
  const rounds = [];
  useReminderScheduler({ replaceAll: (list) => rounds.push(list) });
  render();
  context.rounds = rounds;
  return context;
}

// 一条带截止时间和提醒的任务。minutes 是相对"现在"多少分钟之后到期
function dueTodo(text, minutes, remindBefore = 0, extra = {}) {
  return Object.assign({
    text: text,
    status: 'active',
    category: '工作',
    dueAt: isoAfter(minutes),
    remindBefore: remindBefore,
    reminded: false
  }, extra);
}


// ========== 把提醒交给系统 ==========

test('交给系统：重画时把"还没到点"的提醒整张单子交出去，按时间先后排', () => {
  const { rounds } = setupWithScheduler({
    categories: ['工作'],
    todos: [dueTodo('晚一点的', 120), dueTodo('早一点的', 30)]
  });

  assertEqual(rounds.length, 1, '画完一次就交了一张单子');
  assertEqual(rounds[0].map((r) => r.body), [
    `早一点的（截止 ${formatDateTime(isoAfter(30))}）`,
    `晚一点的（截止 ${formatDateTime(isoAfter(120))}）`
  ], '按到点的先后排，内容和自己弹的那条一样');
  assertEqual(rounds[0][0].title, '待办提醒', '通知的标题');
  assertEqual(rounds[0][0].fireAt, isoAfter(30), '提前 0 分钟：就在截止时间弹');
});

test('交给系统：提前量算进去了（提前 30 分钟的，交的是截止前半小时）', () => {
  const { rounds } = setupWithScheduler({ categories: ['工作'], todos: [dueTodo('开会', 120, 30)] });

  assertEqual(rounds[0][0].fireAt, isoAfter(90), '120 分钟后截止、提前 30 分钟提醒 = 90 分钟后弹');
});

test('交给系统：不该提醒的都不交（不提醒、已提醒过、做完的、放弃的、归档清单里的）', () => {
  const { rounds } = setupWithScheduler({
    categories: ['工作', '旧项目'],
    categoryMeta: { '旧项目': { tagId: null, archived: true } },
    todos: [
      dueTodo('要提醒的', 60),
      dueTodo('没设提醒', 60, null),
      dueTodo('已经提醒过了', 60, 0, { reminded: true }),
      dueTodo('做完了', 60, 0, { status: 'done' }),
      dueTodo('放弃了', 60, 0, { status: 'abandoned' }),
      dueTodo('归档清单里的', 60, 0, { category: '旧项目' })
    ]
  });

  assertEqual(rounds[0].length, 1, '只有一条该交');
  assert(rounds[0][0].body.includes('要提醒的'), '交的是那一条');
});

test('交给系统：时间已经过了的不交（系统排不了过去的闹钟），由打开应用时补上', () => {
  const { rounds, notifications, storage } = setupWithScheduler({
    categories: ['工作'],
    todos: [dueTodo('昨天就该提醒', -60), dueTodo('待会儿提醒', 60)]
  });

  assertEqual(rounds[0].map((r) => r.body.slice(0, 5)), ['待会儿提醒'], '过了点的不交给系统');

  checkReminders();
  assertEqual(notifications, [], '交给系统之后，自己不再弹 —— 否则一打开应用就是一串重复通知');
  assertEqual(todos[0].reminded, true, '但要记上"提醒过了"：这条系统在 app 关着的时候已经弹过');
  assertEqual(JSON.parse(storage.getItem('todos'))[0].reminded, true, '而且要存下来');
});

test('交给系统：没人接手时（纯网页）还是自己弹，一点没变', () => {
  const { notifications } = setup({ categories: ['工作'], todos: [dueTodo('喝水', -1)] });

  checkReminders();
  assertEqual(notifications.length, 1, '网页版照旧自己弹');
  assertEqual(todos[0].reminded, true, '弹过就记上');
});

test('交给系统：单子没变就不再打扰系统；改了任务才重新交', () => {
  const { rounds, root } = setupWithScheduler({ categories: ['工作'], todos: [dueTodo('写周报', 60)] });

  render();
  render();
  assertEqual(rounds.length, 1, '内容没变，重画多少次都只交过那一张（重画很频繁）');

  click(root.querySelector('.checkbox'));      // 做完了 —— 不用再提醒
  assertEqual(rounds.length, 2, '数据变了要重新交');
  assertEqual(rounds[1], [], '做完的那条被撤掉了');
});

test('交给系统：最多交 60 条（iOS 一个应用只能排 64 条等着弹的通知）', () => {
  const many = [];
  for (let i = 0; i < 70; i++) {
    many.push(dueTodo('第 ' + i + ' 条', 60 + i));
  }
  const { rounds } = setupWithScheduler({ categories: ['工作'], todos: many });

  assertEqual(rounds[0].length, 60, '多的不交');
  assert(rounds[0][0].body.includes('第 0 条'), '留下的是最近要响的那些');
});

test('交给系统：换了一份数据（重开应用、导入备份）要重新交一张单子', () => {
  const { rounds } = setupWithScheduler({ categories: ['工作'], todos: [dueTodo('写周报', 60)] });
  assertEqual(rounds.length, 1, '第一份数据交过了');

  // 重开应用会走这一步：界面状态清空，"上次交的是什么"也得跟着忘掉
  resetViewState();
  render();
  assertEqual(rounds.length, 2, '哪怕单子内容一样，换了一份数据也要重新交 —— 系统那边的通知早被撤了');
});


// ========== 导出 / 导入 ==========

function fullSetup() {
  return setup({
    categories: ['工作', '生活'],
    todos: [{ text: '写周报', status: 'active', category: '工作' }],
    listTags: [{ id: 'ltag-a', name: '公司' }],
    categoryMeta: { '工作': { tagId: 'ltag-a', archived: false } },
    logTags: [{ id: 'tag-a', name: '健身' }],
    logItems: [logItem('跑步', [FIXED_NOW], { tagIds: ['tag-a'] })]
  });
}

test('导出：带上全部数据，格式认得出是本应用导出的', async () => {
  fullSetup();

  const text = await exportData();
  const file = JSON.parse(text);

  assertEqual([file.app, file.version], ['todolist', 1], '认得出来源和版本 —— 导入时靠它挡住别的文件');
  assertEqual(file.exportedAt, FIXED_NOW, '记下什么时候导的，文件多了好分辨');
  assertEqual(Object.keys(file.data).sort(), ['categories', 'categoryMeta', 'expandedCategory', 'listTags', 'logItems', 'logTags', 'todos'], '七样数据一样不少');
  assertEqual(file.data.logItems[0].name, '跑步', '打卡项目连记录一起带走');
});

test('导出：应用真正存过的键，每个都在导出名单里（加了新数据忘了带走会被这条挡下）', () => {
  const { root, storage } = fullSetup();

  // 走一遍会写存储的操作，让键都出现
  addTodo('工作', '买菜');
  click(root.querySelector('.category-header'));

  const missing = storage.keys().filter((key) => !EXPORTED_KEYS.includes(key));
  assertEqual(missing, [], '有键没进导出名单，导出的备份就是残的');
  assert(EXPORTED_KEYS.length >= 7, '先确认名单本身不是空的');
});

test('导出 / 导入：附件（图片这些）也带走，导进来还能打开', async () => {
  const { blobs } = fullSetup();
  await addAttachments(0, [fakeFile('图.png', 'image/png', 'PNG内容')]);

  const text = await exportData();
  assertEqual(JSON.parse(text).files.length, 1, '附件的内容也写进文件里了');

  blobs.files.clear();          // 假装换了一台手机：数据没了
  await importData(text);

  const attachmentId = todos[0].attachments[0].id;
  const restored = await blobs.load(attachmentId);
  assert(restored, '附件的内容回来了');
  assertEqual(await restored.text(), 'PNG内容', '内容一模一样');
});

test('导入：整份替换，旧的清单任务打卡都换成文件里的', async () => {
  fullSetup();
  const text = await exportData();

  const { root, storage } = setup({ categories: ['别的清单'], todos: [{ text: '旧任务', status: 'active', category: '别的清单' }] });
  await importData(text);

  assertEqual(categories, ['工作', '生活'], '清单换成文件里的');
  assertEqual(todos.map((t) => t.text), ['写周报'], '任务也换了，旧的不留');
  assertEqual(logItems.map((i) => i.name), ['跑步'], '打卡项目也进来了');
  assertEqual(visibleCategoryNames(root), ['工作', '生活'], '界面跟着变了，不用重开应用');
  assertEqual(JSON.parse(storage.getItem('todos')).map((t) => t.text), ['写周报'], '存起来了，下次打开还是这份');
});

test('导入：文件里没有的数据要清掉，不能留着旧的冒充', async () => {
  fullSetup();
  const text = await exportData();
  const file = JSON.parse(text);
  delete file.data.logItems;                     // 一份"没有打卡项目"的备份

  setup({ categories: ['工作'], logItems: [logItem('喝水')] });
  await importData(JSON.stringify(file));

  assertEqual(logItems, [], '旧的打卡项目要没了，不然看起来像导入失败');
});

test('导入：不是本应用的文件、坏掉的文件都挡住，原来的数据不动', async () => {
  fullSetup();

  let error = null;
  try {
    importData(JSON.stringify({ app: '别的应用', data: {} }));
  } catch (e) {
    error = e;
  }
  assert(error && error.message.includes('本应用'), '要说清楚是文件不对');

  error = null;
  try {
    importData('这不是 JSON');
  } catch (e) {
    error = e;
  }
  assert(error, '坏文件也要抛错，不能当成空数据导进去');
  assertEqual(todos.map((t) => t.text), ['写周报'], '原来的数据一条没动');
});

test('导入：文件来自更新版本的应用时，说清楚要先更新应用', () => {
  fullSetup();

  let error = null;
  try {
    importData(JSON.stringify({ app: 'todolist', version: 99, data: {} }));
  } catch (e) {
    error = e;
  }
  assert(error && error.message.includes('更新'), '不能硬导，格式可能已经变了');
});

test('菜单：清单页的 ⋯ 里有导出和导入；点导出会存成带日期的文件', async () => {
  const { root } = fullSetup();
  const saved = [];
  useFileSaver((name, text) => saved.push({ name: name, text: text }));   // 装在 setup 之后：setup 会复位

  click(root.querySelector('.tag-row .menu-btn'));      // 打开清单页顶上的 ⋯
  assert(menuItemNamed(root, '导出数据'), '菜单里有"导出数据"');
  assert(menuItemNamed(root, '导入数据'), '菜单里有"导入数据"');
  openMenuKey = null;
  render();

  await startExport();
  assertEqual(saved.length, 1, '存了一个文件出来');
  assertEqual(saved[0].name, '待办清单-20260909.json', '文件名带日期，备份多了分得清');
  assertEqual(JSON.parse(saved[0].text).app, 'todolist', '存的就是导出的内容');
  assert(root.querySelector('.data-notice').textContent.includes('已导出'), '界面上要有回音，不然不知道成没成');
});

test('导入：先问一句会覆盖数据，点取消就什么都不做', async () => {
  fullSetup();
  let asked = null;
  let picked = false;
  useConfirm((message) => { asked = message; return false; });
  useFilePicker(() => { picked = true; return Promise.resolve('{}'); });

  await startImport();

  assert(asked && asked.includes('替换'), '得说清楚会覆盖现在的数据');
  assertEqual(picked, false, '点取消就别再弹选文件的窗口了');
  assertEqual(todos.map((t) => t.text), ['写周报'], '数据没动');
});

test('导入：挑好文件就导进来，挑到一半取消也不出错', async () => {
  fullSetup();
  const text = await exportData();

  const { root } = setup({ categories: ['别的'], todos: [] });
  useFilePicker(() => Promise.resolve(null));     // 用户在选文件的窗口里点了取消
  await startImport();
  assertEqual(categories, ['别的'], '取消就什么都没发生');
  assertEqual(root.querySelector('.data-notice'), null, '也不用给提示');

  useFilePicker(() => Promise.resolve(text));
  await startImport();
  assertEqual(todos.map((t) => t.text), ['写周报'], '真挑了文件就导进来了');
  assertEqual(root.querySelector('.data-notice').textContent, '导入完成', '界面上要有回音');
});

test('导入：文件读出来是坏的，界面上说失败，数据不动', async () => {
  const { root } = fullSetup();
  useFilePicker(() => Promise.resolve('坏文件'));

  await startImport();

  assert(root.querySelector('.data-notice').textContent.includes('导入失败'), '要告诉用户失败了');
  assertEqual(todos.map((t) => t.text), ['写周报'], '数据一条没动');
});


// ========== 和 iOS 外壳的桥接（native.js）==========

// 假的外壳：装一个假信箱，再让 native.js 接上去。
// 顺序和真实情况一样 —— 网页先加载好，外壳的信箱一直在那儿
function fakeShell() {
  const messages = [];
  window.webkit = { messageHandlers: { todolist: { postMessage: (message) => messages.push(message) } } };
  onCleanup(() => {
    delete window.webkit;
    useReminderScheduler(null);
    useFileSaver(null);
    useFilePicker(null);
  });
  connectNativeShell();
  return messages;
}

test('外壳：普通浏览器里打开时什么都不接，照常走网页那一套', () => {
  setup({ categories: ['工作'] });

  assertEqual(connectNativeShell(), false, '没有信箱就不接');
  assertEqual(reminderScheduler, null, '提醒还是自己弹（网页版就该这样）');
});

test('外壳：提醒单子通过信箱交给系统', () => {
  setup({ categories: ['工作'], todos: [dueTodo('写周报', 60)] });
  const messages = fakeShell();

  render();

  assertEqual(messages.length, 1, '交了一张单子');
  assertEqual(messages[0].type, 'reminders', '外壳靠 type 分辨要干什么');
  assertEqual(messages[0].list.length, 1, '单子里是那条要提醒的任务');
  assert(messages[0].list[0].body.includes('写周报'), '内容带过去了');
});

test('外壳：导出走系统的"分享"，不走浏览器下载', async () => {
  fullSetup();
  const messages = fakeShell();

  await startExport();

  const exported = messages.find((message) => message.type === 'export');
  assert(exported, '发给外壳去分享');
  assertEqual(exported.filename, '待办清单-20260909.json', '文件名一起带过去');
  assertEqual(JSON.parse(exported.text).app, 'todolist', '内容就是导出的那份');
});

test('外壳：导入让系统弹文件选择，选好之后数据进来；取消就什么都不做', async () => {
  fullSetup();
  const text = await exportData();

  setup({ categories: ['别的'], todos: [] });
  const messages = fakeShell();

  let pending = startImport();
  assert(messages.some((message) => message.type === 'import'), '让外壳去弹系统的文件选择');
  window.nativeFileChosen(undefined);        // 用户在系统的文件选择里点了取消
  await pending;
  assertEqual(categories, ['别的'], '取消就什么都没发生');

  pending = startImport();
  window.nativeFileChosen(text);             // 这回真选了一个文件
  await pending;
  assertEqual(todos.map((t) => t.text), ['写周报'], '数据导进来了');
  assertEqual(window.nativeFileChosen, null, '接完就把回调摘掉，免得下次被旧的接走');
});
