const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const E = require('../src/engine');
const D = require('../src/daily');
const F = require('../src/free');
const V = require('../src/variety');
const reserves = require('../src/variety-reserves');
const { replayPlan } = require('./replay-plan');
const { shapeKey } = require('./variety-audit');
const read = name => fs.readFileSync(path.join(__dirname, '../src', name + '.js'), 'utf8');
const source = read('game');
const { LEVELS, LEGACY_STORY_LEVELS, STORY_ORDER } = new Function(read('levels') + ';return {LEVELS,LEGACY_STORY_LEVELS,STORY_ORDER};')();
const fn = name => source.match(new RegExp(`^function ${name}\\([^\\n]*}\\s*$`, 'm'))?.[0]
  || source.match(new RegExp(`function ${name}\\([^]*?\\n}`))?.[0];
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('v1 free seeds preserve the 270 pre-update layout fingerprints', () => {
  const expected = ['1706cc981d6ee8cf1ad38d69ad496bb5c13013bafb8847c04a1d32e6c1eac265',
    '29ca1ef8c71b48c92826c3dfbe0f752598d8ded483467aec866abf691177c1cd',
    '7bf4eee193abcdefff062291039d8495083ccf6a189a50bee56449df8d280dcb'];
  for (let difficulty = 0; difficulty < 3; difficulty++) {
    const layouts = Array.from({length:90}, (_,seed) => {
      const run = F.makeFree(seed,difficulty,1);
      assert.equal(run.version,1);
      return hash([run.level.map,run.level.nets||0]).slice(0,16);
    });
    assert.equal(hash(layouts),expected[difficulty]);
  }
});

test('every reserve replays with its recorded minimum (net pickup rule); active devices and required net reuse are verified', () => {
  assert.equal(new Set(reserves.map(V.varietyLayoutKey)).size,reserves.length);
  for (const level of reserves) {
    const g=E.parseLevel(level),full=E.plan(g,g.start,0,new Set(),g.nets,true,undefined,undefined,true),escape=E.plan(g,g.start,0,new Set(),g.nets,false,undefined,undefined,true);
    replayPlan(g,full,{pickup:true});replayPlan(g,escape,{needAll:false,pickup:true});
    assert.equal(full.moves,level.minimum);assert.equal(escape.moves,level.escape);assert.ok(full.moves>escape.moves);
    const active=V.varietyRouteUse(g,full),profile=V.VARIETY_FAMILIES[level.family];
    if(profile.device)assert.ok(active.used.has(profile.device),level.family);
    if(g.nets){assert.equal(E.plan(g,g.start,0,new Set(),0,true),null);assert.ok(active.edits>=2);}
  }
  // Force exhaustion. Every scheduled family has a playable, in-band reserve independent of search luck.
  const deps={rng:D.rng,MASKS:D.MASKS,place:D.place,operationPlan:D.operationPlan};
  const cases=[...F.FREE_TIERS.flatMap(tier=>tier.families.map(family=>({tier,family}))),
    ...V.VARIETY_DAILY_THEMES.flatMap(theme=>theme.families.map((family,i)=>({tier:D.DAILY_STAGES[i],family})))];
  for(const {tier,family} of cases) {
    const search=V.variedCanalSearch(123,family,tier,deps,reserves,0),level=search.next().value;
    assert.ok(level?.fallback,family);assert.ok(level.minimum>=tier.min&&level.minimum<=tier.max&&level.escape>=tier.escape);
    // reserves were rated with net pickup, so the set-net rule (v4) never falls back to a net reserve
    const placed=V.variedCanalSearch(123,family,tier,{...deps,placedNets:true},reserves,0).next().value;
    if(family==='net')assert.equal(placed,null);else assert.deepEqual(placed,level);
  }
});

test('published v2 free layouts and star targets have a stable compatibility fingerprint', () => {
  const digest=crypto.createHash('sha256');
  for(let seed=0;seed<90;seed++)for(let difficulty=0;difficulty<3;difficulty++) {
    const {level}=F.makeFree(seed,difficulty,2);digest.update(JSON.stringify([level.map,level.nets||0,level.par]));
  }
  assert.equal(digest.digest('hex'),'2c7a08742e29bbdcd93e4b76cd38ccc1b40862144e7f159121d2477d85688311');
});

