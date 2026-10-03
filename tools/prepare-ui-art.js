// Normalize generated menu icons for small mobile buttons. Never repaint or replace generated alpha.
// node tools/prepare-ui-art.js <absolute path to existing sharp>
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require(process.argv[2] || 'sharp');
const root = path.join(__dirname, '../assets/art/ui-v1');
const ids = ['challenge', 'free', 'map', 'journal', 'settings'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
(async () => {
  const manifest = { version: 1, generator: 'built-in ImageGen', icons: {} };
  for (const id of ids) {
    const source = path.join(root, 'source', id + '.png');
    const meta = await sharp(source).metadata();
    if (!meta.hasAlpha) throw Error(id + ': generated transparency is required');
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width, top = info.height, right = -1, bottom = -1, empty = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (!alpha) empty++;
      if (alpha > 4) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
    }
    if (right < left || empty / (info.width * info.height) < .15) throw Error(id + ': missing subject or opaque background');
    if (left < 2 || top < 2 || right > info.width - 3 || bottom > info.height - 3) throw Error(id + ': subject touches source edge');
    const crop = { left: left - 2, top: top - 2, width: right - left + 5, height: bottom - top + 5 };
    const size = 192, inset = 174;
    const sprite = await sharp(source).extract(crop).resize(inset, inset, { fit: 'inside', kernel: 'lanczos3' }).png().toBuffer();
    const file = id + '.webp';
    await sharp({ create: { width: size, height: size, channels: 4, background: '#00000000' } })
      .composite([{ input: sprite, gravity: 'centre' }]).webp({ quality: 88, alphaQuality: 100, effort: 6 }).toFile(path.join(root, file));
    const bytes = fs.readFileSync(path.join(root, file));
    manifest.icons[id] = { source: 'source/' + id + '.png', sourceSha256: hash(fs.readFileSync(source)), file, size, crop, bytes: bytes.length, sha256: hash(bytes) };
    console.log(id, size + 'x' + size, bytes.length + ' B');
  }
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
