/* One cold-start gate. Optional assets have a deadline, never a minimum display time. */
function createLaunchGate({ prepare, paint, reveal, fail, schedule = requestAnimationFrame,
  setTimer = setTimeout, clearTimer = clearTimeout, timeout = 1600 }) {
  let task = null, state = 'idle';
  return {
    get state() { return state; },
    run(assets = []) {
      if (task) return task;
      state = 'preparing';
      task = (async () => {
        let timer;
        try {
          await Promise.race([
            Promise.allSettled(assets),
            new Promise(resolve => { timer = setTimer(resolve, timeout); }),
          ]);
          clearTimer(timer);
          await prepare();
          state = 'painting';
          await new Promise(resolve => schedule(resolve));
          paint();
          await new Promise(resolve => schedule(resolve));
          reveal(); state = 'ready';
          return true;
        } catch (error) {
          clearTimer(timer); state = 'failed'; fail(error); return false;
        }
      })();
      return task;
    },
  };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { createLaunchGate };
