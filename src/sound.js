/* Original Web Audio synthesis: soft water + rounded toy percussion, no downloaded samples.
 * One context, one reusable noise buffer, bounded voices and explicit node disposal.
 * Kept separate from game state so the exact production sounds can be auditioned offline. */
function createGameAudio({ enabled = () => true, active = () => true,
  createContext = () => new (window.AudioContext || window.webkitAudioContext)(), random = Math.random } = {}) {
  let context = null, master, filter, compressor, water, epoch = 0, blocked = false, resuming = null, suspendTimer = null;
  let uiUntil = 0, rewardUntil = 0, pickupUntil = 0, nextPickup = 0;
  const voices = new Set(), last = new Map(), totals = { played: 0, dropped: 0, peakVoices: 0, buffers: 0 };
  const mix = { motion: .62, device: .5, ui: .4, pickup: .95, escape: .9, reward: 1 };
  const canPlay = () => enabled() && active() && !blocked;
  function resume() {
    if (!context || !canPlay() || context.state === 'running' || resuming) return;
    try { resuming = Promise.resolve(context.resume()).catch(() => {}).finally(() => { resuming = null; }); } catch (_) {}
  }
  function unlock() {
    if (!canPlay()) return null;
    if (!context) {
      try {
        context = createContext();
        master = context.createGain(); master.gain.value = .64;
        filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 3400; filter.Q.value = .5;
        compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -12; compressor.knee.value = 12; compressor.ratio.value = 5;
        compressor.attack.value = .004; compressor.release.value = .12;
        master.connect(filter).connect(compressor).connect(context.destination);
        water = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const samples = water.getChannelData(0); let smooth = 0;
        for (let i = 0; i < samples.length; i++) { smooth = smooth * .65 + (random() * 2 - 1) * .35; samples[i] = smooth; }
        totals.buffers++;
      } catch (_) { context = null; return null; }
    }
    resume(); return context;
  }
  function dispose(v) {
    if (!voices.delete(v)) return;
    for (const node of v.nodes) { try { node.disconnect(); } catch (_) {} }
  }
  function cancel(v) {
    if (v.cancelled) return;
    v.cancelled = true;
    const now = context.currentTime;
    // A short release prevents discontinuities, including when a future note has not started.
    v.gain.gain.cancelScheduledValues(now); v.gain.gain.setTargetAtTime(0, now, .003);
    for (const src of v.sources) { try { src.stop(now + .018); } catch (_) {} }
  }
  function clear(group = null) {
    if (!group || group === 'reward') epoch++;
    for (const v of voices) if (!group || v.group === group) cancel(v);
    if (!group) { last.clear(); uiUntil = rewardUntil = pickupUntil = nextPickup = 0; }
  }
  function syncEnabled() { if (!enabled()) clear(); }
  function suspend() {
    blocked = true; clear();
    // Do not freeze a release and resume its tail later. Sources stay stopped on return.
    if (context) { master.gain.cancelScheduledValues(context.currentTime); master.gain.setTargetAtTime(0, context.currentTime, .003); }
    clearTimeout(suspendTimer);
    suspendTimer = setTimeout(() => {
      if (!context || !blocked) return;
      for (const v of [...voices]) dispose(v);
      try { Promise.resolve(context.suspend()).catch(() => {}).finally(() => { if (!blocked) resume(); }); } catch (_) {}
    }, 25);
  }
  function activate() {
    blocked = false;
    clearTimeout(suspendTimer); suspendTimer = null;
    if (context) { master.gain.cancelScheduledValues(context.currentTime); master.gain.setTargetAtTime(.64, context.currentTime, .012); }
    resume();
  }
  function begin(name, group, priority, interval, token) {
    if (token != null && token !== epoch) return null;
    if (!canPlay() || !context || context.state !== 'running') return null;
    const now = context.currentTime;
    if (now - (last.get(name) ?? -Infinity) < interval || (group === 'ui' && now < uiUntil) ||
        (priority < 2 && now < rewardUntil) || (group === 'device' && now < pickupUntil)) { totals.dropped++; return null; }
    if (voices.size >= 8) { totals.dropped++; return null; }
    const live = [...voices].filter(v => !v.cancelled);
    if (live.length >= 6) {
      const victim = live.filter(v => v.priority < priority).sort((a, b) => a.priority - b.priority || a.at - b.at)[0];
      if (!victim) { totals.dropped++; return null; }
      cancel(victim);
    }
    if (priority >= 2) for (const v of voices) if (v.priority < 2 && !v.cancelled) {
      v.gain.gain.setTargetAtTime(mix[v.group] * .35, now, .012);
    }
    last.set(name, now);
    if (group === 'ui' || name === 'start' || name === 'equip' || name === 'undo') uiUntil = now + .1;
    if (group === 'reward' || group === 'escape') rewardUntil = now + .24;
    if (group === 'pickup') pickupUntil = now + .12;
    const gain = context.createGain(); gain.gain.value = mix[group]; gain.connect(master);
    const v = { name, group, priority, at: now, gain, nodes: [gain], sources: new Set(), cancelled: false };
    voices.add(v); totals.played++; totals.peakVoices = Math.max(totals.peakVoices, voices.size);
    return v;
  }
  function source(v, src, nodes, start, length, volume, attack = .009) {
    const env = context.createGain(), a = Math.min(attack, length * .25);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(volume, start + a);
    env.gain.exponentialRampToValueAtTime(.0001, start + length - .008);
    env.gain.linearRampToValueAtTime(0, start + length);
    let tail = src; for (const node of nodes) tail = tail.connect(node);
    tail.connect(env).connect(v.gain);
    const owned = [src, ...nodes, env]; v.nodes.push(...owned); v.sources.add(src);
    src.onended = () => {
      v.sources.delete(src);
      for (const node of owned) { try { node.disconnect(); } catch (_) {} }
      if (!v.sources.size) dispose(v);
    };
    src.start(start); src.stop(start + length + .006);
  }
  function drop(v, hz, length = .16, volume = .18, delay = 0, end = hz * .8, toy = false) {
    const start = v.at + delay, osc = context.createOscillator();
    const bend = 1 + (random() - .5) * .025;
    osc.type = toy ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(hz * bend, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(90, end * bend), start + length * .65);
    source(v, osc, [], start, length, volume, toy ? .006 : .012);
  }
  function wash(v, length, volume, from, to, delay = 0) {
    const start = v.at + delay, src = context.createBufferSource(), low = context.createBiquadFilter();
    src.buffer = water;
    low.type = 'lowpass'; low.Q.value = .55;
    low.frequency.setValueAtTime(from, start); low.frequency.exponentialRampToValueAtTime(to, start + length);
    source(v, src, [low], start, length, volume, .025);
  }
  const effect = (name, group, priority, interval, draw) => (...args) => {
    const v = begin(name, group, priority, interval); if (v) draw(v, ...args);
  };
  const reward = (name, draw) => (token = null) => { const v = begin(name, 'reward', 3, .12, token); if (v) draw(v); };
  const effects = {
    bump: effect('bump', 'motion', 1, .18, v => drop(v, 235, .095, .12, 0, 175, true)),
    eat: (complete = false, chain = 0) => {
      const v = begin('eat', 'pickup', complete ? 3 : 2, complete ? 0 : .055); if (!v) return;
      // Coarse frames may collect several fish at once; spread only a bounded 120ms.
      const delay = Math.min(.12, Math.max(0, nextPickup - v.at)); nextPickup = v.at + delay + .055;
      const hz = [440, 523.25, 587.33, 659.25][Math.min(3, Math.max(0, chain))];
      drop(v, hz * 1.18, .15, .2, delay, hz);
      if (complete) { drop(v, 659.25, .18, .13, delay + .09, 659.25); drop(v, 880, .2, .09, delay + .16, 880); }
    },
    net: effect('net', 'device', 1, .075, (v, remove = false) => {
      wash(v, .12, .15, remove ? 1250 : 450, remove ? 400 : 1400);
      drop(v, remove ? 510 : 290, .16, .17, .02, remove ? 340 : 400, true);
    }),
    jet: effect('jet', 'device', 1, .16, v => { wash(v, .13, .2, 650, 1650); drop(v, 380, .1, .045, .01, 480); }),
    warp: effect('warp', 'device', 1, .22, v => { wash(v, .28, .23, 1400, 300); drop(v, 460, .18, .09, 0, 240); drop(v, 330, .13, .08, .17, 540); }),
    sand: effect('sand', 'device', 1, .12, v => { wash(v, .14, .24, 520, 230); drop(v, 205, .08, .06, .01, 160, true); }),
    press: effect('press', 'device', 1, .12, v => { drop(v, 420, .065, .14, 0, 330, true); drop(v, 230, .09, .07, .025, 200); }),
    gate: effect('gate', 'device', 1, .18, v => { wash(v, .24, .2, 680, 320, .045); drop(v, 160, .17, .07, .05, 195, true); }),
    boat: effect('boat', 'device', 0, .38, v => wash(v, .105, .13, 730, 420)),
    undo: effect('undo', 'ui', 0, .12, v => drop(v, 450, .13, .17, 0, 300)),
    ui: effect('ui', 'ui', 0, .09, v => { drop(v, 390, .085, .14, 0, 285, true); drop(v, 680, .065, .045, .008, 570); }),
    start: effect('start', 'ui', 1, .2, v => { drop(v, 330, .14, .18, 0, 440); drop(v, 660, .17, .12, .065, 660); }),
    equip: effect('equip', 'ui', 1, .14, v => { drop(v, 523.25, .13, .18, 0, 440); drop(v, 659.25, .15, .12, .07, 659.25); }),
    sheet: effect('sheet', 'ui', 0, .12, (v, opening = true) => {
      wash(v, .1, .18, opening ? 400 : 950, opening ? 1050 : 330); drop(v, opening ? 320 : 370, .08, .065, 0, opening ? 390 : 270);
    }),
    exit: effect('exit', 'escape', 3, .3, v => { clear('motion'); wash(v, .38, .3, 600, 1900); drop(v, 330, .28, .11, .035, 440); }),
    win: reward('win', v => [440, 554.37, 659.25].forEach((hz, i) => drop(v, hz, .25, .14, i * .12, hz))),
    star: (index, token = null) => {
      if (!Number.isInteger(index) || index < 0 || index > 2) return;
      const v = begin('star', 'reward', 3, .1, token); if (!v) return;
      const hz = [440, 554.37, 659.25][index]; drop(v, hz, .25, .2, 0, hz); drop(v, hz * 1.5, .15, .045, .035, hz * 1.5);
    },
    unlockReward: reward('unlock', v => {
      [440, 659.25, 880].forEach((hz, i) => drop(v, hz, .29, .15 - i * .015, i * .1, hz));
      wash(v, .2, .09, 650, 1550, .05);
    }),
    clear: () => clear(), cancelReward: () => clear('reward'), token: () => epoch,
  };
  return { unlock, effects, syncEnabled, suspend, activate,
    inspect: () => ({ ...totals, voices: voices.size, sources: [...voices].reduce((n, v) => n + v.sources.size, 0), state: context?.state || 'locked', epoch }) };
}
if (typeof module !== 'undefined') module.exports = { createGameAudio };
