/* ---------- Daily canal: one generated puzzle per calendar day, the same for every player ---------- */
// Canal masks ('#' promenade, '.' water, S start, E sea exit). Shared with tools/gen.js.
const MASKS = {
  bend:   ['###E###', '##...##', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '##...##', '###S###'],
  hook:   ['#####E#', '#.....#', '#.....#', '#..####', '#..####', '#.....#', '#.....#', '#.....#', '##S####'],
  wide:   ['#E#####', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '####S##'],
  scurve: ['######E', '#......', '#......', '#...###', '#...###', '###...#', '###...#', '#.....#', '#.....#', '##S####'],
  basin:  ['###E###', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '###S###'],
  // chapter 2: 친수공원 운하
  island: ['###E###', '#.....#', '#.....#', '#..#..#', '#..#..#', '#.....#', '#.....#', '#..#..#', '#.....#', '###S###'],
  ring:   ['####E##', '#.....#', '#.....#', '#..##.#', '#..##.#', '#.....#', '#.....#', '##S####'],
  zigzag: ['#####E#', '#.....#', '#.....#', '#...###', '#.....#', '###...#', '#.....#', '#...###', '#.....#', '#.....#', '#S#####'],
  side:   ['#######', '#.....#', '#.....E', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '###S###'],
  fork:   ['###E####', '#......#', '#......#', '#..##..#', '#..##..#', '#..##..#', '#......#', '#......#', '####S###'],
  // chapter 3: 방파제 너머
  harbor: ['####E####', '#.......#', '#.......#', '#..###..#', '#.......#', '#.......#', '#.......#', '##.....##', '#.......#', '#.......#', '####S####'],
  breakwater: ['########', 'E......#', '#......#', '####...#', '#......#', '#......#', '#...####', '#......#', '#......#', '#......#', '#......#', '######S#'],
  lagoon: ['#######E#', '#.......#', '#.......#', '#.##....#', '#.##....#', '#.......#', '#....##.#', '#....##.#', '#.......#', '#S#######'],
  // chapter 4: 외항 물길 (twin/moat have water that only a whirlpool pair can connect)
  shoal:  ['####E####', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '####S####'],
  twin:   ['#####E###', '#...#...#', '#...#...#', '#...#...#', '#...#...#', '#...#...#', '#...#...#', '#...#...#', '#S#######'],
  moat:   ['####E####', '#.......#', '#.......#', '#.#####.#', '#.#...#.#', '#.#...#.#', '#.#####.#', '#.......#', '#.......#', '####S####'],
  delta:  ['#E#######', '#.......#', '#.......#', '#####...#', '#.......#', '#.......#', '#...#####', '#.......#', '#.......#', '#######S#'],
};

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
// drop objects onto random free water tiles of a mask
function place(mask, spec, rand) {
  const rows = mask.map(r => r.split(''));
  const free = [];
  rows.forEach((r, y) => r.forEach((c, x) => { if (c === '.') free.push([x, y]); }));
  const put = (ch, n) => {
    for (let i = 0; i < n && free.length; i++) {
      const [x, y] = free.splice(Math.floor(rand() * free.length), 1)[0];
      rows[y][x] = typeof ch === 'function' ? ch() : ch;
    }
  };
  put('o', spec.buoys || 0);
  put('b', spec.boats || 0);
  put(() => '<>^v'[Math.floor(rand() * 4)], spec.jets || 0);
  // later devices; a count of 0 draws no random numbers, so recipes without them are unaffected
  put('B', spec.vboats || 0);   // patrol boat moving along its column ('b' = along its row)
  put('s', spec.sand || 0);
  put('w', spec.whirls ? 2 : 0);
  put('f', spec.fish || 0);
  return rows.map(r => r.join(''));
}

