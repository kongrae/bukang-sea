// Before/after guide UI, using real controls and isolated storage; never shipped.
// Serve the repository on port 5182, then node tools/guide-simple-qa.js <playwright module> [baseline ref].
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {gameBody}=require('./build-source'),{chromium}=require(process.argv[2]||'playwright');
const out=path.resolve('outputs/qa/guide-simple'),ref=process.argv[3]||'98de641';
if(!/^[\w./-]+$/.test(ref)||ref.startsWith('-'))throw Error('Invalid baseline');
fs.mkdirSync(out,{recursive:true});
const probe=`window.guideLayoutQA={
 state(){return {time:guideTime,playing:guidePlaying,clip:guideDemo?.clip,keys:guideKeys.slice(),key:guideKeys[guideIndex],demo:!!guideDemo,reduced:reduceMotion};},
 protected(){return JSON.stringify({st,best:save.best,sessions:save.sessions,hints:save.hintUsage,skin:save.skin,free:save.free});},
 first(){save.seenDevices=[];save.sound=save.vibe=false;show('game',false);loadLevel(STORY_ORDER[3]);}
};`;
for(const side of ['before','after']){
 const read=file=>side==='before'?cp.execFileSync('git',['show',ref+':src/'+file],{encoding:'utf8'}):fs.readFileSync('src/'+file,'utf8');
 const overrides=Object.fromEntries(['game.js','shell.html','art-theme.css'].map(f=>[f,read(f)]));
 overrides['game.js']=overrides['game.js'].replace("const STORE_KEY = 'bukang-sea-v1';","const STORE_KEY = 'bukang-guide-simple-qa';").replace('const boot = () =>',probe+'\nconst boot = () =>');
 const fonts=[400,500,700].map(w=>`@font-face{font-family:'Bukang Body';font-weight:${w};src:url('/assets/fonts/noto-sans-kr-${w}.woff2')}`).join('')+"@font-face{font-family:'Bukang Display';src:url('/assets/fonts/jua-400.woff2')}";
 fs.writeFileSync(path.join(out,side+'.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}</style>${gameBody(overrides).replace(/<link[^>]*fonts\.[^>]*>/g,'')}</html>`);
}
const report={baseline:ref,physicalAndroid:false,checks:[],errors:[],sizes:[]};let browser;
async function open(p){await p.locator('#titleSettingsBtn').click();await p.locator('#deviceGuideBtn').click();}
async function shot(p,name){await p.screenshot({path:path.join(out,name+'.png')});}
async function bounds(p,width,height){
 const r=await p.evaluate(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};};return {close:rect('guideClose'),done:rect('guideDone'),scroll:document.documentElement.scrollWidth,canvas:rect('guideDemo')};});
 assert.ok(r.scroll<=width+1);for(const id of ['close','done'])assert.ok(r[id].y>=0&&r[id].b<=height+1&&r[id].h>=44,JSON.stringify(r));report.sizes.push({width,height,...r});
}
async function run(){
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 for(const side of ['before','after']){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),p=await context.newPage();
  p.on('pageerror',e=>report.errors.push(e.message));await p.goto(`http://127.0.0.1:5182/outputs/qa/guide-simple/${side}.html`);await p.locator('#launchScreen').waitFor({state:'hidden'});await open(p);
  if(side==='before'){await p.locator('[data-guide="6"]').click();await shot(p,'before');await context.close();continue;}
  const initial=await p.evaluate(()=>guideLayoutQA.protected());
  for(let i=0;i<8;i++){
   await p.locator('#guideSelect').selectOption(String(i));assert.equal(await p.locator('#guideDetails').isVisible(),false);
   assert.equal((await p.evaluate(()=>guideLayoutQA.state())).playing,false);
   await p.locator('#guideDetailsToggle').click();assert.equal(await p.locator('#guideDetailsToggle').getAttribute('aria-expanded'),'true');
   let count=0;while(!await p.locator('#guideNext').isDisabled()){await p.locator('#guideNext').click();assert(++count<30);}
   assert.ok((await p.locator('#guideCaption').textContent()).length);await p.locator('#guideToggle').click();assert.equal((await p.evaluate(()=>guideLayoutQA.state())).playing,true);
   await p.locator('#guideToggle').click();const paused=(await p.evaluate(()=>guideLayoutQA.state())).time;await p.waitForTimeout(80);assert.equal((await p.evaluate(()=>guideLayoutQA.state())).time,paused);
   await p.locator('#guideDetailsToggle').click();assert.equal((await p.evaluate(()=>guideLayoutQA.state())).clip,true);
  }
  assert.equal(await p.evaluate(()=>guideLayoutQA.protected()),initial);report.checks.push('All eight devices: compact rules, expanded full rules, every manual step, playback/restart/pause, unchanged game/progress');
  await p.locator('#guideSelect').selectOption('6');assert.equal(await p.getByRole('dialog',{name:'스위치·수문',exact:true}).count(),1);await shot(p,'after');
  for(const [width,height] of [[320,568],[390,844],[844,390]]){await p.setViewportSize({width,height});await p.waitForTimeout(100);await bounds(p,width,height);await shot(p,'after-'+width);}
  await p.setViewportSize({width:320,height:568});
  await p.evaluate(()=>{for(const el of document.querySelectorAll('#guideSummary,#guideItems p,#guideCaption,#guideSelect,#guideTitle,#guideToggle,#guideDetailsToggle,#guideDone,#guidePrev,#guideNext,#guideStepCount'))el.style.fontSize=(parseFloat(getComputedStyle(el).fontSize)*2)+'px';});
  await p.locator('#guideDetailsToggle').click();await bounds(p,320,568);await p.locator('#guideNext').click();await shot(p,'after-text-200');
  await p.locator('#guideDone').click();await p.locator('#guideOverlay').waitFor({state:'hidden'});assert.equal(await p.evaluate(()=>document.activeElement.id),'titleSettingsBtn');
  report.checks.push('320px, 390px, landscape and doubled text: readable scrolling, 44px close/confirm, manual navigation and focus return');
  await p.reload();await p.locator('#launchScreen').waitFor({state:'hidden'});await p.setViewportSize({width:390,height:844});await open(p);
  const handle=await p.locator('#guideOverlay .sheet-handle').boundingBox();await p.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await p.mouse.down();await p.mouse.move(handle.x+handle.width/2,handle.y+180,{steps:8});await p.mouse.up();await p.locator('#guideOverlay').waitFor({state:'hidden'});
  await open(p);await p.keyboard.press('Escape');await p.locator('#guideOverlay').waitFor({state:'hidden'});report.checks.push('Real handle drag and Escape close the guide');
  await p.emulateMedia({reducedMotion:'no-preference'});await p.waitForFunction(()=>!guideLayoutQA.state().reduced);await p.evaluate(()=>guideLayoutQA.first());await p.locator('#guideOverlay').waitFor({state:'visible'});
  await p.waitForFunction(()=>guideLayoutQA.state().playing&&guideLayoutQA.state().time>0);assert.equal(await p.locator('#guideSelect').isVisible(),false);assert.equal(await p.locator('#guideTitle').textContent(),'물줄기');
  await p.emulateMedia({reducedMotion:'reduce'});await p.waitForFunction(()=>!guideLayoutQA.state().playing);const time=(await p.evaluate(()=>guideLayoutQA.state())).time;await p.waitForTimeout(150);assert.equal((await p.evaluate(()=>guideLayoutQA.state())).time,time);
  await p.locator('#guideDetailsToggle').click();await p.locator('#guideNext').click();await shot(p,'first-encounter-details');await p.locator('#guideClose').click();await p.locator('#guideOverlay').waitFor({state:'hidden'});assert.equal((await p.evaluate(()=>guideLayoutQA.state())).demo,false);
  report.checks.push('Real first-device stage: short autoplay, single-device heading, live reduced-motion pause and explicit manual steps');
  await context.close();
 }
 assert.deepEqual(report.errors,[]);report.success=true;
}
run().catch(e=>{report.failure=e.stack;process.exitCode=1;console.error(e);}).finally(async()=>{await browser?.close();fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));});
