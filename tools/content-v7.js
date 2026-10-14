// Offline content checks use the live movement/search rules; these are not measurements of player fun.
const E=require('../src/engine'),D=require('../src/daily'),V=require('../src/variety'),A=require('./puzzle-analysis');
const {replayPlan}=require('./replay-plan'),{shapeKey}=require('./variety-audit');
const crypto=require('node:crypto');
const idFor=l=>crypto.createHash('sha256').update(V.varietyLayoutKey(l)).digest('hex').slice(0,12);
const devices=l=>{const s=l.map.join('');return ['jet','boat','net','sand','whirl','gate','crate'].filter(k=>k==='net'?l.nets:({jet:/[<>^v]/,boat:/[bB]/,sand:/s/,whirl:/w/,gate:/[pGg]/,crate:/c/})[k].test(s));};
function interactions(level,full){
  const g=E.parseLevel(level),fish=new Map(g.fish.map(([x,y],i)=>[y*g.w+x,i])),moved=new Set();
  let pos=g.start,boats=g.boats,gate=0,crates=g.crates,mask=0;const f={fishBeforePush:0,movedCrateStops:0,crateSand:0,crateBoat:0,jetPush:0};
  for(const step of full.steps){
    const r=E.turn(g,pos,step.dir,new Set(step.nets),boats,gate,crates,mask),[dx,dy]=E.DIRS[r.dir||r.path.at(-1)?.[2]||step.dir],next=(r.end[1]+dy)*g.w+r.end[0]+dx;
    if(crates.includes(next)&&moved.has(next))f.movedCrateStops++;
    if(r.push){
      if(r.push.cells.some(i=>fish.has(i)&&(mask&(1<<fish.get(i)))))f.fishBeforePush++;
      if(g.cells[r.push.to]==='s')f.crateSand++;
      if(boats.some(b=>b[0]===r.push.to+dx+dy*g.w))f.crateBoat++;
      if(r.path.some(([x,y])=>'<>^v'.includes(E.cellAt(g,x,y))))f.jetPush++;
      moved.delete(r.push.from);moved.add(r.push.to);
    }
    for(const [x,y] of r.path){const i=fish.get(y*g.w+x);if(i!=null)mask|=1<<i;}
    pos=r.end;boats=r.boats;gate=r.gate;crates=r.crates;
  }return f;
}
function meetsPattern(level,info,pattern){
  const f=info.features;
  if(pattern==='order'){const costs=A.firstFishCosts(level),other=costs.filter(n=>n!==info.minimum);return costs.filter(n=>n===info.minimum).length===1&&other.some(Number.isInteger)&&other.every(n=>n===null||n>=info.minimum+2);}
  if(pattern==='return')return f.returns>=1;
  if(pattern==='cross')return f.returns===0&&f.crossings>=2;
  if(pattern==='current')return f.jets>=2;
  if(pattern==='sand')return f.sandTurns>=1;
  if(pattern==='patrol')return f.boatStops>=1;
  if(pattern==='warp')return f.warps>=2;
  if(pattern==='relay')return f.jets>=1&&f.sandTurns>=1;
  if(pattern==='crate-fish')return info.interactions.fishBeforePush>0;
  if(pattern==='crate-stop')return info.interactions.movedCrateStops>0;
  if(pattern==='crate-double')return info.pushes>=2;
  if(pattern==='crate-sand')return info.interactions.crateSand>0;
  if(pattern==='crate-patrol')return info.interactions.crateBoat>0;
  if(pattern==='crate-current')return info.interactions.jetPush>0;
  return true;
}
function solveGrid(g,all=true){const search=D.placedOperationPlan(g,g.nets,all);let s;do{s=search.next();}while(!s.done);return s.value;}
function changedCost(level,kind){
  const g=E.parseLevel(level);
  if(kind==='gate'){g.switches=[];const p=solveGrid(g);return p===undefined?undefined:p?.moves??null;}
  if(kind==='crate')return g.crates.flatMap(i=>['o','.'].map(c=>{
    const map=level.map.map((r,y)=>y===Math.floor(i/g.w)?r.slice(0,i%g.w)+c+r.slice(i%g.w+1):r),p=A.solve({...level,map});
    return p===undefined?undefined:p?.moves??null;
  }));
  return A.counterfactual(level,kind==='whirl'?'warp':kind);
}
function inspect(level,{min=4,max=22,escape=2,detour=1,wall=true,strict=true}={}) {
  const full=A.solve(level);if(!full||full.moves<min||full.moves>max)return null;
  const out=A.solve(level,false);if(!out||out.moves<escape||full.moves-out.moves<detour)return null;
  if(wall&&A.wallFollower(level))return null;
  const g=E.parseLevel(level),done=replayPlan(g,full),f=A.routeFeatures(level,full),used=V.varietyRouteUse(g,full).used,ds=devices(level),proof={};
  for(const kind of ds) {
    if(kind==='net'&&!full.steps.some(s=>s.nets.length))return null;
    if(kind==='gate'&&!done.presses||kind==='crate'&&!done.pushes)return null;
    if(!['net','gate','crate'].includes(kind)&&!used.has(kind==='whirl'?'warp':kind))return null;
    const costs=changedCost(level,kind);proof[kind]=costs;
    if((Array.isArray(costs)?costs:[costs]).some(n=>n===undefined||n===full.moves||(strict&&Number.isInteger(n)&&n<full.moves+2)))return null;
    if(kind==='net'&&costs!==null)return null;
  }
  return {id:idFor(level),minimum:full.moves,escape:out.moves,signature:f.signature,shape:shapeKey(level.map),features:f,proof,solution:full,presses:done.presses,pushes:done.pushes||0,interactions:interactions(level,full)};
}
function mutate(level,rand,{walls=false}={}) {
  const rows=level.map.map(r=>[...r]),pick=a=>a[Math.floor(rand()*a.length)];
  for(let k=0,n=1+Math.floor(rand()*3);k<n;k++){
    const objects=[],water=[];rows.forEach((r,y)=>r.forEach((c,x)=>{if('fo<>^vbBswpc'.includes(c))objects.push([x,y]);if(c==='.')water.push([x,y]);}));
    if(!objects.length||!water.length)break;const [x,y]=pick(objects),[a,b]=pick(water);rows[b][a]=rows[y][x];rows[y][x]='.';
  }
  if(walls){
    const options=[];for(let y=1;y<rows.length-1;y++)for(let x=1;x<rows[0].length-1;x++) {
      const c=rows[y][x];if(!'#.'.includes(c))continue;
      if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>'pGgSE'.includes(rows[y+dy]?.[x+dx]||'#')))continue;
      if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>rows[y+dy]?.[x+dx]===(c==='#'?'.':'#')))options.push([x,y]);
    }
    if(options.length){const [x,y]=pick(options);rows[y][x]=rows[y][x]==='#'?'.':'#';}
  }
  return {...level,map:rows.map(r=>r.join(''))};
}
function place(mask,kind,tier,rand){
  const spec={buoys:tier?2:1,fish:tier===2?4:2};
  if(kind==='current')spec.jets=2;if(kind==='sand')spec.sand=2;if(kind==='patrol')spec.boats=1;if(kind==='warp')spec.whirls=1;
  let map=D.place(mask,spec,rand),rows=map.map(r=>[...r]);
  if(kind==='crate'||kind==='gate'){
    const water=[],doors=[],edges=[];
    rows.forEach((r,y)=>r.forEach((c,x)=>{if(c!=='.')return;water.push([x,y]);const at=(dx,dy)=>rows[y+dy]?.[x+dx]||'#';
      if(at(-1,0)==='#'&&at(1,0)==='#'&&at(0,-1)==='.'&&at(0,1)==='.'||at(0,-1)==='#'&&at(0,1)==='#'&&at(-1,0)==='.'&&at(1,0)==='.')doors.push([x,y]);
      if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>at(dx,dy)==='#'))edges.push([x,y]);
    }));
    const pick=a=>a[Math.floor(rand()*a.length)];
    if(kind==='crate'){if(!water.length)return null;const [x,y]=pick(water);rows[y][x]='c';}
    else {if(!doors.length||!edges.length)return null;const [x,y]=pick(doors),ps=edges.filter(([a,b])=>a!==x||b!==y);if(!ps.length)return null;const [a,b]=pick(ps);rows[y][x]='G';rows[b][a]='p';}
  }
  return {map:rows.map(r=>r.join('')),nets:kind==='net'?1:0};
}
module.exports={devices,inspect,mutate,place,idFor,changedCost,solveGrid,interactions,meetsPattern};
