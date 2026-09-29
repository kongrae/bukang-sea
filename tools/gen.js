// Level generator: drops objects into a canal mask at random and keeps the candidate
// whose optimal solution length is closest to the target.
//   node tools/gen.js <mask> '<spec json>' <targetPar> [seed] [tries]
//   e.g. node tools/gen.js basin '{"buoys":3,"jets":2,"fish":2}' 8 42 2000
// spec keys: buoys, boats, jets, fish, nets (nets = how many the player gets; the level must need them),
//            bits (optional target difficulty from tools/difficulty.js; when set it outranks targetPar)
//   e.g. node tools/gen.js lagoon '{"buoys":3,"jets":2,"fish":3,"bits":16}' 11 7 800
const E = require('../src/engine.js');
const { measure } = require('./difficulty.js');

// '#' promenade, '.' water, S start, E sea exit
const masks = {
  bend:   ['###E###', '##...##', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '##...##', '###S###'],
  hook:   ['#####E#', '#.....#', '#.....#', '#..####', '#..####', '#.....#', '#.....#', '#.....#', '##S####'],
  wide:   ['#E#####', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '####S##'],
  scurve: ['######E', '#......', '#......', '#...###', '#...###', '###...#', '###...#', '#.....#', '#.....#', '##S####'],
  basin:  ['###E###', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '###S###'],
  // chapter 2: 친수공원 운하
  island: ['###E###', '#.....#', '#.....#', '#..#..#', '#..#..#', '#.....#', '#.....#', '#..#..#', '#.....#', '###S###'],
  ring:   ['####E##', '#.....#', '#.....#', '#..##.#', '#..##.#', '#.....#', '#.....#', '##S####'],
  zigzag: ['#####E#', '#.....#', '#.....#', '#...###', '#.....#', '###...#', '#.....#', '#...###', '#.....#', '#.....#', '#S#####'],
  side:   ['#######', '#.....#', '#.....E', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '###S###'],
  fork:   ['###E####', '#......#', '#......#', '#..##..#', '#..##..#', '#..##..#', '#......#', '#......#', '####S###'],
  // chapter 3: 방파제 너머
  harbor: ['####E####', '#.......#', '#.......#', '#..###..#', '#.......#', '#.......#', '#.......#', '##.....##', '#.......#', '#.......#', '####S####'],
  breakwater: ['########', 'E......#', '#......#', '####...#', '#......#', '#......#', '#...####', '#......#', '#......#', '#......#', '#......#', '######S#'],
  lagoon: ['#######E#', '#.......#', '#.......#', '#.##....#', '#.##....#', '#.......#', '#....##.#', '#....##.#', '#.......#', '#S#######'],
};

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function place(mask, spec, rand) {
  const rows = mask.map(r => r.split(''));
  const free = [];
  rows.forEach((r, y) => r.forEach((c, x) => { if (c === '.') free.push([x, y]); }));
  const put = (ch, n) => {
    for (let i = 0; i < n && free.length; i++) {
      const [x, y] = free.splice(Math.floor(rand() * free.length), 1)[0];
      rows[y][x] = typeof ch === 'function' ? ch() : ch;
    }
  };
  put('o', spec.buoys || 0);
  put('b', spec.boats || 0);
  put(() => '<>^v'[Math.floor(rand() * 4)], spec.jets || 0);
  put('f', spec.fish || 0);
  return rows.map(r => r.join(''));
}

function solve(map, nets, needAll) {
  const g = E.parseLevel({ name: 'gen', map, nets });
  return E.plan(g, g.start, 0, new Set(), nets, needAll);
}

function search(maskName, spec, target, seed = 1, tries = 2000) {
  if (!masks[maskName]) throw new Error(`unknown mask "${maskName}". options: ${Object.keys(masks).join(', ')}`);
  const rand = rng(seed);
  const nets = spec.nets || 0;
  let best = null;
  for (let t = 0; t < tries; t++) {
    const map = place(masks[maskName], spec, rand);
    const full = solve(map, nets, true);
    if (!full) continue;
    if (nets) {
      if (solve(map, 0, false)) continue;                 // must be impossible to escape with no nets
      if (nets === 2 && solve(map, 1, false)) continue;   // ...and with only one
    }
    const escape = solve(map, nets, false);
    let score = -Math.abs(full.moves - target) * 10 + (full.moves - escape.moves), bits;
    if (spec.bits != null) {
      bits = measure({ map, nets, par: full.moves }).bits;
      score = -Math.abs(bits - spec.bits) * 20 - Math.abs(full.moves - target) + (full.moves - escape.moves) * 0.5;
    }
    if (!best || score > best.score) best = { score, map, par: full.moves, seq: full.seq, escapeOnly: escape.moves, bits };
  }
  return best;
}

if (require.main === module) {
  const [maskName, specJson = '{}', target = '6', seed = '1', tries = '2000'] = process.argv.slice(2);
  if (!maskName) { console.log('usage: node tools/gen.js <mask> \'<spec json>\' <targetPar> [seed] [tries]\nmasks:', Object.keys(masks).join(', ')); process.exit(1); }
  const best = search(maskName, JSON.parse(specJson), +target, +seed, +tries);
  if (!best) { console.log('no solvable candidate found; try another seed or fewer objects'); process.exit(1); }
  console.log(`par ${best.par} (solution ${best.seq}), escape-only ${best.escapeOnly}${best.bits != null ? `, bits ${best.bits}` : ''}\n`);
  console.log(`  { par: ${best.par}, name: '새 수로', tip: '', map: [\n${best.map.map(r => `    '${r}',`).join('\n')}\n  ] },`);
}

module.exports = { masks, search };
