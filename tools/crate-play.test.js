// Chapter 7 drifting crates in the production game code: turn commit, presentation order, undo, saved turns,
// solver calls (hint and stuck check), net taps, device spotlight, guide, example and sound.
// Production functions are sliced from src/game.js like tools/pilot.test.js; canvas drawing is captured, not rasterised.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../src/engine.js');
const D = require('../src/device-demo.js');
const { createGameAudio, SFX_SAMPLES } = require('../src/sound.js');
const read = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
const source = read('game.js'), engineSource = read('engine.js');
const fn = name => {
  const found = source.match(new RegExp(`^function ${name}\\([^\\n]*}\\s*$`, 'm')) || source.match(new RegExp(`function ${name}\\([^]*?\\n}`));
  assert.ok(found, 'missing production function ' + name); return found[0];
};
const section = (a, b) => { const i = source.indexOf(a), j = source.indexOf(b); assert.ok(i >= 0 && j > i, a); return source.slice(i, j); };

// The 7x6 practice board: U, R (the crate slides 4,1 -> 5,1), R (stops in front of it), U.
const LEARN = { name: 'learn', par: 4, map: ['####E##', '#...c.#', '#.....#', '#...o.#', '#.....#', '##S####'] };
// One swipe that stops on a switch against a crate: the crate slides, the gate closes, then the boat turns back.
const ORDER = { name: 'order', par: 3, map: ['###E#####', '#...bg..#', '#########', '#S.pc...#', '#########'] };
// Session checks: two crates, a boat, a fish, sand and a net.
const FULL = { name: 'full', par: 9, nets: 1, map: ['#######', '#.c.f.#', '#b....#', '#..c..#', '#..s..#', '###S###', '###E###'] };
const PLAIN = { name: 'plain', par: 2, map: ['#E#', '#.#', '#S#'] };
const at = (g, x, y) => y * g.w + x;

function game({ level, reduced = false, stored = null, id = 'fixture' } = {}) {
  const easing = section('function easeTable(', '/* ---------- drawing primitives');
  const effects = section('// effects live in tile units;', 'function loadLevel(');
  const functions = ['hash', 'persist', 'levelSignature', 'copyTurn', 'restoreSession', 'checkpoint', 'pauseGame', 'freshState', 'netSet', 'fishMask', 'pushHistory',
    'tryMove', 'eatFish', 'landShark', 'finishAnim', 'undo', 'tapTile', 'step', 'draw'].map(fn).join('\n');
  return new Function('level', 'reduceMotion', 'stored', 'LVL', `
    ${engineSource}
    ${easing}
    ${source.match(/^const ANG = .*$/m)[0]}
    const noop = () => {}, sounds = [], sfx = new Proxy({}, {get: (_, name) => (...args) => sounds.push([name, ...args])});
    const ctx = new Proxy({}, {get: (target, key) => key in target ? target[key] : noop});
    const C = {}, T = 40, dpr = 1, OX = 0, OY = 0, CW = 360, CH = 640, staticLayer = {}, waterPath = {}, caustic = {}, causticPat = {};
    const $ = () => ({hidden: false, classList: {contains: () => false}});
    const haptic = noop, updateHud = noop, coachDone = noop, setupCoach = noop, refreshHint = noop;
    let tip = ''; const setTip = text => { tip = text; };
    const drawExit = noop, drawJet = noop, drawBuoy = noop, drawWhirl = noop, drawFish = noop, drawNet = noop, drawSandDent = noop, css = {getPropertyValue: () => 'sans-serif'};
    let order = [], cratesDrawn = [], gates = [], boatsDrawn = [];
    const drawCrate = (c, x, y, size, t, pulse) => { order.push('crate'); cratesDrawn.push([+(x / T).toFixed(3), +(y / T).toFixed(3), +pulse.toFixed(3)]); };
    const drawGate = (c, x, y, size, open) => { order.push('gate'); gates.push(+open.toFixed(3)); };
    const drawSwitch = noop, drawShark = () => order.push('shark');
    const drawBoat = (c, x, y) => { order.push('boat'); boatsDrawn.push([+(x / T - 0.5).toFixed(3), +(y / T - 0.5).toFixed(3)]); };
    const save = stored ? JSON.parse(stored) : {best: {}, coachNet: true, sessions: {}}, curLevel = () => level;
    const STORE_KEY = 'test'; let written = stored, gest = null, FREE = null, DAILY = null, PILOT = null;
    const localStorage = {setItem: (key, value) => { written = value; }};
    const wake = [], particles = [], jetFlash = new Map(), netPop = new Map(), contactPulse = new Map(), netRetract = new Map(), crateWobble = new Map();
    let g, st, anim = null, hint = null, bump = null, settle = null, pop = null, queued = null, coach = null, cleared = false, clock = 0, hintRequest = 0, deco = 0, exitZoom = null, deviceSpot = null;
    const EXIT_ZOOM = { scale: .06, dur: .45 }, sandSeen = new Map(), DEVICE_SPOT = { dur: 1.8, pulses: 3 }, flyFish = noop;
    const onClear = () => { cleared = true; };
    ${effects}
    ${source.match(/^const netPickup = .*$/m)[0]}
    ${functions}
    st = freshState(level);
    const resumed = restoreSession(save.sessions.story, level, LVL);
    if (resumed) st = resumed;
    const view = {x: st.pos[0], y: st.pos[1], ang: ANG.U, target: ANG.U};
    return {
      move: tryMove, tick: step, undo, tap: tapTile, pause: pauseGame, tip: () => tip, sounds: () => sounds.map(s => s.slice()),
      stored: () => written, packet: () => JSON.parse(written).sessions.story,
      restore: (record, other = level, rid = LVL) => restoreSession(record, other, rid),
      render: () => { order = []; cratesDrawn = []; gates = []; boatsDrawn = []; draw(0); return { order, crates: cratesDrawn, gates, boats: boatsDrawn }; },
      effects: () => ({ contacts: [...contactPulse.keys()], wobble: [...crateWobble.keys()],
        anim: anim && { t: anim.t, dur: anim.dur, crateDur: anim.crateDur, gateDur: anim.gateDur, boatDur: anim.boatDur, push: anim.push, cratesFrom: anim.cratesFrom } }),
      raw: () => st,
      state: () => JSON.parse(JSON.stringify({ pos: st.pos, crates: st.crates, gate: st.gate, boats: st.boats, nets: st.nets, fish: st.fish, moves: st.moves,
        history: st.history.length, cleared, animating: !!anim })), keys: () => Object.keys(st)
    };
  `)(level, reduced, stored, id);
}
const finish = scene => { for (let i = 0; scene.state().animating && i < 80; i++) scene.tick(0.05); assert.equal(scene.state().animating, false); };

