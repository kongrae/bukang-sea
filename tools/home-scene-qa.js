// Visual fixtures are isolated saves, not evidence of human play or chapter completion.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright');
process.env.HOME_QA_BASELINE='e020813';process.env.HOME_QA_NAME='home-scene';
const {build,out,docs,key,ready,layout}=require('./home-simple-qa');
const {CHAPTERS,STORY_ORDER}=require('../src/levels');
const skins=['basic','sakura','wave','maple','snow','gold','lighthouse','coral','starsea'];
const url='http://127.0.0.1:5182/outputs/qa/home-scene/after.html';
async function main(){
 build('after');fs.mkdirSync(docs,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const report={checks:[],errors:[],physicalAndroid:false};
 const page=async(reducedMotion='reduce')=>{
  const p=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion});
  p.on('pageerror',e=>report.errors.push(e.message));return p;
 };
 try{
  for(let i=0;i<skins.length;i++){
   const ci=i%CHAPTERS.length,done=CHAPTERS.slice(0,ci).reduce((n,ch)=>n+ch.count,0),skin=skins[i];
   const fixture={best:Object.fromEntries(STORY_ORDER.slice(0,done).map(id=>[id,3])),last:STORY_ORDER[done],owned:skins,skin,sessions:{}};
   const p=await page();await p.addInitScript(({storageKey,fixture})=>localStorage.setItem(storageKey,JSON.stringify(fixture)),{storageKey:key('after'),fixture});
   await p.goto(url);await ready(p);await p.waitForFunction(()=>document.getElementById('heroScenery').naturalWidth>0);
   assert.equal(await p.locator('#heroScenery').getAttribute('data-region'),CHAPTERS[ci].region);
   assert.notEqual(await p.locator('.hero-scenery').evaluate(el=>getComputedStyle(el).maskImage),'none');
   assert.deepEqual(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).best,key('after')),fixture.best);
   const a=await p.locator('#heroCanvas').evaluate(el=>el.toDataURL());await p.waitForTimeout(180);
   assert.equal(await p.locator('#heroCanvas').evaluate(el=>el.toDataURL()),a,'reduced-motion hero stays still');
   await p.locator('.hero-scene').screenshot({path:path.join(out,skin+'-scene.png')});
   if(i===0){
    await p.locator('#skinBtn').click();await p.locator('#skinGrid [data-id="sakura"]').click();await p.locator('#skinsDone').click();await p.locator('#skinsOverlay').waitFor({state:'hidden'});await p.waitForTimeout(350);
    assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).skin,key('after')),'sakura');
    assert.equal(await p.locator('#heroScenery').getAttribute('data-region'),CHAPTERS[0].region);
    assert.notEqual(await p.locator('#heroCanvas').evaluate(el=>el.toDataURL()),a,'equipped skin replaces the foreground');
    await p.locator('#playBtn').click();await p.locator('#gameScreen').waitFor({state:'visible'});
   }
   report.checks.push({skin,chapter:ci+1,region:CHAPTERS[ci].region});await p.close();
  }
  // Hold only the reused chapter picture; the shark/font/start gate remains production code.
  const html=fs.readFileSync(path.join(out,'after.html'),'utf8');
  const slowHtml=html.replace(/('harbor-canals': )'data:image\/webp;base64,[A-Za-z0-9+/=]+'/,"$1'/held-hero.webp'");assert.notEqual(slowHtml,html);
  const slow=await page();let release;const held=new Promise(resolve=>{release=resolve;});
  await slow.route('**/after.html',route=>route.fulfill({contentType:'text/html',body:slowHtml}));
  await slow.route('**/held-hero.webp',async route=>{await held;await route.fulfill({contentType:'image/webp',body:fs.readFileSync('assets/art/regions/harbor-canals.webp')});});
  await slow.goto(url,{waitUntil:'domcontentloaded'});await ready(slow);assert.equal(await slow.locator('#heroScenery').evaluate(el=>el.naturalWidth),0);
  const before=await layout(slow);await slow.screenshot({path:path.join(out,'scene-loading-fallback.png')});release();
  await slow.waitForFunction(()=>document.getElementById('heroScenery').naturalWidth>0);await slow.waitForTimeout(300);
  assert.deepEqual((await layout(slow)).play,before.play,'late scenery causes no button layout shift');
  await slow.locator('#playBtn').click();await slow.locator('#gameScreen').waitFor({state:'visible'});await slow.close();
  report.checks.push('Unfinished scenery does not block main/start; late decoding leaves the start button in place');
  const failed=await page();await failed.route('**/after.html',route=>route.fulfill({contentType:'text/html',body:slowHtml}));await failed.route('**/held-hero.webp',route=>route.abort());
  await failed.goto(url);await ready(failed);assert.equal(await failed.locator('#heroScenery').isHidden(),true);await failed.locator('#playBtn').click();await failed.locator('#gameScreen').waitFor({state:'visible'});await failed.close();
  report.checks.push('Failed scenery hides the image; gradient, shark and primary action remain available');
  const sharp=require(path.join(path.dirname(process.argv[2]),'sharp')),parts=[];
  for(let i=0;i<skins.length;i++){
   const x=i%3*280,y=Math.floor(i/3)*300;
   parts.push({input:await sharp(path.join(out,skins[i]+'-scene.png')).resize({width:280,height:270,fit:'contain',background:'#e8f8f5'}).png().toBuffer(),left:x,top:y+30});
   parts.push({input:Buffer.from(`<svg width="280" height="30"><text x="12" y="22" style="font:14px sans-serif;fill:#205b6d">${skins[i]} / chapter ${i%CHAPTERS.length+1}</text></svg>`),left:x,top:y});
  }
  await sharp({create:{width:840,height:900,channels:4,background:'#e8f8f5'}}).composite(parts).png().toFile(path.join(docs,'skins-and-regions.png'));
  fs.copyFileSync(path.join(out,'scene-loading-fallback.png'),path.join(docs,'scene-loading-fallback.png'));
  assert.deepEqual(report.errors,[]);report.success=true;
 }catch(e){report.failure=e.stack;throw e;}finally{
  await browser.close();fs.writeFileSync(path.join(out,'scene-report.json'),JSON.stringify(report,null,2));if(report.success)fs.copyFileSync(path.join(out,'scene-report.json'),path.join(docs,'scene-report.json'));console.log(JSON.stringify(report));
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
