const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const E = require('../src/engine');
const D = require('../src/daily');
const { replayPlan } = require('./replay-plan');
const source = fs.readFileSync(path.join(__dirname, '../src/game.js'), 'utf8');
const dailySource = fs.readFileSync(path.join(__dirname, '../src/daily.js'), 'utf8');
const engineSource = fs.readFileSync(path.join(__dirname, '../src/engine.js'), 'utf8');
const functionSource = name => {
  const match = source.match(new RegExp(`^function ${name}\\([^\\n]*}\\s*$`, 'm'))
    || source.match(new RegExp(`function ${name}\\([^]*?\\n}`));
  assert.ok(match, name); return match[0];
};

// Production storage, daily UI handlers, checkpoint validation and completion; only DOM/rendering is silent.
function operation(stored = null) {
  const storage = source.slice(source.indexOf('const STORE_KEY'), source.indexOf('const unlocked'));
  const daily = source.slice(source.indexOf('/* ---------- daily canal: record'), source.indexOf('/* ---------- my shark:'));
  const functions = ['levelSignature', 'copyTurn', 'restoreSession', 'dailySessionKey', 'dailySessionRecord', 'dailySession', 'checkpoint', 'freshState', 'loadDaily', 'onClear'].map(functionSource).join('\n');
  return new Function('stored', 'NativeDate', `
    ${engineSource}
    ${dailySource}
    let today = '2026-09-30', written = stored, tickHook = null;
    const Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [today + 'T12:00:00'])); } };
    const elements = new Map();
    const $ = id => {
      if (!elements.has(id)) elements.set(id, {hidden:true, textContent:'', innerHTML:'', disabled:false,
        focus(){}, setAttribute(){}, querySelectorAll(){return [];}, classList:{toggle(){}}});
      return elements.get(id);
    };
    const localStorage = {getItem:()=>written,setItem:(key,value)=>{written=value;}};
    ${storage}
    const noop = () => {}, sfx = {win:noop}, haptic = noop, refreshSkins = () => [];
    const renderLevelGrid = noop, chapterOf = () => ({end:47,name:'외항'}), LEVELS = Array(48);
    const reduceMotion = true, setTimeout = cb => {if(tickHook){const hook=tickHook;tickHook=null;hook();}cb();};
    let DAILY = null, LVL = 0, g, st, anim = null, cleared = false, deco = 0;
    const curLevel = () => DAILY.level;
    const show = which => {$('gameScreen').hidden=which!=='game'; if(which==='title') cleared=false;};
    const enter = (level,keep,label) => {st=keep||freshState(level);g=parseLevel(level);cleared=false;$('lvNum').textContent=label;checkpoint();};
    ${functions}
    ${daily}
    return {
      open:openDaily,close:closeDaily,start:startDaily,next:continueDaily,legacy:resumeLegacyDaily,
      progress:(date=today)=>dailyProgress(date),saved:()=>written,record:recordDailyStage,streak:dailyStreak,
      save:()=>JSON.parse(JSON.stringify(save)),element:id=>$ (id),
      active:()=>DAILY,state:()=>st,load:loadDaily,
      date:d=>{today=d;},onYield:hook=>{tickHook=hook;},
      clear:(stars=3)=>{st.fish=stars>=2?g.fish.map((_,i)=>i):[];st.moves=DAILY.level.par+(stars===2?1:0);onClear();},
      move:d=>{const r=slide(g,st.pos,d,new Set(st.nets),st.boats);if(!r.path.length||r.win)return;
        st.history.push(copyTurn(st));st.pos=r.end;st.dir=d;st.moves++;
        for(const [x,y] of r.path)g.fish.forEach(([fx,fy],i)=>{if(x===fx&&y===fy&&!st.fish.includes(i))st.fish.push(i);});
        st.boats=stepBoats(g,st.boats,st.pos[1]*g.w+st.pos[0],new Set(st.nets));checkpoint();}
    };
  `)(stored, Date);
}

test('90 days of three deterministic stages replay under actual rules, with increasing move budgets', () => {
  const hash = crypto.createHash('sha256');
  for (let day=0; day<90; day++) {
    const date = new Date(Date.UTC(2026,8,30+day)).toISOString().slice(0,10), layouts = new Set();
    let previous = 0;
    for (let stage=0; stage<3; stage++) {
      const daily=D.makeDailyStage(date,stage), tier=D.DAILY_STAGES[stage];
      assert.ok(daily, `${date} stage ${stage}`);
      hash.update(JSON.stringify([daily.date,daily.stage,daily.version,daily.level.map,daily.level.nets,daily.level.par]));
      const g=E.parseLevel(daily.level), full=E.plan(g,g.start,0,new Set(),g.nets,true), escape=E.plan(g,g.start,0,new Set(),g.nets,false);
      replayPlan(g,full); replayPlan(g,escape,{needAll:false});
      assert.ok(full.moves>=tier.min&&full.moves<=tier.max);
      assert.ok(full.moves>previous&&full.moves>escape.moves); previous=full.moves;
      assert.ok(escape.moves>=tier.escape);
      assert.equal(daily.level.par,full.moves+tier.slack);
      if(g.nets) assert.equal(E.plan(g,g.start,0,new Set(),0,true),null,'nets must matter');
      layouts.add(JSON.stringify(daily.level.map));
      if(day<7) assert.deepEqual(D.makeDailyStage(date,stage),daily,'same date and stage');
    }
    assert.equal(layouts.size,3);
  }
  assert.equal(hash.digest('hex'),'870b36b66efd14e44630a5b6991fe5b1b7df53347d4720adb29fcd5e3f308d67','operation v1 layouts and star targets remain stable');
});

