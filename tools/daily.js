// Checks the daily canal generator ahead of time: every date must yield a solvable puzzle quickly.
//   node tools/daily.js [days=90] [start=today]      e.g. node tools/daily.js 365 2026-10-01
// Prints one line per date and a summary (par spread, slowest generation). Exits 1 if any date fails.
const { makeDaily, dailyDate } = require('../src/daily.js');
const E = require('../src/engine.js');

const days = +(process.argv[2] || 90);
const start = process.argv[3] ? new Date(process.argv[3] + 'T00:00:00') : new Date();
const DAY = '일월화수목금토';
let failed = 0, slowest = 0; const byTier = {};
for (let i = 0; i < days; i++) {
  const d = new Date(start); d.setDate(d.getDate() + i);
  const date = dailyDate(d), t0 = Date.now(), daily = makeDaily(date), ms = Date.now() - t0;
  slowest = Math.max(slowest, ms);
  if (!daily) { failed++; console.log(`FAIL ${date}`); continue; }
  const g = E.parseLevel(daily.level), p = E.plan(g, g.start, 0, new Set(), g.nets, true);
  const ok = p && p.moves === daily.level.par;
  if (!ok) failed++;
  const key = DAY[daily.weekday]; (byTier[key] = byTier[key] || []).push(daily.level.par);
  if (days <= 31 || !ok) console.log(`${ok ? 'ok  ' : 'FAIL'} ${date} (${key}) ${daily.tier.label.padEnd(3, '　')} par ${String(daily.level.par).padStart(2)} nets ${daily.level.nets} ${ms}ms`);
}
console.log('\npar by weekday:', Object.entries(byTier).map(([k, v]) => `${k} ${Math.min(...v)}-${Math.max(...v)}`).join(' · '));
console.log(`slowest generation ${slowest}ms (node; phones are roughly 3-5x slower)`);
console.log(failed ? `${failed} date(s) failed` : `all ${days} dates ok`);
process.exit(failed ? 1 : 0);
