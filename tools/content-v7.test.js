const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const E=require('../src/engine'),L=require('../src/levels'),F=require('../src/free'),P=require('../src/puzzle-v6');
const C=require('./content-v7'),A=require('./puzzle-analysis'),extra=require('../src/puzzle-extra-v7'),{FREE7_CATALOG}=require('../src/free-v7');
const {shapeKey}=require('./variety-audit'),{replayPlan}=require('./replay-plan');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('the complete previous story and published v7 free boards stay immutable for saved sessions',()=>{
  assert.equal(hash(L.STORY_PRE_VARIETY_LEVELS),'3b6b960a07aa89099657d35baa05f92865110eb0e50961afd460055c6900adb0');
  assert.equal(hash(extra),'eeccf0f3e1235b8a59a72891aa07a2c77d1d4d6d2ee39ba45e30bba33c753f78');
  assert.equal(FREE7_CATALOG.length,338);assert.equal(new Set(FREE7_CATALOG.map(p=>p.id)).size,338);
});

test('stages 4–84 change the actual action sequence and meet their stated reasoning pattern',()=>{
  assert.deepEqual(L.LEVELS.slice(0,3),L.STORY_PRE_VARIETY_LEVELS.slice(0,3));
  assert.equal(Object.keys(L.STORY_VARIETY_V7).length,81);
  assert.equal(new Set(L.LEVELS.map(l=>shapeKey(l.map))).size,84);
  assert.equal(new Set(L.LEVELS.map(l=>l.name)).size,84);
  for(const [key,revision] of Object.entries(L.STORY_VARIETY_V7)){
    const i=+key,level=L.LEVELS[i],old=L.STORY_PRE_VARIETY_LEVELS[i],pos=L.STORY_POSITION[i],g=E.parseLevel(old);
    const before=A.routeFeatures(old,E.plan(g,g.start,0,new Set(),g.nets,true));
    const info=C.inspect(level,{min:1,max:30,escape:pos<6?1:2,detour:pos<6||!g.fish.length?0:1,wall:pos>=6&&level.role!=='learn',strict:false});
    assert.ok(info,'stage '+(pos+1));assert.notEqual(info.signature,before.signature);assert.notDeepEqual(level.map,old.map);
    assert.ok(C.meetsPattern(level,info,revision.pattern),revision.pattern+' '+(pos+1));
    assert.equal(level.par,info.minimum+L.LEVEL_ROLES[level.role||'regular'].slack);
  }
});

test('all 88 extra free boards replay and use every included device meaningfully',()=>{
  for(const p of extra){
    const tier=F.freeTier(p.tier),info=C.inspect(p,{min:tier.min,max:tier.max,escape:tier.escape,detour:p.tier===2?4:1});
    assert.ok(info,p.id);assert.equal(info.minimum,p.minimum);assert.equal(info.escape,p.escape);assert.equal(info.signature,p.signature);
    replayPlan(E.parseLevel(p),info.solution);
    if(p.pattern==='warp')assert.ok(info.features.warps>=2);
    if(p.pattern==='sand')assert.ok(info.features.sandTurns>=1);
    if(p.pattern==='patrol')assert.ok(info.features.boatStops>=1);
  }
});

test('each free difficulty rotates all families and devices even with zero story progress; kept ids ignore learning/history',()=>{
  for(let tier=0;tier<3;tier++){
    let history=[];const types=new Set(),cycle=tier===0?10:11,patterns=[];
    for(let seed=0;seed<132;seed++){
      const run=F.makeFree(seed,tier,7,[],null,history),l=run.level;
      assert.deepEqual(run,F.makeFree(seed,tier,7,null,null,history));
      assert.ok(!history.some(r=>r.id===l.puzzleId));
      assert.ok(!patterns.slice(-(cycle-1)).includes(l.family));patterns.push(l.family);
      C.devices(l).forEach(k=>types.add(k));if(l.map.some(r=>r.includes('o')))types.add('buoy');
      history=[...history,P.v6History(l)].slice(-12);
      assert.deepEqual(F.makeFree(seed,tier,7,['jet'],null,history,l.puzzleId),run);
    }
    assert.equal(new Set(patterns).size,cycle);assert.deepEqual([...types].sort(),['boat','buoy','crate','gate','jet','net','sand','whirl']);
  }
});

test('all 84 pre-update story checkpoints resume and retry the old board; fresh entry uses the new board',()=>{
  const source=fs.readFileSync('src/game.js','utf8'),read=name=>fs.readFileSync('src/'+name+'.js','utf8');
  const fn=name=>source.match(new RegExp(`^function ${name}\\([^\\n]*}\\s*$`,'m'))?.[0]||source.match(new RegExp(`function ${name}\\([^]*?\\n}`))?.[0];
  const names=['levelSignature','copyTurn','restoreSession','storyLevel','storySession','freshState','loadLevel'];
  const harness=new Function('save','index',`${read('engine')}\n${read('levels')}
    const unlocked=()=>true,chapterOf=()=>({ci:0}),deviceSpotShown=new Set(),chapterCardDue=()=>false,openChapterCard=()=>{};
    let LVL=0,DAILY=null,FREE=null,PILOT=null,STORY=null,deco=0,g,st,entered,reduceMotion=false;
    const enter=(level,keep)=>{entered=level;st=keep||freshState(level);},loadFree=()=>{},loadDaily=()=>{};
    ${names.map(fn).join('\n')}
    ${source.match(/^const replay = .*$/m)[0]}
    return {resume:()=>loadLevel(index,storySession(index)),retry:replay,fresh:()=>loadLevel(index),state:()=>st,level:()=>entered};`);
  for(const [index,level] of L.STORY_PRE_VARIETY_LEVELS.entries()){
    const g=E.parseLevel(level),p=E.plan(g,g.start,0,new Set(),g.nets,true);
    const state={pos:g.start.slice(),dir:'U',fish:[],nets:[],boats:g.boats.map(b=>b.slice()),moves:0,history:[],...(g.switches.length?{gate:0}:{}),...(g.crates.length?{crates:g.crates.slice()}: {})};
    // Keep a real partially played state, including an open gate / pushed crate when possible.
    for(const step of p.steps.slice(0,-1)){
      const mask=state.fish.reduce((n,i)=>n|(1<<i),0),r=E.turn(g,state.pos,step.dir,new Set(step.nets),state.boats,state.gate,state.crates,mask);
      state.history.push(Object.fromEntries(Object.entries(structuredClone(state)).filter(([k])=>k!=='history')));
      Object.assign(state,{pos:r.end,dir:step.dir,nets:step.nets.slice(),boats:r.boats,moves:state.moves+1});
      if(g.switches.length)state.gate=r.gate;if(g.crates.length)state.crates=r.crates;
      r.path.forEach(([x,y])=>g.fish.forEach(([fx,fy],i)=>{if(x===fx&&y===fy&&!state.fish.includes(i))state.fish.push(i);}));
    }
    const saved={best:{[index]:3},last:index,owned:['basic','gold'],skin:'gold',hintUsage:{['story:'+index]:{count:2}},sessions:{story:{version:1,id:index,layout:JSON.stringify([level.map,level.nets||0]),state}}};
    const original=structuredClone(saved),game=harness(saved,index);game.resume();assert.deepEqual(game.level(),level);assert.deepEqual(game.state(),state);
    game.retry();assert.deepEqual(game.level(),level);assert.equal(game.state().moves,0);
    game.fresh();assert.deepEqual(game.level(),L.LEVELS[index]);assert.deepEqual(saved,original);
  }
});
