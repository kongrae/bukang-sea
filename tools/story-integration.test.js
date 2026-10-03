const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const E = require('../src/engine'), { LEVELS, CHAPTERS, STORY_EXTENSION_LEVELS } = require('../src/levels');
const { PILOT_LEVELS } = require('../src/pilot');
const source = fs.readFileSync(path.join(__dirname,'../src/game.js'),'utf8');
const fn = name => source.match(new RegExp(`^function ${name}\\([^\\n]*}\\s*$`,'m'))?.[0]
  || source.match(new RegExp(`function ${name}\\([^]*?\\n}`))?.[0];
function fixture(stored = {}) {
  const functions=['persist','levelSignature','copyTurn','restoreSession','storyLevel','storyResumeId','storySession','migratePilotToStory','refreshSkins'].map(fn).join('\n');
  const skins=source.slice(source.indexOf('const SKINS ='),source.indexOf('// adds newly earned skins'));
  return new Function('stored',`
    ${fs.readFileSync(path.join(__dirname,'../src/engine.js'),'utf8')}
    ${fs.readFileSync(path.join(__dirname,'../src/levels.js'),'utf8')}
    const save=Object.assign({best:{},sessions:{},hintUsage:{},owned:['basic'],skin:'basic',daily:{}},JSON.parse(JSON.stringify(stored)));
    const STORE_KEY='isolated-test',localStorage={setItem:()=>{}},journalTotals=()=>({visits:0,operations:0});
    ${source.match(/^const unlocked = .*$/m)[0]}
    ${skins}
    ${functions}
    return {save,migrate:migratePilotToStory,unlocked,session:storySession,resume:storyResumeId,refresh:refreshSkins,total:totalStars};
  `)(stored);
}
function record(index, id = index, move = null) {
  const level=LEVELS[index],g=E.parseLevel(level);
  const start={pos:g.start.slice(),dir:'U',fish:[],nets:[],boats:g.boats.map(b=>b.slice()),moves:0,...(g.switches.length?{gate:0}:{})};
  const state={...start,history:[]};
  if(move){const r=E.turn(g,state.pos,move,new Set(),state.boats,state.gate);Object.assign(state,{pos:r.end,dir:move,boats:r.boats,moves:1,gate:r.gate,history:[start]});}
  return {version:1,id,layout:JSON.stringify([level.map,level.nets||0]),state};
}
test('main story has 60 unique slots and preserves the original 48 layouts, names, roles and star targets',()=>{
  assert.equal(LEVELS.length,60);assert.equal(CHAPTERS.reduce((n,c)=>n+c.count,0),60);
  assert.deepEqual(CHAPTERS.map(c=>c.count),[12,12,12,12,4,8]);
  const digest=crypto.createHash('sha256').update(JSON.stringify(LEVELS.slice(0,48).map(l=>[l.name,l.map,l.nets||0,l.par,l.role||'regular']))).digest('hex');
  assert.equal(digest,'7cb76224cd60f7be12c12d094e7653e3304b9eaec8584e761e53f3eecc2952ae');
  assert.deepEqual(LEVELS.slice(48),PILOT_LEVELS);assert.equal(PILOT_LEVELS,STORY_EXTENSION_LEVELS);
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
