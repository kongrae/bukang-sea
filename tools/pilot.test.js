const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../src/engine.js');
const D = require('../src/device-demo.js');
const { PILOT_LEVELS, PILOT_REGIONS } = require('../src/pilot.js');
const { replayPlan, replaySteps, parseRoute } = require('./replay-plan.js');
const { verifyPilot } = require('./verify-pilot.js');
const read = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
const source = read('game.js');
const fn = name => {
  const found = source.match(new RegExp(`^function ${name}\\([^\\n]*}\\s*$`, 'm')) || source.match(new RegExp(`function ${name}\\([^]*?\\n}`));
  assert.ok(found, 'missing production function ' + name); return found[0];
};
const at = (g, x, y) => y * g.w + x;

/* ---------- R01 rules in the shared engine ---------- */
test('closed gates block like walls, open gates pass, and every press flips both gate kinds', () => {
  const g = E.parseLevel({ name: 'gates', map: ['#####', '#.G.#', '#####', '#.g.#', '#####', '#p..#', '#S###'] });
  assert.deepEqual(g.gates, [at(g, 2, 1), at(g, 2, 3)]);
  assert.equal(E.gatePassage(g, at(g, 2, 1)), 'H');
  assert.equal(E.slide(g, [1, 1], 'R', new Set(), [], 0).end.join(), '1,1', 'closed G stops the shark before it');
  assert.equal(E.slide(g, [1, 3], 'R', new Set(), [], 0).end.join(), '3,3', 'open g passes');
  assert.equal(E.slide(g, [1, 1], 'R', new Set(), [], 1).end.join(), '3,1', 'pressed: G opens');
  assert.equal(E.slide(g, [1, 3], 'R', new Set(), [], 1).end.join(), '1,3', 'pressed: g closes');
  assert.ok(E.isBlocked(g, 2, 1, null, null, 0) && !E.isBlocked(g, 2, 1, null, null, 1));
});

test('a switch is pressed only by ending a move on it: passing, leaving, blocked swipes and escapes never press', () => {
  const g = E.parseLevel({ name: 'press', map: ['###E###', '###G###', '#.p...#', '#.....#', '###S###'] });
  const pass = E.turn(g, [1, 2], 'R', new Set(), [], 0);
  assert.equal(pass.end.join(), '5,2'); assert.equal(pass.pressed, false); assert.equal(pass.gate, 0);
  const stop = E.turn(g, [2, 3], 'U', new Set(), [], 0);
  assert.equal(stop.end.join(), '2,2'); assert.equal(stop.pressed, true); assert.equal(stop.gate, 1);
  const leave = E.turn(g, [2, 2], 'D', new Set(), [], 1);
  assert.equal(leave.pressed, false); assert.equal(leave.gate, 1, 'leaving the switch keeps the state');
  const blocked = E.turn(g, [2, 2], 'U', new Set(), [], 1);
  assert.equal(blocked.path.length, 0); assert.equal(blocked.pressed, false); assert.equal(blocked.gate, 1);
  const again = E.turn(g, [2, 3], 'U', new Set(), [], 1);
  assert.equal(again.pressed, true); assert.equal(again.gate, 0, 'pressing again closes the gate');
  const lock = E.parseLevel({ name: 'exit', map: ['###E###', '###p###', '###G###', '#.....#', '###S###'] });
  const escape = E.turn(lock, [3, 3], 'U', new Set(), [], 1);
  assert.equal(escape.win, true); assert.equal(escape.pressed, false, 'escaping across a switch never presses');
  // A jet ride carries the shark over the switch and stops elsewhere: only the stopping tile counts.
  const loop = E.parseLevel({ name: 'loop', map: ['#######', '#>.pv.#', '#.###.#', '#^...<#', '###G###', '###E###'] });
  const r = E.turn(loop, [2, 3], 'L', new Set(), [], 0);
  assert.ok(r.path.filter(([x, y]) => x === 3 && y === 1).length >= 1);
  assert.equal(r.pressed, false);
});

test('turn order: the shark slides with the turn-start gates, presses, then boats move with the new gates', () => {
  // The boat heads right into the gate; the press on the same turn closes it, so the boat must turn around.
  const g = E.parseLevel({ name: 'order', map: ['########', '#..b.g.#', '########', '#p.....#', '#S######'] });
  const gate = at(g, 5, 1);
  assert.equal(E.gateIsOpen(g, gate, 0), true);
  const noPress = E.stepBoats(g, [[at(g, 4, 1), 'R']], at(g, 1, 3), new Set(), 0);
  assert.deepEqual(noPress, [[gate, 'R']], 'open gate lets the boat in');
  const r = E.turn(g, [1, 4], 'U', new Set(), [[at(g, 4, 1), 'R']], 0);
  assert.equal(r.pressed, true);
  assert.deepEqual(r.boats, [[at(g, 3, 1), 'L']], 'the boat sees the gate the press just closed');
  // A boat already inside the gate keeps the shutter open until it leaves; nothing ever sits inside a closed gate.
  const held = [[gate, 'R']];
  assert.ok(E.isBlocked(g, 5, 1, null, held, 1), 'the waiting boat still blocks its tile');
  const out = E.stepBoats(g, held, at(g, 1, 3), new Set(), 1);
  assert.deepEqual(out, [[at(g, 6, 1), 'R']], 'a boat may leave a gate that closed around it');
  assert.ok(E.isBlocked(g, 5, 1, null, out, 1), 'once empty, the closed gate blocks');
  assert.deepEqual(E.stepBoats(g, [[at(g, 6, 1), 'L']], at(g, 1, 3), new Set(), 1), [[at(g, 6, 1), 'R']], 'and turns boats back');
});

