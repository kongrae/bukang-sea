const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../src/engine');
const F = require('../src/free');
const { replayPlan } = require('./replay-plan');
const read = name => fs.readFileSync(path.join(__dirname, '../src/', name + '.js'), 'utf8');
const source = read('game');
const functionSource = name => {
  const match = source.match(new RegExp(`^function ${name}\\([^\\n]*}\\s*$`, 'm')) || source.match(new RegExp(`function ${name}\\([^]*?\\n}`));
  assert.ok(match, name); return match[0];
};

// Production storage, generation, mode entry, checkpoint and clear handlers; only rendering/DOM are replaced.
function scene(stored = null, seeds = [42, 97, 123, 256]) {
  const storage = source.slice(source.indexOf('const STORE_KEY'), source.indexOf('const unlocked'));
  const free = source.slice(source.indexOf('/* ---------- free canals:'), source.indexOf('/* ---------- rendering ---------- */'));
  const rewardSource = source.slice(source.indexOf('/* ---------- reward presentation:'), source.indexOf('function onClear()'));
  const functions = ['levelSignature','copyTurn','restoreSession','checkpoint','freshState','loadFree','onClear'].map(functionSource).join('\n');
  return new Function('stored','seeds', `
    ${read('engine')}
    ${read('variety')}
    ${read('variety-reserves')}
    ${read('daily')}
    ${read('free')}
    let written=stored,hook=null,FREE=null,DAILY=null,LVL=0,g,st,anim=null,cleared=false,deco=0;
    const elements=new Map(),noop=()=>{},localStorage={getItem:()=>written,setItem:(key,value)=>written=value};
    const $=id=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',innerHTML:'',inert:false,
      focus:noop,setAttribute:noop,querySelectorAll:()=>[],classList:{toggle:noop}});return elements.get(id);};
    const crypto={getRandomValues:a=>{a[0]=seeds.shift()??42;return a;}},globalThis={crypto};
    const setTimeout=cb=>{if(hook){const once=hook;hook=null;once();}cb();};
    ${storage}
    const reduceMotion=true,sfx={win:noop},haptic=noop,renderLevelGrid=noop,refreshSkins=()=>[],earnedJournalRewards=()=>[];
    const chapterOf=()=>({end:11,ci:0}),LEVELS=Array(48),curLevel=()=>FREE.level;
    const show=which=>{$('gameScreen').hidden=which!=='game';if(which==='title'){cleared=false;$('clearOverlay').hidden=true;}};
    const enter=(level,keep,label)=>{g=parseLevel(level);st=keep||freshState(level);cleared=false;$('lvNum').textContent=label;checkpoint();};
    // Business harnesses omit visual exits; actual sheet lifecycle is covered by sheet-motion.test.js.
    const openSheet=id=>{$(id).hidden=false;$('app').inert=true;};
    const closeSheet=id=>{$(id).hidden=true;$('app').inert=false;};
    const document={hidden:false};
    const renderSuspended=()=>document.hidden;
    ${rewardSource}
    ${functions}
    ${free}
    return {open:openFree,close:closeFree,start:startFree,record:recordFreeClear,element:$,
      saved:()=>written,save:()=>JSON.parse(JSON.stringify(save)),run:()=>FREE,state:()=>JSON.parse(JSON.stringify(st)),
      hook:fn=>{hook=fn;},generator:fn=>{makeFreeSearch=fn;freeCache.clear();},
      hint:()=>{save.hintUsage[freeId(FREE)]={count:2,lastUsed:123456};persist();},
      replay:()=>loadFree(FREE),
      move:step=>{st.history.push(copyTurn(st));st.nets=step.nets.slice();
        const result=slide(g,st.pos,step.dir,new Set(st.nets),st.boats);
        if(!result.path.length)throw Error('blocked test step');
        for(const [x,y] of result.path)g.fish.forEach(([fx,fy],i)=>{if(x===fx&&y===fy&&!st.fish.includes(i))st.fish.push(i);});
        st.pos=result.end;st.dir=step.dir;st.moves++;
        if(result.win)onClear();else{st.boats=stepBoats(g,st.boats,st.pos[1]*g.w+st.pos[0],new Set(st.nets));checkpoint();}},
      finish:(stars=3)=>{st.fish=stars>=2?g.fish.map((_,i)=>i):[];st.moves=FREE.level.par+(stars===2?1:0);onClear();}
    };
  `)(stored, seeds.slice());
}

