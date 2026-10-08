const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/game.js'), 'utf8');
const { dailyStageId } = require('../src/daily.js');
const LEVELS = new Function(fs.readFileSync(path.join(__dirname, '../src/levels.js'), 'utf8') + '; return LEVELS;')();

// Run the production movement/frame/render functions with a silent canvas and sound output.
// Capturing drawBoat coordinates tests visible turn order; this does not test sprite pixels or device touch.
function game({ reduced = false, index = 5, level = LEVELS[index], stored = null, daily = null, storageFails = false } = {}) {
  const functionSource = name => {
    const found = source.match(new RegExp(`^function ${name}\\([^\\n]*}\\s*$`, 'm'))
      || source.match(new RegExp(`function ${name}\\([^]*?\\n}`));
    assert.ok(found, 'missing production function ' + name);
    return found[0];
  };
  const easing = source.slice(source.indexOf('function easeTable('), source.indexOf('/* ---------- drawing primitives'));
  const functions = ['hash', 'persist', 'levelSignature', 'copyTurn', 'restoreSession', 'dailySessionKey', 'checkpoint', 'pauseGame', 'freshState', 'netSet', 'pushHistory', 'tryMove', 'eatFish', 'landShark', 'finishAnim', 'undo', 'tapTile', 'step', 'draw', 'updateNetStatus'].map(functionSource).join('\n');
  const effects = source.slice(source.indexOf('// effects live in tile units;'), source.indexOf('function loadLevel('));
  const engine = fs.readFileSync(path.join(__dirname, '../src/engine.js'), 'utf8');
  return new Function('level', 'reduceMotion', 'LVL', 'stored', 'DAILY', 'storageFails', 'dailyStageId', `
    ${engine}
    ${easing}
    ${source.match(/^const ANG = .*$/m)[0]}
    const noop = () => {}, sounds = [], sfx = new Proxy({}, {get: (_,name) => (...args) => sounds.push({name,args,clock})});
    const ctx = new Proxy({}, {get: (target, key) => key in target ? target[key] : noop});
    const C = {}, T = 40, dpr = 1, OX = 0, OY = 0, CW = 360, CH = 640;
    const staticLayer = {}, waterPath = {}, caustic = {}, causticPat = {};
    const elements = new Map();
    const $ = id => {
      if (!elements.has(id)) { const names = new Set(); elements.set(id, {hidden: false, setAttribute(k, v) { this[k] = v; }, classList: {contains: n => names.has(n), toggle: (n, on = !names.has(n)) => (on ? names.add(n) : names.delete(n), on), add: n => names.add(n), remove: n => names.delete(n)}}); }
      return elements.get(id);
    };
    const tips = [], haptic = noop, updateHud = updateNetStatus, coachDone = noop, setupCoach = noop, setTip = text => tips.push(text), refreshHint = noop;
    const drawExit = noop, drawJet = noop, drawBuoy = noop, drawWhirl = noop, drawFish = noop, css = {getPropertyValue: () => 'sans-serif'};
    const save = stored ? JSON.parse(stored) : {best: {}, coachNet: true, sessions: {}}, curLevel = () => level;
    const STORE_KEY = 'test'; let written = stored, gest = null, FREE = null, PILOT = null;
    const localStorage = {setItem: (key, value) => {if (storageFails) throw Error('quota'); written = value;}};
    const wake = [], particles = [], jetFlash = new Map(), netPop = new Map(), contactPulse = new Map(), netRetract = new Map();
    let g, st, anim = null, hint = null, bump = null, settle = null, pop = null, queued = null, coach = null, exitZoom = null, deviceSpot = null;
    const EXIT_ZOOM = { scale: .06, dur: .45 }, sandSeen = new Map(), DEVICE_SPOT = { dur: 1.8, pulses: 3 }, flights = [];
    const flyFish = (x, y) => flights.push([x, y]);
    let cleared = false, clock = 0, hintRequest = 0, deco = 0, boatsDrawn = [], sharkDrawn, netsDrawn = [], dentsDrawn = [];
    const drawSandDent = (ctx, x, y, T, ang, k) => dentsDrawn.push([x / T, y / T, +ang.toFixed(3), +k.toFixed(3)]);
    const drawShark = (...args) => sharkDrawn = args.slice(1), drawNet = (...args) => netsDrawn.push(args.slice(1));
    const drawBoat = (ctx, x, y) => boatsDrawn.push([x / T - 0.5, y / T - 0.5]);
    const onClear = () => {cleared = true;};
    ${source.match(/^function markDevicesSeen\(.*$/m)[0]}
    ${source.match(/^let netCallout = .*$/m)[0]}
    ${source.match(/^const netsKnown = .*$/m)[0]}
    ${source.match(/^const NO_NETS_TIP = .*$/m)[0]}
    ${effects}
    ${functions}
    st = freshState(level);
    const packet = save.sessions[DAILY ? 'daily' : 'story'];
    const resumed = restoreSession(packet, level, DAILY ? dailyStageId(DAILY) : LVL);
    if (resumed) st = resumed;
    updateNetStatus();
    const view = {x: st.pos[0], y: st.pos[1], ang: ANG.U, target: ANG.U};
    return {
      move: tryMove, tick: step, undo, tap: tapTile, pause: pauseGame, checkpoint,
      stored: () => written,
      netTool: () => ({shown: !$('netTool').hidden, nets: $('netTool').classList.contains('has-nets'), left: $('netToolCount').hidden ? null : $('netToolCount').textContent,
        label: $('netToolLabel').textContent, wide: $('controls').classList.contains('with-net'), callout: !$('netCallout').hidden}), tips: () => tips.slice(),
      restore: (record, otherLevel = level, id = LVL) => restoreSession(record, otherLevel, id),
      render: () => {boatsDrawn = []; netsDrawn = []; dentsDrawn = []; draw(0); return boatsDrawn;}, dents: () => dentsDrawn.slice(),
      flights: () => flights.slice(), spot: value => { deviceSpot = value; }, shown: () => [...deviceSpotShown],
      spotState: () => deviceSpot && {t: deviceSpot.t, started: deviceSpot.started}, netSpot: () => $('netTool').classList.contains('spot'),
      sounds: () => sounds.slice(), shark: () => sharkDrawn, nets: () => netsDrawn,
      effects: () => JSON.parse(JSON.stringify({particles, wake, contacts:[...contactPulse], retract:[...netRetract], netPop:[...netPop], settle, zoom: exitZoom,
        anim:anim && {t:anim.t,dur:anim.dur,swimDur:anim.swimDur,portals:anim.portals,p:anim.p,landed:anim.landed,warpScale:anim.warpScale}})),
      state: () => JSON.parse(JSON.stringify({pos: st.pos, boats: st.boats, nets: st.nets, moves: st.moves, fish: st.fish, cleared, animating: !!anim, view: [view.x, view.y]}))
    };
  `)(level, reduced, index, stored, daily && {date: daily, stage: 0, version: 1}, storageFails, dailyStageId);
}

