// Run board-art-qa.js <playwright> 042932c capture first. Observers never ship in a build.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright');
const root=path.join(__dirname,'..'),out=path.join(root,'outputs/qa/development');
const probe=`
let guideDrawCalls=[];
const observeGuide=(fn,name,index)=>(...args)=>{guideDrawCalls.push({name,raised:args[index]===true,value:args[4]});return fn(...args);};
drawBuoy=observeGuide(drawBuoy,'buoy',5);drawBoat=observeGuide(drawBoat,'boat',7);drawJet=observeGuide(drawJet,'jet',7);
drawGate=observeGuide(drawGate,'gate',7);drawSwitch=observeGuide(drawSwitch,'switch',6);drawCrate=observeGuide(drawCrate,'crate',6);
window.guideArtQA={
 paint(){guideDrawCalls=[];guidePaintTime=-1;drawDeviceDemo();return guideDrawCalls;},
 legend(){guideDrawCalls=[];renderLegend();return guideDrawCalls;},
 phases(){const t=guideTime,frames=[];for(const phase of guideDemo.phases){guideTime=phase.start+phase.duration/2;frames.push({kind:phase.kind,calls:this.paint()});}guideTime=t;this.paint();return frames;},
 keys(){return DEVICE_GUIDES.map(d=>d.key);},
 snapshot(){return JSON.stringify({st,view,anim,save:localStorage.getItem(STORE_KEY)});}
};
`;
const report={baseline:'042932c',physicalAndroid:false,checks:[],errors:[]};
async function chooseGuide(page,index,steps=false){
 if(await page.locator('#guideSelect').count()){
  await page.locator('#guideSelect').selectOption(String(index));
  if(steps)await page.locator('#guideDetailsToggle').click();
 }else await page.locator(`#guideTabs [data-guide="${index}"]`).click();
}
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  for(const name of ['before','after']){
   const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage();
   page.on('pageerror',e=>report.errors.push(e.message));
   const url=`http://localhost:5182/outputs/qa/board-art/${name}.html`,html=fs.readFileSync(path.join(root,'outputs/qa/board-art',name+'.html'),'utf8').replace('const boot = () =>',probe+'\nconst boot = () =>');
   await page.route(url,r=>r.fulfill({contentType:'text/html',body:html}));await page.goto(url);await page.locator('#launchScreen').waitFor({state:'hidden'});
   await page.locator('#titleSettingsBtn').click();await page.locator('#deviceGuideBtn').click();const keys=await page.evaluate(()=>guideArtQA.keys());
   for(let i=0;i<keys.length;i++){
    await chooseGuide(page,i,true);
    const frames=await page.evaluate(()=>guideArtQA.phases());
    const calls=frames.flatMap(f=>f.calls);if(name==='after')assert(calls.every(c=>c.raised),'guide must use raised devices: '+keys[i]);
    while(!await page.locator('#guideNext').isDisabled())await page.locator('#guideNext').click();
    assert((await page.locator('#guideCaption').textContent()).length>0);
    if(['gate','boat','crate'].includes(keys[i])){
     await chooseGuide(page,i);await page.waitForTimeout(150);await page.evaluate(()=>guideArtQA.paint());
     await page.locator('#guideDemo').screenshot({path:path.join(out,`guide-${name}-${keys[i]}.png`)});
    }
   }
   if(name==='after'){
    const icons=await page.evaluate(()=>guideArtQA.legend());assert.equal(icons.length,6);assert(icons.every(c=>c.raised));
    report.checks.push('All eight guides render and step through real demo phases; six device renderers and help icons receive the oblique style');
    await page.locator('#guideToggle').click();await page.waitForTimeout(200);await page.locator('#guideToggle').click();await page.locator('#guideClose').click();
    if(await page.locator('#settingsOverlay').isVisible())await page.locator('#settingsDone').click();
    await page.evaluate(()=>boardQA.load(59));const before=await page.evaluate(()=>guideArtQA.snapshot());
    await page.locator('#settingsBtn').click();await page.locator('#deviceGuideBtn').click();await page.evaluate(()=>guideArtQA.phases());
    assert.equal(await page.evaluate(()=>guideArtQA.snapshot()),before,'example replay must not mutate the active game');
    await page.locator('#guideClose').click();if(await page.locator('#settingsOverlay').isVisible())await page.locator('#settingsDone').click();
    await page.locator('#settingsBtn').click();await page.locator('[data-canal-view=top]').click();await page.locator('#settingsDone').click();await page.locator('#backBtn').click();
    await page.locator('#titleSettingsBtn').click();await page.locator('#deviceGuideBtn').click();
    for(let i=0;i<keys.length;i++){
     await chooseGuide(page,i,true);const calls=await page.evaluate(()=>guideArtQA.phases().flatMap(f=>f.calls));assert(calls.every(c=>!c.raised));
    }
    const topIcons=await page.evaluate(()=>guideArtQA.legend());assert(topIcons.every(c=>!c.raised));
    await page.setViewportSize({width:320,height:568});await page.evaluate(()=>document.documentElement.style.fontSize='200%');
    await page.locator('#guideNext').click();await page.locator('#guideClose').click();
    report.checks.push('Examples leave active game/save state unchanged, follow the saved top view, and remain operable at 320px with 200% root text');
   }
   await context.close();
  }
  const page=await browser.newPage({viewport:{width:820,height:920},deviceScaleFactor:1}),image=name=>'data:image/png;base64,'+fs.readFileSync(path.join(out,name)).toString('base64');
  await page.setContent('<meta charset="utf-8"><style>body{margin:0;padding:24px;background:#edf8f5;color:#215362;font:16px system-ui}h1{font-size:24px}main{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}figcaption{padding:10px}img{width:100%;display:block}</style><h1>장애물 예시 · 변경된 그래픽 적용</h1><main><b>변경 전</b><b>변경 후</b>'+[['boat','구조정'],['gate','스위치·수문'],['crate','상자']].map(([k,l])=>['before','after'].map(n=>'<figure><figcaption>'+l+'</figcaption><img src="'+image(`guide-${n}-${k}.png`)+'"></figure>').join('')).join('')+'</main>');
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await page.screenshot({path:path.join(out,'guide-comparison.png'),fullPage:true});
  assert.deepEqual(report.errors,[]);report.success=true;
 }finally{fs.writeFileSync(path.join(out,'guide-results.json'),JSON.stringify(report,null,2)+'\n');console.log(report);await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
