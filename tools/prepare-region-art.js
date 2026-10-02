// Region card images (3:2) derived from the art originals in assets/art/content-refresh-v1/. Originals are never changed.
// Uses an existing sharp installation, like tools/prepare-art.js (the shark export is not re-run):
//   node tools/prepare-region-art.js <absolute path to sharp>
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.argv[2] || 'sharp');
const root = path.join(__dirname, '..', 'assets', 'art');
const SIZE = [720, 480];   // ~2x a 360px card; embedded as data URLs in every build, so kept small
(async () => {
  fs.mkdirSync(path.join(root, 'regions'), { recursive: true });
  for (const name of ['north-harbor', 'sluice-works']) {
    const source = path.join(root, 'content-refresh-v1', `${name}.png`), file = path.join(root, 'regions', `${name}.webp`);
    const meta = await sharp(source).metadata();
    if (Math.abs(meta.width / meta.height - 1.5) > 0.01) throw new Error(`${name}: expected a 3:2 original, got ${meta.width}x${meta.height}`);
    await sharp(source).resize(SIZE[0], SIZE[1], { fit: 'cover', kernel: 'lanczos3' }).webp({ quality: 78, effort: 6, smartSubsample: true }).toFile(file);
    const out = await sharp(file).metadata();
    console.log(`${name}: ${meta.width}x${meta.height} PNG ${fs.statSync(source).size} B -> ${out.width}x${out.height} WebP ${fs.statSync(file).size} B`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
