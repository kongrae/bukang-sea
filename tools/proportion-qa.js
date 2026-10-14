// Run board-art-qa.js <playwright> fc1fb50 capture/all first. Probes stay in isolated QA pages.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright');
const root=path.join(__dirname,'..'),out=path.join(root,'outputs/qa/proportions');fs.mkdirSync(out,{recursive:true});
const probe=`
let lastSharkProjection=null;
const originalDrawShark=drawShark;
drawShark=function(...args){lastSharkProjection=args[10]??1;return originalDrawShark(...args);};
window.proportionQA={
 async ready(){
  save.owned=SKINS.map(s=>s.id);
  await Promise.all(SKINS.map(s=>SHARK_ART.ready('swim',s)));
  await Promise.all(SKINS.filter(s=>SHARK_ART.hasOblique(s)).flatMap(s=>['R','D','L','U'].map(d=>SHARK_ART.ready('oblique'+d,s))));
  return SKINS.map(s=>s.id);
 },
 select(id){save.skin=id;lastSharkProjection=null;draw(0);return lastSharkProjection;},
 sprite(id,direction,projected=true,kind='shark'){
  const oldSkin=save.skin,oldView={...view},skin=SKINS.find(s=>s.id===id),angle={R:0,D:Math.PI/2,L:Math.PI,U:-Math.PI/2}[direction];
  save.skin=id;view.ang=view.target=angle;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const c=canvas.getContext('2d'),q=projected?boardProjection():1;
  c.setTransform(1,0,0,q,128,128);const before=c.getTransform().toString();
  if(kind==='shark'){
   if(!projected||!drawObliqueShark(c,0,0,128,1,1))drawShark(c,0,0,angle,128,0,false,1,1,skin,q);
  }else if(kind==='boat')drawBoat(c,0,0,128,0,Math.PI/2,false,projected);
  else if(kind==='crate')drawCrate(c,-64,-64,128,0,0,projected);
  else if(kind==='buoy')drawBuoy(c,0,0,128,0,projected);
  save.skin=oldSkin;Object.assign(view,oldView);
  const data=c.getImageData(0,0,256,256).data;let left=256,top=256,right=0,bottom=0;
  for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(data[(y*256+x)*4+3]>120){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  return {url:canvas.toDataURL(),width:right-left+1,height:bottom-top+1,bounds:[left,top,right,bottom],balanced:before===c.getTransform().toString()&&c.globalAlpha===1};
 },
 occlusion(){
  boardQA.paint();const canvas=document.createElement('canvas');canvas.width=cvs.width;canvas.height=cvs.height;
  const c=canvas.getContext('2d'),q=boardProjection(),offset=CH*(1-q)/2;
  c.setTransform(dpr,0,0,dpr*q,OX*dpr,(offset+OY*q)*dpr);c.drawImage(quayForeground,-OX,staticTop-OY,CW,staticHeight);
  const expected=c.getImageData(0,0,canvas.width,canvas.height).data,actual=ctx.getImageData(0,0,canvas.width,canvas.height).data;let bad=0,checked=0;
  for(let i=0;i<expected.length;i+=4)if(expected[i+3]===255){checked++;if([0,1,2].some(k=>Math.abs(expected[i+k]-actual[i+k])>3))bad++;}
  return {checked,bad};
 }
};
`;
const report={baseline:'fc1fb50',browser:'Edge mobile emulation',physicalAndroid:false,checks:[],samples:[],layouts:[],errors:[]};
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const capture={},flat={};
 try{
  for(const name of ['before','after']){
   const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
   const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
   const url='http://localhost:5182/outputs/qa/board-art/'+name+'.html';
   const html=fs.readFileSync(path.join(root,'outputs/qa/board-art',name+'.html'),'utf8').replace('const boot = () =>',probe+'\nconst boot = () =>');
   await page.route(url,r=>r.fulfill({contentType:'text/html',body:html}));await page.goto(url);await page.locator('#launchScreen').waitFor({state:'hidden'});
   const skins=await page.evaluate(()=>proportionQA.ready());await page.evaluate(()=>boardQA.load(0));flat[name]=[];capture[name]={};
   for(const id of skins){
    const projection=await page.evaluate(id=>proportionQA.select(id),id);
    if(name==='after'&&!['basic','lighthouse'].includes(id))assert.equal(projection,.88,'real scene must pass its projection to every fallback skin');
    for(const direction of ['R','D','L','U']){
     const pair=await page.evaluate(({id,direction})=>({flat:proportionQA.sprite(id,direction,false),raised:proportionQA.sprite(id,direction,true)}),{id,direction});
     assert(pair.flat.balanced&&pair.raised.balanced);flat[name].push(pair.flat.url);
     const {url,...bounds}=pair.raised;report.samples.push({name,id,direction,...bounds});
     if(name==='after'&&!['basic','lighthouse'].includes(id)){
      assert(Math.abs(pair.flat.width-pair.raised.width)<=1);assert(Math.abs(pair.flat.height-pair.raised.height)<=1,'skin must retain its silhouette in every heading');
     }
     if(direction==='R'&&['basic','coral'].includes(id))capture[name][id]=pair.raised.url;
    }
   }
   for(const kind of ['boat','crate','buoy']){
    const result=await page.evaluate(kind=>proportionQA.sprite('basic','R',true,kind),kind);assert(result.balanced);capture[name][kind]=result.url;
   }
   await page.evaluate(()=>proportionQA.select('basic'));
   for(const index of [0,59]){
    await page.evaluate(i=>boardQA.load(i),index);await page.waitForTimeout(120);await page.evaluate(()=>boardQA.paint());
    await page.screenshot({path:path.join(out,name+'-'+(index===0?1:72)+'.png')});
   }
   for(const [width,height] of [[320,568],[390,844]]){
    await page.setViewportSize({width,height});await page.evaluate(()=>boardQA.load(59));await page.waitForTimeout(120);
    const d=await page.evaluate(()=>boardQA.dims());report.layouts.push({name,width,height,...d});
    const top=d.height*(1-d.projection)/2+d.oy*d.projection,bottom=top+d.h*d.tile*d.projection;
    assert(top>=-1&&bottom<=d.height+1,'entire projected board fits');
   }
   if(name==='after'){
    await page.setViewportSize({width:390,height:844});
    for(let index=0;index<84;index++){
     await page.evaluate(i=>boardQA.load(i),index);const r=await page.evaluate(()=>proportionQA.occlusion());assert(r.checked>0&&r.bad===0,'foreground remains correct: '+index);
    }
    report.checks.push('All 84 maps retain the foreground-quay occlusion after changing the camera ratio');
    const failed=html.replace(/data:image\/webp;base64,[A-Za-z0-9+/=]+/g,'data:image/webp;base64,AAAA');
    await page.unroute(url);await page.route(url,r=>r.fulfill({contentType:'text/html',body:failed}));await page.reload();await page.locator('#launchScreen').waitFor({state:'hidden'});
    await page.evaluate(()=>proportionQA.ready());await page.evaluate(()=>boardQA.load(0));
    for(const direction of ['R','D','L','U']){
     const pair=await page.evaluate(direction=>({flat:proportionQA.sprite('basic',direction,false),raised:proportionQA.sprite('basic',direction,true)}),direction);
     assert.equal(pair.flat.width,pair.raised.width);assert.equal(pair.flat.height,pair.raised.height);assert(pair.raised.width>20);
    }
    report.checks.push('All-image failure keeps the Canvas fallback visible and undistorted in all four headings');
   }
   await context.close();
  }
  assert.deepEqual(flat.before,flat.after);report.checks.push('All nine top-view skins are pixel-identical to the baseline across four directions');
  report.checks.push('Seven skins without directional art retain their top-view aspect ratio in oblique view; existing directional art keeps its compensation');
  assert.deepEqual(report.errors,[]);
  const page=await browser.newPage({viewport:{width:820,height:920},deviceScaleFactor:1});
  const style='<meta charset="utf-8"><style>body{margin:0;padding:24px;background:#edf8f5;color:#215362;font:16px system-ui}h1{font-size:23px}main{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}figcaption{padding:10px;font-weight:700}img{display:block;width:100%}</style>';
  const data=file=>'data:image/png;base64,'+fs.readFileSync(path.join(out,file)).toString('base64');
  for(const number of [1,72]){
   await page.setContent(style+'<h1>수로 '+number+' · 세로 비율 조정</h1><main>'+['before','after'].map(n=>'<figure><figcaption>'+(n==='before'?'변경 전 · 78%':'변경 후 · 88%')+'</figcaption><img src="'+data(n+'-'+number+'.png')+'"></figure>').join('')+'</main>');
   await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await page.screenshot({path:path.join(out,'comparison-'+number+'.png'),fullPage:true});
  }
  await page.setContent(style+'<h1>상어와 장치 · 같은 크기에서 비율 비교</h1><main><b>변경 전</b><b>변경 후</b>'+[['coral','산호 스킨'],['basic','기본 입체 스킨'],['boat','구조정'],['crate','상자'],['buoy','부표']].map(([key,label])=>['before','after'].map(n=>'<figure><figcaption>'+label+'</figcaption><img style="background:#299caf;max-height:220px;object-fit:contain" src="'+capture[n][key]+'"></figure>').join('')).join('')+'</main>');
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await page.screenshot({path:path.join(out,'silhouettes.png'),fullPage:true});report.success=true;
 }finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');console.log({...report,samples:report.samples.length});await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
