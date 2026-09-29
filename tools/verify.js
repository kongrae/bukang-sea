// Checks every level: solvable, stored par == optimal par, and net levels really need their nets.
//   node tools/verify.js
const fs = require('fs');
const path = require('path');
const E = require('../src/engine.js');
const { measure } = require('./difficulty.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'levels.js'), 'utf8');
const { LEVELS, CHAPTERS } = new Function(src + '; return { LEVELS, CHAPTERS };')();

let failed = 0;
const chapterTotal = CHAPTERS.reduce((n, c) => n + c.count, 0);
if (chapterTotal !== LEVELS.length) { failed++; console.log(`FAIL chapters cover ${chapterTotal} levels but LEVELS has ${LEVELS.length}`); }
LEVELS.forEach((lvl, i) => {
  const g = E.parseLevel(lvl);
  const problems = [];
  if (!g.start) problems.push('no S');
  if (!g.cells.includes('E')) problems.push('no E');

  const full = E.plan(g, g.start, 0, new Set(), g.nets, true);      // all fish, nets allowed
  const escape = E.plan(g, g.start, 0, new Set(), g.nets, false);   // just get out
  if (!full) problems.push('cannot collect all fish and escape');
  else if (full.moves !== lvl.par) problems.push(`par is ${lvl.par} but optimal is ${full.moves}`);

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
    `${status} ${String(i + 1).padStart(2)} ${lvl.name.padEnd(10)} par ${lvl.par}` +
    (full && !problems.length ? ` | bits ${measure(lvl).bits}` : '') +
    (full ? ` | solution ${full.seq}${full.add.length ? ' nets@' + full.add.map(k => `(${k % g.w},${Math.floor(k / g.w)})`).join('') : ''}` : '') +
    (escape ? ` | escape-only ${escape.moves}` : '') + netNote +
    (problems.length ? `\n     -> ${problems.join('; ')}` : '')
  );
});
console.log(failed ? `\n${failed} level(s) failed` : `\nall ${LEVELS.length} levels ok`);
process.exit(failed ? 1 : 0);
