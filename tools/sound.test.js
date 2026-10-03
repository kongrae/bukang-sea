const test = require('node:test'), assert = require('node:assert/strict');
const {createGameAudio} = require('../src/sound');
// Scheduling/resource invariants. Audible output is separately rendered by the browser lab.
function fixture() {
  const nodes=[],sources=[],params=[];let enabled=true,active=true,contexts=0;
  function param() {const p={value:1,events:[]};for(const name of ['setValueAtTime','linearRampToValueAtTime','exponentialRampToValueAtTime','setTargetAtTime','cancelScheduledValues'])p[name]=(...args)=>{assert.ok(args.every(Number.isFinite));p.events.push([name,...args]);};params.push(p);return p;}
  function node(kind) {const n={kind,disconnected:false,connect(){return arguments[0];},disconnect(){n.disconnected=true;}};nodes.push(n);return n;}
  function source(kind) {const n=node(kind);n.frequency=param();n.start=t=>{n.startTime=t;};n.stop=t=>{n.stopTime=t;};sources.push(n);return n;}
  const context={currentTime:0,sampleRate:48000,state:'running',destination:node('destination'),
    createGain:()=>Object.assign(node('gain'),{gain:param()}),createBiquadFilter:()=>Object.assign(node('filter'),{frequency:param(),Q:param()}),
    createDynamicsCompressor:()=>Object.assign(node('compressor'),Object.fromEntries(['threshold','knee','ratio','attack','release'].map(k=>[k,param()]))),
    createBuffer:(channels,length)=>({getChannelData:()=>new Float32Array(length)}),createOscillator:()=>source('tone'),createBufferSource:()=>source('noise'),
    resume:()=>{context.state='running';return Promise.resolve();},suspend:()=>{context.state='suspended';return Promise.resolve();}};
  const audio=createGameAudio({enabled:()=>enabled,active:()=>active,createContext:()=>{contexts++;return context;}});
  const advance=seconds=>{context.currentTime+=seconds;for(const n of sources)if(!n.ended&&n.stopTime<=context.currentTime){n.ended=true;n.onended?.();}};
  return {audio,sfx:audio.effects,context,nodes,sources,params,advance,contexts:()=>contexts,
    mute:value=>{enabled=!value;audio.syncEnabled();},active:value=>{active=value;if(value)audio.activate();else audio.suspend();}};
}
test('audio stays locked until input, one context/noise buffer is reused, and finished nodes disconnect',()=>{
  const f=fixture();f.sfx.jet();assert.equal(f.contexts(),0);f.audio.unlock();
  for(let i=0;i<300;i++){f.audio.unlock();f.sfx.jet();f.advance(.5);f.sfx.sand();f.advance(.3);}
  assert.equal(f.contexts(),1);assert.equal(f.audio.inspect().buffers,1);assert.equal(f.audio.inspect().voices,0);
  assert.ok(f.sources.every(n=>n.disconnected));assert.ok(f.params.every(p=>p.events.every(e=>e.slice(1).every(Number.isFinite))));
});
test('repeated blocked input is throttled',()=>{
  const f=fixture();f.audio.unlock();
  const before=f.audio.inspect().played;for(let i=0;i<20;i++){f.sfx.bump();f.advance(.01);}
  assert.equal(f.audio.inspect().played-before,2);
});
test('continuous overlaps stay bounded and priority rewards survive a full low-priority mix',()=>{
  const f=fixture();f.audio.unlock();
  for(let i=0;i<1000;i++) {f.sfx.bump();f.sfx.jet();f.sfx.gate();f.sfx.net();f.sfx.boat();f.sfx.eat(false,3);f.sfx.star(2);f.advance(.01);assert.ok(f.audio.inspect().voices<=8);}
  assert.ok(f.audio.inspect().dropped>0);assert.ok(f.audio.inspect().peakVoices<=8);f.advance(2);assert.equal(f.audio.inspect().sources,0);
});
test('mute cancels sounding and scheduled notes, including tokens captured by future reward callbacks',()=>{
  const f=fixture();f.audio.unlock();const token=f.sfx.token();f.sfx.unlockReward(token);
  assert.ok(f.sources.some(n=>n.startTime>.1));f.advance(.025);f.mute(true);f.advance(.03);
  assert.equal(f.audio.inspect().voices,0);const played=f.audio.inspect().played;f.sfx.star(1);f.mute(false);f.sfx.star(2,token);
  assert.equal(f.audio.inspect().played,played,'a muted ceremony cannot resume after unmute');
  f.sfx.star(0,f.sfx.token());assert.equal(f.audio.inspect().played,played+1);
});
test('screen/result cancellation discards future reward notes; escape splash belongs to its own tail',()=>{
  const f=fixture();f.audio.unlock();f.sfx.exit();f.sfx.cancelReward();f.advance(.03);assert.equal(f.audio.inspect().voices,1);
  f.sfx.clear();f.advance(.03);assert.equal(f.audio.inspect().voices,0);
});
test('background interrupts audio; return does not replay any queued cue',async()=>{
  const f=fixture();f.audio.unlock();f.sfx.win();f.active(false);f.advance(.04);await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(f.context.state,'suspended');assert.equal(f.audio.inspect().sources,0);const played=f.audio.inspect().played;
  f.sfx.ui();assert.equal(f.audio.inspect().played,played);f.active(true);await Promise.resolve();
  assert.equal(f.context.state,'running');assert.equal(f.audio.inspect().played,played);f.sfx.ui();assert.equal(f.audio.inspect().played,played+1);
});
test('net install/retrieve bend in opposite directions; pickup chain stays in a finite warm scale',()=>{
  const f=fixture();f.audio.unlock();f.sfx.net(false);const install=f.sources.find(n=>n.kind==='tone').frequency.events;
  f.advance(1);f.sfx.net(true);const retrieve=f.sources.filter(n=>n.kind==='tone').at(-1).frequency.events;
  assert.ok(install[1][1]>install[0][1]);assert.ok(retrieve[1][1]<retrieve[0][1]);
  for(let i=0;i<80;i++){f.advance(.2);f.sfx.eat(false,i);}
  const highest=Math.max(...f.sources.filter(n=>n.kind==='tone').flatMap(n=>n.frequency.events.filter(e=>e[0]!=='cancelScheduledValues').map(e=>e[1])));
  assert.ok(highest<900);assert.ok(f.sources.every(n=>n.type!=='square'));
});
test('semantic UI sounds suppress the generic click and repeated sheet events',()=>{
  const f=fixture();f.audio.unlock();f.sfx.sheet(true);f.sfx.ui();f.sfx.sheet(true);
  assert.equal(f.audio.inspect().played,1);f.advance(.3);f.sfx.equip();f.sfx.ui();assert.equal(f.audio.inspect().played,2);
});
test('unavailable or rejected browser audio never breaks a game action',async()=>{
  const missing=createGameAudio({createContext:()=>{throw Error('unavailable');}});assert.equal(missing.unlock(),null);assert.doesNotThrow(()=>missing.effects.jet());
  const f=fixture();f.context.state='suspended';f.context.resume=()=>Promise.reject(Error('gesture required'));f.audio.unlock();f.sfx.jet();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(f.audio.inspect().played,0);
});
