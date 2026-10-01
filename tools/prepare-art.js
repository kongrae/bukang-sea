// Export generated art without altering the originals. Uses an existing sharp installation.
// node tools/prepare-art.js <absolute path to sharp>
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.argv[2] || 'sharp');
const root = path.join(__dirname, '..', 'assets', 'art');
(async () => {
  for (const [name, size] of [['hero', 512], ['portrait', 384], ['swim', 256]]) {
    const source = path.join(root, 'source', `shark-${name}.png`);
    const file = path.join(root, `shark-${name}.webp`);
    await sharp(source).resize(size, size, { fit: 'inside' }).webp({ quality: 86, alphaQuality: 100, effort: 6 }).toFile(file);
    const meta = await sharp(file).metadata();
    if (!meta.hasAlpha) throw new Error(`${name}: missing alpha`);
    console.log(`${name}: ${meta.width}x${meta.height}, ${fs.statSync(file).size} bytes`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
