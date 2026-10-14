// Run board-art-qa.js <playwright> de442d7 capture/all first. Uses its isolated real-game pages.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright');
const {LEVELS,STORY_POSITION}=require('../src/levels');
const root=path.join(__dirname,'..'),out=path.join(root,'outputs/qa/board-space');fs.mkdirSync(out,{recursive:true});
const probe=`
window.spaceQA = {
  pixels() {
    boardQA.paint();
    const canvas=document.createElement('canvas');canvas.width=cvs.width;canvas.height=cvs.height;
    const c=canvas.getContext('2d'),q=boardProjection(),offset=CH*(1-q)/2;
    const top=typeof staticTop==='undefined'?0:staticTop,height=typeof staticHeight==='undefined'?CH:staticHeight;
    c.setTransform(dpr,0,0,dpr*q,OX*dpr,(offset+OY*q)*dpr);
    if(typeof quayForeground!=='undefined'&&quayForeground)c.drawImage(quayForeground,-OX,top-OY,CW,height);
    else {
      c.beginPath();
      for(let y=0;y<=g.h;y++)for(let x=0;x<g.w;x++)if(isLand(x,y)&&!isLand(x,y-1))c.rect(x*T,(y-.23)*T,T,.23*T);
      c.clip();c.drawImage(staticLayer,-OX,-OY,CW,CH);
    }
    const target=c.getImageData(0,0,canvas.width,canvas.height).data,actual=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let mismatched=0,checked=0;
    for(let i=0;i<target.length;i+=4)if(target[i+3]===255){checked++;if([0,1,2].some(k=>Math.abs(target[i+k]-actual[i+k])>3))mismatched++;}
    return {checked,mismatched};
  },
  feedback() { setTip('그물은 비어 있는 물 위에만 칠 수 있어요.'); },
};
`;
const report={baseline:'de442d7',browser:'Edge mobile emulation',physicalAndroid:false,checks:[],layouts:{},occlusion:[],errors:[]};
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try {
    for(const name of ['before','after']){
      const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
      const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
      const url='http://localhost:5182/outputs/qa/board-art/'+name+'.html';
      const html=fs.readFileSync(path.join(root,'outputs/qa/board-art',name+'.html'),'utf8').replace('const boot = () =>',probe+'\nconst boot = () =>');
      await page.route(url,r=>r.fulfill({contentType:'text/html',body:html}));await page.goto(url);await page.locator('#launchScreen').waitFor({state:'hidden'});
      for(const index of name==='after'?LEVELS.map((_,i)=>i):[1,2,78]){
        await page.evaluate(i=>boardQA.load(i),index);
        const pixels=await page.evaluate(()=>spaceQA.pixels());report.occlusion.push({name,number:STORY_POSITION[index]+1,...pixels});
        if(name==='after'){assert(pixels.checked>0);assert.equal(pixels.mismatched,0,'foreground quay must cover rear objects: '+index);}
      }
      for(const [width,height] of [[390,844],[320,568]]){
        await page.setViewportSize({width,height});await page.evaluate(()=>boardQA.load(59));await page.waitForTimeout(120);
        report.layouts[name+'-'+width]=await page.evaluate(()=>({...boardQA.dims(),boardHeight:document.querySelector('#board').getBoundingClientRect().height}));
      }
      await page.setViewportSize({width:390,height:844});
      for(const index of [1,2,59,78]){
        await page.evaluate(i=>boardQA.load(i),index);await page.waitForTimeout(120);
        await page.screenshot({path:path.join(out,`${name}-${STORY_POSITION[index]+1}.png`)});
      }
      if(name==='after'){
        assert.equal(await page.locator('#gameScreen > .tip, #gameScreen > .canal-view').count(),0);
        assert.equal(await page.locator('#boardNotice').isVisible(),false);
        await page.locator('#settingsBtn').click();await page.locator('[data-canal-view=top]').click();await page.locator('[data-canal-view=oblique]').click();
        await page.screenshot({path:path.join(out,'settings.png')});await page.locator('#settingsDone').click();
        const saved=await page.evaluate(()=>boardQA.saved()),height=await page.locator('#board').evaluate(el=>el.getBoundingClientRect().height);
        await page.evaluate(()=>spaceQA.feedback());assert.equal(await page.locator('#boardNotice').isVisible(),true);
        await page.locator('#tip').click();assert.equal(await page.evaluate(()=>boardQA.saved()),saved,'notice text must not install a net or move');
        assert.equal(await page.locator('#board').evaluate(el=>el.getBoundingClientRect().height),height);
        await page.locator('#tipDismiss').click();assert.equal(await page.locator('#boardNotice').isVisible(),false);
        await page.locator('#hintBtn').click();await page.waitForFunction(()=>document.querySelector('#tip').textContent.startsWith('힌트:'));
        assert.equal(await page.locator('#boardNotice').isVisible(),true);await page.screenshot({path:path.join(out,'hint.png')});
        await page.keyboard.press('ArrowUp');await page.evaluate(()=>boardQA.settle());assert.equal(await page.locator('#boardNotice').isVisible(),false);
        await page.evaluate(()=>spaceQA.feedback());await page.evaluate(()=>document.documentElement.style.fontSize='200%');await page.setViewportSize({width:320,height:568});
        await page.locator('#tipDismiss').click();assert.equal(await page.locator('#boardNotice').isVisible(),false);
        report.checks.push('No stage-description/camera rows in gameplay; settings retains both views; hint/error feedback stays visible, dismissible and does not change board size or consume input');
      }
      await context.close();
    }
    assert(report.occlusion.filter(x=>x.name==='before').every(x=>x.mismatched>0));
    assert(report.layouts['after-390'].boardHeight>report.layouts['before-390'].boardHeight+80);
    assert(report.layouts['after-320'].tile>report.layouts['before-320'].tile);
    report.checks.push('Previously overlapping canals 2/3/79 reproduced; all 84 current maps preserve exact opaque foreground-stone pixels');
    report.checks.push('390px board gains more than 80px height; 320px dense canal also gains tile size without cropping the projected board');
    const p=await browser.newPage({viewport:{width:820,height:900},deviceScaleFactor:1});
    const data=file=>'data:image/png;base64,'+fs.readFileSync(path.join(out,file)).toString('base64');
    await p.setContent('<meta charset="utf-8"><style>body{margin:0;padding:22px;background:#edf8f5;color:#215362;font:16px system-ui}h1{font-size:22px}main{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}figcaption{padding:8px;font-weight:700}img{width:100%;display:block}</style><h1>수로 2 · 겹침 수정과 게임판 확대</h1><main><figure><figcaption>변경 전</figcaption><img src="'+data('before-2.png')+'"></figure><figure><figcaption>변경 후</figcaption><img src="'+data('after-2.png')+'"></figure></main>');
    await p.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await p.screenshot({path:path.join(out,'comparison.png'),fullPage:true});
    assert.deepEqual(report.errors,[]);report.success=true;
  } finally {fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');console.log({...report,occlusion:report.occlusion.length});await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
