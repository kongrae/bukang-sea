// Visual comparison via actual controls and a real first-canal solution; isolated saves only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
process.env.HOME_QA_BASELINE||='7a2a9ab';process.env.HOME_QA_NAME||='ui-depth';
const {build,out,docs,key,ready}=require('./home-simple-qa');
const {chromium}=require(process.argv[2]||'playwright');
const sharp=require(path.join(path.dirname(process.argv[2]),'sharp'));
const E=require('../src/engine'),{LEVELS}=require('../src/levels');
const screens=['settings','guide','free','map','skins','daily','journal','game','result'];
async function main(){
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const report={baseline:process.env.HOME_QA_BASELINE,checks:[],errors:[],physicalAndroid:false};fs.mkdirSync(docs,{recursive:true});
 try{
  for(const side of ['before','after']){
   build(side);
   const p=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
   p.on('pageerror',e=>report.errors.push(e.message));
   await p.goto('http://127.0.0.1:5182/outputs/qa/'+process.env.HOME_QA_NAME+'/'+side+'.html');await ready(p);
   const shot=name=>p.screenshot({path:path.join(out,side+'-'+name+'.png')});
   const surfaces=async(selector)=>{
    const items=await p.locator(selector).evaluateAll(els=>els.filter(el=>el.getBoundingClientRect().height>0).map(el=>({id:el.id||el.textContent.trim(),height:el.getBoundingClientRect().height,fill:getComputedStyle(el).backgroundImage,edge:getComputedStyle(el).borderTopWidth,shadow:getComputedStyle(el).boxShadow})));
    assert.ok(items.length>0,selector);for(const item of items){assert.ok(item.height>=44,item.id);assert.notEqual(item.fill,'none',item.id+' has a visible surface');assert.notEqual(item.shadow,'none',item.id+' has depth');}
   };
   await shot('home');
   if(side==='after'){
    await surfaces('#titleScreen button:not([hidden])');
    const button=p.locator('#dailyBtn'),r=await button.boundingBox(),rest=await button.evaluate(el=>getComputedStyle(el).boxShadow);
    await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();
    assert.notEqual(await button.evaluate(el=>getComputedStyle(el).boxShadow),rest);await shot('pressed');await p.mouse.up();await p.locator('#dailyOverlay').waitFor({state:'visible'});await p.keyboard.press('Escape');await p.locator('#dailyOverlay').waitFor({state:'hidden'});
   }
   for(const [button,sheet,name] of [['titleSettingsBtn','settingsOverlay','settings'],['freeBtn','freeOverlay','free'],['stagePicker','mapOverlay','map'],['skinBtn','skinsOverlay','skins'],['dailyBtn','dailyOverlay','daily'],['journalBtn','journalOverlay','journal']]){
    await p.locator('#'+button).click();await p.locator('#'+sheet).waitFor({state:'visible'});await shot(name);
    if(side==='after')await surfaces('#'+sheet+' .btn:not(:disabled),#'+sheet+' .icon-btn');
    if(name==='settings'){
     await p.locator('#deviceGuideBtn').click();await p.locator('#guideOverlay').waitFor({state:'visible'});await shot('guide');
     if(side==='after'){
      await surfaces('#guideOverlay .btn,#guideSelect');
      await p.locator('#guideDetailsToggle').click();await p.locator('#guideDetails').waitFor({state:'visible'});await p.locator('#guideDetailsToggle').click();
      await p.locator('#guideSelect').selectOption({index:1});
     }
     await p.locator('#guideClose').click();await p.locator('#guideOverlay').waitFor({state:'hidden'});
    }
    await p.keyboard.press('Escape');await p.locator('#'+sheet).waitFor({state:'hidden'});
   }
   await p.locator('#playBtn').click();await p.locator('#gameScreen').waitFor({state:'visible'});await shot('game');
   if(side==='after')await surfaces('#gameScreen .ctrl:not(:disabled),#gameScreen .topbar .icon-btn');
   const g=E.parseLevel(LEVELS[0]),route=E.plan(g,g.start,0,new Set(),g.nets,true);
   for(const step of route.steps){await p.keyboard.press({U:'ArrowUp',D:'ArrowDown',L:'ArrowLeft',R:'ArrowRight'}[step.dir]);await p.waitForTimeout(850);}
   await p.locator('#clearOverlay').waitFor({state:'visible'});await shot('result');
   assert.equal(await p.locator('#clearStars .on').count(),3);assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).best[0],key(side)),3);
   if(side==='after'){
    await surfaces('#clearOverlay .btn');
    for(const [width,height]of [[320,568],[844,390]]){
     await p.setViewportSize({width,height});await shot('result-'+width);
     const boxes=await p.locator('#clearOverlay .clear-actions button').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,height:r.height};}));
     assert.ok(boxes.every(r=>r.x>=0&&r.right<=width+1&&r.y>=0&&r.bottom<=height+1&&r.height>=44));
    }
    await p.locator('#nextBtn').click();await p.locator('#clearOverlay').waitFor({state:'hidden'});await p.locator('#gameScreen').waitFor({state:'visible'});
    report.checks.push('Visible button surfaces, actual press, seven sheets/guide controls, actual first-canal solution, saved stars and next action; result buttons fit small and landscape screens');
   }
   await p.close();
  }
  for(const name of ['home',...screens]){
   const parts=[];for(const [i,side]of ['before','after'].entries())parts.push({input:await sharp(path.join(out,side+'-'+name+'.png')).resize({width:390}).png().toBuffer(),left:i*406,top:30});
   const label=Buffer.from('<svg width="796" height="30"><text x="12" y="22" style="font:14px sans-serif;fill:#205b6d">BEFORE</text><text x="418" y="22" style="font:14px sans-serif;fill:#205b6d">AFTER</text></svg>');
   await sharp({create:{width:796,height:874,channels:4,background:'#e8f8f5'}}).composite([...parts,{input:label,left:0,top:0}]).png().toFile(path.join(docs,name+'-comparison.png'));
  }
  assert.deepEqual(report.errors,[]);report.success=true;
 }catch(e){report.failure=e.stack;throw e;}finally{await browser.close();fs.writeFileSync(path.join(out,'surfaces-report.json'),JSON.stringify(report,null,2));if(report.success)fs.copyFileSync(path.join(out,'surfaces-report.json'),path.join(docs,'surfaces-report.json'));console.log(JSON.stringify(report));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
