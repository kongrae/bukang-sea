// Browser checks use actual controls and the current game's state; no forced moves or alternate engine.
// node tools/view-lab-qa.js <playwright module> [base URL]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2] || 'playwright');
const base = process.argv[3] || 'http://localhost:5182/www';
const out = path.join(__dirname, '../outputs/qa/view-lab');
const report = { browser: 'Edge Chromium', physicalDevice: false, checks: [], errors: [] };
fs.mkdirSync(out, { recursive: true });
const check = name => { report.checks.push(name); console.log('PASS', name); };
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    await page.goto(base + '/');
    await page.waitForFunction(() => !document.getElementById('app').classList.contains('launching'));
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.goto(base + '/compare/');
    await page.waitForFunction(() => window.viewComparison?.state().ready === 8);
    const sentinel = JSON.stringify({ best: { 0: 3, 1: 2 }, skin: 'wave', owned: ['basic', 'wave'], sessions: { story: { sentinel: 'existing-progress' } } });
    await page.evaluate(value => localStorage.setItem('bukang-sea-v1', value), sentinel);
    const state = () => page.evaluate(() => viewComparison.state());
    const move = async direction => { await page.locator(`[data-direction=${direction}]`).click(); await page.waitForFunction(() => !viewComparison.state().animating); };
    const same = (a, b) => assert.deepEqual(a.state, b.state);
    await move('R');
    for (const skin of ['basic', 'lighthouse']) {
      await page.locator(`[data-skin=${skin}]`).click();
      // Canvas asset callbacks settle before screenshots; state is never altered by the wait.
      await page.waitForTimeout(150);
      const before = await state();
      for (const view of ['top', 'oblique']) {
        await page.locator(`[data-view=${view}]`).click();
        await page.waitForTimeout(120);
        same(before, await state());
        await page.screenshot({ path: path.join(out, `${skin}-${view}.png`) });
        await page.locator('#board').screenshot({ path: path.join(out, `${skin}-${view}-board.png`) });
      }
    }
    check('two skins and both views preserve the same position, history and move count');
    const first = await state(); assert.equal(first.state.moves, 1); assert.deepEqual(first.state.pos, [5, 5]);
    await page.locator('#labUndo').click(); assert.deepEqual((await state()).state.pos, [1, 5]);
    await page.locator('#labReset').click();
    for (const direction of ['R', 'U', 'L', 'U', 'R', 'U']) await move(direction);
    await page.locator('#labResult').waitFor({ state: 'visible' });
    assert.equal((await state()).state.moves, 6); assert.equal((await state()).cleared, true);
    assert.match(await page.locator('#labResultMoves').textContent(), /6번/);
    await page.locator('#labAgain').click(); assert.equal((await state()).state.moves, 0);
    check('real first-canal solution clears in 6 moves; undo and restart work');
    // Exercise downward/front pose by returning from the second stop.
    for (const d of ['R', 'U', 'D']) await move(d);
    await page.screenshot({ path: path.join(out, 'lighthouse-front.png') });
    await page.keyboard.press('Escape'); assert.equal((await state()).state.moves, 0);
    check('front pose through real downward movement; Escape returns to a fresh comparison');
    assert.equal(await page.evaluate(() => localStorage.getItem('bukang-sea-v1')), sentinel);
    check('production save is byte-for-byte unchanged after skin switches, play, clear and reset');
    // Ordinary motion, switching views while a turn is still animating, rapid input and interruption.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('[data-direction=R]').click();
    assert.equal((await state()).animating, true);
    const during = await state();
    await page.locator('[data-view=top]').click(); same(during, await state());
    await page.locator('[data-view=oblique]').click(); same(during, await state());
    await page.waitForFunction(() => !viewComparison.state().animating);
    await page.locator('#labReset').click();
    await page.evaluate(() => { for (let i = 0; i < 20; i++) document.querySelector('[data-direction=R]').click(); });
    await page.waitForFunction(() => !viewComparison.state().animating);
    assert.equal((await state()).state.moves, 1);
    await page.locator('[data-direction=U]').click();
    await page.locator('#labReset').click();
    await page.waitForTimeout(800);
    assert.equal((await state()).state.moves, 0); assert.equal((await state()).animating, false);
    check('switching views during motion, 20 rapid taps and mid-move reset leave no duplicate turn or input lock');
    await page.locator('[data-direction=R]').click();
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow')));
    await page.waitForFunction(() => !viewComparison.state().animating);
    assert.equal((await state()).state.moves, 1);
    check('pagehide/pageshow interruption preserves committed movement (simulated lifecycle, not a physical phone)');
    for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const targets = await page.locator('[data-view],[data-skin],[data-direction],#labUndo,#labReset').evaluateAll(bs => bs.map(b => b.getBoundingClientRect().height));
      assert(targets.every(h => h >= 44));
      if (width === 320) {
        const reachable = await page.evaluate(() => {
          const scroller = document.getElementById('gameScreen'); scroller.scrollTop = scroller.scrollHeight;
          const r = document.getElementById('labReset').getBoundingClientRect();
          return scroller.scrollHeight > scroller.clientHeight && r.top >= 0 && r.bottom <= innerHeight && getComputedStyle(scroller).touchAction === 'pan-y';
        });
        assert.equal(reachable, true, 'small-screen actions must be reachable by touch scrolling');
      }
      await page.locator('[data-view=top]').click();
      await page.locator('[data-view=oblique]').click();
      await page.screenshot({ path: path.join(out, `viewport-${width}.png`), fullPage: true });
    }
    check('320×568, 390×844, 430×932: no horizontal overflow; controls at least 44 CSS px; small screens scroll');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => { document.querySelector('#gameScreen').style.fontSize = '200%'; document.querySelectorAll('.lab-heading h1,.lab-caption,.lab-bottom p,.lab-switch button,.lab-skins button').forEach(e => e.style.fontSize = parseFloat(getComputedStyle(e).fontSize) * 2 + 'px'); });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('#labReset').click(); await move('R');
    await page.screenshot({ path: path.join(out, 'text-200.png'), fullPage: true });
    check('200% comparison text remains readable with vertical scrolling; reduced-motion play works');
    await page.reload(); await page.waitForFunction(() => window.viewComparison?.state().ready === 8);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.includes('/compare/sw.js'));
    await context.setOffline(true);
    await page.reload(); await page.waitForFunction(() => window.viewComparison?.state().ready === 8);
    await move('R'); assert.equal((await state()).state.moves, 1);
    await context.setOffline(false);
    check('comparison reloads and plays offline after its first completed cache installation');
    assert.equal(await page.evaluate(() => localStorage.getItem('bukang-sea-v1')), sentinel);
    const cachedMain = await page.evaluate(async () => {
      const key = (await caches.keys()).find(k => k.startsWith('bukang-sea-'));
      const res = await (await caches.open(key)).match(new URL('../index.html', location.href).href);
      return res.text();
    });
    assert(!cachedMain.includes('lab-heading'));
    assert(cachedMain.includes("const STORE_KEY = 'bukang-sea-v1'"));
    check('visiting comparison under the main service worker never replaces the offline main-game cache');
    await context.close();
    // Fail image decoding, including embedded images: the existing drawn fallback must remain playable.
    const fail = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const bad = await fail.newPage();
    bad.on('pageerror', e => report.errors.push(e.message));
    await bad.addInitScript(() => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      Object.defineProperty(HTMLImageElement.prototype, 'src', { ...descriptor, set(value) { descriptor.set.call(this, value.startsWith('data:image/') ? 'data:image/png;base64,broken' : value); } });
    });
    await bad.goto(base + '/compare/');
    await bad.waitForFunction(() => window.viewComparison && !document.getElementById('app').classList.contains('launching'));
    await bad.locator('[data-direction=R]').click(); await bad.waitForFunction(() => !viewComparison.state().animating);
    assert.equal(await bad.evaluate(() => viewComparison.state().state.moves), 1);
    await bad.screenshot({ path: path.join(out, 'image-fallback.png') });
    check('all image decodes failing does not block startup or first movement');
    await fail.close();
    assert.deepEqual(report.errors, []);
  } finally {
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
