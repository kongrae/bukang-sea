// Shared exhaustive reachable-state audit used by authored content verification and offline selection.
const E=require('../src/engine');
const CRATE_STATE_CAP = 100000;
function crateReach(g, cap = CRATE_STATE_CAP) {
  const fishIdx = new Map(g.fish.map((f, i) => [f[1] * g.w + f[0], i])), full = (1 << g.fish.length) - 1, none = new Set();
  const keyOf = s => s.pos + '|' + s.mask + '|' + E.boatsKey(s.boats) + '|' + s.gate + '|' + s.crates.join(',');
  const states = [{ pos: g.start, mask: 0, boats: g.boats, gate: 0, crates: g.crates }], ids = new Map([[keyOf(states[0]), 0]]);
  const escape = [false], all = [false], preds = [[]];
  for (let id = 0; id < states.length; id++) {
    const s = states[id];
    for (const d of 'UDLR') {
      const r = E.turn(g, s.pos, d, none, s.boats, s.gate, s.crates, s.mask);
      if (!r.path.length) continue;
      let m = s.mask;
      for (const [x, y] of r.path) { const fi = fishIdx.get(y * g.w + x); if (fi != null) m |= 1 << fi; }
      if (r.win) { escape[id] = true; if (m === full) all[id] = true; continue; }
      const t = { pos: r.end, mask: m, boats: r.boats, gate: r.gate, crates: r.crates }, k = keyOf(t);
      let to = ids.get(k);
      if (to == null) {
        if (states.length >= cap) return { reachable: Infinity };
        to = states.length; ids.set(k, to); states.push(t); escape.push(false); all.push(false); preds.push([]);
      }
      preds[to].push(id);
    }
  }
  // A state can (fully) escape when any successor can: walk the edges backwards from the winning states.
  for (const flag of [escape, all]) {
    const queue = flag.map((v, id) => v ? id : -1).filter(id => id >= 0);
    for (let q = 0; q < queue.length; q++) for (const p of preds[queue[q]]) if (!flag[p]) { flag[p] = true; queue.push(p); }
  }
  const unescapable = escape.filter(v => !v).length, fishLost = escape.filter((v, id) => v && !all[id]).length;
  return { reachable: states.length, unescapable, fishLost };
}
module.exports={crateReach,CRATE_STATE_CAP};
