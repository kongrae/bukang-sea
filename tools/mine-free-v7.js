// Produces reviewable candidates under outputs; published content/version files are never overwritten.
const fs=require('node:fs'),C=require('./content-v7'),D=require('../src/daily'),V=require('../src/variety'),A=require('./puzzle-analysis');
const out='outputs/qa/story-v7/free-extra.json',rows=fs.existsSync(out)?JSON.parse(fs.readFileSync(out)):[],seen=new Set(rows.map(r=>r.id));
const buckets=[...['current','sand','patrol','net','warp','gate','crate'].map(p=>[0,p]),...[1,2].flatMap(t=>['gate','crate'].map(p=>[t,p]))];
const quota=8,counts=()=>Object.fromEntries(buckets.map(([t,p])=>[t+'/'+p,rows.filter(r=>r.tier===t&&r.pattern===p).length]));
function admit(l,tier,pattern){
  if(!l||seen.has(C.idFor(l)))return;
  const r=C.inspect(l,{min:[4,6,14][tier],max:[8,11,22][tier],escape:[2,3,6][tier],detour:[1,2,4][tier]});if(!r)return;
  if(pattern==='current'&&r.features.jets<1||pattern==='sand'&&r.features.sandTurns<1||pattern==='patrol'&&r.features.boatStops<1||pattern==='warp'&&r.features.warps<2)return;
  const same=rows.filter(p=>p.tier===tier&&p.pattern===pattern);if(same.filter(p=>p.signature===r.signature).length>=2||same.filter(p=>p.shape===r.shape).length>=3)return;
  seen.add(r.id);rows.push({...l,...r,tier,pattern,maskId:r.shape});
}
let seed=0;
for(;seed<100000;seed++) {
  const remaining=buckets.filter(([t,p])=>rows.filter(r=>r.tier===t&&r.pattern===p).length<quota);if(!remaining.length)break;
  for(const [tier,pattern] of remaining){
    const masks=tier===2?V.CHALLENGE_MASKS:{...D.MASKS,...V.VARIETY_MASKS},names=Object.keys(masks).filter(n=>!/(portal|island|moat|twin)/.test(n)),name=names[seed%names.length];
    const rand=D.rng(D.dailySeed('v7/'+tier+'/'+pattern+'/'+seed));admit(C.place(masks[name],pattern,tier,rand),tier,pattern);
  }
  if(seed%1000===0){fs.writeFileSync(out,JSON.stringify(rows,null,2));console.log(seed,counts());}
}
fs.writeFileSync(out,JSON.stringify(rows,null,2));console.log({seed,total:rows.length,counts:counts()});
