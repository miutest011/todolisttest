// 装成 iOS 应用之后才起作用的一层。用浏览器打开时，这个文件什么都不做。
//
// 外壳（ios/ 目录里的 Swift 代码）把网页装进一个应用里，并且留了一个信箱：
// window.webkit.messageHandlers.todolist。网页往里投消息，外壳去干网页干不了的事：
//
//   { type: 'reminders', list } —— 把提醒单子交给 iOS 排队，app 关着也会响
//   { type: 'export', filename, text } —— 用系统的"分享"把导出的文件存走
//   { type: 'import' } —— 弹出系统的文件选择，选好之后外壳会调 window.nativeFileChosen(内容)
//
// 为什么写在网页这边而不是塞在 Swift 里：这样它跟着网页代码一起改、一起跑测试，
// 不会出现"改了网页忘了改外壳"的情况。Swift 那边只管做事，不管什么时候做

function nativeBridge() {
  return window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.todolist;
}

function connectNativeShell() {
  const bridge = nativeBridge();
  if (!bridge) return false;        // 在普通浏览器里打开，照常走网页那一套

  // 到点的提醒交给系统。每次单子有变化就整张换一遍（见 app.js 的 syncReminders）
  useReminderScheduler({
    replaceAll: (list) => bridge.postMessage({ type: 'reminders', list: list })
  });

  // 导出：交给系统的"分享"，可以存进"文件"、发给自己、传到网盘
  useFileSaver((filename, text) => bridge.postMessage({ type: 'export', filename: filename, text: text }));

  // 导入：让系统弹出文件选择。它是异步的 —— 用户选完（或者取消）之后，
  // 外壳会调用下面这个 window.nativeFileChosen，这里才把结果交回去
  useFilePicker(() => new Promise((resolve) => {
    window.nativeFileChosen = (text) => {
      window.nativeFileChosen = null;    // 一次性的，用完就摘掉，免得下次被旧的接走
      resolve(text === undefined ? null : text);
    };
    bridge.postMessage({ type: 'import' });
  }));

  return true;
}

connectNativeShell();
