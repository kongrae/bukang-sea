/* ---------- Engine: sliding rules + solver (shared with node tests) ---------- */
const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
const JET = { '^': 'U', 'v': 'D', '<': 'L', '>': 'R' };
const OPP = { U: 'D', D: 'U', L: 'R', R: 'L' };

function parseLevel(level) {
  const rows = level.map, h = rows.length, w = rows[0].length;
  let start = null; const fish = [], cells = [], boats = [];
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error('ragged row ' + y + ' in ' + level.name);
    for (let x = 0; x < w; x++) {
      let c = rows[y][x];
      if (c === 'S') { start = [x, y]; c = '.'; }
      if (c === 'f') { fish.push([x, y]); c = '.'; }
      // patrol boats: b = back and forth along the row (starts right), B = along the column (starts down)
      if (c === 'b' || c === 'B') { boats.push([y * w + x, c === 'b' ? 'R' : 'D']); c = '.'; }
      cells.push(c);
    }
  }
  // whirlpools come in one pair: entering either one comes out of the other
  const whirls = []; cells.forEach((c, i) => { if (c === 'w') whirls.push(i); });
  if (whirls.length && whirls.length !== 2) throw new Error('whirlpools must come in a pair in ' + level.name);
  const warp = new Map(whirls.length === 2 ? [[whirls[0], whirls[1]], [whirls[1], whirls[0]]] : []);
  return { w, h, cells, start, fish, warp, boats, nets: level.nets || 0, par: level.par };
}
function cellAt(g, x, y) {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return '#';
  return g.cells[y * g.w + x];
}
// boats: array of [cellIndex, dir] (the boats' current state); only their cells matter for blocking
function isBlocked(g, x, y, nets, boats) {
  const c = cellAt(g, x, y);
  if (c === '#' || c === 'o') return true;
  const i = y * g.w + x;
  if (nets && nets.has(i)) return true;
  if (boats) for (const b of boats) if (b[0] === i) return true;
  return false;
}
// Slide until blocked. path excludes the start tile; each step is [x, y, dir] (a 4th element `true` marks
// the tile reached by a whirlpool jump rather than by swimming). Stops on a sandbar 's'. Jets and whirlpools
// passed twice in one move stop the slide (loop guard); the tile the move starts on never triggers anything.
// Boats stand still while the shark slides; they move afterwards (stepBoats).
function slide(g, pos, dir, nets, boats) {
  let [x, y] = pos, d = dir;
  const path = [], seen = new Set();
  for (let guard = 0; guard < 500; guard++) {
    const [dx, dy] = DIRS[d];
    if (isBlocked(g, x + dx, y + dy, nets, boats)) break;
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
// tile ahead is a wall, buoy, the sea exit, a net, the shark or another boat, and stays put if both ways are blocked.
function stepBoats(g, boats, sharkIdx, nets) {
  if (!boats.length) return boats;
  const next = boats.map(b => b.slice());
  const free = (i, self) => {
    const x = i % g.w, y = Math.floor(i / g.w), c = cellAt(g, x, y);
    if (c === '#' || c === 'o' || c === 'E' || i === sharkIdx || (nets && nets.has(i))) return false;
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
// BFS over (position, fish mask, boats). Returns {moves, seq} or null. boats defaults to the level's start.
function bfsFrom(g, pos, mask, nets, needAll, cap, boats) {
  boats = boats || g.boats;
  const fishIdx = new Map(g.fish.map((f, i) => [f[1] * g.w + f[0], i]));
  const full = (1 << g.fish.length) - 1;
  const seen = new Set([pos + '|' + mask + '|' + boatsKey(boats)]);
  let q = [{ pos, mask, boats, seq: '' }], depth = 0;
  while (q.length) {
    depth++;
    if (depth > cap) return null;
    const nq = [];
    for (const s of q) for (const d of 'UDLR') {
      const r = slide(g, s.pos, d, nets, s.boats);
      if (!r.path.length) continue;
      let m = s.mask;
      for (const [x, y] of r.path) { const k = y * g.w + x; if (fishIdx.has(k)) m |= 1 << fishIdx.get(k); }
      if (r.win) { if (!needAll || m === full) return { moves: depth, seq: s.seq + d }; continue; }
      const nb = stepBoats(g, s.boats, r.end[1] * g.w + r.end[0], nets);
      const key = r.end + '|' + m + '|' + boatsKey(nb);
      if (seen.has(key)) continue;
      seen.add(key); nq.push({ pos: r.end, mask: m, boats: nb, seq: s.seq + d });
    }
    q = nq;
  }
  return null;
}
// Best plan from a state, allowed to add up to `netsLeft` more nets. Returns {moves, seq, add:[idx]} or null.
function plan(g, pos, mask, nets, netsLeft, needAll, boats) {
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
if (typeof module !== 'undefined') module.exports = { parseLevel, slide, stepBoats, boatsKey, bfsFrom, plan, cellAt, isBlocked, DIRS, JET, OPP };
