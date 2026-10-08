/* ---------- Free canals: seeded puzzles, independent of calendar dates ---------- */
const FREE_VERSION = 4;
const FREE_VERSIONS = [1, 2, 3, 4];   // every version a kept run may still be on
const FE = typeof module !== 'undefined' && typeof require === 'function' ? require('./engine.js') : { parseLevel };
const FD = typeof module !== 'undefined' && typeof require === 'function' ? require('./daily.js')
  : { MASKS, rng, place, dailySeed, operationPlan, placedOperationPlan, DAILY_STAGES, DAILY_FALLBACKS };
const FV = typeof module !== 'undefined' && typeof require === 'function' ? require('./variety.js')
  : { VARIETY_FAMILIES, VARIETY_FREE_TIERS, variedCanalSearch, varietyFamilyKnown };
const FREE_RESERVES = typeof module !== 'undefined' && typeof require === 'function' ? require('./variety-reserves.js') : VARIETY_RESERVES;
const FREE_LEGACY_TIERS = FD.DAILY_STAGES.map((tier, difficulty) => ({ ...tier,
  name: ['느긋한 물길', '굽이진 물길', '거센 물길'][difficulty],
  description: ['기본 이동과 숭어 수집', '물줄기·구조정·모래톱', '소용돌이와 그물까지'][difficulty],
  tip: ['가볍게 한 판! 숭어를 챙기며 길을 찾아요.', '장치가 있는 물길이에요. 멈출 자리를 살펴보세요.', '장치를 함께 이용해 바다로 가는 길을 열어 주세요.'][difficulty],
}));
const FREE_TIERS = FREE_LEGACY_TIERS.map((tier, difficulty) => ({ ...tier, ...FV.VARIETY_FREE_TIERS[difficulty],
  description: ['갈림길·순환로·작은 우회', '물살·순찰선·멈춤 자리', '그물 재사용·떨어진 물길'][difficulty] }));
function freeId(run) { return `free:v${run.version}:${run.difficulty}:${run.serial}:${run.seed}`; }
// Each seed regenerates the same map. Work limits and yields are shared with the verified operation solver.
function* makeFreeV1Search(seed, difficulty) {
  const tier = FREE_LEGACY_TIERS[difficulty];
  if (!Number.isInteger(difficulty) || !tier || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
  const rand = FD.rng(FD.dailySeed(`shark-sos-free-v1-${difficulty}-${seed}`));
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
    return { version: 1, seed, difficulty,
      level: { name: tier.name, map, nets, par: full.moves + tier.slack, tip: tier.tip } };
  }
  const fallback = FD.DAILY_FALLBACKS[difficulty];
  return { version: 1, seed, difficulty, fallback: true,
    level: { ...fallback, map: fallback.map.slice(), name: tier.name, tip: tier.tip } };
}
// v3 (2026-10-08): only families whose device the story has taught (learned: story device keys, null = all). Fewer than
// two left adds the device-free families. With every device learned v3 equals v2. A kept run passes its saved family.
// v4 (2026-10-08 net rule): a set net stays until undo/restart, so net canals are generated and rated with that rule
// (no pickup-rated net reserves; if a family yields nothing the next one is tried). Without nets v4 equals v3.
const FREE_BASE_FAMILIES = ['branches', 'loop', 'pockets'];
function freeFamilies(tier, learned) {
  const known = tier.families.filter(family => FV.varietyFamilyKnown(family, learned));
  return known.length >= 2 ? known : [...new Set([...known, ...FREE_BASE_FAMILIES])];
}
function* makeFreeSearch(seed, difficulty, version = FREE_VERSION, learned = null, family = null) {
  if (version === 1) return yield* makeFreeV1Search(seed, difficulty);
  const tier = FREE_TIERS[difficulty];
  if (![2, 3, 4].includes(version) || !Number.isInteger(difficulty) || !tier || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
  const mixed = FD.dailySeed(`shark-sos-free-v2-${difficulty}-${seed}`), families = version === 2 ? tier.families : freeFamilies(tier, learned);
  const chosen = version >= 3 && FV.VARIETY_FAMILIES[family] ? family : families[mixed % families.length];
  const order = version >= 4 && !family ? [chosen, ...families.filter(f => f !== chosen)] : [chosen];
  const deps = version >= 4 ? { ...FD, operationPlan: FD.placedOperationPlan, placedNets: true } : FD;
  for (const next of order) {
    const level = yield* FV.variedCanalSearch(mixed, next, tier, deps, FREE_RESERVES);
    if (level) return { version, seed, difficulty, fallback: !!level.fallback, level: { ...level, name: level.idea } };
  }
  return null;
}
function makeFree(seed, difficulty, version = FREE_VERSION, learned = null, family = null) {
  const search = makeFreeSearch(seed, difficulty, version, learned, family); let step;
  do { step = search.next(); } while (!step.done);
  return step.value;
}
if (typeof module !== 'undefined') module.exports = { FREE_VERSION, FREE_VERSIONS, FREE_BASE_FAMILIES, freeFamilies, FREE_TIERS, FREE_LEGACY_TIERS, freeId, makeFreeSearch, makeFree };
