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
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let reduceMotion = motionPreference.matches;
let gameNeedsPaint = true, heroNeedsPaint = true, endingNeedsPaint = true;
function invalidateScenes() { gameNeedsPaint = heroNeedsPaint = endingNeedsPaint = true; }
const SWIPE = 18;   // px of finger travel that commits a swipe (fires during the move, not on release)

/* ---------- sheets: logical close now, short visual exit, isolated input ---------- */
const SHEET_IDS = ['journeyOverlay', 'endingOverlay', 'dailyOverlay', 'freeOverlay', 'pilotOverlay', 'journalOverlay', 'skinsOverlay', 'settingsOverlay', 'clearOverlay', 'guideOverlay', 'chapterOverlay'];
const sheetExits = new Map(), sheetOrigins = new Map();
// Every dismissal goes through the menu's own cleanup/return path. Results require an explicit action.
const sheetDismiss = {
  journeyOverlay: () => closeJourney(), endingOverlay: () => closeEnding(), dailyOverlay: () => closeDaily(),
  freeOverlay: () => closeFree(), pilotOverlay: () => closePilot(), journalOverlay: () => closeJournal(),
  skinsOverlay: () => closeSkins(), settingsOverlay: () => closeSettings(), guideOverlay: () => closeGuide(),
};
const sheetDesktop = matchMedia('(min-width: 640px) and (min-height: 640px)');
const SHEET_DRAG = { slop: 10, ratio: 0.25, min: 80, max: 160, flick: 0.65, flickMin: 32, sampleMs: 100, returnMs: 180 };
let sheetDrag = null, sheetReturn = null, sheetClickBlock = null;
function clearSheetDragStyle(el) {
  el.classList.remove('sheet-dragging', 'sheet-returning');
  el.style.removeProperty('--sheet-y'); el.style.removeProperty('--sheet-shade');
}
function releaseSheetPointer(drag) {
  try { if (drag.header.hasPointerCapture(drag.pointerId)) drag.header.releasePointerCapture(drag.pointerId); } catch (_) {}
}
function resetSheetGesture() {
  const drag = sheetDrag; sheetDrag = null;
  if (drag) {
    if (drag.started) sheetClickBlock = { pointerId: drag.pointerId, until: performance.now() + 400 };
    releaseSheetPointer(drag); clearSheetDragStyle(drag.el);
  }
  if (sheetReturn) { clearTimeout(sheetReturn.timer); clearSheetDragStyle(sheetReturn.el); sheetReturn = null; }
}
function sheetPointerDown(e) {
  if (sheetDrag) { if (e.pointerId !== sheetDrag.pointerId) sheetPointerEnd(e, true); return; }
  sheetClickBlock = null;
  if (e.isPrimary === false || e.button !== 0 || sheetDesktop.matches || sheetExits.size || sheetReturn) return;
  const header = e.target.closest('[data-sheet-drag]');
  if (!header || e.target.closest('button, input, a, select, textarea, [role="button"]')) return;
  const el = header.closest('.overlay');
  if (!el || el.hidden || el.inert || !sheetDismiss[el.id]) return;
  const card = header.closest('.card'), rect = card.getBoundingClientRect();
  sheetDrag = { el, card, header, id: el.id, pointerId: e.pointerId, x: e.clientX, y: e.clientY,
    top: rect.top, height: rect.height, dy: 0, started: false, samples: [{ y: e.clientY, t: e.timeStamp }] };
  try { header.setPointerCapture(e.pointerId); } catch (_) {}
}
function sheetPointerMove(e) {
  const drag = sheetDrag; if (!drag || e.pointerId !== drag.pointerId) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.started) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SHEET_DRAG.slop) return;
    if (dy <= 0 || dy < Math.abs(dx) * 1.2) { resetSheetGesture(); return; }
    drag.started = true; drag.el.classList.add('sheet-opened', 'sheet-dragging');
  }
  if (e.cancelable) e.preventDefault();
  drag.dy = Math.max(0, Math.min(drag.height, dy));
  drag.samples.push({ y: e.clientY, t: e.timeStamp });
  while (drag.samples.length > 1 && drag.samples[0].t < e.timeStamp - SHEET_DRAG.sampleMs) drag.samples.shift();
  drag.el.style.setProperty('--sheet-y', drag.dy + 'px');
  drag.el.style.setProperty('--sheet-shade', 0.65 * (1 - Math.min(1, drag.dy / drag.height)));
}
function sheetPointerEnd(e, cancelled = false) {
  const drag = sheetDrag; if (!drag || (!cancelled && e.pointerId !== drag.pointerId)) return;
  if (!cancelled) sheetPointerMove(e);
  if (sheetDrag !== drag) return;
  if (!drag.started) { resetSheetGesture(); return; }
  const sample = drag.samples[0], age = e.timeStamp - sample.t;
  const speed = age > 0 && age <= SHEET_DRAG.sampleMs ? (e.clientY - sample.y) / age : 0;
  const distance = Math.min(SHEET_DRAG.max, Math.max(SHEET_DRAG.min, drag.height * SHEET_DRAG.ratio));
  if (!cancelled && (drag.dy >= distance || (drag.dy >= SHEET_DRAG.flickMin && speed >= SHEET_DRAG.flick))) {
    sheetDismiss[drag.id](); return;
  }
  sheetClickBlock = { pointerId: drag.pointerId, until: performance.now() + 400 };
  sheetDrag = null; releaseSheetPointer(drag);
  if (reduceMotion || document.hidden) { clearSheetDragStyle(drag.el); return; }
  drag.el.classList.replace('sheet-dragging', 'sheet-returning');
  drag.el.style.setProperty('--sheet-y', '0px'); drag.el.style.setProperty('--sheet-shade', '0.65');
  sheetReturn = { ...drag, timer: setTimeout(() => { clearSheetDragStyle(drag.el); sheetReturn = null; }, SHEET_DRAG.returnMs) };
}
function sheetClick(e) {
  if (sheetClickBlock && e.detail > 0 && performance.now() <= sheetClickBlock.until &&
      (e.pointerId == null || e.pointerId === sheetClickBlock.pointerId)) {
    sheetClickBlock = null; e.preventDefault(); e.stopImmediatePropagation(); return;
  }
  const close = e.target.closest('[data-sheet-close]');
  if (close && !sheetExits.size) sheetDismiss[close.dataset.sheetClose]?.();
}
function syncSheetInput() {
  $('app').inert = sheetExits.size > 0 || SHEET_IDS.some(id => !$(id).hidden);
  invalidateScenes();
}
function finishSheetExit(id, restore = true) {
  const exit = sheetExits.get(id); if (!exit) return;
  clearTimeout(exit.timer); sheetExits.delete(id);
  const el = $(id); el.classList.remove('sheet-leaving'); el.inert = false; el.removeAttribute('aria-hidden');
  el.style.removeProperty('--sheet-exit-start'); el.style.removeProperty('--sheet-exit-end'); el.style.removeProperty('--sheet-shade');
  syncSheetInput();
  if (restore && !document.hidden && !$('app').inert && exit.target?.isConnected && !exit.target.closest('[hidden]')) exit.target.focus({ preventScroll: true });
}
function flushSheetExits() { resetSheetGesture(); for (const id of [...sheetExits.keys()]) finishSheetExit(id, false); }
function openSheet(id) {
  flushSheetExits();
  const el = $(id);
  el.classList.remove('sheet-opened');
  if (el.hidden) { sheetOrigins.set(id, document.activeElement); if (id !== 'clearOverlay') sfx.sheet(true); }
  el.hidden = false; el.inert = false; el.removeAttribute('aria-hidden');
  gest = null; queued = null; syncSheetInput();
}
function closeSheet(id, returnId = null, animate = true) {
  const el = $(id); if (el.hidden) return;
  if (animate && id !== 'clearOverlay') sfx.sheet(false);
  const drag = sheetDrag?.id === id ? sheetDrag : sheetReturn?.id === id ? sheetReturn : null;
  const offset = drag?.started ? Math.max(0, drag.card.getBoundingClientRect().top - drag.top) : 0;
  resetSheetGesture();
  if (offset > 0) {
    el.style.setProperty('--sheet-exit-start', offset + 'px');
    el.style.setProperty('--sheet-exit-end', drag.height + 20 + 'px');
    el.style.setProperty('--sheet-shade', 0.65 * (1 - Math.min(1, offset / drag.height)));
  }
  const target = returnId ? $(returnId) : sheetOrigins.get(id);
  el.hidden = true;
  const exit = { target, timer: null }; sheetExits.set(id, exit);
  if (!animate || reduceMotion || document.hidden) { finishSheetExit(id, animate); return; }
  el.classList.add('sheet-leaving'); el.inert = true; el.setAttribute('aria-hidden', 'true');
  syncSheetInput(); exit.timer = setTimeout(() => finishSheetExit(id), 180);
}
function sheetKeydown(e) {
  if (sheetExits.size) { e.preventDefault(); return true; }
  if (e.key !== 'Tab') return false;
  const id = [...SHEET_IDS].reverse().find(id => !$(id).hidden); if (!id) return false;
  const items = [...$(id).querySelectorAll('button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]')]
    .filter(el => !el.closest('[hidden]') && el.getClientRects().length);
  if (!items.length) { e.preventDefault(); return true; }
  const at = items.indexOf(document.activeElement);
  if (at < 0 || (!e.shiftKey && at === items.length - 1) || (e.shiftKey && at === 0)) {
    e.preventDefault(); items[e.shiftKey ? items.length - 1 : 0].focus({ preventScroll: true });
  }
  return true;
}

/* ---------- storage (per-viewer convenience only) ---------- */
const STORE_KEY = 'bukang-sea-v1';
// vibe: haptics on/off, coachSwipe/coachNet: first-play finger hints already shown
// daily: dated attendance; dailyOps: three best stage stars per date; owned/skin: earned and equipped skins
// sessions: story, daily stages/legacy, and free0/free1/free2; seenDevices: confirmed device guides
// hintUsage: counts and last-use times per story canal, dated stage, or free run; not part of undo
let save = { best: {}, last: 0, sound: true, vibe: true, coachSwipe: false, coachNet: false, daily: {}, dailyOps: {}, owned: null, skin: 'basic', sessions: {}, seenDevices: [], hintUsage: {} };
try { const s = JSON.parse(localStorage.getItem(STORE_KEY)); if (s && s.best) save = Object.assign(save, s); } catch (e) {}
if (!save.sessions || typeof save.sessions !== 'object' || Array.isArray(save.sessions)) save.sessions = {};
if (!save.sessions.dailyStages || typeof save.sessions.dailyStages !== 'object' || Array.isArray(save.sessions.dailyStages)) save.sessions.dailyStages = {};
if (!Array.isArray(save.seenDevices)) save.seenDevices = [];
if (!save.hintUsage || typeof save.hintUsage !== 'object' || Array.isArray(save.hintUsage)) save.hintUsage = {};
if (!save.dailyOps || typeof save.dailyOps !== 'object' || Array.isArray(save.dailyOps)) save.dailyOps = {};
if (!save.free || save.free.version !== 1) save.free = { version: 1, runs: [], completed: [0, 0, 0] };
if (!Array.isArray(save.free.runs)) save.free.runs = [];
save.free.runs = save.free.runs.slice(0, 3);
save.free.completed = [0, 1, 2].map(i => Number.isSafeInteger(save.free.completed?.[i]) && save.free.completed[i] >= 0 ? save.free.completed[i] : 0);
save.free.recent = [0, 1, 2].map(i => Array.isArray(save.free.recent?.[i])
  ? save.free.recent[i].filter(key => typeof key === 'string' && key.length <= 4096).slice(-6) : []);
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
    if (!journalDateValid(date) || !DAILY_OPERATION_VERSIONS.includes(record?.version) || !Array.isArray(record.stars)) continue;
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
// i is a LEVELS index; the previous canal is the one before it in STORY_ORDER. Cleared canals and kept access stay open.
const unlocked = i => i === 0 || save.best[STORY_ORDER[STORY_POSITION[i] - 1]] != null || Array.isArray(save.storyAccess) && save.storyAccess.includes(i) || Number.isInteger(save.best[i]) && save.best[i] >= 1 && save.best[i] <= 3;
// Device kinds a story canal introduces: the first canal in play order that uses them (one per chapter).
const DEVICE_TILES = { jet: /[<>^v]/, boat: /[bB]/, sand: /s/, whirl: /w/, gate: /[pGg]/ };
let firstDeviceAt = null;
function introducedDevices(i) {
  if (!firstDeviceAt) {
    firstDeviceAt = {};
    STORY_ORDER.forEach((index, position) => {
      const level = LEVELS[index], map = level.map.join('');
      for (const [kind, tile] of Object.entries(DEVICE_TILES)) if (firstDeviceAt[kind] == null && tile.test(map)) firstDeviceAt[kind] = position;
      if (firstDeviceAt.net == null && level.nets) firstDeviceAt.net = position;
    });
  }
  return Object.keys(firstDeviceAt).filter(kind => firstDeviceAt[kind] === STORY_POSITION[i]);
}
// Devices the player has learned: the story canal introducing them is cleared. Daily operation v3 and free v3 use only these.
function learnedDevices() {
  introducedDevices(0);
  return Object.keys(firstDeviceAt).filter(kind => save.best[STORY_ORDER[firstDeviceAt[kind]]] >= 1);
}
const learningDevices = () => Object.keys(VARIETY_FAMILIES).some(family => !varietyFamilyKnown(family, learnedDevices()));
// Device kinds that first appear in chapter ci (one per chapter since the 2026-10-07 restructure).
function chapterDevices(ci) {
  let start = 0; for (let k = 0; k < ci; k++) start += CHAPTERS[k].count;
  return STORY_ORDER.slice(start, start + CHAPTERS[ci].count).flatMap(i => introducedDevices(i));
}
// chapter of LEVELS index i: { ci, start, end, name }; start/end are play positions (CHAPTERS lists runs of STORY_ORDER)
function chapterOf(i) {
  const position = STORY_POSITION[i] ?? 0;
  let start = 0;
  for (let ci = 0; ci < CHAPTERS.length; ci++) {
    const end = start + CHAPTERS[ci].count - 1;
    if (position <= end) return { ci, start, end, name: CHAPTERS[ci].name };
    start = end + 1;
  }
  return { ci: 0, start: 0, end: LEVELS.length - 1, name: '' };
}

