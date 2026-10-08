// Drifting crates 'c' (chapter 7, 2026-10-09): push rules in the shared engine, the placed-net search against an
// exhaustive oracle on crate boards, and compatibility of every canal without crates.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../src/engine.js');
const { rng } = require('../src/daily.js');
const { replayPlan, replaySteps } = require('./replay-plan.js');
const LEVELS = new Function(fs.readFileSync(path.join(__dirname, '../src/levels.js'), 'utf8') + '; return LEVELS;')();
const at = (g, x, y) => y * g.w + x;
const xy = (g, i) => `${i % g.w},${Math.floor(i / g.w)}`;
const level = (map, nets = 0) => E.parseLevel({ name: 'crate', map, nets });
// One swipe with the level's start boats; `crates`/`nets` are [x, y] lists, `mask` = fish eaten before this swipe.
function swipe(map, dir, { pos, nets = [], mask = 0, gate = 0, crates } = {}) {
  const g = level(map), set = new Set(nets.map(([x, y]) => at(g, x, y)));
  const start = crates ? crates.map(([x, y]) => at(g, x, y)) : g.crates;
  const r = E.turn(g, pos || g.start, dir, set, g.boats, gate, start, mask);
  return { g, r, end: r.end.join(), crates: r.crates.map(i => xy(g, i)) };
}

/* ---------- push rules ---------- */
test('a swipe that bumps a crate pushes it the same way until it is blocked', () => {
  const t = swipe(['#######', '#S..c.#', '#######'], 'R');
  assert.equal(t.end, '3,1'); assert.equal(t.r.stop, 'block'); assert.equal(t.r.dir, 'R');
  assert.deepEqual(t.crates, ['5,1']);
  assert.deepEqual(t.r.push, { crates: [at(t.g, 5, 1)], from: at(t.g, 4, 1), to: at(t.g, 5, 1), cells: [at(t.g, 5, 1)] });
  const far = swipe(['########', '#S.c...#', '########'], 'R');
  assert.deepEqual(far.crates, ['6,1']); assert.deepEqual(far.r.push.cells.map(i => xy(far.g, i)), ['4,1', '5,1', '6,1']);
});

test('touching a crate is a blocked swipe (no move, no push); a crate that cannot move just stops the shark', () => {
  const touch = swipe(['#######', '#.Sc..#', '#######'], 'R');
  assert.equal(touch.r.path.length, 0); assert.equal(touch.r.push, null); assert.deepEqual(touch.crates, ['3,1']);
  const stuck = swipe(['#######', '#S...c#', '#######'], 'R');
  assert.equal(stuck.end, '4,1'); assert.equal(stuck.r.push, null); assert.deepEqual(stuck.crates, ['5,1']);
});

test('sandbars: a crate stops on one and can be pushed off again; a shark stopping on one never pushes', () => {
  assert.deepEqual(swipe(['########', '#S.c.s.#', '########'], 'R').crates, ['5,1']);
  assert.deepEqual(swipe(['########', '#S...s.#', '########'], 'R', { crates: [[5, 1]] }).crates, ['6,1']);
  const sand = swipe(['#######', '#S.sc.#', '#######'], 'R');
  assert.equal(sand.end, '3,1'); assert.equal(sand.r.stop, 'sand'); assert.equal(sand.r.push, null); assert.deepEqual(sand.crates, ['4,1']);
});

test('a crate stops before the exit, jets, whirlpools, switches and gates (open or closed)', () => {
  const exit = swipe(['#######', '#S.c..E', '#######'], 'R');
  assert.deepEqual(exit.crates, ['5,1']); assert.equal(exit.r.win, false);
  assert.deepEqual(swipe(['########', '#S.c..>#', '########'], 'R').crates, ['5,1']);
  assert.deepEqual(swipe(['#########', '#S.c..w.#', '#w#######'], 'R').crates, ['5,1']);
  assert.deepEqual(swipe(['#########', '#S.c..p.#', '####G####', '#.......#', '#########'], 'R').crates, ['5,1']);
  const gate = ['########', '#S.c.G.#', '########', '#p.....#', '########'];
  assert.deepEqual(swipe(gate, 'R', { gate: 0 }).crates, ['4,1'], 'closed gate');
  assert.deepEqual(swipe(gate, 'R', { gate: 1 }).crates, ['4,1'], 'open gate');
});

