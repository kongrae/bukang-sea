// Release UI with a read-only state probe injected into an ephemeral browser context.
// The offline check below uses the unmodified release file and its real service worker.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.argv[2] || 'playwright');
const root = path.join(__dirname, '..'), out = path.join(root, 'outputs/qa/first-canal');
const base = process.argv[3] || 'http://localhost:5182/www/';
fs.mkdirSync(out, { recursive: true });
const html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8').replace('const boot = () =>', `window.canalQA = () => JSON.parse(JSON.stringify({level:LVL,state:st,animating:!!anim,queued,projection:boardProjection(),skin:currentSkin().id,cleared}));\nconst boot = () =>`);
const results = { browser: 'Edge', physicalAndroid: false, checks: [], errors: [] };
const pass = text => { results.checks.push(text); console.log('PASS', text); };
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width:390,height:844 }, deviceScaleFactor:2, serviceWorkers:'block', reducedMotion:'reduce' });
    const page = await context.newPage(); page.on('pageerror',e=>results.errors.push(e.message));
    await page.route(base, route=>route.fulfill({status:200,contentType:'text/html',body:html}));
    const state = () => page.evaluate(()=>canalQA());
    const record = () => page.evaluate(()=>localStorage.getItem('bukang-sea-v1'));
    const settle = () => page.waitForFunction(()=>!canalQA().animating);
    const move = async dir => {await page.keyboard.press('Arrow'+dir);await settle();};
    const choose = mode => page.locator(`[data-canal-view=${mode}]`).click();
    await page.goto(base); await page.locator('#playBtn').click(); await page.locator('#canalViewToggle').waitFor({state:'visible'});
    assert.equal((await state()).projection,.78);
    await move('Right');
    const initial = await record(), first = (await state()).state;
    for (const mode of ['top','oblique']) {
      await choose(mode); await page.waitForTimeout(150);
      assert.equal(await record(),initial); assert.deepEqual((await state()).state,first);
      await page.screenshot({path:path.join(out,`first-${mode}.png`)});
    }
    pass('main game → first canal shows both camera buttons; switching preserves position, undo history and exact saved data');
    await choose('top');await page.locator('#backBtn').click();await page.locator('#playBtn').click();
    assert.equal((await state()).projection,1);assert.deepEqual((await state()).state,first);
    await page.reload();await page.locator('#playBtn').click();
    assert.equal((await state()).projection,1);assert.deepEqual((await state()).state,first);
    await choose('oblique');await page.locator('#undoBtn').click();assert.equal((await state()).state.moves,0);
    pass('home return and reload restore first-canal progress and camera choice; undo keeps its real history');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.keyboard.press('ArrowRight');assert.equal((await state()).animating,true);
    const during = await record();await choose('top');await choose('oblique');assert.equal(await record(),during);
    await settle();assert.equal((await state()).state.moves,1);
    await page.locator('#restartBtn').click();
    await page.evaluate(()=>{for(let n=0;n<20;n++){document.querySelector('[data-canal-view=top]').click();document.querySelector('[data-canal-view=oblique]').click();window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}));}});
    await settle();assert.equal((await state()).state.moves,1);
    await page.keyboard.press('ArrowUp');await page.keyboard.press('Escape');
    await page.locator('#playBtn').click();await settle();assert.equal((await state()).state.moves,2);
    pass('switch while swimming, rapid camera/movement input and back during movement leave no duplicate turn or stuck input');
    await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#restartBtn').click();
    for(const d of ['Right','Up','Left','Up','Right','Up'])await move(d);
    await page.locator('#clearOverlay').waitFor({state:'visible'});
    const saved=JSON.parse(await record());assert.equal(saved.best[0],3);
    await page.locator('#nextBtn').click();await page.waitForFunction(()=>canalQA().level!==0);
    assert.equal(await page.locator('#canalViewToggle').isVisible(),false);assert.equal((await state()).projection,1);
    pass('normal first-canal clear grants 3 stars; Next enters the second canal with its original top view and no comparison controls');
    if(await page.locator('#guideClose').isVisible())await page.locator('#guideClose').click();
    await page.locator('#backBtn').click();await page.locator('#stagePicker').click();await page.locator('#levelGrid [data-i="0"]').click();
    await page.locator('#canalViewToggle').waitFor({state:'visible'});assert.equal((await state()).projection,.78);
    pass('main → canal selection → First bend opens the comparison on the real stage');
    for(const [width,height] of [[320,568],[390,844],[430,932]]){
      await page.setViewportSize({width,height});await page.waitForTimeout(120);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert((await page.locator('[data-canal-view]').evaluateAll(bs=>bs.map(b=>b.getBoundingClientRect().height))).every(h=>h>=44));
      await choose('top');await choose('oblique');await page.screenshot({path:path.join(out,`size-${width}.png`)});
      const board = await page.locator('#board').boundingBox();assert(board.height>=200);
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>document.documentElement.style.fontSize='200%');await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await choose('top');await choose('oblique');await page.locator('#restartBtn').click();
    await page.screenshot({path:path.join(out,'text-200.png')});
    pass('320/390/430 widths, 200% root text and reduced motion keep camera controls usable');
    await context.close();
    for(const skin of ['lighthouse','coral']){
      const c=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:'reduce',serviceWorkers:'block'}),p=await c.newPage();
      p.on('pageerror',e=>results.errors.push(e.message));
      await p.addInitScript(skin=>localStorage.setItem('bukang-sea-v1',JSON.stringify({best:{},skin,owned:['basic',skin]})),skin);
      await p.route(base,r=>r.fulfill({status:200,contentType:'text/html',body:html}));
      await p.goto(base);await p.locator('#playBtn').click();await p.keyboard.press('ArrowRight');await p.waitForFunction(()=>!canalQA().animating);
      const before=await p.evaluate(()=>localStorage.getItem('bukang-sea-v1'));
      await p.locator('[data-canal-view=top]').click();await p.locator('[data-canal-view=oblique]').click();
      assert.equal(await p.evaluate(()=>localStorage.getItem('bukang-sea-v1')),before);
      assert.equal(await p.locator('#canalViewNote').isVisible(),skin==='coral');
      await p.screenshot({path:path.join(out,skin+'.png')});await c.close();
    }
    pass('equipped lighthouse and unsupported coral remain equipped; camera comparison does not grant or change skins');
    const offline=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),p=await offline.newPage();
    p.on('pageerror',e=>results.errors.push(e.message));await p.goto(base);await p.locator('#playBtn').click();
    await p.keyboard.press('ArrowRight');await p.waitForTimeout(500);
    const packet=await p.evaluate(()=>JSON.parse(localStorage.getItem('bukang-sea-v1')).sessions.story);
    await p.evaluate(()=>navigator.serviceWorker.ready);await offline.setOffline(true);
    await p.reload();await p.locator('#playBtn').click();
    assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('bukang-sea-v1')).sessions.story),packet);
    await p.locator('[data-canal-view=top]').click();await p.locator('[data-canal-view=oblique]').click();
    pass('unmodified release resumes the first canal offline and switches both cameras');await offline.close();
    const failure=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'}),f=await failure.newPage();
    f.on('pageerror',e=>results.errors.push(e.message));
    await f.addInitScript(()=>{const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{...descriptor,set(value){descriptor.set.call(this,value.startsWith('data:image/')?'data:image/png;base64,broken':value);}});});
    await f.goto(base);await f.locator('#playBtn').click();await f.keyboard.press('ArrowRight');await f.waitForTimeout(500);
    assert.equal(await f.locator('#stats .move b').textContent(),'1');await f.locator('[data-canal-view=top]').click();
    pass('image decode failures keep the original drawn shark and playable controls');await failure.close();
    assert.deepEqual(results.errors,[]);
  } finally {fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2)+'\n');await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
