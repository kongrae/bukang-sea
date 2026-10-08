const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {createGameAudio, SFX_SAMPLES} = require('../src/sound');
const {AUDIO} = require('./build-source');
// Scheduling/resource invariants. Audible output is separately rendered by the browser lab.
// `samples`/`decode` exercise the recorded path with stand-in buffers; without them the synthesized fallback plays.
function fixture({samples, decode} = {}) {
  const nodes=[],sources=[],params=[];let enabled=true,active=true,contexts=0;
  function param() {const p={value:1,events:[]};for(const name of ['setValueAtTime','linearRampToValueAtTime','exponentialRampToValueAtTime','setTargetAtTime','cancelScheduledValues'])p[name]=(...args)=>{assert.ok(args.every(Number.isFinite));p.events.push([name,...args]);};params.push(p);return p;}
  function node(kind) {const n={kind,disconnected:false,connect(){return arguments[0];},disconnect(){n.disconnected=true;}};nodes.push(n);return n;}
  function source(kind) {const n=node(kind);n.frequency=param();n.start=t=>{n.startTime=t;};n.stop=t=>{n.stopTime=t;};sources.push(n);return n;}
  const context={currentTime:0,sampleRate:48000,state:'running',destination:node('destination'),
    createGain:()=>Object.assign(node('gain'),{gain:param()}),createBiquadFilter:()=>Object.assign(node('filter'),{frequency:param(),Q:param()}),
    createDynamicsCompressor:()=>Object.assign(node('compressor'),Object.fromEntries(['threshold','knee','ratio','attack','release'].map(k=>[k,param()]))),
    createBuffer:(channels,length)=>({getChannelData:()=>new Float32Array(length)}),createOscillator:()=>source('tone'),createBufferSource:()=>Object.assign(source('noise'),{playbackRate:param()}),
    resume:()=>{context.state='running';return Promise.resolve();},suspend:()=>{context.state='suspended';return Promise.resolve();}};
  if(decode)context.decodeAudioData=decode;
  const audio=createGameAudio({enabled:()=>enabled,active:()=>active,createContext:()=>{contexts++;return context;},...(samples?{samples}:{})});
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
// Stand-in recordings: every SFX_SAMPLES entry with a tiny data URL; decoding labels each buffer with its key.
function recordings(omit = []) {
  const keys = Object.keys(SFX_SAMPLES).filter(k => !omit.includes(k)), table = {}; let next = 0;
  for (const k of keys) table[k] = ['data:audio/ogg;base64,AAAA', ...SFX_SAMPLES[k].slice(1)];
  const decode = (data, ok) => { const key = keys[next++], b = {key, duration: 2, length: 96000, sampleRate: 48000, numberOfChannels: 1, getChannelData: () => new Float32Array(96000)}; ok(b); return Promise.resolve(b); };
  return {samples: table, decode};
}
const recordedOf = f => f.sources.filter(n => n.buffer?.key);
test('decoded recordings replace the synthesized layers; an effect missing a recording keeps its synthesized cue', async () => {
  const f = fixture(recordings(['splash'])); f.audio.unlock(); await f.audio.loaded();
  assert.equal(f.audio.inspect().samples, Object.keys(SFX_SAMPLES).length - 1);
  for (const name of ['bump', 'jet', 'warp', 'sand', 'press', 'gate', 'crate', 'boat', 'undo', 'ui', 'start', 'equip']) { f.sfx[name](); f.advance(.5); }
  f.sfx.net(false); f.advance(.5); f.sfx.sheet(true); f.advance(.5); f.sfx.eat(true, 2); f.advance(1); f.sfx.star(1); f.advance(1.5);
  assert.equal(f.sources.filter(n => n.kind === 'tone').length, 0, 'no oscillator while recordings are ready');
  assert.ok(recordedOf(f).length >= 20); assert.ok(recordedOf(f).every(n => Number.isFinite(n.playbackRate.value) || n.playbackRate.events.length));
  f.sfx.exit(); assert.ok(f.sources.some(n => n.kind === 'tone'), 'exit falls back without its splash recording');
  f.advance(2); assert.equal(f.audio.inspect().sources, 0); assert.ok(f.sources.every(n => n.disconnected));
});
test('recorded variants rotate without immediate repeats and each fish in a swipe climbs the same scale', async () => {
  const f = fixture(recordings()); f.audio.unlock(); await f.audio.loaded();
  const bumps = []; for (let i = 0; i < 4; i++) { const before = f.sources.length; f.sfx.bump(); bumps.push(f.sources.slice(before).find(n => n.buffer).buffer.key); f.advance(.3); }
  assert.deepEqual(bumps, ['softImpact0', 'softImpact2', 'softImpact3', 'softImpact0']);
  const pitches = [];
  for (let chain = 0; chain < 8; chain++) {
    const before = f.sources.length; f.sfx.eat(false, chain);
    const note = f.sources.slice(before).find(n => /^marimba/.test(n.buffer?.key));
    pitches.push(Math.round(note.playbackRate.value * SFX_SAMPLES[note.buffer.key][3])); f.advance(.3);
  }
  assert.deepEqual(pitches, [440, 494, 554, 659, 740, 880, 880, 880], 'A major pentatonic, capped at A5');
});
test('mute and backgrounding stop recorded layers and their scheduled reward notes', async () => {
  const f = fixture(recordings()); f.audio.unlock(); await f.audio.loaded();
  const token = f.sfx.token(); f.sfx.unlockReward(token); assert.ok(recordedOf(f).some(n => n.startTime > .25), 'bell is scheduled later');
  f.advance(.02); f.mute(true); f.advance(.03); assert.equal(f.audio.inspect().voices, 0);
  f.mute(false); const count = f.sources.length; f.sfx.star(2, token); assert.equal(f.sources.length, count, 'a cancelled ceremony stays silent');
  f.sfx.exit(); f.active(false); f.advance(.05); await new Promise(resolve => setTimeout(resolve, 40)); assert.equal(f.audio.inspect().sources, 0);
});
test('chapter card call: water, then C#5–E5–A5 with a later bell in the shared scale; synthesized without recordings', async () => {
  const f = fixture(recordings()); f.audio.unlock(); await f.audio.loaded();
  f.sfx.chapter();
  const layers = recordedOf(f), pitch = n => Math.round(n.playbackRate.value * SFX_SAMPLES[n.buffer.key][3]);
  assert.equal(layers[0].buffer.key, 'waterSwish'); assert.equal(f.sources.filter(n => n.kind === 'tone').length, 0);
  assert.deepEqual(layers.slice(1).map(pitch), [554, 659, 880, 880]);
  assert.equal(layers.at(-1).buffer.key, 'glockC6'); assert.ok(layers.at(-1).startTime >= .38, 'the bell lands on the top note');
  f.mute(true); f.advance(.03); assert.equal(f.audio.inspect().voices, 0, 'muting cancels it like any reward');
  const synth = fixture(); synth.audio.unlock(); synth.sfx.chapter();
  assert.ok(synth.sources.filter(n => n.kind === 'tone').length >= 3, 'falls back to synthesized notes');
  synth.advance(2); assert.equal(synth.audio.inspect().sources, 0);
});
test('embedded recordings: each token has a CC0 file with provenance and the set stays under 400 KB as data URLs', () => {
  const root = path.join(__dirname, '..'), source = fs.readFileSync(path.join(root, 'src/sound.js'), 'utf8');
  const tokens = [...source.matchAll(/@@SFX_([A-Z0-9_]+)@@/g)].map(m => m[1]);
  assert.deepEqual([...tokens].sort(), AUDIO.map(([token]) => token).sort(), 'tokens and embedded files match one to one');
  const licenses = fs.readFileSync(path.join(root, 'assets/audio/LICENSES.md'), 'utf8').split('\n');
  let base64 = 0;
  for (const [, file] of AUDIO) {
    const name = path.basename(file), bytes = fs.statSync(path.join(root, 'assets', file)).size; base64 += Math.ceil(bytes / 3) * 4;
    const row = licenses.find(line => line.startsWith(`| ${name} |`)); assert.ok(row, 'provenance row for ' + name);
    const cells = row.split('|').map(s => s.trim()).filter(Boolean);
    assert.equal(cells[4], 'CC0', name); assert.match(cells[2], /https:\/\/(kenney\.nl|freesound\.org)\//, name); assert.ok(cells[6].length > 5, 'AI-free evidence for ' + name);
  }
  assert.equal(fs.readdirSync(path.join(root, 'assets/audio')).filter(f => f !== 'LICENSES.md').length, AUDIO.length, 'no unlisted audio files');
  assert.ok(base64 <= 400 * 1024, `embedded audio ${base64} bytes`);
});
