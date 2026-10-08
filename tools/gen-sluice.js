// Big sluice canal generator (chapter 6 redesign, 2026-10-08): rooms joined by one-tile doors where gates sit, so a route
// has to open, pass and close gates (press the switch two or more times). Every candidate is solved with the live rules.
//   node tools/gen-sluice.js '<spec json>' [seed] [tries] [out.json]
//   spec: { masks:[names], min:[lo,hi], escape:[lo,hi], presses:n, fish:[lo,hi], buoys:[lo,hi], switches:[lo,hi], gates:[lo,hi],
//           jets, boats, vboats, sand, whirls, nets, use:[devices that the best route must use] }
//   e.g. node tools/gen-sluice.js '{"masks":["airlock","ring"],"min":[10,12],"presses":2,"fish":[2,2]}' 12 300000 out.json
// Masks are 10x12 at most (34px tiles on a 360x640 phone). Pick distinct masks per canal: verify rejects repeated wall layouts.
// Kept candidates also pass: escape shorter than the full route, no route with switches frozen, nets needed, devices used.
const E = require('../src/engine.js'), V = require('../src/variety.js'), { rng } = require('../src/daily.js');
const MASKS = {
  "airlock": [
   "####E#####",
   "#........#",
   "#........#",
   "#........#",
   "####.#####",
   "#........#",
   "#........#",
   "#........#",
   "#####.####",
   "#........#",
   "#........#",
   "####S#####"
  ],
  "eastwest": [
   "##########",
   "#....#...#",
   "#....#...#",
   "#........E",
   "#....#...#",
   "#....#...#",
   "#....#...#",
   "###.######",
   "#........#",
   "#........#",
   "#........#",
   "####S#####"
  ],
  "ring": [
   "##########",
   "#........#",
   "#.######.#",
   "#.#....#.#",
   "#.#....#.#",
   "#........E",
   "#.#....#.#",
   "#.#....#.#",
   "#.######.#",
   "#........#",
   "#........#",
   "####S#####"
  ],
  "cells": [
   "#####E####",
   "#...#....#",
   "#...#....#",
   "#........#",
   "#...#....#",
   "##.###.###",
   "#...#....#",
   "#........#",
   "#...#....#",
   "##.#######",
   "#........#",
   "##S#######"
  ],
  "ladder": [
   "########E#",
   "#....#...#",
   "#....#...#",
   "#.....#..#",
   "#....#...#",
   "#....#...#",
   "##.####.##",
   "#........#",
   "#..#..#..#",
   "#........#",
   "#........#",
   "#S########"
  ],
  "courtyard": [
   "##########",
   "E...#....#",
   "#...#....#",
   "#...#....#",
   "#........#",
   "#...#....#",
   "###.###.##",
   "#........#",
   "#........#",
   "#..##....#",
   "#........#",
   "######S###"
  ],
  "smallLock": [
   "####E#####",
   "#........#",
   "#........#",
   "####.#####",
   "#........#",
   "#........#",
   "#####.####",
   "#........#",
   "#........#",
   "####S#####"
  ],
  "sideRooms": [
   "##########",
   "#...#....#",
   "#...#....E",
   "#........#",
   "#...#....#",
   "#...##.###",
   "#........#",
   "#...#....#",
   "#...#....#",
   "#.......##",
   "#...#....#",
   "####S#####"
  ],
  "twinLocks": [
   "#####E####",
   "#...#....#",
   "#...#....#",
   "#...#....#",
   "#........#",
   "#...#....#",
   "##.####.##",
   "#...#....#",
   "#........#",
   "#...#....#",
   "#...#....#",
   "####S#####"
  ],
  "basin": [
   "##########",
   "#........#",
   "#........E",
   "#...##...#",
   "#...##...#",
   "#........#",
   "####.#####",
   "#........#",
   "#........#",
   "#..##....#",
   "#........#",
   "#####S####"
  ],
  "cross": [
   "####E#####",
   "#........#",
   "#.##.###.#",
   "#........#",
   "#........#",
   "####.#####",
   "#........#",
   "#........#",
   "#.###.##.#",
   "#........#",
   "#........#",
   "#S########"
  ],
  "terrace": [
   "##########",
   "#......#.E",
   "#......#.#",
   "#......#.#",
   "#........#",
   "###.######",
   "#........#",
   "#........#",
   "#.#....#.#",
   "#........#",
   "#........#",
   "####S#####"
  ]
};
const [specJson, seedArg = '1', triesArg = '20000', out = 'sluice-candidates.json', debug] = process.argv.slice(2);
if (!specJson) { console.log('usage: node tools/gen-sluice.js <spec json> [seed] [tries] [out.json]'); console.log('masks:', Object.keys(MASKS).join(', ')); process.exit(1); }
const spec = JSON.parse(specJson), rand = rng(+seedArg), tries = +triesArg;
const between = ([lo, hi]) => lo + Math.floor(rand() * (hi - lo + 1));
const at = (mask, x, y) => mask[y]?.[x] ?? '#';
function corridorCells(mask) {
  const cells = [];
  mask.forEach((r, y) => [...r].forEach((c, x) => {
    if (c !== '.' || y === 0 || x === 0 || y === mask.length - 1 || x === r.length - 1) return;
    const wall = (dx, dy) => at(mask, x + dx, y + dy) === '#';
    if ((wall(-1, 0) && wall(1, 0) && !wall(0, -1) && !wall(0, 1)) || (wall(0, -1) && wall(0, 1) && !wall(-1, 0) && !wall(1, 0))) cells.push([x, y]);
  }));
  return cells;
}
const results = [], seen = new Set(), why = {}, no = k => { why[k] = (why[k] || 0) + 1; };
const t0 = Date.now();
for (let t = 0; t < tries; t++) {
  const name = spec.masks[Math.floor(rand() * spec.masks.length)], mask = MASKS[name], rows = mask.map(r => [...r]);
  const doors = corridorCells(mask), isDoor = (x, y) => doors.some(([dx, dy]) => dx === x && dy === y), free = [];
  mask.forEach((r, y) => [...r].forEach((c, x) => { if (c === '.' && !isDoor(x, y)) free.push([x, y]); }));
  const take = (list, cell) => { const k = list.findIndex(([x, y]) => x === cell[0] && y === cell[1]); if (k >= 0) list.splice(k, 1); };
  const pick = list => list.splice(Math.floor(rand() * list.length), 1)[0];
  const nGates = Math.min(doors.length, between(spec.gates || [1, 2]));
  if (!nGates) continue;
  const doorPool = doors.slice();
  for (let k = 0; k < nGates; k++) { const [x, y] = pick(doorPool); rows[y][x] = k === 0 || rand() < 0.5 ? 'G' : 'g'; }
  // switches go where a slide can end (next to a wall); the first one inside the area open at the start
  const open = new Set(), stack = [];
  mask.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'S') stack.push([x, y]); }));
  while (stack.length) { const [x, y] = stack.pop(), k = x + ',' + y; if (open.has(k)) continue; const c = rows[y]?.[x];
    if (!c || c === '#' || c === 'G') continue; open.add(k); stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
  const edge = free.filter(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(mask, x + dx, y + dy) === '#'));
  const firstPool = edge.filter(([x, y]) => open.has(x + ',' + y));
  for (let k = between(spec.switches || [1, 1]), first = true; k > 0; k--, first = false) {
    const pool = first ? firstPool : edge; if (!pool.length) break;
    const cell = pick(pool); take(free, cell); take(edge, cell); rows[cell[1]][cell[0]] = 'p';
  }
  const put = (ch, n) => { for (let k = 0; k < n && free.length; k++) { const [x, y] = pick(free); rows[y][x] = typeof ch === 'function' ? ch() : ch; } };
  put('o', between(spec.buoys || [2, 3]));
  put(() => '<>^v'[Math.floor(rand() * 4)], spec.jets || 0); put('b', spec.boats || 0); put('B', spec.vboats || 0);
  put('s', spec.sand || 0); put('w', spec.whirls ? 2 : 0); put('f', between(spec.fish || [2, 3]));
  const map = rows.map(r => r.join('')), key = map.join('');
  if (seen.has(key) || map.some(r => /><|<>/.test(r))) continue;
  seen.add(key);
  let g; try { g = E.parseLevel({ map, nets: spec.nets || 0 }); } catch (e) { no('parse'); continue; }
  const full = E.plan(g, g.start, 0, new Set(), g.nets, true);
  if (!full) {
    const e = E.plan(g, g.start, 0, new Set(), g.nets, false);
    no(e ? 'fish-unreachable' : 'no-escape');
    if (debug && !e && why['no-escape'] <= 2) console.log(map.join('\n') + '\n');
    continue;
  }
  if (full.moves < spec.min[0] || full.moves > spec.min[1]) { no('range'); continue; }
  let pos = g.start, boats = g.boats, gate = 0, presses = 0;
  for (const s of full.steps) { const r = E.turn(g, pos, s.dir, new Set(s.nets), boats, gate); if (r.pressed) presses++; pos = r.end; boats = r.boats; gate = r.gate; }
  if (presses < (spec.presses || 1)) { no('presses ' + presses); continue; }
  const escape = E.plan(g, g.start, 0, new Set(), g.nets, false);
  if (!escape || escape.moves >= full.moves || spec.escape && (escape.moves < spec.escape[0] || escape.moves > spec.escape[1])) { no('escape'); continue; }
  const still = E.parseLevel({ map, nets: g.nets }); still.switches = [];
  if (E.plan(still, still.start, 0, new Set(), still.nets, false) || E.plan(still, still.start, 0, new Set(), still.nets, true)) { no('gate not needed'); continue; }
  if (g.nets && E.plan(g, g.start, 0, new Set(), 0, true)) { no('net not needed'); continue; }
  const used = V.varietyRouteUse(g, full).used;
  if ((spec.use || []).some(d => !used.has(d))) { no('device unused'); continue; }
  const objects = map.join('').replace(/[#.SE]/g, '').length;
  results.push({ name, map, min: full.moves, escape: escape.moves, presses, objects, seq: full.seq, steps: full.steps });
}
results.sort((a, b) => b.presses - a.presses || a.objects - b.objects || (b.min - b.escape) - (a.min - a.escape));
require('fs').writeFileSync(out, JSON.stringify(results.slice(0, 40)));
console.log(JSON.stringify(why));
console.log(out, 'found', results.length, 'in', tries, 'tries', Math.round((Date.now() - t0) / 1000) + 's');
for (const c of results.slice(0, 3)) console.log(`${c.name} min ${c.min} esc ${c.escape} presses ${c.presses} objects ${c.objects} ${c.seq}\n  ${c.map.join('\n  ')}`);
