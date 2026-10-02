// Checks every level: legal replay, star target achievable, and net levels really need their nets.
// Targets follow the authored role allowance; these counts do not predict human difficulty.
//   node tools/verify.js   (story canals, then the separate pilot course: tools/verify-pilot.js)
const fs = require('fs');
const path = require('path');
const E = require('../src/engine.js');
const { replayPlan } = require('./replay-plan.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'levels.js'), 'utf8');
const { LEVELS, CHAPTERS, LEVEL_ROLES } = new Function(src + '; return { LEVELS, CHAPTERS, LEVEL_ROLES };')();

let failed = 0;
const chapterTotal = CHAPTERS.reduce((n, c) => n + c.count, 0);
if (chapterTotal !== LEVELS.length) { failed++; console.log(`FAIL chapters cover ${chapterTotal} levels but LEVELS has ${LEVELS.length}`); }
LEVELS.forEach((lvl, i) => {
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
    `${status} ${String(i + 1).padStart(2)} ${lvl.name.padEnd(10)} ${role ? role.label : '?'} par ${lvl.par}` +
    (full ? ` | minimum ${full.moves} | allowance ${lvl.par - full.moves} | solution ${full.steps.map(s => s.dir + (g.nets ? '[' + s.nets.map(k => `${k % g.w},${Math.floor(k / g.w)}`).join(';') + ']' : '')).join(' ')}` : '') +
    (escape ? ` | escape-only ${escape.moves}` : '') + netNote +
    (problems.length ? `\n     -> ${problems.join('; ')}` : '')
  );
});
console.log(failed ? `\n${failed} level(s) failed` : `\nall ${LEVELS.length} levels ok`);
console.log('Practice: minimum + 2; regular: minimum + 1; challenge: minimum. Nets in [] are the full placement BEFORE each swipe.');
const pilotFailed = require('./verify-pilot.js').verifyPilot();
process.exit(failed || pilotFailed ? 1 : 0);
