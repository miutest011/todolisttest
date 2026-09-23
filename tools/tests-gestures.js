// 手指滑动的手势：详情页往右滑返回；清单页、打卡页的列表区左右滑切换顶部标签。
// 两个手势共用 app.js 里的 trackSwipe，测的是"手指怎么动 → 界面该怎么变 / 不该怎么变"。
// 真正的手感（跟不跟手、会不会和页面滚动打架）只有真 iPhone 上才试得出来，这里管的是规则。
// 复用 tests.js、tests-logs.js、tests-list-tags.js 里的工具，所以排在它们后面加载。

// ---- 模拟手指 ----
// 从 (x, y) 按下，分几步挪到 (x + dx, y + dy)，再松手。
// 分几步走是因为真手指就是这样：方向是在"走过 8px"的那一步定下来的，一步跳到终点测不出这个
function fingerSwipe(element, dx, dy, { pointerType = 'touch', end = 'pointerup', x = 100, y = 100 } = {}) {
  fingerPress(element, x, y, pointerType);
  fingerMoveTo(x + dx, y + dy, pointerType);
  document.dispatchEvent(new PointerEvent(end, { bubbles: true, pointerType: pointerType }));
}

function fingerPress(element, x = 100, y = 100, pointerType = 'touch') {
  element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: pointerType, clientX: x, clientY: y }));
  lastFinger = { x: x, y: y, pointerType: pointerType };
}

let lastFinger = { x: 100, y: 100, pointerType: 'touch' };

function fingerMoveTo(toX, toY, pointerType = lastFinger.pointerType) {
  const steps = 4;
  for (let i = 1; i <= steps; i++) {
    document.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerType: pointerType,
      clientX: lastFinger.x + (toX - lastFinger.x) * i / steps,
      clientY: lastFinger.y + (toY - lastFinger.y) * i / steps
    }));
  }
  lastFinger = { x: toX, y: toY, pointerType: pointerType };
}

function fingerUp() {
  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: lastFinger.pointerType }));
}

