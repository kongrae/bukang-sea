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
function hints({ stored = null, daily = null, free = null, pilot = null, index = 0, cancel = false, noRoute = false } = {}) {
  return new Function('stored', 'DAILY', 'LVL', 'cancel', 'noRoute', 'dailyStageId', 'FREE', 'freeId', 'PILOT', `
    ${engine}
    ${levels}
    let now = 100000, written = stored, tip = '', hint = null, hintRequest = 0, timers = 0, perf = 0;
    const performance = {now: () => (perf += 0.01)};   // 800 solver steps per 8ms slice
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
    const setTimeout = cb => {timers++;if(cancel){hintRequest++;cancel=false;} cb();};
    ${source.match(/^const netPickup = .*$/m)[0]}
    ${hintSource}
    updateHintButton();
    return {show:showHint, wait:hintWait, saved:()=>written, timers:()=>timers, net:i=>{st.nets.push(i);hintRequest++;if(hint)refreshHint();}, usage:()=>hintUsageRecord(), tip:()=>tip,
      status:()=>({...elements.hintBtn,label:elements.hintStatus.textContent}),
      next:()=>{hint=null;hintRequest++;updateHintButton();},
      advance:ms=>{now+=ms;updateHintButton();}};
  `)(stored, typeof daily === 'string' ? {date: daily} : daily, index, cancel, noRoute, dailyStageId, free, freeId, pilot);
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

// The stuck nudge with the production hint allowance and a controllable clock; the frame loop supplies dt.
function nudger({ par = 5, nets = 0 } = {}) {
  return new Function('par', 'nets', `
    let tip = null, pulses = 0, netPulses = 0, hint = null, hintRequest = 0, cleared = false, anim = null, coach = null, now = 1e6;
    const Date = {now: () => now}, save = {hintUsage: {}}, persist = () => {}, LVL = 0, DAILY = null, FREE = null, PILOT = null;
    let restarts = 0;
    const reduceMotion = false, elements = {hintBtn: {disabled: false, offsetWidth: 0, classList: {toggle: (name, on) => { if (name === 'nudge' && on) pulses++; }}},
      restartBtn: {offsetWidth: 0, classList: {toggle: (name, on) => { if (name === 'nudge' && on) restarts++; }}},
      netTool: {offsetWidth: 0, classList: {toggle: (name, on) => { if (name === 'nudge' && on) netPulses++; }}},
      hintStatus: {textContent: ''}, app: {inert: false}, gameScreen: {hidden: false}};
    const $ = id => elements[id], setTip = (text, isHint) => { tip = [text, isHint]; };
    let st = {moves: 0, history: [], nets: []};
    const curLevel = () => ({par}), g = {nets};
    ${source.match(/^const netPickup = .*$/m)[0]}
    ${hintSource}
    return { tick: seconds => { for (let t = 0; t < seconds; t += 0.05) tickHintNudge(0.05); }, tip: () => tip, pulses: () => pulses, netPulses: () => netPulses, restarts: () => restarts,
      move: () => { st.moves++; st.history.push({nets: st.nets.slice()}); }, edit: () => { st.history.push({nets: st.nets.slice()}); st.nets = st.nets.length ? [] : [7]; },
      restart: () => { st = {moves: 0, history: [], nets: []}; },
      set: (key, value) => { if (key === 'inert') elements.app.inert = value; else if (key === 'coach') coach = value; else if (key === 'cleared') cleared = value;
        else if (key === 'hint') hint = value; else if (key === 'used') save.hintUsage['story:0'] = {count: value, lastUsed: now}; else if (key === 'later') now += value; } };
  `)(par, nets);
}

test('stuck nudge: 40 s without a move or edit pulses the hint button once and invites a hint in the tip', () => {
  const idle = nudger(); idle.tick(39.5); assert.equal(idle.pulses(), 0);
  idle.tick(1); assert.equal(idle.pulses(), 1); assert.match(idle.tip()[0], /힌트를 눌러/); assert.equal(idle.tip()[1], true, 'hint style, replaced on the next move');
  idle.tick(120); assert.equal(idle.pulses(), 1, 'once per attempt');
  idle.restart(); idle.tick(41); assert.equal(idle.pulses(), 2, 'a new attempt may nudge again');
  const busy = nudger(); busy.tick(30); busy.move(); busy.tick(30); busy.edit(); busy.tick(30); assert.equal(busy.pulses(), 0, 'moves and net edits restart the wait');
  busy.tick(11); assert.equal(busy.pulses(), 1);
});

test('stuck nudge: passing the star target points at a restart at once; covered, finished, guided or cooling-down play waits', () => {
  const over = nudger({ par: 3 }); for (let k = 0; k < 4; k++) over.move(); over.tick(0.1);
  assert.deepEqual([over.restarts(), over.pulses()], [1, 0]); assert.match(over.tip()[0], /이동이 기준을 넘었어요. 처음부터/);
  const covered = nudger(); covered.set('inert', true); covered.tick(60); assert.equal(covered.pulses(), 0, 'time under a sheet does not count');
  covered.set('inert', false); covered.tick(41); assert.equal(covered.pulses(), 1);
  const guided = nudger(); guided.set('coach', {kind: 'swipe'}); guided.tick(60); assert.equal(guided.pulses(), 0, 'the first-play finger is already guiding');
  const done = nudger(); done.set('cleared', true); done.tick(60); assert.equal(done.pulses(), 0);
  const shown = nudger(); shown.set('hint', {dir: 'U'}); shown.tick(60); assert.equal(shown.pulses(), 0, 'a hint is already on screen');
  const cooling = nudger(); cooling.set('used', 2); cooling.tick(45); assert.equal(cooling.pulses(), 0, 'waits for the hint cooldown');
  cooling.set('later', 13000); cooling.tick(0.1); assert.equal(cooling.pulses(), 1);
});

test('stuck nudge on a net canal with no net placed yet points at the net tool instead of the hint', () => {
  const unused = nudger({ nets: 1 }); unused.tick(41);
  assert.deepEqual([unused.netPulses(), unused.pulses()], [1, 0]); assert.match(unused.tip()[0], /그물 1개를 쓸 수 있어요/);
  const tried = nudger({ nets: 1 }); tried.edit(); tried.edit(); tried.tick(41);
  assert.deepEqual([tried.netPulses(), tried.pulses()], [0, 1], 'a player who placed and took back a net gets the hint invitation');
});

test('a hint search runs in 8ms slices: canal 33 needs a handful of timers, not one per 32 states', async () => {
  const game = hints({index:11});
  await game.show();
  assert.match(game.tip(), /로/); assert.equal(game.usage().count, 1);
  assert.ok(game.timers() < 20, 'timers ' + game.timers());
});

// Background check after each turn: no way out → the tip says so and the undo button pulses; never spends a hint.
function stuckScene(index, pos, nets = [], fixture = null) {
  return new Function('index', 'pos', 'nets', 'fixture', `
    ${engine}
    ${levels}
    let tip = null, undoPulses = 0, hint = null, hintRequest = 0, cleared = false, anim = null, coach = null, now = 1e6, perf = 0;
    const Date = {now: () => now}, performance = {now: () => (perf += 0.01)}, setTimeout = cb => cb();
    const save = {hintUsage: {}}, persist = () => {}, LVL = index, DAILY = null, FREE = null, PILOT = null, reduceMotion = false;
    const elements = {undoBtn: {offsetWidth: 0, classList: {toggle: (name, on) => { if (name === 'nudge' && on) undoPulses++; }}},
      hintBtn: {disabled: false}, hintStatus: {textContent: ''}, app: {inert: false}, gameScreen: {hidden: false}};
    const $ = id => elements[id], setTip = (text, isHint) => { tip = [text, isHint]; };
    const level = fixture || LEVELS[index], g = parseLevel(level), curLevel = () => level;
    let st = {pos: pos.slice(), moves: 1, history: [{}], nets: nets.slice(), boats: g.boats, fish: []};
    const fishMask = () => 0, netSet = () => new Set(st.nets);
    ${source.match(/^const netPickup = .*$/m)[0]}
    ${hintSource}
    return { tick: async () => { tickHintNudge(0.05); tickStuck(); await new Promise(r => r()); await null; await null; },
      tip: () => tip, undoPulses: () => undoPulses, used: () => save.hintUsage, set: (key, value) => { st[key] = value; } };
  `)(index, pos, nets, fixture);
}

test('getting stuck is reported at once with an undo pulse, without spending a hint; a way out stays silent', async () => {
  // a stair of buoys (an earlier canal 2 board): the top-left corner (1,1) has no way back to the stairs
  const stairs = {par: 8, map: ['#######','#...o.E','#.....#','#.o...#','#....o#','#.....#','#.....#','##S####']};
  const stuck = stuckScene(0, [1, 1], [], stairs); await stuck.tick(); for (let k = 0; k < 5; k++) await null;
  assert.equal(stuck.undoPulses(), 1); assert.match(stuck.tip()[0], /나갈 길이 없어요/); assert.deepEqual(stuck.used(), {});
  await stuck.tick(); assert.equal(stuck.undoPulses(), 1, 'once per position');
  const fine = stuckScene(0, [2, 4], [], stairs); await fine.tick(); for (let k = 0; k < 5; k++) await null;
  assert.equal(fine.undoPulses(), 0); assert.equal(fine.tip(), null);
  // first net canal: a net set right below the shark leaves no way out
  const netStart = LEVELS_STORY(24), grid = require('../src/engine').parseLevel(netStart.level);
  const trapped = stuckScene(netStart.index, grid.start, [(grid.start[1] - 1) * grid.w + grid.start[0]]); await trapped.tick(); for (let k = 0; k < 5; k++) await null;
  assert.equal(trapped.undoPulses(), 1);
});
function LEVELS_STORY(position) {
  const { LEVELS, STORY_ORDER } = require('../src/levels'); return { index: STORY_ORDER[position], level: LEVELS[STORY_ORDER[position]] };
}

test('under the set-net rule a net the hint did not ask for re-plans the hint at no cost instead of asking to take it back', async () => {
  const { STORY_ORDER } = require('../src/levels');
  const game = hints({index: STORY_ORDER[24]});
  await game.show(); assert.equal(game.usage().count, 1); assert.match(game.tip(), /밀어 보세요/);
  game.net(22);
  for (let k = 0; k < 40; k++) await null;
  assert.doesNotMatch(game.tip(), /걷어요/); assert.match(game.tip(), /힌트: /); assert.equal(game.usage().count, 1, 'a re-plan spends nothing');
});