function finishTurn(scene) {
  for (let i = 0; scene.state().animating && i < 40; i++) scene.tick(0.05);
  assert.equal(scene.state().animating, false, 'animation failed to finish');
}

test('display rates and coarse frames preserve arrival, fish events and bounded wake density', () => {
  const level={par:2,map:['#######E#','#S....f.#','#########']};
  for(const hz of [20,60,90,144,240]){
    const scene=game({level});scene.move('R');let elapsed=0,maxWake=0;
    while(scene.state().animating&&elapsed<3){scene.tick(1/hz);elapsed+=1/hz;maxWake=Math.max(maxWake,scene.effects().wake.length);}
    assert.deepEqual(scene.state().pos,[7,1]);assert.deepEqual(scene.state().fish,[0]);assert.equal(scene.state().moves,1);
    assert.deepEqual(scene.state().view,[7,1]);
    assert.equal(scene.sounds().filter(s=>s.name==='eat').length,1);
    assert.ok(maxWake<=Math.ceil(elapsed*60)+1,'trail generation stays time-based at '+hz);
    scene.move('U');for(let t=0;t<3&&scene.state().animating;t+=1/hz)scene.tick(1/hz);
    assert.equal(scene.state().cleared,true);assert.equal(scene.state().moves,2);
    assert.equal(scene.sounds().filter(s=>s.name==='exit').length,1);
  }
});

test('boats remain still during the swim, then glide after the shark arrives', () => {
  const scene = game();
  scene.move('U');
  assert.deepEqual(scene.state().boats[0], [46, 'R'], 'engine already committed next turn');
  assert.deepEqual(scene.render(), [[3, 6]], 'old boat position at swipe start');
  scene.tick(0.05); scene.tick(0.05);
  assert.equal(scene.sounds().filter(s=>s.name==='boat').length,0,'boat cue waits for its own phase');
  assert.deepEqual(scene.render(), [[3, 6]], 'boat must not slide alongside the shark');
  scene.tick(0.05);
  assert.equal(scene.sounds().filter(s=>s.name==='boat').length,1);
  const [x, y] = scene.render()[0];
  assert.ok(x > 3 && x < 4, 'boat glides between its tiles');
  assert.equal(y, 6);
  assert.deepEqual(scene.state().view, [3, 7], 'shark has arrived before the boat glides');
  finishTurn(scene);
  assert.deepEqual(scene.render(), [[4, 6]]);
});

test('queued input waits for the boat phase and undo restores both turns', () => {
  const scene = game(), initial = scene.state();
  scene.move('U'); scene.move('L');
  for (let i = 0; i < 6; i++) scene.tick(0.05);
  assert.equal(scene.state().moves, 1, 'queued swipe must wait for the boat');
  scene.tick(0.02);
  assert.equal(scene.state().moves, 2, 'queued swipe begins after the boat settles');
  assert.deepEqual(scene.render(), [[4, 6]], 'second turn starts from the updated boat position');
  finishTurn(scene);
  scene.undo();
  assert.deepEqual(scene.state().pos, [3, 7]);
  assert.deepEqual(scene.state().boats, [[46, 'R']]);
  scene.undo();
  assert.deepEqual(scene.state().pos, initial.pos);
  assert.deepEqual(scene.state().boats, initial.boats);
  assert.equal(scene.state().moves, 0);
});

test('reduced motion still shows the boat update after the swim without a glide', () => {
  const scene = game({reduced: true});
  scene.move('U'); scene.tick(0.02);
  assert.deepEqual(scene.render(), [[3, 6]]);
  finishTurn(scene);
  assert.deepEqual(scene.render(), [[4, 6]]);
  assert.equal(scene.state().moves, 1);
});

test('blocked swipes and escape do not add a boat turn', () => {
  const scene = game(), initial = scene.state();
  scene.move('D');
  assert.equal(scene.state().animating, false);
  assert.equal(scene.state().moves, 0);
  assert.deepEqual(scene.state().boats, initial.boats);
  for (const d of 'ULURUL') {scene.move(d); finishTurn(scene);}
  const beforeEscape = scene.state().boats;
  scene.move('U'); finishTurn(scene);
  assert.equal(scene.state().cleared, true);
  assert.equal(scene.state().fish.length, 2);
  assert.deepEqual(scene.state().boats, beforeEscape);
});

