/* ---------- Game ---------- */
(() => {
const $ = id => document.getElementById(id);
const css = getComputedStyle(document.documentElement);
const C = {};
['harbor','water','water-hi','sea','concrete','concrete-2','rail','park','ink','text','muted','buoy','star','net','shark','shark-2']
  .forEach(k => C[k] = css.getPropertyValue('--' + k).trim());
const SHIRTS = ['#e4572e', '#f3a712', '#29335c', '#a8c686', '#ffffff', '#669bbc', '#b56576', '#2b2d42'];
const ANG = { R: 0, D: Math.PI / 2, L: Math.PI, U: -Math.PI / 2 };
const DIR_KO = { U: '위로', D: '아래로', L: '왼쪽으로', R: '오른쪽으로' };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SWIPE = 18;   // px of finger travel that commits a swipe (fires during the move, not on release)

/* ---------- storage (per-viewer convenience only) ---------- */
const STORE_KEY = 'bukang-sea-v1';
let save = { best: {}, last: 0, sound: true };
try { const s = JSON.parse(localStorage.getItem(STORE_KEY)); if (s && s.best) save = Object.assign(save, s); } catch (e) {}
function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(save)); } catch (e) {} }
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

/* ---------- haptics: Capacitor Haptics plugin in the app, navigator.vibrate on Android browsers ---------- */
const Hap = window.Capacitor?.Plugins?.Haptics;
const VIB = { tick: 4, light: 9, medium: 16, heavy: 26, success: [12, 60, 20, 60, 28] };
function haptic(kind) {
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

// stretch > 1 lengthens the body along its heading (speed), < 1 squashes it (impact)
function drawShark(ctx, cx, cy, ang, T, t, moving, stretch = 1, alpha = 1) {
  if (alpha <= 0) return;
  const L = T * 1.2, W = T * 0.34;
  const wag = Math.sin(t * (moving ? 18 : 5)) * (moving ? 0.34 : 0.2);
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(cx, cy); ctx.rotate(ang); ctx.scale(stretch, 1 + (1 - stretch) * 0.8);
  ctx.fillStyle = 'rgba(4,20,26,.22)';
  ctx.beginPath(); ctx.ellipse(T * 0.05, T * 0.07, L * 0.46, W * 0.7, 0, 0, Math.PI * 2); ctx.fill();
  // tail
  ctx.save(); ctx.translate(-L * 0.3, 0); ctx.rotate(wag);
  ctx.fillStyle = C['shark-2'];
  ctx.beginPath();
  ctx.moveTo(0, -W * 0.24); ctx.lineTo(-L * 0.2, -W * 0.08); ctx.lineTo(-L * 0.2, W * 0.08); ctx.lineTo(0, W * 0.24); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-L * 0.16, 0); ctx.lineTo(-L * 0.34, -W * 0.85); ctx.quadraticCurveTo(-L * 0.25, -W * 0.1, -L * 0.3, 0);
  ctx.quadraticCurveTo(-L * 0.25, W * 0.1, -L * 0.31, W * 0.55); ctx.closePath(); ctx.fill();
  ctx.restore();
  // pectoral fins
  ctx.fillStyle = C['shark-2'];
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(L * 0.14, s * W * 0.38); ctx.lineTo(-L * 0.1, s * W * 1.3);
    ctx.quadraticCurveTo(-L * 0.02, s * W * 0.6, -L * 0.04, s * W * 0.34); ctx.fill();
  }
  // body
  ctx.fillStyle = C.shark;
  ctx.beginPath();
  ctx.moveTo(L * 0.5, 0);
  ctx.bezierCurveTo(L * 0.47, -W * 0.52, L * 0.2, -W * 0.56, 0, -W * 0.5);
  ctx.bezierCurveTo(-L * 0.18, -W * 0.44, -L * 0.3, -W * 0.24, -L * 0.34, 0);
  ctx.bezierCurveTo(-L * 0.3, W * 0.24, -L * 0.18, W * 0.44, 0, W * 0.5);
  ctx.bezierCurveTo(L * 0.2, W * 0.56, L * 0.47, W * 0.52, L * 0.5, 0);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.beginPath(); ctx.ellipse(L * 0.12, -W * 0.12, L * 0.28, W * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  // dorsal fin seen from above
  ctx.fillStyle = C['shark-2'];
  ctx.beginPath(); ctx.moveTo(L * 0.1, 0); ctx.quadraticCurveTo(-L * 0.02, -W * 0.2, -L * 0.14, 0); ctx.quadraticCurveTo(-L * 0.02, W * 0.2, L * 0.1, 0); ctx.fill();
  // eyes
  for (const s of [-1, 1]) {
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(L * 0.35, s * W * 0.3, T * 0.034, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(L * 0.36, s * W * 0.3 - T * 0.012, T * 0.011, 0, Math.PI * 2); ctx.fill();
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
function drawBoat(ctx, cx, cy, T, t) {
  const L = T * 0.44, W = T * 0.23;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(t * 1.6 + cx) * 0.05);
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
  ctx.fillStyle = `rgba(111,208,204,${0.22 + flash * 0.45})`; ctx.fillRect(x, y, T, T);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, T, T); ctx.clip();
  ctx.translate(x + T / 2, y + T / 2); ctx.rotate(ANG[dir]);
  ctx.strokeStyle = flash ? '#ffffff' : C['water-hi']; ctx.lineWidth = Math.max(2, T * 0.07); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const off = reduceMotion ? 0 : (t * (1.4 + flash * 3) % 1) * T * 0.5;
  for (let k = -2; k <= 1; k++) {
    const px = k * T * 0.5 + off;
    ctx.globalAlpha = 0.9 - Math.abs(px) / T;
    ctx.beginPath(); ctx.moveTo(px - T * 0.12, -T * 0.2); ctx.lineTo(px + T * 0.08, 0); ctx.lineTo(px - T * 0.12, T * 0.2); ctx.stroke();
  }
  ctx.restore(); ctx.globalAlpha = 1;
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
let T = 40, staticLayer = null, dpr = 1, waterPath = null, causticPat = null;
const particles = [], wake = [];
const view = { x: 0, y: 0, ang: 0, target: 0 };
let settle = null, pop = null, queued = null, clock = 0;
const netPop = new Map(), jetFlash = new Map();
let hudLast = { moves: -1, fish: -1 };

function freshState(i) {
  g = parseLevel(LEVELS[i]);
  return { pos: g.start.slice(), dir: 'U', fish: [], nets: [], moves: 0, history: [] };
}
function netSet() { return new Set(st.nets); }
function fishMask() { let m = 0; st.fish.forEach(i => m |= 1 << i); return m; }

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
  LVL = i; save.last = i; persist();
  st = keep || freshState(i);
  if (keep) g = parseLevel(LEVELS[i]);
  anim = null; bump = null; hint = null; cleared = false; particles.length = 0; wake.length = 0;
  settle = null; pop = { t: 0 }; queued = null; netPop.clear(); jetFlash.clear();
  view.x = st.pos[0]; view.y = st.pos[1]; view.ang = view.target = ANG[st.dir];
  $('lvNum').textContent = `${chapterOf(i).ci + 1}장 · 수로 ${i + 1} / ${LEVELS.length}`;
  $('lvName').textContent = LEVELS[i].name;
  setTip(LEVELS[i].tip);
  $('clearOverlay').hidden = true;
  hudLast = { moves: -1, fish: -1 };
  resize(); updateHud();
  frameEl.classList.remove('enter'); void frameEl.offsetWidth; frameEl.classList.add('enter');
  ring(st.pos[0], st.pos[1], 0.9, 0.4);
}
function setTip(text, isHint) {
  const el = $('tip'); el.textContent = text; el.classList.toggle('hint', !!isHint);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}
function updateHud() {
  const L = LEVELS[LVL], parts = [];
  parts.push(`<span class="chip${st.moves > L.par ? ' over' : ''}"><span class="k">이동</span><b>${st.moves}</b><span class="k">/ 기준 ${L.par}</span></span>`);
  if (g.fish.length) parts.push(`<span class="chip${st.fish.length === g.fish.length ? ' done' : ''}"><span class="k">숭어</span><b>${st.fish.length} / ${g.fish.length}</b></span>`);
  if (g.nets) parts.push(`<span class="chip net"><span class="k">남은 그물</span><b>${g.nets - st.nets.length}</b></span>`);
  $('stats').innerHTML = parts.join('');
  const bs = $('stats').querySelectorAll('.chip b');
  if (hudLast.moves >= 0 && st.moves !== hudLast.moves && bs[0]) bs[0].classList.add('bump');
  if (g.fish.length && hudLast.fish >= 0 && st.fish.length !== hudLast.fish && bs[1]) bs[1].classList.add('bump');
  hudLast = { moves: st.moves, fish: st.fish.length };
  $('undoBtn').disabled = !st.history.length;
}
function pushHistory() {
  st.history.push({ pos: st.pos.slice(), dir: st.dir, fish: st.fish.slice(), nets: st.nets.slice(), moves: st.moves });
  if (st.history.length > 200) st.history.shift();
}

// The result is committed at once; the screen follows through `anim`. A swipe during the glide is queued (one deep).
function tryMove(d) {
  if (cleared) return;
  if (anim) { queued = d; return; }
  const r = slide(g, st.pos, d, netSet());
  hint = null; if ($('tip').classList.contains('hint')) setTip(LEVELS[LVL].tip);
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
  const dirs = [d, ...r.path.map(p => p[2])];
  if (r.win) { const last = r.path[r.path.length - 1]; const [dx, dy] = DIRS[last[2]]; for (let k = 1; k <= 3; k++) { pts.push([last[0] + dx * k, last[1] + dy * k]); dirs.push(last[2]); } }
  const steps = r.path.length;
  st.moves++; st.pos = r.end.slice(); st.dir = r.path[steps - 1][2];
  anim = { pts, dirs, p: 0, t: 0, n: pts.length - 1, steps, speed: 0, eats, jets, win: r.win, eaten: new Set(), exitFx: false,
    dur: Math.min(0.62, 0.09 + 0.052 * steps) + (r.win ? 0.3 : 0) };
  settle = null; pop = null;
  ring(pts[0][0], pts[0][1], 0.7, 0.35);
  sfx.move(); haptic('tick'); updateHud();
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
  const d = a.dirs[a.steps], amp = Math.min(1, a.steps / 5), [dx, dy] = DIRS[d];
  settle = { t: 0, d, amp };
  ring(view.x + dx * 0.3, view.y + dy * 0.3, 0.6 + 0.5 * amp, 0.5);
  splashAt(view.x + dx * 0.45, view.y + dy * 0.45, 4 + Math.round(6 * amp), d, 0.5 + amp * 0.7);
  sfx.stop(amp);
  if (queued) { const q = queued; queued = null; tryMove(q); }
}
function undo() {
  if (anim || !st.history.length) return;
  const h = st.history.pop();
  Object.assign(st, { pos: h.pos, dir: h.dir, fish: h.fish, nets: h.nets, moves: h.moves });
  view.x = st.pos[0]; view.y = st.pos[1]; view.target = ANG[st.dir];
  cleared = false; hint = null; settle = null; queued = null; wake.length = 0; pop = { t: 0 };
  ring(view.x, view.y, 0.8, 0.45); sfx.undo(); haptic('tick');
  setTip(LEVELS[LVL].tip); updateHud();
}
function restart() { if (anim) return; loadLevel(LVL); haptic('light'); }

function tapTile(gx, gy) {
  if (anim || cleared) return;
  if (!g.nets) { setTip('화면을 밀어서 상어를 움직여요. 방향키도 돼요.'); return; }
  const idx = gy * g.w + gx, c = cellAt(g, gx, gy);
  const hasFish = g.fish.some((f, i) => f[0] === gx && f[1] === gy && !st.fish.includes(i));
  const at = st.nets.indexOf(idx);
  if (at >= 0) { pushHistory(); st.nets.splice(at, 1); netPop.delete(idx); sfx.net(); haptic('tick'); ring(gx, gy, 0.6, 0.35); hint = null; updateHud(); return; }
  if (c !== '.' || hasFish || (gx === st.pos[0] && gy === st.pos[1])) { setTip('그물은 비어 있는 물 위에만 칠 수 있어요.'); haptic('light'); return; }
  if (st.nets.length >= g.nets) { setTip('그물을 다 썼어요. 쳐 둔 그물을 누르면 다시 걷을 수 있어요.'); haptic('light'); return; }
  pushHistory(); st.nets.push(idx); netPop.set(idx, clock); sfx.net(); haptic('medium');
  ring(gx, gy, 0.9, 0.5); splashAt(gx, gy, 6, null, 0.5);
  hint = null; setTip(LEVELS[LVL].tip); updateHud();
}

function showHint() {
  if (anim || cleared) return;
  haptic('tick');
  setTip('길을 찾는 중…', true);
  setTimeout(() => {
    const ns = netSet(), left = g.nets - st.nets.length;
    let p = plan(g, st.pos, fishMask(), ns, left, true), partial = false;
    if (!p) { p = plan(g, st.pos, fishMask(), ns, left, false); partial = true; }
    if (!p) { hint = null; setTip('여기서는 나갈 길이 없어요. 되돌리기를 눌러 보세요.', true); return; }
    hint = { dir: p.seq[0], nets: p.add };
    const netTxt = p.add.length ? `반짝이는 칸에 그물을 치고, ` : '';
    const more = partial ? ' 숭어를 다 먹기는 어려워졌어요.' : ` 앞으로 ${p.moves}번이면 나가요.`;
    setTip(`힌트: ${netTxt}${DIR_KO[p.seq[0]]} 밀어 보세요.${more}`, true);
  }, 30);
}

function onClear() {
  cleared = true;
  const L = LEVELS[LVL];
  const allFish = st.fish.length === g.fish.length, inPar = st.moves <= L.par;
  const stars = 1 + (allFish ? 1 : 0) + (inPar ? 1 : 0);
  const prev = save.best[LVL] || 0;
  save.best[LVL] = Math.max(prev, stars); persist();
  sfx.win();
  const starSvg = on => `<svg class="star${on ? ' on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>`;
  $('clearStars').innerHTML = [true, allFish, inPar].map(starSvg).join('');
  $('clearStars').setAttribute('aria-label', `별 ${stars}개`);
  const titles = ['바다로 나갔어요!', '시원하게 탈출!', '상어야, 잘 가!'];
  const chap = chapterOf(LVL), chapterEnd = LVL === chap.end;
  $('clearTitle').textContent = LVL === LEVELS.length - 1 ? '드디어 넓은 바다로!' : chapterEnd ? `${chap.name} 통과!` : titles[stars - 1];
  const row = (label, val, ok) => `<li><span>${label}</span><span class="${ok ? 'ok' : 'no'}">${val}</span></li>`;
  $('clearChecks').innerHTML =
    row('바다로 탈출', '성공', true) +
    row('숭어 모두 먹기', g.fish.length ? `${st.fish.length} / ${g.fish.length}` : '숭어 없음', allFish) +
    row('이동 기준', `${st.moves}번 / ${L.par}번`, inPar);
  const last = LVL === LEVELS.length - 1;
  $('nextBtn').textContent = last ? '수로 목록' : chapterEnd ? '다음 장으로' : '다음 수로';
  setTimeout(() => {
    if (!cleared) return;
    $('clearOverlay').hidden = false; $('nextBtn').focus({ preventScroll: true });
    [true, allFish, inPar].forEach((on, k) => { if (on) setTimeout(() => haptic('light'), 180 + k * 120); });
  }, reduceMotion ? 50 : 650);
  renderLevelGrid();
}

/* ---------- rendering ---------- */
const board = $('board'), frameEl = $('boardFrame'), cvs = $('boardCanvas'), ctx = cvs.getContext('2d');
const CROP = 0.3;   // share of each outer promenade column that may be cut off to make the tiles bigger
function resize() {
  if (!g || $('gameScreen').hidden) return;
  const r = board.getBoundingClientRect();
  T = Math.max(18, Math.floor(Math.min(r.width / (g.w - 2 * CROP), r.height / g.h, 132)));
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const full = g.w * T, shown = Math.min(full, Math.floor(r.width));
  frameEl.style.width = shown + 'px'; frameEl.style.height = g.h * T + 'px';
  cvs.style.marginLeft = Math.round((shown - full) / 2) + 'px';
  cvs.style.width = full + 'px'; cvs.style.height = g.h * T + 'px';
  cvs.width = Math.round(g.w * T * dpr); cvs.height = Math.round(g.h * T * dpr);
  causticPat = null;
  buildStatic();
}
const isLand = (x, y) => cellAt(g, x, y) === '#';
function buildStatic() {
  staticLayer = document.createElement('canvas');
  staticLayer.width = cvs.width; staticLayer.height = cvs.height;
  const s = staticLayer.getContext('2d'); s.scale(dpr, dpr);
  waterPath = new Path2D();
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const px = x * T, py = y * T;
    if (!isLand(x, y)) { s.fillStyle = C.water; s.fillRect(px, py, T, T); waterPath.rect(px, py, T, T); continue; }
    s.fillStyle = C.concrete; s.fillRect(px, py, T, T);
    s.strokeStyle = C['concrete-2']; s.lineWidth = 1;
    s.beginPath(); s.moveTo(px, py + T / 2 + .5); s.lineTo(px + T, py + T / 2 + .5);
    const off = (y % 2) * T / 2; s.moveTo(px + off + .5, py); s.lineTo(px + off + .5, py + T / 2); s.moveTo(px + ((off + T / 2) % T) + .5, py + T / 2); s.lineTo(px + ((off + T / 2) % T) + .5, py + T); s.stroke();
  }
  // shade on water next to land, railings and onlookers on land next to water
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const px = x * T, py = y * T, seed = hash(y * 97 + x * 31 + LVL * 7);
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
    const waterSides = nb.filter(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < g.w && ny < g.h && !isLand(nx, ny); });
    if (!waterSides.length) {
      if (seed < 0.4) { s.fillStyle = C.park; s.beginPath(); s.arc(px + T * (0.3 + seed), py + T * 0.5, T * 0.26, 0, 7); s.fill(); s.fillStyle = 'rgba(255,255,255,.14)'; s.beginPath(); s.arc(px + T * (0.25 + seed), py + T * 0.43, T * 0.1, 0, 7); s.fill(); }
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
      const n = seed > 0.25 ? 2 : 1;
      for (let j = 0; j < n; j++) {
        const sd = hash(x * 13 + y * 7 + j * 5 + k * 3 + LVL), along = (j + 0.5) / n + (sd - 0.5) * 0.2, inset = T * 0.22;
        let qx = px + T * along, qy = py + T * along;
        if (dy === -1) qy = py + inset; if (dy === 1) qy = py + T - inset;
        if (dx === -1) qx = px + inset; if (dx === 1) qx = px + T - inset;
        if (dy) qx = px + T * along; else qy = py + T * along;
        drawPerson(s, qx, qy, T, sd);
      }
    });
  }
}

