// Real browser input against isolated storage; no gameplay or unlock hooks.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {gameBody}=require('./build-source'),{chromium}=require(process.argv[2]||'playwright');
const baseline='874435d',out=path.resolve('outputs/qa/home-simple'),docs=path.resolve('docs/home-simple');
const origin='http://127.0.0.1:5182/',key=side=>'bukang-home-simple-qa-'+side;
fs.mkdirSync(out,{recursive:true});
function build(side){
 const overrides=Object.fromEntries(['game.js','shell.html','art-theme.css'].map(file=>[file,side==='before'?cp.execFileSync('git',['show',baseline+':src/'+file],{encoding:'utf8'}):fs.readFileSync('src/'+file,'utf8')]));
 overrides['game.js']=overrides['game.js'].replace("const STORE_KEY = 'bukang-sea-v1';",`const STORE_KEY = '${key(side)}';`);
 const fonts=[400,500,700].map(w=>`@font-face{font-family:'Bukang Body';font-weight:${w};src:url('/assets/fonts/noto-sans-kr-${w}.woff2')}`).join('')+"@font-face{font-family:'Bukang Display';src:url('/assets/fonts/jua-400.woff2')}";
 fs.writeFileSync(path.join(out,side+'.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}</style>${gameBody(overrides).replace(/<link[^>]*fonts\.[^>]*>/g,'')}</html>`);
}
async function ready(p){await p.locator('#launchScreen').waitFor({state:'hidden'});await p.waitForTimeout(500);}
async function layout(p){return p.evaluate(()=>{const home=document.getElementById('titleScreen'),r=document.getElementById('playBtn').getBoundingClientRect();return {width:innerWidth,height:innerHeight,content:home.scrollHeight,available:home.clientHeight,scrollWidth:home.scrollWidth,clientWidth:home.clientWidth,play:{top:r.top,bottom:r.bottom,height:r.height,width:r.width}};});}
async function verify(p,report){
 const stored=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key('after'));
 const ids=['playBtn','dailyBtn','freeBtn','skinBtn','stagePicker','journalBtn','helpBtn','titleSettingsBtn'];
 for(const [width,height] of [[320,568],[360,640],[390,844],[412,915],[844,390]]){
  await p.setViewportSize({width,height});const r=await layout(p);
  assert.ok(r.scrollWidth<=r.clientWidth+1,JSON.stringify(r));
  if(height>width)assert.ok(r.play.top<height*.45&&r.play.bottom<height,'start above the fold');
  for(const id of ids)assert.ok((await p.locator('#'+id).boundingBox()).height>=44,id+' touch target');
  report.checks.push({normalLayout:r});await p.screenshot({path:path.join(out,`home-${width}.png`)});
 }
 await p.setViewportSize({width:390,height:844});
 const sheets=[['titleSettingsBtn','settingsOverlay'],['dailyBtn','dailyOverlay'],['freeBtn','freeOverlay'],['skinBtn','skinsOverlay'],['stagePicker','mapOverlay'],['journalBtn','journalOverlay'],['helpBtn','helpOverlay']];
 for(const [button,sheet] of sheets){
  await p.locator('#'+button).click();await p.locator('#'+sheet).waitFor({state:'visible'});await p.waitForTimeout(300);
  await p.keyboard.press('Escape');await p.locator('#'+sheet).waitFor({state:'hidden'});
  assert.equal(await p.locator('#app').evaluate(el=>el.inert),false);
 }
 report.checks.push('All seven existing menu entries open their own sheet and Escape restores input');
 await p.locator('#stagePicker').click();await p.waitForTimeout(300);
 await p.locator('#mapCard').evaluate(el=>{el.scrollTop=180;});const scroll=await p.locator('#mapCard').evaluate(el=>el.scrollTop);
 await p.keyboard.press('Escape');await p.locator('#mapOverlay').waitFor({state:'hidden'});await p.locator('#stagePicker').click();await p.waitForTimeout(300);
 assert.equal(await p.locator('#mapCard').evaluate(el=>el.scrollTop),scroll);
 await p.keyboard.press('Escape');await p.locator('#mapOverlay').waitFor({state:'hidden'});
 await p.locator('#titleSettingsBtn').click();await p.waitForTimeout(300);const handle=await p.locator('#settingsOverlay .sheet-handle').boundingBox();
 await p.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await p.mouse.down();await p.mouse.move(handle.x+handle.width/2,handle.y+200,{steps:12});await p.mouse.up();
 await p.locator('#settingsOverlay').waitFor({state:'hidden'});report.checks.push('Map scroll is restored and the settings handle closes via actual browser pointer drag');
 await p.locator('#playBtn').dblclick({delay:50});await p.locator('#gameScreen').waitFor({state:'visible'});await p.waitForTimeout(350);
 await p.keyboard.press('ArrowRight');await p.waitForFunction(k=>JSON.parse(localStorage.getItem(k))?.sessions.story?.state.moves===1,key('after'));
 const first=await stored();await p.locator('#backBtn').click();await p.locator('#titleScreen').waitFor({state:'visible'});await p.waitForTimeout(300);
 assert.equal(await p.locator('#playBtn').textContent(),'이어서 구출!');assert.match(await p.locator('#journeyLabel').textContent(),/1회 진행/);
 await p.screenshot({path:path.join(out,'resume-home.png')});await p.reload();await ready(p);
 assert.equal(await p.locator('#playBtn').textContent(),'이어서 구출!');await p.locator('#playBtn').click();await p.waitForTimeout(400);
 assert.deepEqual((await stored()).sessions.story,first.sessions.story,'same board and state after real move/reload/resume');
 await p.evaluate(()=>{window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('pageshow'));});
 assert.equal(await p.locator('#launchScreen').isVisible(),false);await p.locator('#backBtn').click();await p.waitForTimeout(300);
 await p.locator('#playBtn').click();await p.keyboard.press('Escape');await p.waitForTimeout(350);assert.equal(await p.locator('#titleScreen').isVisible(),true);
 assert.equal(await p.locator('#app').evaluate(el=>el.inert),false);
 report.checks.push('Rapid start, one real move, main return, reload/resume, back during entrance and simulated background preserve progress without replaying launch');
 // Root font enlargement is browser emulation, not the Android OS font setting.
 await p.setViewportSize({width:320,height:568});await p.addStyleTag({content:'html{font-size:200%}'});
 const large=await layout(p);assert.ok(large.scrollWidth<=large.clientWidth+1,JSON.stringify(large));
 for(const id of ids){await p.locator('#'+id).scrollIntoViewIfNeeded();const box=await p.locator('#'+id).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=321&&box.height>=44,id);}
 await p.locator('#playBtn').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,'home-text-200.png')});report.checks.push({text200:large});
 await p.emulateMedia({reducedMotion:'reduce'});await p.reload();await ready(p);await p.screenshot({path:path.join(out,'home-reduced-320.png')});
 await p.locator('#playBtn').click();await p.locator('#gameScreen').waitFor({state:'visible'});assert.equal(await p.locator('#launchScreen').isVisible(),false);
 report.checks.push('320px enlarged text scrolls to every action; reduced motion still enters the saved game');
}
async function main(){
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const report={baseline,checks:[],errors:[],physicalAndroid:false};
 try{
  const sides=process.argv.includes('--before')?['before']:['before','after'];
  for(const side of sides){
   build(side);const p=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
   p.on('pageerror',e=>report.errors.push(e.message));await p.goto(origin+'outputs/qa/home-simple/'+side+'.html');await ready(p);
   await p.screenshot({path:path.join(out,side+'-home.png')});report.checks.push({side,...await layout(p)});
   if(side==='after')await verify(p,report);await p.close();
  }
  if(sides.includes('after')){
   const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});p.on('pageerror',e=>report.errors.push(e.message));
   await p.goto(origin+'outputs/qa/home-simple/after.html');await ready(p);await p.locator('#playBtn').click();await p.waitForTimeout(350);
   const E=require('../src/engine'),{LEVELS}=require('../src/levels'),g=E.parseLevel(LEVELS[0]),route=E.plan(g,g.start,0,new Set(),g.nets,true);
   for(const step of route.steps){await p.keyboard.press({U:'ArrowUp',D:'ArrowDown',L:'ArrowLeft',R:'ArrowRight'}[step.dir]);await p.waitForTimeout(850);}
   await p.locator('#clearOverlay').waitFor({state:'visible'});await p.waitForTimeout(1100);assert.equal(await p.locator('#clearStars .on').count(),3);
   await p.locator('#nextBtn').click();await p.locator('#clearOverlay').waitFor({state:'hidden'});await p.locator('#gameScreen').waitFor({state:'visible'});
   assert.equal((await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key('after'))).best[0],3);report.checks.push('Fresh main to first canal, actual keyboard solution, three stars saved, next canal entered');
   // Separate completed-story fixture checks conditional home actions, not a playthrough claim.
   await p.locator('#backBtn').click();await p.locator('#titleScreen').waitFor({state:'visible'});await p.waitForTimeout(300);
   await p.evaluate(({storageKey,count})=>{const save=JSON.parse(localStorage.getItem(storageKey));save.best=Object.fromEntries(Array.from({length:count},(_,i)=>[i,3]));save.sessions={};localStorage.setItem(storageKey,JSON.stringify(save));},{storageKey:key('after'),count:LEVELS.length});
   await p.reload();await ready(p);assert.equal(await p.locator('#playBtn').textContent(),'별 더 모으기');
   await p.locator('#endingBtn').click();await p.locator('#endingOverlay').waitFor({state:'visible'});await p.keyboard.press('Escape');await p.locator('#endingOverlay').waitFor({state:'hidden'});
   await p.close();report.checks.push('Completed-story save fixture preserves collect-more-stars and ending replay actions');
   const failed=await browser.newPage({viewport:{width:320,height:568},reducedMotion:'reduce'});
   await failed.route('**/after.html',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(out,'after.html'),'utf8').replace(/data:image\/webp;base64,[A-Za-z0-9+/=]+/g,'data:image/webp;base64,AAAA')}));
   await failed.route('**/*.woff2',route=>route.abort());await failed.goto(origin+'outputs/qa/home-simple/after.html');await ready(failed);
   await failed.screenshot({path:path.join(out,'home-fallback.png')});await failed.locator('#playBtn').click();await failed.locator('#gameScreen').waitFor({state:'visible'});await failed.close();report.checks.push('Failed WebP and font assets keep the fallback shark and working start action');
   fs.mkdirSync(docs,{recursive:true});const sharp=require(path.join(path.dirname(process.argv[2]),'sharp'));
   const parts=[];for(const [i,side]of ['before','after'].entries())parts.push({input:await sharp(path.join(out,side+'-home.png')).resize({width:390}).png().toBuffer(),left:i*406,top:38});
   const label=Buffer.from('<svg width="796" height="38"><style>text{font:16px sans-serif;fill:#205b6d}</style><text x="12" y="25">BEFORE</text><text x="418" y="25">AFTER</text></svg>');
   await sharp({create:{width:796,height:882,channels:4,background:'#e8f8f5'}}).composite([...parts,{input:label,left:0,top:0}]).png().toFile(path.join(docs,'comparison.png'));
   for(const file of ['after-home.png','resume-home.png','home-320.png','home-text-200.png','home-fallback.png'])fs.copyFileSync(path.join(out,file),path.join(docs,file));
  }
  assert.deepEqual(report.errors,[]);report.success=true;
 }catch(e){report.failure=e.stack;throw e;}finally{await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(report.success&&fs.existsSync(docs))fs.copyFileSync(path.join(out,'report.json'),path.join(docs,'report.json'));console.log(JSON.stringify(report));}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={build,out,docs,key,ready,layout};
