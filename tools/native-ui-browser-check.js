// Isolated browser regression checks. Requires an existing Playwright installation and the local server.
// node tools/native-ui-browser-check.js <playwright module> [http://127.0.0.1:5182/www/]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2] || 'playwright');
const root = path.join(__dirname, '..'), out = path.join(root, 'outputs/qa/native-ui');
const url = process.argv[3] || 'http://127.0.0.1:5182/www/';
const report = { kind: 'Headless Chromium mobile emulation; no physical touch or GPU FPS claim', checks: [], sizes: [], errors: [] };
const check = (name, data = true) => report.checks.push({ name, data });
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
let browser;
async function ready(page) { await page.locator('#launchScreen').waitFor({ state: 'hidden' }); await page.waitForTimeout(450); }
async function shot(page, name) { await page.screenshot({ path: path.join(out, name + '.png') }); }
async function escape(page) { await page.keyboard.press('Escape'); await page.waitForTimeout(240); }
async function run() {
  fs.mkdirSync(out, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const ctx = await browser.newContext(mobile), page = await ctx.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  // Capture the pre-change build against the same local fonts and mobile emulation.
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(out, 'before.html'), 'utf8') }));
  await page.goto(url); await page.waitForTimeout(400); await shot(page, 'before-home');
  await page.locator('#stagePicker summary').click(); await page.waitForTimeout(300); await shot(page, 'before-map');
  await page.locator('#titleSettingsBtn').click(); await page.waitForTimeout(300); await shot(page, 'before-settings');
  await escape(page); await page.locator('#playBtn').click(); await page.waitForTimeout(400); await shot(page, 'before-game');
  await page.unroute(url); await page.evaluate(() => localStorage.clear());
  await page.goto(url); await ready(page); await shot(page, 'after-home');
  for (const [width, height] of [[320,568],[360,640],[390,844],[412,915],[844,390]]) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => {
      const title = document.getElementById('titleScreen'), rect = document.getElementById('playBtn').getBoundingClientRect();
      return { width: innerWidth, height: innerHeight, bodyWidth: document.documentElement.scrollWidth,
        contentWidth: title.scrollWidth, availableWidth: title.clientWidth, playBottom: rect.bottom };
    });
    assert.ok(layout.bodyWidth <= width + 1 && layout.contentWidth <= layout.availableWidth + 1, JSON.stringify(layout));
    if (height > width) assert.ok(layout.playBottom <= height, 'primary action must be visible');
    report.sizes.push(layout); await shot(page, 'home-' + width + 'x' + height);
  }
  await page.setViewportSize(mobile.viewport);
  await page.locator('#stagePicker').click(); await page.waitForTimeout(320); await shot(page, 'after-map');
  await page.locator('#mapCard').evaluate(el => { el.scrollTop = 270; });
  const scroll = await page.locator('#mapCard').evaluate(el => el.scrollTop);
  await escape(page); await page.locator('#stagePicker').click(); await page.waitForTimeout(320);
  assert.equal(await page.locator('#mapCard').evaluate(el => el.scrollTop), scroll);
  await page.locator('#mapCard').evaluate(el => { el.scrollTop = 0; });
  await page.locator('[data-chapter="6"]').click();
  assert.equal(await page.locator('#levelGrid .lv:not([disabled])').count(), 0);
  await page.locator('#journeyBtn').click(); await page.waitForTimeout(300);
  await page.locator('[data-journey-chapter="0"]').click(); await page.waitForTimeout(300);
  assert.equal(await page.locator('#mapOverlay').isVisible(), true);
  check('map scroll restoration, locked chapters and journey return');
  await escape(page); await page.locator('#helpBtn').click(); await page.waitForTimeout(300);
  assert.equal(await page.locator('#legend canvas').count(), 10); await escape(page);
  await page.locator('#titleSettingsBtn').click(); await page.waitForTimeout(300); await shot(page, 'after-settings');
  const handle = await page.locator('#settingsOverlay .sheet-handle').boundingBox();
  await page.mouse.move(handle.x + 100, handle.y + 20); await page.mouse.down();
  await page.mouse.move(handle.x + 101, handle.y + 200, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(300);
  assert.equal(await page.locator('#settingsOverlay').isVisible(), false);
  assert.equal(await page.locator('#app').evaluate(el => el.inert), false);
  check('help content, real browser pointer drag dismissal and unlocked input');
  const play = await page.locator('#playBtn').boundingBox();
  await page.mouse.dblclick(play.x + play.width / 2, play.y + play.height / 2, { delay: 60 });
  await page.waitForTimeout(500); await shot(page, 'after-game');
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(900);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bukang-sea-v1')));
  assert.equal(stored.sessions.story.state.moves, 1);
  await page.reload(); await ready(page); await page.locator('#playBtn').click(); await page.waitForTimeout(450);
  const resumed = await page.evaluate(() => JSON.parse(localStorage.getItem('bukang-sea-v1')));
  assert.deepEqual(resumed.sessions.story, stored.sessions.story);
  check('rapid start taps and in-progress reload preserve the same board/state');
  await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('pageshow')); });
  assert.equal(await page.locator('#launchScreen').isVisible(), false);
  check('simulated page suspension/resume does not replay launch');
  await page.locator('#backBtn').click(); await page.waitForTimeout(300);
  await page.locator('#playBtn').click(); await page.keyboard.press('Escape'); await page.waitForTimeout(350);
  assert.equal(await page.locator('#titleScreen').isVisible(), true);
  assert.equal(await page.locator('#app').evaluate(el => el.inert), false);
  check('back during screen entrance leaves one usable main screen');
  // Solve with actual keyboard input, deriving the route from the unchanged engine.
  await page.evaluate(() => localStorage.clear()); await page.reload(); await ready(page);
  await page.locator('#playBtn').click(); await page.waitForTimeout(350);
  const E = require('../src/engine'), { LEVELS } = require('../src/levels'), g = E.parseLevel(LEVELS[0]);
  const route = E.plan(g, g.start, 0, new Set(), g.nets, true);
  for (const step of route.steps) { await page.keyboard.press({ R:'ArrowRight', L:'ArrowLeft', U:'ArrowUp', D:'ArrowDown' }[step.dir]); await page.waitForTimeout(1000); }
  await page.locator('#clearOverlay').waitFor({ state:'visible' }); await page.waitForTimeout(1200); await shot(page, 'after-clear');
  await page.locator('#nextBtn').click(); await page.waitForTimeout(500);
  assert.equal(await page.locator('#gameScreen').isVisible(), true); assert.equal(await page.locator('#clearOverlay').isVisible(), false);
  check('first canal completed through browser input; next canal entered');
  await page.locator('#backBtn').click(); await page.waitForTimeout(300);
  await page.addStyleTag({ content: 'html { font-size: 125%; }' });
  await page.setViewportSize({ width:320, height:568 }); await shot(page, 'home-text-125');
  await page.locator('#helpBtn').click(); await page.waitForTimeout(300);
  assert.equal(await page.locator('#helpOverlay [data-sheet-close]').isVisible(), true);
  check('320px layout with 125% root font and scrollable help');
  await ctx.close();
  // Hold font requests for a measured launch sequence, without adding delays to production.
  const slow = await browser.newContext(mobile), sp = await slow.newPage();
  let release; const held = new Promise(resolve => { release = resolve; });
  await sp.route('**/*.woff2', async route => { await held; await route.continue(); });
  await sp.goto(url, { waitUntil:'domcontentloaded' });
  const cdp = await slow.newCDPSession(sp), times = [], initial = Date.now();
  async function frame(name) {
    const result = await cdp.send('Page.captureScreenshot', { format:'png' });
    fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(result.data, 'base64')); times.push({ name, ms: Date.now() - initial });
  }
  await frame('launch-1-loading'); release();
  await sp.waitForFunction(() => !document.getElementById('app').classList.contains('launching'));
  await frame('launch-2-reveal'); await sp.waitForTimeout(100); await frame('launch-3-enter');
  await ready(sp); await frame('launch-4-ready'); check('actual browser launch frame sequence with held fonts', times);
  await slow.close();
  const failed = await browser.newContext({ ...mobile, reducedMotion:'reduce' }), fp = await failed.newPage();
  await fp.route(url, route => route.fulfill({ contentType:'text/html', body: fs.readFileSync(path.join(root,'www/index.html'),'utf8').replace(/data:image\/webp;base64,[A-Za-z0-9+/=]+/g,'data:image/webp;base64,AAAA') }));
  await fp.route('**/*.woff2', route => route.abort());
  await fp.goto(url); await ready(fp); await shot(fp, 'fallback-reduced');
  assert.equal(await fp.locator('#app').evaluate(el => el.inert), false);
  await fp.locator('#playBtn').click(); await fp.waitForTimeout(200); assert.equal(await fp.locator('#gameScreen').isVisible(), true);
  check('failed WebP assets and fonts still allow play with reduced motion'); await failed.close();
  const offline = await browser.newContext(mobile), op = await offline.newPage();
  await op.goto(url.replace('127.0.0.1','localhost')); await ready(op);
  await op.evaluate(() => navigator.serviceWorker.ready); await op.reload(); await ready(op);
  await offline.setOffline(true); await op.reload(); await ready(op); await op.locator('#playBtn').click();
  assert.equal(await op.locator('#gameScreen').isVisible(), true); check('installed service worker supports offline reload and play');
  await offline.close();
  assert.deepEqual(report.errors, []);
  report.success = true;
}
run().catch(error => { report.failure = error.stack; process.exitCode = 1; }).finally(async () => {
  fs.writeFileSync(path.join(out,'browser-checks.json'), JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2)); await browser?.close();
});