test('a real swipe that bumps a crate commits the push at once; the drawn crate waits for the shark, then glides', () => {
  const scene = game({ level: LEARN }), grid = E.parseLevel(LEARN);
  assert.deepEqual(scene.state().crates, [at(grid, 4, 1)], 'fresh state carries the crate cells');
  scene.move('U'); finish(scene);
  scene.move('R');
  const s = scene.state(), fx = scene.effects().anim;
  assert.deepEqual([s.pos, s.crates, s.moves], [[3, 1], [at(grid, 5, 1)], 2], 'logic commits immediately');
  assert.deepEqual(fx.cratesFrom, [at(grid, 4, 1)]);
  assert.deepEqual([fx.push.from, fx.push.to], [at(grid, 4, 1), at(grid, 5, 1)]);
  assert.ok(fx.crateDur >= 0.16 && fx.crateDur <= 0.22, 'a short crate phase');
  assert.deepEqual(scene.render().crates, [[4, 1, 0]], 'the crate stays put while the shark swims');
  scene.tick(fx.dur + fx.crateDur / 2);
  const [[mid]] = scene.render().crates;
  assert.ok(mid > 4 && mid < 5, 'glides between its tiles in the crate phase');
  assert.ok(scene.sounds().some(([name, slide]) => name === 'crate' && slide === fx.crateDur), 'one crate cue carries the slide time');
  finish(scene);
  assert.deepEqual(scene.render().crates, [[5, 1, 0]]);
  scene.move('R'); finish(scene);
  assert.deepEqual([scene.state().pos, scene.state().crates], [[4, 1], [at(grid, 5, 1)]], 'stops in front of the pushed crate, which cannot move');
  assert.ok(scene.effects().contacts.includes(at(grid, 5, 1)), 'a stop against a crate that cannot move reacts like a buoy');
  scene.move('U'); finish(scene);
  assert.equal(scene.state().cleared, true);
  assert.equal(scene.sounds().filter(([name]) => name === 'crate').length, 1, 'only the real push sounds');
});

