// Local-only before/after renderer and real-input replay. No QA hooks enter production builds.
// node tools/content-v7-qa.js <playwright module>; serve repository on 127.0.0.1:5182 first.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {gameBody}=require('./build-source'),E=require('../src/engine'),L=require('../src/levels');
const {chromium}=require(process.argv[2]||'playwright'),out=path.resolve('outputs/qa/story-v7'),origin='http://127.0.0.1:5182';
fs.mkdirSync(out,{recursive:true});
let hook=fs.readFileSync('tools/challenge-qa.js','utf8').match(/const hook=`([^]*?)`;/)[1];
hook=hook.replace('camera:setCanalView,',`camera:setCanalView,
  current(){return {level:curLevel(),run:FREE,learned:learnedDevices(),saved:JSON.parse(JSON.stringify(save))};},
  free(){if(guideOpen())closeGuide();closeSheet('clearOverlay',null,false);openFree();},
  clean(){save.best={};save.seenDevices=[];save.sound=save.vibe=false;save.coachSwipe=save.coachNet=true;persist();},
  guide(){const result={open:guideOpen(),keys:guideKeys.slice()};if(guideOpen())closeGuide();return result;},
  resumeOld(packet){save.sessions.story=packet;persist();loadLevel(packet.id,storySession(packet.id));if(guideOpen())closeGuide();closeSheet('chapterOverlay',null,false);draw(0);},`);