test('invalid gate data is rejected instead of playing silently', () => {
  const bad = { 'gate without switch': ['#####', '#.G.#', '#####', '#S..#', '#E###'],
    'switch without gate': ['#####', '#.p.#', '#S.E#', '#####'],
    'gate outside a one-tile channel': ['#####', '#.G.#', '#...#', '#p.S#', '#E###'],
    'gate on the border': ['##G##', '#.p.#', '#S..#', '#E###'] };
  for (const [name, map] of Object.entries(bad)) assert.throws(() => E.parseLevel({ name, map }), /gate|switch/, name);
});

test('nets never go on switches or gates, and plans never ask for that', () => {
  const g = E.parseLevel(PILOT_LEVELS[10]);
  const steps = parseRoute(g, PILOT_LEVELS[10].route);
  assert.throws(() => replaySteps(g, [{ dir: 'U', nets: [g.switches[0]] }, ...steps]), /water/);
  for (const level of PILOT_LEVELS) {
    const grid = E.parseLevel(level), p = E.plan(grid, grid.start, 0, new Set(), grid.nets, true);
    for (const step of p.steps) for (const i of step.nets) assert.equal(grid.cells[i], '.', level.id);
  }
});

// Exhaustive oracle with gates (net pickup rule of daily/free v1–v3): every legal net placement before every swipe,
// the full turn() order, no pruning.
function exhaustive(g, needAll) {
  const key = s => s.pos + '|' + s.mask + '|' + E.boatsKey(s.boats) + '|' + s.gate;
  let q = [{ pos: g.start, mask: 0, boats: g.boats, gate: 0 }], depth = 0;
  const seen = new Set(q.map(key)), full = (1 << g.fish.length) - 1;
  while (q.length) {
    depth++; const nq = [];
    for (const s of q) {
      const spots = [], configs = [[]];
      g.cells.forEach((c, i) => {
        if (c === '.' && i !== s.pos[1] * g.w + s.pos[0] && !s.boats.some(b => b[0] === i)
          && !g.fish.some(([x, y], fi) => y * g.w + x === i && !(s.mask & (1 << fi)))) spots.push(i);
      });
      if (g.nets) spots.forEach(i => configs.push([i]));
      for (const cfg of configs) for (const d of 'UDLR') {
        const r = E.turn(g, s.pos, d, new Set(cfg), s.boats, s.gate);
        if (!r.path.length) continue;
        let m = s.mask;
        for (const [x, y] of r.path) g.fish.forEach(([fx, fy], fi) => { if (x === fx && y === fy) m |= 1 << fi; });
        if (r.win) { if (!needAll || m === full) return depth; continue; }
        const n = { pos: r.end, mask: m, boats: r.boats, gate: r.gate };
        if (!seen.has(key(n))) { seen.add(key(n)); nq.push(n); }
      }
    }
    q = nq;
  }
  return null;
}
// Exhaustive oracle for the placed-net rule (2026-10-08): set nets stay; any remaining net may be set before any swipe.
function exhaustivePlaced(g, needAll) {
  const key = s => s.pos + '|' + s.mask + '|' + E.boatsKey(s.boats) + '|' + s.gate + '|' + s.nets.join(',');
  let q = [{ pos: g.start, mask: 0, boats: g.boats, gate: 0, nets: [] }], depth = 0;
  const seen = new Set(q.map(key)), full = (1 << g.fish.length) - 1;
  while (q.length) {
    depth++; const nq = [];
    for (const s of q) {
      const configs = [s.nets];
      if (s.nets.length < g.nets) g.cells.forEach((c, i) => {
        if (c === '.' && i !== s.pos[1] * g.w + s.pos[0] && !s.nets.includes(i) && !s.boats.some(b => b[0] === i)
          && !g.fish.some(([x, y], fi) => y * g.w + x === i && !(s.mask & (1 << fi)))) configs.push([...s.nets, i].sort((a, b) => a - b));
      });
      for (const cfg of configs) for (const d of 'UDLR') {
        const r = E.turn(g, s.pos, d, new Set(cfg), s.boats, s.gate);
        if (!r.path.length) continue;
        let m = s.mask;
        for (const [x, y] of r.path) g.fish.forEach(([fx, fy], fi) => { if (x === fx && y === fy) m |= 1 << fi; });
        if (r.win) { if (!needAll || m === full) return depth; continue; }
        const n = { pos: r.end, mask: m, boats: r.boats, gate: r.gate, nets: cfg };
        if (!seen.has(key(n))) { seen.add(key(n)); nq.push(n); }
      }
    }
    q = nq;
  }
  return null;
}
test('both net rules match their exhaustive search, including switch parity', () => {
  const rand = (s => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296))(4242);
  const masks = [['##E###', '##G###', '#....#', '#.##.#', '#....#', '#S####'], ['#######', '#....GE', '#.##.##', '#....##', '#S#####']];
  let checked = 0;
  for (let i = 0; i < 60; i++) {
    const rows = masks[i % 2].map(r => r.split('')), free = [];
    rows.forEach((r, y) => r.forEach((c, x) => { if (c === '.') free.push([x, y]); }));
    const put = ch => { const [x, y] = free.splice(Math.floor(rand() * free.length), 1)[0]; rows[y][x] = ch; };
    put('p'); if (i % 3) put('o'); put('f'); if (i % 4 === 0) put('f'); if (i % 5 === 0) put('b'); if (i % 7 === 0) put('>');
    let g;
    try { g = E.parseLevel({ name: 'oracle ' + i, map: rows.map(r => r.join('')), nets: i % 2 }); } catch (e) { continue; }
    for (const needAll of [true, false]) {
      const p = E.plan(g, g.start, 0, new Set(), g.nets, needAll, undefined, undefined, true);
      assert.equal(p ? p.moves : null, exhaustive(g, needAll), JSON.stringify({ map: rows.map(r => r.join('')), needAll }));
      if (p) replayPlan(g, p, { needAll, pickup: true });
      const placed = E.plan(g, g.start, 0, new Set(), g.nets, needAll);
      assert.equal(placed ? placed.moves : null, exhaustivePlaced(g, needAll), 'placed rule ' + JSON.stringify({ map: rows.map(r => r.join('')), needAll }));
      if (placed) replayPlan(g, placed, { needAll });
    }
    checked++;
  }
  assert.ok(checked >= 40, 'enough valid random gate boards');
});