test('turn presentation: shark -> crate -> gate -> boat, and queued input waits for every phase', () => {
  const scene = game({ level: ORDER }), grid = E.parseLevel(ORDER);
  const before = scene.render();
  assert.deepEqual([before.crates, before.gates, before.boats], [[[4, 3, 0]], [1], [[4, 1]]]);
  assert.deepEqual(before.order, ['crate', 'gate', 'boat', 'shark'], 'crates draw under gates, boats and the shark');
  scene.move('R'); scene.move('L');
  const s = scene.state(), { dur, crateDur, gateDur, boatDur } = scene.effects().anim;
  assert.deepEqual([s.pos, s.crates, s.gate, s.boats], [[3, 3], [at(grid, 7, 3)], 1, [[at(grid, 3, 1), 'L']]], 'the whole turn commits at once');
  assert.ok(crateDur > 0 && gateDur > 0 && boatDur > 0);
  const frame = () => { const r = scene.render(); return { crate: r.crates[0][0], gate: r.gates[0], boat: r.boats[0][0] }; };
  scene.tick(dur * 0.6);
  assert.deepEqual(frame(), { crate: 4, gate: 1, boat: 4 }, 'swim: everything else waits');
  scene.tick(dur * 0.4 + crateDur / 2);
  let f = frame(); assert.ok(f.crate > 4 && f.crate < 7, 'crate phase'); assert.equal(f.gate, 1, 'gates wait for the crate'); assert.equal(f.boat, 4);
  scene.tick(crateDur / 2 + gateDur / 2);
  f = frame(); assert.equal(f.crate, 7); assert.ok(f.gate > 0 && f.gate < 1, 'gate phase'); assert.equal(f.boat, 4, 'boats wait for the gates');
  scene.tick(gateDur / 2 + boatDur / 2);
  f = frame(); assert.equal(f.gate, 0); assert.ok(f.boat > 3 && f.boat < 4, 'boat phase');
  assert.equal(scene.state().moves, 1, 'the queued swipe still waits');
  const cues = scene.sounds().map(([name]) => name).filter(n => ['press', 'crate', 'gate', 'boat'].includes(n));
  assert.deepEqual(cues, ['press', 'crate', 'gate', 'boat'], 'cues follow the phases');
  finish(scene);
  assert.equal(scene.state().moves, 2, 'the queued swipe runs after the boat phase');
});

test('a crate bumped right after a jet turn: the shark faces the crate; other jet stops keep their entry facing', () => {
  // U into the '<' jet at 3,2: the jet turns the shark left and the crate at 2,2 stops it on the jet tile
  const JET = { name: 'jet', par: 2, map: ['###E###', '#.....#', '#.c<..#', '#.....#', '###S###'] }, grid = E.parseLevel(JET);
  const scene = game({ level: JET }); scene.move('U');
  assert.deepEqual([scene.state().pos, scene.state().crates], [[3, 2], [at(grid, 1, 2)]], 'the push uses the heading after the jet');
  assert.equal(scene.raw().dir, 'L', 'the shark turns toward the crate it pushed');
  finish(scene);
  const BUOY = { name: 'buoy', par: 2, map: ['###E###', '#.....#', '#.o<.c#', '#.....#', '###S###'] };
  const plain = game({ level: BUOY }); plain.move('U');
  assert.deepEqual(plain.state().pos, [3, 2]); assert.equal(plain.raw().dir, 'U', 'a buoy stop on a jet keeps the earlier facing');
});

test('reduced motion has no crate phase and shows the final crate on arrival', () => {
  const scene = game({ level: LEARN, reduced: true });
  scene.move('U'); finish(scene); scene.move('R');
  const { dur, crateDur } = scene.effects().anim;
  assert.equal(crateDur, 0);
  assert.deepEqual(scene.render().crates, [[4, 1, 0]]);
  scene.tick(dur / 2 + 0.001);   // reduced motion runs the swim at double speed
  assert.deepEqual(scene.render().crates, [[5, 1, 0]]);
  finish(scene);
  assert.ok(scene.sounds().some(([name]) => name === 'crate'), 'the cue still plays');
});

test('a swipe into a crate the shark already touches is no move: the crate only rocks, with the bump cue', () => {
  const scene = game({ level: LEARN }), grid = E.parseLevel(LEARN);
  for (const d of 'URR') { scene.move(d); finish(scene); }
  const before = scene.state();
  scene.move('R');
  assert.deepEqual([scene.state().moves, scene.state().history, scene.state().crates, scene.state().animating], [before.moves, before.history, before.crates, false]);
  assert.deepEqual(scene.effects().wobble, [at(grid, 5, 1)]);
  assert.equal(scene.sounds().at(-1)[0], 'bump');
  scene.tick(0.05);
  const [[x, y]] = scene.render().crates;
  assert.ok(x > 5 && x < 5.1 && y === 1, 'rocks away from the shark, within a tenth of a tile');
  for (let k = 0; k < 8; k++) scene.tick(0.05);
  assert.deepEqual(scene.effects().wobble, []); assert.deepEqual(scene.render().crates, [[5, 1, 0]]);
  const still = game({ level: LEARN, reduced: true });
  for (const d of 'URR') { still.move(d); finish(still); }
  still.move('R'); assert.deepEqual(still.effects().wobble, [], 'no rocking in reduced motion');
});

