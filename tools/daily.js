// Verify all three operation stages. --legacy checks the previous single-puzzle generator.
// --learned=jet,boat checks operation v3 for a player who has learned only those story devices (--learned= for none).
//   node tools/daily.js [days=90] [start=today] [--legacy] [--learned=...]
const { makeDaily, makeDailyStage, dailyDate, DAILY_STAGES, DAILY_OPERATION_VERSION } = require('../src/daily.js');
const E = require('../src/engine.js');
const { replayPlan } = require('./replay-plan.js');

const args = process.argv.slice(2).filter(a => a !== '--legacy' && !a.startsWith('--learned=')), legacy = process.argv.includes('--legacy');
const learnedArg = process.argv.find(a => a.startsWith('--learned=')), learned = learnedArg ? learnedArg.slice(10).split(',').filter(Boolean) : null;
const DEVICES = { jet: /[<>^v]/, boat: /[bB]/, sand: /s/, whirl: /w/ };
const days = +(args[0] || 90);
const start = args[1] ? new Date(args[1] + 'T00:00:00') : new Date();
const DAY = '일월화수목금토';
let failed = 0, slowest = 0, slowestSolve = 0, targetsToReview = 0, reserves = 0; const byTier = {};
for (let i = 0; i < days; i++) {
  const d = new Date(start); d.setDate(d.getDate() + i);
  const date = dailyDate(d);
  for (let stage = 0; stage < (legacy ? 1 : 3); stage++) {
    const t0 = Date.now(), daily = legacy ? makeDaily(date) : makeDailyStage(date, stage, DAILY_OPERATION_VERSION, learned), ms = Date.now() - t0;
    slowest = Math.max(slowest, ms);
    if (!daily) { failed++; console.log(`FAIL ${date}`); continue; }
    const g = E.parseLevel(daily.level), t1 = Date.now(), p = E.plan(g, g.start, 0, new Set(), g.nets, true);
    slowestSolve = Math.max(slowestSolve, Date.now() - t1);
    let ok = p && p.moves <= daily.level.par;
    if (legacy && p && p.moves < daily.level.par) targetsToReview++;
    if (p) { try { replayPlan(g, p); } catch (e) { ok = false; console.log(`FAIL ${date} replay: ${e.message}`); } }
    if (!legacy) {
      const tier = DAILY_STAGES[stage], escape = E.plan(g, g.start, 0, new Set(), g.nets, false);
      ok = ok && p.moves >= tier.min && p.moves <= tier.max && daily.level.par === p.moves + tier.slack
        && escape && escape.moves >= tier.escape && escape.moves < p.moves;
      if (escape) { try { replayPlan(g, escape, {needAll:false}); } catch (e) { ok = false; } }
      if (g.nets && E.plan(g, g.start, 0, new Set(), 0, true)) ok = false;
      if (learned && (g.nets && !learned.includes('net') || Object.entries(DEVICES).some(([d, tile]) => !learned.includes(d) && tile.test(daily.level.map.join(''))))) ok = false;
      if (daily.fallback) reserves++;
    }
    if (!ok) failed++;
    const key = legacy ? DAY[daily.weekday] : `${stage + 1} ${daily.tier.label}`;
    (byTier[key] = byTier[key] || []).push(daily.level.par);
    if (days <= 31 || !ok) console.log(`${ok ? 'ok  ' : 'FAIL'} ${date} (${key}) par ${String(daily.level.par).padStart(2)} minimum ${p ? p.moves : '-'} nets ${daily.level.nets} ${ms}ms`);
  }
}
console.log('\npar ranges:', Object.entries(byTier).map(([k, v]) => `${k} ${Math.min(...v)}-${Math.max(...v)}`).join(' · '));
console.log(`slowest generation ${slowest}ms, reusable-net search ${slowestSolve}ms (Node; physical phones not measured)`);
if (targetsToReview) console.log(`${targetsToReview} dates have a star target above the minimum; daily-v2 puzzles and targets are preserved.`);
if (!legacy) console.log(`verified reserve routes used: ${reserves}${learned ? ` (learned devices: ${learned.join(', ') || 'none'})` : ''}`);
console.log(failed ? `${failed} puzzle(s) failed` : `all ${days} dates / ${days * (legacy ? 1 : 3)} puzzles ok`);
process.exit(failed ? 1 : 0);
