/* ---------- Engine: sliding rules + solver (shared with node tests) ---------- */
const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
const JET = { '^': 'U', 'v': 'D', '<': 'L', '>': 'R' };
const OPP = { U: 'D', D: 'U', L: 'R', R: 'L' };

function parseLevel(level) {
  const rows = level.map, h = rows.length, w = rows[0].length;
  let start = null; const fish = [], cells = [], boats = [], gates = [], switches = [], gateOpen = new Set();
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error('ragged row ' + y + ' in ' + level.name);
    for (let x = 0; x < w; x++) {
      let c = rows[y][x];
      if (c === 'S') { start = [x, y]; c = '.'; }
      if (c === 'f') { fish.push([x, y]); c = '.'; }
      // patrol boats: b = back and forth along the row (starts right), B = along the column (starts down)
      if (c === 'b' || c === 'B') { boats.push([y * w + x, c === 'b' ? 'R' : 'D']); c = '.'; }
      // sluice gates: G starts closed, g starts open; both are stored as 'G', the start state in gateOpen. p = switch
      if (c === 'g' || c === 'G') { gates.push(y * w + x); if (c === 'g') gateOpen.add(y * w + x); c = 'G'; }
      if (c === 'p') switches.push(y * w + x);
      cells.push(c);
    }
  }
  // whirlpools come in one pair: entering either one comes out of the other
  const whirls = []; cells.forEach((c, i) => { if (c === 'w') whirls.push(i); });
  if (whirls.length && whirls.length !== 2) throw new Error('whirlpools must come in a pair in ' + level.name);
  const warp = new Map(whirls.length === 2 ? [[whirls[0], whirls[1]], [whirls[1], whirls[0]]] : []);
  const g = { w, h, cells, start, fish, warp, boats, nets: level.nets || 0, par: level.par, gates, gateOpen, switches };
  if (gates.length || switches.length) checkGates(g, level.name);
  return g;
}
function cellAt(g, x, y) {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return '#';
  return g.cells[y * g.w + x];
}
// A gate sits in a one-tile channel: promenade on two opposite sides, water on the other two.
// 'V' = the channel runs up/down (walls left and right), 'H' = left/right. null = not a valid gate spot.
function gatePassage(g, i) {
  const x = i % g.w, y = Math.floor(i / g.w), wall = (dx, dy) => cellAt(g, x + dx, y + dy) === '#';
  if (x === 0 || y === 0 || x === g.w - 1 || y === g.h - 1) return null;
  if (wall(-1, 0) && wall(1, 0) && !wall(0, -1) && !wall(0, 1)) return 'V';
  if (wall(0, -1) && wall(0, 1) && !wall(-1, 0) && !wall(1, 0)) return 'H';
  return null;
}
// All switches of a canal drive all of its gates (one link group). Bad layouts must not play silently.
function checkGates(g, name) {
  if (!g.gates.length || !g.switches.length) throw new Error('switches and gates must come together in ' + name);
  for (const i of g.gates) if (!gatePassage(g, i)) throw new Error(`gate at ${i % g.w},${Math.floor(i / g.w)} must sit in a one-tile channel in ${name}`);
}
// `gate` = press parity of the link group (0 at the start, flipped by every press). Each gate toggles from its start state.
function gateIsOpen(g, i, gate) { return g.gateOpen.has(i) !== (gate === 1); }
// boats: array of [cellIndex, dir] (the boats' current state); only their cells matter for blocking
function isBlocked(g, x, y, nets, boats, gate) {
  const c = cellAt(g, x, y);
  if (c === '#' || c === 'o') return true;
  const i = y * g.w + x;
  if (c === 'G' && !gateIsOpen(g, i, gate)) return true;
  if (nets && nets.has(i)) return true;
  if (boats) for (const b of boats) if (b[0] === i) return true;
  return false;
}
// Slide until blocked. path excludes the start tile; each step is [x, y, dir] (a 4th element `true` marks
// the tile reached by a whirlpool jump rather than by swimming). Stops on a sandbar 's'. Jets and whirlpools
// passed twice in one move stop the slide (loop guard); the tile the move starts on never triggers anything.
// Boats stand still while the shark slides; they move afterwards (stepBoats). Gates keep their turn-start state.
function slide(g, pos, dir, nets, boats, gate) {
  let [x, y] = pos, d = dir;
  const path = [], seen = new Set();
  for (let guard = 0; guard < 500; guard++) {
    const [dx, dy] = DIRS[d];
    if (isBlocked(g, x + dx, y + dy, nets, boats, gate)) break;
    x += dx; y += dy; path.push([x, y, d]);
    const c = cellAt(g, x, y);
    if (c === 'E') return { path, end: [x, y], win: true };
    if (c === 's') break;
    if (JET[c] || c === 'w') {
      const key = x + ',' + y;
      if (seen.has(key)) break;
      seen.add(key);
      if (JET[c]) d = JET[c];
      else {
        const to = g.warp.get(y * g.w + x);
        x = to % g.w; y = Math.floor(to / g.w); seen.add(x + ',' + y);
        path.push([x, y, d, true]);
      }
    }
  }
  return { path, end: [x, y], win: false };
}
// After every shark move each boat, in order, steps one tile along its heading. A boat turns around when the
// tile ahead is a wall, buoy, the sea exit, a closed gate, a net, the shark or another boat, and stays put if both
// ways are blocked. A boat already inside a gate that was just closed may leave; the shutter waits until it does.
function stepBoats(g, boats, sharkIdx, nets, gate) {
  if (!boats.length) return boats;
  const next = boats.map(b => b.slice());
  const free = (i, self) => {
    const x = i % g.w, y = Math.floor(i / g.w), c = cellAt(g, x, y);
    if (c === '#' || c === 'o' || c === 'E' || (c === 'G' && !gateIsOpen(g, i, gate)) || i === sharkIdx || (nets && nets.has(i))) return false;
    return !next.some((b, k) => k !== self && b[0] === i);
  };
  next.forEach((b, k) => {
    const x = b[0] % g.w, y = Math.floor(b[0] / g.w);
    for (const d of [b[1], OPP[b[1]]]) {
      const [dx, dy] = DIRS[d], nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
      if (free(ny * g.w + nx, k)) { b[0] = ny * g.w + nx; b[1] = d; return; }
    }
    b[1] = OPP[b[1]];
  });
  return next;
}
const boatsKey = boats => boats.map(b => b[0] + b[1]).join(',');
// The shark presses a switch only by ENDING a move on it: passing over, leaving, or a blocked swipe never press.
function pressSwitch(g, pos, gate) {
  return g.switches && g.switches.includes(pos[1] * g.w + pos[0]) ? (gate === 1 ? 0 : 1) : gate;
}
// One whole swipe in the live order: slide with the turn-start gates, press a switch at the stop, then boats move
// with the new gates. An escape ends the turn at once. Returns slide()'s fields plus { pressed, gate, boats }.
function turn(g, pos, dir, nets, boats, gate) {
  const r = slide(g, pos, dir, nets, boats, gate);
  if (!r.path.length || r.win) return { ...r, pressed: false, gate, boats };
  const next = pressSwitch(g, r.end, gate);
  return { ...r, pressed: next !== gate, gate: next, boats: stepBoats(g, boats, r.end[1] * g.w + r.end[0], nets, next) };
}
// Search state suffix: canals without switches keep the exact pre-gate keys (and therefore search order).
const gateKey = (g, gate) => g.switches && g.switches.length ? '|' + (gate === 1 ? 1 : 0) : '';
// BFS over (position, fish mask, boats, gates). Returns {moves, seq} or null. boats defaults to the level's start.
function bfsFrom(g, pos, mask, nets, needAll, cap, boats, gate) {
  boats = boats || g.boats;
  const fishIdx = new Map(g.fish.map((f, i) => [f[1] * g.w + f[0], i]));
  const full = (1 << g.fish.length) - 1;
  const seen = new Set([pos + '|' + mask + '|' + boatsKey(boats) + gateKey(g, gate)]);
  let q = [{ pos, mask, boats, gate, seq: '' }], depth = 0;
  while (q.length) {
    depth++;
    if (depth > cap) return null;
    const nq = [];
    for (const s of q) for (const d of 'UDLR') {
      const r = slide(g, s.pos, d, nets, s.boats, s.gate);
      if (!r.path.length) continue;
      let m = s.mask;
      for (const [x, y] of r.path) { const k = y * g.w + x; if (fishIdx.has(k)) m |= 1 << fishIdx.get(k); }
      if (r.win) { if (!needAll || m === full) return { moves: depth, seq: s.seq + d }; continue; }
      const ng = pressSwitch(g, r.end, s.gate), nb = stepBoats(g, s.boats, r.end[1] * g.w + r.end[0], nets, ng);
      const key = r.end + '|' + m + '|' + boatsKey(nb) + gateKey(g, ng);
      if (seen.has(key)) continue;
      seen.add(key); nq.push({ pos: r.end, mask: m, boats: nb, gate: ng, seq: s.seq + d });
    }
    q = nq;
  }
  return null;
}
// Fixed-placement search retained ONLY for the daily-v2 generator: changing its candidate scoring
// would change already published date-seeded puzzles. Gameplay/hints use plan() below.
function fixedNetPlan(g, pos, mask, nets, netsLeft, needAll, boats) {
  boats = boats || g.boats;
  const fishTiles = new Set(g.fish.map(f => f[1] * g.w + f[0])), boatTiles = new Set(boats.map(b => b[0]));
  const here = pos[1] * g.w + pos[0];
  const spots = [];
  for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === '.' && i !== here && !fishTiles.has(i) && !boatTiles.has(i) && !nets.has(i)) spots.push(i);
  const options = [[]];
  if (netsLeft >= 1) for (const a of spots) options.push([a]);
  if (netsLeft >= 2) for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) options.push([spots[i], spots[j]]);
  let best = null;
  for (const add of options) {
    const n2 = new Set(nets); add.forEach(a => n2.add(a));
    const r = bfsFrom(g, pos, mask, n2, needAll, best ? best.moves - 1 : 60, boats);
    if (r && (!best || r.moves < best.moves)) best = { ...r, add };
  }
  return best;
}

