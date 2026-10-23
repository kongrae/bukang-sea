// Promotional short for YouTube Shorts / Instagram Reels: 1080x1920 H.264/AAC MP4 with the game's own sound.
// Four canals (current, net, whirlpool, sluice) are played with the real rules and solver routes on a local-only build of
// src/ that carries a small control probe (never shipped, like the QA builds). Headless Edge/Chrome over the DevTools
// protocol, no npm packages and no ffmpeg: screencast frames are painted on an offscreen canvas together with captions,
// touch marks and the end card, and MediaRecorder muxes that canvas with the live Web Audio output. Each cut pauses the
// recorder behind a curtain, so loading the next canal never shows. tools/mp4-progressive.js then turns the recorder's
// fragmented MP4 into an ordinary one, and the written file is decoded once more for the checks.
//   node tools/promo-video.js      -> outputs/promo/shark-sos-short.mp4, contact-sheet.png, frame-*.png, report.json
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { gameBody } = require('./build-source');
const { toProgressive, describe } = require('./mp4-progressive');
const E = require('../src/engine.js');
const { LEVELS, STORY_ORDER } = require('../src/levels.js');

const root = path.join(__dirname, '..');
const out = path.join(root, 'outputs', 'promo');
const fileUrl = p => 'file:///' + p.replace(/\\/g, '/');
const browser = [process.env.BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
if (!browser) { console.error('No Chromium browser found. Set BROWSER=<path>.'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9336;
const MIME = 'video/mp4;codecs=avc1.640028,mp4a.40.2';

// Canals by play number. `needs` must appear in the solver route, so a redesigned canal fails here instead of filming
// a scene that no longer shows its device. Captions are keyed by move index; {word} is drawn in the accent colour.
const SCENES = [
  { canal: 4, needs: 'jet', captions: { 0: ['수로에 갇힌 상어,', '{바다}로 보내 줄래요?'], 3: ['밀면 벽까지 {쭉!}', '{물살}을 타면 꺾여요'] } },
  { canal: 25, needs: 'net', captions: { 0: ['톡! {그물}을 치면', '그 앞에서 멈춰요'] } },
  { canal: 49, needs: 'whirl', captions: { 0: ['{소용돌이}에 들어가면', '건너편으로 슝!'] } },
  { canal: 63, needs: 'switch', captions: { 0: ['{스위치}를 밟으면', '수문이 열리고 닫혀요'] }, result: ['숭어까지 다 먹고 나가면', '{별 3개}!'] },
];
const END = { title: '상어 SOS', subtitle: '바다로 보내줘!', chips: ['84개 수로', '매일 새 구조작전', '오프라인 플레이'], cta: 'Google Play에서 무료' };

// Local-only control probe, inserted before boot like the QA builds. It only reads state and calls existing functions.
const PROBE = `
window.promo = {
  enter(i) { save.coachSwipe = save.coachNet = true; save.seenDevices = DEVICE_GUIDES.map(d => d.key); show('game', false); loadLevel(i, null, LEVELS[i]); },
  // The end card shows the main screen's sea and shark only; its title, stars and settings button stay out of the shot.
  title() { show('title', false); document.querySelector('.lobby-hud').style.opacity = '0'; },
  async audio() {
    save.sound = true; save.vibe = false; sound.syncEnabled(); ac(); await sound.loaded();
    const c = window.promoTap && window.promoTap.context;
    if (c && c.state !== 'running') await c.resume();
    return c ? c.state : 'none';
  },
  tap(k) { tapTile(k % g.w, Math.floor(k / g.w)); },
  move(d) { tryMove(d); },
  busy() { return !!anim || !!queued; },
  shark() { return st.pos[1] * g.w + st.pos[0]; },
  cell(k) { const r = cvs.getBoundingClientRect(), P = boardProjection(); return [r.left + OX + (k % g.w + .5) * T, r.top + (OY + (Math.floor(k / g.w) + .5) * T) * P + CH * (1 - P) / 2]; },
  state() { return { cleared, moves: st.moves, fish: st.fish.length, total: g.fish.length, sheet: !$('clearOverlay').hidden }; },
};
`;
// Copies every connection to the speakers into one MediaStream per context (recorded with the picture). The copy is
// raised 6 dB behind a limiter: the game mixes quietly for phone speakers, and platforms do not raise quiet uploads.
const AUDIO_TAP = `(() => {
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (destination, ...args) {
    const result = connect.call(this, destination, ...args);
    if (destination && destination === this.context.destination) {
      const ctx = this.context;
      if (!ctx.promoTap) {
        ctx.promoTap = ctx.createMediaStreamDestination(); window.promoTap = ctx.promoTap;
        ctx.promoBoost = ctx.createGain(); ctx.promoBoost.gain.value = 2;
        const limit = ctx.createDynamicsCompressor();
        limit.threshold.value = -3; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = .002; limit.release.value = .12;
        connect.call(ctx.promoBoost, limit); connect.call(limit, ctx.promoTap);
      }
      connect.call(this, ctx.promoBoost);
    }
    return result;
  };
})();`;

function buildPage() {
  const hook = 'const boot = () =>';
  let body = gameBody();
  if (body.split(hook).length !== 2) throw new Error('promo build hook changed: ' + hook);
  body = body.replace(hook, PROBE + '\n' + hook);
  // Same subset fonts as the app (www/); Google Fonts from shell.html stay for the caption text, which needs more glyphs.
  const fonts = [['Bukang Display', 400, 'jua-400'], ['Bukang Body', 400, 'noto-sans-kr-400'], ['Bukang Body', 500, 'noto-sans-kr-500'], ['Bukang Body', 700, 'noto-sans-kr-700']]
    .map(([family, weight, file]) => `@font-face { font-family: "${family}"; font-weight: ${weight}; src: url("../../assets/fonts/${file}.woff2") format("woff2"); }`).join('\n');
  const file = path.join(out, 'game.html');
  fs.writeFileSync(file, `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>상어 SOS 홍보 영상 촬영용</title>
<style>${fonts}</style>
</head>
<body style="margin:0;background:#e8f8f5">
${body}
</body>
</html>
`);
  return file;
}

// Solver route of a canal as [{ dir, nets: new net cells before that swipe, feat }].
function route(levelIndex) {
  const g = E.parseLevel(LEVELS[levelIndex]);
  const p = E.plan(g, g.start, 0, new Set(), g.nets, true, g.boats, 0, false, g.crates || []);
  if (!p) throw new Error('no route for LEVELS[' + levelIndex + ']');
  let pos = g.start, boats = g.boats, gate = 0, crates = g.crates || [], set = new Set(), mask = 0;
  return p.steps.map(s => {
    const placed = new Set(s.nets), r = E.turn(g, pos, s.dir, placed, boats, gate, crates, mask);
    const feat = [];
    if (s.nets.some(i => !set.has(i))) feat.push('net');
    if (r.path.some(([x, y]) => '^v<>'.includes(g.cells[y * g.w + x]))) feat.push('jet');
    if (r.path.some(q => q[3])) feat.push('whirl');
    if (r.pressed) feat.push('switch');
    for (const [x, y] of r.path) g.fish.forEach(([fx, fy], fi) => { if (x === fx && y === fy) mask |= 1 << fi; });
    const step = { dir: s.dir, nets: s.nets.filter(i => !set.has(i)), feat };
    pos = r.end; boats = r.boats; gate = r.gate; crates = r.crates; set = placed;
    return step;
  });
}

// Runs in the page: offscreen 1080x1920 composition (game frame, touch marks, caption, curtain, end card) and the recorder.
function promoPage({ icon, mime, end }) {
  const W = 1080, H = 1920, k = W / innerWidth;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const img = new Image(); img.src = icon;
  const ink = '#1f4f5e', accent = '#f2742a', paper = '#fffdf6', line = '#8fd6cf';
  const clamp = t => Math.max(0, Math.min(1, t)), out3 = t => 1 - Math.pow(1 - clamp(t), 3), in2 = t => clamp(t) * clamp(t);
  const DIR = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
  const rec = window.promoRec = { frames: 0, bitmap: null, caption: null, captionAt: 0, marks: [], wipe: null, end: null, chunks: [] };
  const plain = s => s.replace(/[{}]/g, '');
  function rich(text, cx, cy) {
    const parts = text.split(/(\{[^}]*\})/).filter(Boolean).map(p => ({ t: plain(p), hi: p[0] === '{' }));
    let px = cx - parts.reduce((a, p) => a + x.measureText(p.t).width, 0) / 2;
    for (const p of parts) { x.fillStyle = p.hi ? accent : ink; x.fillText(p.t, px, cy); px += x.measureText(p.t).width; }
  }
  function card(X, Y, w, h, r) {
    x.save(); x.shadowColor = 'rgba(18,64,74,.28)'; x.shadowBlur = 32; x.shadowOffsetY = 10;
    x.beginPath(); x.roundRect(X, Y, w, h, r); x.fillStyle = paper; x.fill(); x.restore();
    x.lineWidth = 6; x.strokeStyle = line; x.beginPath(); x.roundRect(X, Y, w, h, r); x.stroke();
  }
  function dot(px, py, a, s) {
    x.save(); x.globalAlpha = a; x.shadowColor = 'rgba(10,40,50,.35)'; x.shadowBlur = 20; x.shadowOffsetY = 6;
    x.beginPath(); x.arc(px, py, 40 * s, 0, Math.PI * 2); x.fillStyle = 'rgba(255,255,255,.9)'; x.fill();
    x.shadowColor = 'transparent'; x.lineWidth = 5; x.strokeStyle = 'rgba(31,79,94,.45)'; x.stroke(); x.restore();
  }
  function marks(now) {
    rec.marks = rec.marks.filter(m => now - m.t0 < 700);
    for (const m of rec.marks) {
      const t = now - m.t0;
      if (m.kind === 'swipe') {
        const [dx, dy] = DIR[m.dir], d = 170 * out3((t - 60) / 260), a = t < 60 ? t / 60 : 1 - clamp((t - 330) / 200);
        const px = m.x + dx * d, py = m.y + dy * d;
        const trail = x.createLinearGradient(m.x, m.y, px + dx, py + dy);
        trail.addColorStop(0, 'rgba(255,255,255,0)'); trail.addColorStop(1, 'rgba(255,255,255,.95)');
        x.save(); x.globalAlpha = .6 * a; x.lineCap = 'round'; x.lineWidth = 34; x.strokeStyle = trail;
        x.beginPath(); x.moveTo(m.x, m.y); x.lineTo(px, py); x.stroke(); x.restore();
        dot(px, py, a, 1);
      } else {
        dot(m.x, m.y, t < 90 ? t / 90 : 1 - clamp((t - 420) / 200), t > 120 && t < 260 ? .82 : 1);
        if (t > 140) {
          const q = clamp((t - 140) / 420);
          x.save(); x.globalAlpha = .75 * (1 - q); x.lineWidth = 8; x.strokeStyle = '#fff';
          x.beginPath(); x.arc(m.x, m.y, 44 + 90 * out3(q), 0, Math.PI * 2); x.stroke(); x.restore();
        }
      }
    }
  }
  // Header band over the game HUD (back button, canal title, counters); only the text pops when the caption changes.
  function caption(now) {
    if (!rec.caption) return;
    const bandH = 306, lh = 104, cy = bandH / 2 + 8;
    x.save(); x.shadowColor = 'rgba(18,64,74,.22)'; x.shadowBlur = 28; x.shadowOffsetY = 8;
    x.beginPath(); x.roundRect(-8, -60, W + 16, bandH + 60, [0, 0, 52, 52]); x.fillStyle = paper; x.fill(); x.restore();
    x.lineWidth = 6; x.strokeStyle = line; x.beginPath(); x.roundRect(-8, -60, W + 16, bandH + 60, [0, 0, 52, 52]); x.stroke();
    x.font = '84px Jua'; x.textAlign = 'left'; x.textBaseline = 'middle';
    const fit = Math.min(1, 900 / Math.max(...rec.caption.map(l => x.measureText(plain(l)).width)));
    const p = out3((now - rec.captionAt) / 240), s = (.92 + .08 * p) * fit;
    x.save(); x.globalAlpha = p; x.translate(W / 2, cy); x.scale(s, s); x.translate(-W / 2, -cy);
    rec.caption.forEach((l, i) => rich(l, W / 2, cy + (i - (rec.caption.length - 1) / 2) * lh));
    x.restore();
  }
  function curtain(now) {
    const wp = rec.wipe; if (!wp) return;
    const p = wp.mode === 'hold' ? 1 : clamp((now - wp.t0) / (wp.mode === 'in' ? 260 : 340));
    const edge = (y, from, to) => { for (let X = from; to > from ? X <= to : X >= to; X += to > from ? 30 : -30) x.lineTo(X, y + Math.sin(X / 90 + now / 150) * 22); };
    const top = wp.mode === 'out' ? (H + 160) * out3(p) - 80 : -80, bottom = wp.mode === 'in' ? (H + 160) * in2(p) - 80 : H + 80;
    const fill = x.createLinearGradient(0, 0, 0, H); fill.addColorStop(0, '#a6e6de'); fill.addColorStop(1, '#3fb4bc');
    x.save(); x.fillStyle = fill; x.beginPath(); x.moveTo(0, top); edge(top, 0, W); edge(bottom, W, 0); x.closePath(); x.fill(); x.restore();
    if (p >= 1 && wp.mode !== 'hold') { rec.wipe = wp.mode === 'in' ? { mode: 'hold' } : null; wp.done(); }
  }
  // Drawn under the curtain: the panel hides the main menu from the first revealed frame, the card slides in after.
  function endCard(now) {
    const e = rec.end; if (!e) return;
    const fade = x.createLinearGradient(0, 740, 0, 860); fade.addColorStop(0, 'rgba(232,248,245,0)'); fade.addColorStop(1, '#e8f8f5');
    x.fillStyle = fade; x.fillRect(0, 740, W, 120); x.fillStyle = '#e8f8f5'; x.fillRect(0, 860, W, H - 860);
    const t = now - e.t0; if (t < 0) return;
    const p = out3(t / 420), X = 60, w = W - 120, h = 560, Y = 930 + (1 - p) * 260;
    x.save(); x.globalAlpha = p;
    card(X, Y, w, h, 56);
    const ip = out3((t - 140) / 360), is = 176 * (.6 + .4 * ip);
    if (img.complete && img.naturalWidth) {
      x.save(); x.globalAlpha = p * ip; x.shadowColor = 'rgba(18,64,74,.3)'; x.shadowBlur = 24; x.shadowOffsetY = 8;
      x.beginPath(); x.roundRect(W / 2 - is / 2, Y - is * .45, is, is, is * .24); x.fillStyle = paper; x.fill(); x.clip();
      x.drawImage(img, W / 2 - is / 2, Y - is * .45, is, is); x.restore();
    }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = ink; x.font = '112px Jua'; x.fillText(end.title, W / 2, Y + 172);
    x.fillStyle = accent; x.font = '60px Jua'; x.fillText(end.subtitle, W / 2, Y + 262);
    x.font = '700 38px "Noto Sans KR"';
    const pads = 34, gap = 16, widths = end.chips.map(s => x.measureText(s).width + pads * 2);
    let cx = W / 2 - (widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1)) / 2;
    end.chips.forEach((s, i) => {
      x.fillStyle = 'rgba(143,214,207,.38)'; x.beginPath(); x.roundRect(cx, Y + 318, widths[i], 68, 34); x.fill();
      x.fillStyle = ink; x.fillText(s, cx + widths[i] / 2, Y + 353); cx += widths[i] + gap;
    });
    const pulse = 1 + .03 * Math.sin(Math.max(0, t - 700) / 170), bw = 700, bh = 112, by = Y + 420;
    x.save(); x.translate(W / 2, by + bh / 2); x.scale(pulse, pulse); x.translate(-W / 2, -(by + bh / 2));
    const cta = x.createLinearGradient(0, by, 0, by + bh); cta.addColorStop(0, '#ffa452'); cta.addColorStop(1, '#ef6f24');
    x.shadowColor = 'rgba(190,80,20,.35)'; x.shadowBlur = 20; x.shadowOffsetY = 8;
    x.beginPath(); x.roundRect(W / 2 - bw / 2, by, bw, bh, bh / 2); x.fillStyle = cta; x.fill();
    x.shadowColor = 'transparent'; x.fillStyle = '#fff'; x.font = '700 50px "Noto Sans KR"'; x.fillText(end.cta, W / 2, by + bh / 2 + 2);
    x.restore(); x.restore();
  }
  function draw(now) {
    if (rec.bitmap) x.drawImage(rec.bitmap, 0, 0, W, H); else { x.fillStyle = '#e8f8f5'; x.fillRect(0, 0, W, H); }
    marks(now); endCard(now); curtain(now); caption(now);
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  rec.frame = async b64 => {
    const bmp = await createImageBitmap(await (await fetch('data:image/jpeg;base64,' + b64)).blob());
    if (rec.bitmap) rec.bitmap.close();
    rec.bitmap = bmp; rec.frames++;
  };
  rec.setCaption = lines => { rec.caption = lines; rec.captionAt = performance.now(); };
  rec.swipe = (cx, cy, dir) => rec.marks.push({ kind: 'swipe', x: cx * k, y: cy * k, dir, t0: performance.now() });
  rec.tap = (cx, cy) => rec.marks.push({ kind: 'tap', x: cx * k, y: cy * k, t0: performance.now() });
  rec.cover = () => new Promise(done => { rec.wipe = { mode: 'in', t0: performance.now(), done }; });
  rec.reveal = () => new Promise(done => { rec.wipe = { mode: 'out', t0: performance.now(), done }; });
  rec.endCard = delay => { rec.end = { t0: performance.now() + delay }; };
  rec.start = () => {
    const tracks = [...c.captureStream(30).getVideoTracks(), ...(window.promoTap ? window.promoTap.stream.getAudioTracks() : [])];
    rec.recorder = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 8000000, audioBitsPerSecond: 160000 });
    rec.log = []; const note = ev => rec.log.push({ t: +(performance.now() / 1000).toFixed(2), ev, state: rec.recorder.state, audio: window.promoTap ? window.promoTap.context.state + '/' + window.promoTap.stream.getAudioTracks()[0].readyState + (window.promoTap.stream.getAudioTracks()[0].muted ? '/muted' : '') : 'none', video: tracks[0].readyState + (tracks[0].muted ? '/muted' : '') });
    rec.recorder.ondataavailable = e => { if (e.data.size) rec.chunks.push(e.data); note('data ' + e.data.size); };
    rec.recorder.onerror = e => note('error ' + (e.error && e.error.message));
    rec.note = note;
    rec.recorder.start(1000); rec.segment = performance.now(); rec.recorded = 0;
    return { audioTracks: tracks.length - 1 };
  };
  rec.pause = () => { rec.recorder.pause(); rec.note('pause'); rec.recorded += performance.now() - rec.segment; };
  rec.resume = () => { rec.recorder.resume(); rec.note('resume'); rec.segment = performance.now(); };
  rec.stop = () => new Promise(done => {
    rec.recorded += performance.now() - rec.segment;
    rec.recorder.onstop = async () => {
      rec.blob = new Blob(rec.chunks, { type: rec.recorder.mimeType });
      rec.bytes = new Uint8Array(await rec.blob.arrayBuffer());
      done({ bytes: rec.bytes.length, mime: rec.recorder.mimeType, recordedSeconds: rec.recorded / 1000, log: rec.log });
    };
    rec.recorder.stop();
  });
  rec.read = (off, len) => {
    const b = rec.bytes.subarray(off, off + len); let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  };
  // The file as written to disk (rewritten as a progressive MP4) comes back in base64 parts and replaces the recording.
  rec.incoming = [];
  rec.adopt = async () => {
    rec.blob = new Blob(rec.incoming.map(s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0))), { type: 'video/mp4' });
    rec.bytes = new Uint8Array(await rec.blob.arrayBuffer()); rec.incoming = [];
    return rec.bytes.length;
  };
  // Decodes the finished file again: size and length from <video>, a contact sheet and key frames, audio loudness.
  rec.verify = async (times, keys) => {
    const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(rec.blob);
    await new Promise((ok, fail) => { v.onloadedmetadata = ok; v.onerror = () => fail(new Error('video: ' + (v.error && v.error.message))); });
    const seek = t => new Promise(ok => { v.onseeked = ok; v.currentTime = t; });
    const cols = 5, tw = 216, th = 384, sheet = document.createElement('canvas');
    sheet.width = cols * tw; sheet.height = Math.ceil(times.length / cols) * (th + 34);
    const s = sheet.getContext('2d'); s.fillStyle = '#fff'; s.fillRect(0, 0, sheet.width, sheet.height);
    for (const [i, t] of times.entries()) {
      await seek(Math.min(t, v.duration - .05));
      const X = (i % cols) * tw, Y = Math.floor(i / cols) * (th + 34);
      s.drawImage(v, X, Y, tw, th); s.fillStyle = '#123'; s.font = '22px sans-serif'; s.fillText(t.toFixed(1) + 's', X + 8, Y + th + 26);
    }
    const frames = [];
    for (const t of keys) {
      await seek(Math.min(t, v.duration - .05));
      const f = document.createElement('canvas'); f.width = v.videoWidth; f.height = v.videoHeight;
      f.getContext('2d').drawImage(v, 0, 0); frames.push(f.toDataURL('image/png'));
    }
    let audio = null;
    try {
      const ab = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(rec.bytes.buffer.slice(0));
      const data = ab.getChannelData(0), win = Math.round(ab.sampleRate / 2), rms = [];
      let peak = 0; for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
      for (let i = 0; i < data.length; i += win) { let sum = 0; const n = Math.min(win, data.length - i); for (let j = 0; j < n; j++) sum += data[i + j] * data[i + j]; rms.push(Math.sqrt(sum / n)); }
      audio = { seconds: +ab.duration.toFixed(2), channels: ab.numberOfChannels, peak: +peak.toFixed(3), peakRms: +Math.max(...rms).toFixed(4), audibleHalfSeconds: rms.filter(r => r > .005).length, halfSeconds: rms.length };
    } catch (err) { audio = { error: err.message }; }
    return { width: v.videoWidth, height: v.videoHeight, duration: v.duration, sheet: sheet.toDataURL('image/png'), frames, audio };
  };
  return { fontsReady: document.fonts.check('78px Jua', '수로에 갇힌 상어') };
}

