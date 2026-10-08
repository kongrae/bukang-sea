// Checks every level: legal replay, star target achievable, and net levels really need their nets.
// Targets follow the authored role allowance; these counts do not predict human difficulty.
//   node tools/verify.js   (story canals, then the separate pilot course: tools/verify-pilot.js)
const fs = require('fs');
const path = require('path');
const E = require('../src/engine.js');
const { replayPlan } = require('./replay-plan.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'levels.js'), 'utf8');
const { LEVELS, CHAPTERS, STORY_ORDER, STORY_POSITION, STORY_CHAPTER_LEVELS, STORY_QUAY_LEVELS, LEVEL_ROLES } =
  new Function(src + '; return { LEVELS, CHAPTERS, STORY_ORDER, STORY_POSITION, STORY_CHAPTER_LEVELS, STORY_QUAY_LEVELS, LEVEL_ROLES };')();

let failed = 0;
const chapterTotal = CHAPTERS.reduce((n, c) => n + c.count, 0);
if (chapterTotal !== LEVELS.length) { failed++; console.log(`FAIL chapters cover ${chapterTotal} levels but LEVELS has ${LEVELS.length}`); }
// Play order: every LEVELS index exactly once; each chapter ends on a challenge and introduces exactly one new device.
if (STORY_ORDER.length !== LEVELS.length || [...STORY_ORDER].sort((a, b) => a - b).some((index, k) => index !== k)) {
  failed++; console.log('FAIL STORY_ORDER must list every LEVELS index exactly once');
}
const DEVICE_CELLS = { b: '구조정', B: '구조정', '^': '물줄기', v: '물줄기', '<': '물줄기', '>': '물줄기', s: '모래톱', w: '소용돌이', p: '수문', G: '수문', g: '수문', c: '나무 상자' };
const devicesOf = lvl => new Set([...lvl.map.join('')].map(c => DEVICE_CELLS[c]).filter(Boolean).concat(lvl.nets ? ['그물'] : []));
// Crate canals (chapter 7): every no-net state reachable from the start with E.turn, and how many of them can no longer
// escape at all (unescapable) or can still escape but no longer with every fish (fish lost). Gives up past `cap` states.
const CRATE_STATE_CAP = 100000;
function crateReach(g, cap = CRATE_STATE_CAP) {
  const fishIdx = new Map(g.fish.map((f, i) => [f[1] * g.w + f[0], i])), full = (1 << g.fish.length) - 1, none = new Set();
  const keyOf = s => s.pos + '|' + s.mask + '|' + E.boatsKey(s.boats) + '|' + s.gate + '|' + s.crates.join(',');
  const states = [{ pos: g.start, mask: 0, boats: g.boats, gate: 0, crates: g.crates }], ids = new Map([[keyOf(states[0]), 0]]);
  const escape = [false], all = [false], preds = [[]];
  for (let id = 0; id < states.length; id++) {
    const s = states[id];
    for (const d of 'UDLR') {
      const r = E.turn(g, s.pos, d, none, s.boats, s.gate, s.crates, s.mask);
      if (!r.path.length) continue;
      let m = s.mask;
      for (const [x, y] of r.path) { const fi = fishIdx.get(y * g.w + x); if (fi != null) m |= 1 << fi; }
      if (r.win) { escape[id] = true; if (m === full) all[id] = true; continue; }
      const t = { pos: r.end, mask: m, boats: r.boats, gate: r.gate, crates: r.crates }, k = keyOf(t);
      let to = ids.get(k);
      if (to == null) {
        if (states.length >= cap) return { reachable: Infinity };
        to = states.length; ids.set(k, to); states.push(t); escape.push(false); all.push(false); preds.push([]);
      }
      preds[to].push(id);
    }
  }
  // A state can (fully) escape when any successor can: walk the edges backwards from the winning states.
  for (const flag of [escape, all]) {
    const queue = flag.map((v, id) => v ? id : -1).filter(id => id >= 0);
    for (let q = 0; q < queue.length; q++) for (const p of preds[queue[q]]) if (!flag[p]) { flag[p] = true; queue.push(p); }
  }
  const unescapable = escape.filter(v => !v).length, fishLost = escape.filter((v, id) => v && !all[id]).length;
  return { reachable: states.length, unescapable, fishLost };
}
const percent = (n, total) => (100 * n / total).toFixed(1) + '%';
const withCell = (lvl, g, i, ch) => ({ ...lvl, map: lvl.map.map((row, y) => y === Math.floor(i / g.w) ? row.slice(0, i % g.w) + ch + row.slice(i % g.w + 1) : row) });
const seenDevices = new Set();
let chapterStart = 0;
CHAPTERS.forEach((ch, ci) => {
  const positions = Array.from({ length: ch.count }, (_, k) => chapterStart + k); chapterStart += ch.count;
  const fresh = [];
  positions.forEach(p => devicesOf(LEVELS[STORY_ORDER[p]] || { map: [] }).forEach(d => { if (!seenDevices.has(d)) { seenDevices.add(d); fresh.push(`${d} ${p + 1}`); } }));
  const last = LEVELS[STORY_ORDER[positions[positions.length - 1]]];
  const problems = [];
  if (fresh.length !== 1) problems.push(`new devices ${fresh.join(', ') || 'none'} (expected exactly one)`);
  if (!last || last.role !== 'challenge') problems.push('last canal must be a challenge');
  if (problems.length) failed++;
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${ci + 1}장 ${ch.name}: new ${fresh.join(', ') || 'none'}${problems.length ? `\n     -> ${problems.join('; ')}` : ''}`);
});
STORY_ORDER.forEach((i, position) => {
  const lvl = LEVELS[i];
  if (!lvl) return;
  const g = E.parseLevel(lvl);
  const problems = [];
  const role = LEVEL_ROLES[lvl.role || 'regular'];
  if (!role) problems.push('unknown level role ' + lvl.role);
  if (!g.start) problems.push('no S');
  if (!g.cells.includes('E')) problems.push('no E');

  const full = E.plan(g, g.start, 0, new Set(), g.nets, true);      // all fish, nets allowed
  const escape = E.plan(g, g.start, 0, new Set(), g.nets, false);   // just get out
  let fullReplay = null;
  if (!full) problems.push('cannot collect all fish and escape');
  else {
    if (full.moves > lvl.par) problems.push(`star target ${lvl.par} is below minimum ${full.moves}`);
    if (role && lvl.par !== full.moves + role.slack) problems.push(`${role.label} target must be minimum + ${role.slack}, got ${lvl.par - full.moves}`);
    try { fullReplay = replayPlan(g, full); } catch (e) { problems.push('invalid all-fish plan: ' + e.message); }
  }
  if (escape) { try { replayPlan(g, escape, { needAll: false }); } catch (e) { problems.push('invalid escape plan: ' + e.message); } }

  let netNote = '';
  if (g.nets) {
    const noNetEscape = E.bfsFrom(g, g.start, 0, new Set(), false, 60);
    const noNetFull = E.bfsFrom(g, g.start, 0, new Set(), true, 60);
    if (noNetFull) problems.push('all-fish route exists without any net (nets are pointless)');
    netNote = ` | without nets: escape ${noNetEscape ? noNetEscape.moves : 'impossible'}`;
  }

  // Crate canals: no nets, at most one boat, every crate changes the all-fish route (as a buoy and as plain water),
  // a bounded state space, no dead ends in practice canals, and the best route pushes at least once.
  let crateNote = '';
  if (g.crates.length) {
    if (g.nets) problems.push('crate canals use no nets');
    if (g.boats.length > 1) problems.push(`crate canals have at most 1 boat, got ${g.boats.length}`);
    if (full) for (const i of g.crates) for (const [ch, as] of [['o', 'buoy'], ['.', 'water']]) {
      const alt = E.parseLevel(withCell(lvl, g, i, ch)), p = E.plan(alt, alt.start, 0, new Set(), alt.nets, true);
      if (p && p.moves === full.moves) problems.push(`crate ${i % g.w},${Math.floor(i / g.w)} is not needed (as ${as} the minimum stays ${full.moves})`);
    }
    const reach = crateReach(g);
    if (reach.reachable > CRATE_STATE_CAP) problems.push(`more than ${CRATE_STATE_CAP} reachable states`);
    else if (lvl.role === 'learn' && reach.unescapable) problems.push(`practice crate canal has ${reach.unescapable} unescapable states`);
    if (fullReplay && !fullReplay.pushes) problems.push('the best route never pushes a crate');
    crateNote = reach.reachable > CRATE_STATE_CAP ? ` | crates: reachable > ${CRATE_STATE_CAP}` :
      ` | crates: reachable ${reach.reachable}, unescapable ${percent(reach.unescapable, reach.reachable)}, fish lost ${percent(reach.fishLost, reach.reachable)}, pushes ${fullReplay ? fullReplay.pushes : '?'}`;
  }

  const status = problems.length ? 'FAIL' : 'ok  ';
  if (problems.length) failed++;
  console.log(
    `${status} ${String(position + 1).padStart(2)} ${lvl.name.padEnd(10)} ${role ? role.label : '?'} par ${lvl.par}` +
    (full ? ` | minimum ${full.moves} | allowance ${lvl.par - full.moves} | solution ${full.steps.map(s => s.dir + (g.nets ? '[' + s.nets.map(k => `${k % g.w},${Math.floor(k / g.w)}`).join(';') + ']' : '')).join(' ')}` : '') +
    (escape ? ` | escape-only ${escape.moves}` : '') + netNote + crateNote +
    (problems.length ? `\n     -> ${problems.join('; ')}` : '')
  );
});
// 2026-10-07 canals and chapter 7 (2026-10-09): wall layouts differ from every other story canal; switch canals
// cannot be solved with gates frozen.
const { shapeKey } = require('./variety-audit.js');
const shapes = new Map();
LEVELS.forEach((lvl, i) => { const key = shapeKey(lvl.map); shapes.set(key, [...(shapes.get(key) || []), i]); });
[...STORY_CHAPTER_LEVELS, ...STORY_QUAY_LEVELS].forEach(lvl => {
  const i = LEVELS.indexOf(lvl), g = E.parseLevel(lvl), problems = [];
  const same = shapes.get(shapeKey(lvl.map)).filter(k => k !== i);
  if (same.length) problems.push('same wall layout as ' + same.map(k => STORY_POSITION[k] + 1).join(', '));
  if (g.switches.length) {
    g.switches = [];
    if (E.plan(g, g.start, 0, new Set(), g.nets, false) || E.plan(g, g.start, 0, new Set(), g.nets, true)) problems.push('gate change is not required');
  }
  if (problems.length) { failed++; console.log(`FAIL ${STORY_POSITION[i] + 1} ${lvl.name}\n     -> ${problems.join('; ')}`); }
});
console.log(failed ? `\n${failed} level(s) failed` : `\nall ${LEVELS.length} levels ok (new canals: unique wall layouts, gates required)`);
console.log('Practice: minimum + 2; regular: minimum + 1; challenge: minimum. Nets in [] are the full placement BEFORE each swipe.');
if (LEVELS.some(lvl => lvl.map.some(row => row.includes('c')))) {
  console.log('Crates: reachable = no-net states from the start; unescapable = no way out left; fish lost = way out without every fish.');
}
const pilotFailed = require('./verify-pilot.js').verifyPilot();
process.exit(failed || pilotFailed ? 1 : 0);