test('undo and restart-free replays restore crates with the shark, and every turn saves a restorable checkpoint', () => {
  const scene = game({ level: LEARN }), grid = E.parseLevel(LEARN);
  scene.move('U'); finish(scene); scene.move('R'); finish(scene);
  scene.undo();
  assert.deepEqual([scene.state().pos, scene.state().crates, scene.state().moves], [[2, 1], [at(grid, 4, 1)], 1]);
  assert.deepEqual(scene.render().crates, [[4, 1, 0]]);
  const route = E.plan(grid, grid.start, 0, new Set(), 0, true);
  const replay = game({ level: LEARN });
  for (const d of route.seq) {
    replay.move(d);
    const packet = replay.packet();
    finish(replay);
    if (replay.state().cleared) break;
    const restored = replay.restore(packet);
    assert.ok(restored, 'turn ' + d);
    for (const key of ['pos', 'crates', 'boats', 'fish', 'nets', 'moves']) assert.deepEqual(restored[key], replay.state()[key], key);
  }
  assert.equal(replay.state().cleared, true);
});

test('saved crate turns round-trip through storage, including the undo history', () => {
  const scene = game({ level: LEARN }), grid = E.parseLevel(LEARN);
  scene.move('U'); finish(scene); scene.move('R'); finish(scene);
  const packet = scene.packet();
  assert.deepEqual(packet.state.crates, [at(grid, 5, 1)]);
  assert.deepEqual(packet.state.history.map(h => h.crates), [[at(grid, 4, 1)], [at(grid, 4, 1)]]);
  const resumed = game({ level: LEARN, stored: scene.stored() });
  assert.deepEqual(resumed.state(), scene.state());
  assert.deepEqual(resumed.render().crates, [[5, 1, 0]]);
  resumed.undo();
  assert.deepEqual([resumed.state().pos, resumed.state().crates], [[2, 1], [at(grid, 4, 1)]]);
  // the history snapshot is a copy: playing on never rewrites it
  const live = game({ level: LEARN }); live.move('U'); finish(live);
  const snapshot = live.raw().history[0].crates; live.move('R'); finish(live);
  assert.deepEqual(snapshot, [at(grid, 4, 1)]); assert.notEqual(live.raw().crates, snapshot);
});

test('corrupt crate turns are rejected, never repaired into another puzzle', () => {
  const grid = E.parseLevel(FULL), scene = game({ level: FULL });
  const base = { version: 1, id: 'fixture', layout: JSON.stringify([FULL.map, 1]),
    state: { pos: [3, 5], dir: 'U', fish: [], nets: [], boats: [[at(grid, 1, 2), 'R']], moves: 0, history: [], crates: [at(grid, 2, 1), at(grid, 3, 3)] } };
  assert.ok(scene.restore(base), 'the fixture itself is valid');
  const ok = [s => { s.crates = [at(grid, 2, 1), at(grid, 4, 4)]; }, s => { s.crates = [at(grid, 2, 1), at(grid, 3, 4)]; },   // water, sand
    s => { s.fish = [0]; s.crates = [at(grid, 2, 1), at(grid, 4, 1)]; }];                                                // an eaten fish's tile
  for (const change of ok) { const copy = structuredClone(base); change(copy.state); assert.ok(scene.restore(copy), JSON.stringify(copy.state.crates)); }
  const bad = {
    missing: s => { delete s.crates; }, 'too few': s => { s.crates = [at(grid, 2, 1)]; }, 'too many': s => { s.crates.push(at(grid, 4, 4)); },
    duplicate: s => { s.crates = [at(grid, 2, 1), at(grid, 2, 1)]; }, unsorted: s => { s.crates.reverse(); }, 'not integers': s => { s.crates = [at(grid, 2, 1), 17.5]; },
    'not an array': s => { s.crates = 'x'; }, negative: s => { s.crates = [-1, at(grid, 2, 1)]; }, 'off the board': s => { s.crates = [at(grid, 2, 1), 99]; },
    wall: s => { s.crates = [0, at(grid, 2, 1)]; }, exit: s => { s.crates = [at(grid, 2, 1), at(grid, 3, 6)]; }, 'under the shark': s => { s.crates = [at(grid, 2, 1), at(grid, 3, 5)]; },
    'under a boat': s => { s.crates = [at(grid, 1, 2), at(grid, 2, 1)].sort((a, b) => a - b); }, 'under a net': s => { s.nets = [at(grid, 4, 3)]; s.crates = [at(grid, 2, 1), at(grid, 4, 3)]; },
    'under an uneaten fish': s => { s.crates = [at(grid, 2, 1), at(grid, 4, 1)]; },
    'bad history': s => { s.moves = 1; s.history = [{ pos: [3, 5], dir: 'U', fish: [], nets: [], boats: [[at(grid, 1, 2), 'R']], moves: 0, crates: [0, 1] }]; },
  };
  for (const [name, change] of Object.entries(bad)) { const copy = structuredClone(base); change(copy.state); assert.equal(scene.restore(copy), null, name); }
  const changed = structuredClone(base); changed.layout = JSON.stringify([LEARN.map, 1]);
  assert.equal(scene.restore(changed), null, 'another layout');
});

