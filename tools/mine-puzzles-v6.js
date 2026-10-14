// Offline content selection, not runtime work. Frozen output is the v6 save contract.
const fs=require('node:fs'),V=require('../src/variety'),D=require('../src/daily'),F=require('../src/free'),A=require('./puzzle-analysis');
const crypto=require('node:crypto'),{shapeKey}=require('./variety-audit');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex').slice(0,12);
const rows=[],seen=new Set(),signatures=new Map(),counts={};
const quota=12,types=['order','return','cross','current','sand','patrol','net','warp','relay'];
function admit(level,tier) {
  const key=V.varietyLayoutKey(level);if(seen.has(key)||A.wallFollower(level))return;
  const solution=A.solve(level);if(!solution)return;
  const min=[4,6,14][tier],max=[8,11,22][tier];if(solution.moves<min||solution.moves>max)return;
  const escape=A.solve(level,false);if(!escape||escape.moves<[2,3,6][tier]||solution.moves-escape.moves<[1,2,4][tier])return;
  const f=A.routeFeatures(level,solution),{type,proof}=A.reasoningPattern(level,f);
  if(type==='unclassified')return;
  const bucket=`${tier}/${type}`,count=counts[bucket]||0;if(count>=quota)return;
  // Retain at most two instances of the same event sequence, and three of the same wall skeleton per bucket.
  const signature=f.signature,shape=shapeKey(level.map),group=signatures.get(bucket)||[];
  if(group.filter(r=>r.signature===signature).length>=2||group.filter(r=>r.shape===shape).length>=3)return;
  seen.add(key);group.push({signature,shape});signatures.set(bucket,group);counts[bucket]=count+1;
  rows.push({id:hash(key),tier,pattern:type,map:level.map,nets:level.nets||0,minimum:solution.moves,escape:escape.moves,
    maskId:level.maskId,signature,shape,route:solution.seq,steps:solution.steps,features:f,proof});
}
function complete(){return [0,1,2].every(t=>types.filter(k=>t>0||['order','return','cross'].includes(k)).every(k=>(counts[`${t}/${k}`]||0)>=10));}
let seed=0;
// Optional incremental mining rechecks all retained candidates against the current acceptance contracts.
if(process.argv.includes('--resume')&&fs.existsSync('outputs/qa/variety-v6/mining-partial.json')) {
  for(const p of JSON.parse(fs.readFileSync('outputs/qa/variety-v6/mining-partial.json')))admit(p,p.tier);
}
for(;seed<10000&&!complete();seed++) {
  for(let tier=0;tier<3;tier++) {
    // Existing masks are candidates only; all new contracts below are independently checked.
    for(const learned of [[],null]) {
      const r=F.makeFree(seed,tier,5,learned);if(r)admit(r.level,tier);
    }
    if(tier>0) {
      const keys=Object.keys(tier===2?V.CHALLENGE_MASKS:V.VARIETY_MASKS).filter(k=>!/(portal|island)/.test(k));
      const masks=tier===2?V.CHALLENGE_MASKS:V.VARIETY_MASKS,maskId=keys[seed%keys.length];
      for(const kind of ['net','warp','relay']) {
        if((counts[`${tier}/${kind}`]||0)>=quota)continue;
        const spec={buoys:2,fish:tier===2?4:3,...(kind==='warp'?{whirls:1}:kind==='relay'?{sand:2,jets:2}:{})};
        const map=D.place(masks[maskId],spec,D.rng(D.dailySeed(`mine-v6-${tier}-${kind}-${seed}`)));
        admit({map,nets:kind==='net'?1:0,maskId},tier);
      }
    }
  }
  if(seed%100===0)console.log(seed,JSON.stringify(counts));
  if(seed%500===0)fs.writeFileSync('outputs/qa/variety-v6/mining-partial.json',JSON.stringify(rows));
}
fs.writeFileSync('outputs/qa/variety-v6/catalog-evidence.json',JSON.stringify({seed,counts,rows},null,2));
const compact=rows.map(({id,tier,pattern,map,nets,minimum,escape,maskId,signature,shape})=>({id,tier,pattern,map,nets,minimum,escape,maskId,signature,shape}));
// Published catalogs must not be overwritten: review candidates and introduce a new version for future content.
fs.writeFileSync('outputs/qa/variety-v6/candidate-catalog.js','/* Candidate content; do not overwrite the published v6 contract. */\nconst PUZZLE_CATALOG_V6 = '+JSON.stringify(compact,null,2)+';\nif(typeof module!==\'undefined\')module.exports=PUZZLE_CATALOG_V6;\n');
console.log(JSON.stringify({seed,count:rows.length,counts,complete:complete()}));