test('reload during a swim keeps the committed position, all fish on its path and undo history', () => {
  const scene = game();
  for (const d of 'UL') {scene.move(d); finishTurn(scene);}
  scene.move('U'); // fish is collected later in the visual animation
  const saved = scene.stored();
  finishTurn(scene);
  const resumed = game({stored: saved});
  for (const key of ['pos', 'boats', 'fish', 'moves']) assert.deepEqual(resumed.state()[key], scene.state()[key], key);
  assert.equal(resumed.state().animating, false);
  resumed.undo(); scene.undo();
  for (const key of ['pos', 'boats', 'fish', 'moves']) assert.deepEqual(resumed.state()[key], scene.state()[key], 'undo ' + key);
});

test('pickup pitch index resets each move; net install and retrieval report only successful edits', () => {
  const level={par:5,nets:1,map:['#######E#','#S.ff...#','#.......#','#########']},scene=game({level});
  scene.tap(3,1);assert.equal(scene.sounds().filter(s=>s.name==='net').length,0,'fish blocks installation');
  scene.tap(3,2);scene.tap(4,2);scene.tap(3,2);
  assert.deepEqual(scene.sounds().filter(s=>s.name==='net').map(s=>s.args[0]),[undefined,true]);
  scene.move('R');finishTurn(scene);
  assert.deepEqual(scene.sounds().filter(s=>s.name==='eat').map(s=>s.args),[[false,0],[true,1]]);
  assert.equal(scene.sounds().filter(s=>s.name==='move'||s.name==='stop').length,0,'ordinary swimming and arrival are silent');
});

test('net tool: nets left through placement, exhaustion, undo and reload; grey 없음 once nets are known; callout until the first edit', () => {
  const level = {par: 8, nets: 2, map: ['###E###','#.....#','#S....#','#.....#','#######']};
  const scene = game({level});
  assert.deepEqual(scene.netTool(), {shown: true, nets: true, left: '2', label: '그물', wide: true, callout: true}, 'a fresh net canal points at its tool');
  scene.tap(3, 2); scene.tap(4, 2);
  assert.deepEqual(scene.netTool(), {shown: true, nets: true, left: '0', label: '그물', wide: true, callout: false}, 'the first edit retires the callout');
  assert.equal(scene.state().moves, 0);
  const resumed = game({level, stored:scene.stored()});
  assert.deepEqual(resumed.netTool(), scene.netTool(), 'a resumed attempt that already edited shows no callout');
  resumed.tap(3, 2); assert.equal(resumed.netTool().left, '1');
  resumed.undo(); assert.equal(resumed.netTool().left, '0');
  resumed.undo(); resumed.undo(); assert.equal(resumed.netTool().callout, false, 'undoing back to the start does not bring it back');
  const before = game({index:0});
  assert.deepEqual([before.netTool().shown, before.netTool().wide], [false, false], 'hidden until the player has met nets');
  before.tap(3, 3); assert.match(before.tips().at(-1), /화면을 밀어서/);
  const known = game({index:0, stored: JSON.stringify({best: {}, coachNet: true, sessions: {}, seenDevices: ['net']})});
  assert.deepEqual(known.netTool(), {shown: true, nets: false, left: null, label: '없음', wide: true, callout: false});
  known.tap(3, 3); assert.equal(known.tips().at(-1), '이 수로에는 그물이 없어요. 화면을 밀어서 길을 찾아요.');
});

test('installed and removed nets, and their undo history, survive a reload', () => {
  const scene = game({index: 11});
  scene.tap(3, 8);
  let packet = JSON.parse(scene.stored()).sessions.story;
  assert.deepEqual(packet.state.nets, [59]);
  const resumed = game({index: 11, stored: scene.stored()});
  resumed.tap(3, 8);
  packet = JSON.parse(resumed.stored()).sessions.story;
  assert.deepEqual(packet.state.nets, []);
  const reloaded = game({index: 11, stored: resumed.stored()});
  reloaded.undo();
  assert.deepEqual(JSON.parse(reloaded.stored()).sessions.story.state.nets, [59]);
  reloaded.undo();
  assert.deepEqual(JSON.parse(reloaded.stored()).sessions.story.state.nets, []);
});

test('story and dated daily checkpoints are independent; yesterday is not resumed', () => {
  const story = game(); story.move('U'); finishTurn(story);
  const daily = game({stored: story.stored(), daily: '2026-09-30'});
  daily.move('U'); finishTurn(daily); daily.move('L'); finishTurn(daily);
  const sessions = JSON.parse(daily.stored()).sessions;
  assert.equal(sessions.story.state.moves, 1);
  assert.equal(sessions.daily.state.moves, 2);
  assert.equal(game({stored: daily.stored()}).state().moves, 1);
  assert.equal(game({stored: daily.stored(), daily: '2026-09-30'}).state().moves, 2);
  assert.equal(game({stored: daily.stored(), daily: '2026-10-01'}).state().moves, 0);
});

test('pause finishes the active turn and drops an unexecuted queued swipe', () => {
  const scene = game(); scene.move('U'); scene.move('L'); scene.pause();
  assert.equal(scene.state().moves, 1);
  assert.equal(scene.state().animating, false);
  const resumed = game({stored: scene.stored()});
  assert.deepEqual(resumed.state().pos, scene.state().pos);
  assert.deepEqual(resumed.state().boats, scene.state().boats);
});

