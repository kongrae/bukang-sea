// Renders the icon master to every raster the web app and the native apps need, using a headless Chromium
// (Chrome or Edge). Run only when the icon changes; the outputs are committed.
//   node tools/icons.js            (set BROWSER=<path to chrome/msedge> if auto-detect fails)
// Master: assets/icon-concepts/shark-sos-3d-v1-original.png (opaque 1254x1254 3D art, the 2026-10-02 redesign
// reference; see docs/VISUAL-REDESIGN.md). The former vector icon lives in git history (assets/icon.svg before e81f794).
// Outputs
//   assets/icons/icon-192.png, icon-512.png, apple-touch-icon.png   PWA manifest / iOS home screen / Play icon
//   assets/icon.svg                                                 favicon wrapper around icon-192.png
//   assets/icon-only.png, icon-foreground.png, icon-background.png,
//   assets/splash.png, splash-dark.png                               sources for `npx @capacitor/assets generate`
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const candidates = [
  process.env.BROWSER,
  // Chrome first: on the dev machine Edge's headless --screenshot exits 0 without writing a file (2026-10-02)
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const browser = candidates.find(p => fs.existsSync(p));
if (!browser) { console.error('No Chromium browser found. Set BROWSER=<path>.'); process.exit(1); }

const MASTER = path.join(root, 'assets', 'icon-concepts', 'shark-sos-3d-v1-original.png');
const PAGE_BG = '#c6f3f4';   // capacitor.config.json backgroundColor: splash page colour
const ICON_BG = '#5cd6ef';   // the master's aqua bezel: adaptive icon background behind the scaled foreground
const master = `data:image/png;base64,${fs.readFileSync(MASTER).toString('base64')}`;
const img = style => `<img style="display:block;position:absolute;${style}" src="${master}">`;
const full = img('left:0;top:0;width:100%;height:100%');
// adaptive icon: the launcher masks the 108dp layer down to ~66dp, so keep the art in the middle 66%
const foreground = img('left:17%;top:17%;width:66%;height:66%');
const background = `<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 40%, #a6eefc 0%, ${ICON_BG} 60%, #2fb5d8 100%)"></div>`;
// splash: the app icon as a rounded tile (28% of the shorter side) on the page colour
const splash = img('left:36%;top:36%;width:28%;height:28%;border-radius:22%');

const jobs = [
  { body: full, out: 'assets/icons/icon-192.png', size: 192 },
  { body: full, out: 'assets/icons/icon-512.png', size: 512 },
  { body: full, out: 'assets/icons/apple-touch-icon.png', size: 180 },
  { body: full, out: 'assets/icon-only.png', size: 1024 },
  { body: foreground, out: 'assets/icon-foreground.png', size: 1024, transparent: true },
  { body: background, out: 'assets/icon-background.png', size: 1024 },
  { body: splash, out: 'assets/splash.png', size: 2732, bg: PAGE_BG },
  { body: splash, out: 'assets/splash-dark.png', size: 2732, bg: PAGE_BG },
];

const page = path.join(root, 'assets', '_render.html');
// a fresh profile dir keeps headless rendering working while the same browser is open with the user's profile
const profile = path.join(os.tmpdir(), 'bukang-sea-icons-profile');
for (const job of jobs) {
  const bg = job.transparent ? 'transparent' : job.bg || ICON_BG;
  fs.writeFileSync(page, `<!doctype html><html style="background:${bg}"><body style="margin:0;overflow:hidden;background:${bg};position:relative;width:100vw;height:100vh">
${job.body}
</body></html>`);
  const out = path.join(root, job.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const before = fs.existsSync(out) ? fs.statSync(out).mtimeMs : 0;
  // headless windows have a minimum width, so keep a 512 viewport and scale the output via device pixel ratio
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${profile}`,
    `--force-device-scale-factor=${job.size / 512}`,
    ...(job.transparent ? ['--default-background-color=00000000'] : []),
    '--window-size=512,512', `--screenshot=${out}`, 'file:///' + page.replace(/\\/g, '/'),
  ], { stdio: 'ignore' });
  // the browser exits 0 even when it could not take the screenshot (e.g. profile locked), so check the file
  if (!fs.existsSync(out) || fs.statSync(out).mtimeMs <= before) {
    fs.unlinkSync(page);
    console.error(`failed to render ${job.out} with ${browser}. Try BROWSER=<path to another chrome/msedge>.`);
    process.exit(1);
  }
  console.log(`wrote ${job.out}`);
}
fs.unlinkSync(page);

// favicon: shell.html links icons/icon.svg, so wrap the 192px raster in an SVG (build.js copies it to www/icons/)
const png192 = fs.readFileSync(path.join(root, 'assets', 'icons', 'icon-192.png')).toString('base64');
fs.writeFileSync(path.join(root, 'assets', 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><image width="192" height="192" href="data:image/png;base64,${png192}"/></svg>\n`);
console.log('wrote assets/icon.svg (favicon wrapper)');
