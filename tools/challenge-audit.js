// Structural difficulty and generation timing; these metrics do not establish human difficulty or fun.
const fs=require('node:fs'),path=require('node:path');
const F=require('../src/free'),D=require('../src/daily');
const {inspect,summary}=require('./variety-audit');
const out=process.argv[2]||'outputs/qa/challenge/audit.json',rows=[];
for(const version of [4,5])for(const mode of ['free','daily'])for(let n=0;n<(mode==='free'?300:90);n++) {
  const date=new Date(Date.UTC(2026,9,14+n)).toISOString().slice(0,10),t=performance.now();
  const run=mode==='free'?F.makeFree(n,2,version):D.makeDailyStage(date,2,version),ms=+(performance.now()-t).toFixed(2);
  if(!run)throw Error(`Generation failed: ${mode}/${version}/${n}`);
  rows.push({mode,version,seed:mode==='free'?n:date,ms,fallback:!!run.fallback,...inspect(run.level)});
}
const range=(a,key)=>[Math.min(...a.map(r=>r[key])),Math.max(...a.map(r=>r[key]))];
const stats={};
for(const version of [4,5])for(const mode of ['free','daily']) {
  const sample=rows.filter(r=>r.mode===mode&&r.version===version);
  stats[`${mode}V${version}`]={...summary(sample),sizes:[...new Set(sample.map(r=>r.size))].sort(),
    fullRange:range(sample,'full'),escapeRange:range(sample,'escape'),detourRange:range(sample,'detour'),
    fishCounts:[...new Set(sample.map(r=>r.counts.f))].sort()};
}
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({stats,rows},null,2));
console.log(JSON.stringify(stats,null,2));
