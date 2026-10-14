// Local-only real-renderer comparison. No QA hook or unlocked progress enters a release build.
// node tools/board-art-qa.js <existing playwright module> [baseline ref] [capture|check|devices]
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const assert = require('node:assert/strict');
const { gameBody } = require('./build-source');
const { LEVELS, STORY_ORDER, STORY_POSITION } = require('../src/levels');
const { parseLevel, plan } = require('../src/engine');
const { chromium } = require(process.argv[2] || 'playwright');
const root = path.join(__dirname, '..'), out = path.join(root, 'outputs/qa/board-art');
const ref = process.argv[3] || '310c28d', mode = process.argv[4] || 'capture';
if (!/^[a-zA-Z0-9_./-]+$/.test(ref) || ref.startsWith('-')) throw Error('Invalid baseline ref');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5182';
fs.mkdirSync(out, { recursive: true });
const hooks = `
window.boardQA = {
  load(i) {
    save.sound = save.vibe = false; save.coachSwipe = save.coachNet = true;
    save.seenDevices = DEVICE_GUIDES.map(d => d.key);
    show('game', false); loadLevel(i, null, LEVELS[i]);
    if (guideOpen()) closeGuide(); closeSheet('chapterOverlay', null, false);
    pop = null; deviceSpot = null; coach = null; particles.length = wake.length = 0;
    invalidateScenes(); draw(0);
  },
  state() { return JSON.parse(JSON.stringify({level:LVL, state:st, session:save.sessions.story, cleared, animating:!!anim})); },
  paint() { draw(0); },
  camera(mode) { setCanalView(mode); },
  saved() { return localStorage.getItem(STORE_KEY); },
  sample() { const a=[]; for(let n=0;n<50;n++){const t=performance.now();draw(n/30);a.push(performance.now()-t);}a.sort((x,y)=>x-y);return {median:a[25],p95:a[47]}; },
  restore(packet) { const resumed=restoreSession(packet,LEVELS[packet.id],packet.id); if(!resumed)return false;show('game',false);loadLevel(packet.id,resumed,LEVELS[packet.id]);return true; },
  settle() { for(let k=0;anim&&k<200;k++)step(.05);draw(0);return !anim; },
  tap(i) { tapTile(i%g.w,Math.floor(i/g.w)); },
  guide(key) { showDeviceGuide(false,key); },
  dims() { return {tile:T,ox:OX,oy:OY,width:CW,height:CH,w:g.w,h:g.h,projection:boardProjection()}; },
};
`;
for (const name of ['before', 'after']) {
  const read = file => name === 'before' ? cp.execFileSync('git', ['show', ref + ':src/' + file], {cwd:root,encoding:'utf8'}) : fs.readFileSync(path.join(root,'src',file),'utf8');
  const overrides = Object.fromEntries(['shell.html','art-theme.css','game.js'].map(file => [file,read(file)]));
  assert.ok(overrides['game.js'].includes('const boot = () =>'));
  overrides['game.js'] = overrides['game.js'].replace("const STORE_KEY = 'bukang-sea-v1';", "const STORE_KEY = 'bukang-board-art-qa';")
    .replace('const boot = () =>', hooks + '\nconst boot = () =>');
  let body = gameBody(overrides).replace(/<link[^>]*fonts\.[^>]*>/g, '');
  const fonts = [400,500,700].map(w => `@font-face{font-family:'Bukang Body';font-weight:${w};src:url('/assets/fonts/noto-sans-kr-${w}.woff2')}`).join('')
    + "@font-face{font-family:'Bukang Display';font-weight:400;src:url('/assets/fonts/jua-400.woff2')}";
  fs.writeFileSync(path.join(out,name+'.html'), `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}</style></head><body>${body}</body></html>`);
}
const report = {baseline:ref,kind:'Headless Edge mobile emulation, isolated QA saves; not physical device or human play',errors:[],screens:[],checks:[]};
let browser, baselinePacket;
async function load(page,i) { await page.evaluate(i => boardQA.load(i),i); await page.waitForTimeout(260); await page.evaluate(() => boardQA.paint()); }
async function run() {
  browser = await chromium.launch({executablePath:process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  for (const name of ['before','after']) {
    const context = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const page = await context.newPage(); page.on('pageerror',e=>report.errors.push(name+': '+e.message));
    await page.goto(`${origin}/outputs/qa/board-art/${name}.html`); await page.locator('#launchScreen').waitFor({state:'hidden'});
    for (const [id,index] of [['first',0],['devices',59]]) {
      await load(page,index); await page.screenshot({path:path.join(out,`${name}-${id}.png`)});
      await page.locator('#board').screenshot({path:path.join(out,`${name}-${id}-board.png`)});
      report.screens.push({name,id,index,...await page.evaluate(()=>boardQA.dims())});
    }
    if (mode === 'check' || mode === 'devices') {
      for (const [width,height] of [[320,568],[360,640],[412,915],[844,390]]) {
        await page.setViewportSize({width,height}); await load(page,59);
        const layout = await page.evaluate(()=>({viewportWidth:innerWidth,scroll:document.documentElement.scrollWidth,...boardQA.dims()}));
        assert.ok(layout.scroll <= width+1,JSON.stringify(layout)); assert.ok(layout.tile>=18);
        if(name==='after') assert.ok(layout.oy>=0,'whole board must fit vertically');
        if (name==='after') await page.screenshot({path:path.join(out,`${name}-devices-${width}.png`)});
        report.screens.push({name,...layout});
      }
      await page.setViewportSize({width:390,height:844});
      for (const index of STORY_ORDER) {
        await load(page,index); assert.ok(await page.locator('#gameScreen').isVisible());
        if (name === 'after' && mode === 'devices') {
          assert.equal(await page.locator('#canalViewToggle').isVisible(),true);
          const before=await page.evaluate(()=>boardQA.saved());
          for(const camera of ['top','oblique']) {
            await page.locator(`[data-canal-view=${camera}]`).click();
            assert.equal(await page.evaluate(()=>boardQA.saved()),before);
            assert.equal((await page.evaluate(()=>boardQA.dims())).projection,camera==='top'?1:.78);
            if([9,36,47,59,83].includes(index)) {
              await page.waitForTimeout(120);
              await page.screenshot({path:path.join(out,`canal-${STORY_POSITION[index]+1}-${camera}.png`)});
              await page.locator('#board').screenshot({path:path.join(out,`canal-${STORY_POSITION[index]+1}-${camera}-board.png`)});
            }
          }
        }
        if(name==='after' && [5,9,36,47,83].includes(index)) await page.locator('#board').screenshot({path:path.join(out,`after-level-${index}-board.png`)});
      }
      report.checks.push(`${name}: all 84 production maps rendered`);
      await load(page,59); report[name+'DrawMs']=await page.evaluate(()=>boardQA.sample());
      // Real production keyboard movement and storage on both builds; retain snapshots for exact comparison.
      const snapshots=[];
      for (const index of mode==='devices' ? [0,9,36,47,59,72,83] : [0,9,59,72]) {
        await load(page,index);
        const grid=parseLevel(LEVELS[index]), route=index===59 ? LEVELS[index].route.split(' ').map(dir=>({dir,nets:[]})) : plan(grid,grid.start,0,new Set(),grid.nets,true).steps;
        let gateShot=false;
        for (const action of route) {
          const previous=await page.evaluate(()=>boardQA.state());
          for (const net of action.nets) if(!previous.state.nets.includes(net)) {
            // Exercise the real projected pointer coordinates, not a direct call into tapTile.
            const d=await page.evaluate(()=>boardQA.dims()),r=await page.locator('#boardCanvas').boundingBox();
            await page.mouse.click(r.x+d.ox+(net%d.w+.5)*d.tile,r.y+d.height*(1-d.projection)/2+(d.oy+(Math.floor(net/d.w)+.5)*d.tile)*d.projection);
            assert.ok((await page.evaluate(()=>boardQA.state())).state.nets.includes(net),'pointer installs net in the visible cell');
            if(name==='before') baselinePacket=(await page.evaluate(()=>boardQA.state())).session;
            await page.screenshot({path:path.join(out,`${name}-net.png`)});
          }
          await page.keyboard.press({R:'ArrowRight',L:'ArrowLeft',U:'ArrowUp',D:'ArrowDown'}[action.dir]);
          if(name==='after' && mode==='devices') {
            // Same JS turn: camera changes cannot settle a moving device, spend a turn, or change its checkpoint.
            const pair=await page.evaluate(()=>{
              const before={state:boardQA.state(),saved:boardQA.saved()};
              boardQA.camera('top');boardQA.camera('oblique');
              return {before,after:{state:boardQA.state(),saved:boardQA.saved()}};
            });
            assert.deepEqual(pair.after,pair.before);
          }
          await page.evaluate(()=>boardQA.settle());
          const state=await page.evaluate(()=>boardQA.state()); snapshots.push(state);
          if(index===59 && state.state.gate===1 && !gateShot) { await page.screenshot({path:path.join(out,`${name}-gate-open.png`)});gateShot=true; }
        }
        assert.equal((await page.evaluate(()=>boardQA.state())).cleared,true,`${name}: complete ${index}`);
      }
      report[name+'States']=snapshots;
      if(name==='after') {
        await page.reload(); await page.locator('#launchScreen').waitFor({state:'hidden'});
        assert.equal(await page.evaluate(p=>boardQA.restore(p),baselinePacket),true);
        assert.deepEqual((await page.evaluate(()=>boardQA.state())).state,baselinePacket.state);
        report.checks.push('Pre-change session with net, fish, move count and undo history restored after reload');
        await load(page,59); await page.evaluate(()=>boardQA.guide('gate')); await page.waitForTimeout(250);
        await page.screenshot({path:path.join(out,'after-guide.png')}); await page.keyboard.press('Escape');
        await page.emulateMedia({reducedMotion:'no-preference'}); await load(page,0);
        await page.keyboard.press('ArrowRight'); await page.waitForFunction(()=>!boardQA.state().animating);
        assert.equal((await page.evaluate(()=>boardQA.state())).state.moves,1);
        report.checks.push('Normal-motion keyboard move completes; reduced-motion routes match the baseline');
        await page.emulateMedia({reducedMotion:'reduce'});
        const fallback=fs.readFileSync(path.join(out,'after.html'),'utf8').replace(/data:image\/(?:webp|svg\+xml);base64,[A-Za-z0-9+/=]+/g,'data:image/webp;base64,AAAA');
        await page.route('**/after.html',r=>r.fulfill({contentType:'text/html',body:fallback}));
        await page.reload(); await page.locator('#launchScreen').waitFor({state:'hidden'}); await load(page,59);
        await page.screenshot({path:path.join(out,'after-fallback.png')});
        report.checks.push('Failed shark and device images use Canvas fallbacks with the same readable board');
      }
    }
    await context.close();
  }
  if(mode==='check' || mode==='devices') { assert.deepEqual(report.afterStates,report.beforeStates); report.checks.push(`Exact state and saved session equality across ${report.afterStates.length} inputs: first exit, nets, sand, whirlpools, gates/boat/jet and crate clears`); }
  assert.deepEqual(report.errors,[]); report.success=true;
}
run().catch(e=>{report.failure=e.stack;process.exitCode=1;}).finally(async()=>{
  fs.writeFileSync(path.join(out,mode+'-checks.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,beforeStates:report.beforeStates?.length,afterStates:report.afterStates?.length},null,2));
  await browser?.close();
});
