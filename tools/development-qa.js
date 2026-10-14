// Unmodified release/development UI. Normal-player storage is a sentinel, never an unlock fixture.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright');
const base=process.argv[3]||'http://localhost:5182/www/',out=path.join(__dirname,'../outputs/qa/development');fs.mkdirSync(out,{recursive:true});
const key='bukang-sea-development-v1',report={url:base,physicalAndroid:false,checks:[],errors:[]};
const pass=text=>{report.checks.push(text);console.log('PASS',text);};
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  const sentinel=JSON.stringify({best:{0:3},last:1,owned:['basic'],skin:'basic',sessions:{},sound:false,vibe:false});
  await context.addInitScript(s=>{if(!localStorage.getItem('bukang-sea-v1')){localStorage.setItem('bukang-sea-v1',s);localStorage.setItem('bukang-first-canal-view-v1','top');}},sentinel);
  const state=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  const closeGuide=async()=>{if(await page.locator('#chapterGo').isVisible())await page.locator('#chapterGo').click();if(await page.locator('#guideClose').isVisible())await page.locator('#guideClose').click();};
  const home=async()=>{await closeGuide();if(await page.locator('#gameScreen').isVisible())await page.locator('#backBtn').click();};
  await page.goto(base);await page.locator('#launchScreen').waitFor({state:'hidden'});
  assert.equal(await page.locator('[data-development-build]').count(),1);
  assert.deepEqual((await state()).best,{});assert.equal((await state()).owned.length,9);
  await page.locator('#stagePicker').click();let stages=0;
  for(let chapter=0;chapter<7;chapter++){
   await page.locator(`[data-chapter="${chapter}"]`).click();
   assert.equal(await page.locator('#levelGrid [data-i]:disabled').count(),0);stages+=await page.locator('#levelGrid [data-i]').count();
  }
  assert.equal(stages,84);await page.screenshot({path:path.join(out,'all-stages.png')});
  await page.locator('#levelGrid [data-i="83"]').click();await page.locator('#gameScreen').waitFor({state:'visible'});await closeGuide();
  assert.equal((await state()).sessions.story.id,83);pass('All 84 story canals enabled with zero manufactured stars; real last-canal entry succeeds');
  await home();await page.locator('#skinBtn').click();assert.equal(await page.locator('#skinGrid [data-id]:disabled').count(),0);
  const ids=await page.locator('#skinGrid [data-id]').evaluateAll(bs=>bs.map(b=>b.dataset.id));assert.equal(ids.length,9);
  for(const id of ids){await page.locator(`#skinGrid [data-id="${id}"]`).click();assert.equal((await state()).skin,id);}
  await page.screenshot({path:path.join(out,'all-skins.png')});await page.locator('#skinsDone').click();pass('All nine skins equip through the real UI without modifying normal-player ownership');
  await page.locator('#dailyBtn').click();assert.equal(await page.locator('#dailyStages [data-stage]:disabled').count(),0);
  await page.locator('#dailyStages [data-stage="2"]').click();await page.locator('#gameScreen').waitFor({state:'visible'});await closeGuide();
  assert((await state()).sessions.dailyStages[2]);await home();pass('Third daily canal starts without clearing earlier canals');
  await page.locator('#stagePicker').click();await page.locator('[data-chapter="0"]').click();await page.locator('#levelGrid [data-i="0"]').click();await closeGuide();
  await page.keyboard.press('ArrowRight');await page.waitForTimeout(600);const saved=(await state()).sessions.story;assert.equal(saved.state.moves,1);
  await page.reload();await page.locator('#playBtn').click();await closeGuide();assert.deepEqual((await state()).sessions.story,saved);
  await page.evaluate(()=>navigator.serviceWorker.ready);await context.setOffline(true);await page.reload();await page.locator('#playBtn').click();await closeGuide();
  assert.deepEqual((await state()).sessions.story,saved);await context.setOffline(false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('bukang-sea-v1')),sentinel);
  assert.equal(await page.evaluate(()=>localStorage.getItem('bukang-first-canal-view-v1')),'top');
  pass('Development movement/skin choice survives reload and offline; normal progress and camera preference remain byte-for-byte unchanged');
  if(base.startsWith('http://localhost:5182/')){
   const dev=await page.evaluate(k=>localStorage.getItem(k),key);
   await page.goto('http://localhost:5182/outputs/qa/development/release/?all=1&dev=1');await page.locator('#launchScreen').waitFor({state:'hidden'});
   assert.equal(await page.locator('[data-development-build]').count(),0);
   await page.locator('#stagePicker').click();await page.locator('[data-chapter="6"]').click();assert.equal(await page.locator('#levelGrid [data-i="83"]').isDisabled(),true);
   await page.keyboard.press('Escape');await page.locator('#skinBtn').click();assert.equal(await page.locator('#skinGrid [data-id]:enabled').count(),1);await page.locator('#skinsDone').click();
   await page.locator('#dailyBtn').click();assert.equal(await page.locator('#dailyStages [data-stage="2"]').isDisabled(),true);
   assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),dev);
   pass('Release on the same origin restores normal locks/ownership despite development saves and all/dev query parameters');
  }
  assert.deepEqual(report.errors,[]);report.success=true;await context.close();
 }finally{fs.writeFileSync(path.join(out,base.startsWith('https:')?'public-results.json':'release-separation.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
