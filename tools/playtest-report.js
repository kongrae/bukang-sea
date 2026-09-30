// Manual human observations only. No telemetry, network access or synthetic player results.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const LEVELS = new Function(fs.readFileSync(path.join(root, 'src/levels.js'), 'utf8') + '; return LEVELS;')();
const ATTEMPT_HEADERS = ['participant_id','cohort','device','build','level','attempt','outcome','duration_sec','moves','stars','hints','undos','misinputs','assisted','notes','session'];
const SURVEY_HEADERS = ['participant_id','cohort','device','build','readability','control','fun','again','resume','notes','session'];
function buildId() {
  const body = [fs.readFileSync(path.join(root, 'src/shell.html'), 'utf8'), '<script>',
    ...['engine.js','levels.js','daily.js','free.js','game.js'].map(f => fs.readFileSync(path.join(root, 'src', f), 'utf8')), '</script>'].join('\n');
  return crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
}
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {cell += '"'; i++;}
      else if (c === '"') {quoted = false; closed = true;}
      else cell += c;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(cell); cell = ''; closed = false;
      if (c !== ',') {rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++;}
    } else if (c === '"' && !cell && !closed) quoted = true;
    else {if (closed || c === '"') throw new Error('CSV 따옴표 형식 오류'); cell += c;}
  }
  if (quoted) throw new Error('CSV의 닫히지 않은 따옴표');
  if (cell || row.length || closed) {row.push(cell); rows.push(row);}
  return rows.filter(r => r.some(c => c.trim()));
}
function records(text, headers) {
  const [head, ...rows] = parseCsv(text);
  if (!head || head.length !== headers.length || headers.some(h => !head.includes(h))) throw new Error('필수 CSV 헤더: ' + headers.join(','));
  return rows.map((r, i) => {
    if (r.length !== head.length) throw new Error(`데이터 ${i + 1}행의 열 개수 오류`);
    return Object.fromEntries(head.map((h, j) => [h, r[j].trim()]));
  });
}
function number(value, name, {min = 0, max = Infinity, integer = true, required = false} = {}) {
  if (value === '') {if (required) throw new Error(name + ' 누락'); return null;}
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw new Error(name + ' 숫자 범위 오류');
  return n;
}
function meta(r) {
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(r.participant_id)) throw new Error('participant_id는 익명 영문/숫자 ID');
  if (!['new','experienced'].includes(r.cohort) || !['android','iphone','desktop'].includes(r.device) || !['core','lab'].includes(r.session) || !/^[a-f0-9]{12}$/.test(r.build)) throw new Error('cohort/device/build/session 형식 오류');
  return r;
}
const personKey = r => [r.participant_id, r.build].join('|');
function checkPeople(rows) {
  const people = new Map();
  for (const r of rows) {
    const key = personKey(r), group = r.cohort + '|' + r.device;
    if (people.has(key) && people.get(key) !== group) throw new Error('동일 이용자의 cohort/device 불일치: ' + r.participant_id);
    people.set(key, group);
  }
}
function parseAttempts(text) {
  const seen = new Set();
  const rows = records(text, ATTEMPT_HEADERS).map(r => {
    meta(r);
    r.level = number(r.level, 'level', {min: 1, max: LEVELS.length, required: true});
    r.attempt = number(r.attempt, 'attempt', {min: 1, required: true});
    if (!['clear','abandon','timeout','blocked','not_run'].includes(r.outcome)) throw new Error('outcome 형식 오류');
    const key = personKey(r) + '|' + r.session + '|' + r.level + '|' + r.attempt;
    if (seen.has(key)) throw new Error('동일 이용자/빌드/수로/시도 중복'); seen.add(key);
    r.duration_sec = number(r.duration_sec, 'duration_sec', {integer: false, required: r.outcome !== 'not_run'});
    for (const field of ['moves','hints','undos','misinputs']) r[field] = number(r[field], field, {required: r.outcome === 'clear' && field === 'moves'});
    r.stars = number(r.stars, 'stars', {min: 1, max: 3, required: r.outcome === 'clear'});
    r.assisted = number(r.assisted, 'assisted', {max: 1});
    if (r.outcome !== 'clear' && r.stars !== null) throw new Error('미클리어 시도에는 stars를 비워 두세요');
    if (r.outcome === 'not_run' && ['duration_sec','moves','hints','undos','misinputs','assisted'].some(f => r[f] !== null)) throw new Error('not_run의 관찰 수치는 비워 두세요');
    return r;
  });
  checkPeople(rows);
  const groups = new Map();
  for (const r of rows) {const key = personKey(r) + '|' + r.session + '|' + r.level; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r);}
  for (const attempts of groups.values()) {
    attempts.sort((a, b) => a.attempt - b.attempt);
    if (attempts.some((r, i) => r.attempt !== i + 1) || (attempts.length > 1 && attempts.some(r => r.outcome === 'not_run'))) throw new Error('시도 번호는 1부터 연속이어야 합니다');
  }
  return rows;
}
function parseSurveys(text) {
  const seen = new Set();
  const rows = records(text, SURVEY_HEADERS).map(r => {
    meta(r); const key = personKey(r) + '|' + r.session;
    if (seen.has(key)) throw new Error('설문 중복'); seen.add(key);
    for (const f of ['readability','control','fun']) r[f] = number(r[f], f, {min: 1, max: 5});
    r.again = number(r.again, 'again', {max: 1});
    if (!['pass','fail','not_run',''].includes(r.resume)) throw new Error('resume 형식 오류');
    return r;
  });
  checkPeople(rows); return rows;
}
function median(values) {
  if (!values.length) return null;
  const a = values.slice().sort((x, y) => x - y), i = Math.floor(a.length / 2);
  return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2;
}
const fraction = (yes, all) => all.length ? `${all.filter(yes).length}/${all.length}` : '미수집';
function summarize(attempts, surveys) {
  checkPeople([...attempts, ...surveys]);
  const active = attempts.filter(r => r.outcome !== 'not_run'), first = active.filter(r => r.attempt === 1);
  const groups = new Map();
  for (const r of first) {
    const key = [r.build,r.session,r.cohort,r.device,r.level].join('|');
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r);
  }
  return {participants: new Set(active.map(personKey)).size, retries: active.filter(r => r.attempt > 1).length,
    notRun: attempts.filter(r => r.outcome === 'not_run').length, groups: [...groups.values()].map(rows => {
      const clear = rows.filter(r => r.outcome === 'clear'), hintsKnown = rows.filter(r => r.hints !== null), inputKnown = rows.filter(r => r.misinputs !== null);
      const helpKnown = rows.filter(r => r.hints !== null && r.assisted !== null);
      return {build:rows[0].build, session:rows[0].session, cohort:rows[0].cohort, device:rows[0].device, level:rows[0].level, n:rows.length,
        clear:fraction(r => r.outcome === 'clear', rows), three:fraction(r => r.stars === 3, rows),
        unaided:fraction(r => r.outcome === 'clear' && r.hints === 0 && r.assisted === 0, helpKnown),
        hints:fraction(r => r.hints > 0, hintsKnown), misinputs:fraction(r => r.misinputs > 0, inputKnown),
        clearSeconds:median(clear.map(r => r.duration_sec)), abandon:rows.filter(r => r.outcome === 'abandon').length,
        timeout:rows.filter(r => r.outcome === 'timeout').length, blocked:rows.filter(r => r.outcome === 'blocked').length};
    }).sort((a,b) => a.build.localeCompare(b.build) || a.session.localeCompare(b.session) || a.cohort.localeCompare(b.cohort) || a.device.localeCompare(b.device) || a.level - b.level)};
}
function makeReport(attempts = [], surveys = []) {
  const summary = summarize(attempts, surveys), currentBuild = buildId(), lines = ['# 플레이테스트 결과', '', `현재 게임 빌드: ${currentBuild}`, '',
    `실제 플레이 기록: ${summary.participants}명(빌드별 ID 기준). 재도전 ${summary.retries}건. 미실시 ${summary.notRun}건. 설문 ${surveys.length}건.`, '',
    summary.participants ? '아래 수치는 입력한 실제 관찰 기록만 집계했다. 첫 시도와 재도전을 분리하고 빌드·경험·기기별로 나눴다.' : '실제 이용자 플레이 기록이 없다. 체감 난이도·재미·휴대폰 조작 품질은 아직 판단할 수 없다.', '',
    '| 빌드 | 세션 | 경험 | 기기 | 수로 | 첫 시도 n | 탈출 | 별 3개 | 도움 없이 탈출 | 힌트 사용 | 오조작 발생 | 클리어 시간 중앙값(초) | 포기/초과/기능 막힘 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const g of summary.groups) lines.push(`| ${g.build} | ${g.session} | ${g.cohort} | ${g.device} | ${g.level}${g.build === currentBuild ? ' ' + LEVELS[g.level-1].name : ''} | ${g.n} | ${g.clear} | ${g.three} | ${g.unaided} | ${g.hints} | ${g.misinputs} | ${g.clearSeconds === null ? '미수집' : g.clearSeconds.toFixed(1)} | ${g.abandon}/${g.timeout}/${g.blocked} |`);
  if (!summary.groups.length) lines.push('| — | — | — | — | — | 0 | 미수집 | 미수집 | 미수집 | 미수집 | 미수집 | 미수집 | — |');
  lines.push('', '각 비율은 분자/관찰 가능한 분모다. 포기·시간 초과·기능 막힘도 첫 시도 탈출/별 분모에 포함한다. 미실시는 제외한다. 빈 관찰 수치는 0으로 간주하지 않는다. 시간 중앙값은 클리어한 첫 시도만 대상으로 하므로 포기/초과 건수와 함께 읽는다.', '',
    '## 설문', '', '| 빌드 | 세션 | 경험 | 기기 | n | 가독성 중앙값/n | 조작 중앙값/n | 재미 중앙값/n | 다시 할 의향 | 이어하기 성공 |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const surveyGroups = new Map();
  for (const r of surveys) {const key = [r.build,r.session,r.cohort,r.device].join('|'); if (!surveyGroups.has(key)) surveyGroups.set(key, []); surveyGroups.get(key).push(r);}
  const rating = (rows, f) => {const v = rows.map(r => r[f]).filter(v => v !== null); return v.length ? median(v).toFixed(1) + '/' + v.length : '미수집';};
  for (const rows of surveyGroups.values()) {const r=rows[0]; lines.push(`| ${r.build} | ${r.session} | ${r.cohort} | ${r.device} | ${rows.length} | ${rating(rows,'readability')} | ${rating(rows,'control')} | ${rating(rows,'fun')} | ${fraction(r=>r.again===1,rows.filter(r=>r.again!==null))} | ${fraction(r=>r.resume==='pass',rows.filter(r=>['pass','fail'].includes(r.resume)))} |`);}
  if (!surveyGroups.size) lines.push('| — | — | — | — | 0 | 미수집 | 미수집 | 미수집 | 미수집 | 미수집 |');
  lines.push('', '표본이 적으면 원인 파악용 관찰로만 사용한다. 서로 다른 빌드/경험/기기 기록을 합쳐 개선 효과나 시장 반응을 단정하지 않는다. 개별 발언과 재현 절차는 원본 notes를 함께 읽는다.', '');
  return lines.join('\n');
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2), outAt = args.indexOf('--out');
    const output = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
    if (outAt >= 0 && !output) throw new Error('--out 뒤에 보고서 경로를 지정하세요');
    if (args.length > 2) throw new Error('사용법: node tools/playtest-report.js [attempts.csv] [survey.csv] [--out report.md]');
    const report = makeReport(args[0] ? parseAttempts(fs.readFileSync(args[0], 'utf8')) : [], args[1] ? parseSurveys(fs.readFileSync(args[1], 'utf8')) : []);
    if (output) {fs.mkdirSync(path.dirname(path.resolve(output)), {recursive:true}); fs.writeFileSync(output, report); console.log('wrote ' + output);}
    else console.log(report);
  } catch (e) {console.error(e.message); process.exitCode = 1;}
}
module.exports = {ATTEMPT_HEADERS,SURVEY_HEADERS,buildId,parseCsv,parseAttempts,parseSurveys,summarize,makeReport};
