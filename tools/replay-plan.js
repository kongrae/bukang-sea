// Independently check every recipe against the playable rules (net placement and switch presses).
// Since 2026-10-08 a set net stays until undo/restart; pickup: true replays plans of the earlier rule (daily/free v1–v3).
// Crate canals (chapter 7) replay with E.turn's crate push; the result then also carries { crates, pushes }.
const assert = require('node:assert/strict');
const E = require('../src/engine.js');

function replayPlan(g, p, { pos = g.start, mask = 0, boats = g.boats, nets = new Set(), capacity = g.nets, needAll = true, gate = 0, pickup = false, crates = g.crates || [] } = {}) {
  assert.ok(p, 'no plan');
  assert.equal(p.moves, p.steps.length);
  assert.equal(p.seq, p.steps.map(s => s.dir).join(''));
  assert.deepEqual([...p.add].sort((a, b) => a - b), p.steps[0].nets.filter(i => !nets.has(i)).sort((a, b) => a - b));
  assert.deepEqual([...p.remove].sort((a, b) => a - b), [...nets].filter(i => !p.steps[0].nets.includes(i)).sort((a, b) => a - b));
  return replaySteps(g, p.steps, { pos, mask, boats, capacity, needAll, gate, pickup, set: nets, crates });
}
// Replays [{dir, nets}] (nets = the whole placement before that swipe) and counts switch presses (and crate pushes).
function replaySteps(g, steps, { pos = g.start, mask = 0, boats = g.boats, capacity = g.nets, needAll = true, gate = 0, pickup = false, set = new Set(), crates = g.crates || [] } = {}) {
  let win = false, presses = 0, pushes = 0, nets = new Set(set);
  for (const step of steps) {
    assert.ok(!win, 'plan continues after escape');
    assert.ok(E.DIRS[step.dir], 'invalid direction');
    const placed = new Set(step.nets);
    assert.equal(placed.size, step.nets.length, 'duplicate net');
    if (!pickup) for (const i of nets) assert.ok(placed.has(i), 'a set net is never picked up');
    assert.ok(placed.size <= capacity, 'too many nets');
    for (const i of placed) {
      if (nets.has(i)) continue;   // already set before an earlier swipe
      assert.ok(Number.isInteger(i) && i >= 0 && i < g.cells.length, 'net out of bounds');
      assert.equal(g.cells[i], '.', 'net must be on water');
      assert.notEqual(i, pos[1] * g.w + pos[0], 'net on shark');
      assert.ok(!boats.some(b => b[0] === i), 'net on boat');
      assert.ok(!crates.includes(i), 'net on crate');
      g.fish.forEach(([x, y], fi) => {
        assert.ok(i !== y * g.w + x || (mask & (1 << fi)), 'net on uneaten fish');
      });
    }
    const r = E.turn(g, pos, step.dir, placed, boats, gate, crates, mask);   // mask = fish eaten before this swipe
    assert.ok(r.path.length, 'blocked swipe is not a move');
    for (const [x, y] of r.path) g.fish.forEach(([fx, fy], fi) => { if (x === fx && y === fy) mask |= 1 << fi; });
    pos = r.end; win = r.win; boats = r.boats; gate = r.gate; nets = placed; crates = r.crates;
    if (r.pressed) presses++;
    if (r.push) pushes++;
  }
  assert.ok(win, 'plan does not escape');
  if (needAll) assert.equal(mask, (1 << g.fish.length) - 1, 'fish missing');
  // Canals without crates keep the earlier result shape.
  return g.crates && g.crates.length ? { pos, mask, boats, nets, gate, presses, crates, pushes } : { pos, mask, boats, nets, gate, presses };
}
// Authored route text: swipes separated by spaces; "[x,y;x,y]D" lists every net on the board before that swipe.
function parseRoute(g, route) {
  return route.trim().split(/\s+/).map(token => {
    const m = /^(?:\[([\d,;]*)\])?([UDLR])$/.exec(token);
    assert.ok(m, 'bad route token ' + token);
    const nets = m[1] ? m[1].split(';').filter(Boolean).map(p => { const [x, y] = p.split(',').map(Number); return y * g.w + x; }) : [];
    return { dir: m[2], nets };
  });
}

module.exports = { replayPlan, replaySteps, parseRoute };
