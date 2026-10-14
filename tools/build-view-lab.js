// A public, isolated first-canal comparison using the current game's rules, input and frame loop.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { gameBody } = require('./build-source');
const root = path.join(__dirname, '..');
function buildViewLab(destination = path.join(root, 'www/compare')) {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
  const once = (text, from, to) => {
    if (text.split(from).length !== 2) throw new Error('View comparison hook changed: ' + from.slice(0, 100));
    return text.replace(from, to);
  };
  const sprites = {};
  for (const skin of ['basic', 'lighthouse']) for (const direction of ['R', 'L', 'D', 'U']) {
    sprites[skin + '-' + direction] = 'data:image/webp;base64,' + fs.readFileSync(path.join(root, `assets/art/oblique-v1/${skin}-${direction}.webp`)).toString('base64');
  }
  const assets = text => text.replaceAll('@@LAB_BASIC_R@@', sprites['basic-R']).replaceAll('@@LAB_LIGHTHOUSE_R@@', sprites['lighthouse-R']);
  let game = read('src/game.js');
  game = once(game, "const STORE_KEY = 'bukang-sea-v1';", "const STORE_KEY = 'bukang-view-comparison-v1';");
  game = once(game, 'function drawShark(', 'function drawTopShark(');
  game = once(game, 'function buildStatic() {', 'function buildTopStatic() {');
  game = once(game, 'function onClear(', 'function onGameClear(');
  game = once(game, 'ctx.setTransform(zs, 0, 0, zs, zx * dpr, zy * dpr);', `const q = labProjection(), offset = labOffset();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#e8f8f5'; ctx.fillRect(0, 0, cvs.width, cvs.height);
  ctx.save(); ctx.beginPath(); ctx.rect(0, offset * dpr, cvs.width, CH * q * dpr); ctx.clip();
  ctx.setTransform(zs, 0, 0, zs * q, zx * dpr, (offset + zy * q) * dpr);`);
  game = once(game, 'ctx.setTransform(dpr * zs, 0, 0, dpr * zs, (OX * zs + zx) * dpr, (OY * zs + zy) * dpr);',
    'ctx.setTransform(dpr * zs, 0, 0, dpr * zs * q, (OX * zs + zx) * dpr, (offset + (OY * zs + zy) * q) * dpr);');
  game = once(game, 'Math.floor((e.clientY - r.top - OY) / T)', 'Math.floor(labGridY(e.clientY - r.top))');
  game = once(game, "gameScreen.addEventListener('pointerdown', e => {", "gameScreen.addEventListener('pointerdown', e => {\n  if (!board.contains(e.target)) return; // allow touch scrolling on the comparison controls");
  game = once(game, '\n}\n\n// fingertip: soft white disc', '\n  ctx.restore();\n}\n\n// fingertip: soft white disc');
  game = once(game, "else if (e.key === 'Escape') show('title');", "else if (e.key === 'Escape') labReset();");
  game = once(game, 'const ready = data => { start(data); resolve(); };', 'const ready = data => { start(data); startComparison(); resolve(); };');
  const runtime = read('src/view-lab/runtime.js').replace('@@LAB_SOURCES@@', JSON.stringify(sprites));
  game = once(game, 'const boot = () =>', runtime + `
function onClear() {
  cleared = true; queued = null;
  $('labResultMoves').textContent = st.moves + '번 만에 바다에 도착했어요.';
  if (!$('labResult').open) $('labResult').showModal();
}
const boot = () =>`);
  let shell = once(read('src/shell.html'), '<section class="screen game-screen" id="gameScreen" hidden>', '<section class="screen game-screen" id="gameScreen" hidden>' + assets(read('src/view-lab/panel.html')));
  shell = once(shell, '<div class="controls" id="controls">', `<div class="lab-bottom">
    <p>→로 움직인 뒤 위의 시점을 바꿔 보세요</p>
    <div class="lab-pad" role="group" aria-label="상어 이동">
      <button type="button" data-direction="L" aria-label="왼쪽으로 이동">←</button>
      <button type="button" data-direction="U" aria-label="위로 이동">↑</button>
      <button type="button" data-direction="D" aria-label="아래로 이동">↓</button>
      <button type="button" data-direction="R" aria-label="오른쪽으로 이동">→</button>
    </div>
    <div class="lab-actions"><button type="button" id="labUndo">되돌리기</button><button type="button" id="labReset">처음부터</button></div>
    <p class="lab-note">시점을 바꿔도 같은 위치 · 비교 플레이는 본 게임 기록과 별도</p>
  </div>
  <div class="controls" id="controls">`);
  shell += `<dialog class="lab-result" id="labResult"><h2>바다에 도착!</h2><p id="labResultMoves"></p><p>다른 시점과 스킨으로도 비교해 보세요.</p><button type="button" id="labAgain">다시 비교하기</button><a href="../">정식 게임으로 돌아가기</a></dialog>`;
  let body = gameBody({ 'game.js': game, 'shell.html': shell, 'art-theme.css': read('src/art-theme.css') + '\n' + read('src/view-lab/style.css') });
  body = body.replace(/<link rel="preconnect" href="https:\/\/fonts\.[^\n]*\n/g, '').replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^\n]*\n/, '');
  const fontFiles = ['jua-400', 'noto-sans-kr-400', 'noto-sans-kr-500', 'noto-sans-kr-700'];
  const fonts = fontFiles.map(f => `@font-face {font-family:'${f.startsWith('jua') ? 'Bukang Display' : 'Bukang Body'}';font-weight:${f.slice(-3)};font-display:swap;src:url('../fonts/${f}.woff2')}`).join('\n');
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#e8f8f5"><title>상어 SOS · 탑뷰와 입체 시점 비교</title><style>${fonts}</style></head><body>${body}
<script>
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  // An older installed main worker cached every navigation as index.html. Updating it repairs that cache
  // even when this comparison is the first URL opened after deployment. Do not delay the visible game.
  const parent = new URL('../', location.href).href;
  navigator.serviceWorker.getRegistrations().then(registrations => {
    const main = registrations.find(r => r.scope === parent);
    if (main) main.update().catch(() => {});
  }).catch(() => {});
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
</script></body></html>`;
  const hash = crypto.createHash('sha256').update(html).digest('hex').slice(0, 12);
  const sw = `// Isolated comparison cache; never caches the main game under the comparison address.
const CACHE = 'shark-view-lab-${hash}';
const FILES = ['./', 'index.html', ${fontFiles.map(f => `'../fonts/${f}.woff2'`).join(',')}];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('shark-view-lab-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const url = new URL(e.request.url), base = new URL(self.registration.scope);
  const isPage = e.request.mode === 'navigate' && (url.pathname === base.pathname || url.pathname === base.pathname + 'index.html');
  if (e.request.mode === 'navigate' && !isPage) return;
  if (isPage) e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); } return r; }).catch(() => caches.open(CACHE).then(c => c.match('index.html'))));
  else e.respondWith(caches.open(CACHE).then(c => c.match(e.request)).then(hit => hit || fetch(e.request)));
});`;
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, 'index.html'), html);
  fs.writeFileSync(path.join(destination, 'sw.js'), sw);
  console.log(`built ${path.relative(root, destination)}/index.html (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB), comparison ${hash}`);
  return { html, sw };
}
if (require.main === module) buildViewLab();
module.exports = { buildViewLab };
