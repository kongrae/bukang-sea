// Checks every level: legal replay, star target achievable, and net levels really need their nets.
// Targets follow the authored role allowance; these counts do not predict human difficulty.
//   node tools/verify.js   (story canals, then the separate pilot course: tools/verify-pilot.js)
const fs = require('fs');
const path = require('path');
const E = require('../src/engine.js');
const { replayPlan } = require('./replay-plan.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'levels.js'), 'utf8');
const { LEVELS, CHAPTERS, STORY_ORDER, STORY_POSITION, STORY_CHAPTER_LEVELS, LEVEL_ROLES } =
  new Function(src + '; return { LEVELS, CHAPTERS, STORY_ORDER, STORY_POSITION, STORY_CHAPTER_LEVELS, LEVEL_ROLES };')();

let failed = 0;
const chapterTotal = CHAPTERS.reduce((n, c) => n + c.count, 0);
if (chapterTotal !== LEVELS.length) { failed++; console.log(`FAIL chapters cover ${chapterTotal} levels but LEVELS has ${LEVELS.length}`); }
// Play order: every LEVELS index exactly once; each chapter ends on a challenge and introduces exactly one new device.
if (STORY_ORDER.length !== LEVELS.length || [...STORY_ORDER].sort((a, b) => a - b).some((index, k) => index !== k)) {
  failed++; console.log('FAIL STORY_ORDER must list every LEVELS index exactly once');
}
const DEVICE_CELLS = { b: '구조정', B: '구조정', '^': '물줄기', v: '물줄기', '<': '물줄기', '>': '물줄기', s: '모래톱', w: '소용돌이', p: '수문', G: '수문', g: '수문' };
const devicesOf = lvl => new Set([...lvl.map.join('')].map(c => DEVICE_CELLS[c]).filter(Boolean).concat(lvl.nets ? ['그물'] : []));
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
  if (!full) problems.push('cannot collect all fish and escape');
  else {
    if (full.moves > lvl.par) problems.push(`star target ${lvl.par} is below minimum ${full.moves}`);
    if (role && lvl.par !== full.moves + role.slack) problems.push(`${role.label} target must be minimum + ${role.slack}, got ${lvl.par - full.moves}`);
    try { replayPlan(g, full); } catch (e) { problems.push('invalid all-fish plan: ' + e.message); }
  }
  if (escape) { try { replayPlan(g, escape, { needAll: false }); } catch (e) { problems.push('invalid escape plan: ' + e.message); } }

  let netNote = '';
  if (g.nets) {
    const noNetEscape = E.bfsFrom(g, g.start, 0, new Set(), false, 60);
    const noNetFull = E.bfsFrom(g, g.start, 0, new Set(), true, 60);
    if (noNetFull) problems.push('all-fish route exists without any net (nets are pointless)');
    netNote = ` | without nets: escape ${noNetEscape ? noNetEscape.moves : 'impossible'}`;
  }

  const status = problems.length ? 'FAIL' : 'ok  ';
  if (problems.length) failed++;
  console.log(
    `${status} ${String(position + 1).padStart(2)} ${lvl.name.padEnd(10)} ${role ? role.label : '?'} par ${lvl.par}` +
    (full ? ` | minimum ${full.moves} | allowance ${lvl.par - full.moves} | solution ${full.steps.map(s => s.dir + (g.nets ? '[' + s.nets.map(k => `${k % g.w},${Math.floor(k / g.w)}`).join(';') + ']' : '')).join(' ')}` : '') +
    (escape ? ` | escape-only ${escape.moves}` : '') + netNote +
    (problems.length ? `\n     -> ${problems.join('; ')}` : '')
  );
});
// 2026-10-07 canals: wall layouts differ from every other story canal; switch canals cannot be solved with gates frozen.
const { shapeKey } = require('./variety-audit.js');
const shapes = new Map();
LEVELS.forEach((lvl, i) => { const key = shapeKey(lvl.map); shapes.set(key, [...(shapes.get(key) || []), i]); });
STORY_CHAPTER_LEVELS.forEach(lvl => {
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
const pilotFailed = require('./verify-pilot.js').verifyPilot();
process.exit(failed || pilotFailed ? 1 : 0);