// Minimum SWIPES under the live rules (2026-10-08): a net, once set, stays until undo/restart; more of the
// remaining nets can be set for free before any swipe. The placed nets are part of the search node.
// A new net is only tried on this swipe's free path or next to a boat: any other net can wait until the
// swipe it affects, since setting it later keeps every option open (a tile placeable then is placeable now).
// Returns the same shape as the relocating search; `remove` is always empty.
function* placedPlanSearch(g, pos, mask, nets, netsLeft, needAll, boats, gate) {
  boats = boats || g.boats;
  const capacity = nets.size + netsLeft;
  if (capacity > 2) throw new Error('plan supports at most 2 nets');
  const fishIdx = new Map(g.fish.map((f, i) => [f[1] * g.w + f[0], i]));
  const full = (1 << g.fish.length) - 1, start = [...nets].sort((a, b) => a - b);
  const keyOf = (pos, mask, boats, gate, placed) => pos + '|' + mask + '|' + boatsKey(boats) + gateKey(g, gate) + '|' + placed.join(',');
  const root = { pos, mask, boats, gate, placed: start, parent: null }, seen = new Set([keyOf(pos, mask, boats, gate, start)]);
  const result = (parent, dir, placed) => {
    const steps = [{ dir, nets: [...placed] }];
    for (let s = parent; s.parent; s = s.parent) steps.push(s.step);
    steps.reverse();
    return { moves: steps.length, seq: steps.map(s => s.dir).join(''), steps,
      add: steps[0].nets.filter(i => !nets.has(i)), remove: [] };
  };
  let q = [root], visited = 0;
  while (q.length) {
    const nq = [];
    for (const s of q) {
      if (++visited % 32 === 0) yield;
      const here = s.pos[1] * g.w + s.pos[0], occupied = new Set(s.boats.map(b => b[0])), left = capacity - s.placed.length;
      const canPlace = i => g.cells[i] === '.' && i !== here && !occupied.has(i) && !s.placed.includes(i)
        && (!fishIdx.has(i) || (s.mask & (1 << fishIdx.get(i))));
      const boatSpots = new Set();
      if (left) for (const b of s.boats) for (const d of [b[1], OPP[b[1]]]) {
        const [dx, dy] = DIRS[d], x = b[0] % g.w + dx, y = Math.floor(b[0] / g.w) + dy;
        if (x >= 0 && y >= 0 && x < g.w && y < g.h && canPlace(y * g.w + x)) boatSpots.add(y * g.w + x);
      }
      const current = new Set(s.placed);
      for (const dir of 'UDLR') {
        const plain = slide(g, s.pos, dir, current, s.boats, s.gate), relevant = new Set(boatSpots);
        if (left) for (const [x, y] of plain.path) if (canPlace(y * g.w + x)) relevant.add(y * g.w + x);
        const spots = [...relevant], adds = [[]];
        for (const i of spots) adds.push([i]);
        // Only the first net hit stops the shark; two new nets at once matter only when one affects a boat.
        if (left >= 2) for (let a = 0; a < spots.length; a++) for (let b = a + 1; b < spots.length; b++) {
          if (boatSpots.has(spots[a]) || boatSpots.has(spots[b])) adds.push([spots[a], spots[b]]);
        }
        for (const add of adds) {
          const placed = add.length ? [...s.placed, ...add].sort((a, b) => a - b) : s.placed;
          const set = add.length ? new Set(placed) : current, r = add.length ? slide(g, s.pos, dir, set, s.boats, s.gate) : plain;
          if (!r.path.length) continue;
          let m = s.mask;
          for (const [x, y] of r.path) { const fi = fishIdx.get(y * g.w + x); if (fi != null) m |= 1 << fi; }
          if (r.win) { if (!needAll || m === full) return result(s, dir, placed); continue; }
          const ng = pressSwitch(g, r.end, s.gate);
          const nb = stepBoats(g, s.boats, r.end[1] * g.w + r.end[0], set, ng), key = keyOf(r.end, m, nb, ng, placed);
          if (seen.has(key)) continue;
          seen.add(key); nq.push({ pos: r.end, mask: m, boats: nb, gate: ng, placed, parent: s, step: { dir, nets: placed } });
        }
      }
    }
    q = nq;
  }
  return null;
}
// pickup = true: the rules before 2026-10-08, kept for daily operations / free canals v1–v3 that were generated and
// rated with them. Nets can be removed/replaced for free BETWEEN moves.
// Thus a search node needs only (position, fish mask, boats, gates): every legal net configuration is
// reachable from every other one without moving the shark or boats. Each edge records the nets
// to have on the board before its swipe; keeping that recipe is essential when replaying a plan.
// Switches are pressed only by moves, so the recipe stays complete: replaying it with turn() presses them.
// `netsLeft` retains its old meaning (unused inventory); placed nets are also reusable.
// Returns {moves, seq, add, remove, steps:[{dir, nets:[idx]}]} or null. add/remove concern step 1 only.
function* planSearch(g, pos, mask, nets, netsLeft, needAll, boats, gate, pickup = false) {
  if (!pickup) return yield* placedPlanSearch(g, pos, mask, nets, netsLeft, needAll, boats, gate);
  boats = boats || g.boats;
  const capacity = nets.size + netsLeft;
  if (capacity > 2) throw new Error('plan supports at most 2 nets');
  const fishIdx = new Map(g.fish.map((f, i) => [f[1] * g.w + f[0], i]));
  const full = (1 << g.fish.length) - 1, empty = new Set();
  const keyOf = (pos, mask, boats, gate) => pos + '|' + mask + '|' + boatsKey(boats) + gateKey(g, gate);
  const root = { pos, mask, boats, gate, parent: null }, seen = new Set([keyOf(pos, mask, boats, gate)]);
  const result = (parent, dir, placed) => {
    const steps = [{ dir, nets: [...placed] }];
    for (let s = parent; s.parent; s = s.parent) steps.push(s.step);
    steps.reverse();
    const first = new Set(steps[0].nets);
    return { moves: steps.length, seq: steps.map(s => s.dir).join(''), steps,
      add: [...first].filter(i => !nets.has(i)), remove: [...nets].filter(i => !first.has(i)) };
  };
  let q = [root], visited = 0;
  while (q.length) {
    const nq = [];
    for (const s of q) {
      // Browser hints consume one batch per task so input/painting can continue during a hard search.
      if (++visited % 32 === 0) yield;
      const here = s.pos[1] * g.w + s.pos[0], occupied = new Set(s.boats.map(b => b[0]));
      const canPlace = i => g.cells[i] === '.' && i !== here && !occupied.has(i)
        && (!fishIdx.has(i) || (s.mask & (1 << fishIdx.get(i))));
      // A boat can only be stopped by a net on either neighboring tile of its patrol axis.
      const boatSpots = new Set();
      if (capacity) for (const b of s.boats) for (const d of [b[1], OPP[b[1]]]) {
        const [dx, dy] = DIRS[d], x = b[0] % g.w + dx, y = Math.floor(b[0] / g.w) + dy;
        if (x >= 0 && y >= 0 && x < g.w && y < g.h && canPlace(y * g.w + x)) boatSpots.add(y * g.w + x);
      }
      for (const dir of 'UDLR') {
        const free = slide(g, s.pos, dir, empty, s.boats, s.gate);
        if (!free.path.length) continue; // adding blockers cannot make a blocked swipe move
        // Nets off this unobstructed path AND off all boat-adjacent tiles cannot affect this turn.
        // (A switch press depends only on the stopping tile, i.e. on this path.)
        // Dropping them is safe because all nets can be moved again before the next turn.
        const relevant = new Set(boatSpots);
        if (capacity) for (const [x, y] of free.path) if (canPlace(y * g.w + x)) relevant.add(y * g.w + x);
        // Prefer retaining the current placement on equal-length routes, avoiding needless pickup hints.
        // Other placements remain reachable for free, so merging nodes without nets still preserves optimality.
        const carried = s.parent ? s.step.nets : [...nets];
        const spots = [...relevant], configs = carried.length ? [carried, []] : [[]];
        if (capacity) for (const i of spots) configs.push([i]);
        // Only the first net hit can stop the shark. A second net matters only if it affects a boat.
        if (capacity >= 2) for (let a = 0; a < spots.length; a++) for (let b = a + 1; b < spots.length; b++) {
          if (boatSpots.has(spots[a]) || boatSpots.has(spots[b])) configs.push([spots[a], spots[b]]);
        }
        for (const cfg of configs) {
          const placed = new Set(cfg), r = cfg.length ? slide(g, s.pos, dir, placed, s.boats, s.gate) : free;
          if (!r.path.length) continue;
          let m = s.mask;
          for (const [x, y] of r.path) { const fi = fishIdx.get(y * g.w + x); if (fi != null) m |= 1 << fi; }
          if (r.win) { if (!needAll || m === full) return result(s, dir, placed); continue; }
          const ng = pressSwitch(g, r.end, s.gate);
          const nb = stepBoats(g, s.boats, r.end[1] * g.w + r.end[0], placed, ng), key = keyOf(r.end, m, nb, ng);
          if (seen.has(key)) continue;
          seen.add(key); nq.push({ pos: r.end, mask: m, boats: nb, gate: ng, parent: s, step: { dir, nets: cfg } });
        }
      }
    }
    q = nq;
  }
  return null;
}
function plan(g, pos, mask, nets, netsLeft, needAll, boats, gate, pickup = false) {
  const search = planSearch(g, pos, mask, nets, netsLeft, needAll, boats, gate, pickup);
  let step;
  do { step = search.next(); } while (!step.done);
  return step.value;
}
// A quick escape still clears the canal; fish completion is required before earning the move star.
function starsForClear(allFish, inPar) {
  return 1 + (allFish ? 1 : 0) + (allFish && inPar ? 1 : 0);
}
if (typeof module !== 'undefined') module.exports = { parseLevel, slide, stepBoats, boatsKey, bfsFrom, fixedNetPlan, planSearch, plan, starsForClear, cellAt, isBlocked,
  gatePassage, gateIsOpen, pressSwitch, turn, DIRS, JET, OPP };
