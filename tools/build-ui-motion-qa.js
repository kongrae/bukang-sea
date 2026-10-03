// Local-only comparison UI: no hooks or record changes enter release builds.
// node tools/build-ui-motion-qa.js <baseline-git-ref>
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { gameBody } = require('./build-source');
const root = path.resolve(__dirname, '..');
const ref = process.argv[2];
if (!ref || !/^[a-zA-Z0-9_.\/-]+$/.test(ref) || ref.startsWith('-')) throw Error('Provide a baseline Git ref');
const before = cp.execFileSync('git', ['show', ref + ':src/game.js'], { cwd: root, encoding: 'utf8' });
const current = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8');
const folder = path.join(root, 'outputs/qa');
fs.mkdirSync(folder, { recursive: true });
const controls = `
const qaPanel=document.createElement('aside');qaPanel.id='qaPanel';
qaPanel.innerHTML='<details open><summary>QA · 로컬 검증</summary><button id="qaRun">이동 비교 시작</button><button id="qaMode">동작 줄이기</button><button id="qaPause">앱 중단</button><button id="qaJourney">여정</button><button id="qaEnding">엔딩</button><pre id="qaReadout">준비</pre></details>';
document.body.append(qaPanel);
let qaRunning=false,qaCount=0,qaStamp=0,qaLast=null,qaFrames=[],qaDraw=[],qaStep=[],qaInput=[],qaTask=[],qaAt=0,qaFirst=false;
const qaStats=values=>{const a=values.slice().sort((a,b)=>a-b),at=q=>a[Math.min(a.length-1,Math.floor(a.length*q))]||0;return {n:a.length,median:+at(.5).toFixed(3),p95:+at(.95).toFixed(3),max:+(a.at(-1)||0).toFixed(3),over25:a.filter(v=>v>25).length,over50:a.filter(v=>v>50).length};};
const qaFrame=frame;frame=now=>{qaStamp=now;qaFrame(now);};
const qaDrawFn=draw;draw=(...args)=>{const start=performance.now();const moving=qaRunning&&!!anim;qaDrawFn(...args);if(moving){qaDraw.push(performance.now()-start);if(qaLast!=null)qaFrames.push(qaStamp-qaLast);qaLast=qaStamp;if(qaFirst){qaInput.push(start-qaAt);qaFirst=false;}}};
const qaStepFn=step;step=dt=>{const start=performance.now();qaStepFn(dt);if(qaRunning)qaStep.push(performance.now()-start);};
try{new PerformanceObserver(list=>{if(qaRunning)qaTask.push(...list.getEntries().map(e=>e.duration));}).observe({type:'longtask',buffered:false});}catch(_){}
function qaNext(){
  if(!qaRunning)return;
  if(qaCount>=24){qaRunning=false;$('qaReadout').textContent=JSON.stringify({kind:'JS update intervals and CPU cost, not presented GPU FPS',viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,moves:st.moves,frames:qaStats(qaFrames),draw:qaStats(qaDraw),step:qaStats(qaStep),input:qaStats(qaInput),longTasks:qaStats(qaTask)},null,2);return;}
  qaLast=null;qaFirst=true;qaAt=performance.now();tryMove(qaCount++%2?'L':'R');
}
const qaFinish=finishAnim;finishAnim=(...args)=>{qaFinish(...args);if(qaRunning)setTimeout(qaNext,80);};
$('qaRun').onclick=()=>{if(qaRunning)return;show('game',false);loadLevel(0);if(guideOpen())closeGuide();save.sound=false;save.vibe=false;qaCount=0;qaFrames=[];qaDraw=[];qaStep=[];qaInput=[];qaTask=[];qaRunning=true;$('qaReadout').textContent='측정 중 · 첫 수로 R/L 24회';setTimeout(qaNext,350);};
$('qaMode').onclick=()=>{changeMotionPreference({matches:!reduceMotion});document.documentElement.classList.toggle('qa-reduced',reduceMotion);$('qaMode').textContent=reduceMotion?'일반 동작':'동작 줄이기';};
$('qaPause').onclick=()=>{appActive=!appActive;if(appActive)resumePresentation();else suspendPresentation();$('qaPause').textContent=appActive?'앱 중단':'앱 복귀';};
$('qaJourney').onclick=()=>openJourney();
$('qaEnding').onclick=()=>{save.best=Object.fromEntries(LEVELS.map((_,i)=>[i,3]));openEnding();};
`;
for (const [name, source] of [['before', before], ['after', current]]) {
  let game = source.replace("const STORE_KEY = 'bukang-sea-v1';", `const STORE_KEY = 'bukang-ui-motion-qa-${name}';`)
    .replace('let reduceMotion = motionPreference.matches;', 'let reduceMotion = false;')
    .replace('const unlocked = i => i === 0 || save.best[i - 1] != null;', 'const unlocked = i => true;')
    .replace('const pilotUnlocked = i => i === 0 || pilotStars(i - 1) > 0;', 'const pilotUnlocked = i => true;')
    .replace('const boot = () =>', controls + '\nconst boot = () =>');
  if (!game.includes('qaPanel')) throw Error('QA insertion marker changed');
  let body = gameBody().replace(current, game)
    .replaceAll('@media (prefers-reduced-motion: reduce)', '@media (max-width: 0px)')
    .replace(/<link[^>]*fonts\.[^>]*>/g, '');
  const fonts = [400, 500, 700].map(w => `@font-face{font-family:'Bukang Body';font-weight:${w};src:url('/assets/fonts/noto-sans-kr-${w}.woff2')}`)
    .join('') + "@font-face{font-family:'Bukang Display';font-weight:400;src:url('/assets/fonts/jua-400.woff2')}";
  const style = `#qaPanel{position:fixed;z-index:40;bottom:0;left:0;right:0;max-height:160px;overflow:auto;background:#fff;color:#123;font:11px monospace;padding:4px}#qaPanel button{font:12px sans-serif;padding:5px;margin:2px;color:#123;background:#eee;border:1px solid #aaa}#qaReadout{white-space:pre-wrap;margin:2px}#app{height:calc(100% - 160px)}html.qa-reduced *,html.qa-reduced *::before,html.qa-reduced *::after{animation-duration:.01ms!important;transition:none!important}`;
  fs.writeFileSync(path.join(folder, `ui-motion-${name}.html`), `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>UI motion ${name}</title><style>${fonts}${style}</style></head><body>${body}</body></html>`);
}
console.log('Built outputs/qa/ui-motion-{before,after}.html; baseline game: ' + ref);
