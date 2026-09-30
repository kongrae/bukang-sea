const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/game.js'), 'utf8');
const engine = fs.readFileSync(path.join(__dirname, '../src/engine.js'), 'utf8');
const levels = fs.readFileSync(path.join(__dirname, '../src/levels.js'), 'utf8');
const hintSource = source.slice(source.indexOf('/* ---------- hint allowance'), source.indexOf('function onClear()'));
const { dailyStageId } = require('../src/daily.js');
const { freeId } = require('../src/free.js');

// Execute the actual hint handler, solver and allowance with a controllable wall clock.
function hints({ stored = null, daily = null, free = null, index = 0, cancel = false, noRoute = false } = {}) {
  return new Function('stored', 'DAILY', 'LVL', 'cancel', 'noRoute', 'dailyStageId', 'FREE', 'freeId', `
    ${engine}
    ${levels}
    let now = 100000, written = stored, tip = '', hint = null, hintRequest = 0;
    const Date = {now: () => now}, DIR_KO = {U:'위로',D:'아래로',L:'왼쪽으로',R:'오른쪽으로'};
    const save = stored ? JSON.parse(stored) : {best:{0:3}, owned:['basic','sakura'], hintUsage:{}};
    if (!save.hintUsage || typeof save.hintUsage !== 'object' || Array.isArray(save.hintUsage)) save.hintUsage = {};
    const persist = () => {written = JSON.stringify(save);};
    const elements = {hintBtn:{disabled:false},hintStatus:{textContent:''},gameScreen:{hidden:false}};
    const $ = id => elements[id], settingsOpen = () => false, guideOpen = () => false, haptic = () => {};
    const setTip = text => {tip = text;};
    const g = parseLevel(noRoute ? {map:['#####','#S#E#','#####']} : LEVELS[LVL]);
    const st = {pos:g.start.slice(),nets:[],boats:g.boats,moves:0};
    const anim = null, cleared = false, netSet = () => new Set(st.nets), fishMask = () => 0;
    const setTimeout = cb => {if(cancel){hintRequest++;cancel=false;} cb();};
    ${hintSource}
    updateHintButton();
    return {show:showHint, wait:hintWait, saved:()=>written, usage:()=>hintUsageRecord(), tip:()=>tip,
      status:()=>({...elements.hintBtn,label:elements.hintStatus.textContent}),
      next:()=>{hint=null;hintRequest++;updateHintButton();},
      advance:ms=>{now+=ms;updateHintButton();}};
  `)(stored, typeof daily === 'string' ? {date: daily} : daily, index, cancel, noRoute, dailyStageId, free, freeId);
}

test('free hints persist for the same run and reset only for a different run or difficulty', async () => {
  const free = {version:1,difficulty:0,seed:42,serial:1}, game = hints({free});
  await game.show(); game.next(); await game.show();
  assert.equal(hints({stored:game.saved(),free}).wait(),12);
  assert.equal(hints({stored:game.saved(),free:{...free,serial:2}}).usage().count,0);
  assert.equal(hints({stored:game.saved(),free:{...free,difficulty:1}}).usage().count,0);
  assert.equal(hints({stored:game.saved()}).usage().count,0);
  assert.equal(hints({stored:game.saved(),daily:'2026-10-01'}).usage().count,0);
});

test('each operation stage has its own persistent allowance, independent of legacy hints', async () => {
  const first = {date:'2026-09-30',stage:0,version:1};
  const game = hints({daily:first});
  await game.show(); game.next(); await game.show(); game.next();
  assert.equal(hints({stored:game.saved(),daily:first}).wait(),12);
  assert.equal(hints({stored:game.saved(),daily:{...first,stage:1}}).usage().count,0);
  assert.equal(hints({stored:game.saved(),daily:first.date}).usage().count,0);
});

test('two immediate hints, then a 12-second wait for each new hint', async () => {
  const game = hints();
  assert.equal(game.status().label, '바로 2회');
  await game.show();
  game.next();
  assert.equal(game.status().label, '바로 1회');
  await game.show();
  game.next();
  assert.deepEqual(game.status(), {disabled:true,label:'12초 후'});
  await game.show();
  assert.equal(game.usage().count, 2, 'keyboard cannot bypass the wait');
  game.advance(11999);
  assert.equal(game.wait(), 1);
  game.advance(1);
  assert.equal(game.status().disabled, false);
  await game.show();
  assert.equal(game.usage().count, 3);
  game.next();
  assert.equal(game.wait(), 12);
});

test('redisplaying the same hint does not consume another allowance', async () => {
  const game = hints({index:11});
  await game.show();
  const instruction = game.tip();
  await game.show();
  assert.equal(game.tip(), instruction);
  assert.equal(game.usage().count, 1);
  assert.equal(game.status().label, '다시 보기');
});

test('saved allowance survives restart/reload and leaves stars and skins intact', async () => {
  const game = hints();
  await game.show(); game.next(); await game.show();
  const record = JSON.parse(game.saved());
  assert.deepEqual(record.best, {0:3});
  assert.deepEqual(record.owned, ['basic','sakura']);
  const resumed = hints({stored:game.saved()});
  assert.equal(resumed.wait(), 12);
  assert.equal(resumed.usage().count, 2);
  assert.equal(hints({stored:game.saved(),index:1}).usage().count, 0);
  assert.equal(hints({stored:game.saved(),daily:'2026-09-30'}).usage().count, 0);
});

test('daily allowance belongs to that date; a new day starts with two instant hints', async () => {
  const game = hints({daily:'2026-09-30'});
  await game.show(); game.next(); await game.show();
  assert.equal(hints({stored:game.saved(),daily:'2026-09-30'}).wait(), 12);
  assert.equal(hints({stored:game.saved(),daily:'2026-10-01'}).usage().count, 0);
});

test('cancelled search and an unsolvable position do not consume hints', async () => {
  const cancelled = hints({cancel:true});
  await cancelled.show();
  assert.equal(cancelled.usage().count, 0);
  assert.equal(cancelled.status().disabled, false);
  const blocked = hints({noRoute:true});
  await blocked.show();
  assert.equal(blocked.usage().count, 0);
  assert.ok(blocked.tip().includes('되돌리기'));
});

test('older and malformed hint records stay playable', async () => {
  const legacy = hints({stored:JSON.stringify({best:{0:3},owned:['basic']})});
  await legacy.show();
  assert.equal(legacy.usage().count, 1);
  const invalid = hints({stored:JSON.stringify({best:{},hintUsage:{'story:0':{count:-1,lastUsed:0}}})});
  assert.equal(invalid.status().label, '바로 2회');
});
