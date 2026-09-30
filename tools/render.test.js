const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/game.js'), 'utf8');
const LEVELS = new Function(fs.readFileSync(path.join(__dirname, '../src/levels.js'), 'utf8') + '; return LEVELS;')();

// Run the production movement/frame/render functions with a silent canvas and sound output.
// Capturing drawBoat coordinates tests visible turn order; this does not test sprite pixels or device touch.
function game({ reduced = false } = {}) {
  const functionSource = name => {
    const found = source.match(new RegExp(`^function ${name}\\([^\\n]*}\\s*$`, 'm'))
      || source.match(new RegExp(`function ${name}\\([^]*?\\n}`));
    assert.ok(found, 'missing production function ' + name);
    return found[0];
  };
  const easing = source.slice(source.indexOf('function easeTable('), source.indexOf('/* ---------- drawing primitives'));
  const functions = ['hash', 'freshState', 'netSet', 'pushHistory', 'tryMove', 'eatFish', 'finishAnim', 'undo', 'step', 'draw'].map(functionSource).join('\n');
  const engine = fs.readFileSync(path.join(__dirname, '../src/engine.js'), 'utf8');
  return new Function('level', 'reduceMotion', `
    ${engine}
    ${easing}
    ${source.match(/^const ANG = .*$/m)[0]}
    const noop = () => {}, sfx = new Proxy({}, {get: () => noop});
    const ctx = new Proxy({}, {get: (target, key) => key in target ? target[key] : noop});
    const C = {}, T = 40, dpr = 1, OX = 0, OY = 0, CW = 360, CH = 640;
    const staticLayer = {}, waterPath = {}, caustic = {}, causticPat = {};
    const $ = () => ({hidden: false, classList: {contains: () => false}});
    const haptic = noop, ring = noop, splashAt = noop, updateHud = noop, coachDone = noop, setupCoach = noop, setTip = noop;
    const drawExit = noop, drawJet = noop, drawBuoy = noop, drawWhirl = noop, drawNet = noop, drawFish = noop;
    const save = {coachNet: true}, curLevel = () => level;
    const wake = [], particles = [], jetFlash = new Map(), netPop = new Map();
    let g, st, anim = null, hint = null, bump = null, settle = null, pop = null, queued = null, coach = null;
    let cleared = false, clock = 0, hintRequest = 0, deco = 0, boatsDrawn = [];
    const drawShark = noop;
    const drawBoat = (ctx, x, y) => boatsDrawn.push([x / T - 0.5, y / T - 0.5]);
    const onClear = () => {cleared = true;};
    ${functions}
    st = freshState(level);
    const view = {x: st.pos[0], y: st.pos[1], ang: ANG.U, target: ANG.U};
    return {
      move: tryMove, tick: step, undo,
      render: () => {boatsDrawn = []; draw(0); return boatsDrawn;},
      state: () => JSON.parse(JSON.stringify({pos: st.pos, boats: st.boats, moves: st.moves, fish: st.fish, cleared, animating: !!anim, view: [view.x, view.y]}))
    };
  `)(LEVELS[5], reduced);
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
