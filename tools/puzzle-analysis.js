// Offline evidence from actual turns. Route fingerprints are proxies, not proofs of human insight.
const E=require('../src/engine'),D=require('../src/daily'),V=require('../src/variety');
function solve(level,all=true) {
  const g=E.parseLevel(level),search=D.placedOperationPlan(g,g.nets,all);let s;do{s=search.next();}while(!s.done);return s.value;
}
function routeFeatures(level,solution=solve(level)) {
  if(!solution)return null;
  const g=E.parseLevel(level),stops=new Map([[g.start.join(),0]]),events=[],fishAt=new Map(g.fish.map(([x,y],i)=>[y*g.w+x,i]));
  let pos=g.start,boats=g.boats,gate=0,crates=g.crates,mask=0,returns=0,crossings=0,sandTurns=0,warps=0,boatStops=0;
  const visited=new Map(),jets=new Set(),portalDirections=new Map();let previous=null;
  for(const step of solution.steps) {
    const r=E.turn(g,pos,step.dir,new Set(step.nets),boats,gate,crates,mask),before=mask,used=new Set();
    if(previous?.stop==='sand'&&('LR'.includes(previous.dir)!=='LR'.includes(step.dir)))sandTurns++;
    for(const [x,y,dir,jump] of r.path) {
      const i=y*g.w+x,c=E.cellAt(g,x,y),fi=fishAt.get(i),axis=dir==='L'||dir==='R'?'h':'v';
      if(fi!=null)mask|=1<<fi;
      if(visited.has(i)&&!visited.get(i).has(axis))crossings++;
      if(!visited.has(i))visited.set(i,new Set());visited.get(i).add(axis);
      if('^v<>'.includes(c)){jets.add(i);used.add('j');}
      if(c==='s')used.add('s');
      if(jump){warps++;used.add('w');if(!portalDirections.has(i))portalDirections.set(i,new Set());portalDirections.get(i).add(dir);}
    }
    const key=r.end.join(),repeat=stops.has(key);
    if(repeat&&stops.get(key)!==mask)returns++;
    stops.set(key,mask);
    const last=r.path.at(-1);if(last){const [dx,dy]=E.DIRS[last[2]],next=(r.end[1]+dy)*g.w+r.end[0]+dx;if(boats.some(b=>b[0]===next)){boatStops++;used.add('b');}}
    if(r.push)used.add('c');if(r.pressed)used.add('g');if(step.nets.length)used.add('n');
    // Discard compass direction/position and collapse empty transit runs. Reflection and rotation do not create novelty.
    const token=[mask!==before?'fish':'',repeat?'return':'',...used].filter(Boolean).join('+')||'travel';
    if(token!=='travel'||events.at(-1)!=='travel')events.push(token);
    pos=r.end;boats=r.boats;gate=r.gate;crates=r.crates;previous=r;
  }
  return {moves:solution.moves,returns,crossings,sandTurns,warps,portalTurns:[...portalDirections.values()].filter(s=>s.size>=2).length,
    jets:jets.size,boatStops,events,signature:events.join('/'),route:solution.seq};
}
function counterfactual(level,kind) {
  const map=level.map.map(row=>row.replace(kind==='jet'?/[<>^v]/g:kind==='sand'?/s/g:kind==='warp'?/w/g:/[bB]/g,kind==='boat'?'o':'.'));
  const p=solve({...level,map,nets:kind==='net'?0:level.nets});return p===undefined?undefined:p?.moves??null;
}
// Static boards: shortest full solution with a specified FIRST fish, under the same sliding rules.
function firstFishCosts(level) {
  const g=E.parseLevel(level);if(g.nets||g.boats.length||g.crates.length||g.gates.length)return null;
  const idx=new Map(g.fish.map(([x,y],i)=>[y*g.w+x,i])),full=(1<<g.fish.length)-1,costs=[];
  for(let first=0;first<g.fish.length;first++) {
    const queue=[{pos:g.start,mask:0,n:0}],seen=new Set();let answer=null;
    for(let k=0;k<queue.length;k++) {
      const s=queue[k];for(const dir of Object.keys(E.DIRS)) {
        const r=E.turn(g,s.pos,dir,new Set(),g.boats,0,[],s.mask);if(!r.path.length)continue;
        let mask=s.mask,wrong=false;for(const [x,y] of r.path){const f=idx.get(y*g.w+x);if(f!=null){if(!mask&&f!==first){wrong=true;break;}mask|=1<<f;}}
        if(wrong)continue;if(r.win){if(mask===full){answer=s.n+1;break;}continue;}
        const key=r.end+'|'+mask;if(!seen.has(key)){seen.add(key);queue.push({pos:r.end,mask,n:s.n+1});}
      }if(answer!==null)break;
    }costs.push(answer);
  }return costs;
}
function wallFollower(level) {
  const g=E.parseLevel(level);if(g.nets)return false;
  const dirs=['U','R','D','L'],full=(1<<g.fish.length)-1;
  for(const hand of [-1,1])for(let facing=0;facing<4;facing++) {
    let pos=g.start,boats=g.boats,gate=0,crates=g.crates,mask=0,d=facing;const seen=new Set();
    for(let n=0;n<160;n++) {
      const key=JSON.stringify([pos,boats,gate,crates,mask,d]);if(seen.has(key))break;seen.add(key);
      let moved=false;for(const offset of [hand,0,-hand,2]) {
        const nd=(d+offset+4)%4,r=E.turn(g,pos,dirs[nd],new Set(),boats,gate,crates,mask);if(!r.path.length)continue;
        for(const [x,y] of r.path)g.fish.forEach(([fx,fy],i)=>{if(x===fx&&y===fy)mask|=1<<i;});
        if(r.win){if(mask===full)return true;moved=false;break;}
        pos=r.end;boats=r.boats;gate=r.gate;crates=r.crates;d=nd;moved=true;break;
      }if(!moved)break;
    }
  }return false;
}
function reasoningPattern(level,f=routeFeatures(level)) {
  if(!f)return {type:'unsolved',proof:{}};
  const chars=level.map.join(''),proof={};let type='unclassified';
  const matters=kind=>{const n=counterfactual(level,kind);proof[kind]=n;return n===null||Number.isInteger(n)&&n>=f.moves+2;};
  if(!(/[<>^vswbB]/.test(chars)||level.nets)) {
    const costs=firstFishCosts(level);proof.firstFishCosts=costs;
    const best=costs.filter(n=>n===f.moves).length,other=costs.filter(n=>n!==f.moves);
    if(best===1&&other.some(Number.isInteger)&&other.every(n=>n===null||n>=f.moves+2))type='order';
    else if(f.returns>=1)type='return';else if(f.crossings>=2)type='cross';
  }else if(level.nets){if(matters('net')&&proof.net===null)type='net';}
  else if(/[<>^v]/.test(chars)&&/s/.test(chars)){if(f.jets>=1&&f.sandTurns>=1&&matters('jet')&&matters('sand'))type='relay';}
  else if(/[<>^v]/.test(chars)){if(f.jets>=2&&matters('jet'))type='current';}
  else if(/s/.test(chars)){if(f.sandTurns>=1&&matters('sand'))type='sand';}
  else if(/[bB]/.test(chars)){if(f.boatStops>=1&&matters('boat'))type='patrol';}
  else if(/w/.test(chars)){if(f.warps>=3&&matters('warp'))type='warp';}
  return {type,proof};
}
module.exports={solve,routeFeatures,counterfactual,firstFishCosts,wallFollower,reasoningPattern};
