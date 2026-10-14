// Actual production renderer / input, isolated saves. Desktop mobile emulation, not physical-device proof.
// node tools/challenge-qa.js <playwright module> [baseline commit]
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {gameBody}=require('./build-source'),E=require('../src/engine'),F=require('../src/free'),D=require('../src/daily');
const {chromium}=require(process.argv[2]||'playwright');
const out=path.resolve('outputs/qa/challenge'),ref=process.argv[3]||'c1b5fba',origin='http://127.0.0.1:5182';
if(!/^[\w./-]+$/.test(ref)||ref.startsWith('-'))throw Error('Invalid ref');
fs.mkdirSync(out,{recursive:true});
const hook=`window.challengeQA={
  load(mode,value,packet=null){
    save.sound=save.vibe=false;save.coachSwipe=save.coachNet=true;save.seenDevices=DEVICE_GUIDES.map(d=>d.key);
    closeSheet('clearOverlay',null,false);show('game',false);
    const level=mode==='story'?LEVELS[value]:value.level,keep=packet?restoreSession(packet,level,packet.id):null;
    if(packet&&!keep)throw Error('Restore failed');
    if(mode==='free')loadFree(value,keep);else if(mode==='daily')loadDaily(value,keep);else loadLevel(value,keep);
    if(guideOpen())closeGuide();closeSheet('chapterOverlay',null,false);
    pop=null;deviceSpot=null;coach=null;particles.length=wake.length=0;invalidateScenes();draw(0);
  },
  state(){return JSON.parse(JSON.stringify({state:st,cleared,animating:!!anim,session:save.sessions[FREE?'free'+FREE.difficulty:DAILY?dailySessionKey(DAILY):'story'],wake:wake.length}));},
  camera:setCanalView,
  dims(){return {tile:T,ox:OX,oy:OY,width:CW,height:CH,w:g.w,h:g.h,projection:boardProjection()};},
  paint(){draw(0);},settle(){for(let i=0;anim&&i<200;i++)step(.05);draw(0);},
  skin(id){save.skin=id;invalidateScenes();draw(0);},
  sample(){const a=[];for(let i=0;i<50;i++){const t=performance.now();draw(i/30);a.push(performance.now()-t);}a.sort((a,b)=>a-b);return {median:a[25],p95:a[47]};}
};`;
for(const side of ['before','after']) {
  const read=file=>side==='before'?cp.execFileSync('git',['show',ref+':src/'+file],{encoding:'utf8'}):fs.readFileSync(path.join('src',file),'utf8');
  const overrides=Object.fromEntries(['game.js','shell.html','art-theme.css','variety.js','free.js','daily.js'].map(f=>[f,read(f)]));
  overrides['game.js']=overrides['game.js'].replace("const STORE_KEY = 'bukang-sea-v1';","const STORE_KEY = 'bukang-challenge-qa';").replace('const boot = () =>',hook+'\nconst boot = () =>');
  const fonts=[400,500,700].map(w=>`@font-face{font-family:'Bukang Body';font-weight:${w};src:url('/assets/fonts/noto-sans-kr-${w}.woff2')}`).join('')+"@font-face{font-family:'Bukang Display';src:url('/assets/fonts/jua-400.woff2')}";
  fs.writeFileSync(path.join(out,side+'.html'),`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}</style></head><body>${gameBody(overrides).replace(/<link[^>]*fonts\.[^>]*>/g,'')}</body></html>`);
}
const report={baseline:ref,kind:'Headless Edge mobile emulation; isolated QA state; not physical Android or human play',screens:[],checks:[],errors:[]};
const keys={U:'ArrowUp',D:'ArrowDown',L:'ArrowLeft',R:'ArrowRight'};
let browser;
async function load(page,mode,value,packet=null){await page.evaluate(({mode,value,packet})=>challengeQA.load(mode,value,packet),{mode,value,packet});await page.waitForTimeout(80);}
async function screenshot(page,name){await page.evaluate(()=>challengeQA.paint());await page.screenshot({path:path.join(out,name+'.png')});report.screens.push({name,...await page.evaluate(()=>challengeQA.dims())});}
async function input(page,action){
  const before=await page.evaluate(()=>challengeQA.state());
  for(const net of action.nets)if(!before.state.nets.includes(net)) {
    const d=await page.evaluate(()=>challengeQA.dims()),r=await page.locator('#boardCanvas').boundingBox();
    await page.mouse.click(r.x+d.ox+(net%d.w+.5)*d.tile,r.y+d.height*(1-d.projection)/2+(d.oy+(Math.floor(net/d.w)+.5)*d.tile)*d.projection);
    assert.ok((await page.evaluate(()=>challengeQA.state())).state.nets.includes(net),'projected net tap');
  }
  await page.keyboard.press(keys[action.dir]);await page.evaluate(()=>challengeQA.settle());
}
async function run(){
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  for(const side of ['before','after']) {
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage();
    page.on('pageerror',e=>report.errors.push(side+': '+e.message));
    await page.goto(`${origin}/outputs/qa/challenge/${side}.html`);await page.locator('#launchScreen').waitFor({state:'hidden'});
    const version=side==='before'?4:5;
    await load(page,'story',0);await page.evaluate(()=>challengeQA.camera('oblique'));await screenshot(page,side+'-shark');
    for(const seed of [1,3]) {await load(page,'free',{...F.makeFree(seed,2,version),serial:1});await screenshot(page,side+'-free-'+seed);}
    await load(page,'daily',D.makeDailyStage('2026-10-14',2,version));await screenshot(page,side+'-daily');
    if(side==='after') {
      const netRun={...F.makeFree(1,2,5),serial:1},cases=[['net',netRun,'free'],['current',{...F.makeFree(3,2,5),serial:1},'free'],['warp',D.makeDailyStage('2026-10-14',2,5),'daily']];
      for(const [label,value,mode] of cases)for(const camera of ['oblique','top']) {
        await load(page,mode,value);await page.evaluate(c=>challengeQA.camera(c),camera);
        const g=E.parseLevel(value.level),plan=E.plan(g,g.start,0,new Set(),g.nets,true);
        await input(page,plan.steps[0]);const moved=await page.evaluate(()=>challengeQA.state());
        await page.locator('#undoBtn').click();assert.equal((await page.evaluate(()=>challengeQA.state())).state.moves,0);
        await load(page,mode,value,moved.session);assert.deepEqual((await page.evaluate(()=>challengeQA.state())).state,moved.state);
        for(const action of plan.steps.slice(1))await input(page,action);
        const done=await page.evaluate(()=>challengeQA.state());assert.equal(done.cleared,true);assert.equal(done.state.fish.length,4);
        report.checks.push(`${label}/${camera}: actual input, projected net placement, undo, restore, four-fish clear in ${done.state.moves} moves`);
      }
      for(const [width,height] of [[320,568],[360,640],[390,844],[412,915],[844,390]]) {
        await page.setViewportSize({width,height});await load(page,'free',netRun);await page.evaluate(()=>challengeQA.camera('oblique'));
        const d=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,...challengeQA.dims()}));
        assert.ok(d.scroll<=width+1);assert.ok(d.tile>=18);
        const top=d.height*(1-d.projection)/2+d.oy*d.projection;
        assert.ok(top>=-1&&top+d.h*d.tile*d.projection<=d.height+1,'projected rows fit');
        await screenshot(page,'after-small-'+width);
      }
      await page.setViewportSize({width:320,height:568});
      // Browser-computed text sizes doubled, without doubling the canvas or touch coordinates.
      await page.evaluate(()=>{const pairs=[...document.querySelectorAll('#gameScreen *')].filter(e=>e.children.length===0&&e.textContent.trim()).map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]);for(const [e,size] of pairs)e.style.fontSize=(size*2)+'px';});
      await page.waitForTimeout(100);await screenshot(page,'after-text-200');
      const enlarged=await page.evaluate(()=>({scroll:document.querySelector('#gameScreen').scrollHeight,view:document.querySelector('#gameScreen').clientHeight,...challengeQA.dims()}));
      assert.ok(enlarged.tile>=24);assert.ok(enlarged.scroll>enlarged.view);
      await page.locator('#controls').scrollIntoViewIfNeeded();await screenshot(page,'after-text-200-bottom');
      await page.reload();await page.locator('#launchScreen').waitFor({state:'hidden'});await page.setViewportSize({width:390,height:844});
      for(const id of ['basic','sakura','wave','maple','snow','gold','lighthouse','coral','starsea']) {await load(page,'story',0);await page.evaluate(id=>challengeQA.skin(id),id);await screenshot(page,'skin-'+id);}
      await page.emulateMedia({reducedMotion:'no-preference'});await load(page,'story',0);await page.keyboard.press('ArrowRight');
      await page.waitForFunction(()=>challengeQA.state().wake>0);await screenshot(page,'after-moving-wake');
      await page.waitForFunction(()=>!challengeQA.state().animating&&challengeQA.state().wake===0);report.checks.push('Normal motion: wake appears while moving and disappears while idle');
      await page.emulateMedia({reducedMotion:'reduce'});await load(page,'free',netRun);report.drawMs=await page.evaluate(()=>challengeQA.sample());
      await context.setOffline(true);const g=E.parseLevel(netRun.level);await input(page,E.plan(g,g.start,0,new Set(),g.nets,true).steps[0]);
      assert.equal((await page.evaluate(()=>challengeQA.state())).state.moves,1);report.checks.push('Loaded game plays offline');
    }
    await context.close();
  }
  assert.deepEqual(report.errors,[]);report.success=true;
}
run().catch(e=>{report.failure=e.stack;process.exitCode=1;console.error(e);}).finally(async()=>{await browser?.close();fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));});
