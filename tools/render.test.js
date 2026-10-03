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
    const $ = id => { if (!elements.has(id)) elements.set(id, {hidden: false, classList: {contains: () => false, toggle: noop}}); return elements.get(id); };
    const haptic = noop, updateHud = updateNetStatus, coachDone = noop, setupCoach = noop, setTip = noop, refreshHint = noop;
    const drawExit = noop, drawJet = noop, drawBuoy = noop, drawWhirl = noop, drawFish = noop, css = {getPropertyValue: () => 'sans-serif'};
    const save = stored ? JSON.parse(stored) : {best: {}, coachNet: true, sessions: {}}, curLevel = () => level;
    const STORE_KEY = 'test'; let written = stored, gest = null, FREE = null, PILOT = null;
    const localStorage = {setItem: (key, value) => {if (storageFails) throw Error('quota'); written = value;}};
    const wake = [], particles = [], jetFlash = new Map(), netPop = new Map(), contactPulse = new Map(), netRetract = new Map();
    let g, st, anim = null, hint = null, bump = null, settle = null, pop = null, queued = null, coach = null;
    let cleared = false, clock = 0, hintRequest = 0, deco = 0, boatsDrawn = [], sharkDrawn, netsDrawn = [];
    const drawShark = (...args) => sharkDrawn = args.slice(1), drawNet = (...args) => netsDrawn.push(args.slice(1));
    const drawBoat = (ctx, x, y) => boatsDrawn.push([x / T - 0.5, y / T - 0.5]);
    const onClear = () => {cleared = true;};
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
      netStatus: () => ({title: $('netTitle').textContent, help: $('netHelp').textContent, disabled: $('netStatus').disabled, guideHidden: $('netGuideLabel').hidden}),
      restore: (record, otherLevel = level, id = LVL) => restoreSession(record, otherLevel, id),
      render: () => {boatsDrawn = []; netsDrawn = []; draw(0); return boatsDrawn;},
      sounds: () => sounds.slice(), shark: () => sharkDrawn, nets: () => netsDrawn,
      effects: () => JSON.parse(JSON.stringify({particles, wake, contacts:[...contactPulse], retract:[...netRetract], netPop:[...netPop], settle,
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
  const move=scene.sounds().find(s=>s.name==='move');assert.equal(move.args[0],6);assert.ok(move.args[1]>0&&move.args[1]<=.62);
});

test('net reminder follows placement, exhaustion, undo, reload and levels without nets', () => {
  const level = {par: 8, nets: 2, map: ['###E###','#.....#','#S....#','#.....#','#######']};
  const scene = game({level});
  assert.equal(scene.netStatus().title, '그물 수로 · 남음 2 / 2');
  scene.tap(3, 2); scene.tap(4, 2);
  assert.equal(scene.netStatus().title, '그물 수로 · 남음 0 / 2');
  assert.equal(scene.netStatus().help, '설치 2개 · 누르면 회수해요');
  assert.equal(scene.netStatus().disabled, false, 'exhausted nets can still be recalled and explained');
  assert.equal(scene.state().moves, 0);
  const resumed = game({level, stored:scene.stored()});
  assert.deepEqual(resumed.netStatus(), scene.netStatus());
  resumed.tap(3, 2); assert.equal(resumed.netStatus().title, '그물 수로 · 남음 1 / 2');
  resumed.undo(); assert.equal(resumed.netStatus().title, '그물 수로 · 남음 0 / 2');
  const plain = game({index:0});
  assert.equal(plain.netStatus().title, '그물 없는 수로');
  assert.equal(plain.netStatus().disabled, true); assert.equal(plain.netStatus().guideHidden, true);
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

test('arrival reacts once at contact, before the boat phase ends', () => {
  const scene = game(); scene.move('U');
  scene.tick(0.14);
  assert.equal(scene.sounds().filter(s => s.name === 'stop').length, 0);
  scene.tick(0.01);
  assert.equal(scene.state().animating, true, 'boat phase is still active');
  assert.ok(scene.effects().settle, 'shark settles while boats move');
  assert.equal(scene.sounds().filter(s => s.name === 'stop').length, 1);
  scene.render(); assert.equal(scene.shark()[5], false, 'tail is no longer in swim mode');
  finishTurn(scene);
  assert.equal(scene.sounds().filter(s => s.name === 'stop').length, 1, 'finish must not replay contact');
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
