const test = require('node:test');
const assert = require('node:assert/strict');
const { createLaunchGate } = require('../src/launch');
const next = () => new Promise(resolve => setImmediate(resolve));
function scene(options = {}) {
  const calls = [], frames = [], timers = new Map(); let seq = 0;
  const gate = createLaunchGate({
    prepare: () => calls.push('prepare'), paint: () => calls.push('paint'),
    reveal: () => calls.push('reveal'), fail: error => calls.push(error.message),
    schedule: fn => frames.push(fn),
    setTimer: (fn, ms) => { timers.set(++seq, { fn, ms }); return seq; }, clearTimer: id => timers.delete(id),
    ...options,
  });
  return { gate, calls, frames, timers, frame: async () => { frames.shift()(); await next(); } };
}
test('ready assets start immediately, paint before reveal, and repeated starts share one task', async () => {
  const ui = scene(), task = ui.gate.run([Promise.resolve()]);
  assert.equal(ui.gate.run(), task); await next();
  assert.deepEqual(ui.calls, ['prepare']); assert.equal(ui.timers.size, 0);
  await ui.frame(); assert.deepEqual(ui.calls, ['prepare', 'paint']);
  await ui.frame(); assert.equal(await task, true); assert.equal(ui.gate.state, 'ready');
  assert.deepEqual(ui.calls, ['prepare', 'paint', 'reveal']);
  await ui.gate.run(); assert.equal(ui.calls.length, 3, 'resume must not replay launch');
});
test('failed images and fonts do not block entry; stalled assets only wait until the deadline', async () => {
  for (const stalled of [false, true]) {
    const ui = scene(); const task = ui.gate.run([stalled ? new Promise(() => {}) : Promise.reject(new Error('image failed'))]);
    await next();
    if (stalled) {
      assert.equal(ui.calls.length, 0); assert.equal([...ui.timers.values()][0].ms, 1600);
      [...ui.timers.values()][0].fn(); await next();
    }
    await ui.frame(); await ui.frame(); assert.equal(await task, true); assert.equal(ui.timers.size, 0);
  }
});
test('background-paused frames keep the cover until a complete frame is ready', async () => {
  const ui = scene(); const task = ui.gate.run(); await next();
  assert.equal(ui.gate.state, 'painting'); assert.deepEqual(ui.calls, ['prepare']);
  await next(); assert.equal(ui.calls.includes('reveal'), false);
  await ui.frame(); await ui.frame(); await task;
  assert.equal(ui.gate.state, 'ready');
});
test('initialization or painting errors surface recovery and never reveal a broken screen', async () => {
  for (const at of ['prepare', 'paint']) {
    const ui = scene({ [at]: () => { throw new Error(at + ' failed'); } });
    const task = ui.gate.run(); await next(); if (at === 'paint') await ui.frame();
    assert.equal(await task, false); assert.equal(ui.gate.state, 'failed');
    assert.ok(ui.calls.includes(at + ' failed')); assert.ok(!ui.calls.includes('reveal')); assert.equal(ui.timers.size, 0);
  }
});
