// Real UI + read-only drawImage observer. Gallery hooks exist only in local QA output.
// node tools/skin-direction-qa.js <playwright> [development URL] [--gallery]
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
const { chromium } = require(process.argv[2] || 'playwright');
const { ART, gameBody } = require('./build-source');
const root = path.join(__dirname, '..'), out = path.join(root, 'outputs/qa/skin-directions');
const base = process.argv[3] || 'http://localhost:5182/www/', key = 'bukang-sea-development-v1';
const ids = ['basic', 'sakura', 'wave', 'maple', 'snow', 'gold', 'lighthouse', 'coral', 'starsea'];
const report = { url: base, browser: 'Edge mobile emulation', physicalAndroid: false, checks: [], errors: [] };
fs.mkdirSync(out, { recursive: true });
const lookup = {};
for (const [token, file] of ART.filter(([token]) => token.startsWith('OBLIQUE_'))) {
  lookup['data:image/webp;base64,' + fs.readFileSync(path.join(root, 'assets', file)).toString('base64')] = token.slice(8).toLowerCase();
}
const pass = message => { report.checks.push(message); console.log('PASS', message); };
async function gallery(browser) {
  const captures = {}, probe = `
window.skinCapture = {
 async ready() { await Promise.all(SKINS.flatMap(s => [SHARK_ART.ready('swim',s), ...(['R','L','D','U'].filter(()=>SHARK_ART.hasOblique(s)).map(d=>SHARK_ART.ready('oblique'+d,s)))])); },
 render(id, direction, size=48) {
  const old=save.skin, owned=save.owned; save.owned=SKINS.map(s=>s.id); save.skin=id;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=180;
  const c=canvas.getContext('2d'),q=.88,angle={R:0,L:Math.PI,D:Math.PI/2,U:-Math.PI/2}[direction];
  c.setTransform(2,0,0,2*q,90,90);
  const matrix=c.getTransform().toString();
  const raised=drawObliqueShark(c,0,0,size,1,1,angle,q);
  if(!raised)drawShark(c,0,0,angle,size,0,false,1,1,currentSkin(),q);
  save.skin=old;save.owned=owned;
  const pixels=c.getImageData(0,0,180,180).data;let x0=180,y0=180,x1=0,y1=0,count=0;
  for(let y=0;y<180;y++)for(let x=0;x<180;x++)if(pixels[(y*180+x)*4+3]>100){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);count++;}
  return {url:canvas.toDataURL(),raised,count,bounds:[x0,y0,x1,y1],balanced:matrix===c.getTransform().toString()&&c.globalAlpha===1};
 }
};
`;
  for (const variant of ['before', 'after']) {
    const art = variant === 'before' ? cp.execFileSync('git', ['show', '088a565:src/art.js'], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, 'src/art.js'), 'utf8');
    let body = gameBody({ 'art.js': art }).replace("const STORE_KEY = 'bukang-sea-v1';", "const STORE_KEY = 'bukang-skin-direction-qa';")
      .replace('const boot = () =>', probe + '\nconst boot = () =>').replace(/<link[^>]*fonts\.[^>]*>/g, '');
    const file = path.join(out, variant + '.html');fs.writeFileSync(file, '<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body>' + body + '</body></html>');
    const page = await browser.newPage({ reducedMotion: 'reduce' });page.on('pageerror', e => report.errors.push(e.message));
    await page.goto('http://localhost:5182/outputs/qa/skin-directions/' + variant + '.html');await page.evaluate(() => skinCapture.ready());
    captures[variant] = [];
    for (const id of ids) for (const direction of ['R', 'L', 'D', 'U']) for (const size of [48, 32]) {
      const result = await page.evaluate(args => skinCapture.render(...args), [id, direction, size]);
      assert(result.count > 100 && result.balanced);assert(result.bounds.every(n => n > 0 && n < 179), 'no clipping');
      if (variant === 'after') assert(result.raised, id + ' ' + direction + ' must use its own oblique sprite');
      captures[variant].push({ id, direction, size, ...result });
    }
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 }, deviceScaleFactor: 1 });
  const names = ['무태상어','벚꽃','파도','단풍','눈꽃','황금','항해사','산호','별바다'];
  const item = (v,id,d,size) => captures[v].find(x=>x.id===id&&x.direction===d&&x.size===size).url;
  await page.setContent('<meta charset="utf-8"><style>body{margin:0;padding:24px;background:#eef8f5;color:#174e61;font:16px system-ui}h1{font-size:24px;margin:0 0 8px}p{margin:0 0 16px}main{display:grid;grid-template-columns:120px 160px repeat(4,160px);gap:8px;align-items:center}img{width:112px;height:112px;display:block;margin:auto;background:#278eaa;border-radius:14px}b{text-align:center}.tiny img{width:90px;height:90px}</style><h1>9종 스킨 · 입체 시점 전체 적용</h1><p>실제 게임 렌더러 · 48px 기준 확대 / 고유 장식과 네 방향 유지</p><main><b>스킨</b><b>변경 전 →</b><b>변경 후 →</b><b>←</b><b>↓ 앞모습</b><b>↑ 뒷모습</b>' + ids.map((id,i)=>'<b>'+names[i]+'</b><img src="'+item('before',id,'R',48)+'">'+['R','L','D','U'].map(d=>'<img src="'+item('after',id,d,48)+'">').join('')).join('')+'</main>');
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await page.screenshot({ path:path.join(out,'all-skins-comparison.png'),fullPage:true });
  await page.close();
  pass('All 9 skins render 4 authored directions at 48px and 32px without clipping; comparison uses the real before/after renderer');
}
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    if (process.argv.includes('--gallery')) await gallery(browser);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await context.addInitScript(lookup => {
      window.skinPaints = {};
      const original = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (img, ...args) {
        const name = lookup[img.src];if(name) window.skinPaints[this.canvas.id + ':' + name] = (window.skinPaints[this.canvas.id + ':' + name] || 0) + 1;
        return original.call(this,img,...args);
      };
    }, lookup);
    const page = await context.newPage();page.on('pageerror', e => report.errors.push(e.message));
    const closeGuide = async () => { if(await page.locator('#guideClose').isVisible())await page.locator('#guideClose').click(); };
    const record = () => page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
    const seen = (canvas,id) => page.waitForFunction(({canvas,id})=>Object.keys(skinPaints).some(k=>k.startsWith(canvas+':'+id+'_')),{canvas,id});
    await page.goto(base);await page.locator('#launchScreen').waitFor({state:'hidden'});
    for (const id of ids) {
      await page.locator('#skinBtn').click();await page.locator(`#skinGrid [data-id="${id}"]`).click();await page.locator('#skinsDone').click();
      await page.evaluate(()=>window.skinPaints={});await page.locator('#playBtn').click();await closeGuide();await seen('boardCanvas',id);
      if(id==='basic') { await page.keyboard.press('ArrowRight');await page.waitForTimeout(500);assert.equal((await record()).sessions.story.state.moves,1); }
      assert.equal((await record()).skin,id);const saved=(await record()).sessions.story;
      await page.screenshot({path:path.join(out,'game-'+id+'.png')});
      await page.locator('#settingsBtn').click();await page.locator('#deviceGuideBtn').click();await seen('guideDemo',id);
      // Replay a real completed step, which must leave the live game checkpoint untouched.
      if(!await page.locator('#guideNext').isDisabled())await page.locator('#guideNext').click();
      assert.deepEqual((await record()).sessions.story,saved);
      await page.locator('#guideDemo').screenshot({path:path.join(out,'guide-'+id+'.png')});await closeGuide();
      if(await page.locator('#settingsOverlay').isVisible())await page.locator('#settingsDone').click();
      await page.locator('#backBtn').click();
    }
    pass('All 9 skins selected through the actual collection UI draw their oblique image in the playable board and device examples; examples preserve the active session');
    await page.locator('#playBtn').click();await closeGuide();
    const saved=(await record()).sessions.story;assert.equal(saved.state.moves,1);
    await page.locator('#settingsBtn').click();await page.locator('[data-canal-view=top]').click();await page.locator('#settingsDone').click();
    assert.deepEqual((await record()).sessions.story,saved);await page.reload();await page.locator('#playBtn').click();await closeGuide();
    assert.deepEqual((await record()).sessions.story,saved);
    await page.locator('#settingsBtn').click();await page.locator('[data-canal-view=oblique]').click();await page.locator('#settingsDone').click();await seen('boardCanvas','starsea');
    await page.evaluate(()=>navigator.serviceWorker.ready);await context.setOffline(true);await page.reload();await page.locator('#playBtn').click();await closeGuide();await seen('boardCanvas','starsea');
    assert.deepEqual((await record()).sessions.story,saved);await page.locator('#undoBtn').click();assert.equal((await record()).sessions.story.state.moves,0);
    await context.close();pass('Skinned gameplay preserves movement, top-view switch, reload, offline oblique rendering and undo');
    assert.deepEqual(report.errors,[]);report.success=true;
  } finally {
    fs.writeFileSync(path.join(out,base.startsWith('https:')?'public-results.json':'results.json'),JSON.stringify(report,null,2)+'\n');await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
