// Reproducible content diagnostics. These structural proxies do not measure human difficulty or fun.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const E = require('../src/engine');
const V = require('../src/variety');
const D = require('../src/daily');
const F = require('../src/free');
const levels = new Function(fs.readFileSync(path.join(__dirname, '../src/levels.js'), 'utf8') + ';return LEVELS;')();
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
function shapeKey(map) {
  let grid = map.map(row => [...row].map(c => c === '#' ? '#' : '.'));
  const keys = [];
  for (let r = 0; r < 4; r++) {
    keys.push(grid.map(row => row.join('')).join('/'), grid.map(row => row.slice().reverse().join('')).join('/'));
    grid = grid[0].map((_, x) => grid.map(row => row[x]).reverse());
  }
  return hash(keys.sort()[0]);
}
function inspect(level) {
  const g = E.parseLevel(level), full = E.plan(g, g.start, 0, new Set(), g.nets, true), escape = E.plan(g, g.start, 0, new Set(), g.nets, false);
  const used = full ? V.varietyRouteUse(g, full).used : new Set(), stops = [], fishOrder = [], placements = new Set();
  let pos = g.start, boats = g.boats, mask = 0, netChanges = 0, lastNets = '[]';
  for (const step of full?.steps || []) {
    const key = JSON.stringify(step.nets.slice().sort((a,b)=>a-b));
    if (key !== lastNets) { netChanges++; lastNets = key; }
    if (step.nets.length) placements.add(key);
    const r = E.slide(g, pos, step.dir, new Set(step.nets), boats);
    for (const [x,y] of r.path) {
      const c = E.cellAt(g,x,y); if ('^v<>sw'.includes(c)) used.add(c === 'w' ? 'warp' : c === 's' ? 'sand' : 'jet');
      g.fish.forEach(([fx,fy],i)=>{if(x===fx&&y===fy&&!(mask&(1<<i))){mask|=1<<i;fishOrder.push(i);}});
    }
    pos = r.end; stops.push(pos.join(','));
    if (!r.win) boats = E.stepBoats(g,boats,pos[1]*g.w+pos[0],new Set(step.nets));
  }
  const counts = {}; for(const c of level.map.join('')) if ('obB^v<>swf'.includes(c)) counts[c]=(counts[c]||0)+1;
  return {name:level.name,role:level.role||'regular',idea:level.idea||null,family:level.family||null,shape:shapeKey(level.map),layout:hash([level.map,g.nets]),
    size:`${g.w}x${g.h}`,counts,nets:g.nets,full:full?.moves??null,escape:escape?.moves??null,detour:full&&escape?full.moves-escape.moves:null,
    route:full?.seq,steps:full?.steps,used:[...used].sort(),revisitedStops:stops.length-new Set(stops).size,netChanges,netPlacements:placements.size,fishOrder};
}
function summary(rows) {
  const count = key => Object.fromEntries([...new Set(rows.map(r=>r[key]))].sort().map(k=>[k,rows.filter(r=>r[key]===k).length]));
  const repeats = key => rows.slice(1).filter((r,i)=>r[key]===rows[i][key]).length;
  const ms=rows.map(r=>r.ms).filter(Number.isFinite).sort((a,b)=>a-b);
  return {samples:rows.length,uniqueShapes:new Set(rows.map(r=>r.shape)).size,uniqueLayouts:new Set(rows.map(r=>r.layout)).size,
    uniqueRoutes:new Set(rows.map(r=>r.route)).size,adjacentShapeRepeats:repeats('shape'),adjacentLayoutRepeats:repeats('layout'),
    fallback:rows.filter(r=>r.fallback).length,minimumMoves:count('full'),families:count('family'),
    generationMs:ms.length?{median:ms[Math.floor(ms.length*.5)],p95:ms[Math.floor(ms.length*.95)],max:ms.at(-1)}:null};
}
if (require.main === module) {
  const out = process.argv[2] || 'outputs/variety/audit.json', rows = levels.map((l,i)=>({stage:i+1,...inspect(l)}));
  const generated = {daily:[],free:[]};
  for (let difficulty=0;difficulty<3;difficulty++) {
    for(let seed=0;seed<90;seed++) {
      const t=performance.now(),run=F.makeFree(seed,difficulty),ms=+(performance.now()-t).toFixed(2);
      generated.free.push({difficulty,seed,version:run.version,fallback:!!run.fallback,ms,...inspect(run.level)});
    }
    for(let n=0;n<28;n++) {
      const date=new Date(Date.UTC(2026,9,2+n)).toISOString().slice(0,10),t=performance.now(),run=D.makeDailyStage(date,difficulty),ms=+(performance.now()-t).toFixed(2);
      generated.daily.push({difficulty,date,version:run.version,fallback:!!run.fallback,ms,...inspect(run.level)});
    }
  }
  const stats={story:summary(rows),free:[0,1,2].map(d=>summary(generated.free.filter(r=>r.difficulty===d))),daily:[0,1,2].map(d=>summary(generated.daily.filter(r=>r.difficulty===d)))};
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({method:'Shapes normalize rotations/reflections of walls only, not dynamic equivalence. Routes are one shortest full-collection solution, not unique ideas.',stats,story:rows,generated,levels},null,2));
  console.log(JSON.stringify(stats,null,2));
}
module.exports={inspect,shapeKey,summary};