test('the same tile with a different gate state is a different search state', () => {
  // Press to open the fish pocket (closing the exit), fetch the fish, press again on the SAME tile to reopen the exit.
  const map = ['####E##', '####g##', '#p..S##', '#G#####', '#f#####', '#######'];
  const g = E.parseLevel({ name: 'twice', map }), p = E.plan(g, g.start, 0, new Set(), 0, true), done = replayPlan(g, p);
  assert.equal(p.moves, 5); assert.equal(done.presses, 2);
  assert.equal(E.plan(g, g.start, 0, new Set(), 0, false).moves, 1, 'escape alone needs no press');
  const frozen = E.parseLevel({ name: 'twice', map });
  frozen.switches = [];
  assert.equal(E.plan(frozen, frozen.start, 0, new Set(), 0, true), null);
  assert.equal(E.bfsFrom(g, g.start, 0, new Set(), true, 40).moves, p.moves, 'plain BFS also tracks the gate state');
});

/* ---------- R03 course data ---------- */
test('the 12-canal pilot course passes its separate verification', () => {
  const lines = [];
  assert.equal(verifyPilot(line => lines.push(line)), 0, lines.join('\n'));
  assert.deepEqual(PILOT_LEVELS.map(l => l.id), Array.from({ length: 12 }, (_, i) => 'p' + String(i + 1).padStart(2, '0')));
  assert.deepEqual([...new Set(PILOT_LEVELS.map(l => l.region))], PILOT_REGIONS.map(r => r.id));
  assert.deepEqual(PILOT_LEVELS.map(l => l.region === 'north-harbor'), [true, true, true, true, false, false, false, false, false, false, false, false]);
  assert.ok(PILOT_LEVELS[3].boundary && PILOT_LEVELS[11].finale);
});

test('every sluice canal needs its gate: with switches frozen neither escape nor the all-fish goal exists', () => {
  for (const level of PILOT_LEVELS.filter(l => l.region === 'sluice-works')) {
    const g = E.parseLevel(level); g.switches = [];
    assert.equal(E.plan(g, g.start, 0, new Set(), g.nets, false), null, level.id + ' escape');
    assert.equal(E.plan(g, g.start, 0, new Set(), g.nets, true), null, level.id + ' all fish');
  }
});

