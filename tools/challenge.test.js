const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const E = require('../src/engine');
const F = require('../src/free');
const D = require('../src/daily');
const V = require('../src/variety');
const { replayPlan } = require('./replay-plan');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const date = n => new Date(Date.UTC(2026,9,14+n)).toISOString().slice(0,10);

test('v4 maps, targets and learning-limited families retain their pre-v5 fingerprints', () => {
  const free=[],daily=[];
  for(const learned of [[],['jet'],null]) {
    for(let n=0;n<40;n++)for(let i=0;i<3;i++)free.push(F.makeFree(n,i,4,learned));
    for(let n=0;n<21;n++)for(let i=0;i<3;i++)daily.push(D.makeDailyStage(date(n),i,4,learned));
  }
  assert.equal(hash(free),'0a4569d498a67c1af50f93d27e845aa2977ecf152e8dbc3da2e9f4c9794fea36');
  assert.equal(hash(daily),'1f6dd89625195c7c24bde63eff938859a5dff81809a6e009adb1476bc32115b3');
});

test('v5 keeps easy/normal free and daily maps identical to v4', () => {
  for(const learned of [[],['jet'],null])for(let n=0;n<30;n++)for(let i=0;i<2;i++) {
    assert.deepEqual(F.makeFree(n,i,5,learned).level,F.makeFree(n,i,4,learned).level);
    assert.deepEqual(D.makeDailyStage(date(n),i,5,learned).level,D.makeDailyStage(date(n),i,4,learned).level);
  }
});

test('v5 challenge has larger multi-area boards, spread fish, meaningful detours and only learned devices', () => {
  const families=new Set(),masks=new Set();
  for(const learned of [[],['jet'],null])for(let n=0;n<60;n++)for(const mode of ['free','daily']) {
    const run=mode==='free'?F.makeFree(n,2,5,learned):D.makeDailyStage(date(n),2,5,learned);
    assert.ok(run,`${mode}/${n}/${learned}`);
    const level=run.level,g=E.parseLevel(level),profile=V.VARIETY_FAMILIES[level.family];
    assert.ok(V.CHALLENGE_MASKS[level.maskId]);
    assert.ok(g.w>=10&&g.h>=13);assert.equal(g.fish.length,4);
    const xs=g.fish.map(p=>p[0]),ys=g.fish.map(p=>p[1]);
    assert.ok(Math.max(...xs)-Math.min(...xs)>=(g.w-2)*.45);
    assert.ok(Math.max(...ys)-Math.min(...ys)>=(g.h-2)*.45);
    assert.ok(V.varietyFamilyKnown(level.family,learned));
    const full=E.plan(g,g.start,0,new Set(),g.nets,true),escape=E.plan(g,g.start,0,new Set(),g.nets,false);
    replayPlan(g,full);replayPlan(g,escape,{needAll:false});
    assert.ok(full.moves>=14&&full.moves<=22);assert.equal(level.par,full.moves);
    assert.ok(escape.moves>=6&&full.moves-escape.moves>=4);
    if(profile.device)assert.ok(V.varietyRouteUse(g,full).used.has(profile.device));
    if(g.nets)assert.equal(E.plan(g,g.start,0,new Set(),0,true),null);
    if(mode==='free')assert.deepEqual(F.makeFree(n,2,5,null,level.family),run,'a saved family restores after learning more');
    else assert.deepEqual(D.makeDailyStage(date(n),2,5,learned),run);
    families.add(level.family);masks.add(level.maskId);
  }
  assert.equal(families.size,8);assert.equal(masks.size,8);
});
