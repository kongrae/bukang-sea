/* Free v7: all devices are available, with one visit to each reasoning family before a family repeats. */
const FREE7_BASE = typeof module !== 'undefined' && typeof require === 'function' ? require('./puzzle-catalog-v6') : PUZZLE_CATALOG_V6;
const FREE7_EXTRA = typeof module !== 'undefined' && typeof require === 'function' ? require('./puzzle-extra-v7') : PUZZLE_EXTRA_V7;
const FREE7_OLD = typeof module !== 'undefined' && typeof require === 'function' ? require('./puzzle-v6') : {V6_PATTERNS,v6Hash};
const FREE7_PATTERNS = {...FREE7_OLD.V6_PATTERNS,
  current:{name:'물살의 방향',tip:'물줄기가 바꾸는 방향을 살펴보고, 원하는 정지점으로 접근해요.'},
  gate:{name:'수문을 바꾸는 순서',tip:'스위치에서 멈추면 수문이 열리고 닫혀요. 다음에 지나갈 길을 살펴요.'},
  crate:{name:'상자를 놓을 자리',tip:'상자에서 떨어진 곳에서 헤엄쳐 와 밀어요. 옮긴 뒤의 길도 생각해요.'},
};
const FREE7_CATALOG = [...FREE7_BASE,...FREE7_EXTRA];
function free7Level(p,target) {
  const pattern=FREE7_PATTERNS[p.pattern];
  return {map:p.map.slice(),nets:p.nets,par:p.minimum+target.slack,name:pattern.name,idea:pattern.name,tip:pattern.tip,
    family:p.pattern,maskId:p.maskId,puzzleId:p.id,thinking:p.signature};
}
function selectFreeV7(seed,tier,target,history=[],puzzleId=null) {
  if(puzzleId){const p=FREE7_CATALOG.find(p=>p.id===puzzleId&&p.tier===tier);return p?free7Level(p,target):null;}
  const recent=history.slice(-12),last=recent.at(-1),ids=new Set(recent.map(r=>r.id));
  let pool=FREE7_CATALOG.filter(p=>p.tier===tier&&p.minimum>=target.min&&p.minimum<=target.max&&p.escape>=target.escape&&!ids.has(p.id));
  const families=[...new Set(pool.map(p=>p.pattern))];if(!families.length)return null;
  const lastSeen=family=>recent.findLastIndex(r=>r.pattern===family),oldest=Math.min(...families.map(lastSeen));
  const available=families.filter(f=>lastSeen(f)===oldest),chosen=available[FREE7_OLD.v6Hash('free7-idea:'+seed)%available.length];
  pool=pool.filter(p=>p.pattern===chosen);
  const different=pool.filter(p=>!recent.some(r=>r.signature===p.signature));if(different.length)pool=different;
  const shape=pool.filter(p=>p.maskId!==last?.maskId);if(shape.length)pool=shape;
  return free7Level(pool[FREE7_OLD.v6Hash('free7-board:'+seed)%pool.length],target);
}
if(typeof module!=='undefined')module.exports={FREE7_PATTERNS,FREE7_CATALOG,free7Level,selectFreeV7};