test('the push follows the final heading after a jet or a whirlpool', () => {
  const jet = swipe(['#######', '#.....#', '#..c..#', '#.....#', '#S.^..#', '#######'], 'R');
  assert.equal(jet.end, '3,3'); assert.equal(jet.r.dir, 'U'); assert.deepEqual(jet.crates, ['3,1']);
  const warp = swipe(['##########', '#S.w#.wc.#', '##########'], 'R');
  assert.equal(warp.end, '6,1'); assert.deepEqual(warp.crates, ['8,1']);
});

test('stopping by the loop guard never pushes', () => {
  const t = swipe(['########', '#>S.vc.#', '#......#', '#^..<..#', '########'], 'R');
  assert.equal(t.r.stop, 'loop'); assert.equal(t.end, '4,1'); assert.equal(t.r.dir, 'R');
  assert.equal(t.r.push, null); assert.deepEqual(t.crates, ['5,1']);
});

test('a crate slides over fish eaten before or during this swipe, never over an uneaten fish', () => {
  const lane = ['########', '#S.c.f.#', '########'];
  assert.deepEqual(swipe(lane, 'R').crates, ['4,1']);
  assert.deepEqual(swipe(lane, 'R', { mask: 1 }).crates, ['6,1']);
  // Up the fish column, round two jets, then back along the fish row into the crate.
  const loop = swipe(['########', '#..>..v#', '#......#', '#..f.c<#', '#......#', '###S####'], 'U');
  assert.ok(loop.r.path.some(([x, y]) => x === 3 && y === 3), 'the fish is eaten on the way');
  assert.equal(loop.end, '6,3'); assert.equal(loop.r.dir, 'L'); assert.deepEqual(loop.crates, ['1,3']);
});

test('boats: a turn-start boat stops a crate, and boats then move with the pushed crates', () => {
  const stop = swipe(['#########', '#S.c...b#', '#########'], 'R');
  assert.deepEqual(stop.crates, ['6,1']);
  assert.deepEqual(stop.r.boats, [[at(stop.g, 7, 1), 'L']], 'walled in by the crate, the boat stays and turns');
  const freed = swipe(['#######', '#..B..#', '#S.c..#', '#.....#', '#######'], 'R');
  assert.deepEqual(freed.crates, ['5,2']);
  assert.deepEqual(freed.r.boats, [[at(freed.g, 3, 2), 'D']], 'the boat enters the tile the crate left');
  assert.deepEqual(E.stepBoats(freed.g, freed.g.boats, at(freed.g, 2, 2), null, 0, freed.g.crates), [[at(freed.g, 3, 1), 'U']],
    'with the turn-start crates it would have turned back');
});

test('an escape never pushes and a crate never leaves by the exit', () => {
  const t = swipe(['#E#####', '#.c...#', '#.....#', '#S#####'], 'U');
  assert.equal(t.r.win, true); assert.equal(t.r.push, null); assert.deepEqual(t.crates, ['2,1']);
});

test('a net brakes a sliding crate, and no net is ever set on a crate', () => {
  assert.deepEqual(swipe(['########', '#S.c...#', '########'], 'R', { nets: [[6, 1]] }).crates, ['5,1']);
  const g = level(['########', '#S.c...#', '#......E', '########'], 1), crate = at(g, 3, 1);
  assert.equal(replaySteps(g, [{ dir: 'D', nets: [] }, { dir: 'R', nets: [] }], { needAll: false }).pushes, 0);
  assert.throws(() => replaySteps(g, [{ dir: 'D', nets: [crate] }, { dir: 'R', nets: [crate] }], { needAll: false }), /crate/);
});

test('one crate at a time: no chain pushes; two crates stop each other and stay sorted', () => {
  const chain = swipe(['#########', '#S.cc...#', '#########'], 'R');
  assert.equal(chain.end, '2,1'); assert.equal(chain.r.push, null); assert.deepEqual(chain.crates, ['3,1', '4,1']);
  assert.deepEqual(swipe(['#########', '#S.c...c#', '#########'], 'R').crates, ['6,1', '7,1']);
  const two = swipe(['#######', '#.S...#', '#.....#', '#.c.c.#', '#.....#', '#.....#', '#######'], 'D');
  assert.deepEqual(two.g.crates, [at(two.g, 2, 3), at(two.g, 4, 3)]);
  assert.deepEqual(two.r.crates, [at(two.g, 4, 3), at(two.g, 2, 5)]);
});

