// Renders assets/icon.svg to every raster the web app and the native apps need, using a headless Chromium
// (Edge or Chrome). Run only when the icon changes; the PNGs are committed.
//   node tools/icons.js            (set BROWSER=<path to msedge/chrome> if auto-detect fails)
// Outputs
//   assets/icons/icon-192.png, icon-512.png, apple-touch-icon.png   PWA manifest / iOS home screen
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

// icon.svg = background rect + ripple group + <defs> + <g id="bg"> gradient sea + buoy/shark/bubble art (see the file)
const icon = fs.readFileSync(path.join(root, 'assets', 'icon.svg'), 'utf8');
const inner = icon.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<!--[\s\S]*?-->/g, '');
const ripples = (inner.match(/<g fill="none" stroke="#fff"[\s\S]*?<\/g>/) || [''])[0];
const defs = (inner.match(/<defs>[\s\S]*?<\/defs>/) || [''])[0];
const bg = (inner.match(/<g id="bg">[\s\S]*?<\/g>/) || [''])[0];
const art = inner.replace(/<rect width="512" height="512"[^>]*\/>/, '').replace(ripples, '').replace(bg, '');   // buoy + shark only
const svg = (size, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${body}</svg>`;
const HARBOR = '#0c3340', WATER = '#1e7482';
// adaptive icon: the launcher masks the 108dp layer down to ~66dp, so keep the art in the middle 60%
const foreground = svg(512, `<g transform="translate(256 256) scale(.62) translate(-256 -256)">${art}</g>`);
const background = svg(512, `${defs}<rect width="512" height="512" fill="${WATER}"/>${bg}${ripples}`);
// splash: the app icon as a rounded tile on the page colour
const splash = svg(2732, `<rect width="2732" height="2732" fill="${HARBOR}"/>
  <g transform="translate(1366 1366) scale(1.5) translate(-256 -256)">
    <clipPath id="r"><rect width="512" height="512" rx="112"/></clipPath>
    <g clip-path="url(#r)">${inner}</g>
  </g>`);

const jobs = [
  { src: icon, out: 'assets/icons/icon-192.png', size: 192 },
  { src: icon, out: 'assets/icons/icon-512.png', size: 512 },
  { src: icon, out: 'assets/icons/apple-touch-icon.png', size: 180 },
  { src: icon, out: 'assets/icon-only.png', size: 1024 },
  { src: foreground, out: 'assets/icon-foreground.png', size: 1024, transparent: true },
  { src: background, out: 'assets/icon-background.png', size: 1024 },
  { src: splash, out: 'assets/splash.png', size: 2732, bg: HARBOR },
  { src: splash, out: 'assets/splash-dark.png', size: 2732, bg: HARBOR },
];

const page = path.join(root, 'assets', '_render.html');
// a fresh profile dir keeps headless rendering working while the same browser is open with the user's profile
const profile = path.join(os.tmpdir(), 'bukang-sea-icons-profile');
for (const job of jobs) {
  const bg = job.transparent ? 'transparent' : job.bg || WATER;
  fs.writeFileSync(page, `<!doctype html><html style="background:${bg}"><body style="margin:0;overflow:hidden;background:${bg}">
<img style="display:block;width:100vw;height:100vh" src="data:image/svg+xml;base64,${Buffer.from(job.src).toString('base64')}">
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
