// Injected inside the IIFE by build-sound-lab.js only; isolated local save and visible controls.
const qaAudioPanel=document.createElement('aside');qaAudioPanel.id='qaAudioPanel';
qaAudioPanel.innerHTML='<button id="qaAudioRun">5분 자동 플레이</button><button id="qaAudioStop">검사 정지</button><button id="qaAudioPause">앱 중단 모의</button><button id="qaAudioNet">그물 수로</button><button id="qaAudioSluice">수문 수로</button><pre id="qaAudioLog">개발 전용 · 실제 규칙 자동 조작 · 청취 판정 아님</pre>';
document.body.append(qaAudioPanel);
let qaSoundRun=false,qaSoundStart=0,qaSoundTimer=null,qaSoundRoute=null,qaSoundAt=0,qaSoundLevel=0,qaSoundClearAt=0,qaAudioMax=0,qaAudioCpu=0,qaAudioFrames=0,qaAudioMoves=0,qaAudioClears=0;
const qaSoundCalls={},qaSoundEvents=[];
for(const name of Object.keys(sfx))if(!['clear','cancelReward','token'].includes(name)){
  const original=sfx[name];sfx[name]=(...args)=>{qaSoundCalls[name]=(qaSoundCalls[name]||0)+1;qaSoundEvents.push({name,args});if(qaSoundEvents.length>24)qaSoundEvents.shift();return original(...args);};
}
const qaAudioStep=step;step=dt=>{const start=performance.now();qaAudioStep(dt);if(qaSoundRun){const time=performance.now()-start;qaAudioMax=Math.max(qaAudioMax,time);qaAudioCpu+=time;qaAudioFrames++;}};
function qaAudioState(status){$('qaAudioLog').textContent=JSON.stringify({status,seconds:+((performance.now()-qaSoundStart)/1000).toFixed(1),moves:qaAudioMoves,clears:qaAudioClears,events:qaSoundCalls,lastEvents:qaSoundEvents.slice(-5),audio:typeof sound==='undefined'?'baseline has no mixer stats':sound.inspect(),stepMeanMs:+(qaAudioCpu/Math.max(1,qaAudioFrames)).toFixed(3),stepMaxMs:+qaAudioMax.toFixed(3),soundEnabled:save.sound},null,2);}
function qaAudioEnter(index,pilot=false){save.seenDevices=DEVICE_GUIDES.map(d=>d.key);save.coachSwipe=save.coachNet=true;show('game',false);if(pilot)loadPilot(index);else loadLevel(index);}
function qaAudioNext(){
  const levels=[[0,false],[2,false],[5,false],[9,false],[11,false],[36,false],[39,false],[10,true],[11,true]],choice=levels[qaSoundLevel++%levels.length];
  qaAudioEnter(...choice);qaSoundRoute=plan(g,st.pos,0,new Set(),g.nets,true,st.boats,st.gate).steps;qaSoundAt=0;qaSoundClearAt=0;
}
function qaAudioStop(status='사용자가 정지') {qaSoundRun=false;clearInterval(qaSoundTimer);qaSoundTimer=null;if(typeof sound!=='undefined')sfx.clear();qaAudioState(status);setTimeout(()=>qaAudioState(status+' · 꼬리 정리 후'),700);}
$('qaAudioRun').onclick=()=>{
  if(qaSoundRun)return;save.sound=true;ac();qaSoundStart=performance.now();qaSoundLevel=qaAudioMoves=qaAudioClears=qaAudioFrames=qaAudioMax=qaAudioCpu=0;
  for(const key of Object.keys(qaSoundCalls))delete qaSoundCalls[key];qaSoundRun=true;qaAudioNext();
  qaSoundTimer=setInterval(()=>{
    if(performance.now()-qaSoundStart>=305000){qaAudioStop('305초 완료');return;}
    if(renderSuspended())return;
    if(cleared){if(!qaSoundClearAt){qaSoundClearAt=performance.now();qaAudioClears++;}if(performance.now()-qaSoundClearAt>1900)qaAudioNext();}
    else if(!anim&&qaSoundAt<qaSoundRoute.length){const next=qaSoundRoute[qaSoundAt++];for(const i of [...st.nets])if(!next.nets.includes(i))tapTile(i%g.w,Math.floor(i/g.w));for(const i of next.nets)if(!st.nets.includes(i))tapTile(i%g.w,Math.floor(i/g.w));tryMove(next.dir);qaAudioMoves++;}
    qaAudioState('실제 규칙 5분 자동 플레이 중');
  },100);
};
$('qaAudioStop').onclick=()=>qaAudioStop();
$('qaAudioPause').onclick=()=>{appActive=!appActive;if(appActive)resumePresentation();else suspendPresentation();$('qaAudioPause').textContent=appActive?'앱 중단 모의':'앱 복귀 모의';setTimeout(()=>qaAudioState(appActive?'복귀':'중단'),80);};
$('qaAudioNet').onclick=()=>{qaAudioStop();qaAudioEnter(11);};
$('qaAudioSluice').onclick=()=>{qaAudioStop();qaAudioEnter(10,true);};
