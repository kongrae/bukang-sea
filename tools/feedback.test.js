const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gameBody } = require('./build-source');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8');

// The real feedbackMail() with the screen, platform and free-canal state stubbed. Opening the mail app is a device check.
function mail({ playing = false, platform, num = '', name = '', free = null } = {}) {
  const fn = source.match(/^function feedbackMail\(\) \{[^]*?\n\}/m)[0];
  const els = { gameScreen: { hidden: !playing }, lvNum: { textContent: num }, lvName: { textContent: name } };
  const url = new Function('$', 'window', 'FREE', `const APP_VERSION = '1.10 (11)';\n${fn}\nreturn feedbackMail();`)(
    id => els[id], { Capacitor: platform && { getPlatform: () => platform } }, free);
  const [, address, query] = url.match(/^mailto:([^?]+)\?(.+)$/);
  const params = new URLSearchParams(query);
  return { url, address, subject: params.get('subject'), lines: params.get('body').split('\r\n') };
}

test('title screen on the web: developer address, versioned subject and a context block the player can edit', () => {
  const m = mail();
  assert.equal(m.address, 'sky7700sky@naver.com');
  assert.equal(m.subject, '[상어 SOS 1.10] 의견');
  assert.deepEqual(m.lines.slice(0, 4), ['', '', '', '----------']);   // the player writes above the line
  assert.deepEqual(m.lines.slice(-3), ['앱 버전: 1.10 (11)', '환경: 웹', '화면: 메인 화면']);
  assert.ok(m.lines.every(line => !line.includes('\n')), 'every line break is CRLF');
  assert.match(m.url, /^[\x21-\x7e]+$/, 'Korean text and spaces are percent-encoded');
});

test('a story canal in the Android app is named by the label the HUD shows', () => {
  const m = mail({ playing: true, platform: 'android', num: '3장 · 수로 31 / 84 · 일반', name: '구조정 등장' });
  assert.deepEqual(m.lines.slice(-2), ['환경: Android 앱', '화면: 3장 · 수로 31 / 84 · 일반 · 구조정 등장']);
});

test('free canals add the generator version and map id; the title screen leaves them out', () => {
  const label = { playing: true, num: '자유 수로 · 보통 · 3번째', name: '물길 잇기' };
  assert.equal(mail({ ...label, free: { version: 7, seed: 9, level: { puzzleId: '187b5d1a1981' } } }).lines.at(-1),
    '화면: 자유 수로 · 보통 · 3번째 · 물길 잇기 · v7-187b5d1a1981');
  assert.equal(mail({ ...label, free: { version: 4, seed: 0, level: {} } }).lines.at(-1), '화면: 자유 수로 · 보통 · 3번째 · 물길 잇기 · v4-0');
  assert.equal(mail({ free: { version: 7, seed: 9, level: { puzzleId: '187b5d1a1981' } } }).lines.at(-1), '화면: 메인 화면');
});

test('settings offers the button between the device guide and close, and the build stamps the Android version', () => {
  const shell = fs.readFileSync(path.join(root, 'src/shell.html'), 'utf8');
  const at = id => shell.indexOf(`id="${id}"`);
  assert.ok(at('settingsOverlay') < at('deviceGuideBtn') && at('deviceGuideBtn') < at('feedbackBtn') && at('feedbackBtn') < at('settingsDone'));
  assert.ok(shell.includes('<button class="btn" id="feedbackBtn" type="button">의견 보내기</button>'));
  const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
  const version = `${gradle.match(/versionName "([^"]+)"/)[1]} (${gradle.match(/versionCode (\d+)/)[1]})`;
  const body = gameBody();
  assert.ok(body.includes(`const APP_VERSION = '${version}';`));
  assert.ok(!body.includes('@@APP_VERSION@@'));
});
