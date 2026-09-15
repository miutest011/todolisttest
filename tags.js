// 标签：打卡页和清单页共用的一套界面
//
// 顶部标签行（所有 | 用户的标签… | 已归档 | + 新增）、长按后的"改名 / 删除"操作条、
// 输入新标签名的小输入框、可以点选的一排标签，都在这里。
// 两页各自的数据怎么存、删标签时要连带改什么，由各页自己决定，
// 通过一个"标签集"告诉这里的界面：
//
//   {
//     scope: 'logs',                     // 哪一页，用来区分"+ 新增"是在哪里输入
//     tags: () => logTags,               // 这一页的标签数组 [{ id, name }]
//     filter: () => logTagFilter,        // 顶部现在选中了哪个：'all' / 'archived' / 某个标签的 id
//     setFilter: (filter) => { ... },
//     add: (name) => 新标签 或 null,     // 建不成（空名、重名）返回 null
//     rename: (id, name) => true/false,
//     remove: (id) => true/false
//   }
//
// 为什么抽出来：两页的标签行要是各写一份，迟早会改了一边忘了另一边，长得越来越不一样。
// 用到 app.js 里的 render、closeMenuIfOpen、createRenameInput、longPressDelay、MOVE_THRESHOLD、trackSwipe 这些，
// 所以页面里排在 app.js 后面加载。

// "所有"和"已归档"是顶部的两个固定项，用户建的标签不能叫这两个名字，不然分不清
const RESERVED_TAG_NAMES = ['所有', '已归档'];

// ---- 界面状态（两页共用，同一时间只会有一处在输入 / 管理）----
// 由 app.js 的 resetViewState() 调 resetTagViewState() 统一重置
let addingTagIn = null;     // 哪里的"+ 新增"正在输入：'logs-bar' / 'logs-draft' / 'logs-detail' / 'lists-bar'
let managingTagId = null;   // 长按了哪个标签（下面正显示"改名 / 删除"）
let renamingTagId = null;   // 正在改名的标签

function resetTagViewState() {
  addingTagIn = null;
  managingTagId = null;
  renamingTagId = null;
}

// ---- 数据小工具 ----
function makeTagId(prefix) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function isValidTagName(tags, name, exceptId = null) {
  if (name === '' || RESERVED_TAG_NAMES.includes(name)) return false;
  return !tags.some((tag) => tag.id !== exceptId && tag.name === name);
}

// ---- 顶部标签行 ----
// 返回标签行，长按了某个标签的话，下面再跟一条操作条。
// menu 传 { key, items } 的话，标签行最右边多一个 ⋯ 菜单（清单页用它放"新建清单"），它不跟着标签横着滑
function createTagBar(set, menu = null) {
  const box = document.createElement('div');
  box.className = 'tag-header';

  const row = document.createElement('div');
  row.className = 'tag-row';

  const bar = document.createElement('div');
  bar.className = 'tag-bar';

  bar.appendChild(createFilterChip(set, '所有', 'all', null));
  set.tags().forEach((tag) => bar.appendChild(createFilterChip(set, tag.name, tag.id, tag)));
  bar.appendChild(createFilterChip(set, '已归档', 'archived', null));

  if (addingTagIn === set.scope + '-bar') {
    bar.appendChild(createTagInput(set, () => {}));   // 建完就行，顶部不用顺手选上什么
  } else {
    const add = document.createElement('button');
    add.className = 'tag-chip tag-new';
    add.textContent = '+ 新增';
    add.addEventListener('click', () => {
      if (closeMenuIfOpen()) return;
      addingTagIn = set.scope + '-bar';
      render();
    });
    bar.appendChild(add);
  }

  row.appendChild(bar);
  if (menu) row.appendChild(createMenu(menu.key, menu.items));
  box.appendChild(row);

  // 先去标签列表里找：长按的那个标签要是已经被删了，自然找不到，操作条也就不画了。
  // 所以删标签时不用专门回来清 managingTagId
  const managing = set.tags().find((tag) => tag.id === managingTagId);
  if (managing) box.appendChild(createTagManager(set, managing));

  return box;
}

