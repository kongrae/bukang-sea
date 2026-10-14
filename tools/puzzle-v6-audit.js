const fs=require('node:fs'),F=require('../src/free'),D=require('../src/daily'),P=require('../src/puzzle-v6'),A=require('./puzzle-analysis');
const {shapeKey}=require('./variety-audit'),catalog=require('../src/puzzle-catalog-v6');
const V=require('../src/variety');
const rows=[];
for(const version of [5,6])for(const mode of ['free','daily'])for(let tier=0;tier<3;tier++) {
  let history=[],recent=[],previous=null,serialSeed=0;
  for(let seed=0;seed<60;seed++) {
    const date=new Date(Date.UTC(2026,9,15+seed)).toISOString().slice(0,10),start=performance.now();
    let run;
    if(mode==='free') {
      // Match startFree's production candidate rejection, not just raw seed outputs.
      for(let attempt=0;attempt<12;attempt++) {
        const candidate=F.makeFree(serialSeed++,tier,version,null,null,history),level=candidate?.level;
        if(!level||recent.includes(V.varietyLayoutKey(level)))continue;
        if(version<6&&attempt<8&&previous&&(previous.family===level.family||previous.maskId===level.maskId))continue;
        run=candidate;break;
      }
    }else run=D.makeDailyStage(date,tier,version,null);
    if(!run)throw Error(`No puzzle: ${version}/${mode}/${tier}/${seed}`);
    const ms=performance.now()-start,features=A.routeFeatures(run.level),classification=A.reasoningPattern(run.level,features);
    rows.push({version,mode,tier,seed,ms,level:run.level,...features,...classification,wall:A.wallFollower(run.level),shape:shapeKey(run.level.map)});
    if(version===6)history=[...history,P.v6History(run.level)].slice(-6);
    recent=[...recent,V.varietyLayoutKey(run.level)].slice(-6);previous=run.level;
  }
}
const stats=[];
for(const version of [5,6])for(const mode of ['free','daily'])for(let tier=0;tier<3;tier++) {
  const a=rows.filter(r=>r.version===version&&r.mode===mode&&r.tier===tier),ms=a.map(r=>r.ms).sort((a,b)=>a-b);
  stats.push({version,mode,tier,count:a.length,classified:a.filter(r=>r.type!=='unclassified').length,
    patterns:[...new Set(a.map(r=>r.type))],wall:a.filter(r=>r.wall).length,
    uniqueLayouts:new Set(a.map(r=>JSON.stringify(r.level.map))).size,uniqueShapes:new Set(a.map(r=>r.shape)).size,
    uniqueEventSequences:new Set(a.map(r=>r.signature)).size,
    adjacentPatternRepeats:a.slice(1).filter((r,i)=>r.type!=='unclassified'&&r.type===a[i].type).length,
    recentSixEventRepeats:a.filter((r,i)=>a.slice(Math.max(0,i-6),i).some(p=>p.signature===r.signature)).length,
    ms:{median:ms[30],p95:ms[57],max:ms.at(-1)}});
}
const representative=Object.keys(P.V6_PATTERNS).map(pattern=>{
  const tier={order:0,return:0,cross:1,current:1,sand:1,patrol:2,net:2,warp:2,relay:2}[pattern];
  const entry=catalog.find(p=>p.pattern===pattern&&p.tier===tier),level=P.v6Level(entry,F.freeTier(tier,6));
  return {id:entry.id,tier,pattern,level,solution:A.solve(level),features:A.routeFeatures(level),...A.reasoningPattern(level)};
});
fs.mkdirSync('outputs/qa/variety-v6',{recursive:true});fs.writeFileSync('outputs/qa/variety-v6/audit.json',JSON.stringify({method:'60 samples/tier/mode/version, all devices learned. Both free versions model production recent-board and family/mask rejection with sequential seed attempts; v6 also uses thinking history. Daily compares the same stage across dates, not consecutive stages. Counterfactuals and one shortest route are structural proxies, not human difficulty.',stats,representative,rows},null,2));
console.log(JSON.stringify(stats,null,2));