test('parseLevel keeps crate tiles as water and rejects more than two crates', () => {
  const g = level(['#######', '#Scc..E', '#######']);
  assert.deepEqual(g.crates, [at(g, 2, 1), at(g, 3, 1)]);
  assert.equal(g.cells[at(g, 2, 1)], '.');
  assert.throws(() => level(['#######', '#Sccc.E', '#######']), /at most 2 crates/);
  assert.throws(() => E.plan(g, g.start, 0, new Set(), 0, true, undefined, undefined, true), /crates/, 'the v1-v3 net pickup search has no crates');
});

/* ---------- placed-net search vs exhaustive oracle ---------- */
// Exhaustive: before EVERY swipe try every legal new net and every pair (no path/boat/crate pruning), moving with E.turn.
// Depth-bounded so unsolvable boards stay quick; plans longer than the bound must then show up as "no route" here too.
const ORACLE_DEPTH = 14;
function oracle(g, needAll) {
  const fishIdx = new Map(g.fish.map((f, i) => [f[1] * g.w + f[0], i])), full = (1 << g.fish.length) - 1;
  const keyOf = s => s.pos + '|' + s.mask + '|' + E.boatsKey(s.boats) + '|' + s.placed.join(',') + '|' + s.crates.join(',');
  let q = [{ pos: g.start, mask: 0, boats: g.boats, gate: 0, crates: g.crates, placed: [] }];
  const seen = new Set([keyOf(q[0])]);
  for (let depth = 1; depth <= ORACLE_DEPTH && q.length; depth++) {
    const nq = [];
    for (const s of q) {
      const here = s.pos[1] * g.w + s.pos[0], spots = [];
      for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === '.' && i !== here && !s.boats.some(b => b[0] === i) && !s.placed.includes(i)
        && !s.crates.includes(i) && (!fishIdx.has(i) || (s.mask & (1 << fishIdx.get(i))))) spots.push(i);
      const left = g.nets - s.placed.length, adds = [[]];
      if (left >= 1) for (const a of spots) adds.push([a]);
      if (left >= 2) for (let a = 0; a < spots.length; a++) for (let b = a + 1; b < spots.length; b++) adds.push([spots[a], spots[b]]);
      for (const add of adds) {
        const placed = [...s.placed, ...add].sort((a, b) => a - b), set = new Set(placed);
        for (const d of 'UDLR') {
          const r = E.turn(g, s.pos, d, set, s.boats, s.gate, s.crates, s.mask);
          if (!r.path.length) continue;
          let m = s.mask;
          for (const [x, y] of r.path) { const fi = fishIdx.get(y * g.w + x); if (fi != null) m |= 1 << fi; }
          if (r.win) { if (!needAll || m === full) return depth; continue; }
          const t = { pos: r.end, mask: m, boats: r.boats, gate: r.gate, crates: r.crates, placed }, key = keyOf(t);
          if (!seen.has(key)) { seen.add(key); nq.push(t); }
        }
      }
    }
    q = nq;
  }
  return null;
}
const compare = (g, needAll) => {
  const p = E.plan(g, g.start, 0, new Set(), g.nets, needAll), expected = oracle(g, needAll);
  assert.equal(p && p.moves <= ORACLE_DEPTH ? p.moves : null, expected, `${needAll ? 'all fish' : 'escape'} nets ${g.nets} ${g.cells.join('')}`);
  return p ? replayPlan(g, p, { needAll }) : null;
};
// Boards where only a net on the crate's slide (not on the shark's own path) gives the minimum (found by disabling that case).
const BRAKE_BOARDS = [
  { map: ['###E###', '#...ob#', '#...s.#', '#..c..#', '#..f..#', '###S###'], nets: 1, all: 5, escape: 5 },
  { map: ['#######', '#.fc..E', '#..f..#', '#.#...#', '#.....#', '##S####'], nets: 1, all: 8 },
  { map: ['###E###', '#...c.#', '#.f...#', '#..c..#', '#.....#', '###S###'], nets: 1, escape: 5 },
  { map: ['###E###', '#f....#', '#c....#', '#..c..#', '#.....#', '###S###'], nets: 2, all: 6 },
];

test('a net can brake a pushed crate: the search tries the tiles the crate would slide over', () => {
  for (const b of BRAKE_BOARDS) {
    const g = level(b.map, b.nets);
    if (b.all) { assert.equal(oracle(g, true), b.all); assert.equal(E.plan(g, g.start, 0, new Set(), b.nets, true).moves, b.all); compare(g, true); }
    if (b.escape) { assert.equal(oracle(g, false), b.escape); assert.equal(E.plan(g, g.start, 0, new Set(), b.nets, false).moves, b.escape); compare(g, false); }
  }
});