for(const side of ['before','after']){
  const levels=fs.readFileSync('src/levels.js','utf8')+(side==='before'?'\nLEVELS.splice(0,LEVELS.length,...STORY_PRE_VARIETY_LEVELS);':'');
  const game=fs.readFileSync('src/game.js','utf8').replace("const STORE_KEY = 'bukang-sea-v1';","const STORE_KEY = 'bukang-content-v7-qa';").replace('const boot = () =>',hook+'\nconst boot = () =>');
  const fonts=[400,500,700].map(w=>`@font-face{font-family:'Bukang Body';font-weight:${w};src:url('/assets/fonts/noto-sans-kr-${w}.woff2')}`).join('')+"@font-face{font-family:'Bukang Display';src:url('/assets/fonts/jua-400.woff2')}";
  fs.writeFileSync(path.join(out,side+'.html'),`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}</style></head><body>${gameBody({'levels.js':levels,'game.js':game}).replace(/<link[^>]*fonts\.[^>]*>/g,'')}</body></html>`);
}
const report={kind:'Desktop Edge mobile emulation, actual renderer and keyboard/net taps; not physical Android or human play',screens:[],checks:[],errors:[]};
const keys={U:'ArrowUp',D:'ArrowDown',L:'ArrowLeft',R:'ArrowRight'};let browser;
async function input(page,action){
  const before=await page.evaluate(()=>challengeQA.state());
  for(const net of action.nets)if(!before.state.nets.includes(net)){
    const d=await page.evaluate(()=>challengeQA.dims()),r=await page.locator('#boardCanvas').boundingBox();
    await page.mouse.click(r.x+d.ox+(net%d.w+.5)*d.tile,r.y+d.height*(1-d.projection)/2+(d.oy+(Math.floor(net/d.w)+.5)*d.tile)*d.projection);
    assert.ok((await page.evaluate(()=>challengeQA.state())).state.nets.includes(net),'projected net placement '+JSON.stringify({net,d,r,before}));
  }
  await page.keyboard.press(keys[action.dir]);await page.evaluate(()=>challengeQA.settle());
}
async function capture(page,name){await page.evaluate(()=>challengeQA.paint());await page.screenshot({path:path.join(out,name+'.png')});report.screens.push(name);}
async function load(page,stage){await page.evaluate(i=>challengeQA.load('story',i),L.STORY_ORDER[stage-1]);await page.waitForTimeout(80);}
async function run(){
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  for(const side of ['before','after']){
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage();
    page.on('pageerror',e=>report.errors.push(side+': '+e.message));
    await page.goto(`${origin}/outputs/qa/story-v7/${side}.html`);await page.locator('#launchScreen').waitFor({state:'hidden'});
    for(const stage of [8,25,48,63,75,84]){await load(page,stage);await capture(page,side+'-stage-'+stage);}
    if(side==='after'){
      for(let stage=1;stage<=84;stage++){
        await load(page,stage);const g=E.parseLevel(L.LEVELS[L.STORY_ORDER[stage-1]]),plan=E.plan(g,g.start,0,new Set(),g.nets,true);
        for(const action of plan.steps)await input(page,action);
        const done=await page.evaluate(()=>challengeQA.state());assert.equal(done.cleared,true,'stage '+stage);assert.equal(done.state.moves,plan.moves);assert.equal(done.state.fish.length,g.fish.length);
      }
      report.checks.push('84 official stages: actual directional input and projected net taps, all-fish clear at minimum');
      for(const stage of [25,63,75,76,79,80,81,82,83,84]){
        await load(page,stage);await page.evaluate(()=>challengeQA.camera('top'));
        const g=E.parseLevel(L.LEVELS[L.STORY_ORDER[stage-1]]),plan=E.plan(g,g.start,0,new Set(),g.nets,true);
        await input(page,plan.steps[0]);const moved=await page.evaluate(()=>challengeQA.state());
        await page.locator('#undoBtn').click();assert.equal((await page.evaluate(()=>challengeQA.state())).state.moves,0);
        await page.evaluate(packet=>challengeQA.resumeOld(packet),moved.session);assert.deepEqual((await page.evaluate(()=>challengeQA.state())).state,moved.state);
        for(const action of plan.steps.slice(1))await input(page,action);
        assert.equal((await page.evaluate(()=>challengeQA.state())).cleared,true);
      }
      report.checks.push('10 device/combination stages also clear in top view; undo/checkpoint restore verified');
      await page.evaluate(()=>challengeQA.camera('oblique'));
      for(const [width,height] of [[320,568],[390,844],[844,390]]){
        await page.setViewportSize({width,height});await load(page,84);await page.waitForTimeout(120);
        const d=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,...challengeQA.dims()}));
        assert.ok(d.scroll<=width+1);assert.ok(d.tile>=18);await capture(page,'after-84-'+width);
      }
      await page.setViewportSize({width:390,height:844});await page.evaluate(()=>challengeQA.clean());
      const families=[];let completed=0;
      for(let n=0;n<11;n++){
        await page.evaluate(()=>challengeQA.free());
        const next=page.locator('[data-free="1"][data-action="new"]');
        await (await next.count()?next:page.locator('[data-free="1"][data-action="resume"]')).click();
        await page.locator('#freeOverlay').waitFor({state:'hidden'});
        const current=await page.evaluate(()=>challengeQA.current()),guide=await page.evaluate(()=>challengeQA.guide());
        assert.equal(current.run.version,7);assert.deepEqual(current.learned,[]);assert.ok(!families.includes(current.level.family));families.push(current.level.family);
        if(['gate','crate','net','warp'].includes(current.level.family)){
          assert.ok(guide.open,'first encounter guide '+current.level.family);await capture(page,'free-'+current.level.family);
          const g=E.parseLevel(current.level),plan=E.plan(g,g.start,0,new Set(),g.nets,true);
          for(const action of plan.steps)await input(page,action);assert.equal((await page.evaluate(()=>challengeQA.state())).cleared,true);completed++;
        }
        if(n===5){await page.reload();await page.locator('#launchScreen').waitFor({state:'hidden'});}
      }
      assert.equal(families.length,11);report.checks.push('Zero story progress: 11 free families via real menu including reload; '+completed+' net/warp/gate/crate clears and first encounter guides');
      report.freeFamilies=families;
      await load(page,75);await context.setOffline(true);const g=E.parseLevel(L.LEVELS[L.STORY_ORDER[74]]);await input(page,E.plan(g,g.start,0,new Set(),g.nets,true).steps[0]);
      assert.equal((await page.evaluate(()=>challengeQA.state())).state.moves,1);report.checks.push('Loaded board plays offline');
    }
    await context.close();
  }
  assert.deepEqual(report.errors,[]);report.success=true;
}
run().catch(e=>{report.failure=e.stack;process.exitCode=1;console.error(e);}).finally(async()=>{await browser?.close();fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));});
