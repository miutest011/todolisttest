// 待办清单的全部逻辑。
// 页面（index.html）和测试（tools/test.html）都加载这个文件。

// ---- 可替换的外部依赖 ----
// 正常运行时用浏览器真实的 localStorage 和 confirm；
// 跑测试时会换成假的，这样测试不会动到你的真实数据、也不会真的弹窗。
let storage = window.localStorage;
let confirmFn = (message) => window.confirm(message);
let appEl = null;

function useStorage(newStorage) {
  storage = newStorage;
}

function useConfirm(newConfirm) {
  confirmFn = newConfirm;
}

// 第一次打开时默认有这两个清单，之后用户可以自己加
const DEFAULT_CATEGORIES = ['工作', '生活'];

// ---- 所有会变化的状态都放在这里，界面完全由它们决定 ----
let categories = [];        // 清单名字的数组
let todos = [];             // 每一项是 { text, done, category }
let collapsed = [];         // 当前被折叠起来的清单名字
let addingTaskIn = null;    // 正在哪个清单里输入新任务
let addingCategory = false; // 是否正在输入新清单的名字
let editingTaskIndex = null;// 正在重命名的任务（它在 todos 里的位置）
let editingCategory = null; // 正在重命名的清单名字
let openMenuKey = null;     // 哪个三点菜单是展开的，例如 'task-2'、'category-工作'
let detailIndex = null;     // 正在看哪条任务的详情页（null = 看列表页）

// 把"临时"的界面状态清空（数据状态不动）
function resetViewState() {
  addingTaskIn = null;
  addingCategory = false;
  editingTaskIndex = null;
  editingCategory = null;
  openMenuKey = null;
  detailIndex = null;
}

// 启动：把应用挂到某个页面元素上，读出数据，画出来
function initApp(element) {
  appEl = element;
  resetViewState();
  categories = loadCategories();
  todos = loadTodos();
  collapsed = loadCollapsed();
  render();
}

// ---- 读写存储 ----
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
  });

  return parsed;
}

function saveTodos() {
  storage.setItem('todos', JSON.stringify(todos));
}

function loadCollapsed() {
  const saved = storage.getItem('collapsed');
  return saved ? JSON.parse(saved) : [];
}

function saveCollapsed() {
  storage.setItem('collapsed', JSON.stringify(collapsed));
}

// ---- 画界面 ----
// 任何操作都只做两件事：改上面的状态变量 → 调用 render()
function render() {
  if (!appEl) return;
  appEl.innerHTML = '';

  if (detailIndex !== null) {
    appEl.appendChild(createDetailPage(detailIndex));
  } else {
    categories.forEach((category) => {
      appEl.appendChild(createCategorySection(category));
    });
    appEl.appendChild(createNewCategoryRow());
  }

  // 页面重画会让输入框消失，画完之后要把光标重新放回去
  const focusEl = appEl.querySelector('.add-input, .edit-input');
  if (focusEl) {
    focusEl.focus();
    if (focusEl.classList.contains('edit-input')) {
      focusEl.select();
    }
  }
}

// 一个清单区块：标题栏 + 任务列表 + "添加任务"那一行
function createCategorySection(category) {
  const section = document.createElement('section');
  section.className = 'category';
  section.appendChild(createCategoryHeader(category));

  // 折叠状态下就不画下面的内容了
  if (!collapsed.includes(category)) {
    const list = document.createElement('ul');
    todos.forEach((todo, index) => {
      if (todo.category === category) {
        list.appendChild(createTodoItem(todo, index));
      }
    });
    section.appendChild(list);
    section.appendChild(createAddTaskRow(category));
  }

  return section;
}

