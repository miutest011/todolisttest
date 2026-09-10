// 一个极简的测试运行器。没有任何依赖，浏览器打开 tools/test.html 就能跑。
//
// 用法：
//   test('这个功能应该……', () => {
//     assertEqual(实际值, 期望值, '哪里不对');
//   });
// 测试函数里抛出错误 = 这条测试失败，否则算通过。

const tests = [];
const cleanups = [];

function test(name, fn) {
  tests.push({ name: name, fn: fn });
}

// 每条测试跑完后要做的清理（比如把临时创建的元素删掉）
function onCleanup(fn) {
  cleanups.push(fn);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || '断言失败：期望条件为真');
  }
}

// 用 JSON 比较，所以数组和对象也能直接比
function assertEqual(actual, expected, message) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(
      (message || '两个值不相等') +
      '\n    实际值：' + actualText +
      '\n    期望值：' + expectedText
    );
  }
}

// 假的存储，用来代替 localStorage。
// 数据只存在内存里，测试跑完就没了，绝对不会碰到你的真实数据。
function createMemoryStorage() {
  let data = {};
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
    clear: () => { data = {}; }
  };
}

function runTests(outputEl, summaryEl) {
  outputEl.innerHTML = '';
  let passed = 0;
  let failed = 0;

  tests.forEach(({ name, fn }) => {
    let error = null;
    try {
      fn();
    } catch (e) {
      error = e;
    }

    // 不管这条测试成功还是失败，都要把它留下的东西清理干净，
    // 否则会影响到后面的测试
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      try {
        cleanup();
      } catch (e) {
        console.error('清理时出错：', e);
      }
    }

    const row = document.createElement('div');
    if (error) {
      failed++;
      row.className = 'result fail';
      row.textContent = '✗ ' + name;
      const detail = document.createElement('pre');
      detail.className = 'error';
      detail.textContent = error.message;
      row.appendChild(detail);
    } else {
      passed++;
      row.className = 'result pass';
      row.textContent = '✓ ' + name;
    }
    outputEl.appendChild(row);
  });

  summaryEl.className = failed > 0 ? 'summary fail' : 'summary pass';
  summaryEl.textContent = failed > 0
    ? `${failed} 条失败，${passed} 条通过（共 ${tests.length} 条）`
    : `全部通过：${passed} 条（共 ${tests.length} 条）`;
}
