// Store screenshots (1080x1920 phone) and the Google Play feature graphic (1024x500) from the www/ build,
// driven through a headless Chromium (Edge/Chrome) over the DevTools protocol. No server needed.
//   npm run build:web && node tools/shots.js      -> docs/store/*.png
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'docs', 'store');
const fileUrl = p => 'file:///' + p.replace(/\\/g, '/');
const browser = [process.env.BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
if (!browser) { console.error('No Chromium browser found. Set BROWSER=<path>.'); process.exit(1); }
if (!fs.existsSync(path.join(root, 'www', 'index.html'))) { console.error('Run npm run build:web first.'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9335;

// Each scene: progress to store, then a script run on the title screen. `$`, sleep, tap(x, y), swipe(dir) are available.
const done = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, i % 5 === 3 ? 2 : 3]));
const scenes = [
  { name: '1-title', save: { best: done(14), last: 14 }, run: `` },
  { name: '2-jets', save: { best: done(8), last: 8 }, run: `
    document.querySelector('.lv[data-i="8"]').click(); await sleep(400);
    for (const d of 'URU') { swipe(d); await sleep(1200); }
    $('hintBtn').click(); await sleep(600);` },
  { name: '3-nets', save: { best: done(11), last: 11 }, run: `
    document.querySelector('.lv[data-i="11"]').click(); await sleep(400);
    tap(5, 1); tap(3, 8); await sleep(200);
    for (const d of 'UL') { swipe(d); await sleep(1200); }` },
  { name: '4-clear', save: { best: done(4), last: 4 }, run: `
    document.querySelector('.lv[data-i="4"]').click(); await sleep(400);
    for (const d of 'URDLURU') { swipe(d); await sleep(1300); }
    await sleep(1200);` },
  { name: '5-chapter3', save: { best: done(31), last: 31 }, run: `
    document.querySelector('.lv[data-i="31"]').click(); await sleep(400);
    for (const d of 'ULUR') { swipe(d); await sleep(1300); }` },
  { name: '6-chapters', save: { best: done(27), last: 27 }, run: `
    document.querySelectorAll('.chapter-head')[1].scrollIntoView(); await sleep(300);` },
];

async function cdp() {
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.some(t => t.type === 'page')) break; } catch {} await sleep(250); }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pending = {};
  ws.onmessage = e => { const m = JSON.parse(e.data); if (pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const m = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (m.result.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description || 'eval failed'); return m.result.result.value; };
  const shot = async file => { const m = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(m.result.data, 'base64')); console.log('wrote', path.relative(root, file)); };
  return { ws, send, ev, shot };
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'bukang-shots-'));
  const proc = spawn(browser, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--hide-scrollbars', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  try {
    const { ws, send, ev, shot } = await cdp();
    await send('Page.enable');
    // phone: 360x640 css px at 3x = 1080x1920
    await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 3, mobile: true });
    const game = fileUrl(path.join(root, 'www', 'index.html'));
    for (const s of scenes) {
      await send('Page.navigate', { url: game }); await sleep(800);
      await ev(`localStorage.setItem('bukang-sea-v1', ${JSON.stringify(JSON.stringify({ ...s.save, sound: false }))}); location.reload();`).catch(() => {});
      await sleep(1200);
      await ev(`(async () => {
        const $ = id => document.getElementById(id), sleep = ms => new Promise(r => setTimeout(r, ms));
        const K = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' };
        const swipe = d => window.dispatchEvent(new KeyboardEvent('keydown', { key: K[d] }));
        const tap = (gx, gy) => {
          const c = $('boardCanvas'), r = c.getBoundingClientRect(), T = +c.dataset.tile;
          const o = { clientX: r.left + +c.dataset.ox + (gx + .5) * T, clientY: r.top + +c.dataset.oy + (gy + .5) * T, pointerId: 1, bubbles: true };
          $('board').dispatchEvent(new PointerEvent('pointerdown', o)); $('board').dispatchEvent(new PointerEvent('pointerup', o));
        };
        ${s.run}
      })()`).catch(e => { throw new Error(s.name + ': ' + e.message); });
      await sleep(500);
      await shot(path.join(outDir, s.name + '.png'));
    }
    // feature graphic 1024x500
    await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 500, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: fileUrl(path.join(root, 'tools', 'feature-graphic.html')) }); await sleep(1500);
    await shot(path.join(outDir, 'feature-graphic.png'));
    ws.close();
  } finally { proc.kill(); }
})().catch(e => { console.error(e.message); process.exit(1); });