let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  const t = now / 1000;
  if (!$('gameScreen').hidden && g && staticLayer) {
    step(dt); draw(t);
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
    view.x = A[0] + (B[0] - A[0]) * f; view.y = A[1] + (B[1] - A[1]) * f;
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
    if (u >= 1) finishAnim();
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
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const eatenNow = new Set(st.fish); if (anim) anim.eaten.forEach(i => eatenNow.add(i));
  // light on the water
  ctx.save(); ctx.clip(waterPath);
  if (!causticPat) causticPat = ctx.createPattern(caustic, 'repeat');
  const ct = reduceMotion ? 0 : t, sc = T / 60;
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = causticPat;
  for (const [ox, oy, s, al] of [[ct * 7, ct * 4, sc, 0.09], [-ct * 5, ct * 6, sc * 1.4, 0.06]]) {
    ctx.save(); ctx.globalAlpha = al; ctx.scale(s, s); ctx.translate(ox % 128, oy % 128);
    ctx.fillRect(-128, -128, g.w * T / s + 256, g.h * T / s + 256); ctx.restore();
  }
  ctx.restore();
  // ripples
  ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 1.5;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const c = cellAt(g, x, y); if (c === '#') continue;
    const px = x * T, py = y * T;
    if (c === 'E') { drawExit(ctx, px, py, T, g, x, y, t); continue; }
    const ph = reduceMotion ? 0 : t * 0.8 + hash(x * 5 + y * 11) * 6;
    ctx.beginPath();
    for (let k = 0; k <= 8; k++) { const qx = px + T * 0.18 + k * T * 0.08, qy = py + T * (0.35 + hash(x + y * 3) * 0.3) + Math.sin(ph + k * 0.8) * T * 0.035; k ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy); }
    ctx.stroke();
  }
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const c = cellAt(g, x, y), px = x * T, py = y * T;
    if (JET[c]) drawJet(ctx, px, py, T, JET[c], t, jetFlash.get(y * g.w + x) || 0);
    else if (c === 'o') drawBuoy(ctx, px + T / 2, py + T / 2, T, t);
    else if (c === 'b') drawBoat(ctx, px + T / 2, py + T / 2, T, t);
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
  st.nets.forEach(i => {
    const t0 = netPop.get(i), k = t0 == null ? 1 : (clock - t0) / 0.32;
    drawNet(ctx, (i % g.w) * T, Math.floor(i / g.w) * T, T, false, t, k >= 1 ? 1 : 0.4 + 0.6 * easeOutBack(clamp01(k)));
  });
  if (hint) hint.nets.forEach(i => drawNet(ctx, (i % g.w) * T, Math.floor(i / g.w) * T, T, true, t));
  g.fish.forEach(([fx, fy], i) => { if (!eatenNow.has(i)) drawFish(ctx, fx * T + T / 2, fy * T + T / 2, T, t, hash(i * 17 + LVL)); });
  for (const p of particles) if (p.kind === 'fish') drawFish(ctx, p.x * T + T / 2, p.y * T + T / 2, T, t * 4, hash(p.fi * 17 + LVL), Math.max(0.05, p.life));
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
  const bob = anim ? 0 : Math.sin(t * 2) * 0.02;
  drawShark(ctx, sx * T + T / 2, (sy + bob) * T + T / 2, view.ang, T * size, t, !!anim, stretch, alpha);
  if (hint && !anim) {
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
  const W = heroW, H = heroH, waterH = Math.max(H * 0.4, H - 150), T = Math.min(96, W / 5.2);   // keep ~150px of promenade for the title text
  hctx.fillStyle = C.water; hctx.fillRect(0, 0, W, waterH);
  hctx.strokeStyle = 'rgba(255,255,255,.1)'; hctx.lineWidth = 1.5;
  for (let r = 0; r < 4; r++) { hctx.beginPath(); for (let x = 0; x <= W; x += 8) { const y = 16 + r * waterH / 4 + Math.sin(x * 0.03 + t * (1 + r * .2) + r) * 3; x ? hctx.lineTo(x, y) : hctx.moveTo(x, y); } hctx.stroke(); }
  hctx.fillStyle = C.concrete; hctx.fillRect(0, waterH, W, H - waterH);
  hctx.fillStyle = 'rgba(6,30,38,.3)'; hctx.fillRect(0, waterH - 5, W, 5);
  hctx.strokeStyle = C.rail; hctx.lineWidth = 3; hctx.beginPath(); hctx.moveTo(0, waterH + 3); hctx.lineTo(W, waterH + 3); hctx.stroke();
  for (let i = 0; i < Math.floor(W / 26); i++) drawPerson(hctx, 13 + i * 26 + hash(i) * 8, waterH + 16 + hash(i + 50) * 4, T * 0.9, hash(i * 7 + 3));
  const span = W + T * 2, sx = ((t * 60) % span) - T, sy = waterH * 0.52 + Math.sin(t * 1.5) * waterH * 0.12;
  const ang = Math.atan2(Math.cos(t * 1.5) * waterH * 0.12 * 1.5, 60);
  drawShark(hctx, sx, sy, ang, T, t, true, 1.05);
  drawFish(hctx, ((W * 0.8 + t * 20) % (W + 40)) - 20, waterH * 0.26, T * 0.9, t, 0.3);
  drawBuoy(hctx, W * 0.86, waterH * 0.68, T * 0.8, t);
}

