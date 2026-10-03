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

test('authored skins decode lazily once, keep both views separate, and supersede the tint fallback', () => {
  const { api, pending } = art(); api.load(); pending.slice().forEach(image => image.onload());
  assert.equal(pending.length, 3, 'startup only decodes the base mascot');
  const skin = { id: 'sakura', body: '#ef9dca' };
  const fallback = api.get('swim', skin);
  for (let i = 0; i < 100; i++) api.get('swim', skin);
  assert.equal(pending.length, 4, 'no per-frame allocations or duplicate loads');
  assert.equal(api.hasSkin('swim', skin), false);
  pending[3].onload();
  assert.equal(api.hasSkin('swim', skin), true);
  assert.equal(api.get('swim', skin), pending[3]);
  assert.notEqual(api.get('swim', skin), fallback);
  api.get('portrait', skin); assert.equal(pending.length, 5);
  pending[4].onerror();
  assert.equal(api.hasSkin('portrait', skin), false);
  assert.ok(api.get('portrait', skin), 'failed themed portrait retains the previous drawn fallback');
  assert.equal(pending.length, 5, 'failed assets do not retry on every draw');
});

test('a decoded skin stays visible even if the base art fails; baked details are not drawn twice', () => {
  const { api, pending, ctx } = art(); api.load(); pending.slice().forEach(image => image.onerror());
  let overlays = 0;
  const skin = { id: 'wave', body: '#52cbd6', pattern: () => overlays++, deco: () => overlays++ };
  api.get('swim', skin); pending[3].onload();
  const fn = game.slice(game.indexOf('function drawShark('), game.indexOf('function drawFish('));
  const draw = new Function('SHARK_ART', 'C', 'reduceMotion', fn + ';return drawShark;')(api, {}, true);
  draw(ctx, 0, 0, 0, 48, 0, false, 1, 1, skin);
  assert.equal(overlays, 0);
  assert.equal(api.get('swim', skin), pending[3]);
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
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/art/skins-v2/manifest.json')));
  assert.equal(Object.keys(manifest.skins).length, 8);
  for (const skin of Object.values(manifest.skins)) for (const view of Object.values(skin.views)) {
    const bytes = fs.readFileSync(path.join(root, 'assets/art/skins-v2', view.file));
    assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'), view.sha256);
    assert.ok(body.includes('data:image/webp;base64,' + bytes.toString('base64')), view.file + ' is embedded');
  }
  const menu = JSON.parse(fs.readFileSync(path.join(root, 'assets/art/ui-v1/manifest.json')));
  assert.equal(Object.keys(menu.icons).length, 5);
  for (const icon of Object.values(menu.icons)) {
    const bytes = fs.readFileSync(path.join(root, 'assets/art/ui-v1', icon.file));
    assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'), icon.sha256);
    assert.ok(body.includes('data:image/webp;base64,' + bytes.toString('base64')), icon.file + ' is embedded');
  }
});

test('menu art loads once per slot, upgrades on success, and retains the fallback on failure', () => {
  const slots = ['settings', 'settings', 'map'].map(menuArt => {
    const classes = new Set();
    return { dataset: { menuArt }, image: null, querySelector() { return this.image; },
      appendChild(img) { this.image = img; }, classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) } };
  });
  let allocations = 0;
  const Image = function () { allocations++; };
  const api = new Function('Image', source + '; return MENU_ART;')(Image);
  const root = { querySelectorAll: () => slots };
  api.load(root); api.load(root);
  assert.equal(allocations, 3, 'remounting must not allocate or reload icons');
  assert.equal(slots[0].image.src, slots[1].image.src, 'settings buttons share the same cached image URL');
  assert.equal(slots[0].image.alt, '', 'decorative images do not duplicate accessible button names');
  assert.equal(slots[0].classList.contains('art-ready'), false, 'fallback stays until the image loads');
  slots[0].image.onload();
  assert.equal(slots[0].classList.contains('art-ready'), true);
  slots[2].image.onerror();
  assert.equal(slots[2].classList.contains('art-ready'), false);
  assert.equal(slots[2].image.hidden, true, 'hide broken images while leaving the original SVG');
  api.load(root); assert.equal(allocations, 3, 'failed assets must not retry indefinitely');
});