// 清单标题栏：点名字改名，点其它地方折叠/展开，右边是三点菜单
function createCategoryHeader(category) {
  const header = document.createElement('div');
  header.className = 'category-header';
  header.addEventListener('click', () => {
    if (closeMenuIfOpen()) return;
    toggleCollapse(category);
  });

  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.textContent = collapsed.includes(category) ? '▸' : '▾';
  header.appendChild(arrow);

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
  name.addEventListener('click', (event) => {
    event.stopPropagation();       // 不要触发标题栏的折叠
    editingCategory = category;
    render();
  });

  const remaining = todos.filter((todo) => todo.category === category && !todo.done).length;
  const count = document.createElement('span');
  count.className = 'category-count';
  count.textContent = remaining > 0 ? remaining : '';

  header.append(name, count, createCategoryMenu(category));
  return header;
}

// 一条任务：勾选框 + 文字 + 三点菜单，点空白处进详情页
function createTodoItem(todo, index) {
  const li = document.createElement('li');
  li.className = 'todo-item';
  if (todo.done) {
    li.classList.add('done');
  }
  li.addEventListener('click', () => {
    if (closeMenuIfOpen()) return;
    detailIndex = index;
    render();
  });

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
  textSpan.addEventListener('click', (event) => {
    event.stopPropagation();       // 不要进详情页
    editingTaskIndex = index;
    render();
  });

  li.append(checkbox, textSpan, createTodoMenu(index));
  return li;
}

function createCheckbox(todo, index) {
  const checkbox = document.createElement('span');
  checkbox.className = 'checkbox';
  if (todo.done) {
    checkbox.classList.add('checked');
  }
  checkbox.addEventListener('click', (event) => {
    event.stopPropagation();       // 不要进详情页
    toggleTodo(index);
  });
  return checkbox;
}

// 没在输入时是一行灰色的"+ 添加任务"，点了之后变成输入框
function createAddTaskRow(category) {
  if (addingTaskIn !== category) {
    const row = document.createElement('div');
    row.className = 'add-task';
    row.textContent = '+ 添加任务';
    row.addEventListener('click', () => {
      if (closeMenuIfOpen()) return;
      addingTaskIn = category;
      render();
    });
    return row;
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'add-input';
  input.placeholder = '输入任务，回车添加';

  // render() 会把输入框删掉重画，删除时浏览器也会触发一次 blur，
  // 这个开关用来区分"用户点到别处了"和"是我们自己重画导致的"
  let skipBlur = false;

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      skipBlur = true;
      // 加成功了就保持输入框打开，方便连续添加；空着按回车就结束添加
      if (!addTodo(category, input.value)) {
        addingTaskIn = null;
        render();
      }
    } else if (event.key === 'Escape') {
      skipBlur = true;
      addingTaskIn = null;
      render();
    }
  });

  input.addEventListener('blur', () => {
    if (skipBlur) return;
    addingTaskIn = null;
    render();
  });

  return input;
}

// 底部的"+ 新建清单"，点了之后同样变成输入框
function createNewCategoryRow() {
  if (!addingCategory) {
    const btn = document.createElement('button');
    btn.id = 'new-category-btn';
    btn.textContent = '+ 新建清单';
    btn.addEventListener('click', () => {
      if (closeMenuIfOpen()) return;
      addingCategory = true;
      render();
    });
    return btn;
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'add-input';
  input.placeholder = '清单名称，回车创建';

  let skipBlur = false;

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      skipBlur = true;
      addCategory(input.value);   // 名字为空或重名时内部会忽略
      addingCategory = false;
      render();
    } else if (event.key === 'Escape') {
      skipBlur = true;
      addingCategory = false;
      render();
    }
  });

  input.addEventListener('blur', () => {
    if (skipBlur) return;
    addingCategory = false;
    render();
  });

  return input;
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

// ---- 三点菜单 ----
// key 用来标记"哪个菜单"，items 是菜单里的每一项
function createMenu(key, items) {
  const anchor = document.createElement('div');
  anchor.className = 'menu-anchor';

  const btn = document.createElement('button');
  btn.className = 'menu-btn';
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
  const position = categories.indexOf(category);
  const items = [
    { text: '重命名', action: () => { editingCategory = category; render(); } }
  ];

  if (position > 0) {
    items.push({ text: '上移', action: () => moveCategory(category, -1) });
  }
  if (position < categories.length - 1) {
    items.push({ text: '下移', action: () => moveCategory(category, 1) });
  }

  items.push({ type: 'divider' });
  items.push({ text: '删除清单', danger: true, action: () => deleteCategory(category) });

  return createMenu('category-' + category, items);
}