test('300 seeds per difficulty are deterministic, solvable and meet the actual move targets', () => {
  let count=0;
  for(let difficulty=0;difficulty<3;difficulty++) {
    const tier=F.FREE_TIERS[difficulty];
    for(let seed=0;seed<300;seed++) {
      const run=F.makeFree(seed,difficulty),g=E.parseLevel(run.level);
      assert.deepEqual(F.makeFree(seed,difficulty),run);
      const full=E.plan(g,g.start,0,new Set(),g.nets,true),escape=E.plan(g,g.start,0,new Set(),g.nets,false);
      replayPlan(g,full);replayPlan(g,escape,{needAll:false});
      assert.ok(full.moves>=tier.min&&full.moves<=tier.max,`${difficulty}/${seed}: full ${full.moves}`);
      assert.equal(run.level.par,full.moves+tier.slack);
      assert.ok(escape.moves>=tier.escape&&escape.moves<full.moves);
      if(g.nets)assert.equal(E.plan(g,g.start,0,new Set(),0,true),null,'net challenge must require nets');
      count++;
    }
  }
  assert.equal(count,900);
});

test('generator yields during work and validates seed/difficulty boundaries', () => {
  const search=F.makeFreeSearch(0xffffffff,2);assert.equal(search.next().done,false);
  let step;do{step=search.next();}while(!step.done);
  assert.deepEqual(step.value,F.makeFree(0xffffffff,2));
  for(const [seed,difficulty] of [[-1,0],[2**32,0],[1.1,0],[1,-1],[1,3],[1,'0']]) assert.equal(F.makeFree(seed,difficulty),null);
});

test('all three difficulty checkpoints survive reload, with story/daily/journal/skins unchanged', async () => {
  const prior={best:{0:3},last:1,owned:['basic','sakura'],skin:'sakura',daily:{'2026-09-30':3},
    journal:{version:1,days:{'2026-09-30':1}},sessions:{story:{id:1},daily:{id:'2026-10-01:v1:0'},dailyStages:{0:{keep:true}}}};
  const game=scene(JSON.stringify(prior)),turns=[];
  for(let difficulty=0;difficulty<3;difficulty++) {
    game.open();await game.start(difficulty);
    const g=E.parseLevel(game.run().level),plan=E.plan(g,g.start,0,new Set(),g.nets,true);
    game.move(plan.steps[0]);turns.push(game.state());
  }
  const after=game.save();
  for(const key of ['best','last','owned','skin','daily','journal'])assert.deepEqual(after[key],prior[key]);
  for(const key of ['story','daily','dailyStages'])assert.deepEqual(after.sessions[key],prior.sessions[key]);
  const reloaded=scene(game.saved());
  for(let difficulty=0;difficulty<3;difficulty++) {
    reloaded.open();await reloaded.start(difficulty);assert.deepEqual(reloaded.state(),turns[difficulty]);
    assert.match(reloaded.element('lvNum').textContent,/자유 수로/);
  }
});

test('real solutions clear the free mode, count each run once, retain best stars and isolate rewards', async () => {
  const game=scene();game.open();await game.start(2);
  const g=E.parseLevel(game.run().level),plan=E.plan(g,g.start,0,new Set(),g.nets,true);
  for(const step of plan.steps)game.move(step);
  assert.deepEqual(game.save().free.completed,[0,0,1]);assert.equal(game.save().free.runs[2].stars,3);
  assert.equal(game.save().sessions.free2,undefined);assert.deepEqual(game.save().best,{});assert.deepEqual(game.save().daily,{});
  assert.deepEqual(game.save().journal.days,{});assert.equal(game.element('clearTitle').textContent,'자유 수로 구출 성공!');
  assert.equal(game.element('nextBtn').textContent,'새 수로');assert.equal(game.element('clearStory').hidden,true);
  game.replay();game.finish(1);assert.equal(game.save().free.completed[2],1);assert.equal(game.save().free.runs[2].stars,3);
  const restored=scene(game.saved(),Array(12).fill(97));restored.open();await restored.start(2,false,true);restored.finish(2);
  assert.equal(restored.save().free.completed[2],1);
  restored.open();await restored.start(2,true);restored.finish(1);assert.equal(restored.save().free.completed[2],2);
});