test('the search lets a crate slide over a fish eaten earlier in the same swipe, as turn() does', () => {
  const g = level(['########', 'E.f>..v#', '#......#', '#..f.c<#', '#...c..#', '###S####']);
  assert.equal(oracle(g, true), 4);
  const done = compare(g, true);
  assert.equal(done.pushes, 1); assert.deepEqual(done.crates, [at(g, 1, 3), at(g, 4, 4)]);
});

test('placed-net search equals the exhaustive oracle on 150 random crate boards (0-2 nets, 0-1 boat)', () => {
  const MASKS = [
    ['###E###', '#.....#', '#.....#', '#.....#', '#.....#', '###S###'],
    ['#####E#', '#.....#', '#..#..#', '#.....#', '#.....#', '#S#####'],
    ['#######', '#.....E', '#.....#', '#.#...#', '#.....#', '##S####'],
    ['##E###', '#....#', '#....#', '#....#', '#....#', '####S#'],
    ['#E#####', '#.....#', '#.##..#', '#.....#', '###S###'],
  ];
  const rand = rng(2026), pick = n => Math.floor(rand() * n);
  const seen = { boards: 0, nets: [0, 0, 0], boats: 0, twoCrates: 0, solved: 0, pushed: 0 };
  while (seen.boards < 150) {
    const rows = MASKS[pick(MASKS.length)].map(r => [...r]), free = [];
    rows.forEach((r, y) => r.forEach((c, x) => { if (c === '.') free.push([x, y]); }));
    const put = (ch, k) => { for (let i = 0; i < k && free.length; i++) { const [x, y] = free.splice(pick(free.length), 1)[0]; rows[y][x] = ch; } };
    put('c', 1 + pick(2)); put('o', pick(3)); put('f', 1 + pick(2));
    if (rand() < 0.5) put(rand() < 0.5 ? 'b' : 'B', 1);
    if (rand() < 0.3) put('s', 1);
    if (rand() < 0.2) put('<>^v'[pick(4)], 1);
    const nets = seen.boards % 3, g = level(rows.map(r => r.join('')), nets);
    seen.boards++; seen.nets[nets]++; if (g.boats.length) seen.boats++; if (g.crates.length === 2) seen.twoCrates++;
    for (const needAll of [true, false]) {
      const done = compare(g, needAll);
      if (done) { seen.solved++; if (done.pushes) seen.pushed++; }
    }
  }
  assert.deepEqual(seen.nets, [50, 50, 50]);
  assert.ok(seen.boats >= 40 && seen.twoCrates >= 40, JSON.stringify(seen));
  assert.ok(seen.solved >= 100 && seen.pushed >= 20, 'enough solved boards whose best route pushes ' + JSON.stringify(seen));
});

/* ---------- canals without crates ---------- */
test('canals without crates keep empty crate keys and identical plans and BFS results', () => {
  // every canal before chapter 7 (and its rest canal) has no crate; those must behave exactly as before crates existed
  const plain = LEVELS.filter(lvl => !lvl.map.some(row => row.includes('c')));
  assert.ok(plain.length >= 73, 'the 72 earlier canals and the chapter-7 rest canal');
  for (const lvl of plain) {
    const g = E.parseLevel(lvl);
    assert.deepEqual(g.crates, [], lvl.name);
    assert.equal(E.crateKey(g, []), '');
    for (const needAll of [true, false]) {
      assert.deepEqual(E.plan(g, g.start, 0, new Set(), g.nets, needAll, undefined, undefined, false, []),
        E.plan(g, g.start, 0, new Set(), g.nets, needAll), lvl.name);
      assert.deepEqual(E.bfsFrom(g, g.start, 0, new Set(), needAll, 60, undefined, undefined, []),
        E.bfsFrom(g, g.start, 0, new Set(), needAll, 60), lvl.name);
    }
    const r = E.turn(g, g.start, 'U', new Set(), g.boats, 0);
    assert.deepEqual(r.crates, []); assert.equal(r.push, null);
  }
  const g = level(['#######', '#Scc..E', '#######']);
  assert.equal(E.crateKey(g, g.crates), '|c' + g.crates.join(','));
});
