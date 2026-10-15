// Local-only UI fixtures and real-engine replay. Never included in a shipping build.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {gameBody}=require('./build-source'),{chromium}=require(process.argv[2]||'playwright');
const out=path.resolve('outputs/qa/result-polish'),ref='cce1847';fs.mkdirSync(out,{recursive:true});
const probe=`
const qaEvents=[];
for(const name of ['star','win','unlockReward','exit','eat']){const original=sfx[name];sfx[name]=(...args)=>{qaEvents.push({name,args,time:performance.now()});return original(...args);};}
window.resultQA={
 enter(i=0){save.coachSwipe=save.coachNet=true;save.seenDevices=DEVICE_GUIDES.map(d=>d.key);show('game',false);loadLevel(i,null,LEVELS[i]);},
 fish(n){st.fish=g.fish.slice(0,n).map((_,i)=>i);updateHud();},
 finish(stars=3){anim=null;st.fish=stars>=2?g.fish.map((_,i)=>i):[];st.moves=curLevel().par+(stars===2?1:0);updateHud();onClear();},
 async audio(on=true,vibe=false){save.sound=on;save.vibe=vibe;sound.syncEnabled();ac();await sound.loaded();},
 route(){return plan(g,st.pos,fishMask(),netSet(),g.nets-st.nets.length,true,st.boats,st.gate,netPickup(),st.crates).steps;},
 move(s){for(const k of s.nets)if(!st.nets.includes(k))tapTile(k%g.w,Math.floor(k/g.w));tryMove(s.dir);},
 async mode(mode){if(mode==='free'){openFree();await startFree(1,true);return;}show('game',false);loadDaily(makeDailyStage(dailyDate(),0,6));},
 operationEnd(){save.dailyOps[dailyDate()]={version:6,stars:[3,3,0]};show('game',false);loadDaily(makeDailyStage(dailyDate(),2,6));},
 reward(){save.best=Object.fromEntries(STORY_ORDER.slice(0,11).map(i=>[i,3]));save.owned=['basic'];this.enter(STORY_ORDER[11]);},
 pause(v){appActive=!v;if(v)suspendPresentation();else resumePresentation();},
 state(){return {anim:!!anim,cleared,fish:st?.fish.length,total:g?.fish.length,moves:st?.moves,level:LVL,free:FREE&&{serial:FREE.serial},daily:DAILY&&{stage:DAILY.stage},reduced:reduceMotion,timers:clearTimers.size,events:qaEvents.slice(),audio:sound.inspect(),save:JSON.parse(JSON.stringify(save))};}
};`;
function build(side,baseline=ref){
 const files=['game.js','shell.html','art-theme.css','sound.js'];
 const overrides=Object.fromEntries(files.map(file=>[file,side==='before'?cp.execFileSync('git',['show',baseline+':src/'+file],{encoding:'utf8'}):fs.readFileSync('src/'+file,'utf8')]));
 overrides['game.js']=overrides['game.js'].replace("const STORE_KEY = 'bukang-sea-v1';","const STORE_KEY = 'bukang-result-polish-qa';").replace('const boot = () =>',probe+'\nconst boot = () =>');
 const fonts=[400,500,700].map(w=>`@font-face{font-family:'Bukang Body';font-weight:${w};src:url('/assets/fonts/noto-sans-kr-${w}.woff2')}`).join('')+"@font-face{font-family:'Bukang Display';src:url('/assets/fonts/jua-400.woff2')}";
 fs.writeFileSync(path.join(out,side+'.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}</style>${gameBody(overrides).replace(/<link[^>]*fonts\.[^>]*>/g,'')}</html>`);
}
async function main(){
 const side=process.argv.includes('--before')?'before':'after';build(side);
 const report={baseline:ref,checks:[],errors:[],physicalAndroid:false};
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'no-preference'});
  p.on('pageerror',e=>report.errors.push(e.message));
  await p.addInitScript(()=>{window.qaHaptics=[];navigator.vibrate=v=>{qaHaptics.push({v,time:performance.now()});return true;};});
  await p.goto(`http://127.0.0.1:5182/outputs/qa/result-polish/${side}.html`);await p.locator('#launchScreen').waitFor({state:'hidden'});
  await p.evaluate(()=>resultQA.enter(2));await p.waitForTimeout(400);await p.screenshot({path:path.join(out,side+'-hud.png')});
  await p.evaluate(()=>resultQA.finish());await p.waitForTimeout(2100);await p.screenshot({path:path.join(out,side+'-result.png')});
  if(side==='before')return;
  const snap=name=>p.screenshot({path:path.join(out,name+'.png')});
  const state=()=>p.evaluate(()=>resultQA.state());
  const enter=i=>p.evaluate(i=>resultQA.enter(i),i);
  const finish=n=>p.evaluate(n=>resultQA.finish(n),n);
  const ready=()=>p.locator('#clearOverlay').waitFor({state:'visible'});
  async function layout(label){const r=await p.evaluate(()=>{const r=id=>{const b=document.getElementById(id).getBoundingClientRect();return {top:b.top,bottom:b.bottom,height:b.height,width:b.width};};return {h:innerHeight,w:innerWidth,scroll:document.documentElement.scrollWidth,next:r('nextBtn'),again:r('againBtn'),home:r('clearHomeBtn')};});assert.ok(r.scroll<=r.w+1);for(const k of ['next','again','home'])assert.ok(r[k].height>=44&&r[k].top>=0&&r[k].bottom<=r.h+1,JSON.stringify(r));report.checks.push({layout:label,...r});}
  await p.locator('#againBtn').click();await p.evaluate(()=>resultQA.audio(true,true));
  for(const stars of [1,2,3]){
   await enter(2);const events=(await state()).events.length, vib=await p.evaluate(()=>qaHaptics.length);await finish(stars);await ready();
   assert.equal(await p.locator('#clearStars .star-empty').count(),3);assert.equal(await p.locator('#clearStars .on').count(),stars);
   await p.waitForTimeout(1050);const calls=(await state()).events.slice(events).filter(e=>e.name==='star');assert.equal(calls.length,stars);
   assert.equal(await p.evaluate(()=>qaHaptics.length)-vib,stars);await snap('stars-'+stars);await layout('stars-'+stars);
   assert.ok((await state()).save.best[2]>=stars);
  }
  report.checks.push('1/2/3 earned stars only; three persistent empty slots; one cue/haptic per earned star; saved before presentation');
  // Real rules and production input path: zero, partial and full collection, including rapid multi-pickup.
  await enter(3);let counts=[(await state()).fish];
  for(const move of await p.evaluate(()=>resultQA.route())){
   await p.evaluate(s=>resultQA.move(s),move);await p.waitForFunction(()=>!resultQA.state().anim);counts.push((await state()).fish);
  }
  await ready();assert.ok(counts.includes(0)&&counts.includes(1)&&counts.includes(2));await p.waitForTimeout(1200);
  assert.equal(await p.locator('.fish-fly').count(),0);assert.equal(await p.locator('#stats .goal').getAttribute('aria-label'),'숭어 수집 2 / 2, 수집 완료');
  await snap('real-stage-7');report.checks.push({realStage:7,counts});
  for(const action of ['nextBtn','againBtn','clearHomeBtn','Escape','background','reduce']){
   await enter(2);await finish(3);await ready();const saved=(await state()).save.best[2];let events;
   // Observe the event boundary at the action, not a separate RPC that can race the first 420ms cue.
   if(action==='background'){events=await p.evaluate(()=>{resultQA.pause(true);return resultQA.state().events.length;});await p.waitForTimeout(400);await p.evaluate(()=>resultQA.pause(false));}
   else if(action==='reduce'){await p.emulateMedia({reducedMotion:'reduce'});await p.waitForFunction(()=>resultQA.state().reduced);events=(await state()).events.length;}
   else if(action==='Escape'){await p.keyboard.press('Escape');events=(await state()).events.length;}
   else events=await p.locator('#'+action).evaluate(el=>{const n=resultQA.state().events.length;el.click();el.click();el.click();return n;});
   await p.waitForTimeout(1500);const s=await state();assert.equal(s.events.slice(events).filter(e=>['star','win','unlockReward'].includes(e.name)).length,0,action);
   assert.equal(s.timers,0);assert.equal(s.save.best[2],saved);if(action==='nextBtn')assert.equal(s.level,6,'rapid next taps advance only once in STORY_ORDER');
   await p.emulateMedia({reducedMotion:'no-preference'});await p.waitForFunction(()=>!resultQA.state().reduced);
  }
  report.checks.push('During star sequence: triple next/replay/home, Escape, background/resume and live reduced motion cancel late cues and keep rewards');
  for(const mode of ['daily','free']){
   await p.evaluate(mode=>resultQA.mode(mode),mode);await finish(3);await ready();await p.waitForTimeout(1200);await snap('mode-'+mode);
   const saved=(await state()).save;assert.equal(await p.locator('#nextBtn').textContent(),mode==='free'?'새 수로':'다음 수로');
   if(mode==='free'){assert.equal(saved.free.completed[1],1);await p.locator('#againBtn').click();await finish(3);await ready();assert.equal((await state()).save.free.completed[1],1,'replay does not duplicate free reward');}
   await p.locator('#nextBtn').click();await p.locator('#clearOverlay').waitFor({state:'hidden'});
   await p.waitForFunction(mode=>mode==='free'?resultQA.state().free?.serial===2&&!document.getElementById('gameScreen').hidden:resultQA.state().daily?.stage===1,mode);
  }
  await p.evaluate(()=>resultQA.operationEnd());await finish(3);await ready();await p.waitForTimeout(1900);await snap('operation-complete');assert.equal(await p.locator('#operationStamp').isVisible(),false);assert.equal(await p.locator('#clearJournalStamp').isVisible(),true);
  await p.evaluate(()=>resultQA.reward());await finish(3);await ready();await p.waitForTimeout(1900);await snap('chapter-skin');assert.equal(await p.locator('#clearUnlocks').isVisible(),true);assert.equal(await p.locator('#clearChapterStamp').isVisible(),true);
  report.checks.push('Daily/free continuation; free replay reward not duplicated; operation stamp shown once; chapter completion and new skin retained');
  for(const [w,h] of [[320,568],[390,844],[844,390]]){await p.setViewportSize({width:w,height:h});await layout(w+'x'+h);await snap('reward-'+w);}
  await p.setViewportSize({width:320,height:568});await p.evaluate(()=>{for(const el of document.querySelectorAll('#clearOverlay h3,#clearOverlay p,#clearOverlay li span,#clearOverlay strong,#clearOverlay small,#clearOverlay button'))el.style.fontSize=(parseFloat(getComputedStyle(el).fontSize)*2)+'px';});await layout('320x568 doubled text');await snap('reward-text-200');
  // Muted/reduced and failed graphics/audio must never block the next action.
  await p.reload();await p.locator('#launchScreen').waitFor({state:'hidden'});await enter(2);await p.evaluate(()=>resultQA.audio(false,false));await p.emulateMedia({reducedMotion:'reduce'});await p.waitForFunction(()=>resultQA.state().reduced);
  const played=(await state()).audio.played,vibrations=await p.evaluate(()=>qaHaptics.length);await finish(3);await ready();await p.waitForTimeout(1200);
  assert.equal((await state()).audio.played,played);assert.equal(await p.evaluate(()=>qaHaptics.length),vibrations);assert.equal(await p.locator('#clearOverlay').evaluate(el=>el.classList.contains('clear-celebrating')),false);
  await p.locator('#clearMascot').evaluate(el=>{el.src='/missing-result-shark.webp';});await p.waitForFunction(()=>document.getElementById('clearMascot').hidden);await p.locator('#nextBtn').click();
  assert.equal(await p.locator('#clearOverlay').isVisible(),false);assert.equal(await p.locator('#stats .mullet-icon').count(),1);
  const blocked=await browser.newPage({viewport:{width:320,height:568}});blocked.on('pageerror',e=>report.errors.push(e.message));await blocked.addInitScript(()=>{window.AudioContext=class{constructor(){throw Error('QA: unavailable audio');}};});
  await blocked.goto('http://127.0.0.1:5182/outputs/qa/result-polish/after.html');await blocked.locator('#launchScreen').waitFor({state:'hidden'});await blocked.evaluate(()=>{resultQA.enter(2);resultQA.audio();resultQA.finish();});await blocked.locator('#clearOverlay').waitFor({state:'visible'});await blocked.locator('#nextBtn').click();await blocked.close();
  report.checks.push('Mute/haptic off, reduced motion, failed mascot and unavailable AudioContext preserve readable result and working next action');
  assert.deepEqual(report.errors,[]);report.success=true;
 }catch(e){report.failure=e.stack;throw e;}finally{fs.writeFileSync(path.join(out,side+'-report.json'),JSON.stringify(report,null,2));await browser.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={out,build,chromium};