test('dedup normalizes arrow direction under rotations/mirrors, but retains boat direction differences', () => {
  const level={map:['#E###','#.^.#','#..S#','#####'],nets:0};
  const arrow={'^':'>','>':'v','v':'<','<':'^'};
  const rotated={map:level.map[0].split('').map((_,x)=>level.map.map(row=>arrow[row[x]]||row[x]).reverse().join(''))};
  assert.equal(V.varietyLayoutKey(level),V.varietyLayoutKey(rotated));
  assert.notEqual(V.varietyLayoutKey(level),V.varietyLayoutKey({...rotated,nets:1}));
  const a={map:['#E###','#b..#','#S..#','#####']},b={map:['###E#','#..b#','#..S#','#####']};
  assert.notEqual(V.varietyLayoutKey(a),V.varietyLayoutKey(b));
});

test('all twelve old story sessions resume and retry their old board, while new entry uses the new board', () => {
  const names=['levelSignature','copyTurn','restoreSession','storyLevel','storySession','freshState','loadLevel'];
  const harness=new Function('stored','index',`${read('engine')}\n${read('levels')}
    const save=stored,unlocked=()=>true,chapterOf=()=>({ci:0});
    let LVL=0,DAILY=null,FREE=null,PILOT=null,STORY=null,deco=0,g,st,entered,reduceMotion=false;
    const deviceSpotShown=new Set(),chapterCardDue=()=>false,openChapterCard=()=>{};
    const enter=(level,keep,label)=>{entered=level;st=keep||freshState(level);};
    const loadFree=()=>{},loadDaily=()=>{};
    ${names.map(fn).join('\n')}
    ${source.match(/^const replay = .*$/m)[0]}
    return {resume:()=>loadLevel(index,storySession(index)),retry:replay,fresh:()=>loadLevel(index),
      state:()=>st,level:()=>entered,save:()=>save};
  `);
  assert.equal(Object.keys(LEGACY_STORY_LEVELS).length,16);
  for(const [key,level] of Object.entries(LEGACY_STORY_LEVELS)) {
    const index=+key,g=E.parseLevel(level),plan=E.plan(g,g.start,0,new Set(),g.nets,true),step=plan.steps[0];
    const r=E.slide(g,g.start,step.dir,new Set(step.nets),g.boats);
    const state={pos:r.end,dir:step.dir,nets:step.nets,fish:g.fish.flatMap(([x,y],i)=>r.path.some(p=>p[0]===x&&p[1]===y)?[i]:[]),
      boats:E.stepBoats(g,g.boats,r.end[1]*g.w+r.end[0],new Set(step.nets)),moves:1,history:[]};
    const stored={best:{[index]:3},last:index,skin:'gold',owned:['basic','gold'],hintUsage:{['story:'+index]:{count:2}},
      sessions:{story:{id:index,version:1,layout:JSON.stringify([level.map,level.nets||0]),state}}};
    const scene=harness(stored,index);scene.resume();assert.deepEqual(scene.level().map,level.map);assert.deepEqual(scene.state(),state);
    scene.retry();assert.deepEqual(scene.level().map,level.map);assert.equal(scene.state().moves,0);
    scene.fresh();assert.deepEqual(scene.level().map,LEVELS[index].map);assert.notDeepEqual(scene.level().map,level.map);
    assert.equal(stored.best[index],3);assert.equal(stored.skin,'gold');assert.equal(stored.hintUsage['story:'+index].count,2);
  }
});

test('authored story boards retain required device learning order and add diverse spatial families', () => {
  // First appearance in play order: one new device per chapter (docs/CHAPTER-RESTRUCTURE.md).
  const played = STORY_ORDER.map(i=>LEVELS[i]);
  const first = pattern => played.findIndex(l=>l.map.some(row=>pattern.test(row)))+1;
  assert.equal(first(/[<>^v]/),4);assert.equal(first(/[bB]/),13);assert.equal(played.findIndex(l=>l.nets)+1,25);
  assert.equal(first(/s/),37);assert.equal(first(/w/),49);assert.equal(first(/[pGg]/),61);
  assert.ok(new Set(LEVELS.map(l=>shapeKey(l.map))).size>=29);
  for(const i of [42,45]) {
    const level=LEVELS[i],g=E.parseLevel(level),plan=E.plan(g,g.start,0,new Set(),g.nets,true);
    assert.ok(V.varietyRouteUse(g,plan).used.has('warp'));
    const without=E.parseLevel({...level,map:level.map.map(row=>row.replaceAll('w','.'))});
    assert.equal(E.plan(without,without.start,0,new Set(),without.nets,true),null,'disconnected halves require portals');
  }
});