test('bad snapshots or changed maps are ignored without touching completed progress', () => {
  const scene = game(); scene.move('U'); finishTurn(scene);
  const packet = JSON.parse(scene.stored()).sessions.story;
  const mutations = [p => p.version = 2, p => p.id = 4, p => p.layout = 'changed',
    p => p.state.pos = [-1, 2], p => p.state.pos = [3, 0], p => p.state.moves = -1,
    p => p.state.fish = [99], p => p.state.fish = [0, 0], p => p.state.nets = [99],
    p => p.state.boats = [], p => p.state.boats[0][1] = 'U', p => p.state.history[0].pos = [99, 99],
    p => p.state.history = Array(201).fill(p.state.history[0])];
  for (const mutate of mutations) {
    const broken = structuredClone(packet); mutate(broken);
    assert.equal(scene.restore(broken), null);
    const stored = JSON.stringify({best: {0: 3}, coachNet: true, sessions: {story: broken}});
    const resumed = game({stored}); resumed.checkpoint();
    assert.equal(resumed.state().moves, 0);
    assert.deepEqual(JSON.parse(resumed.stored()).best, {0: 3});
  }
  assert.equal(scene.restore(packet, {...LEVELS[5], nets: 1}), null);
});

test('storage failures leave movement, pause and undo playable', () => {
  const scene = game({storageFails: true});
  assert.doesNotThrow(() => {scene.move('U'); scene.pause(); scene.undo();});
  assert.equal(scene.state().moves, 0);
});

test('every story solution has restorable checkpoints, including special tiles and net edits', () => {
  const {parseLevel, plan} = require('../src/engine.js');
  for (let index = 0; index < LEVELS.length; index++) {
    const grid = parseLevel(LEVELS[index]), solution = plan(grid, grid.start, 0, new Set(), grid.nets, true);
    const scene = game({index});
    for (const step of solution.steps) {
      for (const n of scene.state().nets.filter(n => !step.nets.includes(n))) scene.tap(n % grid.w, Math.floor(n / grid.w));
      for (const n of step.nets.filter(n => !scene.state().nets.includes(n))) scene.tap(n % grid.w, Math.floor(n / grid.w));
      if (scene.stored()) assert.ok(scene.restore(JSON.parse(scene.stored()).sessions.story, LEVELS[index], index), 'net edit in level ' + (index + 1));
      scene.move(step.dir);
      const packet = JSON.parse(scene.stored()).sessions.story;
      finishTurn(scene);
      if (!scene.state().cleared) {
        const restored = scene.restore(packet, LEVELS[index], index);
        assert.ok(restored, 'turn in level ' + (index + 1));
        for (const key of ['pos', 'boats', 'fish', 'nets', 'moves']) assert.deepEqual(restored[key], scene.state()[key], 'level ' + (index + 1) + ' ' + key);
      }
    }
    assert.equal(scene.state().cleared, true, 'level ' + (index + 1));
  }
});

test('first-encounter device rules are recorded only on confirmation and can be reopened', () => {
  const guideSource = source.slice(source.indexOf('const DEVICE_GUIDES = ['), source.indexOf('// screen change with a native-style push'));
  const {parseLevel, JET} = require('../src/engine.js');
  const {createDeviceDemo} = require('../src/device-demo');
  const elements = Object.fromEntries(['app', 'guideOverlay', 'guideTitle', 'guideItems', 'guideDone', 'gameScreen', 'settingsBtn', 'guideName', 'guideCounter', 'guideDemo', 'guideTabs', 'guideBody', 'guideToggle', 'guideMode', 'guideStepCount', 'guidePrev', 'guideNext', 'guideCaption'].map(id => [id, {hidden: id === 'guideOverlay', focus: () => {}, setAttribute: () => {}, getBoundingClientRect: () => ({width:0,height:0})}]));
  const run = new Function('JET', 'g', '$', 'createDeviceDemo', `
    // Device-record checks omit presentation timing; sheet-motion.test.js covers actual exits.
    const openSheet=id=>{$(id).hidden=false;$('app').inert=true;};
    const closeSheet=id=>{$(id).hidden=true;$('app').inert=false;};
    const save = {seenDevices: []}, persist = () => {}, reduceMotion = false;
    const setTip = () => {}, addDeviceSpot = () => {};
    ${guideSource}
    return {show: showDeviceGuide, close: closeGuide, next: advanceGuide, seen: () => save.seenDevices};
  `)(JET, parseLevel(LEVELS[39]), id => elements[id], createDeviceDemo);
  run.show(true);
  assert.equal(elements.guideOverlay.hidden, false);
  assert.equal(elements.app.inert, true);
  assert.deepEqual(run.seen(), []);
  assert.ok(elements.guideTabs.innerHTML.includes('소용돌이'));
  while(elements.guideDone.textContent === '다음 장치 보기') run.next();
  assert.ok(elements.guideItems.innerHTML.includes('소용돌이'));
  run.close();
  assert.equal(elements.app.inert, false);
  assert.ok(run.seen().includes('whirl'));
  run.show(true);
  assert.equal(elements.guideOverlay.hidden, true);
  run.show();
  assert.equal(elements.guideOverlay.hidden, false);
  assert.ok(elements.guideTabs.innerHTML.includes('소용돌이'));
});

