const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const E = require('../src/engine'), { LEVELS, CHAPTERS, STORY_ORDER, STORY_POSITION, STORY_ORDER_V2, STORY_EXTENSION_LEVELS, LEGACY_STORY_LEVELS } = require('../src/levels');
const { PILOT_LEVELS } = require('../src/pilot');
const source = fs.readFileSync(path.join(__dirname,'../src/game.js'),'utf8');
const fn = name => source.match(new RegExp(`^function ${name}\\([^\\n]*}\\s*$`,'m'))?.[0]
  || source.match(new RegExp(`function ${name}\\([^]*?\\n}`))?.[0];
function fixture(stored = {}) {
  const functions=['persist','levelSignature','copyTurn','restoreSession','storyLevel','storyResumeId','storySession','migratePilotToStory','migrateStoryOrder','refreshSkins'].map(fn).join('\n');
  const skins=source.slice(source.indexOf('const SKINS ='),source.indexOf('// adds newly earned skins'));
  return new Function('stored',`
    ${fs.readFileSync(path.join(__dirname,'../src/engine.js'),'utf8')}
    ${fs.readFileSync(path.join(__dirname,'../src/levels.js'),'utf8')}
    ${fs.readFileSync(path.join(__dirname,'../src/pilot.js'),'utf8')}
    const save=Object.assign({best:{},sessions:{},hintUsage:{},owned:['basic'],skin:'basic',daily:{}},JSON.parse(JSON.stringify(stored)));
    const STORE_KEY='isolated-test',localStorage={setItem:()=>{}},journalTotals=()=>({visits:0,operations:0});
    ${source.match(/^const unlocked = .*$/m)[0]}
    ${skins}
    ${functions}
    return {save,migrate:migratePilotToStory,reorder:migrateStoryOrder,unlocked,session:storySession,resume:storyResumeId,refresh:refreshSkins,total:totalStars};
  `)(stored);
}
function record(index, id = index, move = null) {
  const level=LEVELS[index],g=E.parseLevel(level);
  const start={pos:g.start.slice(),dir:'U',fish:[],nets:[],boats:g.boats.map(b=>b.slice()),moves:0,...(g.switches.length?{gate:0}:{})};
  const state={...start,history:[]};
  if(move){const r=E.turn(g,state.pos,move,new Set(),state.boats,state.gate);Object.assign(state,{pos:r.end,dir:move,boats:r.boats,moves:1,gate:r.gate,history:[start]});}
  return {version:1,id,layout:JSON.stringify([level.map,level.nets||0]),state};
}
test('saved LEVELS indices keep the original 60 canals in place while 72 canals play in six 12-canal chapters',()=>{
  assert.equal(LEVELS.length,72);assert.deepEqual(CHAPTERS.map(c=>c.count),[12,12,12,12,12,12]);
  assert.deepEqual([...STORY_ORDER].sort((a,b)=>a-b),LEVELS.map((_,i)=>i),'every canal appears once in play order');
  STORY_ORDER.forEach((index,position)=>assert.equal(STORY_POSITION[index],position));
  const sha=data=>crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  // 2026-10-08 early curve: 1, 2, 25 and 31 were redesigned in place; their previous boards live on unchanged as legacy definitions.
  const redesigned=[1,2,25,31],before=LEVELS.slice(0,48).map((l,i)=>redesigned.includes(i)?{...LEGACY_STORY_LEVELS[i],role:l.role}:l);
  for(const i of redesigned) assert.notDeepEqual(LEVELS[i].map,LEGACY_STORY_LEVELS[i].map,'level index '+i);
  assert.equal(sha(before.map(l=>[l.name,l.map,l.nets||0])),'1b08e6cf43f45b3e1872730ee4e86043052f01f9bf2accde3e0340dcebfa84c6','original layouts never move');
  // 2026-10-07: roles follow the new slots; nine targets rise by one and none fall (docs/CHAPTER-RESTRUCTURE.md).
  assert.equal(sha(before.map(l=>[l.name,l.map,l.nets||0,l.par,l.role||'regular'])),'caebf6c95a7d15b9f27745cb14d2194395e283ab5412acf3412e36439d163a63');
  const retargeted={11:['regular',10],12:['learn',9],17:['learn',8],20:['regular',13],23:['regular',11],33:['regular',11],37:['learn',9],43:['regular',17],46:['regular',12]};
  for(const [i,[role,par]] of Object.entries(retargeted)) assert.deepEqual([LEVELS[i].role||'regular',LEVELS[i].par],[role,par],'level index '+i);
  assert.deepEqual(LEVELS.slice(48,60),PILOT_LEVELS);assert.equal(PILOT_LEVELS,STORY_EXTENSION_LEVELS);
  assert.ok(!fs.readFileSync(path.join(__dirname,'../src/shell.html'),'utf8').includes('id="pilotBtn"'));
});
test('legacy bests import once without adding stars twice, altering old progress or relocking an earned skin',()=>{
  const f=fixture({best:{0:3,47:1,48:3},pilot:{version:1,best:{p01:2,p05:3,p12:1,p99:3,p02:7,p03:'3'}},owned:['basic','gold'],skin:'gold',sound:false});
  f.migrate();assert.deepEqual(f.save.best,{0:3,47:1,48:3,52:3,59:1});assert.equal(f.total(),11);
  assert.ok(f.unlocked(48)&&f.unlocked(52)&&f.unlocked(53));assert.equal(f.unlocked(54),false);
  assert.equal(f.save.sound,false);f.refresh();assert.equal(f.save.skin,'gold');assert.ok(f.save.owned.includes('gold'));
  const once=JSON.stringify(f.save);f.migrate();assert.equal(JSON.stringify(f.save),once);
  const fresh=fixture();fresh.migrate();assert.equal(fresh.unlocked(48),false);assert.equal(fresh.total(),0);
});
test('imported stars count toward existing skin thresholds while the 144-star gold threshold stays fixed',()=>{
  const f=fixture({best:Object.fromEntries(Array.from({length:6},(_,i)=>[i,3])),pilot:{version:1,best:{p01:2}}});
  f.migrate();assert.equal(f.total(),20);assert.ok(f.refresh().some(s=>s.id==='sakura'));
  assert.ok(f.save.owned.includes('sakura'));assert.equal(f.save.owned.includes('gold'),false);
  const gold=fixture({best:Object.fromEntries(Array.from({length:47},(_,i)=>[i,3])),pilot:{version:1,best:{p01:3}}});
  gold.migrate();assert.equal(gold.total(),144);assert.ok(gold.refresh().some(s=>s.id==='gold'));
});
test('a legacy gate session and hints resume in main story, without overwriting another active story turn',()=>{
  const story=record(2),pilot=record(52,'p05','U');
  const f=fixture({sessions:{story,pilot,daily:{id:'keep'}},hintUsage:{'pilot:p05':{count:4,lastUsed:900},'story:52':{count:2,lastUsed:1000}}});
  f.migrate();assert.deepEqual(f.save.sessions.story,story);assert.equal(f.resume(),2);
  assert.deepEqual(f.save.sessions.importedStory,{...pilot,id:52});assert.deepEqual(f.session(52),pilot.state);
  assert.deepEqual(f.save.hintUsage['story:52'],{count:4,lastUsed:1000});assert.deepEqual(f.save.sessions.daily,{id:'keep'});
  delete f.save.sessions.story;assert.equal(f.resume(),52);assert.deepEqual(f.session(),pilot.state);
  delete f.save.sessions.importedStory;f.migrate();assert.equal(f.session(52),null,'completed import must not resurrect on reload');
  const single=fixture({sessions:{pilot}});single.migrate();assert.equal(single.resume(),52);assert.deepEqual(single.session(),pilot.state);
});
test('invalid pilot saves never become unlocked story turns or fabricate completion',()=>{
  const pilot=record(52,'p05');pilot.state.gate=9;
  const f=fixture({pilot:{version:1,best:{p01:'3',p02:-1,p03:4}},sessions:{pilot},hintUsage:{'pilot:p05':{count:-1,lastUsed:NaN}}});
  f.migrate();assert.deepEqual(f.save.best,{});assert.deepEqual(f.save.storyAccess,[]);
  assert.equal(f.session(52),null);assert.equal(f.save.hintUsage['story:52'],undefined);
});
test('the new play order keeps every canal the previous order opened and never fabricates stars',()=>{
  const best=Object.fromEntries(Array.from({length:20},(_,i)=>[i,3]));
  const f=fixture({best,storyExpansion:1,storyAccess:[]});f.reorder();
  assert.deepEqual(f.save.best,best);assert.equal(f.save.storyOrder,3);assert.equal(f.save.storyRescued,undefined);
  assert.ok(f.unlocked(20),'old next canal 21 stays open although it moved into chapter 2');
  assert.ok(f.unlocked(60),'a new canal opens after its cleared predecessor in play order');
  assert.equal(f.unlocked(21),false,'canals the old order kept locked stay locked');
  const once=JSON.stringify(f.save);f.reorder();assert.equal(JSON.stringify(f.save),once);
  const fresh=fixture();fresh.migrate();fresh.reorder();assert.deepEqual(fresh.save.storyAccess,[0]);
  assert.ok(fresh.unlocked(0));assert.equal(fresh.unlocked(48),false);assert.equal(fresh.unlocked(1),false);
  fresh.save.best[0]=1;assert.ok(fresh.unlocked(STORY_ORDER[1]));assert.equal(fresh.unlocked(STORY_ORDER[2]),false);
});
test('the 2026-10-08 early-curve order keeps every canal the 2026-10-07 order opened and opens by the new order from there',()=>{
  // cleared the first five canals of the 2026-10-07 order: 0, 1, 2, 48, 3 → that order had opened 4 next
  const best={0:3,1:2,2:3,48:1,3:3},f=fixture({best,storyExpansion:1,storyOrder:2,storyAccess:[0,48]});f.reorder();
  assert.deepEqual(f.save.best,best);assert.equal(f.save.storyOrder,3);
  assert.ok(f.unlocked(4),'canal 4 stays open although the new order puts it after canal 14');
  assert.ok(f.unlocked(6),'the jet canal opens after its cleared predecessor in the new order');
  assert.ok(f.unlocked(16),'the canal after cleared canal 3 in the new order opens');
  assert.equal(f.unlocked(7),false,'canals neither order opened stay locked');
  const once=JSON.stringify(f.save);f.reorder();assert.equal(JSON.stringify(f.save),once);
  // chapter 2 and 5 swaps: whatever the old order had reached stays reachable
  const mid=fixture({best:Object.fromEntries(STORY_ORDER_V2.slice(0,22).map(i=>[i,3])),storyOrder:2});mid.reorder();
  assert.ok(mid.unlocked(STORY_ORDER_V2[22]),'the old 23rd canal stays open');
  assert.ok(STORY_ORDER.slice(0,23).every(i=>mid.unlocked(i)),'every canal up to the new 23rd is playable');
  const five=fixture({best:Object.fromEntries(STORY_ORDER_V2.slice(0,48).map(i=>[i,3])),storyOrder:2});five.reorder();
  assert.ok(five.unlocked(39)&&five.unlocked(68),'both whirlpool openers stay playable');
  assert.equal(five.unlocked(42),false,'the third canal of chapter 5 still waits for the second');
  // a save that never ran the 2026-10-07 migration gets both steps in one go
  const old=fixture({best:{0:3,1:3,2:3}});old.reorder();assert.equal(old.save.storyOrder,3);
  assert.ok(old.unlocked(3)&&old.unlocked(48)&&old.unlocked(6),'v1 next canal, v2 next canal and v3 next canal');
});
test('an old pilot import still lands on its own canals before the reorder keeps access',()=>{
  const f=fixture({best:{0:3},pilot:{version:1,best:{p05:2}}});f.migrate();f.reorder();
  assert.deepEqual(f.save.best,{0:3,52:2});assert.ok(f.unlocked(52)&&f.unlocked(53));
  assert.equal(f.save.best[60],undefined,'new canals 60-71 never receive imported records');
});
test('players who rescued all 60 canals before the additions keep their rescue and can play the new canals',()=>{
  const best=Object.fromEntries(Array.from({length:60},(_,i)=>[i,1]));
  const f=fixture({best,storyExpansion:1});f.reorder();assert.equal(f.save.storyRescued,1);
  const firstNew=STORY_ORDER.filter(i=>i>=60&&STORY_ORDER[STORY_POSITION[i]-1]<60);
  assert.ok(firstNew.length>=5);for(const i of firstNew) assert.ok(f.unlocked(i),'new canal '+i+' follows a cleared canal');
  assert.equal(f.unlocked(61),false,'back-to-back new canals still open one at a time');f.save.best[60]=1;assert.ok(f.unlocked(61));
});
