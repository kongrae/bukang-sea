const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const E = require('../src/engine.js');
const { makeDaily, rng, place } = require('../src/daily.js');
const { replayPlan } = require('./replay-plan.js');
const LEVELS = new Function(fs.readFileSync(path.join(__dirname, '../src/levels.js'), 'utf8') + '; return LEVELS;')();
// Keep the original bug repros independent of later level balancing (net pickup rule, kept for daily/free v1–v3).
const NET_REGRESSIONS = [
  { number: 11, moves: 6, map: ['#E#####','#.f...#','#..f..#','#.....#','#..o<.#','#.....#','#^....#','#.....#','#o....#','####S##'] },
  { number: 34, moves: 6, map: ['#######E#','#vf...o.#','#.......#','#f##....#','#.##....#','#..^....#','#....##.#','#..o.##.#','#....f..#','#S#######'] },
  { number: 47, moves: 8, map: ['####E####','#.......#','#...o.f.#','#.#####.#','#.#w..#.#','#.#.s.#w#','#.#####.#','#.f.....#','#.......#','####S####'] },
  { number: 48, moves: 8, map: ['#####E###','#...#...#','#.f.#..o#','#...#.w.#','#.s.#...#','#..^#...#','#f.f#v..#','#.w.#.s.#','#S#######'] },
];

// Exhaustive oracle: enumerate ALL legal placements before EVERY swipe, without the production
// solver's path/boat pruning. Small boards keep this practical. Both solvers use the canonical movement rules.
function exhaustive(g, { pos = g.start, mask = 0, boats = g.boats, capacity = g.nets, needAll = true } = {}) {
  const key = s => s.pos + '|' + s.mask + '|' + E.boatsKey(s.boats);
  let q = [{ pos, mask, boats }], depth = 0;
  const seen = new Set(q.map(key)), full = (1 << g.fish.length) - 1;
  while (q.length) {
    depth++; const nq = [];
    for (const s of q) {
      const spots = [], configs = [[]];
      g.cells.forEach((c, i) => {
        if (c === '.' && i !== s.pos[1] * g.w + s.pos[0] && !s.boats.some(b => b[0] === i)
          && !g.fish.some(([x, y], fi) => y * g.w + x === i && !(s.mask & (1 << fi)))) spots.push(i);
      });
      if (capacity) spots.forEach(i => configs.push([i]));
      if (capacity >= 2) for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) configs.push([spots[i], spots[j]]);
      for (const cfg of configs) for (const d of 'UDLR') {
        const nets = new Set(cfg), r = E.slide(g, s.pos, d, nets, s.boats);
        if (!r.path.length) continue;
        let m = s.mask;
        for (const [x, y] of r.path) g.fish.forEach(([fx, fy], fi) => { if (x === fx && y === fy) m |= 1 << fi; });
        if (r.win) { if (!needAll || m === full) return depth; continue; }
        const n = { pos: r.end, mask: m, boats: E.stepBoats(g, s.boats, r.end[1] * g.w + r.end[0], nets) };
        const k = key(n); if (!seen.has(k)) { seen.add(k); nq.push(n); }
      }
    }
    q = nq;
  }
  return null;
}

test('all story plans replay legally; balanced star targets remain achievable', () => {
  for (const l of LEVELS) {
    const g = E.parseLevel(l), before = JSON.stringify(g);
    for (const needAll of [true, false]) {
      const p = E.plan(g, g.start, 0, new Set(), g.nets, needAll);
      replayPlan(g, p, { needAll });
      assert.ok(p.moves <= l.par, l.name);
    }
    assert.equal(JSON.stringify(g), before, 'search mutates level');
  }
});

test('regression: original 11/34/47/48 use the actual reusable-net minimum under the pickup rule', () => {
  for (const { number, moves, map } of NET_REGRESSIONS) {
    const g = E.parseLevel({ name: 'original ' + number, nets: 1, map }), p = E.plan(g, g.start, 0, new Set(), g.nets, true, undefined, undefined, true);
    assert.equal(p.moves, moves, 'level ' + number);
    replayPlan(g, p, { pickup: true });
  }
});

