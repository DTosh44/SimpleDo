/* Cache only the app shell, never auth requests, tokens, backups or cloud data. */
const CACHE = 'simpledo-shell-v15';
const FILES = ['./', './index.html', './styles.css?v=15', './data.js?v=13', './config.js?v=9',
  './vendor/supabase.js', './capacity.js?v=13', './tags.js?v=14', './tag-ui.js?v=13', './calendar.js?v=13', './planning.js?v=13', './cloud.js?v=13', './app.js?v=15', './favicon.svg', './snapshot.js?v=14', './capture.js?v=15', './capture-ui.js?v=15'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('simpledo-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const shell = new URL('./index.html', self.location).href;
  const known = FILES.map(file => new URL(file, self.location).href);
  if (event.request.mode !== 'navigate' && !known.includes(url.href)) return;
  event.respondWith(fetch(event.request).then(response => {
    // Auth callback URLs must never enter Cache Storage.
    if (response.ok && !url.searchParams.has('code') && !url.hash) {
      const clone = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, clone)));
    }
    return response;
  }).catch(() => caches.match(event.request).then(saved => saved || (event.request.mode === 'navigate' ? caches.match(shell) : Response.error()))));
});
