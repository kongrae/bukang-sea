/* ---------- Game ---------- */
(() => {
const $ = id => document.getElementById(id);
const css = getComputedStyle(document.documentElement);
const C = {};
['harbor','water','water-hi','sea','concrete','concrete-2','rail','park','ink','text','muted','buoy','star','net','shark','shark-2','hero-paper']
  .forEach(k => C[k] = css.getPropertyValue('--' + k).trim());
const SHIRTS = ['#e4572e', '#f3a712', '#29335c', '#a8c686', '#ffffff', '#669bbc', '#b56576', '#2b2d42'];
const ANG = { R: 0, D: Math.PI / 2, L: Math.PI, U: -Math.PI / 2 };
const DIR_KO = { U: '위로', D: '아래로', L: '왼쪽으로', R: '오른쪽으로' };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SWIPE = 18;   // px of finger travel that commits a swipe (fires during the move, not on release)

/* ---------- storage (per-viewer convenience only) ---------- */
const STORE_KEY = 'bukang-sea-v1';
// vibe: haptics on/off, coachSwipe/coachNet: first-play finger hints already shown
// daily: dated attendance; dailyOps: three best stage stars per date; owned/skin: earned and equipped skins
// sessions: one story canal, each daily stage, and a legacy daily; seenDevices: confirmed device guides
// hintUsage: counts and last-use times per story canal or dated daily stage; not part of undo
let save = { best: {}, last: 0, sound: true, vibe: true, coachSwipe: false, coachNet: false, daily: {}, dailyOps: {}, owned: null, skin: 'basic', sessions: {}, seenDevices: [], hintUsage: {} };
try { const s = JSON.parse(localStorage.getItem(STORE_KEY)); if (s && s.best) save = Object.assign(save, s); } catch (e) {}
if (!save.sessions || typeof save.sessions !== 'object' || Array.isArray(save.sessions)) save.sessions = {};
if (!save.sessions.dailyStages || typeof save.sessions.dailyStages !== 'object' || Array.isArray(save.sessions.dailyStages)) save.sessions.dailyStages = {};
if (!Array.isArray(save.seenDevices)) save.seenDevices = [];
if (!save.hintUsage || typeof save.hintUsage !== 'object' || Array.isArray(save.hintUsage)) save.hintUsage = {};
if (!save.dailyOps || typeof save.dailyOps !== 'object' || Array.isArray(save.dailyOps)) save.dailyOps = {};
// Keep the previous single puzzle separately so starting an operation never overwrites it.
if (save.sessions.daily && /^\d{4}-\d{2}-\d{2}$/.test(save.sessions.daily.id)) {
  save.sessions.dailyLegacy = save.sessions.daily; delete save.sessions.daily; persist();
}
function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(save)); } catch (e) {} }
// Compact lifetime stamps: 1 = participated, 2 = all three canals completed. Never prune these dates.
function journalDateValid(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date + 'T00:00:00Z'))
    && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
}
function normalizeJournal() {
  const days = {};
  if (save.journal?.version === 1 && save.journal.days && typeof save.journal.days === 'object') {
    for (const [date, stamp] of Object.entries(save.journal.days)) {
      if (journalDateValid(date) && (stamp === 1 || stamp === 2)) days[date] = stamp;
    }
  }
  for (const [date, stars] of Object.entries(save.daily || {})) {
    if (journalDateValid(date) && Number.isInteger(stars) && stars >= 1 && stars <= 3) days[date] = Math.max(days[date] || 0, 1);
  }
  for (const [date, record] of Object.entries(save.dailyOps)) {
    if (!journalDateValid(date) || record?.version !== DAILY_OPERATION_VERSION || !Array.isArray(record.stars)) continue;
    const cleared = record.stars.slice(0, 3).filter(n => Number.isInteger(n) && n >= 1 && n <= 3).length;
    if (cleared) days[date] = Math.max(days[date] || 0, cleared === 3 ? 2 : 1);
  }
  save.journal = { version: 1, days }; persist();
}
function recordJournal(date, complete = false) {
  if (journalDateValid(date)) save.journal.days[date] = Math.max(save.journal.days[date] || 0, complete ? 2 : 1);
}
function journalTotals() {
  const stamps = Object.values(save.journal.days);
  return { visits: stamps.length, operations: stamps.filter(n => n === 2).length };
}
normalizeJournal(); // Import only surviving records; old single-puzzle clears never become full operations.
const unlocked = i => i === 0 || save.best[i - 1] != null;
// chapter of level i: { ci, start, end, name } (CHAPTERS lists consecutive runs of LEVELS)
function chapterOf(i) {
  let start = 0;
  for (let ci = 0; ci < CHAPTERS.length; ci++) {
    const end = start + CHAPTERS[ci].count - 1;
    if (i <= end) return { ci, start, end, name: CHAPTERS[ci].name };
    start = end + 1;
  }
  return { ci: 0, start: 0, end: LEVELS.length - 1, name: '' };
}

/* ---------- shark skins: earned with story stars (one with a daily streak), kept once earned ---------- */
// Decorations draw in the shark's own frame: x forward (head at +L/2), y across (+-W/2); `pattern` is clipped to the body.
function flower(ctx, x, y, r) {
  ctx.fillStyle = '#f6bfd0';
  for (let k = 0; k < 5; k++) { const a = k * Math.PI * 0.4; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#e0708f'; ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, 7); ctx.fill();
}
function mapleLeaf(ctx, x, y, r) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#d9482b'; ctx.beginPath();
  for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#8f2a17'; ctx.lineWidth = Math.max(1, r * 0.12); ctx.beginPath(); ctx.moveTo(0, r * 1.2); ctx.lineTo(0, -r * 0.6); ctx.stroke();
  ctx.restore();
}
function sparkle(ctx, x, y, r) {
  ctx.fillStyle = '#fff8d6'; ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.25, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.25, y); ctx.closePath();
  ctx.moveTo(x - r, y); ctx.lineTo(x, y + r * 0.25); ctx.lineTo(x + r, y); ctx.lineTo(x, y - r * 0.25); ctx.closePath(); ctx.fill();
}
const SKINS = [
  { id: 'basic', name: '무태상어', need: { stars: 0 } },
  { id: 'sakura', name: '벚꽃 상어', need: { stars: 20 }, body: '#a8939a', fin: '#8b767d',
    deco: (ctx, L, W, T) => { for (const [x, y, s] of [[0.28, -0.14, 1], [0.0, 0.2, 0.85], [-0.2, -0.16, 0.7]]) flower(ctx, L * x, W * y, T * 0.035 * s); } },
  { id: 'wave', name: '파도 상어', need: { stars: 45 }, body: '#5f8ea2', fin: '#476f82',
    pattern: (ctx, L, W, T) => {
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = Math.max(1.2, T * 0.03);
      for (const off of [-0.24, 0.24]) {
        ctx.beginPath();
        for (let x = -0.36; x <= 0.5; x += 0.02) { const y = W * off + Math.sin(x * 24) * W * 0.09; x === -0.36 ? ctx.moveTo(L * x, y) : ctx.lineTo(L * x, y); }
        ctx.stroke();
      }
    } },
  { id: 'maple', name: '단풍 상어', need: { stars: 75 }, body: '#9b7b5b', fin: '#7c5f44',
    deco: (ctx, L, W, T) => mapleLeaf(ctx, L * 0.22, 0, T * 0.11) },
  { id: 'snow', name: '눈꽃 상어', need: { stars: 105 }, body: '#b9c5c9', fin: '#96a4a9',
    deco: (ctx, L, W, T) => {
      ctx.fillStyle = '#d23c3c';
      ctx.beginPath(); ctx.moveTo(L * 0.17, W * 0.42); ctx.lineTo(-L * 0.06, W * 1.0); ctx.lineTo(L * 0.02, W * 1.02); ctx.lineTo(L * 0.22, W * 0.46); ctx.fill();
      ctx.beginPath(); ctx.ellipse(L * 0.2, 0, L * 0.05, W * 0.58, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = Math.max(1, T * 0.018);
      ctx.beginPath(); ctx.moveTo(L * 0.2, -W * 0.5); ctx.lineTo(L * 0.2, W * 0.5); ctx.stroke();
      ctx.fillStyle = '#fff'; for (const [x, y] of [[0.02, -0.22], [-0.18, 0.12], [0.34, 0.18]]) { ctx.beginPath(); ctx.arc(L * x, W * y, T * 0.02, 0, 7); ctx.fill(); }
    } },
  { id: 'gold', name: '황금 상어', need: { stars: 144 }, body: '#d6aa3e', fin: '#b3862b',
    pattern: (ctx, L, W, T, t) => {
      const p = ((t * 0.5) % 1.6) - 0.3;   // a glint sweeping from tail to head
      ctx.fillStyle = 'rgba(255,248,214,.45)'; ctx.beginPath();
      ctx.moveTo(L * (p - 0.5), -W); ctx.lineTo(L * (p - 0.38), -W); ctx.lineTo(L * (p - 0.48), W); ctx.lineTo(L * (p - 0.6), W); ctx.fill();
    },
    deco: (ctx, L, W, T, t) => { ctx.globalAlpha *= 0.6 + 0.4 * Math.sin(t * 5); sparkle(ctx, L * 0.3, -W * 0.18, T * 0.07); ctx.globalAlpha = 1; } },
  { id: 'lighthouse', name: '등대 상어', need: { streak: 7 }, body: '#ece6dc', fin: '#c9c2b6',
    pattern: (ctx, L, W) => { ctx.fillStyle = '#cf3b33'; for (const x of [0.3, 0.02, -0.26]) ctx.fillRect(L * (x - 0.05), -W, L * 0.1, W * 2); } },
  { id: 'coral', name: '산호 상어', need: { visits: 3 }, body: '#dc9b88', fin: '#ae6f66',
    pattern: (ctx, L, W, T) => {
      ctx.strokeStyle = '#ffe5c8'; ctx.lineWidth = Math.max(1.5, T * 0.025); ctx.lineCap = 'round';
      for (const x of [-0.2, 0.08, 0.3]) {
        ctx.beginPath(); ctx.moveTo(L * x, W * 0.4); ctx.lineTo(L * x, -W * 0.35);
        ctx.moveTo(L * x, 0); ctx.lineTo(L * (x - 0.08), -W * 0.15);
        ctx.moveTo(L * x, -W * 0.15); ctx.lineTo(L * (x + 0.07), -W * 0.3); ctx.stroke();
      }
    } },
  { id: 'starsea', name: '별바다 상어', need: { operations: 7 }, body: '#7d83b9', fin: '#596390',
    deco: (ctx, L, W, T) => { for (const [x, y] of [[0.3, -0.17], [0.02, 0.2], [-0.24, -0.1]]) sparkle(ctx, L * x, W * y, T * 0.065); } },
];
const totalStars = () => Object.values(save.best).reduce((n, b) => n + b, 0);
// longest run of consecutive daily clears in the kept history
function bestStreak() {
  const days = Object.keys(save.daily || {}).sort();
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    const cur = new Date(d + 'T00:00:00');
    run = prev && Math.round((cur - prev) / 86400000) === 1 ? run + 1 : 1;
    best = Math.max(best, run); prev = cur;
  }
  return best;
}
const skinEarned = s => s.need.visits ? journalTotals().visits >= s.need.visits
  : s.need.operations ? journalTotals().operations >= s.need.operations
  : s.need.streak ? bestStreak() >= s.need.streak : totalStars() >= s.need.stars;
// adds newly earned skins to save.owned and returns them (owned skins never lock again)
function refreshSkins() {
  const owned = new Set(save.owned || ['basic']), fresh = SKINS.filter(s => !owned.has(s.id) && skinEarned(s));
  if (fresh.length || !save.owned) { fresh.forEach(s => owned.add(s.id)); save.owned = [...owned]; persist(); }
  return fresh;
}
function currentSkin() { return SKINS.find(s => s.id === save.skin && (save.owned || []).includes(s.id)) || SKINS[0]; }

/* ---------- haptics: Capacitor Haptics plugin in the app, navigator.vibrate on Android browsers ---------- */
const Hap = window.Capacitor?.Plugins?.Haptics;
const VIB = { tick: 4, light: 9, medium: 16, heavy: 26, success: [12, 60, 20, 60, 28] };
function haptic(kind) {
  if (!save.vibe) return;
  try {
    if (Hap) {
      const p = kind === 'success' ? Hap.notification({ type: 'SUCCESS' })
        : Hap.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
      if (p && p.catch) p.catch(() => {});
    } else if (navigator.vibrate) navigator.vibrate(VIB[kind] || 6);
  } catch (e) {}
}

/* ---------- sound ---------- */
let actx = null;
function ac() {
  if (!save.sound) return null;
  try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { return null; }
  return actx;
}
function tone(freq, dur, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
  const a = ac(); if (!a) return;
  const t0 = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
// filtered noise burst: water swooshes and splashes
function noise(len, vol, f0, f1, q = 0.8, type = 'bandpass') {
  const a = ac(); if (!a) return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(Math.sin(Math.PI * i / d.length), 1.5);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  f.type = type; f.frequency.setValueAtTime(f0, a.currentTime); f.frequency.exponentialRampToValueAtTime(f1, a.currentTime + len); f.Q.value = q;
  g.gain.value = vol; src.buffer = buf; src.connect(f).connect(g).connect(a.destination); src.start();
}
const sfx = {
  move: () => noise(0.26, 0.15, 500, 1400),
  stop: (amp = 0.5) => { noise(0.2, 0.07 + amp * 0.08, 1400, 350, 0.7, 'lowpass'); tone(150, 0.1, 'sine', 0.04 + amp * 0.05, -60); },
  bump: () => tone(110, 0.14, 'triangle', 0.16, -40),
  eat: () => { tone(660, 0.08, 'square', 0.05); tone(990, 0.1, 'square', 0.05, 0, 0.06); },
  net: () => tone(330, 0.12, 'triangle', 0.1, 120),
  jet: () => tone(480, 0.1, 'sine', 0.06, 320),
  undo: () => tone(520, 0.09, 'sine', 0.06, -200),
  exit: () => { noise(0.5, 0.2, 400, 2400, 0.6); tone(330, 0.3, 'sine', 0.05, 330); },
  warp: () => { noise(0.35, 0.14, 1800, 250, 1.2); tone(620, 0.3, 'sine', 0.05, -420); },
  sand: () => noise(0.16, 0.1, 700, 200, 0.6, 'lowpass'),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, 0, i * 0.09)),
};