/* ---------- R02 game state, presentation, undo and saved turns (production functions) ---------- */
const engineSource = read('engine.js');
function game({ level, reduced = false, stored = null, id = 'p05' } = {}) {
  const easing = source.slice(source.indexOf('function easeTable('), source.indexOf('/* ---------- drawing primitives'));
  const effects = source.slice(source.indexOf('// effects live in tile units;'), source.indexOf('function loadLevel('));
  const functions = ['hash', 'persist', 'levelSignature', 'copyTurn', 'restoreSession', 'checkpoint', 'pauseGame', 'freshState', 'netSet', 'fishMask', 'pushHistory',
    'tryMove', 'eatFish', 'landShark', 'finishAnim', 'undo', 'tapTile', 'step', 'draw'].map(fn).join('\n');
  return new Function('level', 'reduceMotion', 'stored', 'pilotId', `
    ${engineSource}
    ${easing}
    ${source.match(/^const ANG = .*$/m)[0]}
    const noop = () => {}, sounds = [], sfx = new Proxy({}, {get: (_, name) => (...args) => sounds.push(name)});
    const ctx = new Proxy({}, {get: (target, key) => key in target ? target[key] : noop});
    const C = {}, T = 40, dpr = 1, OX = 0, OY = 0, CW = 360, CH = 640, staticLayer = {}, waterPath = {}, caustic = {}, causticPat = {};
    const $ = () => ({hidden: false, classList: {contains: () => false}});
    const haptic = noop, updateHud = noop, coachDone = noop, setupCoach = noop, refreshHint = noop;
    let tip = ''; const setTip = text => { tip = text; };
    const drawExit = noop, drawJet = noop, drawBuoy = noop, drawWhirl = noop, drawFish = noop, drawNet = noop, css = {getPropertyValue: () => 'sans-serif'};
    let gates = [], switches = [], boatsDrawn = [];
    const drawGate = (c, x, y, size, open, axis) => gates.push([x / T, y / T, +open.toFixed(3), axis]);
    const drawSwitch = (c, x, y, size, on) => switches.push(on), drawShark = noop;
    const drawBoat = (c, x, y) => boatsDrawn.push([x / T - 0.5, y / T - 0.5]);
    const save = stored ? JSON.parse(stored) : {best: {}, coachNet: true, sessions: {}}, curLevel = () => level;
    const STORE_KEY = 'test'; let written = stored, gest = null, FREE = null, DAILY = null, LVL = 0;
    const PILOT = {index: 4, level: Object.assign({}, level, {id: pilotId})};
    const localStorage = {setItem: (key, value) => { written = value; }};
    const wake = [], particles = [], jetFlash = new Map(), netPop = new Map(), contactPulse = new Map(), netRetract = new Map(), crateWobble = new Map();
    let g, st, anim = null, hint = null, bump = null, settle = null, pop = null, queued = null, coach = null, cleared = false, clock = 0, hintRequest = 0, deco = 0, exitZoom = null, deviceSpot = null;
    const EXIT_ZOOM = { scale: .06, dur: .45 }, sandSeen = new Map(), DEVICE_SPOT = { dur: 1.8, pulses: 3 }, flyFish = noop;
    const onClear = () => { cleared = true; };
    ${effects}
    ${source.match(/^const netPickup = .*$/m)[0]}
    ${functions}
    st = freshState(level);
    const resumed = restoreSession(save.sessions.pilot, level, pilotId);
    if (resumed) st = resumed;
    const view = {x: st.pos[0], y: st.pos[1], ang: ANG.U, target: ANG.U};
    return {
      move: tryMove, tick: step, undo, tap: tapTile, pause: pauseGame, stored: () => written, tip: () => tip, sounds: () => sounds.slice(),
      restore: (record, other = level, rid = pilotId) => restoreSession(record, other, rid),
      render: () => { gates = []; switches = []; boatsDrawn = []; draw(0); return { gates, switches, boats: boatsDrawn }; },
      effects: () => ({contacts: [...contactPulse.keys()], anim: anim && {t: anim.t, dur: anim.dur, gateDur: anim.gateDur, boatDur: anim.boatDur, pressed: anim.pressed}}),
      state: () => JSON.parse(JSON.stringify({pos: st.pos, gate: st.gate, boats: st.boats, nets: st.nets, fish: st.fish, moves: st.moves, history: st.history.length, cleared, animating: !!anim}))
    };
  `)(level, reduced, stored, id);
}
const finish = scene => { for (let i = 0; scene.state().animating && i < 60; i++) scene.tick(0.05); assert.equal(scene.state().animating, false); };
const P05 = PILOT_LEVELS[4];