test('arrival remains visually responsive and silent before the boat phase ends', () => {
  const scene = game(); scene.move('U');
  scene.tick(0.14);
  assert.equal(scene.sounds().filter(s => s.name === 'stop').length, 0);
  scene.tick(0.01);
  assert.equal(scene.state().animating, true, 'boat phase is still active');
  assert.ok(scene.effects().settle, 'shark settles while boats move');
  assert.equal(scene.sounds().filter(s => s.name === 'stop').length, 0);
  scene.render(); assert.equal(scene.shark()[5], false, 'tail is no longer in swim mode');
  finishTurn(scene);
  assert.equal(scene.sounds().filter(s => s.name === 'stop').length, 0, 'finishing the turn stays silent');
});

const portalLevel = {name:'portal motion fixture',par:4,map:[
  '###############', '#Sfw..........#', '###############', '#......w.f.s..#', '#############E#'
]};
test('portals have a visible entry/return phase without swimming across intervening walls', () => {
  const scene = game({level:portalLevel}); scene.move('R');
  const portal = scene.effects().anim.portals[0];
  assert.equal(portal.hold, 0.18);
  scene.tick(portal.start + 0.045);
  assert.deepEqual(scene.state().view, [3,1]);
  assert.ok(Math.abs(scene.effects().anim.warpScale - 0.5) < 0.001);
  scene.tick(0.09);
  assert.deepEqual(scene.state().view, [7,3]);
  assert.ok(Math.abs(scene.effects().anim.warpScale - 0.5) < 0.001);
  finishTurn(scene);
  assert.deepEqual(scene.state().pos, [11,3]);
  assert.deepEqual(scene.state().fish, [0,1]);
  assert.equal(scene.sounds().filter(s => s.name === 'warp').length, 1);
  assert.equal(scene.sounds().filter(s => s.name === 'sand').length, 1);
});
test('coarse frames retain portal and pickup events once; pickups stay near their source', () => {
  const scene = game({level:portalLevel}); scene.move('R'); scene.tick(0.05);
  scene.tick(0.5);
  assert.equal(scene.sounds().filter(s => s.name === 'warp').length, 1);
  finishTurn(scene);
  assert.deepEqual(scene.sounds().filter(s => s.name === 'eat').map(s => s.args[0]), [false,true]);
  assert.equal(scene.sounds().filter(s => s.name === 'warp').length, 1);
  const fine = game({level:portalLevel}); fine.move('R');
  for(let i=0;i<14;i++) {
    fine.tick(0.05);
    for(const p of fine.effects().particles.filter(p=>p.kind==='fish')) {
      const original = p.fi === 0 ? [2,1] : [9,3];
      assert.ok(Math.abs(p.x-original[0])<=0.36 && Math.abs(p.y-original[1])<0.01,'pickup must not fly across the portal');
    }
  }
  fine.undo();
  assert.deepEqual(fine.state().fish, []);
  assert.equal(fine.effects().particles.some(p=>['fish','text','grain'].includes(p.kind)), false);
});
test('net removal shrinks visually but changes the board immediately; replacing or undoing cancels stale effects', () => {
  const scene = game({index:11}); scene.tap(3,8); scene.tick(0.1); scene.tap(3,8);
  assert.deepEqual(scene.state().nets, []);
  assert.equal(scene.effects().retract.length, 1);
  scene.render(); assert.equal(scene.nets().length, 1, 'removed net is drawn briefly');
  scene.tap(3,8); scene.render();
  assert.equal(scene.effects().retract.length, 0);
  assert.equal(scene.nets().length, 1, 'replacing the same cell never draws two nets');
  scene.undo();
  assert.deepEqual(scene.state().nets, []);
  assert.equal(scene.effects().retract.length, 0); assert.equal(scene.effects().netPop.length, 0);
  scene.tap(3,8); scene.tap(3,8); scene.move('U'); finishTurn(scene);
  const {parseLevel,slide}=require('../src/engine'); const grid=parseLevel(LEVELS[11]);
  assert.deepEqual(scene.state().pos,slide(grid,grid.start,'U',new Set(),grid.boats).end,'a retracting net cannot block a new swipe');
  assert.equal(scene.effects().retract.length, 0);
});
test('net catches and buoy contacts react at the blocking tile without changing logical state', () => {
  const scene=game({index:11}); scene.tap(3,8); scene.move('U'); finishTurn(scene);
  assert.equal(scene.state().moves,1); assert.deepEqual(scene.state().nets,[59]);
  assert.equal(scene.effects().contacts[0][0],59);
  const buoy=game({level:{name:'buoy contact',par:2,map:['######','#S.oE#','######']}});
  buoy.move('R'); finishTurn(buoy);
  assert.deepEqual(buoy.state().pos,[2,1]); assert.equal(buoy.effects().contacts[0][0],9);
  const before=buoy.state(); buoy.move('R');
  assert.equal(buoy.state().moves,before.moves); assert.deepEqual(buoy.state().pos,before.pos);
});
test('pausing drops pending movement effects and sounds while preserving the full committed turn', () => {
  const scene=game({level:portalLevel}); scene.move('R'); scene.move('L');
  const before=scene.sounds().length; scene.pause();
  assert.equal(scene.sounds().length,before,'no delayed sand/portal reaction on pause');
  assert.deepEqual(scene.state().pos,[11,3]); assert.deepEqual(scene.state().fish,[0,1]);
  assert.equal(scene.state().moves,1); assert.equal(scene.state().animating,false);
  assert.deepEqual(scene.effects().particles,[]); assert.deepEqual(scene.effects().wake,[]);
  assert.equal(scene.effects().settle,null);
});
test('reduced motion keeps gameplay and cues with no shrink, stretch, trail or decorative particles', () => {
  const scene=game({level:portalLevel,reduced:true}); scene.move('R');
  assert.equal(scene.effects().anim.portals[0].hold,0);
  for(let i=0;i<12;i++) {
    scene.tick(0.05); scene.render();
    assert.equal(scene.shark()[3],40,'no portal shrink or entry pop');
    assert.equal(scene.shark()[6],1,'no speed stretch');
    assert.deepEqual(scene.effects().particles,[]); assert.deepEqual(scene.effects().wake,[]);
  }
  assert.deepEqual(scene.state().pos,[11,3]); assert.deepEqual(scene.state().fish,[0,1]);
  const net=game({index:11,reduced:true}); net.tap(3,8); net.tap(3,8);
  assert.deepEqual(net.effects().retract,[]); assert.deepEqual(net.effects().netPop,[]);
});