/* ---------- UI wiring ---------- */
function renderLevelGrid() {
  const grid = $('levelGrid'); let total = 0;
  const button = (L, i, k) => {
    const b = save.best[i] || 0; total += b; const ok = unlocked(i);
    const stars = '★'.repeat(b) + `<i>${'★'.repeat(3 - b)}</i>`;
    return `<button class="lv${i === save.last ? ' cur' : ''}" type="button" data-i="${i}" style="--i:${k}" ${ok ? '' : 'disabled'} aria-label="수로 ${i + 1} ${L.name}${ok ? `, 별 ${b}개` : ', 잠김'}">
      <span class="n">${i + 1}</span><span class="nm">${ok ? L.name : '잠김'}</span><span class="st">${stars}</span></button>`;
  };
  let start = 0;
  grid.innerHTML = CHAPTERS.map((ch, ci) => {
    const idx = Array.from({ length: ch.count }, (_, k) => start + k); start += ch.count;
    const before = total, buttons = idx.map((i, k) => button(LEVELS[i], i, k)).join('');
    return `<div class="chapter-head${unlocked(idx[0]) ? '' : ' locked'}"><span><b>${ci + 1}장</b> ${ch.name}</span><span>★ ${total - before} / ${ch.count * 3}</span></div>
      <div class="levels">${buttons}</div>`;
  }).join('');
  $('levelCount').textContent = `수로 ${LEVELS.length}곳`;
  $('starTotal').textContent = `★ ${total} / ${LEVELS.length * 3}`;
  $('playBtn').textContent = Object.keys(save.best).length ? `이어서 하기 · 수로 ${nextLevel() + 1}` : '시작하기';
}
function nextLevel() {
  for (let i = 0; i < LEVELS.length; i++) if (save.best[i] == null) return i;
  return Math.min(save.last, LEVELS.length - 1);
}
function renderLegend() {
  const items = [
    ['fish', '숭어 · 먹으면 별 +1'], ['buoy', '부표 · 앞에서 멈춰요'],
    ['boat', '구조정 · 앞에서 멈춰요'], ['jet', '물줄기 · 방향이 꺾여요'],
    ['net', '그물 · 톡 눌러 치기'], ['exit', '바다 · 여기로 나가요'],
  ];
  $('legend').innerHTML = items.map(([k, l]) => `<div><canvas data-k="${k}" width="72" height="72"></canvas><span>${l}</span></div>`).join('');
  $('legend').querySelectorAll('canvas').forEach(c => {
    const x = c.getContext('2d'); x.scale(2, 2); const S = 36, k = c.dataset.k;
    x.fillStyle = C.water; x.fillRect(0, 0, S, S);
    if (k === 'fish') drawFish(x, 18, 18, S * 1.4, 0.4, 0.1);
    if (k === 'buoy') drawBuoy(x, 18, 18, S * 1.3, 0);
    if (k === 'boat') drawBoat(x, 18, 18, S * 1.2, 0);
    if (k === 'jet') drawJet(x, 0, 0, S, 'R', 0.2);
    if (k === 'net') drawNet(x, 0, 0, S, false, 0);
    if (k === 'exit') drawExit(x, 0, 0, S, { w: 3, h: 3 }, 1, 0, 0);
  });
}
// screen change with a native-style push (into a level) or pop (back to the list)
function show(which, animate = true) {
  const el = which === 'title' ? $('titleScreen') : $('gameScreen');
  $('titleScreen').hidden = which !== 'title';
  $('gameScreen').hidden = which !== 'game';
  el.classList.remove('enter-fwd', 'enter-back');
  if (animate && !reduceMotion) { void el.offsetWidth; el.classList.add(which === 'game' ? 'enter-fwd' : 'enter-back'); }
  if (which === 'title') { $('clearOverlay').hidden = true; renderLevelGrid(); heroW = 0; }
  else requestAnimationFrame(resize);
}
function startLevel(i) { if (!unlocked(i)) return; show('game'); loadLevel(i); }

