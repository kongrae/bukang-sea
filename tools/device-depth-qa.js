// Run board-art-qa.js <playwright> 5caa2ef capture/check/devices first to build the two isolated production pages.
// This probe calls the real drawing functions; it never ships in www or changes a game rule.
// For buoy/switch/jet: build board-art QA pages with a3843ab, then pass water as the third argument.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright');
const water=process.argv[3]==='water';
const root=path.join(__dirname,'..'),out=path.join(root,'outputs/qa',water?'water-device-depth':'device-depth');fs.mkdirSync(out,{recursive:true});
const probe=`
window.depthArt = (kind, options={}) => {
  const {raised=true,angle=Math.PI/2,open=0,axis='V',arrow=false,time=0,dir='R',on=false,press=0,flash=0}=options;
  const motionBefore=reduceMotion;if(options.motion)reduceMotion=false;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const context=canvas.getContext('2d'),q=raised?.78:1,size=128;
  context.setTransform(1,0,0,q,128,128);const before=context.getTransform().toString();
  if(kind==='boat')drawBoat(context,0,0,size,time,angle,arrow,raised);
  if(kind==='crate')drawCrate(context,-size/2,-size/2,size,time,0,raised);
  if(kind==='gate')drawGate(context,-size/2,-size/2,size,open,axis,0,raised);
  if(kind==='buoy')drawBuoy(context,0,0,size,time,raised);
  if(kind==='switch')drawSwitch(context,-size/2,-size/2,size,on,press,raised);
  if(kind==='jet')drawJet(context,-size/2,-size/2,size,dir,time,flash,raised);
  reduceMotion=motionBefore;
  const data=context.getImageData(0,0,256,256).data;
  let orange=0,minX=256,minY=256,maxX=0,maxY=0;
  for(let y=0;y<256;y++)for(let x=0;x<256;x++) {
    const i=(y*256+x)*4;if(!data[i+3])continue;
    minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    if(data[i]>data[i+1]*1.2&&data[i+1]>data[i+2]*1.2&&data[i+3]>200)orange++;
  }
  const tipX=Math.round(128+Math.sin(angle)*size*.55),tipY=Math.round(128-Math.cos(angle)*size*.55*q);
  let arrowPixels=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)arrowPixels+=data[((tipY+dy)*256+tipX+dx)*4+3]>100?1:0;
  const pixel=(x,y)=>{const i=(Math.round(128+y*size*q)*256+Math.round(128+x*size))*4;return Array.from(data.slice(i,i+4));};
  const arrowAt=(x,y)=>{const a=ANG[dir];return pixel(x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)-.081);};
  const arrowSamples=[[.12,-.10],[.12,.10],[-.12,-.10],[-.12,.10],[0,0]].map(([x,y])=>arrowAt(x,y));
  return {url:canvas.toDataURL(),orange,centre:data[(128*256+128)*4+3],hole:pixel(0,-.12)[3],arrowSamples,bounds:[minX,minY,maxX,maxY],arrowPixels,balanced:before===context.getTransform().toString()&&context.globalAlpha===1};
};
window.depthArtReady = () => ['gateOpen','gateClosed','switchOff','switchOn'].every(key=>!!BOARD_ART.get(key));
`;
const report={baseline:water?'a3843ab':'5caa2ef',browser:'Edge Canvas and mobile emulation',physicalAndroid:false,checks:[],errors:[]};
const samples=water ? [['buoy','buoy',{}],['off','switch',{}],['on','switch',{on:true}],...['R','D','L','U'].map(dir=>['jet-'+dir,'jet',{dir}])] : [['boat','boat',{}],['crate','crate',{}],['gate','gate',{}],['open','gate',{open:1}],['horizontal','gate',{axis:'H'}],['horizontal-open','gate',{axis:'H',open:1}]];
const canals=water?[[59,72]]:[[59,72],[83,84]];
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try {
    const captures={},flat={};
    for(const name of ['before','after']){
      const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:'reduce',serviceWorkers:'block'});
      const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
      const url=`http://localhost:5182/outputs/qa/board-art/${name}.html`;
      const html=fs.readFileSync(path.join(root,'outputs/qa/board-art',name+'.html'),'utf8').replace('const boot = () =>',probe+'\nconst boot = () =>');
      await page.route(url,r=>r.fulfill({contentType:'text/html',body:html}));await page.goto(url);
      await page.locator('#launchScreen').waitFor({state:'hidden'});await page.waitForFunction(()=>depthArtReady());
      const sample=(kind,options)=>page.evaluate(({kind,options})=>depthArt(kind,options),{kind,options});
      captures[name]={};flat[name]=[];
      for(const [id,kind,options] of samples){
        const result=await sample(kind,options);assert(result.balanced);
        assert(result.bounds.every((v,i)=>i<2?v>=24:v<=232),'device must not obscure an adjacent cell centre');
        captures[name][id]=result.url;
        flat[name].push((await sample(kind,{...options,raised:false})).url);
        if(name==='after')assert.equal((await sample(kind,{...options,time:7})).url,result.url,'reduced motion is static');
      }
      if(name==='after'&&water){
        const buoy=await sample('buoy',{}),off=await sample('switch',{}),on=await sample('switch',{on:true});
        assert(buoy.hole<=80,'buoy opening shows water, with at most the translucent cast shadow');
        assert(off.hole>200&&on.hole>200,'switch stays solid, distinct from the buoy');
        assert(off.bounds[1]+8<on.bounds[1],'inactive button is visibly taller than pressed button');
        assert(off.orange>on.orange,'orange inactive and mint active states remain distinct');
        for(const active of [false,true])for(const press of [0,.25,.5,.75,1]){
          const result=await sample('switch',{on:active,press,motion:true});assert(result.balanced);assert(result.hole>200);
        }
        const cream=p=>p[0]===255&&p[1]===244&&p[2]===213&&p[3]===255;
        for(const dir of ['R','D','L','U']){
          const initial=await sample('jet',{dir});
          assert(initial.arrowSamples.slice(0,2).every(cream),'arrow head points in the intended direction: '+dir);
          assert(initial.arrowSamples.slice(2,4).every(p=>!cream(p)),'opposite side stays narrow: '+dir);
          for(const time of [0,.2,.7,7])for(const flash of [0,1]){
            const current=await sample('jet',{dir,time,flash,motion:true});
            assert.deepEqual(current.arrowSamples.filter((_,i)=>i<2||i===4),initial.arrowSamples.filter((_,i)=>i<2||i===4),'arrow remains opaque and fixed during water motion and activation');
          }
        }
        report.checks.push('Buoy opening shows water through its translucent shadow; switch is solid, lower when active, and retains distinct colour and symbol states');
        report.checks.push('Both switch states render throughout the existing press phase without leaking Canvas state');
        report.checks.push('All four jet directions retain a fixed opaque arrow during normal water motion and activation flashes');
      }
      if(name==='after'){
        for(const axis of ['V','H']){
          for(const open of [0,.25,.5,.75,1]){
            const result=await sample('gate',{axis,open});
            // Retraction exposes new end faces, so projected orange area need not decrease monotonically.
            if(open<1)assert(result.orange>0,'partly closed shutters remain visible');
            if(open===0)assert(result.centre>200,'closed gate visibly blocks the centre');
            if(open===1){assert.equal(result.centre,0,'fully open gate leaves the centre clear');assert.equal(result.orange,0,'no orange shutter remains across an open passage');}
          }
        }
        for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2]){
          const without=await sample('boat',{angle}),withArrow=await sample('boat',{angle,arrow:true});
          assert(withArrow.arrowPixels>without.arrowPixels,'next-direction chevron must remain ahead of the bow');
          flat[name].push((await sample('boat',{angle,raised:false,arrow:true})).url);
        }
        report.checks.push('Both gate axes: closed centre opaque, open centre clear, intermediate shutters visible and no shutter remains at fully open');
        report.checks.push('Four boat headings retain the forward arrow; all solids stay within their readable footprint and restore Canvas state');
      } else for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2])flat[name].push((await sample('boat',{angle,raised:false,arrow:true})).url);
      for(const [index,number] of canals){
        await page.evaluate(i=>boardQA.load(i),index);await page.waitForTimeout(200);
        await page.evaluate(()=>boardQA.camera('oblique'));
        await page.screenshot({path:path.join(out,`${name}-${number}.png`)});
      }
      await context.close();
    }
    assert.deepEqual(flat.after,flat.before);report.checks.push('Top view and guide defaults remain pixel-identical to the previous build ('+flat.after.length+' samples)');
    report.checks.push('Reduced-motion device pixels remain identical at t=0 and t=7');
    const page=await browser.newPage({viewport:{width:820,height:900},deviceScaleFactor:1});
    const rows=water?[['buoy','부표 · 속이 빈 튜브'],['off','스위치 · 올라온 버튼'],['on','스위치 · 눌린 버튼'],['jet-R','물줄기 · 낮은 수로']]:[['boat','구조정 · 선체와 객실'],['crate','빈 나무 상자 · 옆면과 안쪽'],['gate','수문 · 닫힘'],['open','수문 · 열림']];
    const footer=water?'부표의 빈 구멍, 스위치의 높이·색·기호, 물줄기의 고정 방향 화살표를 유지합니다.':'구조정의 흰색·주황 띠, 상자의 갈색 빈 내부, 수문의 주황 문과 열린 통로를 유지합니다.';
    const html=`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#edf8f5;color:#215362;font-family:system-ui}h1{margin:0;font-size:24px}p{font-size:13px;color:#607f88}main{display:grid;grid-template-columns:200px 1fr 1fr;gap:12px;align-items:center}b{font-size:16px}.label{font-size:14px;text-align:center}img{display:block;width:100%;background:#299caf;border-radius:18px}footer{font-size:12px;margin-top:20px;color:#607f88}</style><h1>입체 시점 · 장치 높이 개선</h1><p>실제 게임 그리기 함수 확대 비교 · 같은 시점과 상태</p><main><span></span><b class="label">변경 전</b><b class="label">변경 후</b>${rows.map(([id,label])=>`<b>${label}</b><img src="${captures.before[id]}"><img src="${captures.after[id]}">`).join('')}</main><footer>구조정의 흰색·주황 띠, 상자의 갈색 빈 내부, 수문의 주황 문과 열린 통로를 유지합니다.</footer>`;
    const detail=html.replace('구조정의 흰색·주황 띠, 상자의 갈색 빈 내부, 수문의 주황 문과 열린 통로를 유지합니다.',footer);
    fs.writeFileSync(path.join(out,'device-detail.html'),detail);await page.setContent(detail);await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
    await page.screenshot({path:path.join(out,'device-detail.png'),fullPage:true});
    for(const [,number] of canals){
      const image=name=>'data:image/png;base64,'+fs.readFileSync(path.join(out,`${name}-${number}.png`)).toString('base64');
      await page.setContent(`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#edf8f5;color:#215362;font-family:system-ui}h1{font-size:23px}p{font-size:13px}main{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}figcaption{padding:12px;font-weight:700}img{display:block;width:100%}</style><h1>수로 ${number} · ${number===72?'마지막 갑문':'물양장 마지막 하역'}</h1><p>양쪽 모두 입체 시점 · 같은 시작 위치 · 실제 게임 화면</p><main><figure><figcaption>변경 전</figcaption><img src="${image('before')}"></figure><figure><figcaption>변경 후</figcaption><img src="${image('after')}"></figure></main>`);
      await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
      await page.screenshot({path:path.join(out,`canal-${number}-comparison.png`),fullPage:true});
    }
    assert.deepEqual(report.errors,[]);report.success=true;
  } finally {fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(report);await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