async function cdp() {
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.some(t => t.type === 'page')) break; } catch {} await sleep(250); }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pending = {}, listeners = {};
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
    else if (m.method && listeners[m.method]) listeners[m.method](m.params);
  };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => {
    // userGesture: Web Audio only runs after a user activation, even in headless mode.
    const m = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
    if (m.error) throw new Error(m.error.message);
    if (m.result.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description || 'eval failed');
    return m.result.result.value;
  };
  return { ws, send, ev, on: (method, fn) => { listeners[method] = fn; } };
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const page = buildPage();
  const scenes = SCENES.map(s => ({ ...s, level: STORY_ORDER[s.canal - 1] })).map(s => ({ ...s, name: LEVELS[s.level].name, steps: route(s.level) }));
  for (const s of scenes) if (!s.steps.some(st => st.feat.includes(s.needs))) throw new Error(`canal ${s.canal} route no longer uses ${s.needs}`);
  // Filmed canals count as cleared, so no first-visit spotlight covers the board. Canals 1–30 are cleared too: the main
  // screen of the end card then shows chapter 3's breakwater and lighthouse (the store screenshot's scenery).
  const cleared = [...STORY_ORDER.slice(0, 30), ...scenes.map(s => s.level)];
  const seed = {
    best: Object.fromEntries(cleared.map(i => [i, 3])), last: scenes[0].level, storyOrder: 3, storyLength: LEVELS.length,
    owned: ['basic', 'sakura', 'wave', 'maple', 'snow', 'gold'], skin: 'basic', sound: true, vibe: false, coachSwipe: true, coachNet: true,
    seenDevices: ['buoy', 'boat', 'jet', 'net', 'sand', 'whirl', 'gate', 'crate'],
  };
  const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets', 'icons', 'icon-512.png')).toString('base64');

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'bukang-promo-'));
  const proc = spawn(browser, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--hide-scrollbars', '--allow-file-access-from-files',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  try {
    const { ws, send, ev, on } = await cdp();
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: AUDIO_TAP });
    // phone: 360x640 css px at 3x = 1080x1920, the store screenshot size
    await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 3, mobile: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await send('Page.navigate', { url: fileUrl(page) }); await sleep(800);
    await ev(`localStorage.setItem('bukang-sea-v1', ${JSON.stringify(JSON.stringify(seed))}); location.reload();`).catch(() => {});
    for (let i = 0; i < 80; i++) { await sleep(150); if (await ev(`!!window.promo && !document.getElementById('app').classList.contains('launching')`).catch(() => false)) break; }
    const audioState = await ev('promo.audio()');
    if (audioState !== 'running') throw new Error('game sound is ' + audioState + ': the MP4 recorder needs a running audio track');
    const ready = await ev(`(${promoPage})(${JSON.stringify({ icon, mime: MIME, end: END })})`);
    const glyphs = [...SCENES.flatMap(s => [...Object.values(s.captions).flat(), ...(s.result || [])]), END.title, END.subtitle].join('').replace(/[{}]/g, '');
    await ev(`Promise.all([document.fonts.load('78px Jua', ${JSON.stringify(glyphs)}), document.fonts.load('700 50px "Noto Sans KR"', ${JSON.stringify(END.chips.join('') + END.cta)})])`);
    const fonts = await ev(`document.fonts.check('78px Jua', ${JSON.stringify(glyphs)}) && document.fonts.check('700 50px "Noto Sans KR"', ${JSON.stringify(END.cta)})`);
    if (!fonts) throw new Error('caption fonts did not load (Google Fonts unreachable?)');

    // Screencast frames -> page canvas, always the newest one; frames that arrive while one is being decoded are skipped.
    let latest = null, delivering = false, painted = 0;
    on('Page.screencastFrame', async ({ data, sessionId }) => {
      send('Page.screencastFrameAck', { sessionId }); latest = data;
      if (delivering) return;
      delivering = true;
      while (latest) { const d = latest; latest = null; await ev(`promoRec.frame(${JSON.stringify(d)})`).catch(() => {}); painted++; }
      delivering = false;
    });
    await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });

    const idle = async () => { for (let i = 0; i < 200 && await ev('promo.busy()'); i++) await sleep(25); };
    const timeline = [];
    let clock = 0, segmentStart = 0;
    const mark = label => timeline.push({ at: +(clock + (Date.now() - segmentStart) / 1000).toFixed(2), label });
    const fps = [];
    async function play(scene) {
      for (const [i, step] of scene.steps.entries()) {
        if (scene.captions[i]) { await ev(`promoRec.setCaption(${JSON.stringify(scene.captions[i])})`); if (i) mark('caption ' + scene.captions[i].join(' ')); }
        for (const k of step.nets) {
          await ev(`(() => { const [x, y] = promo.cell(${k}); promoRec.tap(x, y); })()`); await sleep(200);
          await ev(`promo.tap(${k})`); await sleep(420);
        }
        await ev(`(() => { const [x, y] = promo.cell(promo.shark()); promoRec.swipe(x, y, '${step.dir}'); promo.move('${step.dir}'); })()`);
        await sleep(60); await idle(); await sleep(130);
      }
    }
    for (const [n, scene] of scenes.entries()) {
      await ev(`promo.enter(${scene.level})`); await sleep(900);
      if (n === 0) {
        await ev(`promoRec.setCaption(${JSON.stringify(scene.captions[0])})`); await sleep(400);
        const started = await ev('promoRec.start()');
        if (!started.audioTracks) throw new Error('recorder has no audio track');
        segmentStart = Date.now(); mark(`canal ${scene.canal} ${scene.name}`);
        await sleep(500);
      } else {
        await ev('promoRec.resume()'); segmentStart = Date.now(); mark(`canal ${scene.canal} ${scene.name}`);
        await ev(`promoRec.setCaption(${JSON.stringify(scene.captions[0])})`);
        await ev('promoRec.reveal()'); await sleep(400);
      }
      const t0 = Date.now(), p0 = painted;
      await play(scene);
      if (scene.result) {
        for (let i = 0; i < 60 && !(await ev('promo.state().sheet')); i++) await sleep(50);
        await ev(`promoRec.setCaption(${JSON.stringify(scene.result)})`); mark('result');
        await sleep(2300);
      } else await sleep(300);
      fps.push(+((painted - p0) / ((Date.now() - t0) / 1000)).toFixed(1));
      const state = await ev('promo.state()');
      if (!state.cleared || state.fish !== state.total) throw new Error(`canal ${scene.canal} did not end with every fish: ` + JSON.stringify(state));
      await ev('promoRec.cover()'); mark('cut');
      await ev('promoRec.pause()'); clock += (Date.now() - segmentStart) / 1000;
    }
    // End card over the real main screen.
    await ev('promo.title()'); await sleep(1000);
    await ev('promoRec.setCaption(null)'); await ev('promoRec.endCard(1e9)');
    await ev('promoRec.resume()'); segmentStart = Date.now(); mark('end card');
    await ev('promoRec.reveal()'); await ev('promoRec.endCard(0)');
    await sleep(3400);
    const done = await ev('promoRec.stop()');
    clock += (Date.now() - segmentStart) / 1000;
    await send('Page.stopScreencast');

    const file = path.join(out, 'shark-sos-short.mp4'), chunks = [];
    for (let off = 0; off < done.bytes; off += 4 << 20) chunks.push(Buffer.from(await ev(`promoRec.read(${off}, ${4 << 20})`), 'base64'));
    // MediaRecorder writes a fragmented MP4 with duration 0; phone galleries and upload pickers want sample tables.
    const recorded = Buffer.concat(chunks), mp4 = toProgressive(recorded);
    fs.writeFileSync(file, mp4);
    for (let off = 0; off < mp4.length; off += 3 << 20) await ev(`promoRec.incoming.push(${JSON.stringify(mp4.subarray(off, off + (3 << 20)).toString('base64'))})`);
    if (await ev('promoRec.adopt()') !== mp4.length) throw new Error('written file did not reach the page intact');
    const total = Math.ceil(done.recordedSeconds * 2) / 2, times = [];
    for (let t = .2; t < total; t += 1.5) times.push(+t.toFixed(1));
    const at = label => timeline.find(t => t.label.startsWith(label)).at;
    const keys = [.3, 3, at('canal 25') + 1.2, at('result') + 1.8, total - 1.2];
    const check = await ev(`promoRec.verify(${JSON.stringify(times)}, ${JSON.stringify(keys)})`);
    fs.writeFileSync(path.join(out, 'contact-sheet.png'), Buffer.from(check.sheet.split(',')[1], 'base64'));
    check.frames.forEach((f, i) => fs.writeFileSync(path.join(out, `frame-${i + 1}.png`), Buffer.from(f.split(',')[1], 'base64')));
    const report = {
      file: path.relative(root, file), bytes: mp4.length, mime: done.mime, container: describe(mp4), width: check.width, height: check.height,
      duration: +check.duration.toFixed(2), recordedSeconds: +done.recordedSeconds.toFixed(2), screencastFps: fps, audio: check.audio,
      canvasReady: ready, scenes: scenes.map(s => ({ canal: s.canal, level: s.level, name: s.name, route: s.steps.map(st => st.dir + (st.feat.length ? '[' + st.feat.join(',') + ']' : '')).join(' ') })),
      timeline, recorderLog: done.log, browser: path.basename(browser), physicalDevice: false,
    };
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ file: report.file, bytes: report.bytes, size: `${report.width}x${report.height}`, duration: report.duration, screencastFps: fps, audio: report.audio }));
    ws.close();
  } finally { proc.kill(); }
})().catch(e => { console.error(e.message); process.exit(1); });