/* ---------- story journey: derived from existing clears, independent of daily operations ---------- */
// Next/last canal in play order for a LEVELS index (undefined after the final canal).
const storyNext = i => STORY_ORDER[STORY_POSITION[i] + 1];
const storyLast = i => STORY_POSITION[i] === STORY_ORDER.length - 1;
const JOURNEY_STORY = [
  { intro: '좁은 북항 수로에 갇힌 상어. 굽은 물길을 하나씩 열고 물줄기도 타 보세요.', outro: '좁은 수로를 벗어났어요! 이제 공원 안쪽 운하를 따라 나아가요.' },
  { intro: '화단 사이로 이어진 운하. 오가는 구조정을 피해 바다 쪽으로 길을 찾아요.', outro: '공원 운하를 통과했어요! 저 앞에 방파제가 보여요.' },
  { intro: '방파제 너머로 흐르는 물살. 그물을 쳐서 멈출 자리를 만들어요.', outro: '방파제를 넘어왔어요! 이제 모래톱이 쌓인 외항으로 나아가요.' },
  { intro: '모래톱에 올라서면 멈춰요. 모래톱을 디딤돌 삼아 외항의 물길을 건너요.', outro: '외항을 통과했어요! 이제 소용돌이가 도는 북항 바깥길로 가요.' },
  { intro: '떨어진 물길은 소용돌이로 이어져요. 부두 사이를 지나 수문 시설 입구까지 가요.', outro: '북항 바깥길을 통과했어요! 이제 스위치로 수문을 여닫아 보세요.' },
  { intro: '스위치 위에 멈춰 수문을 열고 닫아요. 마지막 갑문 너머가 넓은 바다예요.', outro: '마지막 수문이 열렸어요. 상어가 넓은 바다로 돌아갑니다.' },
];
function storyProgress() {
  let start = 0;
  const chapters = CHAPTERS.map((ch, ci) => {
    const indices = Array.from({ length: ch.count }, (_, k) => STORY_ORDER[start + k]); start += ch.count;
    const kept = indices.filter(i => Number.isInteger(save.best[i]) && save.best[i] >= 1 && save.best[i] <= 3), count = kept.length;
    // stars from valid records only; perfect (만점) = every canal at three stars
    const stars = kept.reduce((n, i) => n + save.best[i], 0);
    return { ci, start: indices[0], count, total: ch.count, complete: count === ch.count, stars, perfect: stars === ch.count * 3 };
  });
  const count = chapters.reduce((sum, ch) => sum + ch.count, 0);
  return { chapters, count, complete: count === LEVELS.length };
}
const endingAvailable = (progress = storyProgress()) => progress.complete || save.storyRescued === 1;
const journeyOpen = () => !$('journeyOverlay').hidden;
const endingOpen = () => !$('endingOverlay').hidden;
let endingReturn = 'title', endingElapsed = 0;
function renderJourney() {
  const progress = storyProgress();
  $('journeyCount').textContent = `${progress.count} / ${LEVELS.length}개 수로 구출 완료`;
  $('journeyChapters').innerHTML = progress.chapters.map(ch => {
    const available = unlocked(ch.start), text = ch.perfect ? '만점' : ch.complete ? '통과' : available ? '구출 중' : '앞 장을 통과하면 열려요';
    return `<li data-journey="${ch.ci}" class="journey-stop${ch.complete ? ' complete' : ''}${ch.perfect ? ' perfect' : ''}"><span class="journey-number" aria-hidden="true">${ch.perfect ? '★' : ch.complete ? '✓' : ch.ci + 1}</span><div><b>${CHAPTERS[ch.ci].name}</b><p>${JOURNEY_STORY[ch.ci].intro}</p><small>${text} · ${ch.count} / ${ch.total} 수로${ch.count ? ` · ★ ${ch.stars} / ${ch.total * 3}` : ''}</small><progress max="${ch.total}" value="${ch.count}" aria-label="${ch.ci + 1}장 ${CHAPTERS[ch.ci].name}, ${ch.count} / ${ch.total} 수로 완료"></progress><button class="btn" type="button" data-journey-chapter="${ch.ci}">${ch.ci + 1}장 ${available ? '수로 보기' : '둘러보기'}</button></div></li>`;
  }).join('');
  $('journeyEndingBtn').hidden = !endingAvailable(progress);
}
function openJourney() {
  renderJourney(); openSheet('journeyOverlay');
  consumeRewardMarks(rewardPending.journey, $('journeyChapters'), 'data-journey', 'reward-route', true);
  $('journeyCard').scrollTop = 0; $('journeyTitle').focus({ preventScroll: true });
}
function closeJourney() {
  closeSheet('journeyOverlay', 'journeyBtn');
}
function selectJourneyChapter(ci) {
  if (!CHAPTERS[ci]) return;
  closeSheet('journeyOverlay', null, false); selectedChapter = ci; $('stagePicker').open = true; renderLevelGrid();
  $('chapterPicker').querySelector(`[data-chapter="${ci}"]`).focus();
}
function openEnding(from = 'title') {
  const progress = storyProgress();
  if (!endingAvailable(progress)) return false;
  endingReturn = from; endingElapsed = 0;
  if (from === 'clear') { cancelClearPresentation(); closeSheet('clearOverlay', null, false); }
  if (from === 'journey') closeSheet('journeyOverlay', null, false);
  $('endingRecord').textContent = `${progress.count}개 수로 구출 완료 · ★ ${totalStars()} / ${LEVELS.length * 3}`;
  $('endingAfter').textContent = !progress.complete ? '새로 들어온 수로가 기다리고 있어요. 남은 수로도 마저 구출해 주세요.'
    : totalStars() < LEVELS.length * 3 ? '남은 별을 모으거나 오늘의 구조작전에서 새로운 물길을 열어 주세요.'
    : '모든 별도 모았어요! 오늘의 구조작전에서 새로운 물길을 열어 주세요.';
  openSheet('endingOverlay');
  $('endingCard').scrollTop = 0; $('endingTitle').focus({ preventScroll: true });
  drawEnding(endingElapsed); return true;
}
function closeEnding() {
  closeSheet('endingOverlay', 'endingBtn');
  if (endingReturn === 'clear' && cleared) { openSheet('clearOverlay'); $('nextBtn').focus({ preventScroll: true }); }
  else if (endingReturn === 'journey') openJourney();
}
function endingToTitle() { endingReturn = 'title'; closeEnding(); show('title'); }
function endingToDaily() { endingReturn = 'title'; closeEnding(); openDaily(); }
function continueStory() {
  cancelClearPresentation();
  if (FREE) { const difficulty = FREE.difficulty; openFree(); startFree(difficulty, true); }
  else if (DAILY) continueDaily();
  else if (PILOT) continuePilot();
  else if (storyLast(LVL) && storyProgress().complete) openEnding('clear');
  else if (storyNext(LVL) !== undefined) loadLevel(storyNext(LVL));
  else show('title');
}
function drawEnding(t) {
  const canvas = $('endingScene'), r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const d = Math.min(window.devicePixelRatio || 1, 2.5), w = r.width, h = r.height, ctx = canvas.getContext('2d');
  if (canvas.width !== Math.round(w * d) || canvas.height !== Math.round(h * d)) {
    canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
  }
  ctx.setTransform(d, 0, 0, d, 0, 0);
  const time = reduceMotion ? 0 : Math.max(0, t), u = reduceMotion ? 1 : Math.min(1, time / 4);
  const gradient = ctx.createLinearGradient(0, 0, w, h); gradient.addColorStop(0, C.water); gradient.addColorStop(1, C.sea);
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(210,243,231,.22)'; ctx.lineWidth = 1.5;
  for (let row = 0; row < 6; row++) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 6) { const y = h * (row + 0.5) / 6 + Math.sin(x * 0.035 + time * 0.6 + row) * 3; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }
  ctx.fillStyle = C.concrete;
  for (const top of [true, false]) {
    ctx.beginPath(); ctx.moveTo(0, top ? 0 : h); ctx.lineTo(w * 0.27, top ? 0 : h);
    ctx.lineTo(w * 0.2, h * (top ? 0.32 : 0.75)); ctx.lineTo(0, h * (top ? 0.32 : 0.75)); ctx.closePath(); ctx.fill();
  }
  const eased = 1 - Math.pow(1 - u, 2), sx = w * (0.14 + 0.6 * eased), sy = h * 0.54 + Math.sin(time * 0.8) * h * 0.025;
  drawShark(ctx, sx, sy, 0, Math.min(76, w * 0.22), time, u < 1, 1, 1, currentSkin());
}
// Chapter title card: region picture, the route so far, the chapter's story and its new device. It covers the first
// canal of every chapter after the first until it is cleared, once per app session; the canal's start cue and device
// guide wait. Retrying the canal and resuming an attempt that already moved skip it. Nothing is saved.
// Chapters keep being added, so nothing here assumes a chapter count or a final chapter.
const chapterCardShown = new Set();
let chapterCardAt = 0;
const chapterOpen = () => !$('chapterOverlay').hidden;
function chapterCardDue(i, keep, chap) {
  return chap.ci > 0 && STORY_POSITION[i] === chap.start && !(save.best[i] >= 1) && !keep?.moves && !chapterCardShown.has(chap.ci);
}
// The card's route window: two chapters back, this one in the middle, two ahead. Slots past either end of the current
// chapter list stay empty and the line fades out, so the route never shows an end point.
const chapterRouteStops = (ci, total = CHAPTERS.length) => [-2, -1, 0, 1, 2].map(d => ci + d).map(k => k >= 0 && k < total ? k : null);
function openChapterCard(ci) {
  const chapter = CHAPTERS[ci], devices = chapterDevices(ci), art = $('chapterArt'), route = $('chapterRoute'), journey = storyProgress().chapters;
  chapterCardShown.add(ci); chapterCardAt = performance.now();
  art.classList.remove('no-art'); art.innerHTML = '<img alt="" width="720" height="480">';
  setRegionArt(art.querySelector('img'), chapter.region);
  route.innerHTML = chapterRouteStops(ci).map(k => k == null ? '<li class="gap"></li>'
    : k === ci ? `<li class="now">${k + 1}</li>` : k > ci ? `<li>${k + 1}</li>` : journey[k].complete ? '<li class="done">✓</li>' : `<li class="past">${k + 1}</li>`).join('');
  route.setAttribute('aria-label', `구출 여정 ${ci + 1}장`);
  $('chapterNumber').textContent = `${ci + 1}장`;
  $('chapterName').textContent = chapter.name;
  $('chapterIntro').textContent = JOURNEY_STORY[ci]?.intro || '';
  $('chapterIntro').hidden = !JOURNEY_STORY[ci];
  const names = devices.map(k => DEVICE_GUIDES.find(d => d.key === k)?.name).filter(Boolean);
  $('chapterDevice').hidden = !names.length;
  $('chapterDevice').innerHTML = names.length ? `<canvas data-k="${devices[0]}" width="72" height="72" aria-hidden="true"></canvas><span>새 장치 · ${names.join(', ')}</span>` : '';
  $('chapterDevice').querySelectorAll('canvas').forEach(drawLegendIcon);
  $('chapterGo').textContent = `${ci + 1}장 시작`;
  $('chapterCard').classList.toggle('chapter-playing', !reduceMotion);
  openSheet('chapterOverlay'); sfx.chapter();
  $('chapterGo').focus({ preventScroll: true });
  // The shark hops from the last chapter's stop (slot 1) to this one in the middle (slot 2). Layout offsets: the card's
  // entry scale does not count.
  const shark = $('chapterShark'), centre = li => li.offsetLeft + li.offsetWidth / 2;
  drawRouteShark(shark); shark.style.left = centre(route.children[2]) + 'px';
  if (!reduceMotion && typeof shark.animate === 'function') {
    const dx = centre(route.children[1]) - centre(route.children[2]);
    shark.animate([{ transform: `translateX(${dx}px)` }, { transform: `translate(${dx / 2}px, -7px)`, offset: .5 }, { transform: 'none' }],
      { duration: 900, delay: 300, easing: 'ease-in-out', fill: 'backwards' });
  }
}
function drawRouteShark(canvas) {
  const w = 44, h = 28, d = Math.min(window.devicePixelRatio || 1, 3), x = canvas.getContext('2d');
  canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
  x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, w, h);
  drawShark(x, w / 2, h / 2, 0, 26, 0, false);
}
function closeChapterCard() {
  if (!chapterOpen() || performance.now() - chapterCardAt < 450) return;   // a double tap on "다음 장으로" must not skip it
  sfx.start(); closeSheet('chapterOverlay');
  showDeviceGuide(true);
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
  { id: 'sakura', name: '벚꽃 상어', need: { stars: 20 }, body: '#ef9dca', fin: '#c96fa2',
    deco: (ctx, L, W, T) => { for (const [x, y, s] of [[0.28, -0.14, 1], [0.0, 0.2, 0.85], [-0.2, -0.16, 0.7]]) flower(ctx, L * x, W * y, T * 0.035 * s); } },
  { id: 'wave', name: '파도 상어', need: { stars: 45 }, body: '#52cbd6', fin: '#268caa',
    pattern: (ctx, L, W, T) => {
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = Math.max(1.2, T * 0.03);
      for (const off of [-0.24, 0.24]) {
        ctx.beginPath();
        for (let x = -0.36; x <= 0.5; x += 0.02) { const y = W * off + Math.sin(x * 24) * W * 0.09; x === -0.36 ? ctx.moveTo(L * x, y) : ctx.lineTo(L * x, y); }
        ctx.stroke();
      }
    } },
  { id: 'maple', name: '단풍 상어', need: { stars: 75 }, body: '#eba06c', fin: '#b86236',
    deco: (ctx, L, W, T) => mapleLeaf(ctx, L * 0.22, 0, T * 0.11) },
  { id: 'snow', name: '눈꽃 상어', need: { stars: 105 }, body: '#d0eaf5', fin: '#7cb6d3',
    deco: (ctx, L, W, T) => {
      ctx.fillStyle = '#d23c3c';
      ctx.beginPath(); ctx.moveTo(L * 0.17, W * 0.42); ctx.lineTo(-L * 0.06, W * 1.0); ctx.lineTo(L * 0.02, W * 1.02); ctx.lineTo(L * 0.22, W * 0.46); ctx.fill();
      ctx.beginPath(); ctx.ellipse(L * 0.2, 0, L * 0.05, W * 0.58, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = Math.max(1, T * 0.018);
      ctx.beginPath(); ctx.moveTo(L * 0.2, -W * 0.5); ctx.lineTo(L * 0.2, W * 0.5); ctx.stroke();
      ctx.fillStyle = '#fff'; for (const [x, y] of [[0.02, -0.22], [-0.18, 0.12], [0.34, 0.18]]) { ctx.beginPath(); ctx.arc(L * x, W * y, T * 0.02, 0, 7); ctx.fill(); }
    } },
  { id: 'gold', name: '황금 상어', need: { stars: 144 }, body: '#f7c552', fin: '#c08a26',
    pattern: (ctx, L, W, T, t) => {
      const p = ((t * 0.5) % 1.6) - 0.3;   // a glint sweeping from tail to head
      ctx.fillStyle = 'rgba(255,248,214,.45)'; ctx.beginPath();
      ctx.moveTo(L * (p - 0.5), -W); ctx.lineTo(L * (p - 0.38), -W); ctx.lineTo(L * (p - 0.48), W); ctx.lineTo(L * (p - 0.6), W); ctx.fill();
    },
    deco: (ctx, L, W, T, t) => { ctx.globalAlpha *= 0.6 + 0.4 * Math.sin(t * 5); sparkle(ctx, L * 0.3, -W * 0.18, T * 0.07); ctx.globalAlpha = 1; } },
  { id: 'lighthouse', name: '등대 상어', need: { streak: 7 }, body: '#ece6dc', fin: '#c9c2b6',
    pattern: (ctx, L, W) => { ctx.fillStyle = '#cf3b33'; for (const x of [0.3, 0.02, -0.26]) ctx.fillRect(L * (x - 0.05), -W, L * 0.1, W * 2); } },
  { id: 'coral', name: '산호 상어', need: { visits: 3 }, body: '#fa9a86', fin: '#cd6c67',
    pattern: (ctx, L, W, T) => {
      ctx.strokeStyle = '#ffe5c8'; ctx.lineWidth = Math.max(1.5, T * 0.025); ctx.lineCap = 'round';
      for (const x of [-0.2, 0.08, 0.3]) {
        ctx.beginPath(); ctx.moveTo(L * x, W * 0.4); ctx.lineTo(L * x, -W * 0.35);
        ctx.moveTo(L * x, 0); ctx.lineTo(L * (x - 0.08), -W * 0.15);
        ctx.moveTo(L * x, -W * 0.15); ctx.lineTo(L * (x + 0.07), -W * 0.3); ctx.stroke();
      }
    } },
  { id: 'starsea', name: '별바다 상어', need: { operations: 7 }, body: '#9692e8', fin: '#625dad',
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
const sound = createGameAudio({ enabled: () => save.sound, active: () => !renderSuspended() });
const sfx = sound.effects;
function ac() { return sound.unlock(); }

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
  const sprite = typeof SHARK_ART !== 'undefined' && SHARK_ART.get('swim', skin);
  if (sprite) {
    const size = T * 1.06, wag = reduceMotion ? 0 : Math.sin(t * (moving ? 14 : 4)) * (moving ? .14 : .04);
    ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(cx, cy); ctx.rotate(ang); ctx.scale(stretch, 1 + (1 - stretch) * .8);
    ctx.fillStyle = 'rgba(9,54,85,.22)'; ctx.beginPath(); ctx.ellipse(0, T * .07, T * .4, T * .23, 0, 0, Math.PI * 2); ctx.fill();
    // Only the tail flexes; the nose and collision cell keep their heading.
    const sw = sprite.width, sh = sprite.height, cut = Math.round(sw * .27);
    ctx.save(); ctx.translate(-size * .23, 0); ctx.rotate(wag);
    ctx.drawImage(sprite, 0, 0, cut + 2, sh, -size * .27, -size / 2, size * (cut + 2) / sw, size); ctx.restore();
    ctx.drawImage(sprite, cut, 0, sw - cut, sh, -size * .23, -size / 2, size * (sw - cut) / sw, size);
    // Authored skins already contain perspective-correct details; only decorate the legacy fallback.
    if (!SHARK_ART.hasSkin('swim', skin)) {
      if (skin.pattern) { ctx.save(); ctx.beginPath(); ctx.ellipse(T * .12, 0, T * .28, T * .18, 0, 0, Math.PI * 2); ctx.clip(); skin.pattern(ctx, T * .8, T * .4, T, t); ctx.restore(); }
      if (skin.deco) { ctx.save(); skin.deco(ctx, T * .8, T * .4, T, t); ctx.restore(); }
    }
    ctx.restore(); return;
  }
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
  const scales = ctx.createLinearGradient(0, -w, 0, w); scales.addColorStop(0, '#fffbe5'); scales.addColorStop(.55, '#e0e8ce'); scales.addColorStop(1, '#96b7a8');
  ctx.fillStyle = scales; ctx.beginPath(); ctx.ellipse(0, 0, l, w, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#fcffe9'; ctx.lineWidth = Math.max(1, T * .018); ctx.stroke();
  ctx.fillStyle = '#a4b5a0'; ctx.beginPath(); ctx.ellipse(-l * 0.1, -w * 0.3, l * 0.7, w * 0.24, 0, 0, 7); ctx.fill();
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(l * 0.6, -w * 0.15, T * 0.018, 0, 7); ctx.fill();
  ctx.restore();
}
function drawBuoy(ctx, cx, cy, T, t) {
  const r = T * .3, b = reduceMotion ? 0 : Math.sin(t * 2 + cx) * T * .015;
  ctx.save(); ctx.translate(cx, cy + b);
  ctx.strokeStyle = 'rgba(5,45,66,.3)'; ctx.lineWidth = r * .58;
  ctx.beginPath(); ctx.arc(1, T * .055, r * .72, 0, Math.PI * 2); ctx.stroke();
  const paint = ctx.createLinearGradient(-r, -r, r, r);
  paint.addColorStop(0, '#ffcb84'); paint.addColorStop(.35, '#ff973f'); paint.addColorStop(1, '#df511b');
  ctx.strokeStyle = paint; ctx.lineWidth = r * .56;
  ctx.beginPath(); ctx.arc(0, 0, r * .72, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#fff3d8';
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + .35; ctx.beginPath(); ctx.arc(0, 0, r * .72, a - .19, a + .19); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(1, T * .02);
  ctx.beginPath(); ctx.arc(0, 0, r * .91, Math.PI * 1.06, Math.PI * 1.86); ctx.stroke();
  ctx.strokeStyle = '#ac481e'; ctx.lineWidth = Math.max(1, T * .025);
  ctx.beginPath(); ctx.arc(0, 0, r * .43, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
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
  const shell = ctx.createLinearGradient(-W, -L, W, L); shell.addColorStop(0, '#ffffff'); shell.addColorStop(.55, '#f7f2df'); shell.addColorStop(1, '#b7d4d4');
  hull(); ctx.fillStyle = shell; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#3c6f82'; ctx.stroke();
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
  ctx.fillStyle = '#176781'; ctx.fill();
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
  ctx.fillStyle = 'rgba(10,54,72,.25)'; ctx.fillRect(x + p, y + p, s, s);
  ctx.strokeStyle = ghost ? C.star : C.net; ctx.lineWidth = Math.max(1.5, T * .032);
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
// Sluice works quay dressing (promenade tiles only, never water): a short blue pipe with a valve wheel, mooring bollards.
function drawPipe(ctx, px, py, T, seed) {
  const len = T * 0.72, w = T * 0.2;
  ctx.save(); ctx.translate(px + T / 2, py + T / 2); if (Math.floor(seed * 100) % 2) ctx.rotate(Math.PI / 2);
  ctx.globalAlpha = 0.85; ctx.lineWidth = Math.max(1, T * 0.025); ctx.strokeStyle = '#7ea3c2';
  ctx.fillStyle = '#bfd8ee'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-len / 2, -w / 2, len, w, w / 2); else ctx.rect(-len / 2, -w / 2, len, w); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#a3c4e0'; for (const k of [-0.3, 0.3]) { ctx.fillRect(len * k - T * 0.03, -w * 0.7, T * 0.06, w * 1.4); ctx.strokeRect(len * k - T * 0.03, -w * 0.7, T * 0.06, w * 1.4); }
  ctx.strokeStyle = '#2d7184'; ctx.lineWidth = Math.max(1.2, T * 0.03); ctx.beginPath(); ctx.arc(0, 0, w * 0.7, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-w * 0.7, 0); ctx.lineTo(w * 0.7, 0); ctx.moveTo(0, -w * 0.7); ctx.lineTo(0, w * 0.7); ctx.stroke();
  ctx.restore();
}
function drawBollard(ctx, x, y, T) {
  ctx.fillStyle = 'rgba(9,63,87,.18)'; ctx.beginPath(); ctx.ellipse(x + T * 0.02, y + T * 0.04, T * 0.1, T * 0.07, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#f8ffff'; ctx.strokeStyle = '#7da3b5'; ctx.lineWidth = Math.max(1, T * 0.02);
  ctx.beginPath(); ctx.arc(x, y, T * 0.085, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#5f8fb4'; ctx.beginPath(); ctx.arc(x, y, T * 0.045, 0, 7); ctx.fill();
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
// dent left where the shark slid to a stop on sand: a trough behind it and a little ridge ahead (`ang` = arrival heading)
function drawSandDent(ctx, x, y, T, ang, k) {
  if (k <= 0) return;
  ctx.save();
  ctx.translate(x + T / 2, y + T / 2); ctx.rotate(ang);
  ctx.fillStyle = `rgba(120,90,50,${(0.22 * k).toFixed(3)})`;
  ctx.beginPath(); ctx.ellipse(-T * 0.08, 0, T * 0.2, T * 0.085, 0, 0, 7); ctx.fill();
  ctx.fillStyle = `rgba(105,78,42,${(0.18 * k).toFixed(3)})`;
  ctx.beginPath(); ctx.ellipse(-T * 0.06, 0, T * 0.13, T * 0.04, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = `rgba(255,250,235,${(0.5 * k).toFixed(3)})`; ctx.lineWidth = Math.max(1, T * 0.03); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(T * 0.06, 0, T * 0.1, -0.9, 0.9); ctx.stroke();
  ctx.restore();
}
// whirlpool: dark eye with three turning spiral arms; `flash` brightens it right after a jump
function drawWhirl(ctx, cx, cy, T, t, flash = 0) {
  const r = T * 0.46;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, `rgba(4,22,30,${0.8 - flash * 0.3})`); grad.addColorStop(1, 'rgba(4,22,30,0)');
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(reduceMotion ? 0.6 : t * (2.4 + flash * 6));
  ctx.strokeStyle = flash ? '#ffffff' : '#d2beff'; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.5, T * 0.05);
  for (let k = 0; k < 3; k++) {
    ctx.rotate(Math.PI * 2 / 3); ctx.globalAlpha = 0.8; ctx.beginPath();
    for (let a = 0; a <= 1.001; a += 0.1) { const ang = a * 2.6, rr = r * (0.12 + a * 0.8); a ? ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr) : ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr); }
    ctx.stroke();
  }
  ctx.restore(); ctx.globalAlpha = 1;
}
// Sluice gate in a one-tile channel. Uses the provided art when it has loaded, otherwise simple piers and shutter shapes.
// open: 0 = closed .. 1 = open; the shutter halves slide out of both piers. axis 'V' = water runs up/down (art as drawn),
// 'H' rotates the drawing only (collision is the whole tile either way). A closed gate never renders as an open channel.
// Device pixels of one tile for the cached SVG rasters (the canvas transform carries the display scale).
const tilePixels = (ctx, T) => { const m = ctx.getTransform && ctx.getTransform(); return Math.max(8, Math.round(T * (m && m.a ? Math.hypot(m.a, m.b) : 1))); };
function drawGate(ctx, x, y, T, open, axis = 'V', pulse = 0) {
  const art = typeof BOARD_ART !== 'undefined' ? BOARD_ART : null, px = tilePixels(ctx, T);
  const openImg = art && art.get('gateOpen', px), closedImg = art && art.get('gateClosed', px), shut = 1 - clamp01(open), h = T / 2;
  ctx.save(); ctx.translate(x + h, y + h); if (axis === 'H') ctx.rotate(Math.PI / 2);
  if (pulse) ctx.translate(Math.sin(pulse * Math.PI * 3) * T * 0.025, 0);
  if (openImg && closedImg) {
    ctx.drawImage(openImg, -h, -h, T, T);
    if (shut > 0) {
      const band = T * (37 + shut * 27) / 128;   // pier inner edge (37/128) to the centre (64/128)
      ctx.save(); ctx.beginPath(); ctx.rect(-h, -h, band, T); ctx.rect(h - band, -h, band, T); ctx.clip();
      ctx.drawImage(closedImg, -h, -h, T, T); ctx.restore();
    }
  } else {
    const pier = (sx) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(sx, -T * 0.3, T * 0.19, T * 0.57, T * 0.08); else ctx.rect(sx, -T * 0.3, T * 0.19, T * 0.57); ctx.fill(); ctx.stroke(); };
    ctx.fillStyle = '#fffdf5'; ctx.strokeStyle = '#235c6d'; ctx.lineWidth = Math.max(1.5, T * 0.035);
    pier(-T * 0.41); pier(T * 0.22);
    if (shut > 0) {
      const reach = T * 0.2 * shut;
      ctx.fillStyle = '#ff974c';
      ctx.fillRect(-T * 0.22, -T * 0.16, reach + 1, T * 0.32); ctx.fillRect(T * 0.22 - reach - 1, -T * 0.16, reach + 1, T * 0.32);
      if (shut >= 1) ctx.strokeRect(-T * 0.22, -T * 0.16, T * 0.44, T * 0.32);
    }
  }
  ctx.restore();
}
// Switch: a raised orange button when off, a pressed mint button with a check when on (shape, not only colour, differs).
function drawSwitch(ctx, x, y, T, on, press = 0) {
  const art = typeof BOARD_ART !== 'undefined' ? BOARD_ART : null, img = art && art.get(on ? 'switchOn' : 'switchOff', tilePixels(ctx, T));
  const s = 1 - 0.1 * Math.sin(clamp01(press) * Math.PI), cx = x + T / 2, cy = y + T / 2;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  if (img) ctx.drawImage(img, -T / 2, -T / 2, T, T);
  else {
    ctx.fillStyle = '#fffdf5'; ctx.strokeStyle = '#235c6d'; ctx.lineWidth = Math.max(1.5, T * 0.03);
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-T * 0.36, -T * 0.35, T * 0.72, T * 0.71, T * 0.18); else ctx.rect(-T * 0.36, -T * 0.35, T * 0.72, T * 0.71); ctx.fill(); ctx.stroke();
    ctx.fillStyle = on ? '#4ac8b8' : '#ff974c';
    ctx.beginPath(); ctx.arc(0, on ? T * 0.02 : -T * 0.05, T * (on ? 0.23 : 0.26), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = on ? '#136e69' : '#235c6d'; ctx.lineWidth = Math.max(2, T * 0.04); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (on) { ctx.moveTo(-T * 0.09, T * 0.27); ctx.lineTo(-T * 0.02, T * 0.32); ctx.lineTo(T * 0.1, T * 0.22); }
    else { ctx.moveTo(-T * 0.08, T * 0.29); ctx.lineTo(T * 0.08, T * 0.29); }
    ctx.stroke();
  }
  ctx.restore();
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
// Escape push-in toward the exit (Peggle-style closing moment); sand dents remember stops (permanence).
let exitZoom = null;
const EXIT_ZOOM = { scale: 0.06, dur: 0.45 }, sandSeen = new Map();
// First canal of a new device (one per chapter): its tiles pulse after the device guide closes, until the first move.
let deviceSpot = null;
const DEVICE_SPOT = { dur: 1.8, pulses: 3 };
let coach = null;   // first-play finger hint: { kind: 'swipe', dir } or { kind: 'tap', x, y }
const netPop = new Map(), jetFlash = new Map();
const contactPulse = new Map(), netRetract = new Map();
let hudLast = { moves: -1, fish: -1 };
// DAILY = {date, stage, version, tier, level}; legacy makeDaily has no stage/version. Null in story mode.
// PILOT = {index, level} for the separate North Harbor → Sluice Works course (src/pilot.js).
let DAILY = null, FREE = null, STORY = null, PILOT = null, deco = 0;   // Only one mode is active; each mode keeps its own saved turns.
const curLevel = () => FREE ? FREE.level : DAILY ? DAILY.level : PILOT ? PILOT.level : STORY || LEVELS[LVL];

function freshState(level) {
  g = parseLevel(level);
  const state = { pos: g.start.slice(), dir: 'U', fish: [], nets: [], boats: g.boats.map(b => b.slice()), moves: 0, history: [] };
  if (g.switches.length) state.gate = 0;   // switch press parity; canals without switches keep the old turn shape
  return state;
}
function netSet() { return new Set(st.nets); }
function fishMask() { let m = 0; st.fish.forEach(i => m |= 1 << i); return m; }

// Resume only matching layouts and complete, structurally valid turns. Effects and pending input are not saved.
function levelSignature(level) { return JSON.stringify([level.map, level.nets || 0]); }
function copyTurn(s) {
  const copy = { pos: s.pos.slice(), dir: s.dir, fish: s.fish.slice(), nets: s.nets.slice(), boats: s.boats.map(b => b.slice()), moves: s.moves };
  if (s.gate === 0 || s.gate === 1) copy.gate = s.gate;
  return copy;
}
function restoreSession(record, level, id) {
  if (!record || record.version !== 1 || record.id !== id || record.layout !== levelSignature(level)) return null;
  const grid = parseLevel(level), s = record.state;
  const ints = (a, limit) => Array.isArray(a) && a.length <= limit && new Set(a).size === a.length && a.every(i => Number.isInteger(i) && i >= 0);
  const valid = v => {
    if (!v || !Array.isArray(v.pos) || v.pos.length !== 2 || !v.pos.every(Number.isInteger) || !['U', 'D', 'L', 'R'].includes(v.dir)
      || !Number.isSafeInteger(v.moves) || v.moves < 0 || !ints(v.fish, grid.fish.length) || v.fish.some(i => i >= grid.fish.length)
      || !ints(v.nets, grid.nets) || !Array.isArray(v.boats) || v.boats.length !== grid.boats.length
      || (grid.switches.length ? v.gate !== 0 && v.gate !== 1 : v.gate !== undefined && v.gate !== 0)) return false;
    const [x, y] = v.pos, index = y * grid.w + x;
    if (grid.cells[index] === 'G' && !gateIsOpen(grid, index, v.gate)) return false;   // a boat may wait in a closing gate; the shark never
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
function storyLevel(i) {
  const legacy = LEGACY_STORY_LEVELS[i], record = save.sessions.story;
  return legacy && record?.id === i && record.layout === levelSignature(legacy) ? legacy : LEVELS[i];
}
function storyResumeId() { return save.sessions.story?.id ?? save.sessions.importedStory?.id; }
function storySession(i = storyResumeId()) {
  const record = save.sessions.story?.id === i ? save.sessions.story : save.sessions.importedStory;
  return Number.isInteger(i) && LEVELS[i] && unlocked(i) ? restoreSession(record, storyLevel(i), i) : null;
}
function migratePilotToStory() {
  if (save.storyExpansion === 1) return;
  const validStars = n => Number.isInteger(n) && n >= 1 && n <= 3;
  const oldBest = save.pilot?.version === 1 ? save.pilot.best : null;
  const access = new Set();
  for (let i = 48; i < 48 + PILOT_LEVELS.length; i++) {
    const id = LEVELS[i].id, stars = oldBest?.[id];
    if (validStars(stars)) {
      save.best[i] = Math.max(validStars(save.best[i]) ? save.best[i] : 0, stars);
      access.add(48); access.add(i);
    }
    const oldHint = save.hintUsage['pilot:' + id], newHint = save.hintUsage['story:' + i];
    if (Number.isSafeInteger(oldHint?.count) && oldHint.count >= 0 && Number.isFinite(oldHint.lastUsed) && oldHint.lastUsed >= 0) {
      save.hintUsage['story:' + i] = { count: Math.max(Number.isSafeInteger(newHint?.count) && newHint.count >= 0 ? newHint.count : 0, oldHint.count),
        lastUsed: Math.max(Number.isFinite(newHint?.lastUsed) && newHint.lastUsed >= 0 ? newHint.lastUsed : 0, oldHint.lastUsed) };
    }
    const oldSession = save.sessions.pilot;
    if (restoreSession(oldSession, LEVELS[i], id)) {
      access.add(48); access.add(i);
      const migrated = { ...oldSession, id: i };
      if (Number.isInteger(save.sessions.story?.id) && LEVELS[save.sessions.story.id] && restoreSession(save.sessions.story, storyLevel(save.sessions.story.id), save.sessions.story.id)) save.sessions.importedStory = migrated;
      else save.sessions.story = migrated;
    }
  }
  // Retain the old records as an archive; import once so clearing/restarting never revives a stale session.
  save.storyAccess = [...access]; save.storyExpansion = 1; persist();
}
// 2026-10-07 장 재구성: the play order changed while LEVELS indices and every saved record stayed put.
// Keep each canal the previous sequential rule had opened, and remember a rescue completed before the new canals.
// 2026-10-08 early-curve reorder (storyOrder 3): the order moved again; canals the 2026-10-07 order had opened stay open.
function migrateStoryOrder() {
  if (save.storyOrder === 3) return;
  const access = new Set(Array.isArray(save.storyAccess) ? save.storyAccess : []);
  if (save.storyOrder !== 2) {
    const previousCount = 60, cleared = i => Number.isInteger(save.best[i]) && save.best[i] >= 1 && save.best[i] <= 3;
    for (let i = 0; i < previousCount; i++) {
      if (i === 0 || save.best[i - 1] != null || i >= 48 && (access.has(i) || cleared(i))) access.add(i);
    }
    if (Array.from({ length: previousCount }, (_, i) => i).every(cleared)) save.storyRescued = 1;
  }
  STORY_ORDER_V2.forEach((i, position) => { if (position === 0 || save.best[STORY_ORDER_V2[position - 1]] != null) access.add(i); });
  save.storyAccess = [...access]; save.storyOrder = 3; persist();
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
  save.sessions[FREE ? 'free' + FREE.difficulty : DAILY ? dailySessionKey(DAILY) : PILOT ? 'pilot' : 'story'] = {
    version: 1, id: FREE ? freeId(FREE) : DAILY ? dailyStageId(DAILY) : PILOT ? PILOT.level.id : LVL, layout: levelSignature(curLevel()), state };
  if (!FREE && !DAILY && !PILOT && save.sessions.importedStory?.id === LVL) delete save.sessions.importedStory;
  if (DAILY && Number.isInteger(DAILY.stage)) {
    if (!save.sessions.dailyStages) save.sessions.dailyStages = {};
    save.sessions.dailyStages[DAILY.stage] = save.sessions.daily;
  }
  persist();
}
function pauseGame() {
  if ($('gameScreen').hidden || !st) return;
  queued = null; gest = null;
  if (anim) finishAnim(false);
  clearPlayEffects(); view.ang = view.target = ANG[st.dir];
  checkpoint();
}

// effects live in tile units; x, y are tile coordinates of the cell's top-left
const ring = (x, y, size = 1, alpha = 0.55) => { if (!reduceMotion) particles.push({ kind: 'ring', x, y, life: 1, size, alpha }); };
function clearPlayEffects() {
  particles.length = 0; wake.length = 0;
  netPop.clear(); jetFlash.clear(); contactPulse.clear(); netRetract.clear();
  bump = null; settle = null; pop = null; exitZoom = null;
  for (const icon of flyingFish) icon.remove();
  flyingFish.clear(); goalCatchAt = -Infinity; endDeviceSpot();
}
const flyingFish = new Set();   // HUD-bound mullet icons in flight (flyFish)
let goalCatchAt = -Infinity;    // when one last landed in the HUD goal (catchGoal)
const deviceSpotShown = new Set();   // LEVELS indices whose spotlight has played in this app session
// Adds tiles (and the HUD net pill) to the spotlight that starts once nothing covers the board. `level` marks a
// chapter's device introduction for this session; `seen` lists simple devices introduced by the spotlight itself.
function addDeviceSpot(cells, { level = null, net = false, seen = [] } = {}) {
  if (!deviceSpot || deviceSpot.started) deviceSpot = { level: null, cells: [], net: false, seen: [], t: 0, started: false };
  for (const c of cells) if (!deviceSpot.cells.includes(c)) deviceSpot.cells.push(c);
  if (level != null) deviceSpot.level = level;
  deviceSpot.net = deviceSpot.net || net; deviceSpot.seen.push(...seen);
}
function startDeviceSpot() {
  deviceSpot.started = true;
  if (deviceSpot.level != null) deviceSpotShown.add(deviceSpot.level);
  if (deviceSpot.seen?.length) markDevicesSeen(deviceSpot.seen);
  if (deviceSpot.net) $('netTool').classList.add('spot');
}
function endDeviceSpot() {
  if (deviceSpot?.started && deviceSpot.net) $('netTool').classList.remove('spot');
  deviceSpot = null;
}
// Sand cells the shark has stopped on in this attempt, derived from the saved turn history so undo, restart and
// resume stay consistent: [cell index, arrival direction]. The current stop appears once the shark has landed.
function sandStops() {
  const stops = new Map();
  if (!g.cells.includes('s')) return stops;
  st.history.slice(1).forEach(h => { if (cellAt(g, h.pos[0], h.pos[1]) === 's') stops.set(h.pos[1] * g.w + h.pos[0], h.dir); });
  if ((!anim || anim.landed) && cellAt(g, st.pos[0], st.pos[1]) === 's') stops.set(st.pos[1] * g.w + st.pos[0], st.dir);
  return stops;
}
// A portal has its own short phase, so a long/fast swim cannot skip the disappearance and return.
// Ordinary tiles still follow the existing glide curve; jumps are not counted as swimming distance.
function prepareSwim(a) {
  a.swimDur = a.dur; a.travel = a.n - a.warps.size; a.portals = [];
  const curve = a.win ? DASH : GLIDE, hold = reduceMotion ? 0 : 0.18;
  let passed = 0;
  for (const k of a.warps) {
    const distance = (k - 1 - passed) / a.travel;
    let lo = 0, hi = 1;
    for (let j = 0; j < 18; j++) { const mid = (lo + hi) / 2; if (curve(mid) < distance) lo = mid; else hi = mid; }
    a.portals.push({ k, start: (lo + hi) / 2 * a.swimDur + passed * hold, hold });
    passed++;
  }
  a.dur += passed * hold;
}
function swimProgress(a) {
  let time = a.t, passed = 0;
  for (const portal of a.portals) {
    if (a.t < portal.start) break;
    if (portal.hold && a.t < portal.start + portal.hold) return portal.k - 1 + (a.t - portal.start) / portal.hold;
    time -= portal.hold; passed++;
  }
  return Math.min(a.n, (a.win ? DASH : GLIDE)(time / a.swimDur) * a.travel + passed);
}
function splashAt(x, y, n, dir, force = 1) {
  if (reduceMotion) return;
  for (let k = 0; k < n; k++) {
    const a = dir ? ANG[dir] + (Math.random() - 0.5) * 2.2 : Math.random() * Math.PI * 2, sp = (1.5 + Math.random() * 3) * force;
    particles.push({ kind: 'drop', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, size: 0.035 + Math.random() * 0.04 });
  }
}

function loadLevel(i, keep, definition = null) {
  DAILY = null; FREE = null; PILOT = null; LVL = i; save.last = i; deco = i;
  STORY = definition || (keep ? storyLevel(i) : LEVELS[i]);
  const role = LEVEL_ROLES[STORY.role || 'regular'], chap = chapterOf(i);
  const preview = STORY_POSITION[i] === chap.end && CHAPTERS[chap.ci + 1]?.region === 'sluice-works';
  // Retrying (replay passes the current definition) never reopens the chapter card.
  const card = !definition && chapterCardDue(i, keep, chap);
  enter(STORY, keep, `${chap.ci + 1}장 · 수로 ${STORY_POSITION[i] + 1} / ${LEVELS.length} · ${STORY === LEVELS[i] ? role.label : '이전 수로'}`,
    CHAPTERS[chap.ci].region, preview, card);
  // The canal that introduces a chapter's new device spotlights it before the first move, once per app session until
  // cleared. Nets have no tile, so their HUD pill glows instead.
  const fresh = STORY === LEVELS[i] && !st.moves && !deviceSpotShown.has(i) && !(save.best[i] >= 1);
  const kinds = reduceMotion || !fresh ? [] : introducedDevices(i);
  if (kinds.length) {
    const cells = [];
    g.cells.forEach((c, k) => { if (kinds.some(kind => kind !== 'boat' && kind !== 'net' && DEVICE_TILES[kind].test(c))) cells.push(k); });
    if (kinds.includes('boat')) st.boats.forEach(b => cells.push(b[0]));
    if (cells.length || kinds.includes('net')) addDeviceSpot(cells, { level: i, net: kinds.includes('net') });
  }
  if (card) openChapterCard(chap.ci);
}
function loadDaily(daily, keep) {
  DAILY = daily; FREE = null; PILOT = null; deco = dailySeed(dailyStageId(daily)) % 997;
  const label = Number.isInteger(daily.stage) ? `${+daily.date.slice(5, 7)}/${+daily.date.slice(8)} 구조작전 · ${daily.stage + 1} / 3 · ${daily.tier.label}` : '이전 수로 · 진행 이어하기';
  enter(daily.level, keep, label);
}
function loadFree(run, keep) {
  FREE = run; DAILY = null; PILOT = null; deco = run.seed % 997;
  enter(run.level, keep, `자유 수로 · ${FREE_TIERS[run.difficulty].label} · ${run.serial}번째`);
}
function loadPilot(i, keep) {
  const level = PILOT_LEVELS[i], region = PILOT_REGIONS.find(r => r.id === level.region);
  PILOT = { index: i, level }; DAILY = null; FREE = null; deco = 701 + i;
  enter(level, keep, `${region.name} · 시험 ${i + 1} / ${PILOT_LEVELS.length} · ${LEVEL_ROLES[level.role || 'regular'].label}`);
}
const replay = () => FREE ? loadFree(FREE) : DAILY ? loadDaily(DAILY) : PILOT ? loadPilot(PILOT.index) : loadLevel(LVL, null, STORY);
// held: a chapter card covers the new canal; closing it plays the start cue and opens the device guide instead.
function enter(level, keep, label, region = level.region, regionPreview = !!level.boundary, held = false) {
  sfx.clear();
  cancelClearPresentation();
  hintRequest++;
  st = keep || freshState(level);
  if (keep) { g = parseLevel(level); if (!st.boats) st.boats = g.boats.map(b => b.slice()); }
  anim = null; hint = null; cleared = false; clearPlayEffects();
  sandSeen.clear(); for (const cell of sandStops().keys()) sandSeen.set(cell, -Infinity);   // resumed dents show at once
  pop = reduceMotion ? null : { t: 0 }; queued = null;
  view.x = st.pos[0]; view.y = st.pos[1]; view.ang = view.target = ANG[st.dir];
  setBoardRegion(region, regionPreview);
  $('lvNum').textContent = label;
  $('lvName').textContent = level.name;
  setTip(level.tip);
  closeSheet('clearOverlay', null, false);
  hudLast = { moves: -1, fish: -1 };
  updateHud(); resize(); updateHintButton();
  frameEl.classList.remove('enter'); void frameEl.offsetWidth; frameEl.classList.add('enter');
  ring(st.pos[0], st.pos[1], 0.9, 0.4);
  setupCoach();
  checkpoint();
  if (held) return;
  sfx.start();
  showDeviceGuide(true);
}
// shown once: a finger swiping the first move of 수로 1, and a finger tapping the net tile on the first net level
function setupCoach() {
  coach = null;
  if ((PILOT ? PILOT.index === 0 : !DAILY && !FREE && LVL === 0) && !save.coachSwipe && !st.moves && !st.history.length) {
    const p = plan(g, st.pos, 0, new Set(), 0, true, st.boats, st.gate);
    if (p) coach = { kind: 'swipe', dir: p.seq[0] };
  } else if (g.nets && !save.coachNet) {
    const p = plan(g, st.pos, fishMask(), netSet(), g.nets - st.nets.length, true, st.boats, st.gate, netPickup());
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
  gameNeedsPaint = true;
  const el = $('tip'); el.textContent = text; el.classList.toggle('hint', !!isHint);
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}
function updateHud() {
  gameNeedsPaint = true;
  const L = curLevel(), parts = [];
  const done = g.fish.length && st.fish.length === g.fish.length;
  const icon = g.fish.length ? '<path d="M18 12c-3-6-9-6-12 0 3 6 9 6 12 0z"/><path d="M6 12l-4-4v8z"/><path d="M15 11h.01"/>' : '<path d="M5 12h14M13 6l6 6-6 6"/>';
  parts.push(`<span class="chip goal${done ? ' done' : ''}" aria-label="${g.fish.length ? `숭어 수집 ${st.fish.length} / ${g.fish.length}${done ? ', 수집 완료' : ''}` : '목표: 바다로 탈출'}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span class="hud-stack"><span class="k">${g.fish.length ? done ? '숭어 완료' : '숭어 모으기' : '목표'}</span><b>${g.fish.length ? `${st.fish.length} / ${g.fish.length}` : '바다로 탈출'}</b></span></span>`);
  parts.push(`<span class="chip move${st.moves > L.par ? ' over' : ''}"><span class="hud-stack"><span class="count">이동 <b>${st.moves}</b></span><span class="k">기준 ${L.par}회</span></span></span>`);
  updateNetStatus();
  $('stats').innerHTML = parts.join('');
  if (hudLast.moves >= 0 && st.moves !== hudLast.moves) $('stats').querySelector('.move b').classList.add('bump');
  if (g.fish.length && hudLast.fish >= 0 && st.fish.length !== hudLast.fish) $('stats').querySelector('.goal b').classList.add('bump');
  hudLast = { moves: st.moves, fish: st.fish.length };
  $('undoBtn').disabled = !st.history.length;
  catchGoal();
}
// The round net tool at the end of the bottom row, in every mode: gold with the nets left on a net canal, grey "없음"
// on other canals once the player has met nets, hidden before that. A fresh attempt on a net canal also points at it
// with a callout over the other controls until the first move or net edit (or a tap on the callout).
let netCallout = { st: null, done: false };
const netsKnown = () => g.nets > 0 || !!save.seenDevices?.includes('net');
function updateNetStatus() {
  const active = g.nets > 0, left = g.nets - st.nets.length, known = netsKnown();
  $('netTool').hidden = !known; $('controls').classList.toggle('with-net', known);
  $('netTool').classList.toggle('has-nets', active);
  $('netToolLabel').textContent = active ? '그물' : '없음';
  $('netToolCount').textContent = `${left}`; $('netToolCount').hidden = !active;
  $('netTool').setAttribute('aria-label', active ? `그물 ${left}개 남음, 모두 ${g.nets}개. 누르면 사용법을 봐요` : '이 수로에는 그물이 없어요');
  if (netCallout.st !== st) netCallout = { st, done: false };   // enter() starts each attempt with a new st
  if (st.history.length) netCallout.done = true;
  $('netCallout').hidden = !active || netCallout.done;
  if (!$('netCallout').hidden) $('netCallout').textContent = `그물 ${g.nets}개를 쓸 수 있어요 · 빈 물 칸을 톡!`;
}
const NO_NETS_TIP = '이 수로에는 그물이 없어요. 화면을 밀어서 길을 찾아요.';
// A caught mullet pops up from its tile and flies into the HUD goal, whose icon bounces as it lands (collect to
// counter). Visual only: the count is already updated. Undo, replay and leaving drop flights in progress.
const FISH_FLIGHT_MS = 560, GOAL_CATCH_MS = 320;
function flyFish(fx, fy) {
  const goal = $('stats').querySelector('.goal svg');
  if (reduceMotion || !goal || typeof cvs.animate !== 'function') return;
  const from = cvs.getBoundingClientRect(), to = goal.getBoundingClientRect(), size = Math.round(Math.max(28, Math.min(44, T * 0.8)));
  const x0 = from.left + OX + (fx + 0.5) * T - size / 2, y0 = from.top + OY + (fy + 0.5) * T - size / 2, lift = size * 0.5;
  const dx = to.left + to.width / 2 - size / 2 - x0, dy = to.top + to.height / 2 - size / 2 - y0;
  // Head toward the goal; a fish flying left is mirrored instead of turning belly-up.
  const flip = dx < 0 ? -1 : 1, rise = Math.atan2(-(dy + lift), Math.abs(dx)) * 180 / Math.PI, turn = flip < 0 ? rise : -rise;
  const pose = (x, y, s) => `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${turn.toFixed(1)}deg) scale(${flip * s},${s})`;
  const icon = document.createElement('canvas'), d = Math.min(window.devicePixelRatio || 1, 3), paint = icon.getContext('2d');
  icon.className = 'fish-fly'; icon.width = icon.height = Math.round(size * d);
  icon.style.width = icon.style.height = size + 'px'; icon.style.left = x0 + 'px'; icon.style.top = y0 + 'px';
  paint.scale(d, d); drawFish(paint, size / 2, size / 2, size * 1.5, 0, 0);
  document.body.append(icon); flyingFish.add(icon);
  icon.animate([
    { transform: pose(0, 0, 0.6), opacity: 0, easing: 'cubic-bezier(.2,.7,.4,1)' },
    { transform: pose(0, -lift, 1.1), opacity: 1, offset: 0.25, easing: 'cubic-bezier(.55,0,.85,.45)' },
    { transform: pose(dx, dy, 0.45), opacity: 0.9 },
  ], { duration: FISH_FLIGHT_MS, fill: 'forwards' }).onfinish = () => {
    icon.remove();
    if (!flyingFish.delete(icon)) return;   // dropped meanwhile by clearPlayEffects
    goalCatchAt = performance.now(); catchGoal();
  };
}
// The goal icon bounce; a HUD re-render during it continues the bounce on the new icon instead of cutting it off.
function catchGoal() {
  const age = performance.now() - goalCatchAt;
  if (!(age >= 0 && age < GOAL_CATCH_MS)) return;
  const icon = $('stats').querySelector('.goal svg');
  if (icon && typeof icon.animate === 'function') icon.animate([{ transform: 'none' }, { transform: 'scale(1.35) rotate(-8deg)', offset: 0.4 }, { transform: 'none' }],
    { duration: GOAL_CATCH_MS, delay: -age, easing: 'ease-out' });
}
function pushHistory() {
  st.history.push(copyTurn(st));
  if (st.history.length > 200) st.history.shift();
}

// The result is committed at once; the screen follows through `anim`. A swipe during the glide is queued (one deep).
function tryMove(d) {
  if (cleared) return;
  if (anim) { queued = d; return; }
  hintRequest++;
  const r = turn(g, st.pos, d, netSet(), st.boats, st.gate);
  if (!r.path.length) {   // nothing changed: the tip (a hint or a stuck notice) still holds
    bump = { d, t: 0 }; view.target = ANG[d]; settle = null; queued = null;
    sfx.bump();
    const [dx, dy] = DIRS[d]; splashAt(st.pos[0] + dx * 0.45, st.pos[1] + dy * 0.45, 5, d, 0.6);
    return;
  }
  hint = null; if ($('tip').classList.contains('hint')) setTip(curLevel().tip);
  pushHistory(); endDeviceSpot();   // the spotlight has done its job once the player moves
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
  const boatsFrom = st.boats, gateFrom = st.gate;
  st.boats = r.boats; if (r.pressed) st.gate = r.gate;
  // Show the same turn order as the engine: shark swims, a pressed switch turns the gates, then boats move.
  // Input stays queued until every phase finishes.
  const gateDur = r.pressed && !reduceMotion ? 0.2 : 0;
  const boatDur = !reduceMotion && !r.win && boatsFrom.some((b, k) => b[0] !== st.boats[k][0] || b[1] !== st.boats[k][1]) ? 0.16 : 0;
  anim = { boatsFrom, gateFrom, pressed: r.pressed, gateDur, boatDur, pts, dirs, p: 0, t: 0, n: pts.length - 1, steps, speed: 0, eats, jets, win: r.win, eaten: new Set(), exitFx: false, warps, warpDone: new Set(), warpScale: 1,
    dur: Math.min(0.62, 0.09 + 0.052 * steps) + (r.win ? 0.3 : 0) };
  prepareSwim(anim);
  bump = null; settle = null; pop = null;
  ring(pts[0][0], pts[0][1], 0.7, 0.35);
  haptic('tick'); updateHud(); coachDone('swipe'); checkpoint();
}
function eatFish(fi) {
  anim.eaten.add(fi);
  if (!st.fish.includes(fi)) st.fish.push(fi);
  const complete = st.fish.length === g.fish.length;
  sfx.eat(complete, anim.eaten.size - 1); haptic('light');
  const [fx, fy] = g.fish[fi];
  if (!reduceMotion) {
    // Keep a pickup near its own tile even if the shark has already entered a portal or the next move.
    const k = anim.eats.find(e => e.fi === fi).k, [dx, dy] = DIRS[anim.dirs[k]];
    particles.push({ kind: 'fish', x: fx, y: fy, toX: fx + dx * 0.35, toY: fy + dy * 0.35, fi, life: 1 });
    particles.push({ kind: 'text', x: fx, y: fy, vx: 0, vy: -1.3, life: 1, text: complete ? '완료!' : '냠!' });
  }
  ring(fx, fy, 0.9, 0.5);
  if (!reduceMotion) for (let s = 0; s < 7; s++) { const a = s / 7 * Math.PI * 2 + Math.random() * 0.4; particles.push({ kind: 'spark', x: fx, y: fy, vx: Math.cos(a) * 2.4, vy: Math.sin(a) * 2.4, life: 1, rot: Math.random() * 6 }); }
  updateHud(); flyFish(fx, fy);   // after the HUD update so the flight aims at the goal chip just drawn
}
function landShark(a) {
  if (a.landed || a.win) return;
  a.landed = true;
  const [x, y] = a.pts[a.steps];
  if (a.pressed) {   // stopping on a switch presses it; the linked gates turn right after (gate phase in draw)
    sfx.press(); sfx.gate(); haptic('medium'); ring(x, y, 0.9, 0.6);
    g.gates.forEach(i => ring(i % g.w, Math.floor(i / g.w), 0.8, 0.45));
  }
  if (cellAt(g, x, y) === 's') {
    settle = { t: 0, d: a.dirs[a.steps], amp: 0.35 }; ring(view.x, view.y, 0.8, 0.45); sfx.sand(); haptic('light');
    if (!reduceMotion) for (let k = 0; k < 10; k++) { const an = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2; particles.push({ kind: 'grain', x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: 1, size: 0.03 + Math.random() * 0.03 }); }
    return;
  }
  const d = a.dirs[a.steps], [dx, dy] = DIRS[d], index = (y + dy) * g.w + x + dx;
  const soft = cellAt(g, x + dx, y + dy) !== '#' && st.nets.includes(index), amp = Math.min(1, a.steps / 5) * (soft ? 0.5 : 1);
  settle = { t: 0, d, amp };
  if (!reduceMotion && (soft || ['o', 'G'].includes(cellAt(g, x + dx, y + dy)))) contactPulse.set(index, { at: clock, amp });
  ring(x + dx * 0.3, y + dy * 0.3, 0.6 + 0.5 * amp, 0.5);
  splashAt(x + dx * 0.45, y + dy * 0.45, 4 + Math.round(6 * amp), d, 0.5 + amp * 0.7);
}
function finishAnim(present = true) {
  const a = anim;
  const last = a.pts[a.win ? a.n : a.steps]; view.x = last[0]; view.y = last[1];
  if (present) landShark(a);
  anim = null;
  a.eats.forEach(e => { if (!st.fish.includes(e.fi)) st.fish.push(e.fi); });
  updateHud();
  if (a.win) { onClear(); return; }
  if (g.nets && !save.coachNet && !queued) setupCoach();
  if (queued) { const q = queued; queued = null; tryMove(q); }
}
function undo() {
  if (anim || !st.history.length) return;
  hintRequest++;
  const h = st.history.pop();
  Object.assign(st, { pos: h.pos, dir: h.dir, fish: h.fish, nets: h.nets, boats: h.boats || st.boats, moves: h.moves });
  if (h.gate === 0 || h.gate === 1) st.gate = h.gate;
  view.x = st.pos[0]; view.y = st.pos[1]; view.ang = view.target = ANG[st.dir];
  cleared = false; hint = null; queued = null; clearPlayEffects(); pop = reduceMotion ? null : { t: 0 };
  ring(view.x, view.y, 0.8, 0.45); sfx.undo(); haptic('tick');
  setTip(curLevel().tip); updateHud(); checkpoint();
}
function restart() { if (anim) return; replay(); haptic('light'); }

// 2026-10-08: a set net stays until undo/restart. Daily operations v1–v3 and free canals v1–v3 (and the old single daily)
// were generated and rated when nets could be picked up and set again, so those canals keep that rule.
const netPickup = () => DAILY ? !(DAILY.version >= 4) : FREE ? FREE.version < 4 : false;
function tapTile(gx, gy) {
  if (anim || cleared) return;
  const device = cellAt(g, gx, gy);
  if (device === 'p' || device === 'G') { setTip(device === 'p' ? '스위치는 상어가 그 위에서 멈춰야 눌려요.' : '수문은 스위치로 열고 닫아요. 닫힌 수문은 벽처럼 막아요.'); return; }
  if (!g.nets) { setTip(save.seenDevices?.includes('net') ? NO_NETS_TIP : '화면을 밀어서 상어를 움직여요. 방향키도 돼요.'); return; }
  const idx = gy * g.w + gx, c = cellAt(g, gx, gy);
  const hasFish = g.fish.some((f, i) => f[0] === gx && f[1] === gy && !st.fish.includes(i)) || st.boats.some(b => b[0] === idx);
  const at = st.nets.indexOf(idx);
  if (at >= 0) {
    if (!netPickup()) { setTip('한 번 친 그물은 걷을 수 없어요. 되돌리기로 무를 수 있어요.'); haptic('light'); ring(gx, gy, 0.5, 0.3); return; }
    hintRequest++; pushHistory(); st.nets.splice(at, 1); netPop.delete(idx);
    contactPulse.delete(idx); if (!reduceMotion) netRetract.set(idx, clock);
    sfx.net(true); haptic('tick'); ring(gx, gy, 0.6, 0.35); updateHud(); checkpoint();
    if (hint) refreshHint(); else setTip(curLevel().tip);
    return;
  }
  if (c !== '.' || hasFish || (gx === st.pos[0] && gy === st.pos[1])) { setTip('그물은 비어 있는 물 위에만 칠 수 있어요.'); haptic('light'); return; }
  if (st.nets.length >= g.nets) { setTip(netPickup() ? '그물을 다 썼어요. 쳐 둔 그물을 누르면 다시 걷을 수 있어요.' : '그물을 다 썼어요. 되돌리기로 무르면 다시 칠 수 있어요.'); haptic('light'); return; }
  hintRequest++; pushHistory(); st.nets.push(idx); netRetract.delete(idx);
  if (!reduceMotion) netPop.set(idx, clock);
  sfx.net(); haptic('medium'); coachDone('tap');
  ring(gx, gy, 0.9, 0.5); splashAt(gx, gy, 6, null, 0.5);
  updateHud(); checkpoint();
  if (hint) refreshHint(); else setTip(curLevel().tip);
}

/* ---------- hint allowance (separate from undoable turns and star rewards) ---------- */
const HINT_INSTANT = 2, HINT_COOLDOWN_MS = 12000;
let hintSearching = 0;
function hintUsageRecord() {
  const key = FREE ? freeId(FREE) : DAILY ? 'daily:' + dailyStageId(DAILY) : PILOT ? 'pilot:' + PILOT.level.id : 'story:' + LVL;
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
  const key = FREE ? freeId(FREE) : DAILY ? 'daily:' + dailyStageId(DAILY) : PILOT ? 'pilot:' + PILOT.level.id : 'story:' + LVL, record = hintUsageRecord();
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
// Stuck nudge, once per attempt: after 40 s of uncovered play without a move, undo or net edit, or once the moves pass
// the star target, the hint button pulses and the tip invites a hint. It waits while a hint is shown, searched or
// cooling down, and stays away while the first-play finger guides the move. Nothing is saved.
const HINT_NUDGE_IDLE = 40;
let hintNudge = { st: null, mark: '', idle: 0, done: false };
// Runs a solver generator in ~8ms slices between paints (a timer per 32 states made one hint take seconds).
// Resolves undefined when alive() turns false; null still means the complete search found no route.
async function runChunked(search, alive) {
  while (alive()) {
    const deadline = performance.now() + 8;
    let step;
    do { step = search.next(); } while (!step.done && performance.now() < deadline);
    if (step.done) return step.value;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return undefined;
}
// After every turn or net change, look for any way out in the background (never spends a hint). With none left the
// tip says so and the undo button pulses; the next change starts a new check.
let stuckCheck = { st: null, mark: '', request: 0 };
const turnMark = () => st.moves + ':' + st.history.length + ':' + st.nets.join(',');
function tickStuck() {
  if (!st || anim || cleared) return;
  const mark = turnMark();
  if (stuckCheck.st === st && stuckCheck.mark === mark) return;
  const request = stuckCheck.request + 1, state = st, map = g;
  stuckCheck = { st, mark, request };
  if (!st.history.length) return;
  const alive = () => stuckCheck.request === request && st === state && g === map && turnMark() === mark && !anim && !cleared && !$('gameScreen').hidden;
  runChunked(planSearch(g, st.pos, fishMask(), netSet(), g.nets - st.nets.length, false, st.boats, st.gate, netPickup()), alive).then(p => {
    if (p !== null || !alive()) return;
    hintNudge.stuckMark = mark;   // no idle/over-target nudge on top of this notice while the turn stays stuck
    pulseRewardMark($('undoBtn'), 'nudge');
    setTip('여기서는 나갈 길이 없어요. 되돌리기로 한 수 물러나 보세요.', true);
  });
}
function tickHintNudge(dt) {
  if (!st) return;
  if (hintNudge.st !== st) hintNudge = { st, mark: '', idle: 0, done: false };   // enter() starts each attempt with a new st
  const mark = st.moves + ':' + st.history.length;
  if (mark !== hintNudge.mark) { hintNudge.mark = mark; hintNudge.idle = 0; }
  if (hintNudge.done || cleared || anim || coach || $('app').inert || hintNudge.stuckMark === turnMark()) return;
  hintNudge.idle += dt;
  const over = st.moves > curLevel().par;
  if (!over && hintNudge.idle < HINT_NUDGE_IDLE) return;
  if (hint || hintWait() || (hintSearching !== 0 && hintSearching === hintRequest)) return;
  hintNudge.done = true;
  // a net canal where no net has been placed yet: the likely miss is the nets themselves
  if (g.nets > 0 && !st.nets.length && !st.history.some(h => h.nets?.length)) {
    pulseRewardMark($('netTool'), 'nudge');
    setTip(`그물 ${g.nets}개를 쓸 수 있어요. 빈 물 칸을 눌러 보세요.`, true);
    return;
  }
  // Past the target this attempt can no longer earn the move star: point at a restart rather than a hint.
  pulseRewardMark($(over ? 'restartBtn' : 'hintBtn'), 'nudge');
  setTip(over ? '이동이 기준을 넘었어요. 처음부터 하면 별 3개에 다시 도전할 수 있어요.' : '막히면 힌트를 눌러 보세요. 다음 한 수를 보여 줘요.', true);
}

// Keep the same next-move recipe while the player performs its free net edits. Replanning after
// each tap could choose a different equally short solution and send the player back and forth.
function refreshHint() {
  // Under the set-net rule a net the recipe did not ask for cannot be taken back: plan again from here, at no hint cost.
  if (!netPickup() && st.nets.some(i => !hint.target.includes(i))) { hint = null; planHint(false); return; }
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
  haptic('tick');
  return planHint(true);
}
// record: a newly requested hint spends the allowance; a re-plan of a shown hint does not.
async function planHint(record) {
  const request = ++hintRequest, state = st, map = g;
  hintSearching = request;
  const current = () => request === hintRequest && st === state && g === map && !anim && !cleared
    && !$('gameScreen').hidden && !settingsOpen() && !guideOpen();
  setTip('길을 찾는 중…', true);
  updateHintButton();
  try {
    await new Promise(resolve => setTimeout(resolve, 30));
    if (!current()) return;
    const ns = netSet(), left = g.nets - st.nets.length;
    // undefined: cancelled; null: the complete search found no route
    const find = needAll => runChunked(planSearch(g, st.pos, fishMask(), ns, left, needAll, st.boats, st.gate, netPickup()), current);
    let p = await find(true), partial = false;
    if (p === null) { p = await find(false); partial = true; }
    if (!current() || p === undefined) {
      // a sheet opened over the search: put the canal's tip back instead of a search that is no longer running
      if (request === hintRequest && $('tip').textContent === '길을 찾는 중…') setTip(curLevel().tip);
      return;
    }
    if (!p) { hint = null; setTip('여기서는 나갈 길이 없어요. 되돌리기를 눌러 보세요.', true); return; }
    hint = { dir: p.seq[0], target: p.steps[0].nets, moves: p.moves, partial };
    if (record) { recordHintUse(); hintNudge.done = true; }   // the player has found the hint; no invitation in this attempt
    refreshHint();
  } finally {
    if (hintSearching === request) hintSearching = 0;
    updateHintButton();
  }
}

/* ---------- reward presentation: transient events, independent of saved progress ---------- */
const REWARD_TIMING = { first: 240, gap: 220 };
const rewardPending = { stars: new Set(), levels: new Set(), chapters: new Set(), journey: new Set(), daily: new Map(), stamps: new Set(), badges: new Set(), skins: new Set() };
let clearPresentation = 0, clearTimers = new Set(), skinPreviewMotion = new Map(), pendingStoryCount = false, clearReveal = null;
function cancelClearPresentation() {
  sfx.cancelReward();
  clearPresentation++;
  clearReveal = null;
  clearTimers.forEach(clearTimeout); clearTimers.clear();
  $('clearOverlay').classList.toggle('clear-celebrating', false);
  stopSkinPreviews($('clearOverlay'));
}
function interruptClearPresentation() {
  const reveal = clearReveal; cancelClearPresentation(); clearReveal = reveal;
}
function clearLater(callback, delay, token, overlay = true) {
  let timer;
  timer = setTimeout(() => {
    clearTimers.delete(timer);
    if (token !== clearPresentation || !cleared || (overlay && ($('clearOverlay').hidden || renderSuspended()))) return;
    callback();
  }, delay);
  clearTimers.add(timer);
}
function rewardSnapshot() {
  const story = !DAILY && !FREE && !PILOT;
  return { best: story ? save.best[LVL] || 0 : 0,
    stage: DAILY && Number.isInteger(DAILY.stage) ? dailyProgress(DAILY.date).stars[DAILY.stage] : 0,
    stamp: DAILY ? save.journal.days[DAILY.date] || 0 : 0 };
}
function collectRewardEvents(before, stars, skins, badges) {
  const story = !DAILY && !FREE && !PILOT, stamp = DAILY ? save.journal.days[DAILY.date] || 0 : 0;
  if (story && stars > before.best) { rewardPending.stars.add(LVL); pendingStoryCount = true; }
  const next = story ? storyNext(LVL) : undefined;
  if (story && !before.best && next !== undefined) {
    rewardPending.levels.add(next);
    if (STORY_POSITION[LVL] === chapterOf(LVL).end) { rewardPending.chapters.add(chapterOf(next).ci); rewardPending.journey.add(chapterOf(next).ci); }
  }
  if (DAILY && Number.isInteger(DAILY.stage) && !before.stage) {
    if (!rewardPending.daily.has(DAILY.date)) rewardPending.daily.set(DAILY.date, new Set());
    rewardPending.daily.get(DAILY.date).add(DAILY.stage);
  }
  if (DAILY && stamp > before.stamp) rewardPending.stamps.add(DAILY.date);
  skins.forEach(s => rewardPending.skins.add(s.id)); badges.forEach(b => rewardPending.badges.add(b.id));
  return { stamp: stamp > before.stamp ? stamp : 0 };
}
function consumeRewardMarks(pending, root, attribute, className, numeric = false) {
  root.querySelectorAll(`[${attribute}]`).forEach(el => {
    const key = numeric ? +el.getAttribute(attribute) : el.getAttribute(attribute);
    if (!pending.has(key)) return;
    pending.delete(key); pulseRewardMark(el, className);
  });
}
function pulseRewardMark(el, className) {
  el.classList.toggle(className, false);
  if (!reduceMotion) { void el.offsetWidth; el.classList.toggle(className, true); }
}
function applyStoryRewards() {
  if ($('titleScreen').hidden) return;
  if ($('stagePicker').open) {
    consumeRewardMarks(rewardPending.stars, $('levelGrid'), 'data-i', 'reward-updated', true);
    consumeRewardMarks(rewardPending.levels, $('levelGrid'), 'data-i', 'reward-unlock', true);
    consumeRewardMarks(rewardPending.chapters, $('chapterPicker'), 'data-chapter', 'reward-unlock', true);
  }
  if (pendingStoryCount) { pulseRewardMark($('starTotal'), 'reward-count'); pendingStoryCount = false; }
}
function applyOperationRewards() {
  if ($('dailyOverlay').hidden) return;
  const pending = rewardPending.daily.get(shownDailyDate);
  if (!pending) return;
  const next = dailyProgress(shownDailyDate).next;
  $('dailyStages').querySelectorAll('[data-stage]').forEach(el => {
    const stage = +el.dataset.stage;
    el.classList.toggle('reward-next', !reduceMotion && stage === next);
  });
  consumeRewardMarks(pending, $('dailyStages'), 'data-stage', 'reward-stage', true);
  if (!pending.size) rewardPending.daily.delete(shownDailyDate);
}
function applyJournalRewards() {
  if ($('journalOverlay').hidden) return;
  consumeRewardMarks(rewardPending.stamps, $('journalCalendar'), 'data-date', 'reward-stamp');
  consumeRewardMarks(rewardPending.badges, $('journalRewards'), 'data-reward', 'reward-badge');
}
function stopSkinPreviews(root) {
  for (const canvas of skinPreviewMotion.keys()) if (root.contains(canvas)) skinPreviewMotion.delete(canvas);
}
function animateSkinPreview(canvas, skin) {
  drawSkinPreview(canvas, skin);
  if (!reduceMotion) skinPreviewMotion.set(canvas, { skin, time: 0 });
}
function stepRewardPreviews(dt) {
  for (const [canvas, motion] of skinPreviewMotion) {
    if (!canvas.isConnected || canvas.closest('.overlay')?.hidden) { skinPreviewMotion.delete(canvas); continue; }
    motion.time = Math.min(1.2, motion.time + dt);
    drawSkinPreview(canvas, motion.skin, motion.time / 1.2);
    if (motion.time === 1.2) skinPreviewMotion.delete(canvas);
  }
}
function showClearSkinRewards(skins) {
  const root = $('clearUnlocks'); root.hidden = !skins.length;
  root.innerHTML = skins.map(s => `<div class="skin-reveal"><b>새 상어를 만났어요!</b><canvas data-new-skin="${s.id}" role="img" aria-label="새로 얻은 ${s.name}"></canvas><strong>${s.name}</strong><button class="btn skin-wear" type="button" data-wear="${s.id}">지금 입기</button></div>`).join('');
}

function onClear() {
  cancelClearPresentation();
  const token = clearPresentation, audioToken = sfx.token(), before = rewardSnapshot();
  const previousRewards = new Set(earnedJournalRewards().map(r => r.id));
  cleared = true;
  delete save.sessions[FREE ? 'free' + FREE.difficulty : DAILY ? dailySessionKey(DAILY) : PILOT ? 'pilot' : 'story'];
  if (!FREE && !DAILY && !PILOT && save.sessions.importedStory?.id === LVL) delete save.sessions.importedStory;
  if (DAILY && Number.isInteger(DAILY.stage)) delete save.sessions.dailyStages[DAILY.stage];
  const L = curLevel();
  const allFish = st.fish.length === g.fish.length, inPar = st.moves <= L.par;
  const stars = starsForClear(allFish, inPar);
  const earned = [true, stars >= 2, stars === 3];
  if (FREE) recordFreeClear(FREE, stars);
  else if (DAILY) recordDailyStage(DAILY, stars);
  else if (PILOT) recordPilotClear(PILOT.index, stars);   // separate course record: never story stars or skins
  else { save.best[LVL] = Math.max(save.best[LVL] || 0, stars); persist(); }
  const freshSkins = refreshSkins(), nextGoal = nextSkinGoal();
  const freshBadges = earnedJournalRewards().filter(r => !r.skin && !previousRewards.has(r.id));
  const event = collectRewardEvents(before, stars, freshSkins, freshBadges);
  const starSvg = (on, k) => `<span class="star-slot" style="--reward-delay:${REWARD_TIMING.first + k * REWARD_TIMING.gap}ms"><svg class="star${on ? ' on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>${on ? '<span class="star-sparks" aria-hidden="true">✦</span>' : ''}</span>`;
  $('clearStars').innerHTML = earned.map(starSvg).join('');
  $('clearStars').setAttribute('aria-label', `별 ${stars}개`);
  $('clearStars').classList.toggle('three-stars', stars === 3);
  showClearSkinRewards(freshSkins);
  $('clearJournalStamp').hidden = !event.stamp;
  $('clearJournalStamp').textContent = event.stamp === 2 ? '✓ 오늘의 작전 완료 도장을 찍었어요!' : '● 오늘의 참여 도장을 찍었어요!';
  const titles = ['바다로 나갔어요!', '시원하게 탈출!', '상어야, 잘 가!'];
  const story = !DAILY && !FREE && !PILOT, chap = chapterOf(LVL), chapterEnd = story && STORY_POSITION[LVL] === chap.end, last = story && storyLast(LVL);
  const journey = story && storyProgress(), rescueComplete = last && journey.complete;
  const milestone = chapterEnd && journey.chapters[chap.ci].complete && (!last || rescueComplete);
  // Region previews now follow the main chapter sequence as well as legacy developer fixtures.
  const regionEnd = PILOT && (PILOT.level.boundary || PILOT.level.finale) ? PILOT.level : null;
  $('clearStory').hidden = !milestone && !regionEnd;
  $('clearStory').textContent = milestone ? JOURNEY_STORY[chap.ci].outro : regionEnd ? (regionEnd.finale ? '수문을 모두 지나 바깥 바다로 나갔어요! 시험 코스를 끝까지 구출했어요.'
    : '북항을 지나왔어요! 다음은 스위치로 수문을 여닫는 수문 시설이에요.') : '';
  // Every chapter end previews the next chapter's region by name; its opening card (openChapterCard) tells the rest.
  const nextChapter = story && chapterEnd && !last ? CHAPTERS[chap.ci + 1] : null;
  const nextRegion = nextChapter ? nextChapter.region : regionEnd?.boundary ? PILOT_LEVELS[PILOT.index + 1].region : null;
  $('clearRegion').hidden = !nextRegion;
  if (nextChapter) showRegionPreview($('clearRegion'), nextRegion, `다음 지역 · ${chap.ci + 2}장`, { name: nextChapter.name });
  else if (nextRegion) showRegionPreview($('clearRegion'), nextRegion, '다음 지역');
  // The chapter stamp: at the chapter end, and on whichever clear first brings every canal of the chapter to three
  // stars (만점). Derived from kept records; nothing new is saved.
  const chapterRecord = story ? journey.chapters[chap.ci] : null, perfect = !!chapterRecord?.perfect, newlyPerfect = perfect && before.best !== 3;
  if (newlyPerfect) { rewardPending.chapters.add(chap.ci); rewardPending.journey.add(chap.ci); }
  $('clearChapterStamp').hidden = !milestone && !newlyPerfect;
  $('clearChapterStamp').classList.toggle('perfect', perfect);
  $('clearChapterStamp').textContent = `${chap.ci + 1}장 ${perfect ? '만점!' : '완료'} · ★ ${chapterRecord?.stars ?? 0} / ${(chap.end - chap.start + 1) * 3}`;
  $('clearTitle').classList.toggle('story-title', !!milestone || !!regionEnd);
  const operation = DAILY && Number.isInteger(DAILY.stage), progress = DAILY && dailyProgress(DAILY.date);
  $('clearTitle').classList.toggle('operation-title', !!operation || !!FREE);
  $('clearTitle').textContent = FREE ? '자유 수로 구출 성공!' : DAILY ? (operation ? (progress.count === 3 ? '오늘의 구조작전 완료!' : `${DAILY.stage + 1}번째 수로 통과!`) : '이전 수로 완료!')
    : PILOT ? (PILOT.level.finale ? '시험 코스 완료!' : PILOT.level.boundary ? '북항 통과!' : titles[stars - 1])
    : rescueComplete ? '드디어 넓은 바다로!' : milestone ? `${chap.name} 통과!` : titles[stars - 1];
  const row = (label, val, ok, k = -1) => `<li${k >= 0 && earned[k] ? ` class="reward-check" style="--reward-delay:${REWARD_TIMING.first + k * REWARD_TIMING.gap}ms"` : ''}><span>${label}</span><span class="${ok ? 'ok' : 'no'}">${val}</span></li>`;
  $('clearChecks').innerHTML =
    row('바다로 탈출', '성공', true, 0) +
    row('숭어 모두 먹기', g.fish.length ? `${st.fish.length} / ${g.fish.length}` : '숭어 없음', allFish, 1) +
    row('숭어 + 이동 기준', `${st.moves}번 / ${L.par}번${allFish ? '' : ' · 숭어 필요'}`, stars === 3, 2) +
    (operation ? row('오늘의 작전', `${progress.count} / 3 수로 완료`, true) : '') +
    (FREE ? row(`${FREE_TIERS[FREE.difficulty].label} 수로`, `누적 ${save.free.completed[FREE.difficulty]}개 완료`, true) : '') +
    (PILOT ? row('시험 코스', `${pilotProgress().count} / ${PILOT_LEVELS.length} 수로 완료`, true) : '') +
    (DAILY ? row('연속 도전', `${dailyStreak()}일째`, true) : '') +
    (DAILY ? row('누적 기록', `참여 ${journalTotals().visits}일 · 작전 완료 ${journalTotals().operations}일`, true) : '') +
    (freshBadges.length ? `<li class="reward-badge"><span>새 기념 배지</span><span class="ok">${freshBadges.map(r => r.name).join(', ')}</span></li>` : '') +
    (freshSkins.length ? `<li><span>새 상어가 열렸어요</span><span class="new">${freshSkins.map(k => k.name).join(', ')}</span></li>`
      : nextGoal && !DAILY && !FREE && !PILOT ? `<li class="next-skin"><span>다음 상어</span><span>${nextGoal.long}</span></li>` : '');
  $('operationStamp').hidden = !operation || progress.count !== 3;
  $('operationStamp').classList.toggle('reward-stamp', event.stamp === 2 && !reduceMotion);
  $('nextBtn').textContent = FREE ? '새 수로' : PILOT ? (PILOT.level.finale ? '코스 목록' : PILOT.level.boundary ? '수문 시설로' : '다음 수로') : DAILY ? (DAILY.date !== dailyDate() ? '오늘의 작전' : operation && progress.count < 3 ? '다음 수로' : '작전 보기')
    : rescueComplete ? '구출 엔딩 보기' : last ? '수로 목록' : chapterEnd ? '다음 장으로' : '다음 수로';
  clearReveal = (celebrate = true) => {
    clearReveal = null; showClearMascot();
    openSheet('clearOverlay'); if (!renderSuspended()) $('nextBtn').focus({ preventScroll: true });
    $('clearBody').scrollTop = 0;
    $('clearOverlay').classList.toggle('clear-celebrating', celebrate && !reduceMotion);
    if (celebrate && reduceMotion) { sfx.win(audioToken); haptic('success'); }
    else if (celebrate) earned.forEach((on, k) => { if (on) clearLater(() => { sfx.star(k, audioToken); haptic('light'); }, REWARD_TIMING.first + k * REWARD_TIMING.gap, token); });
    $('clearUnlocks').querySelectorAll('[data-new-skin]').forEach(canvas => {
      const skin = SKINS.find(s => s.id === canvas.dataset.newSkin);
      if (celebrate) animateSkinPreview(canvas, skin); else drawSkinPreview(canvas, skin);
    });
    if (celebrate && freshSkins.length) clearLater(() => { sfx.unlockReward(audioToken); if (!reduceMotion) haptic('success'); }, 960, token);
  };
  clearLater(() => { if (!renderSuspended()) clearReveal?.(); }, reduceMotion ? 50 : 650, token, false);
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
  const stars = DAILY_STAGES.map((_, i) => DAILY_OPERATION_VERSIONS.includes(record?.version) && Number.isInteger(record.stars?.[i])
    ? Math.max(0, Math.min(3, record.stars[i])) : 0);
  return { stars, count: stars.filter(Boolean).length, next: stars.findIndex(n => !n), total: stars.reduce((a, b) => a + b, 0) };
}
// Operation v3 uses the devices learned when the date's first canal was prepared, so a device learned in the story
// later that day never changes canals already offered.
function dailyLearned(date) {
  const saved = save.dailyDevices;
  if (saved?.date === date && Array.isArray(saved.devices) && saved.devices.every(d => typeof d === 'string')) return saved.devices;
  save.dailyDevices = { date, devices: learnedDevices() }; persist();
  return save.dailyDevices.devices;
}
// A started date stays on its original generator, even before its first clear.
function dailyOperationVersion(date) {
  const record = save.dailyOps[date];
  if (DAILY_OPERATION_VERSIONS.includes(record?.version)) return record.version;
  const packets = [save.sessions.daily, ...Object.values(save.sessions.dailyStages)];
  for (const packet of packets) for (const version of DAILY_OPERATION_VERSIONS) {
    if (DAILY_STAGES.some((_, stage) => packet?.id === dailyStageId({ date, stage, version }))) return version;
  }
  return DAILY_OPERATION_VERSION;
}
function recordDailyStage(daily, stars) {
  if (!journalDateValid(daily.date) || !Number.isInteger(stars) || stars < 1 || stars > 3) return;
  if (Number.isInteger(daily.stage) && DAILY_OPERATION_VERSIONS.includes(daily.version) && DAILY_STAGES[daily.stage]) {
    if (save.dailyOps[daily.date] && save.dailyOps[daily.date].version !== daily.version) return;
    const progress = dailyProgress(daily.date);
    progress.stars[daily.stage] = Math.max(progress.stars[daily.stage], stars);
    save.dailyOps[daily.date] = { version: daily.version, stars: progress.stars };
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
  const id = save.sessions.daily?.id, version = dailyOperationVersion(date);
  const active = DAILY_STAGES.findIndex((_, stage) => id === dailyStageId({ date, stage, version }));
  return active >= 0 ? active : DAILY_STAGES.findIndex((_, stage) => save.sessions.dailyStages[stage]?.id === dailyStageId({ date, stage, version }));
}
function renderDaily() {
  const date = dailyDate(), progress = dailyProgress(date), streak = dailyStreak();
  for (const key of ['daily', 'dailyLegacy']) {
    if (save.sessions[key] && String(save.sessions[key].id).slice(0, 10) !== date) { delete save.sessions[key]; persist(); }
  }
  for (const [key, record] of Object.entries(save.sessions.dailyStages)) {
    if (!record || String(record.id).slice(0, 10) !== date) { delete save.sessions.dailyStages[key]; persist(); }
  }
  $('dailyDate').textContent = `${+date.slice(5, 7)}/${+date.slice(8)} ${WEEKDAY_KO[new Date(date + 'T12:00:00').getDay()]}`;
  $('dailyMeta').textContent = streak ? `${streak}일째 도전 중!` : '매일 새로운 수로 3개';
  $('dailyState').innerHTML = `<b>${progress.count} / 3</b><span>${progress.count === 3 ? '완료' : savedDailyStage(date) >= 0 || progress.count ? '이어서' : '도전'}</span>`;
  $('dailyBtn').classList.toggle('done', progress.count === 3);
  $('dailyBtn').setAttribute('aria-label', `오늘의 도전, 오늘의 구조작전, ${dateLabel(date)}, ${progress.count} / 3 수로 완료`);
  const totals = journalTotals();
  $('journalSummary').textContent = `참여 ${totals.visits}일 · 완료 ${totals.operations}일`;
}
function renderOperation() {
  const date = dailyDate(), progress = dailyProgress(date), version = dailyOperationVersion(date);
  shownDailyDate = date;
  $('operationDate').textContent = `${dateLabel(date)} · ${version >= 2 ? dailyTheme(date).label + ' · ' : ''}${progress.count} / 3 완료 · ★ ${progress.total} / 9`;
  $('operationNote').textContent = progress.count === 3 ? '오늘의 작전을 마쳤어요! 별을 더 모으거나 내일 새 수로에 도전해요.'
    : save.daily[date] ? (progress.count ? '오늘 참여가 인정됐어요. 나머지 수로도 이어서 도전해요.' : '이전 수로의 참여 기록은 유지돼요. 새 작전에도 도전해 보세요.')
    : '한 수로만 완료해도 연속 기록이 이어져요.';
  $('dailyStages').innerHTML = DAILY_STAGES.map((tier, stage) => {
    const locked = progress.stars.slice(0, stage).some(n => !n), stars = progress.stars[stage];
    const id = { date, stage, version }, packet = dailySessionRecord(id);
    const resume = packet?.id === dailyStageId(id), moves = packet?.state?.moves;
    const state = resume && Number.isSafeInteger(moves) ? `${moves}회 진행 · 이어하기` : stars ? `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} · 다시 도전`
      : locked ? '앞 수로를 완료하면 열려요' : '시작하기';
    return `<button class="daily-stage${stars ? ' done' : ''}" type="button" data-stage="${stage}" aria-label="${stage + 1}번째 ${tier.name} ${tier.label}, ${state}" ${locked ? 'disabled' : ''}>
      <span class="stage-number" aria-hidden="true">${stars ? '✓' : stage + 1}</span><span class="stage-copy"><b>${tier.name} <small>${tier.label}</small></b><span>${state}</span></span></button>`;
  }).join('');
  $('operationLearnNote').hidden = version !== DAILY_OPERATION_VERSION || !learningDevices();
  $('dailyLegacyBtn').hidden = !save.sessions.dailyLegacy;
  $('dailyLegacyBtn').disabled = false;
  $('operationStatus').textContent = '';
  applyOperationRewards();
}
function openDaily() {
  if (!$('gameScreen').hidden) show('title');
  dailyRequest++;
  renderDaily(); renderOperation();
  openSheet('dailyOverlay');
  applyOperationRewards();
  $('dailyDone').focus({ preventScroll: true });
}
function closeDaily() {
  dailyRequest++;
  closeSheet('dailyOverlay', 'dailyBtn');
}
async function startDaily(stage) {
  const date = dailyDate(), progress = dailyProgress(date), version = dailyOperationVersion(date);
  if (date !== shownDailyDate) { renderDaily(); renderOperation(); $('operationStatus').textContent = '날짜가 바뀌어 새 작전이 열렸어요.'; return; }
  if (!DAILY_STAGES[stage] || progress.stars.slice(0, stage).some(n => !n)) return;
  const request = ++dailyRequest;
  $('dailyStages').querySelectorAll('button').forEach(b => { b.disabled = true; });
  $('dailyLegacyBtn').disabled = true;
  $('operationStatus').textContent = '수로를 준비하고 있어요…';
  try {
    await new Promise(resolve => setTimeout(resolve, 0));
    if (request !== dailyRequest) return;
    if (dailyCacheDate !== `${date}:v${version}`) { dailyCacheDate = `${date}:v${version}`; dailyCache = new Map(); }
    let daily = dailyCache.get(stage);
    if (!daily) {
      const search = makeDailyStageSearch(date, stage, version, version === DAILY_OPERATION_VERSION ? dailyLearned(date) : null);
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
      return `<span data-date="${date}" class="journal-day${stamp ? ' stamped' : ''}${stamp === 2 ? ' complete' : ''}${date === today ? ' today' : ''}" role="img" aria-label="${m}월 ${i + 1}일, ${state}${date === today ? ', 오늘' : ''}"><b>${i + 1}</b><small aria-hidden="true">${stamp === 2 ? '✓' : stamp ? '●' : '·'}</small></span>`;
    }).join('');
  $('journalRewards').innerHTML = JOURNAL_REWARDS.map(r => {
    const value = totals[r.metric], earned = value >= r.goal || !!(r.skin && save.owned?.includes(r.skin));
    const condition = `${r.metric === 'visits' ? '누적 참여' : '세 수로 완료'} ${r.goal}일`;
    return `<li data-reward="${r.id}" class="journal-reward${earned ? ' earned' : ''}"><span class="journal-mark" aria-hidden="true">${r.mark}</span><div><b>${r.name}</b><small>${r.skin ? '상어 외형' : '기념 배지'} · ${condition}</small><progress max="${r.goal}" value="${Math.min(value, r.goal)}" aria-label="${r.name}, ${condition}, ${earned ? '획득 완료' : `${value}일 달성`}"></progress></div><span class="journal-earned">${earned ? '획득' : `${value} / ${r.goal}`}</span></li>`;
  }).join('');
  applyJournalRewards();
}
function openJournal(from = 'title') {
  journalReturn = from;
  if (from === 'daily') closeDaily();
  journalMonth = dailyDate().slice(0, 7); renderJournal();
  openSheet('journalOverlay');
  applyJournalRewards();
  $('journalCard').scrollTop = 0; $('journalTitle').focus({ preventScroll: true });
}
function closeJournal() {
  closeSheet('journalOverlay', 'journalBtn');
  if (journalReturn === 'daily') { openDaily(); $('dailyJournalBtn').focus({ preventScroll: true }); }
}
function journalToSkins() {
  journalReturn = 'title'; closeJournal(); openSkins();
}
/* ---------- my shark: title card and skin picker ---------- */
function drawSkinPreview(canvas, skin, progress = null) {
  const r = canvas.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2.5);
  if (!r.width) return;
  const w = Math.round(r.width * d), h = Math.round(r.height * d);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const x = canvas.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0);
  const backgrounds = { basic: '#d4eff6', sakura: '#fae1eb', wave: '#c7eeed', maple: '#f9e5cd', snow: '#e0edf6',
    gold: '#f5e7bc', lighthouse: '#dae9f0', coral: '#fae0d4', starsea: '#e4def7' };
  x.fillStyle = backgrounds[skin.id] || '#d4eff6'; x.fillRect(0, 0, r.width, r.height);
  x.fillStyle = 'rgba(255,255,255,.48)'; x.beginPath(); x.ellipse(r.width * .55, r.height * .48, r.width * .37, r.height * .43, -.2, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(255,255,255,.65)'; x.lineWidth = 1.5;
  for (const yy of [0.25, 0.8]) { x.beginPath(); for (let px = 0; px <= r.width; px += 6) { const py = r.height * yy + Math.sin(px * 0.12) * 2; px ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); }
  const glide = progress == null ? 0 : Math.sin(progress * Math.PI);
  if (typeof SHARK_ART !== 'undefined' && SHARK_ART.draw(x, 'portrait', r.width * (.5 + glide * .04), r.height * .48, Math.min(r.width * .94, r.height * 1.46), skin)) {
    if (!SHARK_ART.hasSkin('portrait', skin) && (skin.deco || skin.pattern)) {
      x.save(); x.translate(r.width * .48, r.height * .47);
      x.beginPath(); x.ellipse(0, 0, r.width * .18, r.height * .16, 0, 0, Math.PI * 2); x.clip();
      if (skin.pattern) skin.pattern(x, r.width * .45, r.height * .3, r.width * .6, 0);
      if (skin.deco) skin.deco(x, r.width * .45, r.height * .3, r.width * .6, 0); x.restore();
    }
    return;
  }
  drawShark(x, r.width * (0.52 + glide * 0.08), r.height * 0.5, -0.12, Math.min(r.width / 1.5, r.height * 1.05), progress == null ? 0.5 : 0.5 + progress * 1.2, glide > 0.01, 1, 1, skin);
}
// The nearest locked shark: by stars first, then a journal/daily one. Shown on the main card and the result sheet.
function nextSkinGoal() {
  const owned = new Set(save.owned || ['basic']), stars = totalStars();
  const byStars = SKINS.filter(s => !owned.has(s.id) && s.need.stars).sort((a, b) => a.need.stars - b.need.stars)[0];
  if (byStars) return { skin: byStars, short: `${byStars.name.replace(/ 상어$/, '')}까지 ★${byStars.need.stars - stars}`,
    long: `${byStars.name}까지 별 ${byStars.need.stars - stars}개` };
  const other = SKINS.find(s => !owned.has(s.id));
  return other ? { skin: other, short: `다음: ${other.name.replace(/ 상어$/, '')}`, long: `${other.name} · ${skinNeedText(other)}` } : null;
}
function renderSkinCard() {
  const skin = currentSkin(), owned = (save.owned || ['basic']).length, goal = nextSkinGoal();
  // the card's line under 내 상어 is the next goal; the shark in use is in the picture and the label
  $('skinName').textContent = goal ? goal.short : skin.name;
  $('skinName').classList.toggle('goal', !!goal);
  $('skinCount').textContent = `${skin.name} · ${owned} / ${SKINS.length} 모았어요${goal ? ' · ' + goal.long : ''}`;
  requestAnimationFrame(() => drawSkinPreview($('skinPreview'), skin));
}
function skinNeedText(skin) {
  if (skin.need.visits) return `누적 참여 ${skin.need.visits}일 (지금 ${Math.min(journalTotals().visits, skin.need.visits)}일)`;
  if (skin.need.operations) return `세 수로 완료 ${skin.need.operations}일 (지금 ${Math.min(journalTotals().operations, skin.need.operations)}일)`;
  if (skin.need.streak) return `오늘의 수로 ${skin.need.streak}일 연속 (최고 ${bestStreak()}일)`;
  return `별 ${skin.need.stars}개 (지금 ${Math.min(totalStars(), skin.need.stars)}개)`;
}
function renderSkinGrid(equipped = null) {
  stopSkinPreviews($('skinsOverlay'));
  const owned = new Set(save.owned || ['basic']), cur = currentSkin().id;
  $('skinGrid').innerHTML = SKINS.map(skin => {
    const has = owned.has(skin.id), sel = skin.id === cur;
    return `<button class="skin${sel ? ' sel' : ''}" type="button" data-id="${skin.id}" ${has ? '' : 'disabled'} aria-pressed="${sel}">
      <span class="skin-art"><canvas aria-hidden="true"></canvas>${has ? '' : '<span class="skin-lock">잠김</span>'}</span><span class="skin-name">${skin.name}</span>
      <span class="skin-need">${has ? (sel ? '사용 중' : '고르기') : skinNeedText(skin)}</span></button>`;
  }).join('');
  $('skinsSub').textContent = `${owned.size} / ${SKINS.length} 모음 · 별과 구조일지 기록으로 새 상어가 열려요.`;
  requestAnimationFrame(() => {
    if ($('skinsOverlay').hidden) return;
    $('skinGrid').querySelectorAll('.skin').forEach(b => {
      const skin = SKINS.find(k => k.id === b.dataset.id), fresh = rewardPending.skins.delete(skin.id);
      b.classList.toggle('reward-skin', !reduceMotion && (fresh || equipped === skin.id));
      if (fresh || equipped === skin.id) animateSkinPreview(b.querySelector('canvas'), skin);
      else drawSkinPreview(b.querySelector('canvas'), skin);
    });
  });
}
const skinsOpen = () => !$('skinsOverlay').hidden;
function openSkins() { openSheet('skinsOverlay'); renderSkinGrid(); $('skinsDone').focus({ preventScroll: true }); }
function closeSkins() { stopSkinPreviews($('skinsOverlay')); closeSheet('skinsOverlay', 'skinBtn'); renderSkinCard(); }
// The result mascot wears the chosen shark (its portrait); the life-ring hero stays for the basic shark.
let heroMascot = null;
function showClearMascot() {
  const img = $('clearMascot'), skin = currentSkin();
  heroMascot ??= img.getAttribute('src');
  const src = skin.id !== 'basic' && typeof SHARK_ART !== 'undefined' ? SHARK_ART.url('portrait', skin) : heroMascot;
  if (img.getAttribute('src') !== src) { img.hidden = false; img.src = src; }
}
function wearSkin(id, button) {
  if (!(save.owned || ['basic']).includes(id) || !SKINS.some(s => s.id === id)) return;
  if (save.skin !== id) { save.skin = id; persist(); haptic('medium'); sfx.equip(); heroW = 0; }
  if (button) { button.textContent = '입었어요'; button.setAttribute('aria-disabled', 'true'); }   // focus stays on the button
  showClearMascot(); renderSkinCard();
}
function selectSkin(id) {
  if (!(save.owned || ['basic']).includes(id) || !SKINS.some(s => s.id === id) || save.skin === id) return;
  save.skin = id; persist(); haptic('medium'); sfx.equip(); renderSkinGrid(id); heroW = 0;
  $('skinGrid').querySelector(`[data-id="${id}"]`).focus({ preventScroll: true });
}

/* ---------- free canals: one resumable puzzle per difficulty ---------- */
let freeRequest = 0;
const freeCache = new Map(), freeOpen = () => !$('freeOverlay').hidden;
function freeRecord(difficulty) {
  const run = save.free.runs[difficulty];
  return run && FREE_VERSIONS.includes(run.version) && run.difficulty === difficulty
    && Number.isInteger(run.seed) && run.seed >= 0 && run.seed <= 0xffffffff
    && Number.isSafeInteger(run.serial) && run.serial > 0
    && Number.isInteger(run.stars) && run.stars >= 0 && run.stars <= 3
    && typeof run.layout === 'string' && run.layout.length <= 4096 ? run : null;
}
function freeSession(run) { return restoreSession(save.sessions['free' + run.difficulty], run.level, freeId(run)); }
function recordFreeClear(run, stars) {
  const stored = freeRecord(run.difficulty);
  if (!stored || freeId(stored) !== freeId(run) || !Number.isInteger(stars) || stars < 1 || stars > 3) return;
  if (!stored.stars) save.free.completed[run.difficulty] = Math.min(Number.MAX_SAFE_INTEGER, save.free.completed[run.difficulty] + 1);
  stored.stars = Math.max(stored.stars, stars);
  persist();
}
function renderFreeCard() {
  const count = save.free.completed.reduce((a, b) => a + b, 0);
  $('freeSummary').textContent = count ? `${count}개 구출!` : '계속 도전!';
}
function renderFree() {
  $('freeTiers').innerHTML = FREE_TIERS.map((tier, difficulty) => {
    const run = freeRecord(difficulty), packet = save.sessions['free' + difficulty];
    const resume = run && packet?.id === freeId(run) && Number.isSafeInteger(packet.state?.moves) && packet.state.moves >= 0;
    const action = resume || run && !run.stars ? '이어하기' : run ? '새 수로' : '시작하기';
    const state = resume ? `${run.serial}번째 · ${packet.state.moves}회 진행` : run ? `${run.serial}번째 · ${'★'.repeat(run.stars)}${'☆'.repeat(3 - run.stars)}` : '아직 시작하지 않았어요';
    return `<div class="free-tier"><div class="free-tier-copy"><b>${tier.label} <small>${tier.name}</small></b><span>${tier.description}</span><span>${state} · 완료 ${save.free.completed[difficulty]}개</span></div>
      <div class="free-actions"><button class="btn primary" type="button" data-free="${difficulty}" data-action="${action === '새 수로' ? 'new' : 'resume'}" aria-label="${tier.label} ${action}">${action}</button>
      ${run ? `<button class="btn" type="button" data-free="${difficulty}" data-action="${action === '새 수로' ? 'replay' : 'new'}" aria-label="${tier.label} ${action === '새 수로' ? '다시 풀기' : '새 수로'}">${action === '새 수로' ? '다시 풀기' : '새 수로'}</button>` : ''}</div></div>`;
  }).join('');
  $('freeLearnNote').hidden = !learningDevices();
  $('freeStatus').textContent = '';
}
function openFree() {
  if (!$('gameScreen').hidden) show('title');
  freeRequest++; renderFreeCard(); renderFree();
  openSheet('freeOverlay');
  $('freeDone').focus({ preventScroll: true });
}
function closeFree() {
  freeRequest++; closeSheet('freeOverlay', 'freeBtn');
}
function newFreeSeed() {
  return globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 0x100000000);
}
async function startFree(difficulty, fresh = false, replayRun = false) {
  if (!Number.isInteger(difficulty) || !FREE_TIERS[difficulty]) return;
  const request = ++freeRequest, previous = freeRecord(difficulty), create = fresh || !previous;
  $('freeTiers').querySelectorAll('button').forEach(b => { b.disabled = true; });
  $('freeStatus').textContent = '새 물길을 준비하고 있어요…';
  try {
    await new Promise(resolve => setTimeout(resolve, 0));
    if (request !== freeRequest) return;
    let run = !create && freeCache.get(freeId(previous));
    if (!run) {
      const serial = create ? (previous?.serial || 0) + 1 : previous.serial;
      if (!Number.isSafeInteger(serial)) throw new Error('free serial exhausted');
      for (let attempt = 0; attempt < (create ? 12 : 1); attempt++) {
        const seed = create ? newFreeSeed() : previous.seed, search = makeFreeSearch(seed, difficulty, create ? FREE_VERSION : previous.version,
          learnedDevices(), create ? null : previous.family);
        let step;
        do {
          if (request !== freeRequest) return;
          const deadline = performance.now() + 8;
          do { step = search.next(); } while (!step.done && performance.now() < deadline);
          if (!step.done) await new Promise(resolve => setTimeout(resolve, 0));
        } while (!step.done);
        if (!step.value) throw new Error('free generation failed');
        const candidate = { ...step.value, serial }, layout = levelSignature(candidate.level);
        if (create && previous?.layout === layout) continue;
        if (create && save.free.recent[difficulty].includes(varietyLayoutKey(candidate.level))) continue;
        if (create && attempt < 8 && previous && (previous.family === candidate.level.family || previous.maskId === candidate.level.maskId)) continue;
        if (!create && previous.layout !== layout) throw new Error('free layout changed');
        run = candidate; break;
      }
    }
    if (request !== freeRequest) return;
    if (!run) throw new Error('no different free layout');
    // Commit only a finished, distinct puzzle. Cancellation and failed searches preserve the previous turn.
    if (create) {
      save.free.runs[difficulty] = { version: run.version, difficulty, seed: run.seed, serial: run.serial, stars: 0, layout: levelSignature(run.level), family: run.level.family, maskId: run.level.maskId };
      save.free.recent[difficulty] = [...save.free.recent[difficulty], varietyLayoutKey(run.level)].slice(-6);
      delete save.sessions['free' + difficulty];
      for (const key of Object.keys(save.hintUsage)) if (FREE_VERSIONS.some(version => key.startsWith(`free:v${version}:${difficulty}:`))) delete save.hintUsage[key];
      if (previous) freeCache.delete(freeId(previous));
      persist();
    }
    freeCache.set(freeId(run), run);
    const keep = !create && !replayRun ? freeSession(run) : null;
    closeFree(); show('game'); loadFree(run, keep);
  } catch (e) {
    if (request === freeRequest) { renderFree(); $('freeStatus').textContent = '다른 물길을 준비하지 못했어요. 다시 눌러 주세요. 기존 진행은 남아 있어요.'; }
  }
}

/* ---------- rendering ---------- */
const board = $('board'), frameEl = $('boardFrame'), cvs = $('boardCanvas'), ctx = cvs.getContext('2d');
// Camera view: the canvas fills the whole board area. The canal is drawn as large as fits (outer promenade columns may be
// cut by CROP when width is the limit) and the rest of the screen continues the world: promenade all around (the engine
// already treats everything outside the grid as '#'), and open sea running out from each exit to the screen edge.
const CROP = 0.3;   // share of each outer promenade column that may fall outside the view to make the tiles bigger
let OX = 0, OY = 0, CW = 0, CH = 0, seaCells = new Set();
function resize() {
  invalidateScenes();
  guidePaintTime = -1;
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
// Region surfaces for the board (water, sea, quay, seams, rails, plantings, frame). Story canals and North Harbor keep the
// shared look. Devices, fish, nets and exits keep their colours in every region; decoration stays on promenade tiles.
let boardSurface = null;
function setBoardRegion(regionId, preview = false) {
  const region = typeof PILOT_REGIONS !== 'undefined' && regionId ? PILOT_REGIONS.find(r => r.id === regionId) : null, p = region && region.palette;
  boardSurface = { water: p ? p.water : C.water, sea: p ? p.sea : C.sea, land: p ? p.land : ['#f8f8e8', '#dcebdc'], seam: p ? p.seam : C['concrete-2'],
    rail: p ? p.rail : C.rail, park: p ? p.park : C.park, decor: p ? 'sluice' : 'park', preview };
  frameEl.style.setProperty('--board-frame', p ? p.frame : '');
  $('gameScreen').dataset.region = region ? region.id : '';
}
const isLand = (x, y) => cellType(x, y) === '#';
function buildStatic() {
  buildSea();
  staticLayer = document.createElement('canvas');
  staticLayer.width = cvs.width; staticLayer.height = cvs.height;
  const s = staticLayer.getContext('2d'); s.scale(dpr, dpr); s.translate(OX, OY);
  const P = boardSurface || (setBoardRegion(null), boardSurface);
  const landPaint = s.createLinearGradient(0, -OY, CW, CH - OY);
  landPaint.addColorStop(0, P.land[0]); landPaint.addColorStop(1, P.land[1]);
  // North Harbor's last canal previews the sluice works: pipes appear on the quay near its exit.
  const exits = []; for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === 'E') exits.push([i % g.w, Math.floor(i / g.w)]);
  const sluiceDecor = (x, y) => P.decor === 'sluice' || (P.preview && exits.some(([ex, ey]) => Math.abs(ex - x) + Math.abs(ey - y) <= 4));
  // every cell that is at least partly on screen
  const x0 = Math.floor(-OX / T) - 1, x1 = Math.ceil((CW - OX) / T), y0 = Math.floor(-OY / T) - 1, y1 = Math.ceil((CH - OY) / T);
  waterPath = new Path2D();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x * T, py = y * T, c = cellType(x, y);
    if (c === '~') {
      // open sea: deepens with distance from the canal
      const d = Math.max(Math.abs(Math.min(x, g.w - 1 - x, 0)), Math.abs(Math.min(y, g.h - 1 - y, 0)));
      s.fillStyle = P.sea; s.fillRect(px, py, T, T);
      s.fillStyle = `rgba(3,20,30,${Math.min(0.45, d * 0.07).toFixed(3)})`; s.fillRect(px, py, T, T);
      waterPath.rect(px, py, T, T); continue;
    }
    if (c !== '#') { s.fillStyle = P.water; s.fillRect(px, py, T, T); waterPath.rect(px, py, T, T); if (c === 's') drawSand(s, px, py, T, x * 31 + y * 17 + deco); continue; }
    s.fillStyle = landPaint; s.fillRect(px, py, T, T);
    s.strokeStyle = P.seam; s.lineWidth = 1; s.globalAlpha = 0.23;
    s.beginPath(); s.moveTo(px, py + T / 2 + .5); s.lineTo(px + T, py + T / 2 + .5);
    const off = (((y % 2) + 2) % 2) * T / 2; s.moveTo(px + off + .5, py); s.lineTo(px + off + .5, py + T / 2); s.moveTo(px + ((off + T / 2) % T) + .5, py + T / 2); s.lineTo(px + ((off + T / 2) % T) + .5, py + T); s.stroke(); s.globalAlpha = 1;
  }
  // shade on water next to land, railings and onlookers on land next to water
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x * T, py = y * T, seed = hash(y * 97 + x * 31 + deco * 7);
    const inside = x >= 0 && y >= 0 && x < g.w && y < g.h;
    const nb = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    if (!isLand(x, y)) {
      s.fillStyle = 'rgba(6,51,75,.23)';
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
        if (sluiceDecor(x, y)) { if (seed < (inside ? 0.13 : 0.08)) drawPipe(s, px, py, T, seed); continue; }   // pipes read heavier than shrubs
        s.save(); s.globalAlpha = 0.6; s.fillStyle = P.park;
        s.beginPath(); s.arc(px + T * (0.3 + seed), py + T * 0.5, T * 0.26, 0, 7); s.fill();
        s.fillStyle = 'rgba(255,255,255,.1)'; s.beginPath(); s.arc(px + T * (0.25 + seed), py + T * 0.43, T * 0.1, 0, 7); s.fill(); s.restore();
      }
      continue;
    }
    waterSides.forEach(([dx, dy], k) => {
      s.strokeStyle = P.rail; s.lineWidth = Math.max(2.5, T * 0.065); s.lineCap = 'round';
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
        s.save(); s.globalAlpha = 0.4; if (sluiceDecor(x, y)) { s.globalAlpha = 0.8; drawBollard(s, qx, qy, T); } else drawPerson(s, qx, qy, T, sd); s.restore();
      }
    });
  }
}

/* One bounded frame chain; frozen scenes repaint only when their content changes. */
let lastT = performance.now(), lastRafT = lastT, ambientT = lastT, frameActive = false;
let frameId = null, appActive = true, pageHidden = false;
const renderSuspended = () => document.hidden || !appActive || pageHidden;
function startFrames() {
  if (frameId !== null || renderSuspended()) return;
  lastT = lastRafT = ambientT = performance.now(); frameActive = false; frameId = requestAnimationFrame(frame);
}
function suspendPresentation() {
  sound.suspend();
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null;
  flushSheetExits(); pauseGame();
  // A winning turn may have just committed. Preserve its pending result, but discard delayed cues.
  interruptClearPresentation();
  skinPreviewMotion.clear();
  invalidateScenes();
}
function resumePresentation() {
  if (renderSuspended()) return;
  sound.activate();
  if (clearReveal) clearReveal(false);
  invalidateScenes(); startFrames();
}
function changeMotionPreference(e) {
  if (reduceMotion === e.matches) return;
  resetSheetGesture();
  reduceMotion = e.matches;
  if (reduceMotion) {
    flushSheetExits(); pauseGame(); clearPlayEffects();
    interruptClearPresentation();
    if (clearReveal && !renderSuspended()) clearReveal(false);
    for (const [canvas, motion] of skinPreviewMotion) if (canvas.isConnected) drawSkinPreview(canvas, motion.skin);
    skinPreviewMotion.clear();
    guidePlaying = false;
    if (guideDemo?.clip) { guideDemo = createDeviceDemo(guideKeys[guideIndex]); guideTime = 0; }   // back to the reader-paced steps
  }
  heroWake = 0; heroRipples.length = 0;
  guidePaintTime = -1; if (guideOpen()) updateGuidePlayback();
  invalidateScenes();
}
function frame(now) {
  frameId = null;
  if (renderSuspended()) return;
  const active = (!$('app').inert && (anim || bump || settle || pop || deviceSpot || exitZoom && exitZoom.t < EXIT_ZOOM.dur)) || skinPreviewMotion.size || (guideOpen() && guidePlaying);
  // Short, interactive motion follows the display. A 60Hz gate quantised 90/144Hz displays to 45/48 updates.
  // Ambient scenes retain a 30Hz budget with the remainder preserved instead of drifting at each skip.
  const rafDelta = Math.max(0, now - lastRafT); lastRafT = now;
  const wasActive = frameActive; frameActive = !!active;
  const interval = 1000 / 30;
  if (!active && now - ambientT < interval - 0.5) { frameId = requestAnimationFrame(frame); return; }
  const dt = Math.min(0.05, Math.max(0, active && !wasActive ? rafDelta : now - lastT) / 1000);
  lastT = now;
  ambientT = active ? now : ambientT + Math.max(1, Math.floor((now - ambientT + 0.5) / interval)) * interval;
  if (!$('gameScreen').hidden && g && staticLayer) {
    const moving = !$('app').inert && (!reduceMotion || !!anim);
    if (moving) step(dt);
    updateHintButton(); tickHintNudge(dt); tickStuck();
    if (gameNeedsPaint || moving) { draw(clock); gameNeedsPaint = false; }
  }
  if (!$('titleScreen').hidden && heroVisible) {
    const moving = !reduceMotion && !heroPaused();
    if (moving) stepHero(dt);
    if (heroNeedsPaint || !heroW || moving) { drawHero(heroTime); heroNeedsPaint = false; }
  }
  if (endingOpen()) {
    if (!reduceMotion) endingElapsed += dt;
    if (endingNeedsPaint || !reduceMotion) { drawEnding(endingElapsed); endingNeedsPaint = false; }
  }
  if (guideOpen() && (guidePlaying || guidePaintTime !== guideTime)) stepDeviceGuide(dt);
  stepRewardPreviews(dt);
  frameId = requestAnimationFrame(frame);
}
function step(dt) {
  clock += dt;
  if (anim) {
    const a = anim;
    a.t += dt * (reduceMotion ? 2 : 1);
    const prev = a.p;
    a.p = swimProgress(a);
    a.speed = (a.p - prev) / Math.max(dt, 1e-3);
    const i = Math.min(Math.floor(a.p), a.n - 1), f = a.p - i, A = a.pts[i], B = a.pts[i + 1];
    if (a.warps.has(i + 1)) {
      const out = f >= 0.5; view.x = out ? B[0] : A[0]; view.y = out ? B[1] : A[1];
      a.warpScale = reduceMotion ? 1 : out ? (f - 0.5) * 2 : 1 - f * 2;
    } else { a.warpScale = 1; view.x = A[0] + (B[0] - A[0]) * f; view.y = A[1] + (B[1] - A[1]) * f; }
    // Crossing tests also cover coarse frames that skip a path segment entirely.
    for (const k of a.warps) {
      if (!a.warpDone.has(k) && a.p >= k - 1) {
        a.warpDone.add(k); sfx.warp(); haptic('medium');
        const from = a.pts[k - 1], to = a.pts[k];
        if (!reduceMotion) { jetFlash.set(from[1] * g.w + from[0], 1); jetFlash.set(to[1] * g.w + to[0], 1); }
        ring(from[0], from[1], 1, 0.6); ring(to[0], to[1], 1.2, 0.6);
      }
      if (prev < k - 0.5 && a.p >= k - 0.5) wake.length = 0;
    }
    view.target = ANG[a.dirs[Math.min(i + 1, a.dirs.length - 1)]];
    for (const e of a.eats) if (!a.eaten.has(e.fi) && a.p >= e.k - 0.35) eatFish(e.fi);
    for (const j of a.jets) if (!j.done && a.p >= j.k - 0.25) { j.done = true; if (!reduceMotion) jetFlash.set(j.y * g.w + j.x, 1); ring(j.x, j.y, 0.8, 0.5); sfx.jet(); haptic('tick'); }
    if (a.win && !a.exitFx && a.p >= a.steps - 0.2) {
      a.exitFx = true; const [ex, ey] = a.pts[a.steps];
      ring(ex, ey, 1.6, 0.7); ring(ex, ey, 0.9, 0.5); splashAt(ex, ey, 16, a.dirs[a.steps], 1.3);
      sfx.exit(); haptic('success');
      if (!reduceMotion) exitZoom = { t: 0, x: ex, y: ey };
    }
    const swimming = a.t < a.dur && !a.warps.has(i + 1);
    // Keep trail density bounded when interactive drawing follows a high-refresh display.
    a.wakeTime = (a.wakeTime || 0) + dt;
    if (swimming && a.speed > 2 && !reduceMotion && a.wakeTime >= 1 / 60) {
      a.wakeTime %= 1 / 60;
      wake.push({ x: view.x, y: view.y, ang: ANG[a.dirs[i + 1]], age: 0, sp: Math.min(1, a.speed / 14) });
    }
    if (swimming && !reduceMotion && Math.random() < dt * 30) particles.push({ kind: 'bubble', x: view.x + (Math.random() - 0.5) * 0.3, y: view.y + (Math.random() - 0.5) * 0.3, vx: 0, vy: 0, life: 1 });
    if (a.t >= a.dur) landShark(a);
    if (!a.boatSound && !a.win && a.t >= a.dur + a.gateDur) {
      a.boatSound = true;
      if (a.boatsFrom.some((b, k) => b[0] !== st.boats[k][0])) sfx.boat();
    }
    if (a.t >= a.dur + a.gateDur + a.boatDur) finishAnim();
  }
  let da = view.target - view.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
  view.ang = reduceMotion ? view.target : view.ang + da * (1 - Math.exp(-dt * 22));
  if (bump) { bump.t += dt; if (bump.t > 0.25) bump = null; }
  if (settle) { settle.t += dt; if (settle.t > 0.6) settle = null; }
  if (pop) { pop.t += dt; if (pop.t > 0.4) pop = null; }
  if (exitZoom) exitZoom.t += dt;   // holds the closer view until the next canal or retry
  if (deviceSpot) {   // starts once nothing covers the board (the device guide pauses stepping while it is open)
    if (!deviceSpot.started) startDeviceSpot();
    deviceSpot.t += dt; if (deviceSpot.t >= DEVICE_SPOT.dur) endDeviceSpot();
  }
  for (let k = wake.length - 1; k >= 0; k--) { wake[k].age += dt; if (wake[k].age > 0.9) wake.splice(k, 1); }
  for (const [k, v] of jetFlash) { const nv = v - dt * 2.5; if (nv <= 0) jetFlash.delete(k); else jetFlash.set(k, nv); }
  for (const [k, v] of netPop) if (clock - v >= 0.32) netPop.delete(k);
  for (const [k, v] of netRetract) if (clock - v >= 0.18) netRetract.delete(k);
  for (const [k, v] of contactPulse) if (clock - v.at >= 0.32) contactPulse.delete(k);
  for (let k = particles.length - 1; k >= 0; k--) {
    const p = particles[k];
    if (p.kind === 'fish') { p.life -= dt * 4.5; p.x += (p.toX - p.x) * Math.min(1, dt * 16); p.y += (p.toY - p.y) * Math.min(1, dt * 16); }
    else if (p.kind === 'ring') p.life -= dt * 1.5;
    else { p.life -= dt * (p.kind === 'text' ? 1.1 : p.kind === 'spark' ? 2.2 : 1.6); p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; if (p.kind === 'spark') p.rot += dt * 8; }
    if (p.life <= 0) particles.splice(k, 1);
  }
}
function draw(t) {
  if (reduceMotion) t = 0;
  // After an escape the whole board eases slightly toward the exit (identity otherwise).
  const zs = exitZoom ? 1 + EXIT_ZOOM.scale * (1 - Math.pow(1 - clamp01(exitZoom.t / EXIT_ZOOM.dur), 3)) : 1;
  const zx = exitZoom ? (OX + (exitZoom.x + 0.5) * T) * (1 - zs) : 0, zy = exitZoom ? (OY + (exitZoom.y + 0.5) * T) * (1 - zs) : 0;
  ctx.setTransform(zs, 0, 0, zs, zx * dpr, zy * dpr);
  ctx.drawImage(staticLayer, 0, 0);
  ctx.setTransform(dpr * zs, 0, 0, dpr * zs, (OX * zs + zx) * dpr, (OY * zs + zy) * dpr);   // from here on: grid coordinates
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
  // dents on sand the shark has stopped on; a new one settles in over 0.25s
  const stops = sandStops();
  for (const cell of sandSeen.keys()) if (!stops.has(cell)) sandSeen.delete(cell);
  for (const [cell, d] of stops) {
    if (!sandSeen.has(cell)) sandSeen.set(cell, clock);
    drawSandDent(ctx, (cell % g.w) * T, Math.floor(cell / g.w) * T, T, ANG[d] ?? 0, reduceMotion ? 1 : clamp01((clock - sandSeen.get(cell)) / 0.25));
  }
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const c = cellAt(g, x, y), px = x * T, py = y * T;
    if (JET[c]) drawJet(ctx, px, py, T, JET[c], t, jetFlash.get(y * g.w + x) || 0);
    else if (c === 'o') {
      const hit = contactPulse.get(y * g.w + x), pulse = hit ? Math.sin((clock - hit.at) / 0.32 * Math.PI) * hit.amp * 0.1 : 0;
      drawBuoy(ctx, px + T / 2, py + T / 2, T * (1 + pulse), t);
    }
    else if (c === 'w') drawWhirl(ctx, px + T / 2, py + T / 2, T, t, jetFlash.get(y * g.w + x) || 0);
  }
  // Switches and gates keep the turn-start state while the shark swims. A press turns them in the gate phase; a gate
  // a boat held open closes as that boat leaves (boat phase). Reduced motion shows the final state on arrival.
  if (g.gates.length) {
    const swimming = anim && anim.t < anim.dur, gate0 = anim ? anim.gateFrom : st.gate, boats0 = anim ? anim.boatsFrom : st.boats;
    const span = (start, len) => !anim ? 1 : len > 0 ? clamp01((anim.t - start) / len) : anim.t >= start ? 1 : 0;
    const pressK = anim && anim.pressed ? span(anim.dur, anim.gateDur) : 1;
    g.switches.forEach(i => drawSwitch(ctx, (i % g.w) * T, Math.floor(i / g.w) * T, T, (swimming ? gate0 : st.gate) === 1, reduceMotion || pressK >= 1 ? 0 : pressK));
    g.gates.forEach(i => {
      const held0 = boats0.some(b => b[0] === i), held1 = st.boats.some(b => b[0] === i);
      const from = gateIsOpen(g, i, gate0) || held0 ? 1 : 0, to = gateIsOpen(g, i, st.gate) || held1 ? 1 : 0;
      const k = from === to ? 1 : gateIsOpen(g, i, gate0) !== gateIsOpen(g, i, st.gate) && !held0
        ? span(anim ? anim.dur : 0, anim ? anim.gateDur : 0) : span(anim ? anim.dur + anim.gateDur : 0, anim ? anim.boatDur : 0);
      const eased = 1 - Math.pow(1 - k, 2), hit = contactPulse.get(i);
      drawGate(ctx, (i % g.w) * T, Math.floor(i / g.w) * T, T, swimming ? from : from + (to - from) * eased, gatePassage(g, i),
        hit ? clamp01((clock - hit.at) / 0.32) : 0);
    });
  }
  // new-device spotlight: three pulses of a gold ring with a soft glow (the coach/hint look-here colour), fading out
  if (deviceSpot && deviceSpot.started) {
    const k = deviceSpot.t / DEVICE_SPOT.dur, wave = 0.5 - 0.5 * Math.cos(k * DEVICE_SPOT.pulses * Math.PI * 2), a = Math.min(1, (1 - k) * 4) * (0.35 + 0.65 * wave);
    ctx.save(); ctx.strokeStyle = C.star;
    for (const i of deviceSpot.cells) {
      const x = (i % g.w) * T + T / 2, y = Math.floor(i / g.w) * T + T / 2, r = T * (0.5 + 0.08 * wave);
      ctx.globalAlpha = a * 0.3; ctx.lineWidth = T * 0.18; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
      ctx.globalAlpha = a; ctx.lineWidth = Math.max(2, T * 0.06); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
    }
    ctx.restore();
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
  const boatStart = anim ? anim.dur + anim.gateDur : 0;
  const bk = anim ? (anim.t < boatStart ? 0 : anim.boatDur ? 1 - Math.pow(1 - clamp01((anim.t - boatStart) / anim.boatDur), 2) : 1) : 1;
  st.boats.forEach((b, k) => {
    const from = anim && anim.boatsFrom ? anim.boatsFrom[k][0] : b[0];
    const x = (from % g.w) + ((b[0] % g.w) - (from % g.w)) * bk, y = Math.floor(from / g.w) + (Math.floor(b[0] / g.w) - Math.floor(from / g.w)) * bk;
    const heading = anim && anim.t < boatStart ? anim.boatsFrom[k][1] : b[1];
    drawBoat(ctx, x * T + T / 2, y * T + T / 2, T, t, BOAT_ANG[heading], !anim);
  });
  for (const [i, at] of netRetract) {
    const k = clamp01((clock - at) / 0.18);
    ctx.save(); ctx.globalAlpha = 1 - k;
    drawNet(ctx, (i % g.w) * T, Math.floor(i / g.w) * T, T, false, t, 1 - k * 0.75); ctx.restore();
  }
  st.nets.forEach(i => {
    const t0 = netPop.get(i), k = t0 == null ? 1 : (clock - t0) / 0.32;
    const hit = contactPulse.get(i), pulse = hit ? Math.sin((clock - hit.at) / 0.32 * Math.PI) * hit.amp * 0.16 : 0;
    drawNet(ctx, (i % g.w) * T, Math.floor(i / g.w) * T, T, false, t, (k >= 1 ? 1 : 0.4 + 0.6 * easeOutBack(clamp01(k))) + pulse);
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
    if (!reduceMotion) stretch = 1 + 0.16 * Math.min(1, anim.speed / 16);
    if (anim.win) alpha = clamp01(1 - (anim.p - anim.steps) / 2.4);
  } else if (cleared) alpha = 0;
  if (bump && !reduceMotion) { const [dx, dy] = DIRS[bump.d], k = Math.sin(bump.t / 0.25 * Math.PI) * 0.12; sx += dx * k; sy += dy * k; stretch = 1 - k * 0.8; }
  if (settle && !reduceMotion) {
    const k = settle.t, e = Math.exp(-k * 9), [dx, dy] = DIRS[settle.d], off = 0.1 * settle.amp * Math.sin(k * 24) * e;
    sx += dx * off; sy += dy * off; stretch = 1 - 0.14 * settle.amp * e * Math.cos(k * 20);
  }
  if (pop) size = 0.55 + 0.45 * easeOutBack(clamp01(pop.t / 0.32));
  if (anim && anim.warpScale < 1) size *= Math.max(0.05, anim.warpScale);
  const bob = anim || reduceMotion ? 0 : Math.sin(t * 2) * 0.02;
  drawShark(ctx, sx * T + T / 2, (sy + bob) * T + T / 2, view.ang, T * size, t, !!anim && anim.t < anim.dur, stretch, alpha);
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
      ctx.strokeText(p.text, px, p.y * T + T * 0.4); ctx.fillText(p.text, px, p.y * T + T * 0.4);
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
  if (reduceMotion) {
    const [dx, dy] = DIRS[coach.dir || 'U'];
    const x = coach.kind === 'swipe' ? sx + 0.5 + dx * 0.7 : coach.x + 0.68;
    const y = coach.kind === 'swipe' ? sy + 0.5 + dy * 0.7 : coach.y + 0.72;
    drawFinger(x * T, y * T, 0, 1); return;
  }
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
let heroW = 0, heroH = 0, heroTime = 0, heroWake = 0, heroVisible = true, heroFill = null;
const heroRipples = [];
const heroPaused = () => $('app').inert || settingsOpen() || skinsOpen();
function resetHero() {
  heroW = 0; heroTime = 0; heroWake = 0; heroRipples.length = 0; heroVisible = true;
}
function updateHeroVisibility() {
  const r = hero.getBoundingClientRect();
  heroVisible = r.bottom > 0 && r.top < window.innerHeight;
  if (heroVisible) heroNeedsPaint = true;
}
function stepHero(dt) {
  if (reduceMotion) return;
  heroTime += dt * (heroWake > 0 ? 1.8 : 1);
  heroWake = Math.max(0, heroWake - dt);
  for (let i = heroRipples.length - 1; i >= 0; i--) {
    heroRipples[i].life -= dt / 0.65;
    if (heroRipples[i].life <= 0) heroRipples.splice(i, 1);
  }
}
function reactHero(e) {
  if (reduceMotion || document.hidden || $('titleScreen').hidden || heroPaused() || e.isPrimary === false) return;
  const r = hero.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (x < 0 || x > r.width || y < 0 || y >= r.height) return;
  // Decorative only: leave scrolling, game progress, sound and the start button untouched.
  if (heroRipples.length >= 4) heroRipples.shift();
  heroRipples.push({ x, y, life: 1 }); heroWake = 0.65;
}
function sizeHero() {
  const r = hero.getBoundingClientRect(); const d = Math.min(window.devicePixelRatio || 1, 2.5);
  heroW = r.width; heroH = r.height; hero.width = Math.round(r.width * d); hero.height = Math.round(r.height * d);
  hctx.setTransform(d, 0, 0, d, 0, 0);
  heroFill = hctx.createRadialGradient(r.width * .5, r.height * .5, 0, r.width * .5, r.height * .5, Math.min(r.width, r.height) * .5);
  heroFill.addColorStop(0, 'rgba(18,158,187,.3)'); heroFill.addColorStop(.65, 'rgba(40,184,202,.14)'); heroFill.addColorStop(1, 'rgba(40,184,202,0)');
}
function drawHero(t) {
  if (!heroW) sizeHero();
  if (reduceMotion) t = 0;
  const W = heroW, H = heroH, T = Math.min(76, H * 0.62, W / 4.3);
  hctx.clearRect(0, 0, W, H);
  hctx.fillStyle = heroFill; hctx.fillRect(0, 0, W, H);
  // Soft water rings belong to the full lobby scene, without a rectangular picture frame.
  hctx.fillStyle = 'rgba(18,124,154,.12)';
  hctx.beginPath(); hctx.ellipse(W * .5, H * .79, W * .29, H * .075, 0, 0, Math.PI * 2); hctx.fill();
  hctx.strokeStyle = 'rgba(244,255,240,.55)'; hctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const drift = reduceMotion ? 0 : Math.sin(t * .8 + i) * 3;
    hctx.beginPath(); hctx.ellipse(W * .5, H * .79, W * (.29 + i * .075) + drift, H * (.09 + i * .033), -.03, .12 + i * .5, Math.PI * 1.8 + i * .2); hctx.stroke();
  }
  hctx.save(); hctx.beginPath(); hctx.rect(0, 0, W, H); hctx.clip();
  const phase = t * 0.4, sx = W * (0.45 + Math.sin(phase) * 0.22), sy = H * (0.52 + Math.cos(phase) * 0.07);
  const ang = Math.atan2(-H * 0.07 * Math.sin(phase), W * 0.22 * Math.cos(phase));
  if (!reduceMotion) {
    hctx.save(); hctx.translate(sx, sy); hctx.rotate(ang);
    hctx.strokeStyle = 'rgba(230,251,255,.15)'; hctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const off = (t * 12 + i * 8) % 24;
      hctx.globalAlpha = (1 - off / 24) * 0.6;
      hctx.beginPath(); hctx.ellipse(-T * 0.48 - off, 0, 3, 4 + off * 0.18, 0, -1.1, 1.1); hctx.stroke();
    }
    hctx.restore();
    for (const ripple of heroRipples) {
      hctx.strokeStyle = `rgba(230,251,255,${ripple.life * 0.45})`; hctx.lineWidth = 1.5;
      hctx.beginPath(); hctx.ellipse(ripple.x, ripple.y, 5 + (1 - ripple.life) * 24, 3 + (1 - ripple.life) * 12, 0, 0, Math.PI * 2); hctx.stroke();
    }
  }
  const bob = reduceMotion ? 0 : Math.sin(t * 1.6) * 3;
  const skin = currentSkin(), themed = skin.id !== 'basic' && typeof SHARK_ART !== 'undefined' && SHARK_ART.get('portrait', skin) && SHARK_ART.hasSkin('portrait', skin);
  if (typeof SHARK_ART === 'undefined' || !SHARK_ART.draw(hctx, themed ? 'portrait' : 'hero', W * .5, H * .49 + bob, Math.min(W * .82, H * .98) * (themed ? .86 : 1), themed ? skin : undefined)) {
    drawShark(hctx, sx, sy, ang, T, t, !reduceMotion, reduceMotion ? 1 : 1.02 + heroWake * .04);
  }
  drawBuoy(hctx, W * .13, H * .65, Math.min(58, H * .3), t);
  drawFish(hctx, W * .86, H * .43, T * .5, t, .1);
  hctx.restore();
}

/* ---------- pilot course: North Harbor → Sluice Works (separate records, stable ids) ---------- */
// save.pilot = { version: 1, best: { p01: 1..3 } } and save.sessions.pilot. Never mixed with story stars, skins,
// daily or free records; unknown ids and invalid stars are dropped without touching anything else.
function pilotRecord() {
  const record = save.pilot;
  if (!record || record.version !== 1 || !record.best || typeof record.best !== 'object' || Array.isArray(record.best)) save.pilot = { version: 1, best: {} };
  for (const [id, stars] of Object.entries(save.pilot.best)) {
    if (!PILOT_LEVELS.some(l => l.id === id) || !Number.isInteger(stars) || stars < 1 || stars > 3) delete save.pilot.best[id];
  }
  return save.pilot;
}
const pilotStars = i => PILOT_LEVELS[i] ? pilotRecord().best[PILOT_LEVELS[i].id] || 0 : 0;
const pilotUnlocked = i => i === 0 || pilotStars(i - 1) > 0;
function pilotProgress() {
  const stars = PILOT_LEVELS.map((_, i) => pilotStars(i));
  return { stars, count: stars.filter(Boolean).length, total: stars.reduce((a, b) => a + b, 0) };
}
function recordPilotClear(i, stars) {
  const level = PILOT_LEVELS[i];
  if (!level || !Number.isInteger(stars) || stars < 1 || stars > 3) return;
  const record = pilotRecord();
  record.best[level.id] = Math.max(record.best[level.id] || 0, stars); persist();
}
function pilotSession(i) {
  const level = PILOT_LEVELS[i];
  return level && pilotUnlocked(i) ? restoreSession(save.sessions.pilot, level, level.id) : null;
}
function pilotTarget() {
  const id = save.sessions.pilot?.id, resume = PILOT_LEVELS.findIndex(l => l.id === id);
  if (resume >= 0 && pilotSession(resume)) return resume;
  const next = PILOT_LEVELS.findIndex((_, i) => !pilotStars(i));
  return next >= 0 ? next : PILOT_LEVELS.length - 1;
}
const pilotOpen = () => !$('pilotOverlay').hidden;
// Region pictures are introduction art only: never read them as playable tiles. A failed image just hides itself.
function setRegionArt(img, regionId) {
  img.onerror = () => { img.closest('.region-art, .region-preview')?.classList.add('no-art'); img.hidden = true; };
  img.src = REGION_ART[regionId];
}
function showRegionPreview(el, regionId, label, info = PILOT_REGIONS.find(r => r.id === regionId)) {
  el.classList.remove('no-art');
  el.innerHTML = `<img alt="" width="720" height="480"><div><small>${label}</small><b>${info.name}</b>${info.goal ? `<span>${info.goal}</span>` : ''}</div>`;
  setRegionArt(el.querySelector('img'), regionId);
}
function renderPilot() {
  const progress = pilotProgress(), target = pilotTarget(), resumeId = pilotSession(target) ? PILOT_LEVELS[target].id : null;
  $('pilotSummary').textContent = `${PILOT_LEVELS.length}개 수로 중 ${progress.count}개 구출 · ★ ${progress.total} / ${PILOT_LEVELS.length * 3}`;
  $('pilotRegions').innerHTML = PILOT_REGIONS.map(region => {
    const indices = PILOT_LEVELS.map((l, i) => l.region === region.id ? i : -1).filter(i => i >= 0);
    const done = indices.filter(i => pilotStars(i)).length, open = pilotUnlocked(indices[0]);
    return `<section class="pilot-region${open ? '' : ' locked'}" aria-label="${region.name}, ${done} / ${indices.length} 수로 구출">
      <div class="region-art"><img alt="" width="720" height="480" data-region-art="${region.id}"></div>
      <div class="pilot-region-head"><b>${region.name}</b><span>${done} / ${indices.length} 수로</span></div>
      <p>${open ? region.goal : '북항의 마지막 수로를 통과하면 열려요.'}</p>
      <div class="levels">${indices.map((i, k) => {
        const level = PILOT_LEVELS[i], stars = pilotStars(i), ok = pilotUnlocked(i), resume = level.id === resumeId;
        return `<button class="lv${i === target ? ' cur' : ''}" type="button" data-pilot="${i}" style="--i:${k}" ${ok ? '' : 'disabled'} aria-label="시험 ${i + 1} ${level.name}${ok ? `, 별 ${stars}개, ${level.nets ? `그물 ${level.nets}개` : '그물 없음'}${resume ? ', 이어하기' : ''}` : ', 잠김'}"><span class="n">${i + 1}</span><span class="nm">${ok ? level.name : '잠김'}</span>${ok ? netLevelBadge(level.nets) : ''}<span class="st">${'★'.repeat(stars)}<i>${'★'.repeat(3 - stars)}</i></span></button>`;
      }).join('')}</div></section>`;
  }).join('');
  $('pilotRegions').querySelectorAll('[data-region-art]').forEach(img => setRegionArt(img, img.dataset.regionArt));
}
function openPilot() {
  if (!$('gameScreen').hidden) show('title');
  renderPilot(); openSheet('pilotOverlay');
  $('pilotCard').scrollTop = 0; $('pilotTitle').focus({ preventScroll: true });
  const current = $('pilotRegions').querySelector('.lv.cur');
  if (current && current.scrollIntoView) current.scrollIntoView({ block: 'nearest' });
}
function closePilot() { closeSheet('pilotOverlay', 'stagePicker'); }
function startPilot(i) {
  if (!PILOT_LEVELS[i] || !pilotUnlocked(i)) return;
  const keep = pilotSession(i);
  closeSheet('pilotOverlay', null, false); show('game'); loadPilot(i, keep);
}
function continuePilot() {
  const next = PILOT.index + 1;
  if (next < PILOT_LEVELS.length && pilotUnlocked(next)) loadPilot(next, pilotSession(next)); else openPilot();
}

/* ---------- UI wiring ---------- */
function netLevelBadge(nets) {
  return `<span class="level-net${nets ? ' available' : ''}">${nets ? `그물 ${nets}개` : '그물 없음'}</span>`;
}
let selectedChapter = null;
function renderLevelGrid(followProgress = false) {
  const resume = storySession(), target = resume ? storyResumeId() : nextLevel();
  if (followProgress || selectedChapter === null) selectedChapter = chapterOf(target).ci;
  const grid = $('levelGrid'), total = totalStars();
  const button = (L, i, k) => {
    const b = save.best[i] || 0; const ok = unlocked(i);
    const stars = '★'.repeat(b) + `<i>${'★'.repeat(3 - b)}</i>`;
    return `<button class="lv${i === target ? ' cur' : ''}" type="button" data-i="${i}" style="--i:${k}" ${ok ? '' : 'disabled'} aria-label="수로 ${STORY_POSITION[i] + 1} ${L.name}${ok ? `, 별 ${b}개, ${L.nets ? `그물 ${L.nets}개` : '그물 없음'}` : ', 잠김'}">
      <span class="n">${STORY_POSITION[i] + 1}</span><span class="nm">${ok ? L.name : '잠김'}</span>${ok ? netLevelBadge(L.nets) : ''}<span class="st">${stars}</span></button>`;
  };
  let start = 0;
  const journey = storyProgress().chapters;
  $('chapterPicker').innerHTML = CHAPTERS.map((ch, ci) => {
    const idx = Array.from({ length: ch.count }, (_, k) => STORY_ORDER[start + k]); start += ch.count;
    const stars = idx.reduce((n, i) => n + (save.best[i] || 0), 0), ok = unlocked(idx[0]), perfect = journey[ci].perfect;
    if (ci === selectedChapter) {
      const progress = journey[ci];
      grid.innerHTML = `<div class="chapter-head"><h3>${ch.name}</h3><span${perfect ? ' class="perfect"' : ''}>★ ${stars} / ${ch.count * 3}${perfect ? ' · 만점' : ''}</span></div>
        ${ch.region ? '<div class="region-art"><img alt="" width="720" height="480"></div>' : ''}
        <p class="chapter-story">${progress.complete ? JOURNEY_STORY[ci].outro : JOURNEY_STORY[ci].intro}<br><b>${progress.count} / ${ch.count} 수로 구출 완료</b></p>
        <div class="levels">${idx.map((i, k) => button(LEVELS[i], i, k)).join('')}</div>`;
      if (ch.region) setRegionArt(grid.querySelector('.region-art img'), ch.region);
    }
    return `<button class="chapter-btn${perfect ? ' perfect' : ''}" type="button" data-chapter="${ci}" aria-pressed="${ci === selectedChapter}" aria-label="${ci + 1}장 ${ch.name}${ok ? `, 별 ${stars}개${perfect ? ', 만점' : ''}` : ', 잠김'}"><b>${ci + 1}장</b><span>${ok ? `★ ${stars} / ${ch.count * 3}` : '잠김'}</span></button>`;
  }).join('');
  $('levelCount').textContent = `수로 ${LEVELS.length}곳`;
  $('starTotal').textContent = `★ ${total} / ${LEVELS.length * 3}`;
  $('journeyLabel').innerHTML = `<b>수로 ${STORY_POSITION[target] + 1} · ${(resume ? storyLevel(target) : LEVELS[target]).name}</b>${resume ? `<span>${resume.moves}회 진행</span>` : ''}`;
  $('playBtn').textContent = resume || Object.keys(save.best).length ? '이어서 구출!' : '구출 시작!';
  const progress = storyProgress();
  $('journeyBtn').textContent = `구출 여정 · ${progress.count} / ${LEVELS.length} 수로${progress.complete ? ' · 구출 성공' : ''} ›`;
  $('endingBtn').hidden = !endingAvailable(progress);
  if (progress.complete && !resume) $('playBtn').textContent = '별 더 모으기';
  applyStoryRewards();
}
function nextLevel() {
  for (const i of STORY_ORDER) if (save.best[i] == null) return i;
  return Math.min(save.last, LEVELS.length - 1);
}
function renderLegend() {
  const items = [
    ['fish', '숭어 · 모두 먹으면 별 +1'], ['buoy', '부표 · 앞에서 멈춰요'],
    ['boat', '구조정 · 한 칸씩 오가요'], ['jet', '물줄기 · 방향이 꺾여요'],
    ['net', '그물 · 톡 눌러 치기'], ['exit', '바다 · 여기로 나가요'],
    ['sand', '모래톱 · 올라서면 멈춰요'], ['whirl', '소용돌이 · 짝으로 빨려 나가요'],
    ['gate', '스위치·수문 · 멈추면 열고 닫아요'],
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
  if (k === 'gate') { drawGate(x, 0, 0, S * 0.62, 0); drawSwitch(x, S * 0.4, S * 0.38, S * 0.6, false); }
}
/* ---------- device rules: once on first encounter, always available from settings ---------- */
const DEVICE_GUIDES = [
  // light: a simple device introduced on the board (its tiles glow, the tip explains) instead of opening this sheet
  { key: 'buoy', name: '부표', text: '부표는 벽처럼 길을 막아요. 바로 앞에서 멈춘 뒤 다른 방향으로 밀어 보세요.', has: g => g.cells.includes('o'), light: /o/ },
  { key: 'boat', name: '구조정', text: '상어가 멈춘 뒤 한 칸 움직여요. 막히면 방향을 바꾸며, 그물을 칠 때는 움직이지 않아요.', has: g => g.boats.length > 0 },
  { key: 'jet', name: '물줄기', text: '들어가면 화살표 방향으로 꺾여 계속 헤엄쳐요. 출발한 칸의 물줄기는 작동하지 않아요.', has: g => g.cells.some(c => JET[c]) },
  { key: 'net', name: '그물', text: '빈 물 칸을 톡 누르면 설치해요. 한 번 친 그물은 걷을 수 없으니 칠 자리를 먼저 생각해요. 되돌리기로는 무를 수 있고, 설치는 이동 횟수에 포함되지 않아요.', has: g => g.nets > 0 },
  { key: 'sand', name: '모래톱', text: '올라서면 그 칸에서 멈춰요. 다음 이동에서는 다시 헤엄칠 수 있어요.', has: g => g.cells.includes('s') },
  { key: 'whirl', name: '소용돌이', text: '들어가면 짝 소용돌이로 옮겨져 같은 방향으로 계속 헤엄쳐요.', has: g => g.cells.includes('w') },
  { key: 'gate', name: '스위치·수문', text: '상어가 스위치 위에서 멈추면 연결된 수문이 모두 열리거나 닫혀요. 지나가기만 하면 눌리지 않아요. 닫힌 수문은 벽처럼 막고, 구조정은 상어 다음에 바뀐 수문을 따라 움직여요.', has: g => g.cells.includes('p') },
];
let guideKeys = [], guideIndex = 0, guideViewed = new Set(), guideDemo = null, guideTime = 0, guidePlaying = false, guidePaintTime = -1, guideReturnFocus = null;
// When the sheet opens by itself for a new device, its example loops as a short clip at natural speed under one summary
// caption (2026-10-08). Stepping with previous/next switches to the reader-paced steps. Opening the guide from settings,
// or with reduced motion, waits for the reader as before.
let guideAutoplay = false;
const guideOpen = () => !$('guideOverlay').hidden;
function showDeviceGuide(firstOnly = false, requestedKey = null) {
  if (firstOnly && g && !$('gameScreen').hidden) introduceLightDevices();
  const devices = DEVICE_GUIDES.filter(d => (g && !$('gameScreen').hidden ? d.has(g) : !firstOnly) && (!firstOnly || !d.light && !save.seenDevices.includes(d.key)));
  if (firstOnly && !devices.length) return;
  guideKeys = devices.length ? devices.map(d => d.key) : ['move'];
  guideIndex = Math.max(0, guideKeys.indexOf(requestedKey)); guideViewed = new Set(); guidePlaying = false;
  guideAutoplay = firstOnly && !reduceMotion;
  guideReturnFocus = requestedKey === 'net' ? 'netTool' : $('gameScreen').hidden ? 'titleSettingsBtn' : 'settingsBtn';
  $('guideTitle').textContent = firstOnly ? '새 장치를 만났어요' : '장치 안내';
  openSheet('guideOverlay'); renderGuideDevice(); $('guideDone').focus({ preventScroll: true });
}
function renderGuideDevice() {
  const key = guideKeys[guideIndex], device = DEVICE_GUIDES.find(d => d.key === key) || { name: '기본 이동', text: '화면을 밀면 막힐 때까지 헤엄쳐요. 숭어를 모두 먹고 이동 기준 안에 탈출하면 별 3개를 받아요.' };
  if (key !== 'move') guideViewed.add(key);
  const clip = guideAutoplay && !reduceMotion;
  guideDemo = createDeviceDemo(key, { pace: clip ? 'clip' : 'read' }); guideTime = 0; guidePlaying = clip && !!guideDemo; guidePaintTime = -1;
  $('guideName').textContent = device.name;
  $('guideCounter').textContent = `${guideIndex + 1} / ${guideKeys.length}`;
  $('guideItems').innerHTML = `<p>${device.text}</p>`;
  $('guideDemo').setAttribute('aria-label', `${device.name} 사용 예시`);
  $('guideTabs').hidden = guideKeys.length < 2;
  $('guideTabs').innerHTML = guideKeys.map((k, i) => `<button type="button" data-guide="${i}" aria-pressed="${i === guideIndex}">${DEVICE_GUIDES.find(d => d.key === k)?.name || '기본 이동'}</button>`).join('');
  $('guideDone').textContent = guideIndex < guideKeys.length - 1 ? '다음 장치 보기' : '확인';
  $('guideBody').scrollTop = 0;
  updateGuidePlayback(); drawDeviceDemo();
}
function selectGuideDevice(index) {
  if (!Number.isInteger(index) || index < 0 || index >= guideKeys.length) return;
  guideIndex = index; renderGuideDevice();
}
function advanceGuide() {
  if (guideIndex < guideKeys.length - 1) selectGuideDevice(guideIndex + 1); else closeGuide();
}
function updateGuidePlayback() {
  if (!guideDemo) return;
  const index = guideStepIndex();
  $('guideToggle').textContent = guidePlaying ? '일시정지' : '예시 재생';
  $('guideMode').textContent = guideDemo.clip ? (guidePlaying ? '예시가 반복돼요 · 다음을 누르면 천천히 봐요' : '일시정지 중이에요')
    : guidePlaying ? '천천히 한 번 재생해요' : guideTime >= guideDemo.duration ? '예시 끝 · 다시 읽어 보세요' : '직접 넘기며 읽어 보세요';
  $('guideStepCount').textContent = `설명 ${index + 1} / ${guideDemo.steps.length}`;
  $('guidePrev').disabled = index === 0;
  $('guideNext').disabled = !guideDemo.clip && index === guideDemo.steps.length - 1;
  $('guideCaption').setAttribute('aria-live', guidePlaying ? 'off' : 'polite');
  const text = guideDemo.steps[index].text;
  if ($('guideCaption').textContent !== text) $('guideCaption').textContent = text;
}
function guideStepIndex() {
  const index = guideDemo.steps.findIndex(step => guideTime < step.end);
  return index < 0 ? guideDemo.steps.length - 1 : index;
}
function changeGuideStep(direction) {
  if (!guideDemo) return;
  if (guideDemo.clip) { guideDemo = createDeviceDemo(guideKeys[guideIndex]); guideTime = 0; direction = 0; }   // to the reader-paced steps, from the first one
  const index = Math.max(0, Math.min(guideDemo.steps.length - 1, guideStepIndex() + direction));
  // Show the completed action so the still frame explains the caption too.
  guideTime = guideDemo.steps[index].end - .001; guidePlaying = false; guidePaintTime = -1;
  updateGuidePlayback(); drawDeviceDemo();
}
function toggleGuidePlayback() {
  if (!guideDemo) return;
  guidePlaying = !guidePlaying;
  guidePaintTime = -1;
  if (guidePlaying && !guideDemo.clip) guideTime = guideTime >= guideDemo.duration ? 0 : guideDemo.steps[guideStepIndex()].start;
  updateGuidePlayback();
}
function replayGuide() {
  if (!guideDemo) return;
  guideTime = 0; guidePlaying = true; guidePaintTime = -1; updateGuidePlayback(); drawDeviceDemo();
}
function stepDeviceGuide(dt) {
  if (!guideDemo) return;
  if (guidePlaying) {
    const previous = guideStepIndex();
    guideTime = Math.min(guideTime + dt, guideDemo.duration);
    if (guideTime >= guideDemo.duration) { if (guideDemo.clip) guideTime = 0; else guidePlaying = false; }
    if (guideStepIndex() !== previous || !guidePlaying) updateGuidePlayback();
  }
  drawDeviceDemo();
}
function drawDeviceDemo() {
  if (!guideDemo) return;
  const canvas = $('guideDemo'), rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const d = Math.min(window.devicePixelRatio || 1, 2.5), width = Math.round(rect.width * d), height = Math.round(rect.height * d);
  if (canvas.width === width && canvas.height === height && guidePaintTime === guideTime) return;
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  guidePaintTime = guideTime;
  const x = canvas.getContext('2d'), grid = guideDemo.grid, size = Math.min(rect.width / grid.w, rect.height / grid.h);
  const sample = sampleDeviceDemo(guideDemo, guideTime), phase = sample.phase;
  x.setTransform(d, 0, 0, d, 0, 0); x.fillStyle = C.water; x.fillRect(0, 0, rect.width, rect.height);
  x.translate((rect.width - size * grid.w) / 2, (rect.height - size * grid.h) / 2);
  grid.cells.forEach((cell, i) => {
    const px = i % grid.w * size, py = Math.floor(i / grid.w) * size;
    if (cell === '#') { x.fillStyle = C.concrete; x.fillRect(px, py, size, size); }
    else { x.strokeStyle = 'rgba(255,255,255,.09)'; x.lineWidth = 1; x.strokeRect(px, py, size, size); }
    if (cell === 'o') drawBuoy(x, px + size / 2, py + size / 2, size, guideTime);
    if (JET[cell]) drawJet(x, px, py, size, JET[cell], guideTime);
    if (cell === 's') drawSand(x, px, py, size, i);
    if (cell === 'w') drawWhirl(x, px + size / 2, py + size / 2, size, guideTime);
    if (cell === 'p') drawSwitch(x, px, py, size, sample.gate === 1, phase.kind === 'gate' && !reduceMotion ? sample.progress : 0);
    if (cell === 'G') {   // the gate phase turns the shutter between the two recorded engine states
      const from = gateIsOpen(grid, i, phase.from.gate) ? 1 : 0, to = gateIsOpen(grid, i, phase.to.gate) ? 1 : 0;
      drawGate(x, px, py, size, phase.kind === 'gate' ? from + (to - from) * sample.progress : to, gatePassage(grid, i));
    }
  });
  // A fixed route remains available when automatic motion is disabled.
  if (reduceMotion && !guidePlaying) {
    x.save(); x.strokeStyle = C.star; x.lineWidth = 2; x.setLineDash([4, 4]);
    for (const p of guideDemo.phases.filter(p => p.kind === 'move')) {
      x.beginPath(); x.moveTo((p.from.pos[0] + .5) * size, (p.from.pos[1] + .5) * size);
      for (const [px, py, , warp] of p.path) { if (warp) x.moveTo((px + .5) * size, (py + .5) * size); else x.lineTo((px + .5) * size, (py + .5) * size); }
      x.stroke();
    }
    x.restore();
  }
  for (const index of sample.nets) drawNet(x, index % grid.w * size, Math.floor(index / grid.w) * size, size, false, guideTime);
  for (const boat of sample.boats) drawBoat(x, (boat.x + .5) * size, (boat.y + .5) * size, size, guideTime, ANG[boat.dir] + Math.PI / 2, true);
  drawShark(x, (sample.pos[0] + .5) * size, (sample.pos[1] + .5) * size, ANG[sample.dir], size * Math.max(.05, sample.scale), guideTime, phase.kind === 'move');
  if (phase.kind === 'cue' || phase.kind === 'tap') {
    const tapping = phase.kind === 'tap', [dx, dy] = DIRS[phase.dir || 'R'];
    const pos = tapping ? phase.tap : phase.from.pos, progress = sample.progress;
    const px = (pos[0] + .5 + (tapping ? .18 : -dy * .42 + dx * progress * .8)) * size;
    const py = (pos[1] + .5 + (tapping ? .2 : dx * .42 + dy * progress * .8)) * size;
    x.fillStyle = '#fff'; x.strokeStyle = C.star; x.lineWidth = 2;
    x.beginPath(); x.arc(px, py, size * (tapping ? .16 - Math.sin(progress * Math.PI) * .03 : .16), 0, Math.PI * 2); x.fill(); x.stroke();
  }
  if ($('guideCaption').textContent !== sample.text) $('guideCaption').textContent = sample.text;
  $('guideStats').textContent = `예시 이동 ${sample.moves}회${grid.nets ? ` · 그물 ${grid.nets - sample.nets.length}` : ''}`;
  $('guideProgress').value = guideTime / guideDemo.duration;
}
// First meeting with a simple device: no sheet. Its tiles join the spotlight and the tip explains it until the first
// move; it counts as seen once the spotlight starts (at once in reduced motion, which has no spotlight).
function introduceLightDevices() {
  const fresh = DEVICE_GUIDES.filter(d => d.light && d.has(g) && !save.seenDevices.includes(d.key));
  if (!fresh.length) return;
  setTip(fresh.map(d => d.text).join(' '), true);
  const cells = [], keys = fresh.map(d => d.key);
  g.cells.forEach((c, k) => { if (fresh.some(d => d.light.test(c))) cells.push(k); });
  if (reduceMotion) markDevicesSeen(keys); else addDeviceSpot(cells, { seen: keys });
}
function markDevicesSeen(keys) { save.seenDevices = [...new Set([...save.seenDevices, ...keys])]; persist(); }
function closeGuide() {
  markDevicesSeen(guideViewed);
  guideKeys = []; guideViewed = new Set(); guideDemo = null; guidePlaying = false;
  closeSheet('guideOverlay', guideReturnFocus);
}
// screen change with a native-style push (into a level) or pop (back to the list)
function show(which, animate = true) {
  sfx.clear();
  flushSheetExits();
  if (which === 'title') cancelClearPresentation();
  if (which === 'title') { pauseGame(); closeSheet('guideOverlay', null, false); closeSheet('chapterOverlay', null, false); guideKeys = []; guideDemo = null; guidePlaying = false; cleared = false; }
  const el = which === 'title' ? $('titleScreen') : $('gameScreen');
  $('titleScreen').hidden = which !== 'title';
  $('gameScreen').hidden = which !== 'game';
  el.classList.remove('enter-fwd', 'enter-back');
  if (animate && !reduceMotion) { void el.offsetWidth; el.classList.add(which === 'game' ? 'enter-fwd' : 'enter-back'); }
  resetHero();
  if (which === 'title') { closeSheet('clearOverlay', null, false); $('stagePicker').open = false; renderLevelGrid(true); renderDaily(); renderFreeCard(); renderSkinCard(); $('titleScreen').scrollTop = 0; }
  else requestAnimationFrame(resize);
}
function startLevel(i) { if (!unlocked(i)) return; const keep = storySession(i); show('game'); loadLevel(i, keep); }

$('levelGrid').addEventListener('click', e => { const b = e.target.closest('.lv'); if (b && !b.disabled) { ac(); startLevel(+b.dataset.i); } });
$('stagePicker').addEventListener('toggle', () => { if ($('stagePicker').open) applyStoryRewards(); });
$('chapterPicker').addEventListener('click', e => {
  const b = e.target.closest('.chapter-btn'); if (!b) return;
  selectedChapter = +b.dataset.chapter; renderLevelGrid();
  $('chapterPicker').querySelector(`[data-chapter="${selectedChapter}"]`).focus({ preventScroll: true });
});
$('playBtn').addEventListener('click', () => { ac(); startLevel(storySession() ? storyResumeId() : nextLevel()); });
hero.addEventListener('pointerdown', reactHero, { passive: true });
$('journeyBtn').addEventListener('click', openJourney);
$('journeyDone').addEventListener('click', closeJourney);
$('journeyOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeJourney(); });
$('journeyChapters').addEventListener('click', e => { const b = e.target.closest('[data-journey-chapter]'); if (b) selectJourneyChapter(+b.dataset.journeyChapter); });
$('endingBtn').addEventListener('click', () => openEnding());
$('journeyEndingBtn').addEventListener('click', () => openEnding('journey'));
$('endingDone').addEventListener('click', closeEnding);
$('endingHomeBtn').addEventListener('click', endingToTitle);
$('endingDailyBtn').addEventListener('click', endingToDaily);
$('endingOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeEnding(); });
$('dailyBtn').addEventListener('click', () => { ac(); openDaily(); });
$('freeBtn').addEventListener('click', () => { ac(); openFree(); });
$('pilotDone').addEventListener('click', closePilot);
$('pilotOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closePilot(); });
$('pilotRegions').addEventListener('click', e => { const b = e.target.closest('[data-pilot]'); if (b && !b.disabled) { ac(); startPilot(+b.dataset.pilot); } });
$('freeDone').addEventListener('click', closeFree);
$('freeOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeFree(); });
$('freeTiers').addEventListener('click', e => {
  const b = e.target.closest('[data-free]');
  if (b && !b.disabled) { ac(); startFree(+b.dataset.free, b.dataset.action === 'new', b.dataset.action === 'replay'); }
});
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
  selectSkin(b.dataset.id);
});
$('backBtn').addEventListener('click', () => show('title'));
$('undoBtn').addEventListener('click', undo);
$('restartBtn').addEventListener('click', restart);
$('hintBtn').addEventListener('click', showHint);
$('againBtn').addEventListener('click', replay);
$('nextBtn').addEventListener('click', continueStory);
// settings sheet (sound, vibration) — opened from the gear on the title and in a level
const settingsOpen = () => !$('settingsOverlay').hidden;
function openSettings() { $('optSound').checked = save.sound; $('optVibe').checked = save.vibe; openSheet('settingsOverlay'); $('settingsDone').focus({ preventScroll: true }); }
function closeSettings() { closeSheet('settingsOverlay', $('gameScreen').hidden ? 'titleSettingsBtn' : 'settingsBtn'); }
$('settingsBtn').addEventListener('click', openSettings);
$('titleSettingsBtn').addEventListener('click', openSettings);
$('settingsDone').addEventListener('click', closeSettings);
$('deviceGuideBtn').addEventListener('click', () => { closeSettings(); showDeviceGuide(); });
$('guideDone').addEventListener('click', advanceGuide);
$('chapterOverlay').addEventListener('click', closeChapterCard);   // the button or anywhere on the card starts the chapter
$('guideClose').addEventListener('click', closeGuide);
$('guideToggle').addEventListener('click', toggleGuidePlayback);
$('guideReplay').addEventListener('click', replayGuide);
$('guidePrev').addEventListener('click', () => changeGuideStep(-1));
$('guideNext').addEventListener('click', () => changeGuideStep(1));
$('netTool').addEventListener('click', () => {
  if (g.nets) showDeviceGuide(false, 'net'); else { setTip(NO_NETS_TIP); pulseRewardMark($('netTool'), 'nudge'); }
});
$('netCallout').addEventListener('click', () => { netCallout.done = true; $('netCallout').hidden = true; });
$('guideTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-guide]'); if (!b) return;
  selectGuideDevice(+b.dataset.guide);
  $('guideTabs').querySelector(`[data-guide="${guideIndex}"]`).focus({ preventScroll: true });
});
$('settingsOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeSettings(); });
$('optSound').addEventListener('change', e => { save.sound = e.target.checked; persist(); sound.syncEnabled(); if (save.sound) { ac(); sfx.ui(); } });
$('optVibe').addEventListener('change', e => { save.vibe = e.target.checked; persist(); haptic('medium'); });
// light tick on every enabled button press, like native controls
document.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('button:not([disabled])')) haptic('tick'); });
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerdown', sheetPointerDown, true);
document.addEventListener('pointermove', sheetPointerMove, { passive: false });
document.addEventListener('pointerup', e => sheetPointerEnd(e));
document.addEventListener('pointercancel', e => { if (sheetDrag?.pointerId === e.pointerId) sheetPointerEnd(e, true); });
document.addEventListener('lostpointercapture', e => { if (sheetDrag?.pointerId === e.pointerId) sheetPointerEnd(e, true); });
document.addEventListener('click', sheetClick, true);
// Unlock only from input. Bubble feedback follows the action; semantic sounds suppress a second tap.
let silentUiTarget = null;
document.addEventListener('click', e => {
  if (e.isTrusted) ac();
  const button = e.target.closest('button');
  silentUiTarget = button && (button.disabled || button.getAttribute('aria-pressed') === 'true' || button.closest('#skinGrid')) ? button : null;
}, true);
document.addEventListener('click', e => {
  const button = e.target.closest('button, summary');
  if (button && button !== silentUiTarget && !button.disabled && !e.defaultPrevented) sfx.ui();
});
document.addEventListener('keydown', e => { if (e.isTrusted && !e.repeat) ac(); }, true);
sheetDesktop.addEventListener('change', resetSheetGesture);

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
  if (sheetKeydown(e)) return;
  if (endingOpen()) { if (e.key === 'Escape') closeEnding(); return; }
  if (journeyOpen()) { if (e.key === 'Escape') closeJourney(); return; }
  if (journalOpen()) { if (e.key === 'Escape') closeJournal(); return; }
  if (dailyOpen()) { if (e.key === 'Escape') closeDaily(); return; }
  if (freeOpen()) { if (e.key === 'Escape') closeFree(); return; }
  if (pilotOpen()) { if (e.key === 'Escape') closePilot(); return; }
  if (chapterOpen()) { if (e.key === 'Escape') closeChapterCard(); return; }
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
window.addEventListener('resize', () => { resetSheetGesture(); resize(); heroW = 0; });
document.addEventListener('visibilitychange', () => { if (document.hidden) suspendPresentation(); else resumePresentation(); });
window.addEventListener('pagehide', () => { pageHidden = true; suspendPresentation(); });
window.addEventListener('pageshow', () => { pageHidden = false; resumePresentation(); });
motionPreference.addEventListener('change', changeMotionPreference);
$('titleScreen').addEventListener('scroll', updateHeroVisibility, { passive: true });
// native app (Capacitor + @capacitor/app): hardware back returns to the level list, exits from the list
const capApp = window.Capacitor?.Plugins?.App;
if (capApp) capApp.addListener('backButton', () => {
  if (sheetExits.size) return;
  if (endingOpen()) closeEnding();
  else if (journeyOpen()) closeJourney();
  else if (journalOpen()) closeJournal();
  else if (dailyOpen()) closeDaily();
  else if (freeOpen()) closeFree();
  else if (pilotOpen()) closePilot();
  else if (chapterOpen()) closeChapterCard();
  else if (guideOpen()) closeGuide();
  else if (settingsOpen()) closeSettings();
  else if (skinsOpen()) closeSkins();
  else if ($('gameScreen').hidden) capApp.exitApp(); else show('title');
});
if (capApp) capApp.addListener('appStateChange', ({ isActive }) => {
  appActive = isActive; if (isActive) resumePresentation(); else suspendPresentation();
});

/* ---------- boot (keeps a game in progress across live page updates) ---------- */
function start(data) {
  migratePilotToStory(); migrateStoryOrder();
  refreshSkins();   // grant skins already earned by existing progress
  renderLegend(); drawLegendIcon($('netToolIcon')); renderLevelGrid();
  const resumeDaily = data && data.daily === dailyDate() && (Number.isInteger(data.dailyStage)
    ? DAILY_OPERATION_VERSIONS.includes(data.dailyVersion) && makeDailyStage(data.daily, data.dailyStage, data.dailyVersion,
      data.dailyVersion === DAILY_OPERATION_VERSION ? dailyLearned(data.daily) : null) : makeDaily(data.daily));
  const level = resumeDaily ? resumeDaily.level : data && storyLevel(data.lvl);
  const keep = level && data.st && restoreSession({ version: 1, id: 0, layout: levelSignature(level), state: data.st }, level, 0);
  if (data && data.screen === 'game' && keep && resumeDaily) { show('game', false); requestAnimationFrame(() => loadDaily(resumeDaily, keep)); }
  else if (data && data.free && data.screen === 'game') {
    show('title', false);
    const run = freeRecord(data.free.difficulty);
    if (run && freeId(run) === data.free.id) { openFree(); startFree(run.difficulty); }
  }
  else if (data && Number.isInteger(data.pilot) && data.screen === 'game' && PILOT_LEVELS[data.pilot] && pilotUnlocked(data.pilot)) {
    const i = LEVELS.findIndex(l => l.id === PILOT_LEVELS[data.pilot].id);
    show('game', false); requestAnimationFrame(() => loadLevel(i, storySession(i)));
  }
  else if (data && !data.daily && !Number.isInteger(data.pilot) && data.screen === 'game' && keep && unlocked(data.lvl)) { show('game', false); requestAnimationFrame(() => loadLevel(data.lvl, keep)); }
  else show('title', false);
  startFrames();
}
window.claude?.hot?.snapshot?.(() => { pauseGame(); return { screen: $('gameScreen').hidden ? 'title' : 'game', lvl: LVL, daily: DAILY ? DAILY.date : null,
  free: FREE ? { difficulty: FREE.difficulty, id: freeId(FREE) } : null, pilot: PILOT ? PILOT.index : null,
  dailyStage: DAILY?.stage, dailyVersion: DAILY?.version, st: st && !anim ? st : null }; });
const boot = () => window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
if (typeof SHARK_ART !== 'undefined') {
  SHARK_ART.onReady = () => {
    invalidateScenes(); guidePaintTime = -1;
    drawSkinPreview($('skinPreview'), currentSkin());
    if (chapterOpen()) drawRouteShark($('chapterShark'));
    if (skinsOpen()) $('skinGrid').querySelectorAll('.skin').forEach(b => {
      const skin = SKINS.find(s => s.id === b.dataset.id);
      if (skin) drawSkinPreview(b.querySelector('canvas'), skin);
    });
    if (!$('clearOverlay').hidden) $('clearUnlocks').querySelectorAll('canvas[data-new-skin]').forEach(canvas => {
      const skin = SKINS.find(s => s.id === canvas.dataset.newSkin);
      if (skin) drawSkinPreview(canvas, skin);
    });
  };
  SHARK_ART.load();
}
if (typeof BOARD_ART !== 'undefined') {
  BOARD_ART.onReady = () => { invalidateScenes(); guidePaintTime = -1; if ($('legend').childElementCount) $('legend').querySelectorAll('canvas').forEach(drawLegendIcon); drawLegendIcon($('netToolIcon')); };
  BOARD_ART.load();
}
$('clearMascot').addEventListener('error', e => { e.currentTarget.hidden = true; });
$('clearUnlocks').addEventListener('click', e => { const b = e.target.closest('[data-wear]'); if (b && b.getAttribute('aria-disabled') !== 'true') wearSkin(b.dataset.wear, b); });
if (typeof MENU_ART !== 'undefined') MENU_ART.load();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(boot, boot); else boot();
})();