test('a canal without crates keeps the old turn and session shape', () => {
  const scene = game({ level: PLAIN, id: 'plain' });
  assert.deepEqual(scene.keys(), ['pos', 'dir', 'fish', 'nets', 'boats', 'moves', 'history']);
  scene.move('U'); finish(scene);
  assert.equal(scene.state().cleared, true);
  const turn = game({ level: { ...PLAIN, map: ['#E###', '#...#', '#S..#', '#####'] }, id: 'plain' });
  turn.move('R');
  const packet = turn.packet();
  assert.equal('crates' in packet.state, false); assert.ok(packet.state.history.every(h => !('crates' in h)));
  assert.equal(turn.effects().anim.push, null); assert.equal(turn.effects().anim.crateDur, 0);
  const plain = { version: 1, id: 'plain', layout: JSON.stringify([PLAIN.map, 0]), state: { pos: [1, 2], dir: 'U', fish: [], nets: [], boats: [], moves: 0, history: [] } };
  assert.ok(scene.restore(plain, PLAIN, 'plain'));
  assert.equal(scene.restore({ ...plain, state: { ...plain.state, crates: [] } }, PLAIN, 'plain'), null, 'no crates field on a crate-less canal');
});

test('nets never go under a crate: tapping one explains the crate, on net and net-free canals alike', () => {
  const grid = E.parseLevel(LEARN);
  for (const nets of [1, 0]) {
    const scene = game({ level: { ...LEARN, nets } });
    scene.tap(4, 1);
    assert.match(scene.tip(), /나무 상자/); assert.deepEqual(scene.state().nets, []); assert.equal(scene.state().history, 0);
  }
  const scene = game({ level: { ...LEARN, nets: 1 } });
  scene.tap(3, 2); assert.deepEqual(scene.state().nets, [at(grid, 3, 2)], 'plain water still takes a net');
  // after a push the old tile is water again and the new one refuses
  const moved = game({ level: { ...LEARN, nets: 1 } });
  moved.move('U'); finish(moved); moved.move('R'); finish(moved);
  moved.tap(5, 1); assert.deepEqual(moved.state().nets, []); assert.match(moved.tip(), /나무 상자/);
  moved.tap(4, 1); assert.deepEqual(moved.state().nets, [at(grid, 4, 1)]);
});

/* ---------- solver calls: hint and stuck check use the CURRENT crates ---------- */
const hintSource = section('/* ---------- hint allowance', 'function onClear()');
function solverScene(level, state) {
  return new Function('level', 'state', `
    ${engineSource}
    let tip = null, undoPulses = 0, hint = null, hintRequest = 0, cleared = false, anim = null, coach = null, now = 1e6, perf = 0;
    const Date = {now: () => now}, performance = {now: () => (perf += 0.01)}, setTimeout = cb => cb();
    const DIR_KO = {U:'위로',D:'아래로',L:'왼쪽으로',R:'오른쪽으로'};
    const save = {best: {}, hintUsage: {}}, persist = () => {}, LVL = 'fixture', DAILY = null, FREE = null, PILOT = null, reduceMotion = false;
    const elements = {undoBtn: {offsetWidth: 0, classList: {toggle: (name, on) => { if (name === 'nudge' && on) undoPulses++; }}},
      hintBtn: {disabled: false}, hintStatus: {textContent: ''}, app: {inert: false}, gameScreen: {hidden: false}};
    const $ = id => elements[id], setTip = (text, isHint) => { tip = [text, isHint]; }, settingsOpen = () => false, guideOpen = () => false, haptic = () => {};
    const g = parseLevel(level), curLevel = () => level, st = state;
    const netSet = () => new Set(st.nets), fishMask = () => st.fish.reduce((m, i) => m | 1 << i, 0);
    ${source.match(/^const netPickup = .*$/m)[0]}
    ${hintSource}
    return { hint: async () => { await showHint(); return hint; }, stuck: async () => { tickStuck(); for (let k = 0; k < 8; k++) await null; return { tip, undoPulses }; }, tip: () => tip };
  `)(level, state);
}

test('the hint plans from the crates where they are now, matching E.plan with the current crates', async () => {
  const grid = E.parseLevel(LEARN), pushed = [at(grid, 5, 1)];
  const state = { pos: [3, 1], dir: 'R', fish: [], nets: [], boats: [], moves: 2, history: [{}, {}], crates: pushed };
  const expected = E.plan(grid, [3, 1], 0, new Set(), 0, true, [], undefined, false, pushed);
  const stale = E.plan(grid, [3, 1], 0, new Set(), 0, true, [], undefined, false, grid.crates);
  assert.notDeepEqual([expected.moves, expected.seq], [stale.moves, stale.seq], 'the fixture tells the two apart');
  const hint = await solverScene(LEARN, state).hint();
  assert.deepEqual([hint.dir, hint.moves], [expected.seq[0], expected.moves]);
});

