// Reproduce the former main-worker routing with a temporary HTTP server, then upgrade on a comparison visit.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2] || 'playwright');
const root = path.join(__dirname, '../www');
const current = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const legacy = current.replace(/const CACHE = .*;/, "const CACHE = 'bukang-sea-legacy-view-test';")
  .replace('    const url = new URL(req.url), base = new URL(self.registration.scope);\n', '')
  .replace("    if (url.pathname !== base.pathname && url.pathname !== base.pathname + 'index.html') return;\n", '');
let upgraded = false;
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.join(root, pathname.endsWith('/') ? pathname + 'index.html' : pathname);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', pathname.endsWith('.js') ? 'application/javascript' : pathname.endsWith('.woff2') ? 'font/woff2' : pathname.endsWith('.png') ? 'image/png' : pathname.endsWith('.svg') ? 'image/svg+xml' : 'text/html');
  if (pathname === '/sw.js') return res.end(upgraded ? current : legacy);
  fs.readFile(file, (err, data) => { if (err) { res.statusCode = 404; res.end(); } else res.end(data); });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const context = await browser.newContext(); const page = await context.newPage();
    await page.goto(base + '/');
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    assert((await page.evaluate(() => caches.keys())).includes('bukang-sea-legacy-view-test'));
    upgraded = true;
    await page.goto(base + '/compare/');
    await page.waitForFunction(() => viewComparison?.state().ready === 8);
    await page.waitForFunction(async () => !(await caches.keys()).includes('bukang-sea-legacy-view-test'));
    await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/compare/sw.js'));
    await context.setOffline(true);
    await page.goto(base + '/');
    await page.waitForFunction(() => !document.getElementById('app').classList.contains('launching'));
    assert.equal(await page.locator('.lab-heading').count(), 0);
    assert.equal(await page.locator('#playBtn').isVisible(), true);
    console.log('PASS legacy main worker upgrades on comparison entry; offline main game stays the real main game');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(e => { console.error(e); process.exitCode = 1; server.close(); });
