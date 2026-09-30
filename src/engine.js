/* ---------- Engine: sliding rules + solver (shared with node tests) ---------- */
const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
const JET = { '^': 'U', 'v': 'D', '<': 'L', '>': 'R' };

function parseLevel(level) {
  const rows = level.map, h = rows.length, w = rows[0].length;
  let start = null; const fish = []; const cells = [];
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error('ragged row ' + y + ' in ' + level.name);
    for (let x = 0; x < w; x++) {
      let c = rows[y][x];
      if (c === 'S') { start = [x, y]; c = '.'; }
      if (c === 'f') { fish.push([x, y]); c = '.'; }
      cells.push(c);
    }
  }
  // whirlpools come in one pair: entering either one comes out of the other
  const whirls = []; cells.forEach((c, i) => { if (c === 'w') whirls.push(i); });
  if (whirls.length && whirls.length !== 2) throw new Error('whirlpools must come in a pair in ' + level.name);
  const warp = new Map(whirls.length === 2 ? [[whirls[0], whirls[1]], [whirls[1], whirls[0]]] : []);
  return { w, h, cells, start, fish, warp, nets: level.nets || 0, par: level.par };
}
function cellAt(g, x, y) {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return '#';
  return g.cells[y * g.w + x];
}
function isBlocked(g, x, y, nets) {
  const c = cellAt(g, x, y);
  if (c === '#' || c === 'o' || c === 'b') return true;
  return !!(nets && nets.has(y * g.w + x));
}
// Slide until blocked. path excludes the start tile; each step is [x, y, dir] (a 4th element `true` marks
// the tile reached by a whirlpool jump rather than by swimming). Stops on a sandbar 's'. Jets and whirlpools
// passed twice in one move stop the slide (loop guard); the tile the move starts on never triggers anything.
function slide(g, pos, dir, nets) {
  let [x, y] = pos, d = dir;
  const path = [], seen = new Set();
  for (let guard = 0; guard < 500; guard++) {
    const [dx, dy] = DIRS[d];
    if (isBlocked(g, x + dx, y + dy, nets)) break;
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
// BFS over (position, fish mask). Returns {moves, seq} or null.
function bfsFrom(g, pos, mask, nets, needAll, cap) {
  const fishIdx = new Map(g.fish.map((f, i) => [f[1] * g.w + f[0], i]));
  const full = (1 << g.fish.length) - 1;
  const seen = new Set([pos + '|' + mask]);
  let q = [{ pos, mask, seq: '' }], depth = 0;
  while (q.length) {
    depth++;
    if (depth > cap) return null;
    const nq = [];
    for (const s of q) for (const d of 'UDLR') {
      const r = slide(g, s.pos, d, nets);
      if (!r.path.length) continue;
      let m = s.mask;
      for (const [x, y] of r.path) { const k = y * g.w + x; if (fishIdx.has(k)) m |= 1 << fishIdx.get(k); }
      if (r.win) { if (!needAll || m === full) return { moves: depth, seq: s.seq + d }; continue; }
      const key = r.end + '|' + m;
      if (seen.has(key)) continue;
      seen.add(key); nq.push({ pos: r.end, mask: m, seq: s.seq + d });
    }
    q = nq;
  }
  return null;
}
// Best plan from a state, allowed to add up to `netsLeft` more nets. Returns {moves, seq, add:[idx]} or null.
function plan(g, pos, mask, nets, netsLeft, needAll) {
  const fishTiles = new Set(g.fish.map(f => f[1] * g.w + f[0]));
  const here = pos[1] * g.w + pos[0];
  const spots = [];
  for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === '.' && i !== here && !fishTiles.has(i) && !nets.has(i)) spots.push(i);
  const options = [[]];
  if (netsLeft >= 1) for (const a of spots) options.push([a]);
  if (netsLeft >= 2) for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) options.push([spots[i], spots[j]]);
  let best = null;
  for (const add of options) {
    const n2 = new Set(nets); add.forEach(a => n2.add(a));
    const r = bfsFrom(g, pos, mask, n2, needAll, best ? best.moves - 1 : 60);
    if (r && (!best || r.moves < best.moves)) best = { ...r, add };
  }
  return best;
}
if (typeof module !== 'undefined') module.exports = { parseLevel, slide, bfsFrom, plan, cellAt, isBlocked, DIRS, JET };