// ---- 列表区左右滑，切换顶部标签 ----
// 顺序和顶部一样：所有 → 用户的标签 → 已归档。
// 手指往左滑 = 换到右边那个，和翻书、iPhone 相册的方向一样。到头了就停住，不绕回另一头：
// 绕回去的话滑着滑着突然从"已归档"跳回"所有"，很容易迷路
function filterOrder(set) {
  return ['all', ...set.tags().map((tag) => tag.id), 'archived'];
}

// dx < 0（往左滑）→ 右边那个；dx > 0 → 左边那个。那边没有了返回 null
function neighborFilter(set, dx) {
  const order = filterOrder(set);
  const index = order.indexOf(set.filter()) + (dx < 0 ? 1 : -1);
  return index >= 0 && index < order.length ? order[index] : null;
}

// scroller：列表那一块（createScrollingPage 的 body）。按在里面任何地方都能滑，任务、打卡项目上也行——
// 横着滑不会误触长按拖动：手指一动超过 MOVE_THRESHOLD，长按就作废了
function enableTagSwipe(scroller, set) {
  trackSwipe(scroller, {
    axis: 'x',
    canStart: canStartSwipe,
    canLock: () => true,
    onMove: (dx) => {
      // 那边还有标签：列表跟着手指挪一半，看得出"要翻过去了"；
      // 已经到头：只挪一点点，像拉橡皮筋，告诉你那边没有了
      const factor = neighborFilter(set, dx) === null ? 0.15 : 0.5;
      scroller.style.transition = 'none';
      scroller.style.transform = `translateX(${dx * factor}px)`;
    },
    onRelease: (dx, committed) => {
      const next = committed ? neighborFilter(set, dx) : null;
      if (next === null) {
        springBack(scroller);
        return;
      }

      set.setFilter(next);
      // 和点标签一样，换了标签就收起长按出来的"改名 / 删除"
      managingTagId = null;
      renamingTagId = null;
      render();
      showSwipedIn(dx);
    }
  });
}