test('a press is committed at once but the gates turn only after the shark arrives; boats and queued input wait', () => {
  const level = { name: 'press order', par: 4, map: ['#########', '#..b.g..#', '###.#####', '#p......#', '#S#######'] };
  const scene = game({ level, id: 'fixture' });
  assert.deepEqual(scene.render().gates, [[5, 1, 1, 'H']]);
  scene.move('U'); scene.move('R');
  assert.equal(scene.state().gate, 1, 'logic commits immediately');
  assert.equal(scene.effects().anim.pressed, true);
  assert.deepEqual(scene.render().gates, [[5, 1, 1, 'H']], 'still open while the shark swims');
  assert.deepEqual(scene.render().switches, [false]);
  const { dur, gateDur, boatDur } = scene.effects().anim;
  assert.equal(gateDur, 0.2); assert.ok(boatDur > 0);
  scene.tick(dur + gateDur / 2);
  const mid = scene.render();
  assert.ok(mid.gates[0][2] > 0 && mid.gates[0][2] < 1, 'shutter moving in the gate phase');
  assert.deepEqual(mid.switches, [true]);
  assert.deepEqual(mid.boats, [[3, 1]], 'boats wait for the gate phase');
  assert.equal(scene.state().moves, 1, 'queued swipe waits for every phase');
  finish(scene);
  assert.equal(scene.state().moves, 2);
  assert.deepEqual(scene.render().gates, [[5, 1, 0, 'H']]);
});

test('undo, reload and replay restore the gate together with the shark, fish, nets and moves', () => {
  const scene = game({ level: P05 });
  scene.move('U'); finish(scene); scene.move('L'); finish(scene);
  assert.deepEqual([scene.state().gate, scene.state().fish, scene.state().moves], [1, [0], 2]);
  const resumed = game({ level: P05, stored: scene.stored() });
  assert.deepEqual(resumed.state(), scene.state());
  assert.deepEqual(resumed.render().gates, [[4, 1, 1, 'V']]);
  resumed.undo(); resumed.undo();
  assert.deepEqual([resumed.state().gate, resumed.state().moves, resumed.state().pos], [0, 0, [4, 6]]);
  assert.deepEqual(resumed.render().gates, [[4, 1, 0, 'V']]);
  const story = JSON.parse(scene.stored());
  assert.equal(story.sessions.story, undefined, 'the course never writes the story slot');
});

test('saved pilot turns with an impossible gate state are ignored, never repaired into another puzzle', () => {
  const scene = game({ level: P05 });
  scene.move('U'); finish(scene);
  const packet = JSON.parse(scene.stored()).sessions.pilot;
  assert.ok(scene.restore(packet));
  const broken = [p => { p.state.gate = 2; }, p => { delete p.state.gate; }, p => { p.state.history[0].gate = 'x'; },
    p => { p.state.gate = 0; p.state.pos = [4, 1]; }, p => { p.id = 'p06'; }, p => { p.layout = 'changed'; }];
  for (const mutate of broken) { const copy = structuredClone(packet); mutate(copy); assert.equal(scene.restore(copy), null, JSON.stringify(copy.state.pos)); }
  const story = game({ level: { name: 'plain', par: 2, map: ['#E#', '#.#', '#S#'] }, id: 'plain' });
  story.move('U'); finish(story);
  assert.equal(story.state().gate, undefined, 'canals without switches keep the old turn shape');
  const plain = { version: 1, id: 'plain', layout: JSON.stringify([['#E#', '#.#', '#S#'], 0]), state: { pos: [1, 2], dir: 'U', fish: [], nets: [], boats: [], moves: 0, history: [] } };
  assert.ok(story.restore(plain, undefined, 'plain'));
  assert.equal(story.restore({ ...plain, state: { ...plain.state, gate: 1 } }, undefined, 'plain'), null);
});

test('reduced motion has no gate phase and shows the final gate and switch on arrival', () => {
  const scene = game({ level: P05, reduced: true });
  scene.move('U');
  assert.equal(scene.effects().anim.gateDur, 0);
  scene.tick(scene.effects().anim.dur + 0.001);
  assert.deepEqual(scene.render().gates, [[4, 1, 1, 'V']]);
  assert.deepEqual(scene.render().switches, [true]);
  finish(scene);
});

test('a closed gate stops slides at its tile, a swipe into it is no move, and tapping devices explains them', () => {
  const p05 = game({ level: P05 });
  p05.move('U'); finish(p05);
  assert.ok(p05.effects().contacts.includes(E.parseLevel(P05).gates[0]), 'the stop reacts at the closed gate');
  const bump = game({ level: { name: 'bump', par: 3, map: ['###E###', '###G###', '#p.S..#', '#######'] }, id: 'bump' });
  bump.move('U');
  assert.deepEqual([bump.state().moves, bump.state().gate, bump.state().animating], [0, 0, false], 'no move, no press');
  bump.move('L'); finish(bump);
  assert.deepEqual([bump.state().pos, bump.state().gate], [[1, 2], 1]);
  bump.tap(1, 2); assert.match(bump.tip(), /멈춰야 눌려요/);
  bump.tap(3, 1); assert.match(bump.tip(), /수문/);
  assert.deepEqual(bump.state().nets, []);
});

