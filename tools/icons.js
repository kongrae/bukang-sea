// Renders assets/icon.svg to the PNG sizes the PWA manifest and app stores need, using a headless
// Chromium browser (Edge or Chrome). Run only when the icon changes; the PNGs are committed.
//   node tools/icons.js            (set BROWSER=<path to msedge/chrome> if auto-detect fails)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'assets', 'icons');
const candidates = [
  process.env.BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const browser = candidates.find(p => fs.existsSync(p));
if (!browser) { console.error('No Chromium browser found. Set BROWSER=<path>.'); process.exit(1); }

const svg = fs.readFileSync(path.join(root, 'assets', 'icon.svg'), 'utf8');
const page = path.join(outDir, '_render.html');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(page, `<!doctype html><html style="background:#1e7482"><body style="margin:0;overflow:hidden">
<img style="display:block;width:100vw;height:100vh" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">
</body></html>`);

const sizes = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 };
for (const [name, size] of Object.entries(sizes)) {
  const out = path.join(outDir, name);
  // headless windows have a minimum width, so keep a 512 viewport and scale the output via device pixel ratio
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', `--force-device-scale-factor=${size / 512}`,
    '--window-size=512,512', `--screenshot=${out}`, 'file:///' + page.replace(/\\/g, '/'),
  ], { stdio: 'ignore' });
  console.log(`wrote assets/icons/${name}`);
}
fs.unlinkSync(page);
