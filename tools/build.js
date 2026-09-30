// Builds the game from src/.
//   node tools/build.js            -> dist/index.html   (standalone, open directly in a browser)
//   node tools/build.js --artifact -> dist/artifact.html (no <html>/<head>/<body>, for Claude artifact publishing)
//   node tools/build.js --web      -> www/               (PWA: index.html + manifest + service worker + icons; also the Capacitor webDir)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');

const body = [
  read('shell.html'),
  '<script>',
  read('engine.js'),
  read('levels.js'),
  read('daily.js'),
  read('free.js'),
  read('game.js'),
  '</script>',
].join('\n');

// subset copies from tools/fonts.js, renamed (OFL reserved font names) — see --font-* tokens in shell.html
const FONTS = [
  { family: 'Bukang Display', weight: 400, file: 'jua-400.woff2' },
  { family: 'Bukang Body', weight: 400, file: 'noto-sans-kr-400.woff2' },
  { family: 'Bukang Body', weight: 500, file: 'noto-sans-kr-500.woff2' },
  { family: 'Bukang Body', weight: 700, file: 'noto-sans-kr-700.woff2' },
];
const APP = { name: '상어 SOS: 바다로 보내줘!', short: '상어 SOS', color: '#0c3340', description: '수로에 갇힌 상어에게 바다로 가는 길을 열어 주는 구출 슬라이드 퍼즐' };

const page = (head, extra = '', content = body) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
${head}</head>
<body style="margin:0">
${content}
${extra}</body>
</html>
`;

function write(rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`built ${rel} (${(Buffer.byteLength(content) / 1024).toFixed(1)} KB)`);
}

if (process.argv.includes('--playtest')) {
  // A facilitator build only: stage selection and storage isolation must never enter the release builds.
  const fingerprint = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
  const replaceOnce = (text, from, to) => {
    if (text.split(from).length !== 2) throw new Error('playtest build hook changed: ' + from);
    return text.replace(from, to);
  };
  let content = replaceOnce(body, "const STORE_KEY = 'bukang-sea-v1';", `const tester = new URLSearchParams(location.search).get('tester') || 'pilot';
const testAll = new URLSearchParams(location.search).get('all') === '1';
const STORE_KEY = 'bukang-sea-playtest-${fingerprint}-' + (testAll ? 'lab-' : 'core-') + (/^[A-Za-z0-9_-]{1,24}$/.test(tester) ? tester : 'pilot');`);
  content = replaceOnce(content, 'const unlocked = i => i === 0 || save.best[i - 1] != null;', 'const unlocked = i => testAll || i === 0 || save.best[i - 1] != null;');
  content = replaceOnce(content, '부산 북항 친수공원 · 수로 탈출 퍼즐', `PLAYTEST · ${fingerprint} · 기록 별도`);
  content = replaceOnce(content, "$('lvNum').textContent = label;", "$('lvNum').textContent = label + ' · TEST';");
  // Use local fonts so mobile test sessions do not depend on Google Fonts connectivity.
  content = content.replace(/<link rel="preconnect" href="https:\/\/fonts\.[^\n]*\n/g, '').replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^\n]*\n/, '');
  const fonts = FONTS.map(f => `@font-face { font-family: "${f.family}"; font-weight: ${f.weight}; src: url("fonts/${f.file}") format("woff2"); }`).join('\n');
  write('playtest/index.html', page(`<title>플레이테스트 — ${APP.name}</title><style>${fonts}</style>\n`, '', content));
  fs.mkdirSync(path.join(root, 'playtest', 'fonts'), { recursive: true });
  FONTS.forEach(f => fs.copyFileSync(path.join(root, 'assets', 'fonts', f.file), path.join(root, 'playtest', 'fonts', f.file)));
  console.log(`game build ${fingerprint}; use ?tester=P01 for normal progression, &all=1 for later-stage testing; separate records, no service worker`);
} else if (process.argv.includes('--artifact')) {
  write('dist/artifact.html', body);
  // privacy policy as its own artifact page (its public link is the Play Console privacy policy URL)
  const privacy = fs.readFileSync(path.join(root, 'assets', 'privacy.html'), 'utf8');
  const part = re => (privacy.match(re) || [''])[0];
  write('dist/privacy.html', [part(/<title>[\s\S]*?<\/title>/), part(/<style>[\s\S]*?<\/style>/), part(/<main>[\s\S]*?<\/main>/), ''].join('\n'));
} else if (process.argv.includes('--web')) {
  const head = `<meta name="description" content="${APP.description}">