test('every pilot solution plays through the real move/net handlers with restorable checkpoints after each turn', () => {
  for (const level of PILOT_LEVELS) {
    const grid = E.parseLevel(level), steps = parseRoute(grid, level.route), scene = game({ level, id: level.id });
    for (const step of steps) {
      for (const n of scene.state().nets.filter(n => !step.nets.includes(n))) scene.tap(n % grid.w, Math.floor(n / grid.w));
      for (const n of step.nets.filter(n => !scene.state().nets.includes(n))) scene.tap(n % grid.w, Math.floor(n / grid.w));
      assert.deepEqual(scene.state().nets.slice().sort(), step.nets.slice().sort(), level.id + ' nets');
      scene.move(step.dir);
      const packet = JSON.parse(scene.stored()).sessions.pilot;
      finish(scene);
      if (!scene.state().cleared) {
        const restored = scene.restore(packet, level, level.id);
        assert.ok(restored, level.id + ' turn');
        for (const key of ['pos', 'gate', 'boats', 'fish', 'nets', 'moves']) assert.deepEqual(restored[key], scene.state()[key], level.id + ' ' + key);
      }
    }
    assert.equal(scene.state().cleared, true, level.id);
    assert.equal(scene.state().fish.length, grid.fish.length, level.id + ' all fish');
    assert.ok(scene.state().moves <= level.par, level.id + ' within the star target');
  }
});

/* ---------- hints with gates ---------- */
test('hints search from the current gate state and never spend allowance on a cancelled search', async () => {
  const hintSource = source.slice(source.indexOf('/* ---------- hint allowance'), source.indexOf('function onClear()'));
  const run = (state, cancel = false) => new Function('level', 'state', 'cancel', `
    ${engineSource}
    let now = 1000, tip = '', hint = null, hintRequest = 0, written = null;
    const Date = {now: () => now}, DIR_KO = {U:'위로',D:'아래로',L:'왼쪽으로',R:'오른쪽으로'};
    const save = {best: {}, hintUsage: {}}, persist = () => { written = JSON.stringify(save); };
    const elements = {hintBtn: {disabled: false}, hintStatus: {textContent: ''}, gameScreen: {hidden: false}};
    const $ = id => elements[id], settingsOpen = () => false, guideOpen = () => false, haptic = () => {};
    const setTip = text => { tip = text; };
    const g = parseLevel(level), st = state, anim = null, cleared = false, netSet = () => new Set(st.nets);
    const fishMask = () => st.fish.reduce((m, i) => m | 1 << i, 0);
    const DAILY = null, FREE = null, LVL = 0, PILOT = {level: {id: 'p08'}};
    const setTimeout = cb => { if (cancel) { hintRequest++; cancel = false; } cb(); };
    ${source.match(/^const netPickup = .*$/m)[0]}
    ${hintSource}
    return showHint().then(() => ({tip, usage: save.hintUsage, hint}));
  `)(PILOT_LEVELS[7], state, cancel);
  const level = PILOT_LEVELS[7], grid = E.parseLevel(level);
  // Walk the best route to just after its first press; the hint continues from that tile and gate state.
  const route = E.plan(grid, grid.start, 0, new Set(), grid.nets, true);
  let pos = grid.start, boats = grid.boats, gate = 0, moves = 0; const fish = [];
  for (const step of route.steps) {
    const r = E.turn(grid, pos, step.dir, new Set(step.nets), boats, gate); moves++;
    for (const [x, y] of r.path) grid.fish.forEach(([fx, fy], i) => { if (x === fx && y === fy && !fish.includes(i)) fish.push(i); });
    pos = r.end; boats = r.boats; gate = r.gate;
    if (r.pressed) break;
  }
  const mask = fish.reduce((m, i) => m | 1 << i, 0), rest = E.plan(grid, pos, mask, new Set(), grid.nets, true, boats, gate);
  const pressed = { pos, fish, nets: [], boats, moves, gate, history: [] };
  const done = await run(pressed);
  assert.equal(done.hint.dir, rest.seq[0]); assert.match(done.tip, new RegExp(`앞으로 ${rest.moves}번이면 나가요`));
  assert.equal(done.usage['pilot:p08'].count, 1);
  // Same tile with the other gate state is a different search state, and the hint follows it.
  const fresh = await run({ ...pressed, gate: 1 - gate });
  const expected = E.plan(grid, pos, mask, new Set(), grid.nets, true, boats, 1 - gate);
  assert.equal(fresh.hint?.dir, expected?.seq[0]); assert.equal(fresh.hint?.moves, expected?.moves);
  assert.notDeepEqual(expected && [expected.moves, expected.seq], [rest.moves, rest.seq]);
  const cancelled = await run(pressed, true);
  assert.equal(cancelled.usage['pilot:p08'], undefined);
});