test('the stuck check sees a crate that seals the exit, and stays silent while a way out remains', async () => {
  const map = ['###E###', '###.###', '#.....#', '#.....#', '#.c...#', '#S#####'], level = { name: 'seal', par: 5, map }, grid = E.parseLevel(level);
  const sealed = [at(grid, 3, 1)];
  assert.equal(E.plan(grid, grid.start, 0, new Set(), 0, false, [], undefined, false, sealed), null);
  assert.ok(E.plan(grid, grid.start, 0, new Set(), 0, false), 'the starting crate leaves a way out');
  const state = crates => ({ pos: grid.start.slice(), dir: 'U', fish: [], nets: [], boats: [], moves: 1, history: [{}], crates });
  const stuck = await solverScene(level, state(sealed)).stuck();
  assert.match(stuck.tip[0], /나갈 길이 없어요/); assert.equal(stuck.undoPulses, 1);
  const fine = await solverScene(level, state(grid.crates.slice())).stuck();
  assert.deepEqual([fine.tip, fine.undoPulses], [null, 0]);
});

test('every solver call in game.js passes the current crates after the net-pickup argument', () => {
  for (const call of source.match(/\bplan(?:Search)?\(g, st\.pos[^\n]*/g)) assert.match(call, /st\.gate, (?:false|netPickup\(\)), st\.crates\)/, call);
  assert.match(source, /turn\(g, st\.pos, d, netSet\(\), st\.boats, st\.gate, st\.crates, fishMask\(\)\)/);
});

test('the engine mask: a fish eaten on an earlier swipe no longer brakes the crate', () => {
  const level = { name: 'eaten', par: 5, map: ['########', '#......#', '#..c.f.#', '#o...S.#', '########'] }, grid = E.parseLevel(level);
  const scene = game({ level });
  for (const d of 'ULD') { scene.move(d); finish(scene); }
  assert.deepEqual([scene.state().pos, scene.state().fish], [[1, 2], [0]]);
  scene.move('R'); finish(scene);
  assert.deepEqual(scene.state().crates, [at(grid, 6, 2)], 'slides across the eaten fish tile to the wall');
  assert.deepEqual(E.turn(grid, [1, 2], 'R', new Set(), [], undefined, grid.crates, 0).crates, [at(grid, 4, 2)], 'with the fish uneaten it would stop');
});

/* ---------- device spotlight, guide, legend ---------- */
test('the canal that introduces crates spotlights the crate cells before the first move', () => {
  const story = section('// Device kinds a story canal introduces', '/* ---------- story journey:');
  const loadLevel = fn('loadLevel'), cardDue = fn('chapterCardDue'), addSpot = fn('addDeviceSpot'), fresh = fn('freshState');
  const data = { LEVELS: [PLAIN, { ...LEARN, role: 'learn' }], CHAPTERS: [{ name: 'a', count: 1 }, { name: 'b', count: 1 }], STORY_ORDER: [0, 1], STORY_POSITION: [0, 1],
    LEVEL_ROLES: { regular: { label: '일반' }, learn: { label: '연습' } } };
  const run = new Function('data', 'reduced', `
    ${engineSource}
    const { LEVELS, CHAPTERS, STORY_ORDER, STORY_POSITION, LEVEL_ROLES } = data;
    let DAILY = null, FREE = null, PILOT = null, STORY = null, LVL = 0, deco = 0, g, st, deviceSpot = null, reduceMotion = reduced;
    const save = {best: {}}, deviceSpotShown = new Set(), chapterCardShown = new Set(), storyLevel = i => LEVELS[i];
    const enter = level => { st = freshState(level); }, openChapterCard = () => {};
    ${story}
    ${cardDue}
    ${addSpot}
    ${fresh}
    ${loadLevel}
    return { load: i => { deviceSpot = null; loadLevel(i); return deviceSpot && deviceSpot.cells; }, introduced: i => introducedDevices(i), devices: chapterDevices };
  `);
  const scene = run(data, false), grid = E.parseLevel(LEARN);
  assert.deepEqual(scene.introduced(1), ['crate']); assert.deepEqual(scene.devices(1), ['crate']);
  assert.deepEqual(scene.load(1), [at(grid, 4, 1)], 'the crate tile (stored as water) is lit');
  assert.equal(run(data, true).load(1), null, 'reduced motion: no spotlight');
});

