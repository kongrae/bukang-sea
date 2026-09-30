const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/game.js'), 'utf8');
const { dailyStageId } = require('../src/daily.js');
const LEVELS = new Function(fs.readFileSync(path.join(__dirname, '../src/levels.js'), 'utf8') + '; return LEVELS;')();

// Run the production movement/frame/render functions with a silent canvas and sound output.
// Capturing drawBoat coordinates tests visible turn order; this does not test sprite pixels or device touch.
function game({ reduced = false, index = 5, stored = null, daily = null, storageFails = false } = {}) {
  const functionSource = name => {
    const found = source.match(new RegExp(`^function ${name}\\([^\\n]*}\\s*$`, 'm'))
      || source.match(new RegExp(`function ${name}\\([^]*?\\n}`));
    assert.ok(found, 'missing production function ' + name);
    return found[0];
  };
  const easing = source.slice(source.indexOf('function easeTable('), source.indexOf('/* ---------- drawing primitives'));
  const functions = ['hash', 'persist', 'levelSignature', 'copyTurn', 'restoreSession', 'dailySessionKey', 'checkpoint', 'pauseGame', 'freshState', 'netSet', 'pushHistory', 'tryMove', 'eatFish', 'finishAnim', 'undo', 'tapTile', 'step', 'draw'].map(functionSource).join('\n');
  const engine = fs.readFileSync(path.join(__dirname, '../src/engine.js'), 'utf8');
  return new Function('level', 'reduceMotion', 'LVL', 'stored', 'DAILY', 'storageFails', 'dailyStageId', `
    ${engine}
    ${easing}
    ${source.match(/^const ANG = .*$/m)[0]}
    const noop = () => {}, sfx = new Proxy({}, {get: () => noop});
    const ctx = new Proxy({}, {get: (target, key) => key in target ? target[key] : noop});
    const C = {}, T = 40, dpr = 1, OX = 0, OY = 0, CW = 360, CH = 640;
    const staticLayer = {}, waterPath = {}, caustic = {}, causticPat = {};
    const $ = () => ({hidden: false, classList: {contains: () => false}});
    const haptic = noop, ring = noop, splashAt = noop, updateHud = noop, coachDone = noop, setupCoach = noop, setTip = noop, refreshHint = noop;
    const drawExit = noop, drawJet = noop, drawBuoy = noop, drawWhirl = noop, drawNet = noop, drawFish = noop;
    const save = stored ? JSON.parse(stored) : {best: {}, coachNet: true, sessions: {}}, curLevel = () => level;
    const STORE_KEY = 'test'; let written = stored, gest = null;
    const localStorage = {setItem: (key, value) => {if (storageFails) throw Error('quota'); written = value;}};
    const wake = [], particles = [], jetFlash = new Map(), netPop = new Map();
    let g, st, anim = null, hint = null, bump = null, settle = null, pop = null, queued = null, coach = null;
    let cleared = false, clock = 0, hintRequest = 0, deco = 0, boatsDrawn = [];
    const drawShark = noop;
    const drawBoat = (ctx, x, y) => boatsDrawn.push([x / T - 0.5, y / T - 0.5]);
    const onClear = () => {cleared = true;};
    ${functions}
    st = freshState(level);
    const packet = save.sessions[DAILY ? 'daily' : 'story'];
    const resumed = restoreSession(packet, level, DAILY ? dailyStageId(DAILY) : LVL);
    if (resumed) st = resumed;
    const view = {x: st.pos[0], y: st.pos[1], ang: ANG.U, target: ANG.U};
    return {
      move: tryMove, tick: step, undo, tap: tapTile, pause: pauseGame, checkpoint,
      stored: () => written,
      restore: (record, otherLevel = level, id = LVL) => restoreSession(record, otherLevel, id),
      render: () => {boatsDrawn = []; draw(0); return boatsDrawn;},
      state: () => JSON.parse(JSON.stringify({pos: st.pos, boats: st.boats, nets: st.nets, moves: st.moves, fish: st.fish, cleared, animating: !!anim, view: [view.x, view.y]}))
    };
  `)(LEVELS[index], reduced, index, stored, daily && {date: daily, stage: 0, version: 1}, storageFails, dailyStageId);
}

function finishTurn(scene) {
  for (let i = 0; scene.state().animating && i < 40; i++) scene.tick(0.05);
  assert.equal(scene.state().animating, false, 'animation failed to finish');
}

test('boats remain still during the swim, then glide after the shark arrives', () => {
  const scene = game();
  scene.move('U');
  assert.deepEqual(scene.state().boats[0], [46, 'R'], 'engine already committed next turn');
  assert.deepEqual(scene.render(), [[3, 6]], 'old boat position at swipe start');
  scene.tick(0.05); scene.tick(0.05);
  assert.deepEqual(scene.render(), [[3, 6]], 'boat must not slide alongside the shark');
  scene.tick(0.05);
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
  const elements = Object.fromEntries(['app', 'guideOverlay', 'guideTitle', 'guideItems', 'guideDone', 'gameScreen', 'settingsBtn'].map(id => [id, {hidden: id === 'guideOverlay', focus: () => {}, querySelectorAll: () => []}]));
  const run = new Function('JET', 'g', '$', `
    const save = {seenDevices: []}, persist = () => {}, drawLegendIcon = () => {};
    ${guideSource}
    return {show: showDeviceGuide, close: closeGuide, seen: () => save.seenDevices};
  `)(JET, parseLevel(LEVELS[39]), id => elements[id]);
  run.show(true);
  assert.equal(elements.guideOverlay.hidden, false);
  assert.equal(elements.app.inert, true);
  assert.deepEqual(run.seen(), []);
  assert.ok(elements.guideItems.innerHTML.includes('소용돌이'));
  run.close();
  assert.equal(elements.app.inert, false);
  assert.ok(run.seen().includes('whirl'));
  run.show(true);
  assert.equal(elements.guideOverlay.hidden, true);
  run.show();
  assert.equal(elements.guideOverlay.hidden, false);
  assert.ok(elements.guideItems.innerHTML.includes('소용돌이'));
});
