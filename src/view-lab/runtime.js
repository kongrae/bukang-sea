// Included inside the existing game IIFE by build-view-lab.js only. The game still owns state, input and frame timing.
let labMode = 'oblique', labSkin = 'lighthouse';
const labSprites = new Map();
const labSources = @@LAB_SOURCES@@;
const labProjection = () => labMode === 'oblique' ? .78 : 1;
const labOffset = () => CH * (1 - labProjection()) / 2;
function labGridY(screenY) { return ((screenY - labOffset()) / labProjection() - OY) / T; }

function buildStatic() {
  buildTopStatic();
  if (labMode !== 'oblique') return;
  const s = staticLayer.getContext('2d'), P = boardSurface;
  s.setTransform(dpr, 0, 0, dpr, OX * dpr, OY * dpr);
  const water = s.createLinearGradient(0, -OY, CW, CH - OY);
  water.addColorStop(0, '#4dc6c3'); water.addColorStop(.5, '#27a9b7'); water.addColorStop(1, '#268eac');
  s.fillStyle = water; s.fillRect(-OX, -OY, CW, CH);
  const x0 = Math.floor(-OX / T) - 1, x1 = Math.ceil((CW - OX) / T);
  const y0 = Math.floor(-OY / T) - 1, y1 = Math.ceil((CH - OY) / T);
  const height = T * .23;
  const top = s.createLinearGradient(0, -OY, CW, CH - OY);
  top.addColorStop(0, '#f9f2db'); top.addColorStop(1, '#e7e6cb');
  // The top is lifted, while the foot of every wall stays on the original collision boundary.
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!isLand(x, y)) continue;
    const px = x * T, py = y * T;
    s.fillStyle = top; s.fillRect(px, py - height, T + .5, T + .5);
    const seed = hash(y * 97 + x * 31 + deco * 7);
    if (isLand(x, y - 1) && isLand(x, y + 1) && isLand(x - 1, y) && isLand(x + 1, y) && seed < .18) {
      drawPlanting(s, px, py - height, T, seed, P);
    }
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!isLand(x, y)) continue;
    const px = x * T, py = y * T;
    if (!isLand(x, y + 1)) {
      const face = s.createLinearGradient(0, py + T - height, 0, py + T);
      face.addColorStop(0, '#a3bbb1'); face.addColorStop(.55, '#83a69f'); face.addColorStop(1, '#628e90');
      s.fillStyle = face; s.fillRect(px, py + T - height, T + .5, height);
      s.fillStyle = '#fff9e7'; s.fillRect(px, py + T - height - T * .035, T + .5, T * .055);
      s.fillStyle = 'rgba(14,92,100,.16)'; s.fillRect(px, py + T, T, T * .065);
      s.strokeStyle = '#466f7540'; s.lineWidth = .8;
      s.beginPath(); s.moveTo(px + T * .5, py + T - height + 3); s.lineTo(px + T * .5, py + T - 2); s.stroke();
    }
    for (const dx of [-1, 1]) if (!isLand(x + dx, y)) {
      s.fillStyle = dx > 0 ? '#b4c4b1' : '#fff8e3';
      s.fillRect(px + (dx > 0 ? T - T * .05 : 0), py - height, T * .05, T - (isLand(x, y + 1) ? 0 : height));
    }
    if (!isLand(x, y - 1)) { s.fillStyle = '#fffbed'; s.fillRect(px, py - height, T, T * .04); }
  }
}