test('the crate guide is a sheet with an example, listed after the sluice; the legend and chapter chip draw a crate', () => {
  const guideSource = section('const DEVICE_GUIDES = [', '// screen change with a native-style push');
  const guide = new Function('E', 'D', 'level', `
    const {JET} = E, {createDeviceDemo, sampleDeviceDemo} = D, g = E.parseLevel(level), reduceMotion = false;
    const openSheet = id => { $(id).hidden = false; }, closeSheet = id => { $(id).hidden = true; };
    const save = {seenDevices: []}, persist = () => {}, elements = new Map(), tips = [], setTip = text => tips.push(text), addDeviceSpot = () => {};
    const $ = id => { if (!elements.has(id)) elements.set(id, {hidden: id === 'guideOverlay', textContent: '', innerHTML: '', focus() {}, setAttribute() {}, getBoundingClientRect: () => ({width: 0, height: 0})}); return elements.get(id); };
    ${guideSource}
    return { show: showDeviceGuide, close: closeGuide, keys: () => guideKeys.slice(), demo: () => guideDemo, seen: () => save.seenDevices, tips, guides: DEVICE_GUIDES, el: $ };
  `);
  const scene = guide(E, D, LEARN);
  const entry = scene.guides.find(d => d.key === 'crate');
  assert.equal(entry.name, '나무 상자'); assert.equal(entry.light, undefined, 'a stateful device gets the sheet');
  assert.equal(scene.guides.at(-1).key, 'crate');
  assert.ok(entry.has(E.parseLevel(LEARN)) && !entry.has(E.parseLevel(PLAIN)));
  scene.show(true);
  assert.deepEqual(scene.keys(), ['crate'], 'the buoy introduces itself on the board, the crate in the sheet');
  assert.equal(scene.demo().clip, true); assert.equal(scene.demo().key, 'crate');
  assert.match(scene.el('guideItems').innerHTML, /바로 옆에서는 밀리지 않아요/);
  scene.close(); assert.deepEqual(scene.seen(), ['crate']);
  const legend = new Function(`
    const drawn = [], noop = () => {}, C = {}, ctx = new Proxy({}, {get: () => noop});
    const drawFish = noop, drawBuoy = noop, drawBoat = noop, drawJet = noop, drawNet = noop, drawExit = noop, drawSand = noop, drawWhirl = noop, drawGate = noop, drawSwitch = noop;
    const drawCrate = (c, x, y, size) => drawn.push([x, y, size]);
    const items = []; const $ = () => ({ set innerHTML(v) { items.push(v); }, querySelectorAll: () => [] });
    ${fn('renderLegend')}
    ${fn('drawLegendIcon')}
    renderLegend(); drawLegendIcon({ getContext: () => ctx, dataset: { k: 'crate' } });
    return { drawn, html: items.join('') };
  `)();
  assert.match(legend.html, /data-k="crate"[^]*나무 상자/);
  assert.equal(legend.drawn.length, 1); const [x, y, size] = legend.drawn[0];
  assert.ok(Math.abs(x + size / 2 - 18) < 1e-9 && Math.abs(y + size / 2 - 18) < 1e-9, 'centred in the 36px icon');
});