/* ---------- device example uses the real engine ---------- */
test('the switch and gate example preserves real stop, press and pass-through with readable captions', () => {
  const demo = D.createDeviceDemo('gate'), moves = demo.phases.filter(p => p.kind === 'move'), gate = demo.phases.find(p => p.kind === 'gate');
  assert.ok(demo.steps.every(step => step.end - step.start >= 4 - 1e-8));
  assert.deepEqual(moves[0].to.pos, [3, 2], 'stops on the switch in front of the closed gate');
  assert.deepEqual([gate.from.gate, gate.to.gate], [0, 1]);
  assert.ok(gate.start >= moves[0].start + moves[0].duration, 'gates turn after the shark arrives');
  assert.ok(moves[1].path.some(([x, y]) => x === 4 && y === 2), 'the second swim passes the opened gate');
  const turn = E.turn(demo.grid, moves[0].from.pos, 'R', new Set(), [], 0);
  assert.deepEqual([turn.end, turn.pressed], [[3, 2], true]);
  assert.equal(D.sampleDeviceDemo(demo, gate.start + gate.duration / 2).gate, 1);
});

/* ---------- records, sheets and builds ---------- */
test('legacy pilot record helpers retain the archived schema before story migration', () => {
  const pilotSource = source.slice(source.indexOf('/* ---------- pilot course:'), source.indexOf('/* ---------- UI wiring'));
  const scene = new Function('stored', `
    ${read('levels.js')}
    ${read('pilot.js')}
    let written = null; const save = JSON.parse(stored), persist = () => { written = JSON.stringify(save); };
    const restoreSession = (record, level, id) => record && record.id === id ? record.state : null;
    const $ = () => ({}), REGION_ART = {};
    ${pilotSource}
    return {record: recordPilotClear, unlocked: pilotUnlocked, progress: pilotProgress, target: pilotTarget, save: () => save};
  `)(JSON.stringify({ best: { 0: 3, 47: 2 }, owned: ['basic', 'gold'], skin: 'gold', daily: { '2026-10-01': 3 }, sessions: { story: { id: 3 } },
    pilot: { version: 1, best: { p01: 2, p99: 3, p02: 7, p03: '3' } } }));
  assert.equal(scene.unlocked(0), true); assert.equal(scene.unlocked(1), true); assert.equal(scene.unlocked(2), false);
  assert.deepEqual(scene.save().pilot.best, { p01: 2 }, 'unknown ids and invalid stars are dropped');
  scene.record(1, 3); scene.record(1, 1); scene.record(0, 3); scene.record(5, 9);
  assert.deepEqual(scene.save().pilot.best, { p01: 3, p02: 3 });
  assert.deepEqual(scene.progress(), { stars: [3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], count: 2, total: 6 });
  assert.equal(scene.target(), 2);
  assert.deepEqual(scene.save().best, { 0: 3, 47: 2 }); assert.equal(scene.save().skin, 'gold');
  assert.deepEqual(scene.save().sessions, { story: { id: 3 } });
  assert.match(source, /PILOT \? 'pilot:' \+ PILOT\.level\.id : 'story:' \+ LVL/, 'separate hint allowance key');
});