$('levelGrid').addEventListener('click', e => { const b = e.target.closest('.lv'); if (b && !b.disabled) { ac(); startLevel(+b.dataset.i); } });
$('playBtn').addEventListener('click', () => { ac(); startLevel(nextLevel()); });
$('backBtn').addEventListener('click', () => show('title'));
$('undoBtn').addEventListener('click', undo);
$('restartBtn').addEventListener('click', restart);
$('hintBtn').addEventListener('click', showHint);
$('againBtn').addEventListener('click', () => loadLevel(LVL));
$('nextBtn').addEventListener('click', () => { if (LVL < LEVELS.length - 1) loadLevel(LVL + 1); else show('title'); });
function syncSound() {
  const b = $('soundBtn');
  b.classList.toggle('muted', !save.sound); b.setAttribute('aria-pressed', String(save.sound));
  b.setAttribute('aria-label', save.sound ? '소리 끄기' : '소리 켜기');
}
$('soundBtn').addEventListener('click', () => { save.sound = !save.sound; persist(); syncSound(); if (save.sound) sfx.eat(); });
syncSound();
// light tick on every enabled button press, like native controls
document.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('button:not([disabled])')) haptic('tick'); });
document.addEventListener('contextmenu', e => e.preventDefault());

// swipe anywhere on the game screen (fires as soon as the finger has travelled SWIPE px), tap on the board for nets
const gameScreen = $('gameScreen');
let gest = null;
const swipeDir = (dx, dy) => Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
gameScreen.addEventListener('pointerdown', e => {
  if ((e.target.closest && e.target.closest('button')) || !$('clearOverlay').hidden) return;
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
  const gx = Math.floor((e.clientX - r.left) / T), gy = Math.floor((e.clientY - r.top) / T);
  if (gx >= 0 && gy >= 0 && gx < g.w && gy < g.h) tapTile(gx, gy);
});
gameScreen.addEventListener('pointercancel', () => { gest = null; });
window.addEventListener('keydown', e => {
  if (!$('clearOverlay').hidden) { if (e.key === 'Escape') loadLevel(LVL); return; }
  if ($('gameScreen').hidden) return;
  const map = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R' };
  if (map[e.key]) { e.preventDefault(); if (e.repeat) return; ac(); tryMove(map[e.key]); }
  else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') { e.preventDefault(); undo(); }
  else if (e.key === 'r' || e.key === 'R') restart();
  else if (e.key === 'h' || e.key === 'H') showHint();
  else if (e.key === 'Escape') show('title');
});
window.addEventListener('resize', () => { resize(); heroW = 0; });
// native app (Capacitor + @capacitor/app): hardware back returns to the level list, exits from the list
const capApp = window.Capacitor?.Plugins?.App;
if (capApp) capApp.addListener('backButton', () => { if ($('gameScreen').hidden) capApp.exitApp(); else show('title'); });

/* ---------- boot (keeps a game in progress across live page updates) ---------- */
function start(data) {
  renderLegend(); renderLevelGrid();
  if (data && data.screen === 'game' && data.st && LEVELS[data.lvl]) { show('game', false); requestAnimationFrame(() => loadLevel(data.lvl, data.st)); }
  else show('title', false);
  requestAnimationFrame(frame);
}
window.claude?.hot?.snapshot?.(() => ({ screen: $('gameScreen').hidden ? 'title' : 'game', lvl: LVL, st: st && !anim ? st : null }));
const boot = () => window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(boot, boot); else boot();
})();
