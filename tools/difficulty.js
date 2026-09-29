// Difficulty metric (proxy for how hard a level feels).
//   bits = -log2(P), P = chance that a random player gets 3 stars: nets dropped on random free water tiles,
//          then random valid swipes, at most `par` moves. +1 bit = half the chance.
//   Also: sols (distinct optimal move sequences), netOK (net placements that still allow 3 stars).
// It overstates net difficulty (people reason about where to stop, they don't place nets at random),
// so compare net levels with each other and confirm the curve by playing on a phone.
//   node tools/difficulty.js        -> table for every level, grouped by chapter
const E = require('../src/engine.js');

function model(g, nets) {
  const fishIdx = new Map(g.fish.map((f, i) => [f[1] * g.w + f[0], i]));
  const full = (1 << g.fish.length) - 1, mm = new Map(), pm = new Map(), cm = new Map();
  const moves = (pos, mask) => {
    const key = pos + '|' + mask; if (mm.has(key)) return mm.get(key);
    const out = [];
    for (const d of 'UDLR') {
      const r = E.slide(g, pos, d, nets); if (!r.path.length) continue;
      let m = mask; for (const [x, y] of r.path) { const k = y * g.w + x; if (fishIdx.has(k)) m |= 1 << fishIdx.get(k); }
      out.push({ pos: r.end, mask: m, win: r.win });
    }
    mm.set(key, out); return out;
  };
  // chance of a full (all fish) escape within `left` random moves
  const P = (pos, mask, left) => {
    if (left <= 0) return 0; const key = pos + '|' + mask + '|' + left; if (pm.has(key)) return pm.get(key);
    const ms = moves(pos, mask); let p = 0;
    for (const m of ms) p += (m.win ? +(m.mask === full) : P(m.pos, m.mask, left - 1)) / ms.length;
    pm.set(key, p); return p;
  };
  // number of move sequences that finish a full escape in exactly `left` moves
  const C = (pos, mask, left) => {
    if (left <= 0) return 0; const key = pos + '|' + mask + '|' + left; if (cm.has(key)) return cm.get(key);
    let c = 0; for (const m of moves(pos, mask)) c += m.win ? +(m.mask === full && left === 1) : C(m.pos, m.mask, left - 1);
    cm.set(key, c); return c;
  };
  return { P, C };
}

// level: { map, nets, par }. Returns { bits, sols, netOK, placements }.
function measure(level) {
  const g = E.parseLevel(level), par = level.par;
  const fishTiles = new Set(g.fish.map(f => f[1] * g.w + f[0])), here = g.start[1] * g.w + g.start[0];
  const spots = [];
  for (let k = 0; k < g.cells.length; k++) if (g.cells[k] === '.' && k !== here && !fishTiles.has(k)) spots.push(k);
  let configs = [[]];
  if (g.nets === 1) configs = spots.map(a => [a]);
  if (g.nets >= 2) { configs = []; for (let a = 0; a < spots.length; a++) for (let b = a + 1; b < spots.length; b++) configs.push([spots[a], spots[b]]); }
  let p = 0, sols = 0, netOK = 0;
  for (const cfg of configs) {
    const m = model(g, new Set(cfg)), s = m.C(g.start, 0, par);
    p += m.P(g.start, 0, par); sols += s; if (s) netOK++;
  }
  p /= configs.length;
  return { bits: p > 0 ? +(-Math.log2(p)).toFixed(1) : Infinity, sols, netOK, placements: configs.length };
}

if (require.main === module) {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'levels.js'), 'utf8');
  const { LEVELS, CHAPTERS } = new Function(src + '; return { LEVELS, CHAPTERS };')();
  let i = 0;
  for (const [ci, ch] of CHAPTERS.entries()) {
    console.log(`\n${ci + 1}장 ${ch.name}`);
    let prev = null;
    for (let k = 0; k < ch.count; k++, i++) {
      const L = LEVELS[i], d = measure(L);
      const drop = prev != null && d.bits < prev ? `  ▼${(prev - d.bits).toFixed(1)}` : '';
      console.log(`  ${String(i + 1).padStart(2)} ${L.name.padEnd(8, '　')} par ${String(L.par).padStart(2)}  nets ${L.nets || 0}  bits ${String(d.bits).padStart(4)}  ${'█'.repeat(Math.round(d.bits))}${drop}`);
      prev = d.bits;
    }
  }
}

module.exports = { measure };
