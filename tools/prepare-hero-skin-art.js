// Export the generated main mascots at the same 512px size as shark-hero.webp.
// node tools/prepare-hero-skin-art.js <absolute path to existing sharp>
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require(process.argv[2] || 'sharp');
const root = path.join(__dirname, '../assets/art/hero-skins-v1');
const ids = ['sakura', 'wave', 'maple', 'snow', 'gold', 'lighthouse', 'coral', 'starsea'];
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async () => {
  const manifest = { version: 1, generator: 'built-in ImageGen', skins: {} };
  for (const id of ids) {
    const source = path.join(root, 'source', id + '.png');
    const meta = await sharp(source).metadata();
    if (!meta.hasAlpha || meta.width !== meta.height) throw Error(id + ': expected a square RGBA mascot');
    const file = id + '-hero.webp', out = path.join(root, file);
    await sharp(source).resize(512, 512).webp({ quality: 86, alphaQuality: 100, effort: 6 }).toFile(out);
    const { data, info } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let transparent = 0, left = info.width, top = info.height, right = -1, bottom = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (!alpha) transparent++;
      if (alpha > 8) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
    }
    if (transparent < info.width * info.height * .15 || right < left) throw Error(id + ': expected transparent space and a visible mascot');
    if (left === 0 || top === 0 || right === info.width - 1 || bottom === info.height - 1) throw Error(id + ': mascot touches the export edge');
    manifest.skins[id] = { source: 'source/' + id + '.png', sourceSha256: sha256(source), file, width: info.width, height: info.height,
      bounds: { left, top, right, bottom }, bytes: fs.statSync(out).size, sha256: sha256(out) };
    console.log(id, '512x512', manifest.skins[id].bytes + ' B', JSON.stringify(manifest.skins[id].bounds));
  }
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