test('sand stops leave dents from the turn history: after landing, through undo, and at once in reduced motion', () => {
  const level = { par: 3, map: ['#######E#', '#.......#', '#S..s...#', '#########'] };
  const scene = game({ level });
  scene.move('R'); scene.tick(0.02);
  assert.deepEqual(scene.state().pos, [4, 2]); assert.equal(scene.state().animating, true);
  scene.render(); assert.deepEqual(scene.dents(), [], 'no dent before the shark arrives');
  finishTurn(scene); scene.render();
  assert.equal(scene.dents().length, 1); assert.deepEqual(scene.dents()[0].slice(0, 3), [4, 2, 0], 'dent faces the arrival heading');
  scene.move('U'); finishTurn(scene); scene.render();
  assert.deepEqual(scene.dents().map(d => d.slice(0, 2)), [[4, 2]], 'earlier stops stay marked');
  scene.undo(); scene.render(); assert.deepEqual(scene.dents().map(d => d.slice(0, 2)), [[4, 2]]);
  scene.undo(); scene.render(); assert.deepEqual(scene.dents(), [], 'undoing the stop removes its dent');
  const reduced = game({ level, reduced: true });
  reduced.move('R'); finishTurn(reduced); reduced.render();
  assert.equal(reduced.dents().length, 1); assert.equal(reduced.dents()[0][3], 1, 'reduced motion shows the dent without fading in');
});

test('escape eases the board toward the exit only with motion enabled; pausing resets it', () => {
  const level = { par: 2, map: ['#######E#', '#S....f.#', '#########'] };
  const scene = game({ level });
  scene.move('R'); finishTurn(scene); assert.equal(scene.effects().zoom, null);
  scene.move('U'); finishTurn(scene);
  assert.equal(scene.state().cleared, true); assert.deepEqual([scene.effects().zoom.x, scene.effects().zoom.y], [7, 0]);
  scene.tick(0.3); assert.ok(scene.effects().zoom.t > 0);
  scene.pause(); assert.equal(scene.effects().zoom, null, 'leaving the board drops the closer view');
  const reduced = game({ level, reduced: true });
  reduced.move('R'); finishTurn(reduced); reduced.move('U'); finishTurn(reduced);
  assert.equal(reduced.state().cleared, true); assert.equal(reduced.effects().zoom, null);
});

test('each caught mullet starts one HUD flight from its own tile; undo does not replay it', () => {
  const scene = game({ level: { par: 2, map: ['#######E#', '#S.f..f.#', '#########'] } });
  scene.move('R'); finishTurn(scene);
  assert.deepEqual(scene.flights(), [[3, 1], [6, 1]]);
  scene.undo(); assert.deepEqual(scene.flights(), [[3, 1], [6, 1]]);
});

