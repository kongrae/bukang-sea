const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/art.js'), 'utf8');
const game = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8');
function art() {
  const pending = [], noop = () => {};
  const ctx = new Proxy({}, { get: () => noop });
  const Image = function () { this.width = this.height = this.naturalWidth = this.naturalHeight = 256; pending.push(this); };
  const document = { createElement: () => ({ getContext: () => ctx }) };
  const api = new Function('Image', 'document', source + '; return SHARK_ART;')(Image, document);
  return { api, pending, ctx };
}
test('failed or delayed art remains optional and the actual shark fallback still draws', () => {
  const { api, pending } = art(); let paints = 0, notifications = 0;
  api.onReady = () => notifications++; api.load();
  const ctx = new Proxy({}, { get: (_, key) => key === 'fill' ? () => paints++ : () => {} });
  assert.equal(api.draw(ctx, 'swim', 0, 0, 40), false);
  pending.forEach(image => image.onerror());
  assert.equal(notifications, 3);
  const fn = game.slice(game.indexOf('function drawShark('), game.indexOf('function drawFish('));
  const draw = new Function('SHARK_ART', 'C', 'reduceMotion', fn + ';return drawShark;')(api, {}, true);
  draw(ctx, 0, 0, 0, 48, 0, false, 1, 1, { id: 'basic' });
  assert.ok(paints > 0, 'fallback remains visible when every image fails');
});
test('loaded sprites reuse skin bitmaps and notify frozen scenes to repaint', () => {
  const { api, pending, ctx } = art(); let ready = 0;
  api.onReady = () => ready++; api.load(); pending.forEach(image => image.onload());
  assert.equal(ready, 3);
  const skin = { id: 'coral', body: '#fa9a86' };
  const first = api.get('swim', skin);
  for (let frame = 0; frame < 100; frame++) assert.equal(api.get('swim', skin), first);
  assert.equal(api.draw(ctx, 'swim', 0, 0, 48, skin), true);
  assert.notEqual(api.get('portrait', skin), first);
});
test('all builds embed complete WebP assets without machine-local references', () => {
  const body = require('./build-source').gameBody();
  assert.ok(!body.includes('@@ART_'));
  for (const name of ['hero', 'portrait', 'swim']) {
    const bytes = fs.readFileSync(path.join(root, 'assets/art', `shark-${name}.webp`));
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.ok(body.includes('data:image/webp;base64,' + bytes.toString('base64')));
  }
  assert.ok(body.includes('const SHARK_ART'));
  assert.ok(!body.includes('C:/Users/'));
});