test('course results: the North Harbor boundary previews the sluice works, the finale closes the course, next follows the course', () => {
  const rewardSource = source.slice(source.indexOf('/* ---------- reward presentation:'), source.indexOf('function onClear()'));
  const pilotSource = source.slice(source.indexOf('/* ---------- pilot course:'), source.indexOf('/* ---------- UI wiring'));
  const story = source.slice(source.indexOf('/* ---------- story journey:'), source.indexOf('/* ---------- shark skins:'));
  const best = n => Object.fromEntries(PILOT_LEVELS.slice(0, n).map(l => [l.id, 3]));
  const scene = stored => new Function('stored', `
    ${engineSource}
    ${read('levels.js')}
    ${read('pilot.js')}
    const save = JSON.parse(stored); let written = null;
    const STORE_KEY = 'test', localStorage = {setItem: (k, v) => { written = v; }};
    const elements = new Map(), noop = () => {};
    const $ = id => { if (!elements.has(id)) elements.set(id, {id, hidden: true, textContent: '', innerHTML: '', scrollTop: 0,
      classList: {toggle: noop, remove: noop, add: noop}, setAttribute: noop, focus: noop, querySelector: () => ({}), querySelectorAll: () => []}); return elements.get(id); };
    let DAILY = null, FREE = null, PILOT = null, LVL = 0, g, st, cleared = false, loaded = null, shown = null;
    const reduceMotion = true, sfx = {win: noop, star: noop, cancelReward: noop, token:()=>0, unlockReward:noop}, haptic = noop, setTimeout = cb => cb();
    const openSheet = id => { $(id).hidden = false; }, closeSheet = id => { $(id).hidden = true; };
    const document = {hidden: false}, renderSuspended = () => false, REGION_ART = {};
    const refreshSkins = () => [], earnedJournalRewards = () => [], nextSkinGoal = () => null, showClearMascot = noop, renderLevelGrid = noop, unlocked = () => true, totalStars = () => 0;
    const restoreSession = () => null, loadPilot = i => { loaded = i; }, show = which => { shown = which; $('gameScreen').hidden = which !== 'game'; };
    const curLevel = () => PILOT.level, dailySessionKey = () => 'daily';
    const loadLevel = noop, openDaily = noop, continueDaily = noop, openFree = noop, startFree = noop, currentSkin = () => ({});
    ${fn('chapterOf')}
    ${fn('netLevelBadge')}
    ${fn('persist')}
    ${rewardSource}
    ${fn('onClear')}
    ${story}
    ${pilotSource}
    $('gameScreen').hidden = false;
    return {
      clear: index => { PILOT = {index, level: PILOT_LEVELS[index]}; g = parseLevel(PILOT.level); st = {fish: g.fish.map((_, i) => i), moves: PILOT.level.par}; onClear(); },
      next: () => continueStory(), el: id => $(id), save: () => JSON.parse(written), loaded: () => loaded, shown: () => shown
    };
  `)(JSON.stringify(stored));
  const base = { best: { 0: 2 }, owned: ['basic'], skin: 'basic', journal: { version: 1, days: {} }, sessions: { story: { id: 0 }, pilot: { id: 'p04' } } };
  const boundary = scene({ ...base, pilot: { version: 1, best: best(3) } });
  boundary.clear(3);
  assert.equal(boundary.el('clearTitle').textContent, '북항 통과!');
  assert.equal(boundary.el('clearRegion').hidden, false);
  assert.match(boundary.el('clearRegion').innerHTML, /다음 지역[^]*수문 시설/);
  assert.equal(boundary.el('nextBtn').textContent, '수문 시설로');
  assert.match(boundary.el('clearChecks').innerHTML, /시험 코스[^]*4 \/ 12 수로 완료/);
  const saved = boundary.save();
  assert.equal(saved.pilot.best.p04, 3); assert.deepEqual(saved.best, { 0: 2 }, 'story stars untouched');
  assert.equal(saved.sessions.pilot, undefined); assert.deepEqual(saved.sessions.story, { id: 0 }, 'story session untouched');
  boundary.next(); assert.equal(boundary.loaded(), 4, 'next opens the first sluice canal');
  const finale = scene({ ...base, pilot: { version: 1, best: best(11) } });
  finale.clear(11);
  assert.equal(finale.el('clearTitle').textContent, '시험 코스 완료!');
  assert.equal(finale.el('clearRegion').hidden, true);
  assert.match(finale.el('clearStory').textContent, /시험 코스를 끝까지/);
  assert.equal(finale.el('nextBtn').textContent, '코스 목록');
  finale.next();
  assert.equal(finale.el('pilotOverlay').hidden, false, 'the course sheet opens after the last canal');
  assert.equal(finale.shown(), 'title');
  const regular = scene({ ...base, pilot: { version: 1, best: best(5) } });
  regular.clear(5);
  assert.equal(regular.el('clearRegion').hidden, true); assert.equal(regular.el('nextBtn').textContent, '다음 수로');
});

test('all builds embed exactly the needed sluice and region art; originals and previews stay out', () => {
  const { gameBody, ART } = require('./build-source');
  const body = gameBody();
  assert.ok(!body.includes('@@ART_'));
  for (const [token, file] of ART) {
    const bytes = fs.readFileSync(path.join(__dirname, '..', 'assets', file)), type = file.endsWith('.svg') ? 'image/svg+xml' : 'image/webp';
    const copies = body.split(`data:${type};base64,` + bytes.toString('base64')).length - 1;
    // New device/region art is referenced once (art.js); the hero shark is also the result mascot <img> as before.
    if (/^(GATE|SWITCH|REGION)_/.test(token)) assert.equal(copies, 1, file + ' embedded once'); else assert.ok(copies >= 1, file);
  }
  for (const name of ['gate-open', 'gate-closed', 'switch-on', 'switch-off']) {
    const svg = fs.readFileSync(path.join(__dirname, '../assets/art/content-refresh-v1', name + '.svg'), 'utf8');
    assert.ok(!/<script|href=|@import|url\(http/i.test(svg), name + ' has no external resources');
  }
  for (const original of ['north-harbor.png', 'sluice-works.png']) {
    const head = fs.readFileSync(path.join(__dirname, '../assets/art/content-refresh-v1', original)).subarray(0, 600).toString('base64').slice(0, 400);
    assert.ok(!body.includes(head), original + ' is not embedded');
  }
  assert.ok(!body.includes('preview.html') && !body.includes('PROMPTS'));
  for (const name of ['north-harbor', 'sluice-works']) {
    const bytes = fs.readFileSync(path.join(__dirname, '../assets/art/regions', name + '.webp'));
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP'); assert.ok(bytes.length < 90000, name + ' card stays small');
  }
});