// Weekday recipe, index = Date#getDay() (0 = Sunday). Easy on Monday, hardest on the weekend, nets on Fri/Sun.
// Changing a recipe changes past and future dailies, so bump DAILY_VERSION when you do.
const DAILY_VERSION = 2;   // v2 (2026-09-30, before release): moving boats, sandbars and whirlpools in the mix
const DAILY_TIERS = [
  { stars: 5, label: '어려움', masks: ['twin', 'moat', 'delta'], spec: { nets: 1, whirls: 1, sand: 1, jets: 1, buoys: 2, fish: 3 }, par: [10, 15], tip: '일요일은 그물·소용돌이·모래톱을 모두 써요.' },
  { stars: 1, label: '쉬움', masks: ['bend', 'hook', 'wide'], spec: { buoys: 2, fish: 1 }, par: [5, 7], tip: '한 주의 시작은 가볍게. 숭어 한 마리를 챙겨요.' },
  { stars: 1, label: '쉬움', masks: ['island', 'ring', 'side'], spec: { buoys: 2, boats: 1, fish: 2 }, par: [6, 8], tip: '구조정은 한 칸씩 오가요. 때를 맞춰 보세요.' },
  { stars: 2, label: '보통', masks: ['zigzag', 'scurve', 'fork'], spec: { buoys: 2, jets: 1, fish: 2 }, par: [7, 9], tip: '물줄기 하나가 길을 바꿔요.' },
  { stars: 3, label: '보통', masks: ['basin', 'shoal', 'delta'], spec: { buoys: 2, jets: 1, sand: 2, fish: 2 }, par: [8, 11], tip: '모래톱에 올라서면 그 자리에서 멈춰요.' },
  { stars: 3, label: '그물', masks: ['island', 'side', 'hook'], spec: { nets: 1, buoys: 2, fish: 2 }, par: [7, 10], tip: '금요일은 그물의 날. 멈출 자리를 만들어요.' },
  { stars: 4, label: '어려움', masks: ['twin', 'moat', 'shoal', 'harbor'], spec: { jets: 2, buoys: 2, boats: 1, whirls: 1, sand: 1, fish: 3 }, par: [10, 14], tip: '주말 수로에는 소용돌이와 구조정이 함께 나와요.' },
];

// engine functions: globals in the browser build, required in node tools
const DE = typeof module !== 'undefined' && typeof require === 'function' ? require('./engine.js') : { parseLevel, fixedNetPlan, bfsFrom };

function dailySeed(text) {   // FNV-1a
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function dailyDate(d = new Date()) {   // local calendar date, YYYY-MM-DD
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Returns { date, weekday, tier, level } or null. Same date -> same puzzle on every device.
function makeDaily(date) {
  const [y, m, d] = date.split('-').map(Number), weekday = new Date(y, m - 1, d).getDay(), tier = DAILY_TIERS[weekday];
  const nets = tier.spec.nets || 0, tries = nets ? 40 : 150, mid = (tier.par[0] + tier.par[1]) / 2;
  for (let salt = 0; salt < 6; salt++) {   // a salt round only fails if no candidate at all was solvable
    const rand = rng(dailySeed(`lostshark-daily-v${DAILY_VERSION}-${date}-${salt}`));
    const mask = MASKS[tier.masks[Math.floor(rand() * tier.masks.length)]];
    let best = null;
    for (let t = 0; t < tries; t++) {
      const map = place(mask, tier.spec, rand);
      if (map.some(r => /><|<>/.test(r))) continue;                         // facing jets read as a glitch
      const g = DE.parseLevel({ name: 'daily', map, nets });
      // Keep v2 puzzle selection and star targets stable; live hints use the movable-net solver.
      const full = DE.fixedNetPlan(g, g.start, 0, new Set(), nets, true);
      if (!full) continue;
      if (nets && DE.bfsFrom(g, g.start, 0, new Set(), true, 60)) continue;  // the net must be needed
      const escape = DE.fixedNetPlan(g, g.start, 0, new Set(), nets, false);
      if (full.moves < tier.par[0] - 1 || escape.moves < 2) continue;         // too easy / straight shot to the sea
      const inRange = full.moves >= tier.par[0] && full.moves <= tier.par[1], detour = full.moves - escape.moves;
      const score = (inRange ? 100 : -Math.abs(full.moves - mid) * 10) + detour * 3;
      if (!best || score > best.score) best = { score, map, par: full.moves };
      if (inRange && detour >= 2 && t >= tries / 3) break;
    }
    if (best) return { date, weekday, tier, level: { par: best.par, name: '오늘의 수로', nets, tip: tier.tip, map: best.map } };
  }
  return null;
}
if (typeof module !== 'undefined') module.exports = { MASKS, rng, place, DAILY_TIERS, DAILY_VERSION, dailySeed, dailyDate, makeDaily };