// flyFish/catchGoal with a stand-in DOM: positions, heading, the landing bounce, its continuation and cleanup.
function flightScene(reduced = false) {
  const pick = name => source.match(new RegExp(`function ${name}\\([^]*?\\n}`))[0];
  const effects = source.slice(source.indexOf('// effects live in tile units;'), source.indexOf('function loadLevel('));
  return new Function('reduceMotion', `
    let bump = null, settle = null, pop = null, exitZoom = null, deviceSpot = null, now = 1000;
    const particles = [], wake = [], netPop = new Map(), jetFlash = new Map(), contactPulse = new Map(), netRetract = new Map();
    const T = 40, OX = 10, OY = 20, appended = [], bounces = [], performance = {now: () => now}, window = {devicePixelRatio: 2}, drawFish = () => {};
    const goal = {getBoundingClientRect: () => ({left: 30, top: 5, width: 22, height: 22}), animate: (frames, options) => bounces.push(options)};
    const $ = id => id === 'stats' ? {querySelector: s => s === '.goal svg' ? goal : null} : {classList: {remove() {}}};
    const cvs = {getBoundingClientRect: () => ({left: 0, top: 100}), animate() {}};
    const document = {body: {append: el => appended.push(el)}, createElement: () => {
      const el = {style: {}, removed: false, getContext: () => ({scale() {}}), remove() { el.removed = true; },
        animate(frames, options) { el.frames = frames; el.options = options; return el.flight = {}; }};
      return el;
    }};
    ${effects}
    ${source.match(/^const FISH_FLIGHT_MS.*$/m)[0]}
    ${pick('flyFish')}
    ${pick('catchGoal')}
    return {flyFish, catchGoal, clearPlayEffects, appended, bounces, flying: () => flyingFish.size, advance: ms => { now += ms; }};
  `)(reduced);
}
const pose = transform => {
  const [x, y, turn, sx] = transform.match(/translate\(([-\d.]+)px,([-\d.]+)px\) rotate\(([-\d.]+)deg\) scale\(([-\d.]+),/).slice(1).map(Number);
  const a = turn * Math.PI / 180;
  return { x, y, head: [Math.sign(sx) * Math.cos(a), Math.sign(sx) * Math.sin(a)] };
};

test('a mullet flight starts at its tile, ends on the HUD goal head-first, then bounces the goal once', () => {
  const scene = flightScene();
  scene.flyFish(3, 4);
  const [icon] = scene.appended, size = 32;   // T 40 → icon 32px
  assert.equal(icon.style.left, 10 + 3.5 * 40 - size / 2 + 'px'); assert.equal(icon.style.top, 100 + 20 + 4.5 * 40 - size / 2 + 'px');
  assert.equal(icon.options.duration, 560); assert.equal(icon.frames[0].opacity, 0);
  const end = pose(icon.frames[2].transform), lifted = pose(icon.frames[1].transform);
  assert.deepEqual([end.x, end.y], [30 + 11 - size / 2 - 134, 5 + 11 - size / 2 - 284], 'lands on the goal icon centre');
  const travel = [end.x - lifted.x, end.y - lifted.y], length = Math.hypot(...travel);
  assert.ok(Math.abs(end.head[0] - travel[0] / length) < 0.01 && Math.abs(end.head[1] - travel[1] / length) < 0.01, 'head points along the flight');
  assert.ok(icon.frames[2].transform.includes('scale(-0.45,0.45)'), 'a left-bound fish is mirrored, not upside down');
  scene.flyFish(0, 4);
  assert.ok(scene.appended[1].frames[2].transform.includes('scale(0.45,0.45)'), 'a right-bound fish keeps its drawing');
  icon.flight.onfinish();
  assert.equal(icon.removed, true); assert.equal(scene.flying(), 1);
  assert.equal(scene.bounces.length, 1); assert.equal(scene.bounces[0].duration, 320); assert.equal(-scene.bounces[0].delay, 0);
  scene.advance(100); scene.catchGoal();
  assert.equal(scene.bounces.length, 2); assert.equal(scene.bounces[1].delay, -100, 'a HUD re-render continues the bounce');
  scene.advance(300); scene.catchGoal(); assert.equal(scene.bounces.length, 2, 'no bounce once it has finished');
});

test('clearing play effects drops flights in progress without a late bounce; reduced motion has no flight', () => {
  const scene = flightScene();
  scene.flyFish(2, 2); scene.clearPlayEffects();
  assert.equal(scene.appended[0].removed, true); assert.equal(scene.flying(), 0);
  scene.appended[0].flight.onfinish(); scene.catchGoal();
  assert.equal(scene.bounces.length, 0);
  const reduced = flightScene(true); reduced.flyFish(2, 2);
  assert.equal(reduced.appended.length, 0);
});

test('the new-device spotlight starts once the board is uncovered and ends on the first real move or after 1.8s', () => {
  const scene = game({ level: { par: 2, nets: 1, map: ['#######E#', '#S......#', '#########'] } });
  scene.spot({ level: 24, cells: [12], net: true, t: 0, started: false });
  assert.equal(scene.netSpot(), false);
  scene.tick(0.1);
  assert.deepEqual(scene.spotState(), { t: 0.1, started: true }); assert.equal(scene.netSpot(), true);
  assert.deepEqual(scene.shown(), [24], 'counted as shown for this app session');
  scene.render();
  scene.move('L'); assert.ok(scene.spotState(), 'a blocked swipe is not a move');
  scene.move('R'); assert.equal(scene.spotState(), null); assert.equal(scene.netSpot(), false);
  finishTurn(scene);
  scene.spot({ level: 36, cells: [12], net: false, t: 0, started: false });
  for (let k = 0; k < 40; k++) scene.tick(0.05);
  assert.equal(scene.spotState(), null, 'fades out by itself');
});

// Production loadLevel with its device spotlight and chapter card decisions; enter() and the card itself are stand-ins.
function storyLoader() {
  const data = require('../src/levels.js');
  const story = source.slice(source.indexOf('// Device kinds a story canal introduces'), source.indexOf('/* ---------- story journey:'));
  const engine = fs.readFileSync(path.join(__dirname, '../src/engine.js'), 'utf8');
  const loadLevel = source.match(/function loadLevel\([^]*?\n}/)[0], cardDue = source.match(/function chapterCardDue\([^]*?\n}/)[0];
  const addSpot = source.match(/function addDeviceSpot\([^]*?\n}/)[0];
  return new Function('data', `
    ${engine}
    const { LEVELS, CHAPTERS, STORY_ORDER, STORY_POSITION, LEVEL_ROLES } = data;
    let DAILY = null, FREE = null, PILOT = null, STORY = null, LVL = 0, deco = 0, g, st, deviceSpot = null, reduceMotion = false, moves = 0, held = null;
    const save = {best: {}}, deviceSpotShown = new Set(), chapterCardShown = new Set(), cards = [], storyLevel = i => ({...LEVELS[i], map: LEVELS[i].map.slice()});
    const enter = (level, keep, label, region, preview, cover) => { held = cover; g = parseLevel(level); st = {moves, boats: g.boats.map(b => b.slice())}; };
    const openChapterCard = ci => { chapterCardShown.add(ci); cards.push(ci); };
    ${story}
    ${cardDue}
    ${addSpot}
    ${loadLevel}
    const at = position => STORY_ORDER[position];
    return {
      introduced: position => introducedDevices(at(position)), devices: chapterDevices,
      load: (position, keep) => { deviceSpot = null; loadLevel(at(position), keep); return deviceSpot && {cells: deviceSpot.cells.map(k => g.cells[k]), net: deviceSpot.net}; },
      retry: (position, keep) => { loadLevel(at(position), keep); loadLevel(at(position), null, STORY); },
      cards: () => cards.slice(), held: () => held,
      boats: () => st.boats.map(b => b[0]), set: (key, value) => { if (key === 'moves') moves = value; else if (key === 'reduced') reduceMotion = value; else if (key === 'shown') deviceSpotShown.add(at(value)); else save.best[at(key)] = value; },
    };
  `)(data);
}

test('only the canal introducing a device spotlights it: one per chapter, before the first move, until cleared', () => {
  const scene = storyLoader();
  const firsts = { jet: 6, boat: 12, net: 24, sand: 36, whirl: 48, gate: 60 };
  for (const [kind, position] of Object.entries(firsts)) {
    assert.deepEqual(scene.introduced(position), [kind]);
    assert.equal(Math.floor(position / 12), Object.keys(firsts).indexOf(kind), 'one new device per chapter');
  }
  assert.deepEqual(scene.introduced(7), []);
  assert.ok(scene.load(6).cells.every(c => '<>^v'.includes(c)));
  assert.deepEqual(scene.load(12).cells.length, scene.boats().length);
  assert.equal(scene.load(24).net, true);
  assert.ok(scene.load(36).cells.length && scene.load(36).cells.every(c => c === 's'));
  assert.deepEqual(scene.load(48).cells, ['w', 'w']);
  assert.ok(scene.load(60).cells.includes('p') && scene.load(60).cells.every(c => 'pGg'.includes(c)));
  assert.equal(scene.load(7), null, 'later canals of the chapter stay plain');
  assert.equal(scene.load(36, true), null, 'an older definition of the canal is not the introduction');
  scene.set(6, 1); assert.equal(scene.load(6), null, 'cleared');
  scene.set('shown', 12); assert.equal(scene.load(12), null, 'already shown in this app session');
  scene.set('moves', 2); assert.equal(scene.load(24), null, 'resumed after moving'); scene.set('moves', 0);
  scene.set('reduced', true); assert.equal(scene.load(48), null, 'reduced motion');
});

test('a chapter card covers only the first canal of every chapter after the first: once per session, before moving, until cleared', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(ci => storyLoader().devices(ci)), [['jet'], ['boat'], ['net'], ['sand'], ['whirl'], ['gate']]);
  // chapter start positions come from the data, so added chapters are covered without editing this test
  const { CHAPTERS } = require('../src/levels.js'), starts = CHAPTERS.map((_, ci) => CHAPTERS.slice(0, ci).reduce((n, ch) => n + ch.count, 0));
  const scene = storyLoader();
  scene.load(0); assert.deepEqual(scene.cards(), [], 'the first chapter starts the game without a card');
  assert.equal(scene.held(), false, 'without a card the canal starts at once');
  for (const position of starts.slice(1)) scene.load(position);
  const later = CHAPTERS.map((_, ci) => ci).slice(1);
  assert.deepEqual(scene.cards(), later); assert.equal(scene.held(), true, 'the card holds the start cue and device guide');
  scene.load(starts[1]); scene.load(starts[1] + 1); assert.deepEqual(scene.cards(), later, 'once per session, and only the first canal');
  const resumed = storyLoader(); resumed.load(24, {moves: 3}); assert.deepEqual(resumed.cards(), [], 'a resumed attempt that moved');
  resumed.load(24, {moves: 0}); assert.deepEqual(resumed.cards(), [2], 'a resumed attempt that only placed nets still opens it');
  const cleared = storyLoader(); cleared.set(36, 1); cleared.load(36); assert.deepEqual(cleared.cards(), [], 'cleared first canal');
  const retry = storyLoader(); retry.retry(48, {moves: 2}); assert.deepEqual(retry.cards(), [], 'retrying a resumed attempt does not open it');
});