test('representative canals retain fish detours and the revised finale routes', () => {
  // 2026-10-08 net rule: 12, 34 and 48 were redesigned; 36 and 47 were re-rated with set nets that stay.
  for (const [n, minimum, escapeMoves] of [[6,7,5],[12,9,4],[24,10,7],[34,9,6],[36,11,7],[47,12,7],[48,12,9]]) {
    const g = E.parseLevel(LEVELS[n - 1]);
    assert.equal(E.plan(g, g.start, 0, new Set(), g.nets, true).moves, minimum, 'full route ' + n);
    assert.equal(E.plan(g, g.start, 0, new Set(), g.nets, false).moves, escapeMoves, 'escape route ' + n);
  }
  assert.ok(E.parseLevel(LEVELS[46]).fish.some(([x,y]) => x >= 3 && x <= 5 && y >= 4 && y <= 5), 'fish inside the moat');
  const final = E.parseLevel(LEVELS[47]), route = E.plan(final, final.start, 0, new Set(), final.nets, true);
  assert.equal(final.fish.length, 4);
  assert.ok(final.fish.every(([x]) => x < 4) && LEVELS[47].map[0].indexOf('E') > 4, 'fish on the left, the sea beyond the whirlpool on the right');
  assert.ok(route.steps.some(s => s.nets.length), 'the finale needs its one net');
});

test('fish completion gates the move star at and above the target', () => {
  assert.equal(E.starsForClear(false, true), 1, 'quick fish-skipping escape');
  assert.equal(E.starsForClear(false, false), 1);
  assert.equal(E.starsForClear(true, false), 2, 'all fish above target');
  assert.equal(E.starsForClear(true, true), 3, 'all fish at target');
});

test('a wrong set net stays: level 10 then has no route and the hint points to undo', () => {
  const g = E.parseLevel(LEVELS[9]), nets = new Set([g.w + 4]);
  assert.equal(E.plan(g, g.start, 0, nets, 0, true), null);
  assert.equal(E.plan(g, g.start, 0, nets, 0, false), null);
  assert.equal(E.plan(g, g.start, 0, new Set(), g.nets, true).moves, 5);
});

test('level 10 recovers from a wrong placed net with no unused inventory under the pickup rule', () => {
  const g = E.parseLevel(LEVELS[9]), nets = new Set([g.w + 4]);
  assert.equal(E.fixedNetPlan(g, g.start, 0, nets, 0, false), null);
  const p = E.plan(g, g.start, 0, nets, 0, true, undefined, undefined, true);
  assert.equal(p.moves, 5);
  assert.ok(p.steps.some(s => !s.nets.includes(g.w + 4)), 'wrong net is eventually recovered');
  replayPlan(g, p, { nets, pickup: true });
  assert.deepEqual([...nets], [g.w + 4], 'search mutates caller nets');
  const blocking = new Set([7 * g.w + 2]), recovery = E.plan(g, g.start, 0, blocking, 0, true, undefined, undefined, true);
  assert.deepEqual(recovery.remove, [...blocking], 'net blocking the first swipe must be recovered first');
  replayPlan(g, recovery, { nets: blocking, pickup: true });
});

test('a harmless existing net can stay in place when the remaining route needs no edits', () => {
  const g = E.parseLevel(LEVELS[9]), pos = [1, 2], nets = new Set([3 * g.w + 1]);
  const p = E.plan(g, pos, 1, nets, 0, true);
  assert.equal(p.moves, 2);
  assert.deepEqual(p.remove, []);
  assert.deepEqual(p.add, []);
  replayPlan(g, p, { pos, mask: 1, nets });
});

test('an already collected fish tile is available for a required optimal net placement', () => {
  const g = E.parseLevel({ name: 'collected fish', nets: 1,
    map: ['##E###', '#..f.#', '#<o.o#', '#...f#', '#S####'] });
  const p = E.plan(g, g.start, 3, new Set(), 1, true);
  assert.equal(p.moves, 4); // excluding all original fish tiles incorrectly takes 5 swipes
  assert.ok(p.steps.some(s => s.nets.includes(9)), 'uses the consumed fish at (3,1)');
  replayPlan(g, p, { mask: 3 });
});

test('replan from every state of a two-net / two-boat route', () => {
  const g = E.parseLevel(LEVELS[11]);
  let pos = g.start, mask = 0, boats = g.boats, nets = new Set();
  const original = E.plan(g, pos, mask, nets, g.nets, true);
  assert.equal(original.moves, 9);
  for (let i = 0; i < original.steps.length; i++) {
    const p = E.plan(g, pos, mask, nets, g.nets - nets.size, true, boats);
    assert.equal(p.moves, original.moves - i);
    replayPlan(g, p, { pos, mask, boats, nets });
    const step = original.steps[i]; nets = new Set(step.nets);
    const r = E.slide(g, pos, step.dir, nets, boats);
    for (const [x, y] of r.path) g.fish.forEach(([fx, fy], fi) => { if (x === fx && y === fy) mask |= 1 << fi; });
    pos = r.end;
    if (!r.win) boats = E.stepBoats(g, boats, pos[1] * g.w + pos[0], nets);
  }
});