/* ---------- easing ---------- */
// position curve built from a velocity profile: quick push-off, long glide that settles into the stop
function easeTable(vel) {
  const N = 96, out = new Float32Array(N + 1); let acc = 0;
  for (let i = 1; i <= N; i++) { acc += vel((i - 0.5) / N); out[i] = acc; }
  for (let i = 1; i <= N; i++) out[i] /= acc;
  return u => { const x = Math.min(1, Math.max(0, u)) * N, i = Math.floor(x); return i >= N ? 1 : out[i] + (out[i + 1] - out[i]) * (x - i); };
}
const GLIDE = easeTable(u => Math.min(u / 0.12, 1) * Math.pow(1 - u, 1.4) + 0.02);
const DASH = easeTable(u => Math.min(u / 0.12, 1) * (1 - 0.3 * u));          // escaping: keeps speed into the sea
const easeOutBack = k => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
const clamp01 = v => Math.max(0, Math.min(1, v));

/* ---------- drawing primitives ---------- */
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n += n << 3; n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967295; }

// stretch > 1 lengthens the body along its heading (speed), < 1 squashes it (impact); skin = colours + decoration (SKINS)
function drawShark(ctx, cx, cy, ang, T, t, moving, stretch = 1, alpha = 1, skin = currentSkin()) {
  if (alpha <= 0) return;
  const fin = skin.fin || C['shark-2'], body = skin.body || C.shark;
  const L = T * 1.08, W = T * 0.44;
  const wag = reduceMotion ? 0 : Math.sin(t * (moving ? 18 : 5)) * (moving ? 0.28 : 0.14);
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(cx, cy); ctx.rotate(ang); ctx.scale(stretch, 1 + (1 - stretch) * 0.8);
  ctx.fillStyle = 'rgba(4,20,26,.22)';
  ctx.beginPath(); ctx.ellipse(T * 0.03, T * 0.05, L * 0.46, W * 0.62, 0, 0, Math.PI * 2); ctx.fill();
  // A light rim keeps every skin legible against the water without changing its pattern.
  ctx.strokeStyle = C.rail; ctx.lineWidth = Math.max(1.2, T * 0.028); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // Narrow tail root and a deep fork stay separate from the broad head at small sizes.
  ctx.save(); ctx.translate(-L * 0.3, 0); ctx.rotate(wag);
  ctx.fillStyle = fin;
  ctx.beginPath();
  ctx.moveTo(0, -W * 0.2); ctx.lineTo(-L * 0.23, -W * 0.08); ctx.lineTo(-L * 0.23, W * 0.08); ctx.lineTo(0, W * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-L * 0.19, 0); ctx.lineTo(-L * 0.37, -W * 0.76);
  ctx.quadraticCurveTo(-L * 0.35, -W * 0.23, -L * 0.27, 0);
  ctx.quadraticCurveTo(-L * 0.33, W * 0.2, -L * 0.34, W * 0.62); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  // pectoral fins
  ctx.fillStyle = fin;
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(L * 0.1, s * W * 0.36); ctx.lineTo(-L * 0.22, s * W * 1.02);
    ctx.quadraticCurveTo(-L * 0.19, s * W * 0.62, -L * 0.11, s * W * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // body
  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(L * 0.5, -W * 0.08);
    ctx.bezierCurveTo(L * 0.49, -W * 0.38, L * 0.29, -W * 0.56, L * 0.1, -W * 0.5);
    ctx.bezierCurveTo(-L * 0.12, -W * 0.46, -L * 0.3, -W * 0.17, -L * 0.36, -W * 0.08);
    ctx.lineTo(-L * 0.36, W * 0.08);
    ctx.bezierCurveTo(-L * 0.3, W * 0.17, -L * 0.12, W * 0.46, L * 0.1, W * 0.5);
    ctx.bezierCurveTo(L * 0.29, W * 0.56, L * 0.49, W * 0.38, L * 0.5, W * 0.08);
    ctx.quadraticCurveTo(L * 0.52, 0, L * 0.5, -W * 0.08); ctx.closePath();
  };
  ctx.fillStyle = body; bodyPath(); ctx.fill();
  if (skin.pattern) { ctx.save(); bodyPath(); ctx.clip(); skin.pattern(ctx, L, W, T, t); ctx.restore(); }
  bodyPath(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.2)';
  ctx.beginPath(); ctx.ellipse(L * 0.25, 0, L * 0.2, W * 0.33, 0, 0, Math.PI * 2); ctx.fill();
  // Three short gill marks behind each eye; the top fin has a triangular folded face.
  ctx.strokeStyle = 'rgba(10,35,43,.48)'; ctx.lineWidth = Math.max(0.65, T * 0.017);
  for (const s of [-1, 1]) for (const x of [0.12, 0.055, -0.01]) {
    ctx.beginPath(); ctx.moveTo(L * x, s * W * 0.25);
    ctx.quadraticCurveTo(L * (x - 0.02), s * W * 0.34, L * (x - 0.015), s * W * 0.4); ctx.stroke();
  }
  ctx.fillStyle = fin;
  ctx.beginPath(); ctx.moveTo(L * 0.055, W * 0.04); ctx.lineTo(-L * 0.14, -W * 0.34);
  ctx.quadraticCurveTo(-L * 0.12, -W * 0.05, -L * 0.24, W * 0.12); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(238,240,234,.65)'; ctx.lineWidth = Math.max(0.7, T * 0.018);
  ctx.beginPath(); ctx.moveTo(L * 0.055, W * 0.04); ctx.lineTo(-L * 0.14, -W * 0.34); ctx.stroke();
  if (skin.deco) { ctx.save(); skin.deco(ctx, L, W, T, t); ctx.restore(); }
  // Paired eyes give the player a clear face without a mouth or teeth obscuring its heading.
  for (const s of [-1, 1]) {
    ctx.fillStyle = C.rail; ctx.beginPath(); ctx.ellipse(L * 0.3, s * W * 0.34, T * 0.05, T * 0.043, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(L * 0.31, s * W * 0.34, T * 0.03, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(L * 0.32, s * W * 0.34 - T * 0.01, T * 0.01, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function drawFish(ctx, cx, cy, T, t, seed, scale = 1) {
  const a = Math.sin(t * 3 + seed * 6) * 0.5 + seed * 6;
  ctx.save(); ctx.translate(cx + Math.cos(t + seed * 9) * T * 0.06, cy + Math.sin(t * 1.3 + seed) * T * 0.05); ctx.rotate(a); ctx.scale(scale, scale);
  const l = T * 0.23, w = T * 0.085;
  ctx.fillStyle = 'rgba(4,20,26,.2)'; ctx.beginPath(); ctx.ellipse(2, 3, l, w, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#c9d6d8';
  ctx.beginPath(); ctx.moveTo(-l * 0.8, 0); ctx.lineTo(-l * 1.4, -w * 1.1); ctx.lineTo(-l * 1.4, w * 1.1); ctx.fill();
  ctx.fillStyle = '#e8f0ef'; ctx.beginPath(); ctx.ellipse(0, 0, l, w, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#8fa3a8'; ctx.beginPath(); ctx.ellipse(-l * 0.1, -w * 0.3, l * 0.7, w * 0.35, 0, 0, 7); ctx.fill();
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(l * 0.6, -w * 0.15, T * 0.018, 0, 7); ctx.fill();
  ctx.restore();
}
function drawBuoy(ctx, cx, cy, T, t) {
  const r = T * 0.26, b = Math.sin(t * 2 + cx) * T * 0.02;
  ctx.fillStyle = 'rgba(4,20,26,.25)'; ctx.beginPath(); ctx.arc(cx + 3, cy + 4 + b, r, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy + b, r * (1.25 + (t * 0.6 % 1) * 0.4), 0, 7); ctx.stroke();
  ctx.fillStyle = C.buoy; ctx.beginPath(); ctx.arc(cx, cy + b, r, 0, 7); ctx.fill();
  ctx.fillStyle = C.rail; ctx.beginPath(); ctx.ellipse(cx, cy + b, r, r * 0.32, 0, 0, 7); ctx.fill();
  ctx.fillStyle = C.buoy; ctx.beginPath(); ctx.arc(cx, cy + b, r * 0.22, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(cx - r * 0.4, cy + b - r * 0.45, r * 0.16, 0, 7); ctx.fill();
}
// ang: heading (0 = bow up); arrow: show a small chevron ahead of the bow (where it goes next)
function drawBoat(ctx, cx, cy, T, t, ang = 0, arrow = false) {
  const L = T * 0.44, W = T * 0.23;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang + Math.sin(t * 1.6 + cx) * 0.05);
  if (arrow) {
    const bob = reduceMotion ? 0 : Math.sin(t * 4) * T * 0.02;
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1.5, T * 0.04); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-T * 0.09, -L - T * 0.02 - bob); ctx.lineTo(0, -L - T * 0.1 - bob); ctx.lineTo(T * 0.09, -L - T * 0.02 - bob); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(4,20,26,.28)';
  ctx.beginPath(); ctx.ellipse(3, 5, W * 1.05, L * 1.02, 0, 0, 7); ctx.fill();
  const hull = () => { ctx.beginPath(); ctx.moveTo(0, -L); ctx.bezierCurveTo(W * 1.1, -L * 0.5, W, L * 0.6, W * 0.85, L); ctx.lineTo(-W * 0.85, L); ctx.bezierCurveTo(-W, L * 0.6, -W * 1.1, -L * 0.5, 0, -L); };
  hull(); ctx.fillStyle = C.rail; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = C.ink; ctx.stroke();
  ctx.save(); hull(); ctx.clip(); ctx.fillStyle = C.buoy; ctx.fillRect(-W * 1.2, L * 0.05, W * 2.4, L * 0.22); ctx.restore();
  ctx.fillStyle = '#28505c'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-W * 0.55, -L * 0.35, W * 1.1, L * 0.36, 3); else ctx.rect(-W * 0.55, -L * 0.35, W * 1.1, L * 0.36); ctx.fill();
  ctx.fillStyle = C['water-hi']; ctx.fillRect(-W * 0.4, -L * 0.3, W * 0.8, L * 0.08);
  ctx.restore();
}
function drawJet(ctx, x, y, T, dir, t, flash = 0) {
  ctx.save();
  const p = T * 0.08;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x + p, y + p, T - p * 2, T - p * 2, T * 0.13);
  else ctx.rect(x + p, y + p, T - p * 2, T - p * 2);
  ctx.fillStyle = C['harbor']; ctx.fill();
  ctx.strokeStyle = flash ? '#fff' : C['water-hi']; ctx.lineWidth = Math.max(1.25, T * 0.035); ctx.stroke();
  ctx.clip();
  ctx.translate(x + T / 2, y + T / 2); ctx.rotate(ANG[dir]);
  ctx.strokeStyle = C['water-hi']; ctx.lineWidth = Math.max(1.5, T * 0.04); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const off = reduceMotion ? 0 : (t * (1.4 + flash * 3) % 1) * T * 0.5;
  for (let k = -2; k <= 1; k++) {
    const px = k * T * 0.5 + off;
    ctx.globalAlpha = 0.22;
    ctx.beginPath(); ctx.moveTo(px - T * 0.12, -T * 0.2); ctx.lineTo(px + T * 0.08, 0); ctx.lineTo(px - T * 0.12, T * 0.2); ctx.stroke();
  }
  // The central arrow never moves or fades: direction must remain readable at every frame.
  ctx.globalAlpha = 1; ctx.fillStyle = C.rail; ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(1, T * 0.025);
  ctx.beginPath(); ctx.moveTo(-T * 0.27, -T * 0.075); ctx.lineTo(T * 0.04, -T * 0.075);
  ctx.lineTo(T * 0.04, -T * 0.23); ctx.lineTo(T * 0.3, 0); ctx.lineTo(T * 0.04, T * 0.23);
  ctx.lineTo(T * 0.04, T * 0.075); ctx.lineTo(-T * 0.27, T * 0.075); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function drawNet(ctx, x, y, T, ghost, t, scale = 1) {
  const p = T * 0.1, s = T - p * 2;
  ctx.save();
  if (scale !== 1) { ctx.translate(x + T / 2, y + T / 2); ctx.scale(scale, scale); ctx.translate(-x - T / 2, -y - T / 2); }
  if (ghost) { ctx.globalAlpha = 0.55 + Math.sin(t * 6) * 0.25; ctx.setLineDash([4, 3]); }
  ctx.fillStyle = 'rgba(236,217,160,.16)'; ctx.fillRect(x + p, y + p, s, s);
  ctx.strokeStyle = ghost ? C.star : C.net; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const k = x + p + (s * i) / 4; ctx.moveTo(k, y + p); ctx.lineTo(k, y + p + s);
    const m = y + p + (s * i) / 4; ctx.moveTo(x + p, m); ctx.lineTo(x + p + s, m);
  }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = ghost ? C.star : C.buoy;
  for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { ctx.beginPath(); ctx.arc(x + p + a * s, y + p + b * s, T * 0.055, 0, 7); ctx.fill(); }
  ctx.restore();
}
function drawPerson(ctx, px, py, T, seed) {
  const r = T * 0.075;
  ctx.fillStyle = SHIRTS[Math.floor(seed * SHIRTS.length)];
  ctx.beginPath(); ctx.ellipse(px, py, r * 1.6, r * 1.05, 0, 0, 7); ctx.fill();
  ctx.fillStyle = seed > 0.8 ? '#c9a27a' : '#2a2320';
  ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
  if (seed > 0.45) { ctx.fillStyle = '#e9fbff'; ctx.fillRect(px + r * 0.6, py - r * 1.6, r * 0.8, r * 1.1); }
}
function drawExit(ctx, x, y, T, g, gx, gy, t) {
  const grad = ctx.createLinearGradient(x, y, x, y + T);
  grad.addColorStop(0, C.sea); grad.addColorStop(1, C.water);
  ctx.fillStyle = grad; ctx.fillRect(x, y, T, T);
  let dir = 'U';
  if (gy !== 0) { if (gy === g.h - 1) dir = 'D'; else if (gx === 0) dir = 'L'; else dir = 'R'; }
  ctx.save(); ctx.translate(x + T / 2, y + T / 2); ctx.rotate(ANG[dir]);
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(2, T * 0.06); ctx.lineCap = 'round';
  const bob = reduceMotion ? 0 : Math.sin(t * 3) * T * 0.06;
  for (const k of [-0.12, 0.1]) { ctx.beginPath(); ctx.moveTo(k * T + bob - T * 0.08, -T * 0.16); ctx.lineTo(k * T + bob + T * 0.08, 0); ctx.lineTo(k * T + bob - T * 0.08, T * 0.16); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = `700 ${Math.round(T * 0.2)}px ${css.getPropertyValue('--font-body')}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('바다', x + T / 2, dir === 'U' ? y + T * 0.8 : y + T * 0.2);
}
// sandbar: a low mound of sand in the water, with a foam line where the water laps it
function drawSand(ctx, x, y, T, seed) {
  const cx = x + T / 2, cy = y + T / 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(1.5, T * 0.04);
  ctx.beginPath(); ctx.ellipse(cx, cy + T * 0.02, T * 0.44, T * 0.38, 0, 0, 7); ctx.stroke();
  ctx.fillStyle = '#cdb27a';
  ctx.beginPath(); ctx.ellipse(cx, cy + T * 0.02, T * 0.4, T * 0.34, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#e3cd96';
  ctx.beginPath(); ctx.ellipse(cx - T * 0.05, cy - T * 0.04, T * 0.3, T * 0.22, -0.3, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(120,90,50,.45)';
  for (let k = 0; k < 6; k++) {
    const a = hash(seed * 13 + k * 7) * Math.PI * 2, r = T * 0.08 + hash(seed + k * 3) * T * 0.2;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, T * 0.022, 0, 7); ctx.fill();
  }
  ctx.restore();
}
// whirlpool: dark eye with three turning spiral arms; `flash` brightens it right after a jump
function drawWhirl(ctx, cx, cy, T, t, flash = 0) {
  const r = T * 0.46;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, `rgba(4,22,30,${0.8 - flash * 0.3})`); grad.addColorStop(1, 'rgba(4,22,30,0)');
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(reduceMotion ? 0.6 : t * (2.4 + flash * 6));
  ctx.strokeStyle = flash ? '#ffffff' : C['water-hi']; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.5, T * 0.05);
  for (let k = 0; k < 3; k++) {
    ctx.rotate(Math.PI * 2 / 3); ctx.globalAlpha = 0.8; ctx.beginPath();
    for (let a = 0; a <= 1.001; a += 0.1) { const ang = a * 2.6, rr = r * (0.12 + a * 0.8); a ? ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr) : ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr); }
    ctx.stroke();
  }
  ctx.restore(); ctx.globalAlpha = 1;
}
// tileable light pattern for the water surface (computed once)
const caustic = (() => {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), img = x.createImageData(S, S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S * Math.PI * 2, v = j / S * Math.PI * 2;
    const a = Math.sin(u * 2 + Math.sin(v * 3) * 1.3) + Math.sin(v * 2 + Math.sin(u * 3) * 1.1) + 0.6 * Math.sin((u + v) * 2 + Math.sin(u - v));
    const o = (j * S + i) * 4;
    img.data[o] = 220; img.data[o + 1] = 255; img.data[o + 2] = 250;
    img.data[o + 3] = Math.round(Math.pow(Math.max(0, 1 - Math.abs(a) * 0.9), 4) * 255);
  }
  x.putImageData(img, 0, 0); return c;
})();

/* ---------- level state ---------- */
let LVL = 0, g = null, st = null, anim = null, bump = null, hint = null, cleared = false;
let hintRequest = 0;
let T = 40, staticLayer = null, dpr = 1, waterPath = null, causticPat = null;
const particles = [], wake = [];
const view = { x: 0, y: 0, ang: 0, target: 0 };
let settle = null, pop = null, queued = null, clock = 0;
let coach = null;   // first-play finger hint: { kind: 'swipe', dir } or { kind: 'tap', x, y }
const netPop = new Map(), jetFlash = new Map();
let hudLast = { moves: -1, fish: -1 };
// DAILY = {date, stage, version, tier, level}; legacy makeDaily has no stage/version. Null in story mode.
let DAILY = null, deco = 0;   // deco: seed for onlookers/trees so each canal gets its own crowd
const curLevel = () => DAILY ? DAILY.level : LEVELS[LVL];

function freshState(level) {
  g = parseLevel(level);
  return { pos: g.start.slice(), dir: 'U', fish: [], nets: [], boats: g.boats.map(b => b.slice()), moves: 0, history: [] };
}
function netSet() { return new Set(st.nets); }
function fishMask() { let m = 0; st.fish.forEach(i => m |= 1 << i); return m; }

// Resume only matching layouts and complete, structurally valid turns. Effects and pending input are not saved.
function levelSignature(level) { return JSON.stringify([level.map, level.nets || 0]); }
function copyTurn(s) {
  return { pos: s.pos.slice(), dir: s.dir, fish: s.fish.slice(), nets: s.nets.slice(), boats: s.boats.map(b => b.slice()), moves: s.moves };
}
function restoreSession(record, level, id) {
  if (!record || record.version !== 1 || record.id !== id || record.layout !== levelSignature(level)) return null;
  const grid = parseLevel(level), s = record.state;
  const ints = (a, limit) => Array.isArray(a) && a.length <= limit && new Set(a).size === a.length && a.every(i => Number.isInteger(i) && i >= 0);
  const valid = v => {
    if (!v || !Array.isArray(v.pos) || v.pos.length !== 2 || !v.pos.every(Number.isInteger) || !['U', 'D', 'L', 'R'].includes(v.dir)
      || !Number.isSafeInteger(v.moves) || v.moves < 0 || !ints(v.fish, grid.fish.length) || v.fish.some(i => i >= grid.fish.length)
      || !ints(v.nets, grid.nets) || !Array.isArray(v.boats) || v.boats.length !== grid.boats.length) return false;
    const [x, y] = v.pos, index = y * grid.w + x;
    const open = i => Number.isInteger(i) && i >= 0 && i < grid.cells.length && !['#', 'o', 'E'].includes(grid.cells[i]);
    if (x < 0 || x >= grid.w || y < 0 || y >= grid.h || !open(index)) return false;
    if (v.boats.some((b, k) => !Array.isArray(b) || b.length !== 2 || !open(b[0]) || b[0] === index
      || !(grid.boats[k][1] === 'R' ? ['R', 'L'] : ['D', 'U']).includes(b[1]))) return false;
    if (new Set(v.boats.map(b => b[0])).size !== v.boats.length) return false;
    return v.nets.every(i => grid.cells[i] === '.' && i !== index && !v.boats.some(b => b[0] === i)
      && !grid.fish.some((f, k) => f[1] * grid.w + f[0] === i && !v.fish.includes(k)));
  };
  if (!valid(s) || !Array.isArray(s.history) || s.history.length > 200 || s.history.some(h => !valid(h) || h.moves > s.moves)) return null;
  return Object.assign(copyTurn(s), { history: s.history.map(copyTurn) });
}
function storySession(i = save.sessions.story?.id) {
  return Number.isInteger(i) && LEVELS[i] && unlocked(i) ? restoreSession(save.sessions.story, LEVELS[i], i) : null;
}
function dailySessionKey(daily) { return Number.isInteger(daily.stage) ? 'daily' : 'dailyLegacy'; }
function dailySessionRecord(daily) {
  const record = save.sessions.dailyStages?.[daily.stage];
  return record?.id === dailyStageId(daily) ? record : save.sessions[dailySessionKey(daily)];
}
function dailySession(daily) { return daily ? restoreSession(dailySessionRecord(daily), daily.level, dailyStageId(daily)) : null; }
function checkpoint() {
  if (!st || cleared || (anim && anim.win)) return;
  const state = Object.assign(copyTurn(st), { history: st.history.map(copyTurn) });
  // Position and boats commit at swipe time; include ALL fish on that path, even before their visual effects finish.
  if (anim) state.fish = [...new Set([...state.fish, ...anim.eats.map(e => e.fi)])];
  save.sessions[DAILY ? dailySessionKey(DAILY) : 'story'] = { version: 1, id: DAILY ? dailyStageId(DAILY) : LVL, layout: levelSignature(curLevel()), state };
  if (DAILY && Number.isInteger(DAILY.stage)) {
    if (!save.sessions.dailyStages) save.sessions.dailyStages = {};
    save.sessions.dailyStages[DAILY.stage] = save.sessions.daily;
  }
  persist();
}
function pauseGame() {
  if ($('gameScreen').hidden || !st) return;
  queued = null; gest = null;
  if (anim) finishAnim();
  checkpoint();
}

// effects live in tile units; x, y are tile coordinates of the cell's top-left
const ring = (x, y, size = 1, alpha = 0.55) => particles.push({ kind: 'ring', x, y, life: 1, size, alpha });
function splashAt(x, y, n, dir, force = 1) {
  if (reduceMotion) return;
  for (let k = 0; k < n; k++) {
    const a = dir ? ANG[dir] + (Math.random() - 0.5) * 2.2 : Math.random() * Math.PI * 2, sp = (1.5 + Math.random() * 3) * force;
    particles.push({ kind: 'drop', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, size: 0.035 + Math.random() * 0.04 });
  }
}

function loadLevel(i, keep) {
  DAILY = null; LVL = i; save.last = i; deco = i;
  const role = LEVEL_ROLES[LEVELS[i].role || 'regular'];
  enter(LEVELS[i], keep, `${chapterOf(i).ci + 1}장 · 수로 ${i + 1} / ${LEVELS.length} · ${role.label}`);
}
function loadDaily(daily, keep) {
  DAILY = daily; deco = dailySeed(dailyStageId(daily)) % 997;
  const label = Number.isInteger(daily.stage) ? `${+daily.date.slice(5, 7)}/${+daily.date.slice(8)} 구조작전 · ${daily.stage + 1} / 3 · ${daily.tier.label}` : '이전 수로 · 진행 이어하기';
  enter(daily.level, keep, label);
}
const replay = () => DAILY ? loadDaily(DAILY) : loadLevel(LVL);
function enter(level, keep, label) {
  hintRequest++;
  st = keep || freshState(level);
  if (keep) { g = parseLevel(level); if (!st.boats) st.boats = g.boats.map(b => b.slice()); }
  anim = null; bump = null; hint = null; cleared = false; particles.length = 0; wake.length = 0;
  settle = null; pop = { t: 0 }; queued = null; netPop.clear(); jetFlash.clear();
  view.x = st.pos[0]; view.y = st.pos[1]; view.ang = view.target = ANG[st.dir];
  $('lvNum').textContent = label;
  $('lvName').textContent = level.name;
  setTip(level.tip);
  $('clearOverlay').hidden = true;
  hudLast = { moves: -1, fish: -1 };
  resize(); updateHud(); updateHintButton();
  frameEl.classList.remove('enter'); void frameEl.offsetWidth; frameEl.classList.add('enter');
  ring(st.pos[0], st.pos[1], 0.9, 0.4);
  setupCoach();
  checkpoint();
  showDeviceGuide(true);
}
// shown once: a finger swiping the first move of 수로 1, and a finger tapping the net tile on the first net level
function setupCoach() {
  coach = null;
  if (!DAILY && LVL === 0 && !save.coachSwipe && !st.moves && !st.history.length) {
    const p = plan(g, st.pos, 0, new Set(), 0, true);
    if (p) coach = { kind: 'swipe', dir: p.seq[0] };
  } else if (g.nets && !save.coachNet) {
    const p = plan(g, st.pos, fishMask(), netSet(), g.nets - st.nets.length, true, st.boats);
    if (p && p.add.length) coach = { kind: 'tap', x: p.add[0] % g.w, y: Math.floor(p.add[0] / g.w) };
  }
}
function coachDone(kind) {
  if (!coach || coach.kind !== kind) return;
  coach = null;
  if (kind === 'swipe') save.coachSwipe = true; else save.coachNet = true;
  persist();
}
function setTip(text, isHint) {
  const el = $('tip'); el.textContent = text; el.classList.toggle('hint', !!isHint);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}
function updateHud() {
  const L = curLevel(), parts = [];
  const done = g.fish.length && st.fish.length === g.fish.length;
  const icon = g.fish.length ? '<path d="M18 12c-3-6-9-6-12 0 3 6 9 6 12 0z"/><path d="M6 12l-4-4v8z"/><path d="M15 11h.01"/>' : '<path d="M5 12h14M13 6l6 6-6 6"/>';
  parts.push(`<span class="chip goal${done ? ' done' : ''}" aria-label="${g.fish.length ? `숭어 수집 ${st.fish.length} / ${g.fish.length}${done ? ', 수집 완료' : ''}` : '목표: 바다로 탈출'}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span class="hud-stack"><span class="k">${g.fish.length ? done ? '숭어 완료' : '숭어 모으기' : '목표'}</span><b>${g.fish.length ? `${st.fish.length} / ${g.fish.length}` : '바다로 탈출'}</b></span></span>`);
  parts.push(`<span class="chip move${st.moves > L.par ? ' over' : ''}"><span class="hud-stack"><span class="count">이동 <b>${st.moves}</b></span><span class="k">기준 ${L.par}회</span></span></span>`);
  if (g.nets) parts.push(`<span class="chip net"><span class="hud-stack"><span class="k">남은 그물</span><b>${g.nets - st.nets.length}</b></span></span>`);
  $('stats').innerHTML = parts.join('');
  if (hudLast.moves >= 0 && st.moves !== hudLast.moves) $('stats').querySelector('.move b').classList.add('bump');
  if (g.fish.length && hudLast.fish >= 0 && st.fish.length !== hudLast.fish) $('stats').querySelector('.goal b').classList.add('bump');
  hudLast = { moves: st.moves, fish: st.fish.length };
  $('undoBtn').disabled = !st.history.length;
}
function pushHistory() {
  st.history.push({ pos: st.pos.slice(), dir: st.dir, fish: st.fish.slice(), nets: st.nets.slice(), boats: st.boats.map(b => b.slice()), moves: st.moves });
  if (st.history.length > 200) st.history.shift();
}

// The result is committed at once; the screen follows through `anim`. A swipe during the glide is queued (one deep).
function tryMove(d) {
  if (cleared) return;
  if (anim) { queued = d; return; }
  hintRequest++;
  const r = slide(g, st.pos, d, netSet(), st.boats);
  hint = null; if ($('tip').classList.contains('hint')) setTip(curLevel().tip);
  if (!r.path.length) {
    bump = { d, t: 0 }; view.target = ANG[d]; settle = null; queued = null;
    sfx.bump();
    const [dx, dy] = DIRS[d]; splashAt(st.pos[0] + dx * 0.45, st.pos[1] + dy * 0.45, 5, d, 0.6);
    return;
  }
  pushHistory();
  const fishIdx = new Map(g.fish.map((f, i) => [f[1] * g.w + f[0], i]));
  const eats = [], jets = [];
  r.path.forEach(([x, y], k) => {
    const fi = fishIdx.get(y * g.w + x);
    if (fi != null && !st.fish.includes(fi) && !eats.some(e => e.fi === fi)) eats.push({ fi, k: k + 1 });
    if (JET[cellAt(g, x, y)]) jets.push({ k: k + 1, x, y, done: false });
  });
  const pts = [st.pos.slice(), ...r.path.map(p => [p[0], p[1]])];
  const warps = new Set(); r.path.forEach((p, k) => { if (p[3]) warps.add(k + 1); });   // pts index reached by a jump
  const dirs = [d, ...r.path.map(p => p[2])];
  if (r.win) { const last = r.path[r.path.length - 1]; const [dx, dy] = DIRS[last[2]]; for (let k = 1; k <= 3; k++) { pts.push([last[0] + dx * k, last[1] + dy * k]); dirs.push(last[2]); } }
  const steps = r.path.length;
  st.moves++; st.pos = r.end.slice(); st.dir = r.path[steps - 1][2];
  const boatsFrom = st.boats;
  if (!r.win) st.boats = stepBoats(g, st.boats, r.end[1] * g.w + r.end[0], netSet());
  // Show the same turn order as the engine: shark swims, then boats move. Input stays queued until both finish.
  const boatDur = !reduceMotion && !r.win && boatsFrom.some((b, k) => b[0] !== st.boats[k][0] || b[1] !== st.boats[k][1]) ? 0.16 : 0;
  anim = { boatsFrom, boatDur, pts, dirs, p: 0, t: 0, n: pts.length - 1, steps, speed: 0, eats, jets, win: r.win, eaten: new Set(), exitFx: false, warps, warpDone: new Set(), warpScale: 1,
    dur: Math.min(0.62, 0.09 + 0.052 * steps) + (r.win ? 0.3 : 0) };
  settle = null; pop = null;
  ring(pts[0][0], pts[0][1], 0.7, 0.35);
  sfx.move(); haptic('tick'); updateHud(); coachDone('swipe'); checkpoint();
}
function eatFish(fi) {
  anim.eaten.add(fi); sfx.eat(); haptic('light');
  if (!st.fish.includes(fi)) st.fish.push(fi);
  const [fx, fy] = g.fish[fi];
  particles.push({ kind: 'fish', x: fx, y: fy, fi, life: 1 });
  particles.push({ kind: 'text', x: fx, y: fy, vx: 0, vy: -1.3, life: 1 });
  ring(fx, fy, 0.9, 0.5);
  if (!reduceMotion) for (let s = 0; s < 7; s++) { const a = s / 7 * Math.PI * 2 + Math.random() * 0.4; particles.push({ kind: 'spark', x: fx, y: fy, vx: Math.cos(a) * 2.4, vy: Math.sin(a) * 2.4, life: 1, rot: Math.random() * 6 }); }
  updateHud();
}
function finishAnim() {
  const a = anim; anim = null;
  const last = a.pts[a.win ? a.n : a.steps]; view.x = last[0]; view.y = last[1];
  a.eats.forEach(e => { if (!st.fish.includes(e.fi)) st.fish.push(e.fi); });
  updateHud();
  if (a.win) { onClear(); return; }
  if (g.nets && !save.coachNet && !queued) setupCoach();
  if (cellAt(g, view.x, view.y) === 's') {
    settle = { t: 0, d: a.dirs[a.steps], amp: 0.35 }; ring(view.x, view.y, 0.8, 0.45); sfx.sand(); haptic('light');
    if (!reduceMotion) for (let k = 0; k < 10; k++) { const an = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2; particles.push({ kind: 'grain', x: view.x, y: view.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: 1, size: 0.03 + Math.random() * 0.03 }); }
    if (queued) { const q = queued; queued = null; tryMove(q); }
    return;
  }
  const d = a.dirs[a.steps], amp = Math.min(1, a.steps / 5), [dx, dy] = DIRS[d];
  settle = { t: 0, d, amp };
  ring(view.x + dx * 0.3, view.y + dy * 0.3, 0.6 + 0.5 * amp, 0.5);
  splashAt(view.x + dx * 0.45, view.y + dy * 0.45, 4 + Math.round(6 * amp), d, 0.5 + amp * 0.7);
  sfx.stop(amp);
  if (queued) { const q = queued; queued = null; tryMove(q); }
}
function undo() {
  if (anim || !st.history.length) return;
  hintRequest++;
  const h = st.history.pop();
  Object.assign(st, { pos: h.pos, dir: h.dir, fish: h.fish, nets: h.nets, boats: h.boats || st.boats, moves: h.moves });
  view.x = st.pos[0]; view.y = st.pos[1]; view.target = ANG[st.dir];
  cleared = false; hint = null; settle = null; queued = null; wake.length = 0; pop = { t: 0 };
  ring(view.x, view.y, 0.8, 0.45); sfx.undo(); haptic('tick');
  setTip(curLevel().tip); updateHud(); checkpoint();
}
function restart() { if (anim) return; replay(); haptic('light'); }

function tapTile(gx, gy) {
  if (anim || cleared) return;
  if (!g.nets) { setTip('화면을 밀어서 상어를 움직여요. 방향키도 돼요.'); return; }
  const idx = gy * g.w + gx, c = cellAt(g, gx, gy);
  const hasFish = g.fish.some((f, i) => f[0] === gx && f[1] === gy && !st.fish.includes(i)) || st.boats.some(b => b[0] === idx);
  const at = st.nets.indexOf(idx);
  if (at >= 0) {
    hintRequest++; pushHistory(); st.nets.splice(at, 1); netPop.delete(idx);
    sfx.net(); haptic('tick'); ring(gx, gy, 0.6, 0.35); updateHud(); checkpoint();
    if (hint) refreshHint(); else setTip(curLevel().tip);
    return;
  }
  if (c !== '.' || hasFish || (gx === st.pos[0] && gy === st.pos[1])) { setTip('그물은 비어 있는 물 위에만 칠 수 있어요.'); haptic('light'); return; }
  if (st.nets.length >= g.nets) { setTip('그물을 다 썼어요. 쳐 둔 그물을 누르면 다시 걷을 수 있어요.'); haptic('light'); return; }
  hintRequest++; pushHistory(); st.nets.push(idx); netPop.set(idx, clock); sfx.net(); haptic('medium'); coachDone('tap');
  ring(gx, gy, 0.9, 0.5); splashAt(gx, gy, 6, null, 0.5);
  updateHud(); checkpoint();
  if (hint) refreshHint(); else setTip(curLevel().tip);
}

/* ---------- hint allowance (separate from undoable turns and star rewards) ---------- */
const HINT_INSTANT = 2, HINT_COOLDOWN_MS = 12000;
let hintSearching = 0;
function hintUsageRecord() {
  const key = DAILY ? 'daily:' + dailyStageId(DAILY) : 'story:' + LVL;
  const record = save.hintUsage[key];
  return record && Number.isSafeInteger(record.count) && record.count >= 0
    && Number.isSafeInteger(record.lastUsed) && record.lastUsed >= 0 ? record : { count: 0, lastUsed: 0 };
}
function hintWait(now = Date.now()) {
  const record = hintUsageRecord();
  if (record.count < HINT_INSTANT || record.lastUsed > now) return 0;
  return Math.ceil(Math.max(0, record.lastUsed + HINT_COOLDOWN_MS - now) / 1000);
}
function recordHintUse() {
  const key = DAILY ? 'daily:' + dailyStageId(DAILY) : 'story:' + LVL, record = hintUsageRecord();
  save.hintUsage[key] = { count: Math.min(Number.MAX_SAFE_INTEGER, record.count + 1), lastUsed: Date.now() };
  const keys = Object.keys(save.hintUsage).filter(k => k.startsWith('daily:'));
  const days = [...new Set(keys.map(k => k.slice(6, 16)))].sort();
  const expired = new Set(days.slice(0, Math.max(0, days.length - 120)));
  keys.filter(k => expired.has(k.slice(6, 16))).forEach(k => delete save.hintUsage[k]);
  persist();
}
function updateHintButton() {
  if (!st) return;
  const button = $('hintBtn'), label = $('hintStatus'), record = hintUsageRecord();
  const waiting = hint ? 0 : hintWait(), searching = hintSearching !== 0 && hintSearching === hintRequest;
  const text = searching ? '찾는 중' : hint ? '다시 보기' : waiting ? `${waiting}초 후`
    : record.count < HINT_INSTANT ? `바로 ${HINT_INSTANT - record.count}회` : '사용 가능';
  if (label.textContent !== text) label.textContent = text;
  button.disabled = !!(anim || cleared || searching || waiting);
}

// Keep the same next-move recipe while the player performs its free net edits. Replanning after
// each tap could choose a different equally short solution and send the player back and forth.
function refreshHint() {
  hint.remove = st.nets.filter(i => !hint.target.includes(i));
  hint.nets = hint.target.filter(i => !st.nets.includes(i));
  const action = hint.remove.length ? '반짝이는 그물을 눌러 걷어요.'
    : hint.nets.length ? '반짝이는 칸에 그물을 쳐요.' : `${DIR_KO[hint.dir]} 밀어 보세요.`;
  const more = hint.partial ? ' 숭어를 모두 먹으려면 되돌리기가 필요해요.' : ` 앞으로 ${hint.moves}번이면 나가요.`;
  setTip(`힌트: ${action}${more}`, true);
  updateHintButton();
}
async function showHint() {
  if (anim || cleared || $('gameScreen').hidden || settingsOpen() || guideOpen()) return;
  if (hint) { haptic('tick'); refreshHint(); return; }
  if (hintSearching !== 0 && hintSearching === hintRequest) return;
  const waiting = hintWait();
  if (waiting) { setTip(`힌트는 ${waiting}초 후에 다시 볼 수 있어요.`, true); updateHintButton(); return; }
  const request = ++hintRequest, state = st, map = g;
  hintSearching = request;
  const current = () => request === hintRequest && st === state && g === map && !anim && !cleared
    && !$('gameScreen').hidden && !settingsOpen() && !guideOpen();
  haptic('tick');
  setTip('길을 찾는 중…', true);
  updateHintButton();
  try {
    await new Promise(resolve => setTimeout(resolve, 30));
    if (!current()) return;
    const ns = netSet(), left = g.nets - st.nets.length;
    const find = async needAll => {
      const search = planSearch(g, st.pos, fishMask(), ns, left, needAll, st.boats);
      while (current()) {
        const step = search.next();
        if (step.done) return step.value;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      return undefined; // cancelled; null means the complete search found no route
    };
    let p = await find(true), partial = false;
    if (p === null) { p = await find(false); partial = true; }
    if (!current() || p === undefined) return;
    if (!p) { hint = null; setTip('여기서는 나갈 길이 없어요. 되돌리기를 눌러 보세요.', true); return; }
    hint = { dir: p.seq[0], target: p.steps[0].nets, moves: p.moves, partial };
    recordHintUse();
    refreshHint();
  } finally {
    if (hintSearching === request) hintSearching = 0;
    updateHintButton();
  }
}

function onClear() {
  const previousRewards = new Set(earnedJournalRewards().map(r => r.id));
  cleared = true;
  delete save.sessions[DAILY ? dailySessionKey(DAILY) : 'story'];
  if (DAILY && Number.isInteger(DAILY.stage)) delete save.sessions.dailyStages[DAILY.stage];
  const L = curLevel();
  const allFish = st.fish.length === g.fish.length, inPar = st.moves <= L.par;
  const stars = starsForClear(allFish, inPar);
  const earned = [true, stars >= 2, stars === 3];
  if (DAILY) recordDailyStage(DAILY, stars);
  else { save.best[LVL] = Math.max(save.best[LVL] || 0, stars); persist(); }
  const freshSkins = refreshSkins();
  const freshBadges = earnedJournalRewards().filter(r => !r.skin && !previousRewards.has(r.id));
  sfx.win();
  const starSvg = on => `<svg class="star${on ? ' on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>`;
  $('clearStars').innerHTML = earned.map(starSvg).join('');
  $('clearStars').setAttribute('aria-label', `별 ${stars}개`);
  const titles = ['바다로 나갔어요!', '시원하게 탈출!', '상어야, 잘 가!'];
  const chap = chapterOf(LVL), chapterEnd = !DAILY && LVL === chap.end, last = !DAILY && LVL === LEVELS.length - 1;
  const operation = DAILY && Number.isInteger(DAILY.stage), progress = DAILY && dailyProgress(DAILY.date);
  $('clearTitle').classList.toggle('operation-title', !!operation);
  $('clearTitle').textContent = DAILY ? (operation ? (progress.count === 3 ? '오늘의 구조작전 완료!' : `${DAILY.stage + 1}번째 수로 통과!`) : '이전 수로 완료!')
    : last ? '드디어 넓은 바다로!' : chapterEnd ? `${chap.name} 통과!` : titles[stars - 1];
  const row = (label, val, ok) => `<li><span>${label}</span><span class="${ok ? 'ok' : 'no'}">${val}</span></li>`;
  $('clearChecks').innerHTML =
    row('바다로 탈출', '성공', true) +
    row('숭어 모두 먹기', g.fish.length ? `${st.fish.length} / ${g.fish.length}` : '숭어 없음', allFish) +
    row('숭어 + 이동 기준', `${st.moves}번 / ${L.par}번${allFish ? '' : ' · 숭어 필요'}`, stars === 3) +
    (operation ? row('오늘의 작전', `${progress.count} / 3 수로 완료`, true) : '') +
    (DAILY ? row('연속 도전', `${dailyStreak()}일째`, true) : '') +
    (DAILY ? row('누적 기록', `참여 ${journalTotals().visits}일 · 작전 완료 ${journalTotals().operations}일`, true) : '') +
    (freshBadges.length ? row('새 기념 배지', freshBadges.map(r => r.name).join(', '), true) : '') +
    (freshSkins.length ? `<li><span>새 상어가 열렸어요</span><span class="new">${freshSkins.map(k => k.name).join(', ')}</span></li>` : '');
  $('operationStamp').hidden = !operation || progress.count !== 3;
  $('nextBtn').textContent = DAILY ? (DAILY.date !== dailyDate() ? '오늘의 작전' : operation && progress.count < 3 ? '다음 수로' : '작전 보기')
    : last ? '수로 목록' : chapterEnd ? '다음 장으로' : '다음 수로';
  setTimeout(() => {
    if (!cleared) return;
    $('clearOverlay').hidden = false; $('nextBtn').focus({ preventScroll: true });
    earned.forEach((on, k) => { if (on) setTimeout(() => haptic('light'), 180 + k * 120); });
    if (freshSkins.length) setTimeout(() => haptic('success'), 600);
  }, reduceMotion ? 50 : 650);
  renderLevelGrid();
}

/* ---------- daily canal: record, streak, title card ---------- */
const WEEKDAY_KO = '일월화수목금토';
function dateLabel(date) {
  const [y, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일 ${WEEKDAY_KO[new Date(y, m - 1, d).getDay()]}요일`;
}
function recordDaily(date, stars) {
  recordJournal(date);
  const done = Object.assign({}, save.daily);
  done[date] = Math.max(done[date] || 0, stars);
  const keys = Object.keys(done).sort();
  keys.slice(0, Math.max(0, keys.length - 120)).forEach(k => delete done[k]);   // keep ~4 months
  save.daily = done; persist();
}
function dailyProgress(date) {
  const record = save.dailyOps[date];
  const stars = DAILY_STAGES.map((_, i) => record?.version === DAILY_OPERATION_VERSION && Number.isInteger(record.stars?.[i])
    ? Math.max(0, Math.min(3, record.stars[i])) : 0);
  return { stars, count: stars.filter(Boolean).length, next: stars.findIndex(n => !n), total: stars.reduce((a, b) => a + b, 0) };
}
function recordDailyStage(daily, stars) {
  if (!journalDateValid(daily.date) || !Number.isInteger(stars) || stars < 1 || stars > 3) return;
  if (Number.isInteger(daily.stage) && daily.version === DAILY_OPERATION_VERSION && DAILY_STAGES[daily.stage]) {
    const progress = dailyProgress(daily.date);
    progress.stars[daily.stage] = Math.max(progress.stars[daily.stage], stars);
    save.dailyOps[daily.date] = { version: DAILY_OPERATION_VERSION, stars: progress.stars };
    recordJournal(daily.date, progress.stars.every(n => n > 0));
    const days = Object.keys(save.dailyOps).sort();
    days.slice(0, Math.max(0, days.length - 120)).forEach(k => delete save.dailyOps[k]);
  }
  recordDaily(daily.date, stars); // One clear still counts as attendance; never adds to story stars.
}
// consecutive days cleared, counting back from today (or from yesterday if today is not done yet)
function dailyStreak() {
  const done = save.daily || {}, d = new Date();
  if (!done[dailyDate(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (done[dailyDate(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
let dailyRequest = 0, dailyCacheDate = '', shownDailyDate = '', dailyCache = new Map(), legacyDaily = null;
const dailyOpen = () => !$('dailyOverlay').hidden;
function savedDailyStage(date) {
  const id = save.sessions.daily?.id;
  const active = DAILY_STAGES.findIndex((_, stage) => id === dailyStageId({ date, stage, version: DAILY_OPERATION_VERSION }));
  return active >= 0 ? active : DAILY_STAGES.findIndex((_, stage) => save.sessions.dailyStages[stage]?.id === dailyStageId({ date, stage, version: DAILY_OPERATION_VERSION }));
}
function renderDaily() {
  const date = dailyDate(), progress = dailyProgress(date), streak = dailyStreak();
  for (const key of ['daily', 'dailyLegacy']) {
    if (save.sessions[key] && String(save.sessions[key].id).slice(0, 10) !== date) { delete save.sessions[key]; persist(); }
  }
  for (const [key, record] of Object.entries(save.sessions.dailyStages)) {
    if (!record || String(record.id).slice(0, 10) !== date) { delete save.sessions.dailyStages[key]; persist(); }
  }
  $('dailyDate').textContent = dateLabel(date);
  $('dailyMeta').textContent = '쉬움 → 보통 → 도전' + (streak ? ` · 연속 ${streak}일` : '');
  $('dailyState').innerHTML = `<b>${progress.count} / 3</b><span>${progress.count === 3 ? '완료' : savedDailyStage(date) >= 0 || progress.count ? '이어서' : '도전'}</span>`;
  $('dailyBtn').classList.toggle('done', progress.count === 3);
  $('dailyBtn').setAttribute('aria-label', `오늘의 구조작전, ${dateLabel(date)}, ${progress.count} / 3 수로 완료`);
  const totals = journalTotals();
  $('journalSummary').textContent = `참여 ${totals.visits}일 · 작전 완료 ${totals.operations}일`;
}
function renderOperation() {
  const date = dailyDate(), progress = dailyProgress(date);
  shownDailyDate = date;
  $('operationDate').textContent = `${dateLabel(date)} · ${progress.count} / 3 완료 · ★ ${progress.total} / 9`;
  $('operationNote').textContent = progress.count === 3 ? '오늘의 작전을 마쳤어요! 별을 더 모으거나 내일 새 수로에 도전해요.'
    : save.daily[date] ? (progress.count ? '오늘 참여가 인정됐어요. 나머지 수로도 이어서 도전해요.' : '이전 수로의 참여 기록은 유지돼요. 새 작전에도 도전해 보세요.')
    : '한 수로만 완료해도 연속 기록이 이어져요.';
  $('dailyStages').innerHTML = DAILY_STAGES.map((tier, stage) => {
    const locked = progress.stars.slice(0, stage).some(n => !n), stars = progress.stars[stage];
    const id = { date, stage, version: DAILY_OPERATION_VERSION }, packet = dailySessionRecord(id);
    const resume = packet?.id === dailyStageId(id), moves = packet?.state?.moves;
    const state = resume && Number.isSafeInteger(moves) ? `${moves}회 진행 · 이어하기` : stars ? `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} · 다시 도전`
      : locked ? '앞 수로를 완료하면 열려요' : '시작하기';
    return `<button class="daily-stage${stars ? ' done' : ''}" type="button" data-stage="${stage}" ${locked ? 'disabled' : ''}>
      <span class="stage-number">${stage + 1}</span><span class="stage-copy"><b>${tier.name} <small>${tier.label}</small></b><span>${state}</span></span></button>`;
  }).join('');
  $('dailyLegacyBtn').hidden = !save.sessions.dailyLegacy;
  $('dailyLegacyBtn').disabled = false;
  $('operationStatus').textContent = '';
}
function openDaily() {
  if (!$('gameScreen').hidden) show('title');
  dailyRequest++;
  renderDaily(); renderOperation();
  $('app').inert = true; $('dailyOverlay').hidden = false;
  $('dailyDone').focus({ preventScroll: true });
}
function closeDaily() {
  dailyRequest++;
  $('dailyOverlay').hidden = true; $('app').inert = false;
  $('dailyBtn').focus({ preventScroll: true });
}
async function startDaily(stage) {
  const date = dailyDate(), progress = dailyProgress(date);
  if (date !== shownDailyDate) { renderDaily(); renderOperation(); $('operationStatus').textContent = '날짜가 바뀌어 새 작전이 열렸어요.'; return; }
  if (!DAILY_STAGES[stage] || progress.stars.slice(0, stage).some(n => !n)) return;
  const request = ++dailyRequest;
  $('dailyStages').querySelectorAll('button').forEach(b => { b.disabled = true; });
  $('dailyLegacyBtn').disabled = true;
  $('operationStatus').textContent = '수로를 준비하고 있어요…';
  try {
    await new Promise(resolve => setTimeout(resolve, 0));
    if (request !== dailyRequest) return;
    if (dailyCacheDate !== date) { dailyCacheDate = date; dailyCache = new Map(); }
    let daily = dailyCache.get(stage);
    if (!daily) {
      const search = makeDailyStageSearch(date, stage);
      let step;
      do {
        if (request !== dailyRequest) return;
        const deadline = performance.now() + 8;
        do { step = search.next(); } while (!step.done && performance.now() < deadline);
        if (!step.done) await new Promise(resolve => setTimeout(resolve, 0));
      } while (!step.done);
      daily = step.value;
      if (daily) dailyCache.set(stage, daily);
    }
    if (request !== dailyRequest) return;
    if (date !== dailyDate()) { renderDaily(); renderOperation(); $('operationStatus').textContent = '날짜가 바뀌어 새 작전이 열렸어요.'; return; }
    if (!daily) throw new Error('daily generation failed');
    const keep = dailySession(daily);
    closeDaily(); show('game'); loadDaily(daily, keep);
  } catch (e) {
    if (request === dailyRequest) { renderOperation(); $('operationStatus').textContent = '수로를 준비하지 못했어요. 잠시 후 다시 눌러 주세요.'; }
  } finally { if (request === dailyRequest || !dailyOpen()) $('dailyLegacyBtn').disabled = false; }
}
function resumeLegacyDaily() {
  const date = dailyDate();
  if (!legacyDaily || legacyDaily.date !== date) legacyDaily = makeDaily(date);
  const keep = dailySession(legacyDaily);
  if (!keep) { delete save.sessions.dailyLegacy; persist(); renderOperation(); return; }
  closeDaily(); show('game'); loadDaily(legacyDaily, keep);
}
function continueDaily() {
  const date = DAILY.date, stage = Number.isInteger(DAILY.stage) ? dailyProgress(date).next : -1;
  openDaily();
  if (date === dailyDate() && stage >= 0) startDaily(stage);
}
/* ---------- rescue journal: lifetime stamps and automatic milestone rewards ---------- */
const JOURNAL_REWARDS = [
  { id: 'first-visit', name: '첫 물길', metric: 'visits', goal: 1, mark: '≈' },
  { id: 'first-operation', name: '구출 성공', metric: 'operations', goal: 1, mark: '✓' },
  { id: 'coral', name: '산호 상어', metric: 'visits', goal: 3, mark: '✿', skin: 'coral' },
  { id: 'starsea', name: '별바다 상어', metric: 'operations', goal: 7, mark: '✦', skin: 'starsea' },
  { id: 'companion', name: '든든한 동행', metric: 'visits', goal: 30, mark: '≈' },
  { id: 'veteran', name: '베테랑 구조대', metric: 'operations', goal: 30, mark: '✓' },
];
function earnedJournalRewards() {
  const totals = journalTotals();
  return JOURNAL_REWARDS.filter(r => totals[r.metric] >= r.goal || !!(r.skin && save.owned?.includes(r.skin)));
}
const journalOpen = () => !$('journalOverlay').hidden;
let journalMonth = '', journalReturn = 'title';
function journalMonthShift(month, delta) {
  const [y, m] = month.split('-').map(Number), d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function renderJournal() {
  const totals = journalTotals(), today = dailyDate(), currentMonth = today.slice(0, 7);
  const dates = Object.keys(save.journal.days).sort();
  const firstMonth = dates.length ? dates[0].slice(0, 7) : currentMonth;
  if (!journalMonth || journalMonth > currentMonth) journalMonth = currentMonth;
  $('journalTotals').textContent = `참여 ${totals.visits}일 · 작전 완료 ${totals.operations}일`;
  const earnedIds = new Set(earnedJournalRewards().map(r => r.id)), nextReward = JOURNAL_REWARDS.find(r => !earnedIds.has(r.id));
  $('journalGoal').textContent = nextReward ? `${nextReward.name}까지 ${nextReward.metric === 'visits' ? '참여' : '작전 완료'} ${nextReward.goal - totals[nextReward.metric]}일`
    : '모든 기념품을 모았어요! 다음 구조 기록도 이어 가요.';
  const [y, m] = journalMonth.split('-').map(Number), start = new Date(y, m - 1, 1).getDay(), count = new Date(y, m, 0).getDate();
  $('journalMonth').textContent = `${y}년 ${m}월`;
  $('journalPrev').disabled = journalMonth <= firstMonth;
  $('journalNext').disabled = journalMonth >= currentMonth;
  const monthDates = dates.filter(d => d.startsWith(journalMonth));
  $('journalMonthSummary').textContent = `이달 참여 ${monthDates.length}일 · 작전 완료 ${monthDates.filter(d => save.journal.days[d] === 2).length}일`;
  $('journalCalendar').innerHTML = Array.from('일월화수목금토', day => `<span class="journal-weekday" aria-hidden="true">${day}</span>`).join('')
    + '<span aria-hidden="true"></span>'.repeat(start)
    + Array.from({ length: count }, (_, i) => {
      const date = `${journalMonth}-${String(i + 1).padStart(2, '0')}`, stamp = save.journal.days[date] || 0;
      const state = stamp === 2 ? '세 수로 완료' : stamp ? '참여' : date > today ? '예정' : '기록 없음';
      return `<span class="journal-day${stamp ? ' stamped' : ''}${stamp === 2 ? ' complete' : ''}${date === today ? ' today' : ''}" role="img" aria-label="${m}월 ${i + 1}일, ${state}${date === today ? ', 오늘' : ''}"><b>${i + 1}</b><small aria-hidden="true">${stamp === 2 ? '✓' : stamp ? '●' : '·'}</small></span>`;
    }).join('');
  $('journalRewards').innerHTML = JOURNAL_REWARDS.map(r => {
    const value = totals[r.metric], earned = value >= r.goal || !!(r.skin && save.owned?.includes(r.skin));
    const condition = `${r.metric === 'visits' ? '누적 참여' : '세 수로 완료'} ${r.goal}일`;
    return `<li class="journal-reward${earned ? ' earned' : ''}"><span class="journal-mark" aria-hidden="true">${r.mark}</span><div><b>${r.name}</b><small>${r.skin ? '상어 외형' : '기념 배지'} · ${condition}</small><progress max="${r.goal}" value="${Math.min(value, r.goal)}" aria-label="${r.name}, ${condition}, ${earned ? '획득 완료' : `${value}일 달성`}"></progress></div><span class="journal-earned">${earned ? '획득' : `${value} / ${r.goal}`}</span></li>`;
  }).join('');
}
function openJournal(from = 'title') {
  journalReturn = from;
  if (from === 'daily') closeDaily();
  journalMonth = dailyDate().slice(0, 7); renderJournal();
  $('app').inert = true; $('journalOverlay').hidden = false;
  $('journalCard').scrollTop = 0; $('journalTitle').focus({ preventScroll: true });
}
function closeJournal() {
  $('journalOverlay').hidden = true; $('app').inert = false;
  if (journalReturn === 'daily') { openDaily(); $('dailyJournalBtn').focus({ preventScroll: true }); }
  else $('journalBtn').focus({ preventScroll: true });
}
function journalToSkins() {
  journalReturn = 'title'; closeJournal(); openSkins();
}
/* ---------- my shark: title card and skin picker ---------- */
function drawSkinPreview(canvas, skin) {
  const r = canvas.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2.5);
  if (!r.width) return;
  canvas.width = Math.round(r.width * d); canvas.height = Math.round(r.height * d);
  const x = canvas.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0);
  x.fillStyle = C.water; x.fillRect(0, 0, r.width, r.height);
  x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 1.5;
  for (const yy of [0.25, 0.8]) { x.beginPath(); for (let px = 0; px <= r.width; px += 6) { const py = r.height * yy + Math.sin(px * 0.12) * 2; px ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); }
  drawShark(x, r.width * 0.52, r.height * 0.5, -0.12, Math.min(r.width / 1.5, r.height * 1.05), 0.5, false, 1, 1, skin);
}
function renderSkinCard() {
  const skin = currentSkin(), owned = (save.owned || ['basic']).length;
  $('skinName').textContent = skin.name;
  $('skinCount').textContent = `${owned} / ${SKINS.length} 모음 · 별 ${totalStars()}개`;
  requestAnimationFrame(() => drawSkinPreview($('skinPreview'), skin));
}
function skinNeedText(skin) {
  if (skin.need.visits) return `누적 참여 ${skin.need.visits}일 (지금 ${Math.min(journalTotals().visits, skin.need.visits)}일)`;
  if (skin.need.operations) return `세 수로 완료 ${skin.need.operations}일 (지금 ${Math.min(journalTotals().operations, skin.need.operations)}일)`;
  if (skin.need.streak) return `오늘의 수로 ${skin.need.streak}일 연속 (최고 ${bestStreak()}일)`;
  return `별 ${skin.need.stars}개 (지금 ${Math.min(totalStars(), skin.need.stars)}개)`;
}
function renderSkinGrid() {
  const owned = new Set(save.owned || ['basic']), cur = currentSkin().id;
  $('skinGrid').innerHTML = SKINS.map(skin => {
    const has = owned.has(skin.id), sel = skin.id === cur;
    return `<button class="skin${sel ? ' sel' : ''}" type="button" data-id="${skin.id}" ${has ? '' : 'disabled'} aria-pressed="${sel}">
      <canvas aria-hidden="true"></canvas><span class="skin-name">${skin.name}</span>
      <span class="skin-need">${has ? (sel ? '사용 중' : '고르기') : skinNeedText(skin)}</span></button>`;
  }).join('');
  $('skinsSub').textContent = `${owned.size} / ${SKINS.length} 모음 · 별과 구조일지 기록으로 새 상어가 열려요.`;
  requestAnimationFrame(() => $('skinGrid').querySelectorAll('.skin').forEach(b => drawSkinPreview(b.querySelector('canvas'), SKINS.find(k => k.id === b.dataset.id))));
}
const skinsOpen = () => !$('skinsOverlay').hidden;
function openSkins() { $('skinsOverlay').hidden = false; renderSkinGrid(); $('skinsDone').focus({ preventScroll: true }); }
function closeSkins() { $('skinsOverlay').hidden = true; renderSkinCard(); }

/* ---------- rendering ---------- */
const board = $('board'), frameEl = $('boardFrame'), cvs = $('boardCanvas'), ctx = cvs.getContext('2d');
// Camera view: the canvas fills the whole board area. The canal is drawn as large as fits (outer promenade columns may be
// cut by CROP when width is the limit) and the rest of the screen continues the world: promenade all around (the engine
// already treats everything outside the grid as '#'), and open sea running out from each exit to the screen edge.
const CROP = 0.3;   // share of each outer promenade column that may fall outside the view to make the tiles bigger
let OX = 0, OY = 0, CW = 0, CH = 0, seaCells = new Set();
function resize() {
  if (!g || $('gameScreen').hidden) return;
  const r = board.getBoundingClientRect();
  CW = Math.floor(r.width); CH = Math.floor(r.height);
  T = Math.max(18, Math.floor(Math.min(CW / (g.w - 2 * CROP), CH / g.h, 132)));
  OX = Math.round((CW - g.w * T) / 2); OY = Math.round((CH - g.h * T) / 2);
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cvs.style.width = CW + 'px'; cvs.style.height = CH + 'px';
  cvs.width = Math.round(CW * dpr); cvs.height = Math.round(CH * dpr);
  cvs.dataset.tile = T; cvs.dataset.ox = OX; cvs.dataset.oy = OY;   // grid placement, read by tools/shots.js
  causticPat = null;
  buildStatic();
}
// Hints, wrapped counters and font loading can change board space without a window resize.
// Keep the canvas and tap coordinates fitted to the actual board after those layout changes.
if (typeof ResizeObserver !== 'undefined') {
  const boardResize = new ResizeObserver(() => {
    if (!g || $('gameScreen').hidden) return;
    const r = board.getBoundingClientRect();
    if (Math.floor(r.width) !== CW || Math.floor(r.height) !== CH) resize();
  });
  boardResize.observe(board);
}
// '~' = open sea beyond an exit, '#' = promenade everywhere else outside the grid
function exitDir(x, y) { return y === 0 ? 'U' : y === g.h - 1 ? 'D' : x === 0 ? 'L' : 'R'; }
function buildSea() {
  seaCells = new Set();
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (cellAt(g, x, y) === 'E') {
    const [dx, dy] = DIRS[exitDir(x, y)];
    for (let k = 1; k <= 40; k++) seaCells.add((x + dx * k) + ',' + (y + dy * k));
  }
}
const cellType = (x, y) => (x < 0 || y < 0 || x >= g.w || y >= g.h) ? (seaCells.has(x + ',' + y) ? '~' : '#') : cellAt(g, x, y);
const isLand = (x, y) => cellType(x, y) === '#';
function buildStatic() {
  buildSea();
  staticLayer = document.createElement('canvas');
  staticLayer.width = cvs.width; staticLayer.height = cvs.height;
  const s = staticLayer.getContext('2d'); s.scale(dpr, dpr); s.translate(OX, OY);
  // every cell that is at least partly on screen
  const x0 = Math.floor(-OX / T) - 1, x1 = Math.ceil((CW - OX) / T), y0 = Math.floor(-OY / T) - 1, y1 = Math.ceil((CH - OY) / T);
  waterPath = new Path2D();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x * T, py = y * T, c = cellType(x, y);
    if (c === '~') {
      // open sea: deepens with distance from the canal
      const d = Math.max(Math.abs(Math.min(x, g.w - 1 - x, 0)), Math.abs(Math.min(y, g.h - 1 - y, 0)));
      s.fillStyle = C.sea; s.fillRect(px, py, T, T);
      s.fillStyle = `rgba(3,20,30,${Math.min(0.45, d * 0.07).toFixed(3)})`; s.fillRect(px, py, T, T);
      waterPath.rect(px, py, T, T); continue;
    }
    if (c !== '#') { s.fillStyle = C.water; s.fillRect(px, py, T, T); waterPath.rect(px, py, T, T); if (c === 's') drawSand(s, px, py, T, x * 31 + y * 17 + deco); continue; }
    s.fillStyle = C.concrete; s.fillRect(px, py, T, T);
    s.strokeStyle = C['concrete-2']; s.lineWidth = 1; s.globalAlpha = 0.4;
    s.beginPath(); s.moveTo(px, py + T / 2 + .5); s.lineTo(px + T, py + T / 2 + .5);
    const off = (((y % 2) + 2) % 2) * T / 2; s.moveTo(px + off + .5, py); s.lineTo(px + off + .5, py + T / 2); s.moveTo(px + ((off + T / 2) % T) + .5, py + T / 2); s.lineTo(px + ((off + T / 2) % T) + .5, py + T); s.stroke(); s.globalAlpha = 1;
  }
  // shade on water next to land, railings and onlookers on land next to water
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x * T, py = y * T, seed = hash(y * 97 + x * 31 + deco * 7);
    const inside = x >= 0 && y >= 0 && x < g.w && y < g.h;
    const nb = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    if (!isLand(x, y)) {
      s.fillStyle = 'rgba(6,30,38,.28)';
      nb.forEach(([dx, dy]) => {
        if (!isLand(x + dx, y + dy)) return;
        const w = Math.max(3, T * 0.09);
        if (dy === -1) s.fillRect(px, py, T, w); if (dy === 1) s.fillRect(px, py + T - w, T, w);
        if (dx === -1) s.fillRect(px, py, w, T); if (dx === 1) s.fillRect(px + T - w, py, w, T);
      });
      continue;
    }
    const waterSides = nb.filter(([dx, dy]) => !isLand(x + dx, y + dy));
    if (!waterSides.length) {
      if (seed < (inside ? 0.25 : 0.16)) {
        s.save(); s.globalAlpha = 0.6; s.fillStyle = C.park;
        s.beginPath(); s.arc(px + T * (0.3 + seed), py + T * 0.5, T * 0.26, 0, 7); s.fill();
        s.fillStyle = 'rgba(255,255,255,.1)'; s.beginPath(); s.arc(px + T * (0.25 + seed), py + T * 0.43, T * 0.1, 0, 7); s.fill(); s.restore();
      }
      continue;
    }
    waterSides.forEach(([dx, dy], k) => {
      s.strokeStyle = C.rail; s.lineWidth = Math.max(1.5, T * 0.045);
      s.beginPath();
      if (dy === -1) { s.moveTo(px, py + 2); s.lineTo(px + T, py + 2); }
      if (dy === 1) { s.moveTo(px, py + T - 2); s.lineTo(px + T, py + T - 2); }
      if (dx === -1) { s.moveTo(px + 2, py); s.lineTo(px + 2, py + T); }
      if (dx === 1) { s.moveTo(px + T - 2, py); s.lineTo(px + T - 2, py + T); }
      s.stroke();
      if (T < 44 || waterSides.length !== 1 || seed > 0.18) return; // keep small boards and narrow islands free of onlookers
      const n = 1;
      for (let j = 0; j < n; j++) {
        const sd = hash(x * 13 + y * 7 + j * 5 + k * 3 + deco), along = (j + 0.5) / n + (sd - 0.5) * 0.2, inset = T * 0.3;
        let qx = px + T * along, qy = py + T * along;
        if (dy === -1) qy = py + inset; if (dy === 1) qy = py + T - inset;
        if (dx === -1) qx = px + inset; if (dx === 1) qx = px + T - inset;
        if (dy) qx = px + T * along; else qy = py + T * along;
        s.save(); s.globalAlpha = 0.4; drawPerson(s, qx, qy, T, sd); s.restore();
      }
    });
  }
}

let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  const t = now / 1000;
  if (!$('gameScreen').hidden && g && staticLayer) {
    updateHintButton();
    if (!guideOpen()) step(dt);
    draw(t);
  }
  if (!$('titleScreen').hidden) drawHero(t);
  requestAnimationFrame(frame);
}
function step(dt) {
  clock += dt;
  if (anim) {
    const a = anim;
    a.t += dt * (reduceMotion ? 2 : 1);
    const u = Math.min(1, a.t / a.dur), prev = a.p;
    a.p = (a.win ? DASH : GLIDE)(u) * a.n;
    a.speed = (a.p - prev) / Math.max(dt, 1e-3);
    const i = Math.min(Math.floor(a.p), a.n - 1), f = a.p - i, A = a.pts[i], B = a.pts[i + 1];
    if (a.warps.has(i + 1)) {
      const out = f >= 0.5; view.x = out ? B[0] : A[0]; view.y = out ? B[1] : A[1]; a.warpScale = out ? (f - 0.5) * 2 : 1 - f * 2;
      if (!a.warpDone.has(i + 1)) {
        a.warpDone.add(i + 1); sfx.warp(); haptic('medium');
        jetFlash.set(A[1] * g.w + A[0], 1); jetFlash.set(B[1] * g.w + B[0], 1); ring(A[0], A[1], 1, 0.6); ring(B[0], B[1], 1.2, 0.6);
      }
    } else { a.warpScale = 1; view.x = A[0] + (B[0] - A[0]) * f; view.y = A[1] + (B[1] - A[1]) * f; }
    view.target = ANG[a.dirs[Math.min(i + 1, a.dirs.length - 1)]];
    for (const e of a.eats) if (!a.eaten.has(e.fi) && a.p >= e.k - 0.35) eatFish(e.fi);
    for (const j of a.jets) if (!j.done && a.p >= j.k - 0.25) { j.done = true; jetFlash.set(j.y * g.w + j.x, 1); ring(j.x, j.y, 0.8, 0.5); sfx.jet(); haptic('tick'); }
    if (a.win && !a.exitFx && a.p >= a.steps - 0.2) {
      a.exitFx = true; const [ex, ey] = a.pts[a.steps];
      ring(ex, ey, 1.6, 0.7); ring(ex, ey, 0.9, 0.5); splashAt(ex, ey, 16, a.dirs[a.steps], 1.3);
      sfx.exit(); haptic('success');
    }
    if (a.speed > 2 && !reduceMotion) wake.push({ x: view.x, y: view.y, ang: view.ang, age: 0, sp: Math.min(1, a.speed / 14) });
    if (Math.random() < dt * 30) particles.push({ kind: 'bubble', x: view.x + (Math.random() - 0.5) * 0.3, y: view.y + (Math.random() - 0.5) * 0.3, vx: 0, vy: 0, life: 1 });
    if (a.t >= a.dur + a.boatDur) finishAnim();
  }
  let da = view.target - view.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
  view.ang += da * (1 - Math.exp(-dt * 18));
  if (bump) { bump.t += dt; if (bump.t > 0.25) bump = null; }
  if (settle) { settle.t += dt; if (settle.t > 0.6) settle = null; }
  if (pop) { pop.t += dt; if (pop.t > 0.4) pop = null; }
  for (let k = wake.length - 1; k >= 0; k--) { wake[k].age += dt; if (wake[k].age > 0.9) wake.splice(k, 1); }
  for (const [k, v] of jetFlash) { const nv = v - dt * 2.5; if (nv <= 0) jetFlash.delete(k); else jetFlash.set(k, nv); }
  for (let k = particles.length - 1; k >= 0; k--) {
    const p = particles[k];
    if (p.kind === 'fish') { p.life -= dt * 4.5; p.x += (view.x - p.x) * Math.min(1, dt * 16); p.y += (view.y - p.y) * Math.min(1, dt * 16); }
    else if (p.kind === 'ring') p.life -= dt * 1.5;
    else { p.life -= dt * (p.kind === 'text' ? 1.1 : p.kind === 'spark' ? 2.2 : 1.6); p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; if (p.kind === 'spark') p.rot += dt * 8; }
    if (p.life <= 0) particles.splice(k, 1);
  }
}
function draw(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(staticLayer, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, OX * dpr, OY * dpr);   // from here on: grid coordinates
  const eatenNow = new Set(st.fish); if (anim) anim.eaten.forEach(i => eatenNow.add(i));
  // light on the water
  ctx.save(); ctx.clip(waterPath);
  if (!causticPat) causticPat = ctx.createPattern(caustic, 'repeat');
  const ct = reduceMotion ? 0 : t, sc = T / 60;
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = causticPat;
  for (const [ox, oy, s, al] of [[ct * 7, ct * 4, sc, 0.02], [-ct * 5, ct * 6, sc * 1.4, 0.012]]) {
    ctx.save(); ctx.globalAlpha = al; ctx.scale(s, s); ctx.translate(ox % 128, oy % 128);
    ctx.fillRect(-OX / s - 256, -OY / s - 256, CW / s + 512, CH / s + 512); ctx.restore();
  }
  ctx.restore();
  // ripples
  ctx.strokeStyle = 'rgba(255,255,255,.028)'; ctx.lineWidth = 1.5;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const c = cellAt(g, x, y); if (c === '#') continue;
    const px = x * T, py = y * T;
    if (c === 'E') { drawExit(ctx, px, py, T, g, x, y, t); continue; }
    if (c !== '.' || hash(x * 19 + y * 23 + deco) > 0.4) continue;
    const ph = reduceMotion ? 0 : t * 0.8 + hash(x * 5 + y * 11) * 6;
    ctx.beginPath();
    for (let k = 0; k <= 8; k++) { const qx = px + T * 0.18 + k * T * 0.08, qy = py + T * (0.35 + hash(x + y * 3) * 0.3) + Math.sin(ph + k * 0.8) * T * 0.035; k ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy); }
    ctx.stroke();
  }
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const c = cellAt(g, x, y), px = x * T, py = y * T;
    if (JET[c]) drawJet(ctx, px, py, T, JET[c], t, jetFlash.get(y * g.w + x) || 0);
    else if (c === 'o') drawBuoy(ctx, px + T / 2, py + T / 2, T, t);
    else if (c === 'w') drawWhirl(ctx, px + T / 2, py + T / 2, T, t, jetFlash.get(y * g.w + x) || 0);
  }
  // surface rings and the wake behind the shark
  for (const p of particles) if (p.kind === 'ring') {
    const k = 1 - p.life;
    ctx.strokeStyle = `rgba(255,255,255,${(p.life * p.alpha).toFixed(3)})`; ctx.lineWidth = Math.max(1.2, T * 0.05 * p.life);
    ctx.beginPath(); ctx.arc(p.x * T + T / 2, p.y * T + T / 2, T * (0.15 + k * 0.6 * p.size), 0, 7); ctx.stroke();
  }
  for (const w of wake) {
    const k = w.age / 0.9, a = (1 - k) * 0.34 * w.sp; if (a <= 0.01) continue;
    const spread = (0.12 + k * 0.5) * T, back = T * 0.45, r = T * (0.035 + k * 0.05);
    const cx = w.x * T + T / 2 - Math.cos(w.ang) * back, cy = w.y * T + T / 2 - Math.sin(w.ang) * back, nx = -Math.sin(w.ang), ny = Math.cos(w.ang);
    ctx.fillStyle = `rgba(236,245,242,${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(cx + nx * spread + r, cy + ny * spread); ctx.arc(cx + nx * spread, cy + ny * spread, r, 0, 7);
    ctx.moveTo(cx - nx * spread + r, cy - ny * spread); ctx.arc(cx - nx * spread, cy - ny * spread, r, 0, 7);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${(a * 0.45).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(cx, cy, T * (0.07 + k * 0.12), 0, 7); ctx.fill();
  }
  // Patrol boats remain on their old tile during the swim and glide only after the shark arrives.
  const BOAT_ANG = { U: 0, R: Math.PI / 2, D: Math.PI, L: -Math.PI / 2 };
  const bk = anim ? (anim.t < anim.dur ? 0 : anim.boatDur ? 1 - Math.pow(1 - clamp01((anim.t - anim.dur) / anim.boatDur), 2) : 1) : 1;
  st.boats.forEach((b, k) => {
    const from = anim && anim.boatsFrom ? anim.boatsFrom[k][0] : b[0];
    const x = (from % g.w) + ((b[0] % g.w) - (from % g.w)) * bk, y = Math.floor(from / g.w) + (Math.floor(b[0] / g.w) - Math.floor(from / g.w)) * bk;
    const heading = anim && anim.t < anim.dur ? anim.boatsFrom[k][1] : b[1];
    drawBoat(ctx, x * T + T / 2, y * T + T / 2, T, t, BOAT_ANG[heading], !anim);
  });
  st.nets.forEach(i => {
    const t0 = netPop.get(i), k = t0 == null ? 1 : (clock - t0) / 0.32;
    drawNet(ctx, (i % g.w) * T, Math.floor(i / g.w) * T, T, false, t, k >= 1 ? 1 : 0.4 + 0.6 * easeOutBack(clamp01(k)));
  });
  if (hint) {
    if (!hint.remove.length) hint.nets.forEach(i => drawNet(ctx, (i % g.w) * T, Math.floor(i / g.w) * T, T, true, t));
    hint.remove.forEach(i => {
      const x = (i % g.w + 0.5) * T, y = (Math.floor(i / g.w) + 0.5) * T;
      ctx.save(); ctx.strokeStyle = C.star; ctx.lineWidth = Math.max(2, T * 0.05);
      ctx.globalAlpha = 0.7 + Math.sin(t * 6) * 0.25;
      ctx.beginPath(); ctx.arc(x, y, T * 0.43, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - T * 0.16, y - T * 0.16); ctx.lineTo(x + T * 0.16, y + T * 0.16);
      ctx.moveTo(x + T * 0.16, y - T * 0.16); ctx.lineTo(x - T * 0.16, y + T * 0.16); ctx.stroke(); ctx.restore();
    });
  }
  g.fish.forEach(([fx, fy], i) => { if (!eatenNow.has(i)) drawFish(ctx, fx * T + T / 2, fy * T + T / 2, T, t, hash(i * 17 + deco)); });
  for (const p of particles) if (p.kind === 'fish') drawFish(ctx, p.x * T + T / 2, p.y * T + T / 2, T, t * 4, hash(p.fi * 17 + deco), Math.max(0.05, p.life));
  // bubbles under shark
  particles.forEach(p => { if (p.kind === 'bubble') { ctx.strokeStyle = `rgba(255,255,255,${p.life * 0.5})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x * T + T / 2, p.y * T + T / 2, T * 0.05 * (1.5 - p.life), 0, 7); ctx.stroke(); } });
  // shark: stretch with speed, squash + spring on impact, fade into the sea on escape
  let sx = view.x, sy = view.y, stretch = 1, alpha = 1, size = 1;
  if (anim) {
    stretch = 1 + 0.16 * Math.min(1, anim.speed / 16);
    if (anim.win) alpha = clamp01(1 - (anim.p - anim.steps) / 2.4);
  } else if (cleared) alpha = 0;
  if (bump && !reduceMotion) { const [dx, dy] = DIRS[bump.d], k = Math.sin(bump.t / 0.25 * Math.PI) * 0.12; sx += dx * k; sy += dy * k; stretch = 1 - k * 0.8; }
  if (settle && !reduceMotion) {
    const k = settle.t, e = Math.exp(-k * 9), [dx, dy] = DIRS[settle.d], off = 0.1 * settle.amp * Math.sin(k * 24) * e;
    sx += dx * off; sy += dy * off; stretch = 1 - 0.14 * settle.amp * e * Math.cos(k * 20);
  }
  if (pop) size = 0.55 + 0.45 * easeOutBack(clamp01(pop.t / 0.32));
  if (anim && anim.warpScale < 1) size *= Math.max(0.05, anim.warpScale);
  const bob = anim ? 0 : Math.sin(t * 2) * 0.02;
  drawShark(ctx, sx * T + T / 2, (sy + bob) * T + T / 2, view.ang, T * size, t, !!anim, stretch, alpha);
  if (coach && !anim && !cleared && !hint) drawCoach(sx, sy, t);
  if (hint && !anim && !hint.remove.length && !hint.nets.length) {
    const [dx, dy] = DIRS[hint.dir], pulse = 0.72 + Math.sin(t * 6) * 0.1;
    ctx.save(); ctx.translate((sx + dx * pulse) * T + T / 2, (sy + dy * pulse) * T + T / 2); ctx.rotate(ANG[hint.dir]);
    ctx.fillStyle = C.star; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(T * 0.2, 0); ctx.lineTo(-T * 0.12, -T * 0.18); ctx.lineTo(-T * 0.12, T * 0.18); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  particles.forEach(p => {
    const px = p.x * T + T / 2, py = p.y * T + T / 2;
    if (p.kind === 'text') {
      const s = 1 + 0.5 * clamp01((p.life - 0.8) / 0.2);
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = C.star; ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
      ctx.font = `400 ${Math.round(T * 0.36 * s)}px ${css.getPropertyValue('--font-display')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.strokeText('냠!', px, p.y * T + T * 0.4); ctx.fillText('냠!', px, p.y * T + T * 0.4);
      ctx.globalAlpha = 1;
    } else if (p.kind === 'grain') {
      ctx.fillStyle = `rgba(214,188,130,${p.life.toFixed(3)})`; ctx.beginPath(); ctx.arc(px, py, T * p.size, 0, 7); ctx.fill();
    } else if (p.kind === 'drop') {
      ctx.fillStyle = `rgba(236,245,242,${p.life.toFixed(3)})`; ctx.beginPath(); ctx.arc(px, py, T * p.size * (0.6 + 0.4 * p.life), 0, 7); ctx.fill();
    } else if (p.kind === 'spark') {
      const r = T * 0.09 * p.life;
      ctx.save(); ctx.translate(px, py); ctx.rotate(p.rot); ctx.globalAlpha = p.life; ctx.fillStyle = C.star;
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.3, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.3, 0); ctx.closePath();
      ctx.moveTo(-r, 0); ctx.lineTo(0, r * 0.3); ctx.lineTo(r, 0); ctx.lineTo(0, -r * 0.3); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  });
}

// fingertip: soft white disc with a ring; `press` 0..1 shrinks it like a finger touching glass
function drawFinger(x, y, press, alpha) {
  const r = T * 0.2 * (1 - press * 0.18);
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(4,20,26,.25)'; ctx.beginPath(); ctx.arc(x + 2, y + 4, r, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.strokeStyle = C.star; ctx.lineWidth = Math.max(2, T * 0.05); ctx.beginPath(); ctx.arc(x, y, r + T * 0.07, 0, 7); ctx.stroke();
  ctx.restore();
}
function drawCoach(sx, sy, t) {
  if (coach.kind === 'swipe') {
    // finger lands beside the shark, drags one and a half tiles in the move direction, lifts, repeats
    const [dx, dy] = DIRS[coach.dir], cyc = (t % 1.6) / 1.6;
    const move = clamp01((cyc - 0.15) / 0.45), e = 1 - Math.pow(1 - move, 3);
    const alpha = cyc < 0.1 ? cyc / 0.1 : cyc > 0.75 ? clamp01((0.95 - cyc) / 0.2) : 1;
    const bx = (sx + 0.5) * T + dy * T * 0.55, by = (sy + 0.5) * T - dx * T * 0.55;   // start just to the side of the shark
    const x = bx + dx * T * 1.5 * e, y = by + dy * T * 1.5 * e;
    if (move > 0) {
      ctx.save(); ctx.globalAlpha = alpha * 0.5; ctx.strokeStyle = '#fff'; ctx.lineWidth = T * 0.12; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(x, y); ctx.stroke(); ctx.restore();
    }
    drawFinger(x, y, move > 0 && move < 1 ? 1 : 0, alpha);
  } else {
    // finger taps the tile where the net should go
    const cyc = (t % 1.2) / 1.2, cx = (coach.x + 0.5) * T, cy = (coach.y + 0.5) * T;
    const press = cyc < 0.25 ? cyc / 0.25 : cyc < 0.4 ? 1 : clamp01(1 - (cyc - 0.4) / 0.2);
    ctx.save(); ctx.strokeStyle = C.star; ctx.lineWidth = 2; ctx.globalAlpha = clamp01(1 - cyc) * 0.8;
    ctx.beginPath(); ctx.arc(cx, cy, T * (0.25 + cyc * 0.35), 0, 7); ctx.stroke(); ctx.restore();
    drawFinger(cx + T * 0.18, cy + T * 0.22 - press * T * 0.1, press, 1);
  }
}

/* ---------- title hero ---------- */
const hero = $('heroCanvas'), hctx = hero.getContext('2d');
let heroW = 0, heroH = 0;
function sizeHero() {
  const r = hero.getBoundingClientRect(); const d = Math.min(window.devicePixelRatio || 1, 2.5);
  heroW = r.width; heroH = r.height; hero.width = Math.round(r.width * d); hero.height = Math.round(r.height * d);
  hctx.setTransform(d, 0, 0, d, 0, 0);
}
function drawHero(t) {
  if (!heroW) sizeHero();
  const W = heroW, H = heroH, waterH = H - 124, T = Math.min(64, waterH * 1.2, W / 5.2);   // keep the moving water above the larger, spaced title block
  hctx.fillStyle = C.water; hctx.fillRect(0, 0, W, waterH);
  hctx.strokeStyle = 'rgba(255,255,255,.06)'; hctx.lineWidth = 1.5;
  for (let r = 0; r < 4; r++) { hctx.beginPath(); for (let x = 0; x <= W; x += 8) { const y = 16 + r * waterH / 4 + Math.sin(x * 0.03 + t * (1 + r * .2) + r) * 3; x ? hctx.lineTo(x, y) : hctx.moveTo(x, y); } hctx.stroke(); }
  hctx.fillStyle = C['hero-paper']; hctx.fillRect(0, waterH, W, H - waterH);
  hctx.fillStyle = 'rgba(6,30,38,.3)'; hctx.fillRect(0, waterH - 5, W, 5);
  hctx.strokeStyle = C.rail; hctx.lineWidth = 3; hctx.beginPath(); hctx.moveTo(0, waterH + 3); hctx.lineTo(W, waterH + 3); hctx.stroke();
  const span = W + T * 2, sx = ((t * 60) % span) - T, sy = waterH * 0.52 + Math.sin(t * 1.5) * waterH * 0.12;
  const ang = Math.atan2(Math.cos(t * 1.5) * waterH * 0.12 * 1.5, 60);
  drawShark(hctx, sx, sy, ang, T, t, true, 1.05);
  drawFish(hctx, ((W * 0.8 + t * 20) % (W + 40)) - 20, waterH * 0.26, T * 0.9, t, 0.3);
  drawBuoy(hctx, W * 0.86, waterH * 0.68, T * 0.8, t);
}

/* ---------- UI wiring ---------- */
let selectedChapter = null;
function renderLevelGrid(followProgress = false) {
  const resume = storySession(), target = resume ? save.sessions.story.id : nextLevel();
  if (followProgress || selectedChapter === null) selectedChapter = chapterOf(target).ci;
  const grid = $('levelGrid'), total = totalStars();
  const button = (L, i, k) => {
    const b = save.best[i] || 0; const ok = unlocked(i);
    const stars = '★'.repeat(b) + `<i>${'★'.repeat(3 - b)}</i>`;
    return `<button class="lv${i === target ? ' cur' : ''}" type="button" data-i="${i}" style="--i:${k}" ${ok ? '' : 'disabled'} aria-label="수로 ${i + 1} ${L.name}${ok ? `, 별 ${b}개` : ', 잠김'}">
      <span class="n">${i + 1}</span><span class="nm">${ok ? L.name : '잠김'}</span><span class="st">${stars}</span></button>`;
  };
  let start = 0;
  $('chapterPicker').innerHTML = CHAPTERS.map((ch, ci) => {
    const idx = Array.from({ length: ch.count }, (_, k) => start + k); start += ch.count;
    const stars = idx.reduce((n, i) => n + (save.best[i] || 0), 0), ok = unlocked(idx[0]);
    if (ci === selectedChapter) {
      grid.innerHTML = `<div class="chapter-head"><h3>${ch.name}</h3><span>★ ${stars} / ${ch.count * 3}</span></div>
        <div class="levels">${idx.map((i, k) => button(LEVELS[i], i, k)).join('')}</div>`;
    }
    return `<button class="chapter-btn" type="button" data-chapter="${ci}" aria-pressed="${ci === selectedChapter}" aria-label="${ci + 1}장 ${ch.name}${ok ? `, 별 ${stars}개` : ', 잠김'}"><b>${ci + 1}장</b><span>${ok ? `★ ${stars} / ${ch.count * 3}` : '잠김'}</span></button>`;
  }).join('');
  $('levelCount').textContent = `수로 ${LEVELS.length}곳`;
  $('starTotal').textContent = `★ ${total} / ${LEVELS.length * 3}`;
  const chap = chapterOf(target);
  $('journeyLabel').innerHTML = `${chap.ci + 1}장 ${chap.name} · <b>${LEVELS[target].name}</b>`;
  $('playBtn').textContent = resume ? `이어서 하기 · 수로 ${save.sessions.story.id + 1} · ${resume.moves}회 진행`
    : Object.keys(save.best).length ? `이어서 하기 · 수로 ${nextLevel() + 1}` : '시작하기';
}
function nextLevel() {
  for (let i = 0; i < LEVELS.length; i++) if (save.best[i] == null) return i;
  return Math.min(save.last, LEVELS.length - 1);
}
function renderLegend() {
  const items = [
    ['fish', '숭어 · 모두 먹으면 별 +1'], ['buoy', '부표 · 앞에서 멈춰요'],
    ['boat', '구조정 · 한 칸씩 오가요'], ['jet', '물줄기 · 방향이 꺾여요'],
    ['net', '그물 · 톡 눌러 치기'], ['exit', '바다 · 여기로 나가요'],
    ['sand', '모래톱 · 올라서면 멈춰요'], ['whirl', '소용돌이 · 짝으로 빨려 나가요'],
  ];
  $('legend').innerHTML = items.map(([k, l]) => `<div><canvas data-k="${k}" width="72" height="72"></canvas><span>${l}</span></div>`).join('');
  $('legend').querySelectorAll('canvas').forEach(drawLegendIcon);
}
function drawLegendIcon(c) {
  const x = c.getContext('2d'); x.setTransform(2, 0, 0, 2, 0, 0); const S = 36, k = c.dataset.k;
  x.fillStyle = C.water; x.fillRect(0, 0, S, S);
  if (k === 'fish') drawFish(x, 18, 18, S * 1.4, 0.4, 0.1);
  if (k === 'buoy') drawBuoy(x, 18, 18, S * 1.3, 0);
  if (k === 'boat') drawBoat(x, 18, 18, S * 1.2, 0, Math.PI / 2, true);
  if (k === 'jet') drawJet(x, 0, 0, S, 'R', 0.2);
  if (k === 'net') drawNet(x, 0, 0, S, false, 0);
  if (k === 'exit') drawExit(x, 0, 0, S, { w: 3, h: 3 }, 1, 0, 0);
  if (k === 'sand') drawSand(x, 0, 0, S, 5);
  if (k === 'whirl') drawWhirl(x, 18, 18, S, 0.4);
}
/* ---------- device rules: once on first encounter, always available from settings ---------- */
const DEVICE_GUIDES = [
  { key: 'boat', name: '구조정', text: '상어가 멈춘 뒤 한 칸 움직여요. 막히면 방향을 바꾸며, 그물을 치거나 회수할 때는 움직이지 않아요.', has: g => g.boats.length > 0 },
  { key: 'jet', name: '물줄기', text: '들어가면 화살표 방향으로 꺾여 계속 헤엄쳐요. 출발한 칸의 물줄기는 작동하지 않아요.', has: g => g.cells.some(c => JET[c]) },
  { key: 'net', name: '그물', text: '빈 물 칸을 톡 누르면 설치해요. 다시 누르면 회수해 다른 칸에 쓸 수 있어요. 설치와 회수는 이동 횟수에 포함되지 않아요.', has: g => g.nets > 0 },
  { key: 'sand', name: '모래톱', text: '올라서면 그 칸에서 멈춰요. 다음 이동에서는 다시 헤엄칠 수 있어요.', has: g => g.cells.includes('s') },
  { key: 'whirl', name: '소용돌이', text: '들어가면 짝 소용돌이로 옮겨져 같은 방향으로 계속 헤엄쳐요.', has: g => g.cells.includes('w') },
];
let guideKeys = [];
const guideOpen = () => !$('guideOverlay').hidden;
function showDeviceGuide(firstOnly = false) {
  const devices = DEVICE_GUIDES.filter(d => (g && !$('gameScreen').hidden ? d.has(g) : !firstOnly) && (!firstOnly || !save.seenDevices.includes(d.key)));
  if (firstOnly && !devices.length) return;
  guideKeys = devices.map(d => d.key);
  $('guideTitle').textContent = firstOnly ? '새 장치를 만났어요' : '장치 안내';
  $('guideItems').innerHTML = devices.length ? devices.map(d => `<li><canvas data-k="${d.key}" width="72" height="72" aria-hidden="true"></canvas><div><b>${d.name}</b><p>${d.text}</p></div></li>`).join('')
    : '<li><div><b>상어를 바다로 보내요</b><p>화면을 밀면 막힐 때까지 헤엄쳐요. 방향키로도 움직일 수 있어요. 숭어를 모두 먹고 이동 기준 안에 탈출하면 별 3개를 받아요.</p></div></li>';
  $('guideItems').querySelectorAll('canvas').forEach(drawLegendIcon);
  $('app').inert = true;
  $('guideOverlay').hidden = false; $('guideDone').focus({ preventScroll: true });
}
function closeGuide() {
  save.seenDevices = [...new Set([...save.seenDevices, ...guideKeys])]; persist();
  guideKeys = []; $('guideOverlay').hidden = true; $('app').inert = false;
  $($('gameScreen').hidden ? 'titleSettingsBtn' : 'settingsBtn').focus({ preventScroll: true });
}
// screen change with a native-style push (into a level) or pop (back to the list)
function show(which, animate = true) {
  if (which === 'title') { pauseGame(); $('guideOverlay').hidden = true; $('app').inert = false; guideKeys = []; cleared = false; }
  const el = which === 'title' ? $('titleScreen') : $('gameScreen');
  $('titleScreen').hidden = which !== 'title';
  $('gameScreen').hidden = which !== 'game';
  el.classList.remove('enter-fwd', 'enter-back');
  if (animate && !reduceMotion) { void el.offsetWidth; el.classList.add(which === 'game' ? 'enter-fwd' : 'enter-back'); }
  if (which === 'title') { $('clearOverlay').hidden = true; renderLevelGrid(true); renderDaily(); renderSkinCard(); $('titleScreen').scrollTop = 0; heroW = 0; }
  else requestAnimationFrame(resize);
}
function startLevel(i) { if (!unlocked(i)) return; const keep = storySession(i); show('game'); loadLevel(i, keep); }

$('levelGrid').addEventListener('click', e => { const b = e.target.closest('.lv'); if (b && !b.disabled) { ac(); startLevel(+b.dataset.i); } });
$('chapterPicker').addEventListener('click', e => {
  const b = e.target.closest('.chapter-btn'); if (!b) return;
  selectedChapter = +b.dataset.chapter; renderLevelGrid();
  $('chapterPicker').querySelector(`[data-chapter="${selectedChapter}"]`).focus({ preventScroll: true });
});
$('playBtn').addEventListener('click', () => { ac(); startLevel(storySession() ? save.sessions.story.id : nextLevel()); });
$('dailyBtn').addEventListener('click', () => { ac(); openDaily(); });
$('dailyStages').addEventListener('click', e => {
  const b = e.target.closest('[data-stage]');
  if (b && !b.disabled) { ac(); startDaily(+b.dataset.stage); }
});
$('dailyDone').addEventListener('click', closeDaily);
$('journalBtn').addEventListener('click', () => openJournal());
$('dailyJournalBtn').addEventListener('click', () => openJournal('daily'));
$('journalDone').addEventListener('click', closeJournal);
$('journalSkinsBtn').addEventListener('click', journalToSkins);
$('journalPrev').addEventListener('click', () => { journalMonth = journalMonthShift(journalMonth, -1); renderJournal(); });
$('journalNext').addEventListener('click', () => { journalMonth = journalMonthShift(journalMonth, 1); renderJournal(); });
$('journalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeJournal(); });
$('dailyLegacyBtn').addEventListener('click', resumeLegacyDaily);
$('dailyOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeDaily(); });
$('skinBtn').addEventListener('click', openSkins);
$('skinsDone').addEventListener('click', closeSkins);
$('skinsOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeSkins(); });
$('skinGrid').addEventListener('click', e => {
  const b = e.target.closest('.skin'); if (!b || b.disabled) return;
  save.skin = b.dataset.id; persist(); haptic('medium'); renderSkinGrid(); heroW = 0;
});
$('backBtn').addEventListener('click', () => show('title'));
$('undoBtn').addEventListener('click', undo);
$('restartBtn').addEventListener('click', restart);
$('hintBtn').addEventListener('click', showHint);
$('againBtn').addEventListener('click', replay);
$('nextBtn').addEventListener('click', () => { if (DAILY) continueDaily(); else if (LVL < LEVELS.length - 1) loadLevel(LVL + 1); else show('title'); });
// settings sheet (sound, vibration) — opened from the gear on the title and in a level
const settingsOpen = () => !$('settingsOverlay').hidden;
function openSettings() { $('optSound').checked = save.sound; $('optVibe').checked = save.vibe; $('settingsOverlay').hidden = false; $('settingsDone').focus({ preventScroll: true }); }
function closeSettings() { $('settingsOverlay').hidden = true; }
$('settingsBtn').addEventListener('click', openSettings);
$('titleSettingsBtn').addEventListener('click', openSettings);
$('settingsDone').addEventListener('click', closeSettings);
$('deviceGuideBtn').addEventListener('click', () => { closeSettings(); showDeviceGuide(); });
$('guideDone').addEventListener('click', closeGuide);
$('settingsOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeSettings(); });
$('optSound').addEventListener('change', e => { save.sound = e.target.checked; persist(); if (save.sound) sfx.eat(); });
$('optVibe').addEventListener('change', e => { save.vibe = e.target.checked; persist(); haptic('medium'); });
// light tick on every enabled button press, like native controls
document.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('button:not([disabled])')) haptic('tick'); });
document.addEventListener('contextmenu', e => e.preventDefault());

// swipe anywhere on the game screen (fires as soon as the finger has travelled SWIPE px), tap on the board for nets
const gameScreen = $('gameScreen');
let gest = null;
const swipeDir = (dx, dy) => Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
gameScreen.addEventListener('pointerdown', e => {
  if ((e.target.closest && e.target.closest('button')) || !$('clearOverlay').hidden || settingsOpen() || guideOpen()) return;
  gest = { x: e.clientX, y: e.clientY, id: e.pointerId, fired: false, onBoard: board.contains(e.target) };
  ac(); try { gameScreen.setPointerCapture(e.pointerId); } catch (_) {}
});
gameScreen.addEventListener('pointermove', e => {
  if (!gest || gest.fired || e.pointerId !== gest.id) return;
  const dx = e.clientX - gest.x, dy = e.clientY - gest.y;
  if (Math.hypot(dx, dy) >= SWIPE) { gest.fired = true; tryMove(swipeDir(dx, dy)); }
});
gameScreen.addEventListener('pointerup', e => {
  if (!gest || e.pointerId !== gest.id) return;
  const g0 = gest; gest = null;
  if (g0.fired) return;
  const dx = e.clientX - g0.x, dy = e.clientY - g0.y;
  if (Math.hypot(dx, dy) >= SWIPE) { tryMove(swipeDir(dx, dy)); return; }
  if (!g0.onBoard) return;
  const r = cvs.getBoundingClientRect();
  const gx = Math.floor((e.clientX - r.left - OX) / T), gy = Math.floor((e.clientY - r.top - OY) / T);
  if (gx >= 0 && gy >= 0 && gx < g.w && gy < g.h) tapTile(gx, gy);
});
gameScreen.addEventListener('pointercancel', () => { gest = null; });
window.addEventListener('keydown', e => {
  if (journalOpen()) { if (e.key === 'Escape') closeJournal(); return; }
  if (dailyOpen()) { if (e.key === 'Escape') closeDaily(); return; }
  if (guideOpen()) { if (e.key === 'Escape') closeGuide(); return; }
  if (settingsOpen()) { if (e.key === 'Escape') closeSettings(); return; }
  if (skinsOpen()) { if (e.key === 'Escape') closeSkins(); return; }
  if (!$('clearOverlay').hidden) { if (e.key === 'Escape') replay(); return; }
  if ($('gameScreen').hidden) return;
  const map = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R' };
  if (map[e.key]) { e.preventDefault(); if (e.repeat) return; ac(); tryMove(map[e.key]); }
  else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') { e.preventDefault(); undo(); }
  else if (e.key === 'r' || e.key === 'R') restart();
  else if (e.key === 'h' || e.key === 'H') showHint();
  else if (e.key === 'Escape') show('title');
});
window.addEventListener('resize', () => { resize(); heroW = 0; });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('pagehide', pauseGame);
// native app (Capacitor + @capacitor/app): hardware back returns to the level list, exits from the list
const capApp = window.Capacitor?.Plugins?.App;
if (capApp) capApp.addListener('backButton', () => {
  if (journalOpen()) closeJournal();
  else if (dailyOpen()) closeDaily();
  else if (guideOpen()) closeGuide();
  else if (settingsOpen()) closeSettings();
  else if (skinsOpen()) closeSkins();
  else if ($('gameScreen').hidden) capApp.exitApp(); else show('title');
});
if (capApp) capApp.addListener('appStateChange', ({ isActive }) => { if (!isActive) pauseGame(); });

/* ---------- boot (keeps a game in progress across live page updates) ---------- */
function start(data) {
  refreshSkins();   // grant skins already earned by existing progress
  renderLegend(); renderLevelGrid();
  const resumeDaily = data && data.daily === dailyDate() && (Number.isInteger(data.dailyStage)
    ? data.dailyVersion === DAILY_OPERATION_VERSION && makeDailyStage(data.daily, data.dailyStage) : makeDaily(data.daily));
  const level = resumeDaily ? resumeDaily.level : data && LEVELS[data.lvl];
  const keep = level && data.st && restoreSession({ version: 1, id: 0, layout: levelSignature(level), state: data.st }, level, 0);
  if (data && data.screen === 'game' && keep && resumeDaily) { show('game', false); requestAnimationFrame(() => loadDaily(resumeDaily, keep)); }
  else if (data && !data.daily && data.screen === 'game' && keep && unlocked(data.lvl)) { show('game', false); requestAnimationFrame(() => loadLevel(data.lvl, keep)); }
  else show('title', false);
  requestAnimationFrame(frame);
}
window.claude?.hot?.snapshot?.(() => ({ screen: $('gameScreen').hidden ? 'title' : 'game', lvl: LVL, daily: DAILY ? DAILY.date : null,
  dailyStage: DAILY?.stage, dailyVersion: DAILY?.version, st: st && !anim ? st : null }));
const boot = () => window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(boot, boot); else boot();
})();