function drawShark(context, cx, cy, ang, size, time, moving, stretch = 1, alpha = 1, skin = currentSkin()) {
  if (context !== ctx || labMode === 'top') return drawTopShark(context, cx, cy, ang, size, time, moving, stretch, alpha, skin);
  const direction = ['R', 'D', 'L', 'U'][(Math.round(view.target / (Math.PI / 2)) % 4 + 4) % 4];
  const sprite = labSprites.get(labSkin + '-' + direction);
  if (!sprite?.naturalWidth) return drawTopShark(context, cx, cy, ang, size, time, moving, stretch, alpha, skin);
  const horizontal = direction === 'R' || direction === 'L';
  // Undo only the camera's vertical compression for this already-projected bitmap. Do not rotate its lighting or face.
  context.save(); context.translate(cx, cy); context.globalAlpha *= alpha;
  context.fillStyle = '#12596845'; context.beginPath(); context.ellipse(0, size * .06, size * .37, size * .22, 0, 0, Math.PI * 2); context.fill();
  context.strokeStyle = '#e0fffb7a'; context.lineWidth = size * .018;
  context.beginPath(); context.ellipse(0, size * .06, size * .47, size * .26, 0, 0, Math.PI * 2); context.stroke();
  context.scale(1, 1 / labProjection());
  const maxWidth = size * (horizontal ? 1.03 : .81), maxHeight = size * (horizontal ? .76 : .80);
  const scale = Math.min(maxWidth / sprite.naturalWidth, maxHeight / sprite.naturalHeight);
  const w = sprite.naturalWidth * scale, h = sprite.naturalHeight * scale;
  const lean = reduceMotion ? 1 : 1 + (stretch - 1) * .25;
  context.scale(horizontal ? lean : 1, horizontal ? 1 : lean);
  context.drawImage(sprite, -w / 2, -h / 2 - size * .10, w, h);
  context.restore();
}

function labSetView(mode) {
  if (!['top', 'oblique'].includes(mode)) return;
  labMode = mode;
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === mode)));
  $('labCaption').textContent = mode === 'top' ? '현재 게임 그대로 · 위에서 보는 수로와 상어' : '낮춘 시점 · 높이가 있는 물가 · 방향별 상어';
  // Keep the in-flight turn, its queued input and the saved session intact.
  buildStatic(); invalidateScenes(); draw(clock);
}
function labSetSkin(id) {
  if (!['basic', 'lighthouse'].includes(id)) return;
  labSkin = id; save.skin = id;
  document.querySelectorAll('[data-skin]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.skin === id)));
  SHARK_ART.ready('swim', currentSkin()).then(invalidateScenes);
  invalidateScenes();
}
function labReset() {
  $('labResult').close(); loadLevel(0, null, LEVELS[0]); pop = null; coach = null; invalidateScenes();
}
function startComparison() {
  save.owned = ['basic', 'lighthouse']; save.skin = labSkin;
  save.sound = false; save.vibe = false; save.coachSwipe = save.coachNet = true;
  save.seenDevices = DEVICE_GUIDES.map(d => d.key);
  show('game', false); labReset();
  for (const [key, src] of Object.entries(labSources)) {
    const img = new Image();
    img.onload = () => { labSprites.set(key, img); invalidateScenes(); };
    img.onerror = () => { $('labCaption').textContent = '상어 이미지를 불러오지 못해 기존 모습으로 표시해요.'; };
    img.src = src;
  }
  SHARK_ART.ready('swim', currentSkin());
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => labSetView(b.dataset.view)));
  document.querySelectorAll('[data-skin]').forEach(b => b.addEventListener('click', () => labSetSkin(b.dataset.skin)));
  document.querySelectorAll('[data-direction]').forEach(b => b.addEventListener('click', () => tryMove(b.dataset.direction)));
  $('labUndo').addEventListener('click', undo);
  $('labReset').addEventListener('click', labReset);
  $('labAgain').addEventListener('click', labReset);
  $('labResult').addEventListener('cancel', e => { e.preventDefault(); labReset(); });
  // Read-only inspection for regression tests; no unlock, arbitrary state mutation or alternate rule implementation.
  window.viewComparison = Object.freeze({ state: () => JSON.parse(JSON.stringify({ state: st, view, animating: !!anim, cleared, mode: labMode, skin: labSkin,
    ready: labSprites.size, tile: T, ox: OX, oy: OY, height: CH, projection: labProjection(), offset: labOffset() })) });
}