// 手指移动时发的 touchmove 有没有被拦下（拦下 = 页面不滚）
function touchMoveBlocked() {
  const event = new Event('touchmove', { bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event.defaultPrevented;
}

function openTaskDetailPage() {
  const { root } = setup({ categories: ['工作'], expandedCategory: '工作' });
  addTodo('工作', '写周报');
  click(root.querySelector('.todo-item'));
  return root;
}


// ========== 详情页往右滑返回 ==========

test('右滑返回：任务详情页手指往右滑够远松手，回到清单页', () => {
  const root = openTaskDetailPage();
  assertEqual(detailIndex, 0, '先确认进了详情页');
  editingDueFor = 0;   // 顺便确认和返回键一样，把"正在设截止时间"也收掉
  render();

  fingerSwipe(root.querySelector('.detail-title'), SWIPE_DISTANCE + 10, 0);

  assertEqual(detailIndex, null, '回到列表了');
  assertEqual(editingDueFor, null, '和返回键一样收掉截止时间编辑，不然下次进详情页它还开着');
  assert(root.querySelector('.tab-bar'), '底部标签栏回来了');
});

test('右滑返回：打卡详情页也可以，回到打卡列表', () => {
  const { root } = setup({ logItems: [logItem('喝水')] });
  openLogsTab(root);
  openLogDetailByTap(root, '喝水');
  editingLogItemId = 'log-喝水';
  render();
  // 改名输入框一出来光标就在里面，而打字时是不许滑动返回的。收起键盘，只留着那个"正在改名"的状态
  root.querySelector('.edit-input').blur();

  fingerSwipe(root.querySelector('.detail-page'), SWIPE_DISTANCE + 10, 0);

  assertEqual(logDetailId, null, '回到打卡列表');
  assertEqual(editingLogItemId, null, '和返回键一样收掉正在改的名字');
  assertEqual(currentTab, 'logs', '回的是打卡页，不是清单页');
});

test('右滑返回：按在详情页下面的空白处（不在详情页元素里）往右滑，也能回去', () => {
  openTaskDetailPage();
  // 详情页内容短时，下面那片空白按到的是整个网页，不是详情页那个元素
  fingerSwipe(document.body, SWIPE_DISTANCE + 10, 0);
  assertEqual(detailIndex, null, '回到列表了');
});

test('右滑返回：详情页往下翻过了照样能返回（返回是左右的事，和翻到哪儿无关）', () => {
  const root = openTaskDetailPage();
  const spacer = document.createElement('div');
  spacer.style.height = '3000px';
  document.body.appendChild(spacer);
  onCleanup(() => { spacer.remove(); window.scrollTo(0, 0); });
  window.scrollTo(0, 200);
  assert(window.scrollY > 0, '先确认网页真的往下翻了');

  fingerSwipe(root.querySelector('.detail-title'), SWIPE_DISTANCE + 10, 0);
  assertEqual(detailIndex, null, '回到列表了');
});

test('右滑返回：滑的时候整页跟着手指往右走；滑得不够远、也不快，松手弹回原位、不返回', async () => {
  const root = openTaskDetailPage();

  fingerPress(root.querySelector('.detail-title'));
  fingerMoveTo(150, 100);
  assertEqual(root.querySelector('.detail-page').style.transform, 'translateX(50px)', '跟着手指走了 50px');
  assert(touchMoveBlocked(), '滑的时候要拦住页面滚动，不然会斜着飘');

  await sleep(FLING_TIME + 80);
  fingerUp();

  assertEqual(detailIndex, 0, '滑得不够远，还在详情页');
  assertEqual(root.querySelector('.detail-page').style.transform, '', '弹回原位');
});

test('右滑返回：详情页会伸到屏幕外面，所以整个网页横向是夹住的', async () => {
  await useAppStyles();
  const root = openTaskDetailPage();

  const page = root.querySelector('.detail-page');
  const restingRight = page.getBoundingClientRect().right;
  fingerPress(root.querySelector('.detail-title'));
  fingerMoveTo(220, 100);
  const movedRight = page.getBoundingClientRect().right - restingRight;
  fingerUp();

  // 不拿屏幕宽度比：测试页窗口多宽都可能，手机上这 120px 早就出界了
  assertEqual(Math.round(movedRight), 120, '先确认详情页真的被往右推了出去');
  // 夹在 html 上（body 上不管用），而且用 clip 不用 hidden，免得 iPhone 上连累上下滚动
  assertEqual(getComputedStyle(document.documentElement).overflowX, 'clip',
    '没夹住的话，滑的时候整个网页能跟着横着拖，页面会左右晃、右边露出一条白');
});

test('右滑返回：很快地往右一甩，没滑那么远也算', () => {
  const root = openTaskDetailPage();
  fingerSwipe(root.querySelector('.detail-title'), FLING_DISTANCE + 6, 0);
  assertEqual(detailIndex, null, '甩一下就回去了');
});

test('右滑返回：甩得太短（手指抖一下）不算', () => {
  const root = openTaskDetailPage();
  fingerSwipe(root.querySelector('.detail-title'), FLING_DISTANCE - 6, 0);
  assertEqual(detailIndex, 0, '还在详情页');
});

test('右滑返回：往左滑、上下滑都不管，页面照常滚，也不跟着手指挪', () => {
  const root = openTaskDetailPage();
  const title = root.querySelector('.detail-title');

  fingerPress(title);
  fingerMoveTo(100 - SWIPE_DISTANCE - 10, 100);
  assertEqual(touchMoveBlocked(), false, '往左滑不是返回，不能拦');
  assertEqual(root.querySelector('.detail-page').style.transform, '', '页面没被挪动');
  fingerUp();
  assertEqual(detailIndex, 0, '往左滑不返回，方向反了就不是"退回上一页"的意思');

  // 竖着为主、稍微带点往右
  fingerSwipe(title, 30, SWIPE_DISTANCE + 10);
  assertEqual(detailIndex, 0, '上下滑是翻页，不返回');
});

test('右滑返回：先往左滑定了方向，同一下再往右滑回来，也不算', () => {
  const root = openTaskDetailPage();
  fingerPress(root.querySelector('.detail-title'));
  fingerMoveTo(80, 100);                          // 先往左，这一下定成"不管"
  fingerMoveTo(100 + SWIPE_DISTANCE + 10, 100);   // 再往右滑很远
  fingerUp();
  assertEqual(detailIndex, 0, '方向一旦定了就不改，不然页面会一会儿滚一会儿不滚');
});

test('右滑返回：按在备注框里、或者正在打字时，往右滑不返回', () => {
  const root = openTaskDetailPage();
  const note = root.querySelector('.note-input');

  fingerSwipe(note, SWIPE_DISTANCE + 10, 0);
  assertEqual(detailIndex, 0, '在备注框里滑可能是在选文字');

  note.focus();
  fingerSwipe(root.querySelector('.detail-title'), SWIPE_DISTANCE + 10, 0);
  assertEqual(detailIndex, 0, '键盘开着时不返回，不然写了一半的东西一滑就没了');
  note.blur();
});

test('右滑返回：菜单开着时不返回；鼠标拖也不返回（电脑上有返回键）', () => {
  const root = openTaskDetailPage();

  click(root.querySelector('.page-header .menu-btn'));
  assert(root.querySelector('.menu'), '先确认菜单开了');
  fingerSwipe(root.querySelector('.detail-title'), SWIPE_DISTANCE + 10, 0);
  assertEqual(detailIndex, 0, '菜单开着，手指一碰应该是关菜单');

  openMenuKey = null;
  render();
  fingerSwipe(root.querySelector('.detail-title'), SWIPE_DISTANCE + 10, 0, { pointerType: 'mouse' });
  assertEqual(detailIndex, 0, '鼠标不算');
});

test('右滑返回：滑到一半被系统打断（pointercancel），弹回去、不返回', () => {
  const root = openTaskDetailPage();
  fingerSwipe(root.querySelector('.detail-title'), SWIPE_DISTANCE + 10, 0, { end: 'pointercancel' });
  assertEqual(detailIndex, 0, '被打断不算数');
  assertEqual(root.querySelector('.detail-page').style.transform, '', '弹回原位');
});

test('右滑返回：在列表页上往右滑不会跑进详情页，走的是切换标签那一套', () => {
  const { root } = setup({ categories: ['工作'], expandedCategory: '工作' });
  addTodo('工作', '写周报');

  fingerSwipe(root.querySelector('.todo-item'), SWIPE_DISTANCE + 10, 0);
  assertEqual([detailIndex, currentTab, listTagFilter], [null, 'tasks', 'all'], '还在清单页的"所有"下');
});


// ========== 列表区左右滑切换标签 ==========

function scrollerOf(root) {
  return root.querySelector('.page-scroll');
}

test('左右滑：清单页往左滑换到右边那个标签，一路是 所有 → 用户的标签 → 已归档', () => {
  const { root } = listTagSetup();

  const seen = [listTagFilter];
  for (let i = 0; i < 3; i++) {
    fingerSwipe(scrollerOf(root), -(SWIPE_DISTANCE + 10), 0);
    seen.push(listTagFilter);
  }
  assertEqual(seen, ['all', 'ltag-公司', 'ltag-家里', 'archived'], '往左滑一路翻到最右');
  assertEqual(textsOf(root, '.tag-chip.active'), ['已归档'], '顶部选中的标签跟着变了');
  assertEqual(visibleCategoryNames(root), ['旧项目'], '列表也换成了已归档的');

  fingerSwipe(scrollerOf(root), SWIPE_DISTANCE + 10, 0);
  assertEqual(listTagFilter, 'ltag-家里', '往右滑翻回左边那个');
});

test('左右滑：到头了停住——"所有"再往右滑、"已归档"再往左滑，都不动，也不绕回另一头', () => {
  const { root } = listTagSetup();

  fingerSwipe(scrollerOf(root), SWIPE_DISTANCE + 10, 0);
  assertEqual(listTagFilter, 'all', '"所有"左边没有了');

  click(tagChip(root, '已归档'));
  fingerSwipe(scrollerOf(root), -(SWIPE_DISTANCE + 10), 0);
  assertEqual(listTagFilter, 'archived', '"已归档"右边没有了');
});

test('左右滑：列表跟着手指挪；那边没有标签时只挪一点点（橡皮筋）；松手没滑够就弹回', async () => {
  const { root } = listTagSetup();

  fingerPress(scrollerOf(root));
  fingerMoveTo(60, 100);                    // 往左 40px，右边还有标签
  const toNext = scrollerOf(root).style.transform;
  fingerMoveTo(140, 100);                   // 同一下又往右 40px，"所有"左边没有了
  const atEnd = scrollerOf(root).style.transform;
  assert(touchMoveBlocked(), '横着滑的时候要拦住上下滚动，不然列表会斜着飘');
  await sleep(FLING_TIME + 80);
  fingerUp();

  assertEqual(toNext, 'translateX(-20px)', '有下一个：挪一半');
  assertEqual(atEnd, 'translateX(6px)', '到头了：只挪 0.15，告诉你那边没有了');
  assertEqual(listTagFilter, 'all', '慢慢滑 40px 不够远，不切换');
  assertEqual(scrollerOf(root).style.transform, '', '弹回原位');
});

test('左右滑：快速一甩就切换；甩得太短不算', () => {
  const { root } = listTagSetup();

  fingerSwipe(scrollerOf(root), -(FLING_DISTANCE - 6), 0);
  assertEqual(listTagFilter, 'all', '手指抖一下不算');

  fingerSwipe(scrollerOf(root), -(FLING_DISTANCE + 6), 0);
  assertEqual(listTagFilter, 'ltag-公司', '甩一下就换了');
});

test('左右滑：上下滑是滚列表，不切换，也不拦滚动', () => {
  const { root } = listTagSetup();

  fingerPress(scrollerOf(root));
  fingerMoveTo(70, 100 + SWIPE_DISTANCE + 10);   // 以竖着为主，带一点往左
  assertEqual(touchMoveBlocked(), false, '竖着滑不能拦，列表要能滚');
  assertEqual(scrollerOf(root).style.transform, '', '列表没被横着挪');
  fingerUp();
  assertEqual(listTagFilter, 'all', '不切换');
});

test('左右滑：按在任务上开始滑也行，而且不会变成长按拖动', async () => {
  const { root } = listTagSetup({ todos: [{ text: '写周报', status: 'active', category: '工作' }], expandedCategory: '工作' });

  fingerSwipe(root.querySelector('.todo-item'), -(SWIPE_DISTANCE + 10), 0);
  await sleep(30);   // 长按判定在测试里是 0 毫秒，等一下看它有没有被触发

  assertEqual(listTagFilter, 'ltag-公司', '切换了');
  assertEqual(document.querySelector('.drag-ghost'), null, '滑动不是长按，任务没浮起来');
  assertEqual(detailIndex, null, '也没进详情页');
});

test('左右滑：已经长按浮起来在拖任务时，左右挪动不切换标签', async () => {
  const { root } = listTagSetup({
    todos: [{ text: '写周报', status: 'active', category: '工作' }, { text: '开会', status: 'active', category: '工作' }],
    expandedCategory: '工作'
  });

  fingerPress(root.querySelector('.todo-item'));
  await sleep(30);   // 长按生效，任务浮起来了
  assert(document.querySelector('.drag-ghost'), '先确认浮起来了');
  fingerMoveTo(100 - SWIPE_DISTANCE - 10, 100);
  fingerUp();

  assertEqual(listTagFilter, 'all', '拖动时的左右晃动不算切换');
});

test('左右滑：打卡页也可以，顺序是 所有 → 用户的标签 → 已归档', () => {
  const { root } = taggedSetup();
  openLogsTab(root);

  const seen = [logTagFilter];
  for (let i = 0; i < 4; i++) {
    fingerSwipe(scrollerOf(root), -(SWIPE_DISTANCE + 10), 0);
    seen.push(logTagFilter);
  }
  assertEqual(seen, ['all', 'tag-健身', 'tag-学习', 'archived', 'archived'], '翻到已归档停住');
  assertEqual(visibleLogNames(root), ['旧习惯'], '列表换成已归档的');
  assertEqual(listTagFilter, 'all', '清单页的标签没被牵连');
});

test('左右滑：换了标签后，长按标签出来的"改名 / 删除"收起', async () => {
  const { root } = taggedSetup();
  openLogsTab(root);
  touchDown(tagChip(root, '健身'));
  await sleep(20);
  fingerUp();
  assert(root.querySelector('.tag-manager'), '先确认操作条出来了');

  fingerSwipe(scrollerOf(root), -(SWIPE_DISTANCE + 10), 0);
  assertEqual([managingTagId, root.querySelector('.tag-manager')], [null, null], '换标签就收起，和点标签一样');
});

test('左右滑：正在打字、按在输入框里、菜单开着、用鼠标，都不切换', () => {
  const { root } = listTagSetup({ expandedCategory: '工作' });

  // 列表里改清单名的输入框
  editingCategory = '工作';
  render();
  const input = root.querySelector('.edit-input');
  assert(input, '先确认输入框出来了');
  input.blur();          // 两条规则分开测：先看"按在输入框里"，这时光标不在里面
  fingerSwipe(input, -(SWIPE_DISTANCE + 10), 0);
  assertEqual(listTagFilter, 'all', '按在输入框里滑可能是在挪光标');
  input.focus();         // 再看"正在打字"，这回按在列表空白处
  fingerSwipe(scrollerOf(root), -(SWIPE_DISTANCE + 10), 0);
  assertEqual(listTagFilter, 'all', '光标还在输入框里（键盘开着）不切换');
  editingCategory = null;
  input.blur();
  render();

  openCategoryMenu(root, '工作');
  fingerSwipe(scrollerOf(root), -(SWIPE_DISTANCE + 10), 0);
  assertEqual(listTagFilter, 'all', '菜单开着不切换');
  openMenuKey = null;
  render();

  fingerSwipe(scrollerOf(root), -(SWIPE_DISTANCE + 10), 0, { pointerType: 'mouse' });
  assertEqual(listTagFilter, 'all', '鼠标不算');
});

test('左右滑：日历页没有标签，滑了什么都不发生', () => {
  const { root } = listTagSetup();
  click(tabButton(root, '日历'));

  fingerSwipe(scrollerOf(root), -(SWIPE_DISTANCE + 10), 0);
  assertEqual([currentTab, listTagFilter, logTagFilter], ['calendar', 'all', 'all'], '还在日历页，两边的筛选都没动');
});

test('左右滑：标签多到一行放不下时，换到的标签会挪进看得见的地方', async () => {
  await useAppStyles();
  const names = ['第一个标签', '第二个标签', '第三个标签', '第四个标签', '第五个标签', '第六个标签', '第七个标签', '第八个标签'];
  const { root } = setup({ categories: ['工作'], listTags: names.map(listTag) });

  const bar = root.querySelector('.tag-bar');
  assert(bar.scrollWidth > bar.clientWidth + 100, '先确认标签真的一行放不下');

  for (let i = 0; i < names.length + 1; i++) {
    fingerSwipe(scrollerOf(root), -(SWIPE_DISTANCE + 10), 0);
  }
  assertEqual(listTagFilter, 'archived', '翻到了最右边');

  const barRect = root.querySelector('.tag-bar').getBoundingClientRect();
  const chipRect = root.querySelector('.tag-chip.active').getBoundingClientRect();
  assert(chipRect.left >= barRect.left - 1 && chipRect.right <= barRect.right + 1,
    `选中的"已归档"要在标签行里看得见（标签 ${Math.round(chipRect.left)}~${Math.round(chipRect.right)}，标签行 ${Math.round(barRect.left)}~${Math.round(barRect.right)}）`);
});
