/* ---------- Free canals: seeded puzzles, independent of calendar dates ---------- */
const FREE_VERSION = 1;
const FE = typeof module !== 'undefined' && typeof require === 'function' ? require('./engine.js') : { parseLevel };
const FD = typeof module !== 'undefined' && typeof require === 'function' ? require('./daily.js')
  : { MASKS, rng, place, dailySeed, operationPlan, DAILY_STAGES, DAILY_FALLBACKS };
const FREE_TIERS = FD.DAILY_STAGES.map((tier, difficulty) => ({ ...tier,
  name: ['느긋한 물길', '굽이진 물길', '거센 물길'][difficulty],
  description: ['기본 이동과 숭어 수집', '물줄기·구조정·모래톱', '소용돌이와 그물까지'][difficulty],
  tip: ['가볍게 한 판! 숭어를 챙기며 길을 찾아요.', '장치가 있는 물길이에요. 멈출 자리를 살펴보세요.', '장치를 함께 이용해 바다로 가는 길을 열어 주세요.'][difficulty],
}));
function freeId(run) { return `free:v${run.version}:${run.difficulty}:${run.serial}:${run.seed}`; }
// Each seed regenerates the same map. Work limits and yields are shared with the verified operation solver.
function* makeFreeSearch(seed, difficulty) {
  const tier = FREE_TIERS[difficulty];
  if (!Number.isInteger(difficulty) || !tier || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
  const rand = FD.rng(FD.dailySeed(`shark-sos-free-v${FREE_VERSION}-${difficulty}-${seed}`));
  const variant = Math.floor(rand() * 4), nets = difficulty === 2 && variant === 0 ? 1 : 0;
  const spec = difficulty === 0 ? { buoys: 3, fish: 2 }
    : difficulty === 1 ? { buoys: 3, fish: 2, jets: variant % 2, boats: +(variant === 2), sand: 1 }
    : { buoys: 3, fish: 3, jets: 1, sand: 1, whirls: +(variant >= 2), boats: nets ? 0 : 1 };
  for (let attempt = 0; attempt < 240; attempt++) {
    yield;
    const map = FD.place(FD.MASKS[tier.masks[Math.floor(rand() * tier.masks.length)]], spec, rand);
    if (map.some(row => /><|<>/.test(row))) continue;
    const g = FE.parseLevel({ map, nets }), full = yield* FD.operationPlan(g, nets, true);
    if (!full || full.moves < tier.min || full.moves > tier.max) continue;
    const escape = yield* FD.operationPlan(g, nets, false);
    if (!escape || escape.moves < tier.escape || full.moves <= escape.moves) continue;
    if (nets && (yield* FD.operationPlan(g, 0, true)) !== null) continue;
    return { version: FREE_VERSION, seed, difficulty,
      level: { name: tier.name, map, nets, par: full.moves + tier.slack, tip: tier.tip } };
  }
  const fallback = FD.DAILY_FALLBACKS[difficulty];
  return { version: FREE_VERSION, seed, difficulty, fallback: true,
    level: { ...fallback, map: fallback.map.slice(), name: tier.name, tip: tier.tip } };
}
function makeFree(seed, difficulty) {
  const search = makeFreeSearch(seed, difficulty); let step;
  do { step = search.next(); } while (!step.done);
  return step.value;
}
if (typeof module !== 'undefined') module.exports = { FREE_VERSION, FREE_TIERS, freeId, makeFreeSearch, makeFree };