<meta name="theme-color" content="${APP.color}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${APP.short}">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<style>
${FONTS.map(f => `@font-face { font-family: "${f.family}"; font-weight: ${f.weight}; font-display: swap; src: url("fonts/${f.file}") format("woff2"); }`).join('\n')}
</style>
`;
  // bundled subset fonts replace Google Fonts, so the installed app needs no network at all
  const webBody = body.replace(/<link rel="preconnect" href="https:\/\/fonts\.[^\n]*\n/g, '').replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^\n]*\n/, '');
  const known = new Set(fs.readFileSync(path.join(root, 'assets', 'fonts', 'chars.txt'), 'utf8'));
  const missing = [...new Set(body)].filter(ch => ch.codePointAt(0) > 0x7f && !/\s/.test(ch) && !known.has(ch));
  if (missing.length) console.warn(`warning: ${missing.length} characters are not in the bundled fonts (${missing.slice(0, 20).join('')}...). Run: npm run fonts`);
  // Offline support for browsers only; inside the Capacitor app the files are already local.
  const register = `<script>
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !window.Capacitor) navigator.serviceWorker.register('sw.js').catch(() => {});
</script>
`;
  const html = page(head, register, webBody);
  const icons = ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
  const hash = crypto.createHash('sha1').update(html);
  icons.forEach(f => hash.update(fs.readFileSync(path.join(root, 'assets', 'icons', f))));
  FONTS.forEach(f => hash.update(fs.readFileSync(path.join(root, 'assets', 'fonts', f.file))));
  const version = hash.digest('hex').slice(0, 10);
  const manifest = {
    name: APP.name, short_name: APP.short, description: APP.description, lang: 'ko',
    start_url: './', scope: './', display: 'standalone', orientation: 'portrait',
    background_color: APP.color, theme_color: APP.color,
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  const sw = `// Generated by tools/build.js --web. Bump happens automatically when any cached file changes.
const CACHE = 'bukang-sea-${version}';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', ${icons.map(f => `'icons/${f}'`).join(', ')},
  ${FONTS.map(f => `'fonts/${f.file}'`).join(', ')}];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('bukang-sea-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // page: network first so a new build shows up right away, cache when offline
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); return res; })
      .catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
`;
  write('www/index.html', html);
  write('www/manifest.webmanifest', JSON.stringify(manifest, null, 2) + '\n');
  write('www/sw.js', sw);
  fs.mkdirSync(path.join(root, 'www', 'icons'), { recursive: true });
  fs.copyFileSync(path.join(root, 'assets', 'icon.svg'), path.join(root, 'www', 'icons', 'icon.svg'));
  icons.forEach(f => fs.copyFileSync(path.join(root, 'assets', 'icons', f), path.join(root, 'www', 'icons', f)));
  fs.rmSync(path.join(root, 'www', 'fonts'), { recursive: true, force: true });   // drop fonts that are no longer used
  fs.mkdirSync(path.join(root, 'www', 'fonts'), { recursive: true });
  fs.readdirSync(path.join(root, 'assets', 'fonts')).filter(f => /\.(woff2|txt)$/.test(f) && f !== 'chars.txt')
    .forEach(f => fs.copyFileSync(path.join(root, 'assets', 'fonts', f), path.join(root, 'www', 'fonts', f)));
  fs.copyFileSync(path.join(root, 'assets', 'privacy.html'), path.join(root, 'www', 'privacy.html'));
  console.log(`copied icons, fonts and privacy.html, cache version ${version}`);
} else {
  write('dist/index.html', page(''));
}
