// Service Worker：把网页文件缓存到手机里，装成 App 之后离线也能打开。
//
// 重要：改完代码要把下面的版本号 +1，否则手机上还会用旧的缓存。
const VERSION = 'v1';
const CACHE_NAME = `todolist-${VERSION}`;

// 需要缓存的文件。只有这几个，附件和待办数据存在浏览器自己的数据库里，不归这里管
const FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

// 安装：把上面这些文件下载下来存起来
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting())   // 新版本装好就直接生效，不用等所有标签页关掉
  );
});

// 激活：把旧版本的缓存清掉，免得越积越多
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith('todolist-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 只接管上面列出的那几个文件。
  // 测试页（tools/ 里的东西）一律走网络，否则开发时会一直读到旧缓存，很容易被坑
  const isCached = FILES.some((file) => {
    const path = new URL(file, self.registration.scope).pathname;
    return path === url.pathname;
  });

  if (!isCached || event.request.method !== 'GET') {
    return;   // 不处理，交给浏览器正常走网络
  }

  // 先给缓存里的（离线也能开、打开也快），同时在后台悄悄更新一份供下次使用
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fromNetwork = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);   // 没网就用缓存

      return cached || fromNetwork;
    })
  );
});
