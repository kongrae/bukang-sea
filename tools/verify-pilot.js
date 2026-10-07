// Extra checks for the former pilot canals p01–p12 (LEVELS 48–59): compare against the original 48 and validate gate learning.
//   node tools/verify-pilot.js   (also run at the end of npm run verify)
// Per canal: data rules, minimum route = authored route, role-based star target, net need, and a counterfactual gate test:
// with every switch disabled (gates frozen in their start state) neither escape nor the all-fish goal may be reachable.
const fs = require('fs');
const path = require('path');
const E = require('../src/engine.js');
const { replayPlan, replaySteps, parseRoute } = require('./replay-plan.js');
const { PILOT_LEVELS, PILOT_REGIONS } = require('../src/pilot.js');
const { shapeKey } = require('./variety-audit.js');

const LIMITS = { width: 9, height: 11, switches: [1, 2], gates: [1, 3], nets: 2 };
function frozen(level) { const g = E.parseLevel(level); g.switches = []; return g; }

function verifyPilot(log = console.log) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'levels.js'), 'utf8');
  const { LEVELS, LEVEL_ROLES } = new Function(src + '; return { LEVELS, LEVEL_ROLES };')();
  const storyShapes = new Map(LEVELS.slice(0, 48).map((l, i) => [shapeKey(l.map), i + 1]));
  const regions = new Map(PILOT_REGIONS.map((r, i) => [r.id, i]));
  const shapes = new Map();
  let failed = 0, lastRegion = 0;
  log(`\n이전 시험 코스 p01–p12 (${PILOT_LEVELS.length}개): 기존 48개와 배치 중복·수문 규칙 추가 검사`);
  if (PILOT_LEVELS.length !== 12) { failed++; log(`FAIL pilot course must have 12 canals, got ${PILOT_LEVELS.length}`); }
  PILOT_LEVELS.forEach((lvl, i) => {
    const problems = [], role = LEVEL_ROLES[lvl.role || 'regular'];
    if (lvl.id !== `p${String(i + 1).padStart(2, '0')}`) problems.push('id must be p' + String(i + 1).padStart(2, '0'));
    if (!regions.has(lvl.region)) problems.push('unknown region ' + lvl.region);
    else if (regions.get(lvl.region) < lastRegion) problems.push('regions must not go back');
    else lastRegion = regions.get(lvl.region);
    if (!role) problems.push('unknown level role ' + lvl.role);
    for (const key of ['name', 'tip', 'intent', 'route']) if (typeof lvl[key] !== 'string' || !lvl[key].trim()) problems.push('missing ' + key);
    let g = null;
    try { g = E.parseLevel(lvl); } catch (e) { problems.push(e.message); }
    let full = null, escape = null, line = '';
    if (g) {
      if (g.w > LIMITS.width || g.h > LIMITS.height) problems.push(`board ${g.w}x${g.h} exceeds ${LIMITS.width}x${LIMITS.height}`);
      if (g.nets > LIMITS.nets) problems.push('too many nets');
      if (!g.start) problems.push('no S');
      if (!g.cells.includes('E')) problems.push('no E');
      const sluice = lvl.region === 'sluice-works';
      if (g.switches.length || g.gates.length) {
        if (g.switches.length < LIMITS.switches[0] || g.switches.length > LIMITS.switches[1]) problems.push('switch count ' + g.switches.length);
        if (g.gates.length < LIMITS.gates[0] || g.gates.length > LIMITS.gates[1]) problems.push('gate count ' + g.gates.length);
      }
      if (sluice !== g.gates.length > 0) problems.push(sluice ? 'sluice canals need switches and gates' : 'gates belong to the sluice region');
      if (g.boats.length && g.gates.length) problems.push('pilot keeps boats away from gates (rule defined, not taught here)');
      const key = shapeKey(lvl.map);
      if (storyShapes.has(key)) problems.push('same wall layout as story ' + storyShapes.get(key));
      if (shapes.has(key)) problems.push('same wall layout as ' + shapes.get(key));
      shapes.set(key, lvl.id);
      full = E.plan(g, g.start, 0, new Set(), g.nets, true);
      escape = E.plan(g, g.start, 0, new Set(), g.nets, false);
      if (!full) problems.push('cannot collect all fish and escape');
      else {
        if (role && lvl.par !== full.moves + role.slack) problems.push(`${role.label} target must be minimum ${full.moves} + ${role.slack}, got ${lvl.par}`);
        try { replayPlan(g, full); } catch (e) { problems.push('invalid all-fish plan: ' + e.message); }
        try {
          const steps = parseRoute(g, lvl.route), done = replaySteps(g, steps);
          if (steps.length !== full.moves) problems.push(`authored route has ${steps.length} swipes, minimum is ${full.moves}`);
          if (sluice && !done.presses) problems.push('authored route never presses a switch');
          line += ` | route presses ${done.presses}`;
        } catch (e) { problems.push('authored route: ' + e.message); }
      }
      if (escape) { try { replayPlan(g, escape, { needAll: false }); } catch (e) { problems.push('invalid escape plan: ' + e.message); } }
      if (g.nets && E.plan(g, g.start, 0, new Set(), 0, true)) problems.push('all-fish route exists without any net');
      if (g.switches.length) {
        const still = frozen(lvl), noEscape = E.plan(still, still.start, 0, new Set(), still.nets, false), noFull = E.plan(still, still.start, 0, new Set(), still.nets, true);
        line += ` | switches disabled: escape ${noEscape ? noEscape.moves : 'impossible'}, all fish ${noFull ? noFull.moves : 'impossible'}`;
        if (lvl.needsGate && (noEscape || noFull)) problems.push('gate change is not required');
      }
    }
    if (problems.length) failed++;
    log(`${problems.length ? 'FAIL' : 'ok  '} ${lvl.id} ${(PILOT_REGIONS.find(r => r.id === lvl.region) || { short: '?' }).short} ${lvl.name} ${role ? role.label : '?'} par ${lvl.par}` +
      (full ? ` | minimum ${full.moves} | allowance ${lvl.par - full.moves}` : '') + (escape ? ` | escape-only ${escape.moves}` : '') + line +
      (problems.length ? `\n     -> ${problems.join('; ')}` : ''));
  });
  log(failed ? `${failed} pilot canal(s) failed` : `all ${PILOT_LEVELS.length} pilot canals ok`);
  return failed;
}

if (require.main === module) process.exit(verifyPilot() ? 1 : 0);
module.exports = { verifyPilot };
