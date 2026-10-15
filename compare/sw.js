// Isolated comparison cache; never caches the main game under the comparison address.
const CACHE = 'shark-view-lab-3adcd2c7650c';
const FILES = ['./', 'index.html', '../fonts/jua-400.woff2','../fonts/noto-sans-kr-400.woff2','../fonts/noto-sans-kr-500.woff2','../fonts/noto-sans-kr-700.woff2'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('shark-view-lab-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const url = new URL(e.request.url), base = new URL(self.registration.scope);
  const isPage = e.request.mode === 'navigate' && (url.pathname === base.pathname || url.pathname === base.pathname + 'index.html');
  if (e.request.mode === 'navigate' && !isPage) return;
  if (isPage) e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); } return r; }).catch(() => caches.open(CACHE).then(c => c.match('index.html'))));
  else e.respondWith(caches.open(CACHE).then(c => c.match(e.request)).then(hit => hit || fetch(e.request)));
});