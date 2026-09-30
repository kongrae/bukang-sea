// Independently check every recipe against the playable rules (including free net edits).
const assert = require('node:assert/strict');
const E = require('../src/engine.js');

function replayPlan(g, p, { pos = g.start, mask = 0, boats = g.boats, nets = new Set(), capacity = g.nets, needAll = true } = {}) {
  assert.ok(p, 'no plan');
  assert.equal(p.moves, p.steps.length);
  assert.equal(p.seq, p.steps.map(s => s.dir).join(''));
  assert.deepEqual([...p.add].sort((a, b) => a - b), p.steps[0].nets.filter(i => !nets.has(i)).sort((a, b) => a - b));
  assert.deepEqual([...p.remove].sort((a, b) => a - b), [...nets].filter(i => !p.steps[0].nets.includes(i)).sort((a, b) => a - b));
  let win = false;
  for (const step of p.steps) {
    assert.ok(!win, 'plan continues after escape');
    assert.ok(E.DIRS[step.dir], 'invalid direction');
    const placed = new Set(step.nets);
    assert.equal(placed.size, step.nets.length, 'duplicate net');
    assert.ok(placed.size <= capacity, 'too many nets');
    for (const i of placed) {
      assert.ok(Number.isInteger(i) && i >= 0 && i < g.cells.length, 'net out of bounds');
      assert.equal(g.cells[i], '.', 'net must be on water');
      assert.notEqual(i, pos[1] * g.w + pos[0], 'net on shark');
      assert.ok(!boats.some(b => b[0] === i), 'net on boat');
      g.fish.forEach(([x, y], fi) => {
        assert.ok(i !== y * g.w + x || (mask & (1 << fi)), 'net on uneaten fish');
      });
    }
    const r = E.slide(g, pos, step.dir, placed, boats);
    assert.ok(r.path.length, 'blocked swipe is not a move');
    for (const [x, y] of r.path) g.fish.forEach(([fx, fy], fi) => { if (x === fx && y === fy) mask |= 1 << fi; });
    pos = r.end; win = r.win;
    if (!win) boats = E.stepBoats(g, boats, pos[1] * g.w + pos[0], placed);
    nets = placed;
  }
  assert.ok(win, 'plan does not escape');
  if (needAll) assert.equal(mask, (1 << g.fish.length) - 1, 'fish missing');
  return { pos, mask, boats, nets };
}

module.exports = { replayPlan };
