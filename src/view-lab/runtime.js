// The standalone comparison shares the production first-canal renderer and camera control.
let labMode = 'oblique', labSkin = 'lighthouse';
const labProjection = boardProjection;
const labOffset = () => CH * (1 - labProjection()) / 2;

function labSetView(mode) {
  if (!['top', 'oblique'].includes(mode)) return;
  labMode = mode; setCanalView(mode);
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === mode)));
  $('labCaption').textContent = mode === 'top' ? '현재 게임 그대로 · 위에서 보는 수로와 상어' : '낮춘 시점 · 높이가 있는 물가 · 방향별 상어';
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
  show('game', false); labReset(); labSetView('oblique');
  for (const id of ['basic', 'lighthouse']) SHARK_ART.getOblique({ id }, 'R');
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
    ready: ['basic', 'lighthouse'].reduce((n, id) => n + ['R', 'L', 'D', 'U'].filter(d => SHARK_ART.hasSkin('oblique' + d, { id })).length, 0),
    tile: T, ox: OX, oy: OY, height: CH, projection: labProjection(), offset: labOffset() })) });
}