// Exhaustive oracle for the placed-net rule: set nets stay and are part of the state; any remaining net may be set before any swipe.
function exhaustivePlaced(g, { mask = 0, needAll = true } = {}) {
  const key = s => s.pos + '|' + s.mask + '|' + E.boatsKey(s.boats) + '|' + s.nets.join(',');
  let q = [{ pos: g.start, mask, boats: g.boats, nets: [] }], depth = 0;
  const seen = new Set(q.map(key)), full = (1 << g.fish.length) - 1;
  while (q.length) {
    depth++; const nq = [];
    for (const s of q) {
      const configs = [s.nets];
      const free = i => g.cells[i] === '.' && i !== s.pos[1] * g.w + s.pos[0] && !s.nets.includes(i) && !s.boats.some(b => b[0] === i)
        && !g.fish.some(([x, y], fi) => y * g.w + x === i && !(s.mask & (1 << fi)));
      const spots = g.cells.map((_, i) => i).filter(free);
      if (s.nets.length < g.nets) spots.forEach(i => configs.push([...s.nets, i].sort((a, b) => a - b)));
      if (g.nets - s.nets.length >= 2) for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) configs.push([spots[i], spots[j]]);
      for (const cfg of configs) for (const d of 'UDLR') {
        const nets = new Set(cfg), r = E.slide(g, s.pos, d, nets, s.boats);
        if (!r.path.length) continue;
        let m = s.mask;
        for (const [x, y] of r.path) g.fish.forEach(([fx, fy], fi) => { if (x === fx && y === fy) m |= 1 << fi; });
        if (r.win) { if (!needAll || m === full) return depth; continue; }
        const n = { pos: r.end, mask: m, boats: E.stepBoats(g, s.boats, r.end[1] * g.w + r.end[0], nets), nets: cfg };
        const k = key(n); if (!seen.has(k)) { seen.add(k); nq.push(n); }
      }
    }
    q = nq;
  }
  return null;
}

test('pruned search matches exhaustive placements for both net rules, including consumed fish and moving boats', () => {
  const rand = rng(90210), mask = ['##E###', '#....#', '#....#', '#....#', '#S####'];
  for (let i = 0; i < 48; i++) {
    const map = place(mask, { buoys: i % 2, boats: +(i % 4 === 0), vboats: +(i % 7 === 0), fish: 2,
      jets: i % 3 === 0 ? 1 : 0, sand: +(i % 4 === 1), whirls: +(i % 5 === 0) }, rand);
    const g = E.parseLevel({ name: 'oracle ' + i, map, nets: i % 3 });
    for (const eaten of [0, 1, 3]) for (const needAll of [true, false]) {
      const p = E.plan(g, g.start, eaten, new Set(), g.nets, needAll, undefined, undefined, true);
      assert.equal(p ? p.moves : null, exhaustive(g, { mask: eaten, needAll }), JSON.stringify({ map, eaten, needAll, nets: g.nets }));
      if (p) replayPlan(g, p, { mask: eaten, needAll, pickup: true });
      const placed = E.plan(g, g.start, eaten, new Set(), g.nets, needAll);
      assert.equal(placed ? placed.moves : null, exhaustivePlaced(g, { mask: eaten, needAll }), 'placed ' + JSON.stringify({ map, eaten, needAll, nets: g.nets }));
      if (placed) replayPlan(g, placed, { mask: eaten, needAll });
    }
  }
});

test('chunked browser search yields and returns the same plan as synchronous tools', () => {
  const g = E.parseLevel(LEVELS[11]), search = E.planSearch(g, g.start, 0, new Set(), g.nets, true);
  let result, batches = 0;
  do { result = search.next(); batches++; } while (!result.done);
  assert.ok(batches > 1);
  assert.deepEqual(result.value, E.plan(g, g.start, 0, new Set(), g.nets, true));
});

test('daily-v2 retains the same maps, dates and star targets for 90 days', () => {
  const hash = crypto.createHash('sha256');
  for (let i = 0; i < 90; i++) {
    const date = new Date(Date.UTC(2026, 8, 30 + i)).toISOString().slice(0, 10);
    hash.update(JSON.stringify(makeDaily(date)));
  }
  assert.equal(hash.digest('hex'), '4099ffef3a3faedebf00d9609f67a090dfa248cfb926aba26b10d5f3e14f79f7');
});
