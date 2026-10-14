/* Verified v6 puzzle selection. The catalog is immutable; no solver work blocks the UI at entry. */
const V6_CATALOG = typeof module !== 'undefined' && typeof require === 'function' ? require('./puzzle-catalog-v6') : PUZZLE_CATALOG_V6;
const V6_PATTERNS = {
  order: {name:'수집 순서',need:[],tip:'먼저 모을 숭어를 정해 보세요. 순서에 따라 돌아가는 길이 달라져요.'},
  return: {name:'되돌아온 갈림길',need:[],tip:'숭어를 챙긴 뒤 같은 정지점에서 다른 길을 선택해 보세요.'},
  cross: {name:'다른 방향의 교차로',need:[],tip:'한 번 지나친 교차로도 다른 방향에서 들어오면 새로운 길이 돼요.'},
  current: {name:'이어지는 물살',need:['jet'],tip:'물줄기를 잇는 경로를 먼저 살펴보세요. 진입 방향이 중요해요.'},
  sand: {name:'멈춘 뒤 새 방향',need:['sand'],tip:'모래톱에서 멈춘 뒤, 벽에서는 닿지 못하는 방향으로 출발해 보세요.'},
  patrol: {name:'달라진 정지점',need:['boat'],tip:'한 번 움직인 뒤 구조정의 위치를 보고 다음 정지점을 정해 보세요.'},
  net: {name:'만들어 쓰는 정지점',need:['net'],tip:'그물은 한 번 치면 걷을 수 없어요. 숭어와 출구를 잇는 자리를 골라요.'},
  warp: {name:'소용돌이 왕복',need:['whirl'],tip:'소용돌이를 여러 번 건너며 수집해요. 돌아올 때의 진입 방향도 살펴보세요.'},
  relay: {name:'물살과 모래톱',need:['jet','sand'],tip:'물줄기로 접근하고 모래톱에서 멈춰요. 두 장치를 이어서 이용해 보세요.'},
};
function v6Hash(text) {let n=2166136261;for(const c of String(text)){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return n>>>0;}
function v6Eligible(tier,learned,target) {
  return V6_CATALOG.filter(p=>p.tier===tier&&p.minimum>=target.min&&p.minimum<=target.max&&p.escape>=target.escape
    && (!learned||V6_PATTERNS[p.pattern].need.every(d=>learned.includes(d))));
}
function v6Level(p,target) {
  const pattern=V6_PATTERNS[p.pattern];
  return {map:p.map.slice(),nets:p.nets,par:p.minimum+target.slack,name:pattern.name,idea:pattern.name,tip:pattern.tip,
    family:p.pattern,maskId:p.maskId,puzzleId:p.id,thinking:p.signature};
}
function selectV6(seed,tier,learned,target,history=[],puzzleId=null,family=null,ordinal=null) {
  if(puzzleId) {
    const p=V6_CATALOG.find(p=>p.id===puzzleId&&p.tier===tier);
    return p?v6Level(p,target):null; // a bad saved id never silently replaces the board
  }
  let pool=v6Eligible(tier,learned,target);
  const recent=history.slice(-6),last=recent.at(-1),recentIds=new Set(recent.map(r=>r.id));
  pool=pool.filter(p=>!recentIds.has(p.id));
  let families=[...new Set(pool.map(p=>p.pattern))];
  if(family&&families.includes(family))families=[family];
  else {
    const fresh=families.filter(f=>!recent.slice(-2).some(r=>r.pattern===f));
    families=fresh.length?fresh:families.filter(f=>f!==last?.pattern);
  }
  if(!families.length)return null;
  const chosen=families[v6Hash('idea:'+seed)%families.length];pool=pool.filter(p=>p.pattern===chosen);
  const distinct=pool.filter(p=>!recent.some(r=>r.signature===p.signature));if(distinct.length)pool=distinct;
  const differentShape=pool.filter(p=>p.maskId!==last?.maskId);if(differentShape.length)pool=differentShape;
  if(!pool.length)return null;
  const index=ordinal===null?v6Hash('board:'+seed)%pool.length:((ordinal%pool.length)+pool.length)%pool.length;
  return v6Level(pool[index],target);
}
function v6History(level) {return {id:level.puzzleId,pattern:level.family,signature:level.thinking,maskId:level.maskId};}
if(typeof module!=='undefined')module.exports={V6_PATTERNS,v6Hash,v6Eligible,v6Level,selectV6,v6History};
