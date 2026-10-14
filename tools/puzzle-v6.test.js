const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const F=require('../src/free'),D=require('../src/daily'),E=require('../src/engine'),P=require('../src/puzzle-v6'),catalog=require('../src/puzzle-catalog-v6');
const A=require('./puzzle-analysis'),{replayPlan}=require('./replay-plan');
test('the published v6 catalog is immutable for dated operations and saved ids',()=>{
  assert.equal(catalog.length,250);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(catalog)).digest('hex'),'371a9a2c19a91fa3a5f68722815479829f55d0666799b5f545323f4b0c11e2a1');
});
test('v5 outputs retain their pre-v6 fingerprint across learning stages, free tiers and dates',()=>{
  const hash=crypto.createHash('sha256');
  for(const learned of [[],['jet'],null])for(let i=0;i<3;i++)for(let n=0;n<40;n++)for(const mode of ['free','daily']) {
    const date=new Date(Date.UTC(2026,9,15+n)).toISOString().slice(0,10);
    hash.update(JSON.stringify(mode==='free'?F.makeFree(n,i,5,learned):D.makeDailyStage(date,i,5,learned)));
  }
  assert.equal(hash.digest('hex'),'a41c50fe0f6fead3c26623b0cbaa4536b18d000c5a17749a32e9d3cae689b24b');
});
test('every v6 candidate replays and meets its actual reasoning contract, not just a move target',()=>{
  const ids=new Set();
  for(const p of catalog) {
    assert(!ids.has(p.id));ids.add(p.id);
    const full=A.solve(p),escape=A.solve(p,false),g=E.parseLevel(p),f=A.routeFeatures(p,full);
    replayPlan(g,full);replayPlan(g,escape,{needAll:false});assert.equal(full.moves,p.minimum);assert.equal(escape.moves,p.escape);
    assert.equal(f.signature,p.signature);assert.equal(A.wallFollower(p),false);
    const matters=kind=>{const cost=A.counterfactual(p,kind);assert.ok(cost===null||Number.isInteger(cost)&&cost>=p.minimum+2,`${p.id}/${kind}`);};
    if(p.pattern==='order') {const costs=A.firstFishCosts(p),other=costs.filter(n=>n!==p.minimum);assert.equal(costs.filter(n=>n===p.minimum).length,1);assert(other.some(Number.isInteger));assert(other.every(n=>n===null||n>=p.minimum+2));}
    if(p.pattern==='return')assert.ok(f.returns>=1);
    if(p.pattern==='cross')assert.ok(f.crossings>=2&&f.returns===0);
    if(p.pattern==='current'){assert.ok(f.jets>=2);matters('jet');}
    if(p.pattern==='sand'){assert.ok(f.sandTurns>=1);matters('sand');}
    if(p.pattern==='patrol'){assert.ok(f.boatStops>=1);matters('boat');}
    if(p.pattern==='net')assert.equal(A.counterfactual(p,'net'),null);
    if(p.pattern==='warp'){assert.ok(f.warps>=3);matters('warp');}
    if(p.pattern==='relay'){assert.ok(f.jets>=1&&f.sandTurns>=1);matters('jet');matters('sand');}
  }
});
test('v6 selection avoids recent six boards and two patterns; a kept id survives learning and history changes',()=>{
  for(const learned of [[],['jet'],['jet','boat','net'],null])for(let tier=0;tier<3;tier++) {
    let history=[];
    for(let seed=0;seed<60;seed++) {
      const run=F.makeFree(seed,tier,6,learned,null,history);assert.ok(run);
      const l=run.level;assert(!history.slice(-6).some(r=>r.id===l.puzzleId));assert(!history.slice(-2).some(r=>r.pattern===l.family));
      assert(!history.slice(-6).some(r=>r.signature===l.thinking),'enough distinct event sequences to avoid recent repeats');
      assert(P.V6_PATTERNS[l.family].need.every(d=>!learned||learned.includes(d)));
      const restored=F.makeFree(seed,tier,6,[],l.family,[],l.puzzleId);assert.deepEqual(restored,run);
      history=[...history,P.v6History(l)].slice(-6);
    }
  }
  assert.equal(F.makeFree(1,0,6,[],null,[],'missing'),null);
});
test('a v6 daily offers three different reasoning patterns and stable targets with any learning snapshot',()=>{
  const fingerprint=crypto.createHash('sha256');
  for(const learned of [[],['jet'],['jet','boat','net'],null])for(let n=0;n<45;n++) {
    const date=new Date(Date.UTC(2026,9,15+n)).toISOString().slice(0,10),patterns=[];
    for(let stage=0;stage<3;stage++) {
      const r=D.makeDailyStage(date,stage,6,learned);assert.ok(r,`${date}/${stage}`);fingerprint.update(JSON.stringify(r));
      assert.deepEqual(D.makeDailyStage(date,stage,6,learned),r);assert(!patterns.includes(r.level.family));patterns.push(r.level.family);
      assert(P.V6_PATTERNS[r.level.family].need.every(d=>!learned||learned.includes(d)));
      const c=catalog.find(p=>p.id===r.level.puzzleId);assert(c.minimum>=r.tier.min&&c.minimum<=r.tier.max);assert.equal(r.level.par,c.minimum+r.tier.slack);
    }
  }
  assert.equal(fingerprint.digest('hex'),'1a3993ff795b7140dbc120463e433fae10e369576be53b72d63ca7aa01ad53c3','published v6 daily selection is a restore contract; use a new version for changes');
});