test('the chapter card route keeps the current chapter centred with two on each side and no end point', () => {
  const stops = new Function(source.match(/^const chapterRouteStops = .*$/m)[0] + '; return chapterRouteStops;')();
  assert.deepEqual(stops(1, 6), [null, 0, 1, 2, 3], 'chapter 2: the start of the journey on the left');
  assert.deepEqual(stops(5, 6), [3, 4, 5, null, null], 'the newest chapter: the route fades out instead of ending');
  assert.deepEqual(stops(5, 9), [3, 4, 5, 6, 7], 'chapters added later appear ahead of it');
  assert.deepEqual(stops(20, 30), [18, 19, 20, 21, 22], 'five stops however long the journey grows');
});

test('a simple device introduced by the spotlight counts as seen when it starts, not when it is queued', () => {
  const scene = game({ level: { par: 2, map: ['#######E#', '#S...o..#', '#########'] }, stored: JSON.stringify({ best: {}, coachNet: true, sessions: {}, seenDevices: [] }) });
  scene.spot({ level: null, cells: [14], net: false, seen: ['buoy'], t: 0, started: false });
  assert.deepEqual(JSON.parse(scene.stored()).seenDevices, [], 'queued only');
  scene.tick(0.05);
  assert.deepEqual(JSON.parse(scene.stored()).seenDevices, ['buoy']); assert.deepEqual(scene.shown(), [], 'not a chapter introduction');
});
