const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const R = require('./playtest-report.js');
// Fictional parser fixtures, never exported as human observations.
const build = '123456789abc';
const csv = (headers, rows) => [headers.join(','), ...rows.map(row => row.map(v => '"' + String(v ?? '').replace(/"/g,'""') + '"').join(','))].join('\r\n');
const attempt = (id, n, outcome, seconds, hints=0, input=0, assisted=0, otherBuild=build) => [id,'new','android',otherBuild,6,n,outcome,seconds,outcome==='clear'?7:'',outcome==='clear'?3:'',hints,0,input,assisted,'','core'];

test('CSV handles Excel BOM, reordered headers, quoted commas, quotes and multiline notes', () => {
  const row = attempt('P01',1,'clear',40); row[14] = '그물, "회수"\n확인';
  const parsed = R.parseAttempts('\uFEFF' + csv(R.ATTEMPT_HEADERS.slice().reverse(), [row.slice().reverse()]));
  assert.equal(parsed[0].notes, row[14]); assert.equal(parsed[0].duration_sec, 40);
  assert.throws(() => R.parseCsv('a\n"broken'), /따옴표/);
});
test('first attempts include dropout and timeout, while retries and not-run rows stay separate', () => {
  const skipped = attempt('P04',1,'not_run','',null,null,null); skipped[11]='';
  const rows = R.parseAttempts(csv(R.ATTEMPT_HEADERS,[attempt('P01',1,'clear',40),attempt('P02',1,'abandon',60,1),attempt('P02',2,'clear',20),attempt('P03',1,'timeout',120),skipped]));
  const s=R.summarize(rows,[]), g=s.groups[0];
  assert.equal(s.participants,3); assert.equal(s.retries,1); assert.equal(s.notRun,1);
  assert.equal(g.n,3); assert.equal(g.clear,'1/3'); assert.equal(g.three,'1/3'); assert.equal(g.clearSeconds,40);
  assert.equal(g.unaided,'1/3'); assert.equal(g.hints,'1/3');
});
test('missing observations do not become zero and builds are not pooled', () => {
  const rows=R.parseAttempts(csv(R.ATTEMPT_HEADERS,[attempt('P01',1,'clear',40,null,null,null),attempt('P02',1,'clear',20,0,0,0,'abcdef123456')]));
  const s=R.summarize(rows,[]);
  assert.equal(s.groups.length,2);
  const group=s.groups.find(g=>g.build===build);
  assert.equal(group.hints,'미수집'); assert.equal(group.misinputs,'미수집'); assert.equal(group.unaided,'미수집');
  const survey=R.parseSurveys(csv(R.SURVEY_HEADERS,[['P01','new','android',build,'',4,3,'','not_run','','core']]));
  const report=R.makeReport(rows,survey);
  assert.ok(report.includes('미수집 | 4.0/1 | 3.0/1 | 미수집 | 미수집'));
});
test('duplicate attempts, missing first attempts and contradictory metadata are rejected', () => {
  const row=attempt('P01',1,'clear',40);
  assert.throws(()=>R.parseAttempts(csv(R.ATTEMPT_HEADERS,[row,row])),/중복/);
  assert.throws(()=>R.parseAttempts(csv(R.ATTEMPT_HEADERS,[attempt('P01',2,'clear',40)])),/1부터/);
  const wrong=attempt('P01',2,'clear',30); wrong[2]='iphone';
  assert.throws(()=>R.parseAttempts(csv(R.ATTEMPT_HEADERS,[row,wrong])),/불일치/);
  const bad=row.slice();bad[9]=''; assert.throws(()=>R.parseAttempts(csv(R.ATTEMPT_HEADERS,[bad])),/누락/);
  assert.throws(()=>R.parseSurveys(csv(R.SURVEY_HEADERS,[['P01','new','android',build,6,4,3,1,'pass','','core']])),/범위/);
});
test('empty observations produce an explicit pending report, not an estimated human score', () => {
  const report=R.makeReport();
  assert.ok(report.includes('실제 플레이 기록: 0명')); assert.ok(report.includes('아직 판단할 수 없다'));
  assert.ok(!report.includes('합격'));
});
test('natural progression and facilitated lab sessions are never pooled', () => {
  const normal=attempt('P01',1,'clear',40), lab=attempt('P01',1,'clear',20); lab[15]='lab';
  const s=R.summarize(R.parseAttempts(csv(R.ATTEMPT_HEADERS,[normal,lab])),[]);
  assert.equal(s.groups.length,2); assert.equal(s.participants,1);
  assert.equal(s.groups.find(g=>g.session==='core').clearSeconds,40);
  assert.equal(s.groups.find(g=>g.session==='lab').clearSeconds,20);
});
test('test build preserves progression by default and unlocks later stages only in its isolated lab mode', () => {
  const root=path.join(__dirname,'..');
  execFileSync(process.execPath,['tools/build.js','--playtest'],{cwd:root});
  const file=fs.readFileSync(path.join(root,'playtest/index.html'),'utf8');
  const unlockedSource = file.match(/^const unlocked = .*$/m)[0];
  const normal = new Function('testAll','save',unlockedSource + '; return unlocked;')(false,{best:{}});
  const lab = new Function('testAll','save',unlockedSource + '; return unlocked;')(true,{best:{}});
  assert.equal(normal(0),true); assert.equal(normal(47),false); assert.equal(lab(47),true);
  // The pilot course follows the same rule: natural order by default, every course canal only in lab mode.
  const pilotSource = file.match(/^const pilotUnlocked = .*$/m)[0];
  const pilotNormal = new Function('testAll','pilotStars',pilotSource + '; return pilotUnlocked;')(false,()=>0);
  const pilotLab = new Function('testAll','pilotStars',pilotSource + '; return pilotUnlocked;')(true,()=>0);
  assert.equal(pilotNormal(0),true); assert.equal(pilotNormal(11),false); assert.equal(pilotLab(11),true);
  assert.ok(file.includes("(testAll ? 'lab-' : 'core-')"));
  assert.ok(file.includes('bukang-sea-playtest-'+R.buildId()));
  assert.ok(file.includes('PLAYTEST · '+R.buildId()));
  assert.ok(!file.includes("const STORE_KEY = 'bukang-sea-v1';"));
  assert.ok(!file.includes("navigator.serviceWorker.register"));
  for(const rel of ['src/game.js','dist/index.html','dist/artifact.html']) {
    const prod=fs.readFileSync(path.join(root,rel),'utf8');
    assert.ok(prod.includes("const STORE_KEY = 'bukang-sea-v1';"),rel);
    assert.ok(prod.includes('const unlocked = i => i === 0 || save.best[i - 1] != null ||'),rel);
    assert.ok(!prod.includes('const unlocked = i => testAll'),rel);
    assert.ok(prod.includes('const pilotUnlocked = i => i === 0 || pilotStars(i - 1) > 0;'),rel);
  }
});
test('pilot canals keep their p01–p12 ids in the attempts sheet and are listed after story numbers, never merged', () => {
  const pilot=attempt('P05',1,'clear',55); pilot[4]='p05';
  const rows=R.parseAttempts(csv(R.ATTEMPT_HEADERS,[attempt('P05',1,'clear',40),pilot]));
  const s=R.summarize(rows,[]);
  assert.deepEqual(s.groups.map(g=>g.level),[6,'p05']);
  const unknown=pilot.slice(); unknown[4]='p13';
  assert.throws(()=>R.parseAttempts(csv(R.ATTEMPT_HEADERS,[unknown])),/범위/);
  const current=pilot.slice(); current[3]=R.buildId();
  assert.ok(R.makeReport(R.parseAttempts(csv(R.ATTEMPT_HEADERS,[current])),[]).includes('p05 시험 첫 수문'));
});
test('pilot survey separates no answer from none, rejects unknown canals, and reports mentions with their denominators', () => {
  const row=(id,rule,hints,repeat,next)=>[id,'new','android',build,rule,hints,repeat,next,'','core'];
  const surveys=R.parsePilotSurveys(csv(R.PILOT_SURVEY_HEADERS,[row('P11','yes','p06;p08','none',4),row('P12','partly','p08','p02',5),row('P13','','','','')]));
  assert.equal(surveys[2].hint_levels,null); assert.deepEqual(surveys[0].repeat_levels,[]);
  const report=R.makeReport([],[],surveys);
  assert.ok(report.includes('| 3 | 1/1/0 (n=2) | 4.5/2 | p08 2/2, p06 1/2 | p02 1/2 |'));
  assert.throws(()=>R.parsePilotSurveys(csv(R.PILOT_SURVEY_HEADERS,[row('P11','yes','p99','',3)])),/p01–p12/);
  assert.throws(()=>R.parsePilotSurveys(csv(R.PILOT_SURVEY_HEADERS,[row('P11','maybe','','',3)])),/gate_rule/);
  assert.throws(()=>R.parsePilotSurveys(csv(R.PILOT_SURVEY_HEADERS,[row('P11','yes','','',6)])),/범위/);
  assert.ok(R.makeReport().includes('| — | — | — | — | 0 | 미수집 | 미수집 | 미수집 | 미수집 |'),'empty pilot section is pending, not zero');
});