test('drawCrate: an empty brown box that bobs at most 2px, holds still in reduced motion, and restores the canvas', () => {
  const draw = reduced => new Function('reduced', `
    const calls = [], reduceMotion = reduced; let depth = 0, fills = [];
    const ctx = new Proxy({}, {get: (t, k) => k === 'save' ? () => depth++ : k === 'restore' ? () => depth-- : k === 'translate' ? (x, y) => calls.push([x, y])
      : k === 'createLinearGradient' ? () => ({ addColorStop: (o, c) => fills.push(c) }) : k === 'roundRect' ? () => {} : typeof t[k] === 'undefined' ? () => {} : t[k],
      set: (t, k, v) => { if (k === 'fillStyle' && typeof v === 'string') fills.push(v); t[k] = v; return true; }});
    ${fn('drawCrate')}
    for (const time of [0, .4, .9, 1.7, 2.6]) drawCrate(ctx, 34, 68, 34, time);
    return { depth, bobs: calls.filter(([x]) => x === 0).map(([, y]) => y), fills };
  `)(reduced);
  const moving = draw(false), still = draw(true);
  assert.equal(moving.depth, 0); assert.equal(still.depth, 0);
  assert.ok(moving.bobs.some(b => b !== 0) && moving.bobs.every(b => Math.abs(b) <= 2), 'gentle bob');
  assert.ok(still.bobs.every(b => b === 0), 'no bob in reduced motion');
  assert.ok(moving.fills.some(c => /^#[89a-d][0-9a-f][4-6]/i.test(c)), 'brown wood');
  assert.ok(!moving.fills.some(c => /ff97|df51|ffcb/i.test(c)), 'none of the buoy orange');
});

/* ---------- example and sound ---------- */
test('the crate example follows the real turn: swim, crate slides to the wall, then the shark stops in front of it', () => {
  const demo = D.createDeviceDemo('crate'), grid = demo.grid, moves = demo.phases.filter(p => p.kind === 'move'), push = demo.phases.find(p => p.kind === 'crate');
  assert.equal(demo.phases.filter(p => p.kind === 'crate').length, 1);
  const real = E.turn(grid, moves[0].from.pos, 'R', new Set(), [], 0, moves[0].from.crates, 0);
  assert.deepEqual([moves[0].to.pos, push.from.crates, push.to.crates], [real.end, grid.crates, real.crates]);
  assert.deepEqual([push.push.from, push.push.to], [real.push.from, real.push.to]);
  assert.ok(push.start >= moves[0].start + moves[0].duration, 'the crate moves after the shark arrives');
  assert.deepEqual(moves[1].to.pos, [4, 2], 'the second swim stops in front of the pushed crate');
  const mid = D.sampleDeviceDemo(demo, push.start + push.duration / 2).crates[0];
  assert.ok(mid.x > 3 && mid.x < 5 && mid.y === 2, 'glides in its own phase');
  assert.deepEqual(D.sampleDeviceDemo(demo, moves[0].start + moves[0].duration / 2).crates, [{ x: 3, y: 2 }], 'waits during the swim');
  assert.deepEqual(demo.steps.map(s => s.text), ['상자 쪽으로 밀어요', '헤엄쳐 와서 상자를 코로 쳐요', '상자가 막힐 때까지 밀려나요', '한 번 더 밀어요', '밀린 상자 앞에서 멈출 수 있어요', D.DEVICE_DEMOS.crate.summary]);
  const clip = D.createDeviceDemo('crate', { pace: 'clip' });
  assert.ok(clip.duration < 8 && clip.phases.find(p => p.kind === 'move').start <= 1);
});

function audio(withRecordings) {
  const sources = []; let now = 0;
  const param = () => ({ value: 1, events: [], setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = () => ({ connect(n) { return n; }, disconnect() {} });
  const source = kind => { const n = Object.assign(node(), { kind, frequency: param(), playbackRate: param(), start(t) { n.startTime = t; }, stop(t) { n.stopTime = t; } }); sources.push(n); return n; };
  const context = { get currentTime() { return now; }, sampleRate: 48000, state: 'running', destination: node(),
    createGain: () => Object.assign(node(), { gain: param() }), createBiquadFilter: () => Object.assign(node(), { frequency: param(), Q: param() }),
    createDynamicsCompressor: () => Object.assign(node(), Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(k => [k, param()]))),
    createBuffer: (c, length) => ({ getChannelData: () => new Float32Array(length) }), createOscillator: () => source('tone'), createBufferSource: () => source('buffer'),
    resume: () => Promise.resolve() };
  let samples;
  if (withRecordings) {
    const keys = Object.keys(SFX_SAMPLES); let next = 0;
    samples = Object.fromEntries(keys.map(k => [k, ['data:audio/ogg;base64,AAAA', ...SFX_SAMPLES[k].slice(1)]]));
    context.decodeAudioData = (data, ok) => { const b = { key: keys[next++], duration: 2, length: 96000, sampleRate: 48000, numberOfChannels: 1, getChannelData: () => new Float32Array(96000) }; ok(b); return Promise.resolve(b); };
  }
  const game = createGameAudio({ createContext: () => context, ...(samples ? { samples } : {}) });
  return { game, sources, advance: s => { now += s; for (const n of sources) if (!n.ended && n.stopTime <= now) { n.ended = true; n.onended?.(); } } };
}
test('crate cue: a knock and a swish at once, a quiet creak when the crate stops; synthesized without recordings', async () => {
  const a = audio(true); a.game.unlock(); await a.game.loaded();
  a.game.effects.crate(0.2);
  const layers = a.sources.filter(n => n.buffer).map(n => [n.buffer.key, +n.startTime.toFixed(3)]);
  assert.deepEqual(layers, [['softImpact2', 0], ['waterSwish', 0.02], ['woodCreak', 0.2]]);
  assert.equal(a.sources.filter(n => n.kind === 'tone').length, 0);
  a.game.effects.crate(0.2); assert.equal(a.game.inspect().played, 1, 'a second push within the interval is dropped');
  a.advance(1); assert.equal(a.game.inspect().sources, 0, 'every layer ends');
  a.game.effects.crate(Infinity); assert.ok(a.sources.filter(n => n.buffer?.key === 'woodCreak').at(-1).startTime - 1 <= 0.4 + 1e-9, 'a bad slide time stays a short cue');
  const s = audio(false); s.game.unlock(); s.game.effects.crate(0.2);
  assert.ok(s.sources.filter(n => n.kind === 'tone').length >= 2, 'synthesized fallback');
  s.advance(1); assert.equal(s.game.inspect().sources, 0);
});
