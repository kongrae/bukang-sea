// Export generated two-view atlases; preserve originals and the generated alpha.
// node tools/prepare-skin-art.js <absolute path to existing sharp>
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require(process.argv[2] || 'sharp');
const root = path.join(__dirname, '../assets/art/skins-v2');
const ids = ['sakura', 'wave', 'maple', 'snow', 'gold', 'lighthouse', 'coral', 'starsea'];
(async () => {
  const manifest = { version: 2, generator: 'built-in ImageGen', skins: {} };
  for (const id of ids) {
    const file = path.join(root, 'source', id + '.png');
    const meta = await sharp(file).metadata();
    if (!meta.hasAlpha || meta.width < meta.height * 1.5) throw Error(id + ': expected transparent landscape atlas');
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = (x, y) => data[(y * info.width + x) * 4 + 3];
    // Find the transparent gutter rather than cutting a nose when generation offsets the two cells.
    let seam = 0, best = Infinity;
    for (let x = Math.floor(info.width * .46); x < info.width * .56; x++) {
      let count = 0; for (let y = 0; y < info.height; y++) if (alpha(x, y) > 32) count++;
      const score = count * info.width + Math.abs(x - info.width / 2);
      if (score < best) { best = score; seam = x; }
    }
    if (best >= info.width * 4) throw Error(id + ': atlas subjects touch; inspect before export');
    const record = { source: 'source/' + id + '.png', sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), seam, views: {} };
    for (const [view, start, end, size] of [['portrait', 0, seam, 384], ['swim', seam, info.width, 256]]) {
      let left = end, top = info.height, right = start, bottom = 0;
      for (let y = 0; y < info.height; y++) for (let x = start; x < end; x++) if (alpha(x, y) > 8) {
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      left = Math.max(start, left - 2); top = Math.max(0, top - 2);
      right = Math.min(end - 1, right + 2); bottom = Math.min(info.height - 1, bottom + 2);
      const crop = { left, top, width: right - left + 1, height: bottom - top + 1 };
      const sprite = await sharp(file).extract(crop).resize(Math.round(size * .94), Math.round(size * .82), { fit: 'inside' }).png().toBuffer();
      const out = path.join(root, `${id}-${view}.webp`);
      await sharp({ create: { width: size, height: size, channels: 4, background: '#00000000' } })
        .composite([{ input: sprite, gravity: 'centre' }]).webp({ quality: 86, alphaQuality: 100, effort: 6 }).toFile(out);
      const bytes = fs.readFileSync(out);
      record.views[view] = { file: path.basename(out), size, crop, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
      console.log(id, view, size, bytes.length + ' B');
    }
    manifest.skins[id] = record;
  }
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
