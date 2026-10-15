// Compare real DOM layouts using the existing isolated result fixtures; no production QA hooks.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {out,build,chromium}=require('./result-polish-qa');
const sharp=require(path.join(path.dirname(process.argv[2]),'sharp'));
const dest=path.resolve('docs/result-simple'),baseline='2d99c71';
async function main(){
 build('before',baseline);build('after');fs.mkdirSync(dest,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const report={baseline,physicalAndroid:false,checks:[],errors:[]};
 try{
  for(const side of ['before','after']){
   const p=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
   p.on('pageerror',e=>report.errors.push(e.message));
   await p.goto(`http://127.0.0.1:5182/outputs/qa/result-polish/${side}.html`);await p.locator('#launchScreen').waitFor({state:'hidden'});
   for(const reward of [false,true]){
    await p.evaluate(reward=>{if(reward)resultQA.reward();else resultQA.enter(2);resultQA.finish(3);},reward);
    await p.locator('#clearOverlay').waitFor({state:'visible'});await p.waitForTimeout(1200);
    const kind=reward?'reward':'result';
    await p.screenshot({path:path.join(dest,`${side}-${kind}.png`)});
    const metrics=await p.locator('#clearOverlay .clear-card').evaluate(el=>({height:el.getBoundingClientRect().height,bodyHeight:document.getElementById('clearBody').clientHeight,bodyScroll:document.getElementById('clearBody').scrollHeight}));
    report.checks.push({side,kind,...metrics});
    if(side==='after'){
     assert.ok(metrics.height<(reward?600:390),'compact regular and reward results at 390x844');
     assert.ok(metrics.bodyScroll<=metrics.bodyHeight+1,'no unnecessary body scroll at normal size');
     assert.equal(await p.locator('#clearStars .on').count(),3);
     assert.equal(await p.locator('#clearStars').getAttribute('aria-label'),'별 3개');
     if(reward){
      assert.ok(await p.locator('#clearChapterStamp').isVisible());assert.ok(await p.locator('#clearUnlocks').isVisible());
      await p.locator('#clearUnlocks [data-wear]').click();assert.equal((await p.evaluate(()=>resultQA.state())).save.skin,'sakura');
      assert.equal(await p.locator('#clearUnlocks [data-wear]').textContent(),'입었어요');
     }
    }
   }
   if(side==='after'){
    for(const [width,height] of [[320,568],[390,844],[844,390]]){
     await p.setViewportSize({width,height});
     if(width===320)await p.evaluate(()=>{for(const el of document.querySelectorAll('#clearOverlay h3,#clearOverlay p,#clearOverlay li span,#clearOverlay strong,#clearOverlay small,#clearOverlay button'))el.style.fontSize=(parseFloat(getComputedStyle(el).fontSize)*2)+'px';});
     await p.locator('#clearUnlocks [data-wear]').scrollIntoViewIfNeeded();
     const sizes=await p.evaluate(()=>{const body=document.getElementById('clearBody'),buttons=[...document.querySelectorAll('#clearOverlay button')];return {width:innerWidth,height:innerHeight,scrollWidth:body.scrollWidth,clientWidth:body.clientWidth,buttons:buttons.map(el=>{const b=el.getBoundingClientRect();return {id:el.id||el.dataset.wear,left:b.left,right:b.right,height:b.height,top:b.top,bottom:b.bottom};})};});
     assert.ok(sizes.scrollWidth<=sizes.clientWidth+1,JSON.stringify(sizes));
     assert.ok(sizes.buttons.every(b=>b.height>=44&&b.left>=0&&b.right<=width+1&&b.top>=0&&b.bottom<=height+1),JSON.stringify(sizes));
     report.checks.push({enlargedText:true,...sizes});await p.screenshot({path:path.join(dest,`enlarged-${width}.png`)});
    }
   }
   await p.close();
  }
  for(const kind of ['result','reward']){
   const parts=[];
   for(const [i,side] of ['before','after'].entries())parts.push({input:await sharp(path.join(dest,`${side}-${kind}.png`)).resize({width:390}).png().toBuffer(),left:i*406,top:38});
   const label=Buffer.from('<svg width="796" height="38"><style>text{font:16px sans-serif;fill:#205b6d}</style><text x="12" y="25">BEFORE</text><text x="418" y="25">AFTER</text></svg>');
   await sharp({create:{width:796,height:882,channels:4,background:'#e8f8f5'}}).composite([...parts,{input:label,left:0,top:0}]).png().toFile(path.join(dest,kind+'-comparison.png'));
  }
  assert.deepEqual(report.errors,[]);report.success=true;
 }catch(e){report.failure=e.stack;throw e;}finally{await browser.close();fs.writeFileSync(path.join(dest,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