test('reserve routes satisfy the same stage difficulty and star rules', () => {
  D.DAILY_FALLBACKS.forEach((level,stage)=>{
    const g=E.parseLevel(level), tier=D.DAILY_STAGES[stage];
    const full=E.plan(g,g.start,0,new Set(),g.nets,true), escape=E.plan(g,g.start,0,new Set(),g.nets,false);
    replayPlan(g,full);
    assert.ok(full.moves>=tier.min&&full.moves<=tier.max);
    assert.ok(escape.moves>=tier.escape&&full.moves>escape.moves);
    assert.equal(level.par,full.moves+tier.slack);
  });
});

test('one clear retains attendance; three clears complete the operation; replay cannot reduce or duplicate stars', async () => {
  const game=operation(JSON.stringify({best:{0:3},daily:{'2026-09-29':2},owned:['basic','lighthouse'],hintUsage:{},sessions:{}}));
  game.open(); await game.start(1); assert.equal(game.active(),null,'locked stage');
  await game.start(0); game.clear(1);
  assert.equal(game.progress().count,1); assert.equal(game.streak(),2);
  assert.equal(game.element('nextBtn').textContent,'다음 수로');
  for(const stage of [1,2]) {game.open();await game.start(stage);game.clear(3);}
  assert.equal(game.progress().count,3); assert.equal(game.progress().total,7);
  assert.equal(game.element('clearTitle').textContent,'오늘의 구조작전 완료!');
  assert.equal(game.element('operationStamp').hidden,false);
  game.open(); await game.start(1); game.clear(1);
  assert.deepEqual(game.progress().stars,[1,3,3]);
  assert.deepEqual(game.save().best,{0:3}); assert.deepEqual(game.save().owned,['basic','lighthouse']);
});

test('reload restores the correct stage and turn while keeping story sessions independent', async () => {
  const game=operation(JSON.stringify({best:{0:3},sessions:{story:{id:0,keep:'story'}}}));
  game.open();await game.start(0);game.clear();game.open();await game.start(1);
  const g=E.parseLevel(game.active().level), plan=E.plan(g,g.start,0,new Set(),g.nets,true);
  game.move(plan.seq[0]);assert.equal(game.state().moves,1);
  const next=operation(game.saved());next.open();await next.start(1);
  assert.deepEqual(next.state(),game.state());
  assert.deepEqual(next.save().sessions.story,{id:0,keep:'story'});
  const stageTwo=JSON.parse(JSON.stringify(next.state()));
  next.open();await next.start(0);next.clear();
  next.open();await next.start(1);
  assert.deepEqual(next.state(),stageTwo,'replaying an earlier stage preserves the unfinished later stage');
  next.date('2026-10-01');next.open();assert.equal(next.save().sessions.daily,undefined);
  assert.equal(next.progress().count,0);assert.equal(next.progress('2026-09-30').count,1);
});

test('old single-puzzle records and unfinished layout survive migration without crediting unplayed new stages', async () => {
  const old=D.makeDaily('2026-09-30'), setup=operation();setup.load(old);setup.move('U');
  const stored=setup.save();stored.daily={'2026-09-29':3};stored.sessions.daily=stored.sessions.dailyLegacy;delete stored.sessions.dailyLegacy;
  stored.best={0:3};stored.owned=['basic','sakura'];stored.skin='sakura';
  const game=operation(JSON.stringify(stored));game.open();
  assert.equal(game.element('dailyLegacyBtn').hidden,false);
  await game.start(0);assert.ok(game.save().sessions.dailyLegacy,'new play does not overwrite legacy');
  game.open();game.legacy();assert.equal(game.state().moves,setup.state().moves);
  game.clear();assert.equal(game.streak(),2);assert.equal(game.progress().count,0);
  assert.equal(game.save().sessions.dailyLegacy,undefined);assert.ok(game.save().sessions.daily);
  assert.equal(game.save().skin,'sakura');assert.deepEqual(game.save().best,{0:3});
});

test('leaving or midnight during generation cancels entry; finishing yesterday credits only yesterday', async () => {
  const game=operation();game.open();game.onYield(()=>game.close());await game.start(0);
  assert.equal(game.active(),null);assert.equal(game.save().sessions.daily,undefined);
  game.open();game.onYield(()=>game.date('2026-10-01'));await game.start(0);
  assert.equal(game.active(),null);assert.match(game.element('operationStatus').textContent,/날짜가 바뀌어/);
  game.open();await game.start(0);game.date('2026-10-02');game.clear();
  assert.equal(game.progress().count,0);assert.equal(game.progress('2026-10-01').count,1);
  assert.equal(game.element('nextBtn').textContent,'오늘의 작전');
  game.next();assert.equal(game.element('dailyOverlay').hidden,false);
});