function createTodoMenu(index) {
  const todo = todos[index];
  const items = [
    { text: '重命名', action: () => { editingTaskIndex = index; render(); } },
    { text: todo.done ? '标记为未完成' : '标记为完成', action: () => toggleTodo(index) }
  ];

  // 其它清单，用来做"移动到"
  const others = categories.filter((name) => name !== todo.category);
  if (others.length > 0) {
    items.push({ type: 'divider' });
    items.push({ type: 'label', text: '移动到' });
    others.forEach((name) => {
      items.push({ text: name, action: () => moveTodo(index, name) });
    });
  }

  items.push({ type: 'divider' });
  items.push({ text: '删除任务', danger: true, action: () => deleteTodo(index) });

  return createMenu('task-' + index, items);
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
// 目前只有标题和所属清单，备注、日期等以后加在这里
function createDetailPage(index) {
  const todo = todos[index];
  const page = document.createElement('div');

  const back = document.createElement('button');
  back.className = 'back-btn';
  back.textContent = '← 返回';
  back.addEventListener('click', () => {
    detailIndex = null;
    render();
  });

  const card = document.createElement('div');
  card.className = todo.done ? 'detail-card done' : 'detail-card';

  const title = document.createElement('span');
  title.className = 'detail-title';
  title.textContent = todo.text;

  card.append(createCheckbox(todo, index), title);

  const meta = document.createElement('div');
  meta.className = 'detail-meta';
  meta.textContent = '清单：' + todo.category;

  const placeholder = document.createElement('div');
  placeholder.className = 'detail-placeholder';
  placeholder.textContent = '备注、截止日期等功能以后加在这里';

  page.append(back, card, meta, placeholder);
  return page;
}

// ---- 各种操作 ----
// 约定：每个操作函数自己负责保存数据和重画界面，
// 能失败的操作（比如名字为空）返回 true/false 表示做没做成
function addTodo(category, text) {
  const trimmed = text.trim();
  if (trimmed === '') return false;

  todos.push({ text: trimmed, done: false, category: category });
  saveTodos();
  render();
  return true;
}

function addCategory(name) {
  const trimmed = name.trim();
  // 名字为空或者已经有同名清单，就什么都不做
  if (trimmed === '' || categories.includes(trimmed)) return false;

  categories.push(trimmed);
  saveCategories();
  render();
  return true;
}

function toggleCollapse(category) {
  if (collapsed.includes(category)) {
    collapsed = collapsed.filter((name) => name !== category);
  } else {
    collapsed.push(category);
  }
  saveCollapsed();
  render();
}

function toggleTodo(index) {
  todos[index].done = !todos[index].done;
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

function moveTodo(index, newCategory) {
  todos[index].category = newCategory;
  saveTodos();
  render();
}

function deleteTodo(index) {
  todos.splice(index, 1);
  saveTodos();
  detailIndex = null;      // 万一是在详情页删的，回到列表页
  render();
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
  collapsed = collapsed.map((name) => (name === oldName ? trimmed : name));

  saveCategories();
  saveTodos();
  saveCollapsed();
  render();
  return true;
}

function moveCategory(category, offset) {
  const from = categories.indexOf(category);
  const to = from + offset;
  if (to < 0 || to >= categories.length) return false;

  // 和相邻的那个清单交换位置
  categories[from] = categories[to];
  categories[to] = category;

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

  categories = categories.filter((name) => name !== category);
  todos = todos.filter((todo) => todo.category !== category);
  collapsed = collapsed.filter((name) => name !== category);
  if (addingTaskIn === category) addingTaskIn = null;
  if (editingCategory === category) editingCategory = null;

  saveCategories();
  saveTodos();
  saveCollapsed();
  render();
  return true;
}
