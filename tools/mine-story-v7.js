// Review candidates before promoting them into levels.js. Stable story ids/order and all previous boards are retained.
const fs=require('node:fs'),E=require('../src/engine'),L=require('../src/levels'),D=require('../src/daily'),C=require('./content-v7'),A=require('./puzzle-analysis');
const {crateReach}=require('./state-reach'),{shapeKey}=require('./variety-audit'),{V6_PATTERNS}=require('../src/puzzle-v6');
const before=L.STORY_PRE_VARIETY_LEVELS||L.LEVELS,rows=[],used=new Set(before.slice(0,3).map(l=>shapeKey(l.map)));
const pool=[...require('../src/puzzle-catalog-v6'),...JSON.parse(fs.readFileSync('outputs/qa/story-v7/free-extra.json'))];
const chapters=[
  ['intro','intro','intro','current','order','return','cross','current','order','cross','return','current'],
  ['patrol','return','patrol','current','patrol','order','cross','current','patrol','order','return','patrol'],
  ['net','current','net','order','net','cross','net','return','net','patrol','order','net'],
  ['sand','return','sand','order','sand','net','relay','current','patrol','net','cross','relay'],
  ['warp','order','warp','cross','warp','net','sand','warp','relay','patrol','return','warp'],
  ['gate','gate','gate','order','gate','net','gate-current','gate-net','gate-patrol','gate-sand','warp','gate-mixed'],
  ['crate','crate','crate-fish','crate-stop','crate-double','sand','crate-patrol','crate-sand','crate-gate','crate-warp','crate-current','crate-patrol'],
];
const descriptions={
  ...V6_PATTERNS,
  gate:{name:'열고 닫는 길',tip:'스위치에서 멈추면 수문 상태가 바뀌어요. 돌아오는 길도 살펴보세요.'},
  'gate-current':{name:'물살 끝의 스위치',tip:'물줄기의 도착점과 스위치에서 멈출 순서를 함께 생각해요.'},
  'gate-net':{name:'그물로 닿는 스위치',tip:'그물로 정지점을 만든 뒤 수문이 열린 길을 이용해요.'},
  'gate-patrol':{name:'구조정과 문 사이',tip:'수문 상태와 움직이는 구조정의 위치를 함께 살펴요.'},
  'gate-sand':{name:'모래톱 너머 갑문',tip:'모래톱에서 방향을 바꾸고 스위치를 눌러 다음 물길을 열어요.'},
  'gate-mixed':{name:'마지막 수문 순서',tip:'물살과 구조정을 이용해 스위치에 닿고, 수문을 다시 바꿀 자리를 찾아요.'},
  crate:{name:'옮겨 놓는 상자',tip:'상자에서 떨어진 곳에서 헤엄쳐 와 밀어요. 밀린 뒤의 정지점도 살펴요.'},
  'crate-fish':{name:'숭어를 챙긴 다음',tip:'숭어는 상자가 지나가는 길을 막아요. 수집과 밀기 순서를 살펴요.'},
  'crate-stop':{name:'상자로 만드는 길',tip:'상자를 옮기면 멈출 자리도 달라져요. 다음 진입 방향을 생각해요.'},
  'crate-double':{name:'다시 밀어야 할 때',tip:'한 번 밀고 끝나지 않아요. 상자에 다시 접근할 길을 남겨요.'},
  'crate-patrol':{name:'구조정 옆 하역',tip:'움직이는 구조정이 상자의 이동을 막을 수 있어요. 밀기 전 위치를 살펴요.'},
  'crate-sand':{name:'모래톱에 내려놓기',tip:'상자는 모래톱에서 멈춰요. 놓인 상자를 다음 길에 이용해요.'},
  'crate-gate':{name:'상자와 수문 빗장',tip:'상자를 밀 자리와 수문을 열 순서를 함께 정해요.'},
  'crate-warp':{name:'건너가서 밀기',tip:'소용돌이로 건너가 상자의 다른 쪽에서 접근해요.'},
  'crate-current':{name:'물살로 상자에 닿기',tip:'물줄기가 바꾸는 진입 방향을 보고 상자를 밀어요.'},
};
const names={order:['먼저 챙길 숭어','두 갈래의 선택','돌아갈 길 남기기','순서가 바꾸는 거리','양쪽 물길의 순서'],return:['돌아온 갈림길','다시 만나는 부두','돌아서 찾은 물길','돌아가는 정류장','돌아온 뒤의 선택'],cross:['엇갈리는 수집','가로에서 세로로','지나친 길의 다른 쪽','교차로 다시 보기','다른 방향으로 진입'],current:['첫 물살의 방향','두 물살 이어 타기','화살표의 다른 쪽','물살 건너 되돌기','물살을 타는 순서'],patrol:['움직이는 첫 정지점','구조정을 기다린 자리','순찰 뒤 열린 길','움직인 뒤 돌아오기','구조정 옆 갈림길'],net:['첫 그물 자리','그물 너머 숭어','수집 뒤의 정지점','두 길을 잇는 그물','돌아올 그물 자리'],sand:['첫 모래톱 방향','멈춘 뒤 옆 물길','모래톱의 교차로','연결하는 모래톱','모래톱에서 돌아가기'],warp:['첫 소용돌이 건너기','건너가서 돌아오기','양쪽 물길 수집','소용돌이를 타는 순서','다시 건너는 바다'],gate:['첫 수문 선택','멈춰서 바꾸는 문','되돌아올 때의 수문','열고 닫는 두 방']};
const stageNames={"16":"물살 사이의 굽이","21":"구조정이 만든 정지점","35":"가까운 숭어의 우회","36":"남겨 둘 정지점","38":"모래 물길 돌아보기","40":"숭어를 잇는 순서","42":"바깥쪽 그물 자리","43":"물살 끝의 모래톱","44":"물살의 갈림길","45":"구조정 건너 정지점","46":"안쪽 그물 자리","48":"물살에서 옆 물길로","50":"건너편 숭어의 순서","54":"건너편의 정지점","57":"모래톱과 방향 전환","58":"움직이는 길목","59":"먼 갈림길 돌아오기","64":"수문 옆 수집 순서","66":"부두 끝 그물 자리","74":"상자의 새 자리","84":"마지막 하역 수로"};
const occurrences={};
for(let pos=3;pos<L.STORY_ORDER.length;pos++){
  const index=L.STORY_ORDER[pos],old=before[index],pattern=chapters[Math.floor(pos/12)][pos%12],g=E.parseLevel(old),oldInfo=A.routeFeatures(old,E.plan(g,g.start,0,new Set(),g.nets,true)),isMixed=pattern.includes('-'),role=old.role||'regular';
  const lo=Math.max(4,oldInfo.moves-2),hi=oldInfo.moves+(role==='learn'&&pos!==72?1:2),forcedOld=isMixed||pattern==='gate'||pattern.startsWith('crate')||pos===3;
  const candidates=forcedOld?[old]:pool.filter(p=>p.pattern===pattern&&p.minimum>=lo-1&&p.minimum<=hi+1);
  if(!candidates.length)throw Error('no sources for stage '+(pos+1)+' '+pattern);
  const rand=D.rng(D.dailySeed('story-variety-v7/'+pos));let selected;
  for(let attempt=0;attempt<30000;attempt++){
    const source=candidates[Math.floor(rand()*candidates.length)],candidate=C.mutate(source,rand,{walls:true});
    const shape=shapeKey(candidate.map);if(used.has(shape))continue;
    const info=C.inspect(candidate,{min:lo,max:hi,escape:pos<6?1:2,detour:pos<6||!g.fish.length?0:1,wall:pos>=6&&role!=='learn',strict:false});if(!info||info.signature===oldInfo.signature)continue;
    if(!C.meetsPattern(candidate,info,pattern))continue;
    const actual=C.devices(candidate),wanted=forcedOld?C.devices(old):C.devices(source);if(wanted.some(k=>!actual.includes(k)))continue;
    if(pos<6||role==='learn'&&actual.includes('crate')){const reach=crateReach(require('../src/engine').parseLevel(candidate));if(!Number.isFinite(reach.reachable)||reach.unescapable)continue;}
    if(actual.includes('gate')){const frozen=E.parseLevel(candidate);frozen.switches=[];if(C.solveGrid(frozen,false)!==null)continue;}
    // The original disconnected-portal learning slots continue to require the portal pair.
    if([42,45].includes(index)&&info.proof.whirl!==null)continue;
    const count=occurrences[pattern]||0;occurrences[pattern]=count+1;
    const desc=descriptions[pattern],label=names[pattern]?.[count];
    selected={index,stage:pos+1,pattern,attempt,...info,level:{map:candidate.map,nets:candidate.nets||0,par:info.minimum+L.LEVEL_ROLES[role].slack,role,
      name:stageNames[pos+1]||label||desc.name,tip:desc.tip,idea:desc.name,revision:3}};break;
  }
  if(!selected){fs.writeFileSync('outputs/qa/story-v7/story-partial.json',JSON.stringify(rows,null,2));throw Error('no accepted candidate for '+(pos+1)+' '+pattern+' '+lo+'-'+hi);}
  used.add(selected.shape);rows.push(selected);console.log(selected.stage,selected.pattern,selected.minimum,selected.attempt,selected.level.name);
}
fs.writeFileSync('outputs/qa/story-v7/story-candidates.json',JSON.stringify(rows,null,2));
console.log('selected',rows.length,'new story boards; first three movement tutorials retained');