// 换完标签之后：
// 1. 顶部选中的那个标签可能在屏幕外面（标签多、要横着滑才看得到），把它挪到标签行中间
// 2. 新列表从手指滑走的反方向轻轻滑进来，不然内容是"瞬间换掉"的，看不出刚才翻了一页
function showSwipedIn(dx) {
  const chip = appEl.querySelector('.tag-bar .tag-chip.active');
  if (chip) {
    const bar = chip.parentNode;
    const barRect = bar.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    bar.scrollLeft += (chipRect.left + chipRect.width / 2) - (barRect.left + barRect.width / 2);
  }

  const scroller = appEl.querySelector('.page-scroll');
  if (scroller && scroller.animate) {   // 老浏览器没有 animate，没动画也不影响用
    scroller.animate(
      [{ transform: `translateX(${dx < 0 ? 40 : -40}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 200, easing: 'ease-out' }
    );
  }
}

// tag 为 null 表示"所有""已归档"这两个固定项，它们不能长按改名删除
function createFilterChip(set, label, filter, tag) {
  const chip = document.createElement('button');
  chip.className = 'tag-chip';
  chip.textContent = label;
  chip.dataset.filter = filter;
  if (set.filter() === filter) chip.classList.add('active');
  if (tag && managingTagId === tag.id) chip.classList.add('managing');

  chip.addEventListener('click', () => {
    if (closeMenuIfOpen()) return;
    set.setFilter(filter);
    // 点别的标签就收起"改名 / 删除"。
    // 但点的正是长按的那个时不收：手指抬起后浏览器还会补发一次点击，
    // 要是这里收起，刚长按出来的操作条会一闪就没
    if (!tag || managingTagId !== tag.id) {
      managingTagId = null;
      renamingTagId = null;
    }
    render();
  });

  if (tag) {
    onLongPress(chip, () => {
      managingTagId = tag.id;
      renamingTagId = null;
      render();
    });
  }

  return chip;
}

// 长按：手机上按住不放一会儿触发，电脑上用右键。
// 按住时手指挪动了就取消 —— 那是在横着滑标签行，不是长按
function onLongPress(element, callback) {
  let timer = null;
  let startX = 0;
  let startY = 0;

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  element.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    startX = event.clientX;
    startY = event.clientY;
    cancel();
    timer = setTimeout(() => {
      timer = null;
      callback();
    }, longPressDelay);   // 和拖拽共用一个长按时长（在 app.js 里），手感一致
  });

  element.addEventListener('pointermove', (event) => {
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > MOVE_THRESHOLD) cancel();
  });
  element.addEventListener('pointerup', cancel);
  element.addEventListener('pointercancel', cancel);   // 浏览器接管去滚动时会发这个

  // 电脑上的右键。安卓长按也会发这个事件，可能和上面的计时器各触发一次，
  // callback 只是设状态再重画，调两次结果一样，没关系
  element.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    cancel();
    callback();
  });
}

// 长按标签后出现在标签行下面的操作条
function createTagManager(set, tag) {
  const box = document.createElement('div');
  box.className = 'tag-manager';

  if (renamingTagId === tag.id) {
    box.appendChild(createRenameInput(
      tag.name,
      (newName) => {
        renamingTagId = null;
        if (!set.rename(tag.id, newName)) render();
      },
      () => {
        renamingTagId = null;
        render();
      }
    ));
    return box;
  }

  const label = document.createElement('span');
  label.className = 'tag-manager-label';
  label.textContent = `标签「${tag.name}」`;

  const rename = document.createElement('button');
  rename.className = 'tag-rename';
  rename.textContent = '改名';
  rename.addEventListener('click', () => {
    renamingTagId = tag.id;
    render();
  });

  const remove = document.createElement('button');
  remove.className = 'tag-delete';
  remove.textContent = '删除';
  remove.addEventListener('click', () => set.remove(tag.id));

  const done = document.createElement('button');
  done.className = 'tag-done';
  done.textContent = '完成';
  done.addEventListener('click', () => {
    managingTagId = null;
    render();
  });

  box.append(label, rename, remove, done);
  return box;
}

// 输入新标签名字的小输入框。
// 回车创建；Esc 或点到别处就算了。
// onCreated 拿到新建的标签，调用方决定要不要顺手选上它
function createTagInput(set, onCreated) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tag-input';
  input.placeholder = '标签名';
  // 页面上可能同时有别的输入框（比如新增打卡时的名字），告诉 render() 光标该放这个
  input.dataset.autofocus = 'true';

  // 回车之后页面重画、输入框被删掉，浏览器还会补一次 blur，只处理第一次
  let finished = false;

  function finish(name) {
    if (finished) return;
    finished = true;
    addingTagIn = null;
    const tag = name === null ? null : set.add(name);
    if (tag) {
      onCreated(tag);
    } else {
      render();    // 空名、重名建不成，也要把输入框收起来
    }
  }

  input.addEventListener('click', (event) => event.stopPropagation());
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      finish(input.value);
    } else if (event.key === 'Escape') {
      finish(null);
    }
  });
  input.addEventListener('blur', () => finish(null));

  return input;
}

// 一排可以点选的标签：点一下选上，再点取消。
// where 是这一处的名字（比如 'logs-draft'），用来判断"+ 新增标签"是不是正在这里输入
function createTagPicker(set, selectedIds, onToggle, where, onCreated) {
  const box = document.createElement('div');
  box.className = 'tag-picker';

  set.tags().forEach((tag) => {
    const option = document.createElement('button');
    option.className = 'tag-option';
    option.textContent = tag.name;
    option.dataset.tagId = tag.id;
    if (selectedIds.includes(tag.id)) option.classList.add('selected');
    option.addEventListener('click', () => onToggle(tag.id));
    box.appendChild(option);
  });

  if (addingTagIn === where) {
    box.appendChild(createTagInput(set, onCreated));
  } else {
    const add = document.createElement('button');
    add.className = 'tag-option tag-new';
    add.textContent = '+ 新增标签';
    add.addEventListener('click', () => {
      addingTagIn = where;
      render();
    });
    box.appendChild(add);
  }

  return box;
}
