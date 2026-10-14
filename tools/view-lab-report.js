// Compose actual browser captures in an HTML comparison, without painting over gameplay pixels.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.argv[2] || 'playwright');
const root = path.join(__dirname, '..'), production = process.argv.includes('--first-canal');
const folder = production ? 'first-canal' : 'view-lab', out = path.join(root, 'docs', folder);
fs.mkdirSync(out, { recursive: true });
const img = name => 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'outputs/qa', folder, name + '.png')).toString('base64');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 860, height: 1100 }, deviceScaleFactor: 1 });
    for (const skin of production ? ['first'] : ['basic', 'lighthouse']) {
      const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;background:#edf8f5;color:#214b56;font-family:system-ui,sans-serif;padding:28px}
      h1{margin:0 0 8px;font-size:26px}p{font-size:14px;color:#618087;margin:0 0 22px}
      main{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;background:#fffdf6;border-radius:20px;overflow:hidden}
      figcaption{padding:18px 20px;font-weight:700;font-size:18px}figcaption small{display:block;margin-top:5px;color:#68888c;font-weight:400;font-size:12px}
      img{width:100%;display:block}footer{margin-top:20px;font-size:13px;color:#67878b;line-height:1.7}</style>
      <h1>${production ? '정식 첫 수로' : skin === 'basic' ? '기본 상어' : '항해사'} · 같은 위치에서 비교</h1><p>첫 굽이 · 오른쪽으로 1회 이동 · 390 × 844 브라우저 캡처</p><main>
      <figure><figcaption>현재 탑뷰<small>기존 수로와 기존 상어 이미지</small></figcaption><img src="${img(skin + '-top' + (production ? '' : '-board'))}" alt="현재 탑뷰 수로"></figure>
      <figure><figcaption>입체 시점 · 2.5D<small>낮춘 시점, 물가의 높이, 방향별 캐릭터</small></figcaption><img src="${img(skin + '-oblique' + (production ? '' : '-board'))}" alt="입체 시점 수로"></figure>
      </main><footer>${production ? '정식 게임 → 수로 선택 → 1장 수로 1 ‘첫 굽이’에서 전환할 수 있습니다.' : '이동 규칙과 위치는 동일합니다. 비교판은 첫 수로에만 적용했습니다.'}<br>플레이 위치·이동 횟수·진행 기록을 유지하며 시점만 바꿉니다.</footer></html>`;
      fs.writeFileSync(path.join(out, `${skin}.html`), html);
      await page.setContent(html); await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
      const height = await page.evaluate(() => document.body.scrollHeight);
      await page.setViewportSize({ width: 860, height });
      await page.screenshot({ path: path.join(out, `${skin}-comparison.png`), fullPage: true });
    }
    fs.copyFileSync(path.join(root, 'outputs/qa', folder, 'results.json'), path.join(out, 'browser-checks.json'));
  } finally { await browser.close(); }
})();
