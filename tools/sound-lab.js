const $lab = id => document.getElementById(id);
const cases = [
  ['짧은 헤엄','move',[2,.2]],['긴 헤엄','move',[10,.62]],['물방울 정지','stop',[.7]],['막힌 방향','bump',[]],
  ['숭어 획득','eat',[false,0]],['연속 숭어','eat',[false,3]],['마지막 숭어','eat',[true,3]],
  ['그물 설치','net',[false]],['그물 회수','net',[true]],['물줄기','jet',[]],['소용돌이','warp',[]],
  ['모래톱','sand',[]],['스위치','press',[]],['수문','gate',[]],['구조정','boat',[]],
  ['바다로 탈출','exit',[]],['별 1','star',[0]],['별 2','star',[1]],['별 3','star',[2]],
  ['스킨 해금','unlockReward',[]],['일반 버튼','ui',[]],['구출 시작','start',[]],['상어 선택','equip',[]],
  ['시트 열기','sheet',[true]],['시트 닫기','sheet',[false]],['되돌리기','undo',[]],
];
const sequence = [
  [0,'move',2,.2],[.2,'stop',.4],[.6,'move',10,.62],[1.2,'stop',.8],
  [1.6,'bump'],[1.63,'bump'],[1.66,'bump'],[2,'eat',false,0],[2.1,'eat',false,1],[2.2,'eat',false,2],[2.3,'eat',true,3],
  [3.2,'net',false],[3.8,'net',true],[4.4,'jet'],[5,'warp'],[5.8,'sand'],[6.4,'press'],[6.4,'gate'],[7,'boat'],
  [7.5,'ui'],[8,'start'],[8.5,'equip'],[9,'sheet',true],[9.5,'sheet',false],
  [10,'exit'],[10.9,'star',0],[11.1,'star',1],[11.3,'star',2],[11.9,'unlockReward'],
];
let muted = false, suspended = false, oldContext = null, oldEffects = null, timers = [], epoch = 0, selected = 'after';
const afterAudio = createGameAudio({enabled:()=>!muted,active:()=>!suspended});
function stopLab() {
  epoch++; timers.forEach(clearTimeout); timers=[]; afterAudio.effects.clear();
  if(oldContext) { oldContext.close().catch(()=>{}); oldContext=null; oldEffects=null; }
  $lab('status').textContent='정지 · 남은 예약음 취소';
}
function getEffects(version) {
  selected=version;
  if(version==='after'){afterAudio.unlock();return afterAudio.effects;}
  if(!oldContext){oldContext=new AudioContext();oldEffects=createBeforeAudio(oldContext);}
  return oldEffects;
}
function playSequence(version) {
  stopLab(); const effects=getEffects(version), ticket=epoch;
  $lab('status').textContent=(version==='after'?'개선':'이전')+' 세트 재생 중';
  for(const [time,name,...args] of sequence) timers.push(setTimeout(()=>{
    if(ticket===epoch&&!muted&&!suspended)effects[name]?.(...args);
  },time*1000));
  timers.push(setTimeout(()=>{if(ticket===epoch)$lab('status').textContent='재생 완료';},13000));
}
for(const [label,name,args] of cases) {
  const row=document.createElement('div');row.className='effect';
  const heading=document.createElement('b');heading.textContent=label;row.append(heading);
  for(const version of ['before','after']) {
    const button=document.createElement('button');button.textContent=label+' · '+(version==='before'?'이전':'개선');button.className=version==='after'?'new':'';
    const removed=['move','stop'].includes(name)&&version==='after';
    const absent=['boat','unlockReward','ui','start','sheet'].includes(name)&&version==='before';button.disabled=absent||removed;
    if(removed)button.textContent=label+' · 제거됨';
    button.onclick=()=>{stopLab();if(!muted&&!suspended)getEffects(version)[name]?.(...args);$lab('status').textContent=label+' · '+version;};row.append(button);
  }
  $lab('effects').append(row);
}
$lab('beforeSequence').onclick=()=>playSequence('before');$lab('afterSequence').onclick=()=>playSequence('after');$lab('stop').onclick=stopLab;
$lab('mute').onclick=()=>{muted=!muted;stopLab();afterAudio.syncEnabled();$lab('mute').textContent=muted?'음소거 끄기':'음소거 켜기';};
$lab('background').onclick=()=>{suspended=!suspended;stopLab();if(suspended)afterAudio.suspend();else afterAudio.activate();$lab('background').textContent=suspended?'앱 복귀 모의':'백그라운드 전환 모의';};
document.addEventListener('visibilitychange',()=>{stopLab();if(document.hidden)afterAudio.suspend();else if(!suspended)afterAudio.activate();});
setInterval(()=>{$lab('live').textContent=JSON.stringify({version:selected,muted,suspended,...afterAudio.inspect()},null,2);},250);
function wav(buffer) {
  const samples=buffer.getChannelData(0),data=new ArrayBuffer(44+samples.length*2),view=new DataView(data);
  const str=(at,s)=>[...s].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
  str(0,'RIFF');view.setUint32(4,data.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,samples.length*2,true);
  samples.forEach((s,i)=>view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,s))*32767),true));
  return new Blob([data],{type:'audio/wav'});
}
function metrics(buffer) {
  const samples=buffer.getChannelData(0);let peak=0,sum=0,step=0,tail=0,clipped=0;
  samples.forEach((s,i)=>{peak=Math.max(peak,Math.abs(s));sum+=s*s;if(Math.abs(s)>=1)clipped++;if(i)step=Math.max(step,Math.abs(s-samples[i-1]));if(i>samples.length-buffer.sampleRate*.2)tail=Math.max(tail,Math.abs(s));});
  return {seconds:buffer.duration,peak:+peak.toFixed(6),peakDbFS:+(20*Math.log10(peak||1e-12)).toFixed(2),rms:+Math.sqrt(sum/samples.length).toFixed(6),maxAdjacentSampleDelta:+step.toFixed(6),last200msPeak:+tail.toFixed(8),clippedSamples:clipped};
}
async function renderSound(version,events,duration) {
  const ctx=new OfflineAudioContext(1,Math.ceil(duration*48000),48000);let enabled=true;
  // Offline rendering is deliberately suspended at each event, so expose its scheduling state as running.
  const facade=new Proxy(ctx,{get:(target,key)=>key==='state'?'running':key==='resume'?()=>Promise.resolve():typeof target[key]==='function'?target[key].bind(target):target[key]});
  let seed=12345;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const engine=version==='after'?createGameAudio({createContext:()=>facade,enabled:()=>enabled,random}):null;
  if(engine)engine.unlock();const effects=engine?engine.effects:createBeforeAudio(facade);
  const groups=new Map();for(const event of events){const at=Math.round(event[0]*48000/128)*128/48000;if(!groups.has(at))groups.set(at,[]);groups.get(at).push(event);}
  const jobs=[...groups].map(([time,items])=>ctx.suspend(time).then(()=>{
    for(const [,name,...args]of items){if(name==='mute'){enabled=!args[0];engine?.syncEnabled();}else effects[name]?.(...args);}
    return ctx.resume();
  }));
  const rendered=await ctx.startRendering();await Promise.all(jobs);
  return {buffer:rendered,stats:{...metrics(rendered),...(engine?{runtime:engine.inspect()}:{})}};
}
const downloads=[];
function addRender(label,buffer) {
  const url=URL.createObjectURL(wav(buffer));downloads.push(url);
  const title=document.createElement('b');title.textContent=label;
  const player=document.createElement('audio');player.controls=true;player.src=url;
  const link=document.createElement('a');link.href=url;link.download=label+'.wav';link.textContent=label+' WAV 저장';
  // A visible self-contained download also works in hosts that cannot export blob URLs.
  const reader=new FileReader();reader.onload=()=>{link.href=String(reader.result);};reader.readAsDataURL(wav(buffer));
  $lab('renders').append(title,player,link,document.createElement('hr'));
}
$lab('render').onclick=async()=>{
  stopLab();$lab('render').disabled=true;$lab('metrics').textContent='실제 오디오 파형 렌더링 중…';
  try {for(const url of downloads)URL.revokeObjectURL(url);downloads.length=0;$lab('renders').replaceChildren();const results={};
    for(const version of ['before','after']){const out=await renderSound(version,sequence,13);results[version]=out.stats;addRender('shark-sos-'+version,out.buffer);}
    $lab('metrics').textContent=JSON.stringify(results,null,2);
  }catch(error){$lab('metrics').textContent=String(error);}finally{$lab('render').disabled=false;}
};
$lab('stressRender').onclick=async()=>{
  stopLab();$lab('stressRender').disabled=true;
  try {const events=[];for(let t=0;t<4;t+=.04){events.push([t,'move',12,.62],[t,'bump'],[t,'net',false],[t,'jet'],[t,'boat'],[t,'eat',false,3],[t,'star',2]);}
    events.push([4.1,'unlockReward'],[4.15,'mute',true]);
    const out=await renderSound('after',events,5);$lab('metrics').textContent=JSON.stringify({stress:out.stats},null,2);addRender('shark-sos-stress-mute',out.buffer);
  }catch(error){$lab('metrics').textContent=String(error);}finally{$lab('stressRender').disabled=false;}
};
