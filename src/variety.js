/* Authored spatial families, shared quality checks, and bounded v2 generation. */
const VE = typeof module !== 'undefined' && typeof require === 'function' ? require('./engine.js') : { parseLevel, slide, stepBoats, DIRS, cellAt };
function canalMask(w, h, rooms, start, exit, walls = []) {
  const cells = Array.from({ length: h }, () => Array(w).fill('#'));
  for (const [x0,y0,x1,y1] of rooms) for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) cells[y][x]='.';
  for (const [x0,y0,x1,y1] of walls) for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) cells[y][x]='#';
  cells[start[1]][start[0]]='S'; cells[exit[1]][exit[0]]='E'; return cells.map(row=>row.join(''));
}
const VARIETY_MASKS = {
  cross: canalMask(9,9,[[3,1,5,7],[1,3,7,5]],[4,8],[4,0]),
  rooms: canalMask(9,9,[[1,1,3,7],[5,1,7,7],[4,3,4,5]],[1,8],[7,0]),
  steps: canalMask(9,9,[[1,1,4,3],[3,3,6,5],[5,5,7,7]],[7,8],[1,0]),
  pocket: canalMask(9,8,[[1,1,7,6]],[4,7],[8,2],[[3,1,3,3],[5,4,5,6]]),
  orbit: canalMask(9,9,[[1,1,7,7]],[4,8],[8,4],[[3,3,5,5]]),
  bridge: canalMask(9,9,[[1,1,7,3],[1,5,7,7],[2,4,3,4],[6,4,7,4]],[2,8],[6,0]),
  comb: canalMask(9,9,[[1,1,7,7]],[0,6],[8,2],[[3,1,3,4],[5,4,5,7]]),
  offset: canalMask(8,9,[[1,1,6,7]],[1,8],[6,0],[[1,3,3,3],[4,5,6,5]]),
  courts: canalMask(9,10,[[1,1,7,8]],[0,7],[8,2],[[3,2,3,4],[5,5,5,7],[4,4,5,4]]),
  lanes: canalMask(9,9,[[1,1,7,7]],[1,8],[7,0],[[3,2,3,6],[5,2,5,6]]),
  balcony: canalMask(8,8,[[1,1,6,6]],[0,5],[7,2],[[3,3,4,4]]),
  elbows: canalMask(8,9,[[1,1,6,7]],[6,8],[0,1],[[1,3,4,3],[3,5,6,5]]),
  portals: canalMask(9,9,[[1,1,3,7],[5,1,7,7]],[2,8],[6,0]),
  islands: canalMask(9,9,[[1,1,7,3],[1,5,7,7]],[1,8],[8,2]),
};
const VARIETY_FAMILIES = {
  branches: { label:'갈림길 탐색', tip:'갈림길에서 어느 쪽 숭어를 먼저 만날지 살펴보세요.', masks:['cross','rooms','steps','fork','bridge'], spec:{buoys:2,fish:2} },
  loop: { label:'돌아오는 길', tip:'한 바퀴 돌아온 뒤에는 처음에 놓친 길도 살펴보세요.', masks:['orbit','balcony','lanes','ring','courts'], spec:{buoys:2,fish:2} },
  pockets: { label:'작은 우회', tip:'출구로 가기 전에 옆 물길의 숭어부터 챙겨 보세요.', masks:['pocket','comb','offset','elbows','side'], spec:{buoys:2,fish:2} },
  current: { label:'물살의 방향', tip:'같은 물줄기도 들어가는 방향에 따라 다음 길이 달라져요.', masks:['cross','steps','bridge','pocket','elbows','lagoon'], spec:{buoys:2,fish:2,jets:2}, device:'jet' },
  patrol: { label:'움직이는 정지점', tip:'한 번 움직인 뒤 구조정이 어디에 멈추는지 살펴보세요.', masks:['rooms','orbit','comb','balcony','lanes','harbor'], spec:{buoys:2,fish:2,boats:1}, device:'boat' },
  sand: { label:'멈추고 방향 바꾸기', tip:'모래톱에서 멈춘 다음, 벽에서는 갈 수 없던 방향을 찾아요.', masks:['cross','rooms','pocket','bridge','courts','shoal'], spec:{buoys:2,fish:2,sand:2}, device:'sand' },
  net: { label:'옮겨 쓰는 그물', tip:'그물을 회수해 다른 곳에 옮기면 새로운 정지점을 만들 수 있어요.', masks:['rooms','cross','orbit','comb','courts','offset','lanes'], spec:{buoys:2,fish:3}, nets:1, device:'net' },
  warp: { label:'떨어진 물길', tip:'소용돌이를 건넌 뒤에도 같은 방향으로 헤엄친다는 점을 이용해요.', masks:['portals','islands','twin','moat'], spec:{buoys:3,fish:3,whirls:1}, device:'warp' },
};
const VARIETY_FREE_TIERS = [
  {min:4,max:8,slack:2,escape:2,families:['branches','loop','pockets']},
  {min:6,max:11,slack:1,escape:3,families:['current','patrol','sand','loop']},
  {min:8,max:14,slack:0,escape:4,families:['net','warp','current','patrol','sand']},
];
const VARIETY_DAILY_THEMES = [
  {label:'돌아오는 물길',families:['branches','loop','net']},
  {label:'멈춤의 기술',families:['pockets','sand','net']},
  {label:'흐름 따라 탐험',families:['loop','current','warp']},
  {label:'구조정과 한 바퀴',families:['branches','patrol','patrol']},
  {label:'섬 너머 구출',families:['loop','sand','warp']},
  {label:'갈림길 작전',families:['pockets','current','net']},
  {label:'다시 만나는 길',families:['branches','patrol','warp']},
];
// Daily operation v3 / free v3: a family is offered only after the story taught its device (learned = story device keys
// such as 'jet', 'whirl'; null = every device). Families without a device are always known.
function varietyFamilyKnown(family, learned) {
  const device = VARIETY_FAMILIES[family]?.device;
  return !learned || !device || learned.includes(device === 'warp' ? 'whirl' : device);
}
// Compare static layout including devices under mirror/rotation, but never claim boat phase equivalence.
// Boat axes/directions are kept in the exact key; only boat-free boards are symmetry-normalized.
function varietyLayoutKey(level) {
  if (level.map.some(row=>/[bB]/.test(row))) return JSON.stringify([level.map,level.nets||0]);
  let grid=level.map.map(row=>[...row]), keys=[];
  const rotate={'^':'>','>':'v','v':'<','<':'^'},mirror={'<':'>','>':'<'};
  for(let r=0;r<4;r++) {
    keys.push(grid.map(row=>row.join('')).join('/'));
    keys.push(grid.map(row=>row.slice().reverse().map(c=>mirror[c]||c).join('')).join('/'));
    grid=grid[0].map((_,x)=>grid.map(row=>rotate[row[x]]||row[x]).reverse());
  }
  return `${level.nets||0}:${keys.sort()[0]}`;
}
function varietyRouteUse(g, full) {
  let pos=g.start,boats=g.boats; const used=new Set(); let previous='[]', edits=0;
  for(const step of full.steps) {
    const placed=new Set(step.nets),key=JSON.stringify(step.nets.slice().sort((a,b)=>a-b));
    if(key!==previous){edits++;previous=key;}
    const r=VE.slide(g,pos,step.dir,placed,boats);
    for(const [x,y] of r.path){const c=VE.cellAt(g,x,y);if('^v<>'.includes(c))used.add('jet');if(c==='s')used.add('sand');if(c==='w')used.add('warp');}
    const last=r.path.at(-1);if(last){const [dx,dy]=VE.DIRS[last[2]],next=(r.end[1]+dy)*g.w+r.end[0]+dx;if(boats.some(b=>b[0]===next))used.add('boat');}
    pos=r.end;if(!r.win)boats=VE.stepBoats(g,boats,pos[1]*g.w+pos[0],placed);
  }
  if(full.steps.some(s=>s.nets.length))used.add('net');return {used,edits};
}
function* variedCanalSearch(seed, family, tier, deps, reserves = [], maxAttempts = 100) {
  const profile=VARIETY_FAMILIES[family],rand=deps.rng(seed),masks={...deps.MASKS,...VARIETY_MASKS};
  if(!profile)return null;
  for(let attempt=0;attempt<maxAttempts;attempt++) {
    yield;
    // Cycle templates from a seeded offset so unsuccessful shapes cannot dominate selection.
    const maskId=profile.masks[(seed+attempt)%profile.masks.length],spec={...profile.spec};
    if(tier.min>=8 && !spec.whirls)spec.fish=3;
    if(profile.device==='boat' && attempt%2) {spec.vboats=1;spec.boats=0;}
    const map=deps.place(masks[maskId],spec,rand),nets=profile.nets||0;
    if(map.some(row=>/><|<>/.test(row)))continue;
    const g=VE.parseLevel({map,nets}),full=yield* deps.operationPlan(g,nets,true);
    if(!full||full.moves<tier.min||full.moves>tier.max)continue;
    const escape=yield* deps.operationPlan(g,nets,false);
    if(!escape||escape.moves<tier.escape||full.moves<=escape.moves)continue;
    const active=varietyRouteUse(g,full);
    if(profile.device&&!active.used.has(profile.device))continue;
    if(nets&&((yield* deps.operationPlan(g,0,true))!==null||active.edits<2))continue;
    return {map,nets,par:full.moves+tier.slack,family,idea:profile.label,tip:profile.tip,maskId,attempts:attempt+1};
  }
  const pool=reserves.filter(r=>r.family===family && r.minimum>=tier.min && r.minimum<=tier.max && r.escape>=tier.escape);
  if(!pool.length)return null;
  const reserve=pool[seed%pool.length];
  return {...reserve,map:reserve.map.slice(),par:reserve.minimum+tier.slack,fallback:true,tip:profile.tip,idea:profile.label,attempts:maxAttempts};
}
if(typeof module!=='undefined')module.exports={VARIETY_MASKS,VARIETY_FAMILIES,VARIETY_FREE_TIERS,VARIETY_DAILY_THEMES,varietyFamilyKnown,varietyLayoutKey,varietyRouteUse,variedCanalSearch};
