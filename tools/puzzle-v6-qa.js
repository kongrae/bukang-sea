// Real renderer and inputs with isolated QA saves. Requires tools/serve.js . 5182.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {gameBody}=require('./build-source'),E=require('../src/engine'),F=require('../src/free');
const {chromium}=require(process.argv[2]||'playwright'),out=path.resolve('outputs/qa/variety-v6');
const audit=JSON.parse(fs.readFileSync(path.join(out,'audit.json'))),origin='http://127.0.0.1:5182';
// Reuse the existing renderer QA entry/restore/input inspection hook; no hook ships in www or dist.
const hook=fs.readFileSync(path.join(__dirname,'challenge-qa.js'),'utf8').match(/const hook=`([^]*?)`;/)[1];
for(const side of ['before','after']) {
  const read=file=>side==='before'?cp.execFileSync('git',['show','76cc298:src/'+file],{encoding:'utf8'}):fs.readFileSync(path.join('src',file),'utf8');
  const overrides=Object.fromEntries(['game.js','shell.html','art-theme.css','variety.js','daily.js','free.js'].map(f=>[f,read(f)]));
  overrides['game.js']=overrides['game.js'].replace("const STORE_KEY = 'bukang-sea-v1';","const STORE_KEY = 'bukang-puzzle-v6-qa';").replace('const boot = () =>',hook+'\nconst boot = () =>');
  const fonts=[400,500,700].map(w=>`@font-face{font-family:'Bukang Body';font-weight:${w};src:url('/assets/fonts/noto-sans-kr-${w}.woff2')}`).join('')+"@font-face{font-family:'Bukang Display';src:url('/assets/fonts/jua-400.woff2')}";
  fs.writeFileSync(path.join(out,side+'.html'),`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}</style></head><body>${gameBody(overrides).replace(/<link[^>]*fonts\.[^>]*>/g,'')}</body></html>`);
}
const report={kind:'Headless Edge mobile emulation; manually loaded representative puzzles, actual input and save handlers; no physical Android or human fun evaluation',errors:[],checks:[],screens:[]};let browser;
async function load(p,run,packet=null){await p.evaluate(({run,packet})=>challengeQA.load('free',run,packet),{run,packet});await p.waitForTimeout(90);}
async function shot(p,name){await p.screenshot({path:path.join(out,name+'.png')});report.screens.push({name,...await p.evaluate(()=>challengeQA.dims())});}
async function input(p,step){
  const before=await p.evaluate(()=>challengeQA.state());
  for(const net of step.nets)if(!before.state.nets.includes(net)){
    const d=await p.evaluate(()=>challengeQA.dims()),r=await p.locator('#boardCanvas').boundingBox();
    await p.mouse.click(r.x+d.ox+(net%d.w+.5)*d.tile,r.y+d.height*(1-d.projection)/2+(d.oy+(Math.floor(net/d.w)+.5)*d.tile)*d.projection);
    assert((await p.evaluate(()=>challengeQA.state())).state.nets.includes(net),'actual projected net tap');
  }
  await p.keyboard.press({U:'ArrowUp',D:'ArrowDown',L:'ArrowLeft',R:'ArrowRight'}[step.dir]);await p.evaluate(()=>challengeQA.settle());
}
async function main(){
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'}),p=await context.newPage();
  p.on('pageerror',e=>report.errors.push(e.message));
  await p.goto(origin+'/outputs/qa/variety-v6/before.html');await p.locator('#launchScreen').waitFor({state:'hidden'});
  for(let tier=0;tier<3;tier++){await load(p,{...F.makeFree(1,tier,5),serial:1});await shot(p,'before-'+tier);}
  await p.goto(origin+'/outputs/qa/variety-v6/after.html');await p.locator('#launchScreen').waitFor({state:'hidden'});
  for(const r of audit.representative) {
    const run={...F.makeFree(0,r.tier,6,null,null,[],r.id),serial:1};
    for(const camera of ['oblique','top']) {
      await load(p,run);await p.evaluate(v=>challengeQA.camera(v),camera);if(camera==='oblique')await shot(p,'after-'+r.pattern);
      const initial=await p.evaluate(()=>challengeQA.state());await input(p,r.solution.steps[0]);const checkpoint=await p.evaluate(()=>challengeQA.state());
      await p.locator('#undoBtn').click();assert.deepEqual((await p.evaluate(()=>challengeQA.state())).state,initial.state);
      await load(p,run,checkpoint.session);assert.deepEqual((await p.evaluate(()=>challengeQA.state())).state,checkpoint.state);
      for(let i=1;i<r.solution.steps.length;i++){
        await input(p,r.solution.steps[i]);if(camera==='oblique'&&i===Math.floor(r.solution.steps.length/2))await shot(p,'middle-'+r.pattern);
      }
      const result=await p.evaluate(()=>challengeQA.state());assert(result.cleared);assert.equal(result.state.moves,r.solution.moves);assert.equal(result.state.fish.length,E.parseLevel(run.level).fish.length);
      report.checks.push(`${r.pattern}/${camera}: undo, exact restore, ${result.state.moves}-move all-fish clear`);
      if(camera==='oblique')await shot(p,'clear-'+r.pattern);
    }
  }
  const net=audit.representative.find(r=>r.pattern==='net'),run={...F.makeFree(0,net.tier,6,null,null,[],net.id),serial:1};
  for(const [width,height] of [[320,568],[390,844],[844,390]]) {
    await p.setViewportSize({width,height});await load(p,run);await p.evaluate(()=>challengeQA.camera('oblique'));
    const d=await p.evaluate(()=>({scroll:document.documentElement.scrollWidth,...challengeQA.dims()}));assert(d.scroll<=width+1&&d.tile>=24);
    await shot(p,'small-'+width);
  }
  await p.setViewportSize({width:390,height:844});await load(p,run);await context.setOffline(true);await input(p,net.solution.steps[0]);assert.equal((await p.evaluate(()=>challengeQA.state())).state.moves,1);
  report.checks.push('Loaded representative plays offline; responsive 320/390/landscape boards fit');
  assert.deepEqual(report.errors,[]);report.success=true;await context.close();
  const names={order:'수집 순서',return:'갈림길 재방문',patrol:'움직이는 정지점',net:'그물 위치 설계',warp:'소용돌이 왕복',relay:'물살 + 모래톱'};
  const cards=Object.entries(names).map(([id,name])=>{const r=audit.representative.find(r=>r.pattern===id);return `<article><h2>${name}<small>${r.solution.moves}회 · ${E.parseLevel(r.level).w}×${r.level.map.length}</small></h2><img src="after-${id}.png"><p>${r.level.tip}</p></article>`;}).join('');
  fs.writeFileSync(path.join(out,'gallery.html'),`<!doctype html><meta charset="utf-8"><style>@font-face{font-family:body;src:url('/assets/fonts/noto-sans-kr-500.woff2')}*{box-sizing:border-box}body{margin:0;padding:20px;background:#e8f8f5;color:#155b70;font:16px body,sans-serif}h1{font-size:25px}main{display:grid;grid-template-columns:repeat(3,300px);gap:16px}article{background:white;border-radius:18px;overflow:hidden}h2{font-size:19px;padding:12px;margin:0}small{display:block;font-size:13px;margin-top:5px;color:#4d7782}img{display:block;width:300px}p{padding:12px;line-height:1.5;font-size:14px;min-height:85px;margin:0}</style><h1>다른 판단이 필요한 대표 수로 6개</h1><p>실제 게임 렌더링 · 각 수로를 양쪽 시점으로 완주 · 자동 검증은 체감 재미의 증거가 아닙니다.</p><main>${cards}</main>`);
  const gallery=await browser.newPage({viewport:{width:972,height:1100},deviceScaleFactor:1});await gallery.goto(origin+'/outputs/qa/variety-v6/gallery.html');await gallery.screenshot({path:path.join(out,'representatives.png'),fullPage:true});
}
main().catch(e=>{report.failure=e.stack;process.exitCode=1;console.error(e);}).finally(async()=>{await browser?.close();fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({success:report.success,checks:report.checks,errors:report.errors,failure:report.failure},null,2));});
