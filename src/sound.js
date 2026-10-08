/* Recorded sounds over a Web Audio synthesis fallback: soft water + rounded toy percussion.
 * One context, one reusable noise buffer, bounded voices and explicit node disposal.
 * Kept separate from game state so the exact production sounds can be auditioned offline. */
// Human-made CC0 recordings (Kenney packs 2012–2020, Freesound incl. VSCO 2 CE instruments); provenance and choice in
// assets/audio/LICENSES.md and docs/SOUND-MOTION.md. The build inlines each data URL token (tools/build-source.js).
// [data URL, onset s, gain to the shared -24 dB reference over the first 300 ms, sounding pitch Hz of instrument notes]
const SFX_SAMPLES = {
  softImpact0: ['@@SFX_SOFT_IMPACT_0@@', .001, .324], softImpact2: ['@@SFX_SOFT_IMPACT_2@@', .001, .32],
  softImpact3: ['@@SFX_SOFT_IMPACT_3@@', .001, .324],
  waterDrop: ['@@SFX_WATER_DROP@@', .009, .832],
  waterDrop2: ['@@SFX_WATER_DROP_2@@', .003, .841],
  cloth1: ['@@SFX_CLOTH_1@@', .079, .977], cloth3: ['@@SFX_CLOTH_3@@', .024, 1.758],
  waterSwish: ['@@SFX_WATER_SWISH@@', .109, .944], drainGlug: ['@@SFX_DRAIN_GLUG@@', .052, .804],
  wetSand: ['@@SFX_WET_SAND_STEP@@', .045, .741], toggle: ['@@SFX_TOGGLE@@', 0, .254],
  woodCreak: ['@@SFX_WOOD_CREAK@@', .026, .724], splash: ['@@SFX_SPLASH@@', .037, .684],
  select: ['@@SFX_SELECT@@', 0, .394], open: ['@@SFX_OPEN@@', .008, .363], close: ['@@SFX_CLOSE@@', 0, .372],
  marimbaC5: ['@@SFX_MARIMBA_C5@@', .005, 3.802, 524.4], marimbaG5: ['@@SFX_MARIMBA_G5@@', .005, 3.428, 782.2],
  glockC6: ['@@SFX_GLOCKENSPIEL_C6@@', 0, 9.12, 1054.7],
};
function createGameAudio({ enabled = () => true, active = () => true,
  createContext = () => new (window.AudioContext || window.webkitAudioContext)(), random = Math.random, samples = SFX_SAMPLES } = {}) {
  let context = null, master, filter, compressor, water, epoch = 0, blocked = false, resuming = null, suspendTimer = null;
  let uiUntil = 0, rewardUntil = 0, pickupUntil = 0, nextPickup = 0, loading = null;
  const voices = new Set(), last = new Map(), totals = { played: 0, dropped: 0, peakVoices: 0, buffers: 0, samples: 0 };
  const recorded = new Map(), reversed = new Map(), turns = new Map();
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
        // Synthesized voices pass the warm low-pass; recordings join after it at the same master level.
        filter.connect(master).connect(compressor).connect(context.destination);
        water = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const noise = water.getChannelData(0); let smooth = 0;
        for (let i = 0; i < noise.length; i++) { smooth = smooth * .65 + (random() * 2 - 1) * .35; noise[i] = smooth; }
        totals.buffers++;
      } catch (_) { context = null; return null; }
      decodeRecordings();
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
    const gain = context.createGain(); gain.gain.value = mix[group];   // routed on its first layer (route())
    const v = { name, group, priority, at: now, gain, nodes: [gain], sources: new Set(), cancelled: false, routed: false };
    voices.add(v); totals.played++; totals.peakVoices = Math.max(totals.peakVoices, voices.size);
    return v;
  }
  function route(v, bus) { if (!v.routed) { v.gain.connect(bus); v.routed = true; } }
  function track(v, src, owned) {
    v.nodes.push(...owned); v.sources.add(src);
    src.onended = () => {
      v.sources.delete(src);
      for (const node of owned) { try { node.disconnect(); } catch (_) {} }
      if (!v.sources.size) dispose(v);
    };
  }
  function source(v, src, nodes, start, length, volume, attack = .009) {
    const env = context.createGain(), a = Math.min(attack, length * .25);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(volume, start + a);
    env.gain.exponentialRampToValueAtTime(.0001, start + length - .008);
    env.gain.linearRampToValueAtTime(0, start + length);
    let tail = src; for (const node of nodes) tail = tail.connect(node);
    route(v, filter); tail.connect(env).connect(v.gain);
    track(v, src, [src, ...nodes, env]);
    src.start(start); src.stop(start + length + .006);
  }
  // Decode once per context. A recording that fails (codec, quota, test stub) keeps its effect on the synthesized cue.
  function decodeRecordings() {
    if (loading || !samples) return;
    const bytes = url => { const bin = atob(url.slice(url.indexOf(',') + 1)), out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out.buffer; };
    loading = Promise.all(Object.entries(samples).map(([key, [url]]) => /^data:audio\/[\w.+-]+;base64,/.test(url) ? new Promise(done => {
      const keep = buffer => { if (buffer && !recorded.has(key)) { recorded.set(key, buffer); totals.samples++; } done(); };
      try { const pending = context.decodeAudioData(bytes(url), keep, () => done()); if (pending && pending.then) pending.then(keep, () => done()); }
      catch (_) { done(); }
    }) : null)).then(() => undefined);
  }
  const ready = (...keys) => keys.every(key => recorded.has(key));
  // Rotate variants so the same recording never plays twice in a row; recordings vary their pitch by up to 2%.
  const turn = (name, keys) => { const k = (turns.get(name) ?? -1) + 1; turns.set(name, k); return keys[k % keys.length]; };
  const wobble = () => 1 + (random() - .5) * .04;
  function reverse(key) {
    if (!reversed.has(key)) {
      const b = recorded.get(key), r = context.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
      for (let c = 0; c < b.numberOfChannels; c++) r.getChannelData(c).set(Float32Array.from(b.getChannelData(c)).reverse());
      reversed.set(key, r);
    }
    return reversed.get(key);
  }
  // One recorded layer from its onset; `lvl` is the target dB on the shared reference, `glide` dips then lifts the pitch.
  function sample(v, key, { lvl = -24, dur = .3, delay = 0, rate = 1, fade = Math.min(.06, dur * .4), rev = false, glide = false } = {}) {
    const [, onset, norm] = samples[key], buffer = rev ? reverse(key) : recorded.get(key);
    const start = v.at + delay, end = start + dur, volume = norm * Math.pow(10, (lvl + 24) / 20);
    const src = context.createBufferSource(), env = context.createGain();
    src.buffer = buffer;
    if (glide) { src.playbackRate.setValueAtTime(rate, start); src.playbackRate.linearRampToValueAtTime(rate * .8, start + dur * .45);
      src.playbackRate.linearRampToValueAtTime(rate * 1.06, end); } else src.playbackRate.value = rate;
    env.gain.setValueAtTime(0, start); env.gain.linearRampToValueAtTime(volume, start + .004);
    env.gain.setValueAtTime(volume, Math.max(start + .005, end - fade)); env.gain.linearRampToValueAtTime(0, end);
    route(v, master); src.connect(env).connect(v.gain);
    track(v, src, [src, env]);
    // A reversed layer ends at the original attack.
    const offset = rev ? buffer.duration - onset - dur + .015 : onset - .004;
    src.start(start, Math.min(Math.max(0, offset), Math.max(0, buffer.duration - .01))); src.stop(end + .006);
  }
  // One scale for every tonal layer (A major pentatonic); a note uses the nearest recorded pitch (within 4 semitones).
  const NOTE = { A4: 440, B4: 493.88, 'C#5': 554.37, E5: 659.26, 'F#5': 739.99, A5: 880, 'C#6': 1108.73, E6: 1318.51 };
  const MALLETS = ['marimbaC5', 'marimbaG5'], BELLS = ['glockC6'];
  function note(v, name, { bell = false, ...layer } = {}) {
    const hz = NOTE[name], key = (bell ? BELLS : MALLETS).reduce((a, b) =>
      Math.abs(Math.log2(hz / samples[b][3])) < Math.abs(Math.log2(hz / samples[a][3])) ? b : a);
    sample(v, key, { dur: .45, fade: .18, ...layer, rate: hz / samples[key][3] });
  }
  const notes = (v, names, { gap = .07, delay = 0, ...layer } = {}) => names.forEach((name, i) => note(v, name, { ...layer, delay: delay + i * gap }));
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
  // Target levels (dB on the -24 reference) for each recorded layer, matched by offline render to the loudness of the
  // synthesized cue it replaces (first 300 ms; broadband water 1 dB under) so the tuned balance between events holds.
  // Each effect uses its recordings only when all of them decoded; otherwise the synthesized cue plays unchanged.
  const lv = { bump: -34, bite: -30, gulp: -32, cloth: -38, netNote: -40, jet: -39, warp: -35.5, sand: -38, press: -37,
    pressNote: -40, creak: -41, gateWater: -46, boat: -47, crateKnock: -36, crateWater: -43, crateCreak: -45, splash: -34, exitNote: -39, star: -31, starBell: -36, win: -31,
    unlock: -31, unlockBell: -36, chapter: -31, chapterBell: -36, chapterWater: -44, undo: -29, ui: -26, uiDrop: -35, uiNote: -35, sheet: -37 };
  const IMPACTS = ['softImpact0', 'softImpact2', 'softImpact3'], DROPS = ['waterDrop', 'waterDrop2'];
  const effects = {
    bump: effect('bump', 'motion', 1, .18, v => {
      if (ready(...IMPACTS)) sample(v, turn('bump', IMPACTS), { lvl: lv.bump, dur: .14, rate: wobble() });
      else drop(v, 235, .095, .12, 0, 175, true);
    }),
    eat: (complete = false, chain = 0) => {
      const v = begin('eat', 'pickup', complete ? 3 : 2, complete ? 0 : .055); if (!v) return;
      // Coarse frames may collect several fish at once; spread only a bounded 120ms.
      const delay = Math.min(.12, Math.max(0, nextPickup - v.at)); nextPickup = v.at + delay + .055;
      // A cute chomp, not a chime (2026-10-09): two quick toy bites ("nom-nom") from the soft impacts sped up, then a small
      // water gulp. Each fish in one swipe bites a semitone higher (up to five); the last fish adds a third bite and a rounder gulp.
      const up = Math.pow(2, Math.min(5, Math.max(0, chain)) / 12);
      if (ready(...IMPACTS, ...DROPS)) {
        sample(v, turn('eatBite', IMPACTS), { lvl: lv.bite, dur: .07, delay, rate: 1.75 * up * wobble() });
        sample(v, turn('eatBite', IMPACTS), { lvl: lv.bite - 2, dur: .08, delay: delay + .075, rate: 1.5 * up * wobble() });
        if (complete) sample(v, turn('eatBite', IMPACTS), { lvl: lv.bite - 1, dur: .08, delay: delay + .15, rate: 1.9 * up * wobble() });
        sample(v, turn('eatGulp', DROPS), { lvl: lv.gulp, dur: complete ? .24 : .17, delay: delay + (complete ? .22 : .13), rate: (complete ? 1.15 : 1.35) * up, glide: true });
        return;
      }
      drop(v, 620 * up, .06, .16, delay, 470 * up, true);
      drop(v, 540 * up, .07, .14, delay + .075, 400 * up, true);
      if (complete) drop(v, 680 * up, .07, .14, delay + .15, 500 * up, true);
      drop(v, 330 * up, .14, .12, delay + (complete ? .22 : .13), 560 * up);
    },
    net: effect('net', 'device', 1, .075, (v, remove = false) => {
      if (ready('cloth1', 'cloth3', ...MALLETS)) {
        sample(v, remove ? 'cloth3' : 'cloth1', { lvl: lv.cloth, dur: .3, fade: .1, rate: wobble() });
        notes(v, remove ? ['E5', 'C#5'] : ['C#5', 'E5'], { lvl: lv.netNote, dur: .3, delay: .02 });
        return;
      }
      wash(v, .12, .15, remove ? 1250 : 450, remove ? 400 : 1400);
      drop(v, remove ? 510 : 290, .16, .17, .02, remove ? 340 : 400, true);
    }),
    jet: effect('jet', 'device', 1, .16, v => {
      if (ready('waterSwish')) sample(v, 'waterSwish', { lvl: lv.jet, dur: .45, fade: .15, rate: wobble() });
      else { wash(v, .13, .2, 650, 1650); drop(v, 380, .1, .045, .01, 480); }
    }),
    warp: effect('warp', 'device', 1, .22, v => {
      // The gurgle dips and lifts with the shark entering one whirlpool and leaving its pair (Monument Valley 3).
      if (ready('drainGlug')) sample(v, 'drainGlug', { lvl: lv.warp, dur: .5, fade: .15, glide: true });
      else { wash(v, .28, .23, 1400, 300); drop(v, 460, .18, .09, 0, 240); drop(v, 330, .13, .08, .17, 540); }
    }),
    sand: effect('sand', 'device', 1, .12, v => {
      if (ready('wetSand')) sample(v, 'wetSand', { lvl: lv.sand, dur: .3, fade: .1, rate: wobble() });
      else { wash(v, .14, .24, 520, 230); drop(v, 205, .08, .06, .01, 160, true); }
    }),
    press: effect('press', 'device', 1, .12, v => {
      if (ready('toggle', ...MALLETS)) { sample(v, 'toggle', { lvl: lv.press, dur: .14 }); note(v, 'E5', { lvl: lv.pressNote, dur: .3, delay: .02, fade: .15 }); }
      else { drop(v, 420, .065, .14, 0, 330, true); drop(v, 230, .09, .07, .025, 200); }
    }),
    gate: effect('gate', 'device', 1, .18, v => {
      if (ready('woodCreak', 'waterSwish')) {
        sample(v, 'woodCreak', { lvl: lv.creak, dur: .3, delay: .045, fade: .1 });
        sample(v, 'waterSwish', { lvl: lv.gateWater, dur: .3, delay: .095, fade: .12, rate: .9 });
      } else { wash(v, .24, .2, 680, 320, .045); drop(v, 160, .17, .07, .05, 195, true); }
    }),
    // An empty wooden crate nudged by the shark's nose: a soft knock, water along its slide, then a quiet creak where it
    // comes to rest `slide` seconds later (the crate phase; clamped so a long or missing value stays a short cue).
    crate: effect('crate', 'device', 1, .16, (v, slide = .18) => {
      const rest = Math.max(.08, Math.min(.4, Number.isFinite(slide) ? slide : .18));
      if (ready('softImpact2', 'waterSwish', 'woodCreak')) {
        sample(v, 'softImpact2', { lvl: lv.crateKnock, dur: .14, rate: .82 * wobble() });
        sample(v, 'waterSwish', { lvl: lv.crateWater, dur: .3, delay: .02, fade: .12, rate: 1.05 });
        sample(v, 'woodCreak', { lvl: lv.crateCreak, dur: .24, delay: rest, fade: .1, rate: 1.1 });
      } else { drop(v, 190, .1, .12, 0, 150, true); wash(v, .2, .15, 600, 280, .02); drop(v, 150, .12, .05, rest, 130, true); }
    }),
    boat: effect('boat', 'device', 0, .38, v => {
      if (ready('waterSwish')) sample(v, 'waterSwish', { lvl: lv.boat, dur: .3, fade: .12, rate: .85 * wobble() });
      else wash(v, .105, .13, 730, 420);
    }),
    undo: effect('undo', 'ui', 0, .12, v => {
      if (ready('waterDrop')) sample(v, 'waterDrop', { lvl: lv.undo, dur: .18, fade: .03, rev: true });
      else drop(v, 450, .13, .17, 0, 300);
    }),
    ui: effect('ui', 'ui', 0, .09, v => {
      if (ready('select')) sample(v, 'select', { lvl: lv.ui, dur: .05, rate: wobble() });
      else { drop(v, 390, .085, .14, 0, 285, true); drop(v, 680, .065, .045, .008, 570); }
    }),
    start: effect('start', 'ui', 1, .2, v => {
      if (ready('waterDrop', ...MALLETS)) { sample(v, 'waterDrop', { lvl: lv.uiDrop, dur: .2 }); notes(v, ['A4', 'E5'], { lvl: lv.uiNote, dur: .5, delay: .01 }); }
      else { drop(v, 330, .14, .18, 0, 440); drop(v, 660, .17, .12, .065, 660); }
    }),
    equip: effect('equip', 'ui', 1, .14, v => {
      if (ready('waterDrop2', ...MALLETS)) { sample(v, 'waterDrop2', { lvl: lv.uiDrop - 1, dur: .14 }); notes(v, ['C#5', 'E5'], { lvl: lv.uiNote, delay: .01 }); }
      else { drop(v, 523.25, .13, .18, 0, 440); drop(v, 659.25, .15, .12, .07, 659.25); }
    }),
    sheet: effect('sheet', 'ui', 0, .12, (v, opening = true) => {
      if (ready('open', 'close')) { sample(v, opening ? 'open' : 'close', { lvl: lv.sheet, dur: .15 }); return; }
      wash(v, .1, .18, opening ? 400 : 950, opening ? 1050 : 330); drop(v, opening ? 320 : 370, .08, .065, 0, opening ? 390 : 270);
    }),
    exit: effect('exit', 'escape', 3, .3, v => {
      clear('motion');
      if (ready('splash', ...MALLETS)) { sample(v, 'splash', { lvl: lv.splash, dur: .9, fade: .3 }); note(v, 'E5', { lvl: lv.exitNote, dur: .5, delay: .03, fade: .2 }); }
      else { wash(v, .38, .3, 600, 1900); drop(v, 330, .28, .11, .035, 440); }
    }),
    win: reward('win', v => {
      if (ready(...MALLETS)) notes(v, ['A4', 'C#5', 'E5'], { lvl: lv.win, dur: .8, gap: .12, fade: .3 });
      else [440, 554.37, 659.25].forEach((hz, i) => drop(v, hz, .25, .14, i * .12, hz));
    }),
    star: (index, token = null) => {
      if (!Number.isInteger(index) || index < 0 || index > 2) return;
      const v = begin('star', 'reward', 3, .1, token); if (!v) return;
      if (ready(...MALLETS, ...BELLS)) {
        note(v, ['A4', 'C#5', 'E5'][index], { lvl: lv.star, dur: .9, fade: .35 });
        note(v, ['A5', 'C#6', 'E6'][index], { bell: true, lvl: lv.starBell, dur: 1.1, delay: .01, fade: .4 });
        return;
      }
      const hz = [440, 554.37, 659.25][index]; drop(v, hz, .25, .2, 0, hz); drop(v, hz * 1.5, .15, .045, .035, hz * 1.5);
    },
    unlockReward: reward('unlock', v => {
      if (ready(...MALLETS, ...BELLS)) {
        notes(v, ['A4', 'E5', 'A5'], { lvl: lv.unlock, dur: .8, gap: .1, fade: .3 });
        note(v, 'A5', { bell: true, lvl: lv.unlockBell, dur: 1.2, delay: .3, fade: .4 });
        return;
      }
      [440, 659.25, 880].forEach((hz, i) => drop(v, hz, .29, .15 - i * .015, i * .1, hz));
      wash(v, .2, .09, 650, 1550, .05);
    }),
    // A new chapter's title card: water carries the shark on, then a rising call that ends on a bell.
    chapter: reward('chapter', v => {
      if (ready('waterSwish', ...MALLETS, ...BELLS)) {
        sample(v, 'waterSwish', { lvl: lv.chapterWater, dur: .5, fade: .2, rate: .9 });
        notes(v, ['C#5', 'E5', 'A5'], { lvl: lv.chapter, dur: .7, gap: .13, delay: .12, fade: .3 });
        note(v, 'A5', { bell: true, lvl: lv.chapterBell, dur: 1.1, delay: .38, fade: .4 });
        return;
      }
      wash(v, .3, .12, 500, 1400);
      [554.37, 659.25, 880].forEach((hz, i) => drop(v, hz, .26, .14 - i * .015, .12 + i * .13, hz));
    }),
    clear: () => clear(), cancelReward: () => clear('reward'), token: () => epoch,
  };
  return { unlock, effects, syncEnabled, suspend, activate, loaded: () => loading || Promise.resolve(),
    inspect: () => ({ ...totals, voices: voices.size, sources: [...voices].reduce((n, v) => n + v.sources.size, 0), state: context?.state || 'locked', epoch }) };
}
if (typeof module !== 'undefined') module.exports = { createGameAudio, SFX_SAMPLES };