test('a v1 run resumes its exact board and turns; requesting a new run upgrades only that difficulty', async () => {
  const old=F.makeFree(42,0,1),g=E.parseLevel(old.level),plan=E.plan(g,g.start,0,new Set(),g.nets,true);
  const game=scene();game.generator(function*(){return old;});game.open();await game.start(0);game.move(plan.steps[0]);game.hint();
  const reload=scene(game.saved(),Array(12).fill(97));reload.open();await reload.start(0);
  assert.equal(reload.run().version,1);assert.deepEqual(reload.run().level.map,old.level.map);assert.deepEqual(reload.state(),game.state());
  reload.open();await reload.start(0,true);assert.equal(reload.run().version,2);assert.equal(reload.run().serial,2);
  assert.equal(reload.save().hintUsage[F.freeId(old)],undefined);
});

test('successive free requests avoid six recent boards and prefer a different idea, including after reload', async () => {
  const V=require('../src/variety');let game=scene(null,Array.from({length:150},(_,i)=>i));const keys=[];
  for(let i=0;i<18;i++) {
    const previous=game.run();game.open();await game.start(0,true);const run=game.run();
    assert.equal(run.serial,i+1,'new request must succeed');
    const key=V.varietyLayoutKey(run.level);assert.ok(!keys.slice(-6).includes(key));keys.push(key);
    if(previous)assert.notEqual(run.level.family,previous.level.family);
    if(i===8)game=scene(game.saved(),Array.from({length:150},(_,j)=>j+100));
  }
  assert.equal(game.save().free.recent[0].length,6);
});

test('new puzzle is distinct, replaces only its difficulty and resets only that run hint allowance', async () => {
  const game=scene(null,[42,97,42,123]);
  game.open();await game.start(0);game.hint();const old=game.run();
  game.open();await game.start(1);game.hint();const other=game.save().sessions.free1;
  game.open();await game.start(0,true);const next=game.run();
  assert.equal(next.serial,2);assert.notDeepEqual(next.level.map,old.level.map,'same seed/map is rejected before committing');
  assert.equal(game.save().hintUsage[F.freeId(old)],undefined);
  assert.equal(Object.keys(game.save().hintUsage).length,1);assert.deepEqual(game.save().sessions.free1,other);
  assert.equal(game.state().moves,0);
});

test('closing during preparation and failed or repeated generation preserve the previous run and hints', async () => {
  const game=scene(null,[42,42,42,42,42,42]);game.open();await game.start(0);game.hint();const before=game.save();
  game.open();game.hook(()=>game.close());await game.start(0,true);
  assert.deepEqual(game.save(),before);assert.equal(game.element('freeOverlay').hidden,true);
  game.open();await game.start(0,true);assert.deepEqual(game.save(),before);
  assert.match(game.element('freeStatus').textContent,/기존 진행은 남아/);
  game.generator(function*(){throw Error('search failure');});await game.start(0,true);assert.deepEqual(game.save(),before);
});

test('malformed free storage and mismatched checkpoints do not corrupt existing progress', async () => {
  for(const free of [null,[],{version:1,runs:{},completed:['3',-1,Infinity]}]) {
    const game=scene(JSON.stringify({best:{0:3},free}));game.open();await game.start(0);
    assert.equal(game.run().difficulty,0);assert.deepEqual(game.save().best,{0:3});assert.deepEqual(game.save().free.completed,[0,0,0]);
  }
  const game=scene();game.open();await game.start(0);const saved=game.save();
  saved.sessions.free0.layout='changed';const reload=scene(JSON.stringify(saved));reload.open();await reload.start(0);
  assert.equal(reload.state().moves,0);assert.equal(reload.run().seed,42);
  saved.free.runs[0].layout='changed';const incompatible=scene(JSON.stringify(saved));incompatible.open();await incompatible.start(0);
  assert.equal(incompatible.run(),null);assert.match(incompatible.element('freeStatus').textContent,/기존/);
  await incompatible.start(0,true);assert.equal(incompatible.run().serial,2);
});
