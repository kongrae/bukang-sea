// Export the four authored directions without rotating, stretching or regenerating the original atlases.
// node tools/prepare-oblique-art.js <installed sharp module>
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.argv[2] || 'sharp');
const dir = path.join(__dirname, '../assets/art/oblique-v1');
(async () => {
  const manifest = {};
  for (const skin of ['basic', 'lighthouse']) {
    const file = path.join(dir, 'source', skin + '.png');
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width % 2 || info.height % 2) throw new Error('Atlas must have equal quadrants');
    for (const [k, direction] of ['R', 'L', 'D', 'U'].entries()) {
      const qx = k % 2 * info.width / 2, qy = Math.floor(k / 2) * info.height / 2;
      let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
      for (let y = qy; y < qy + info.height / 2; y++) for (let x = qx; x < qx + info.width / 2; x++) {
        if (data[(y * info.width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      }
      if (x1 <= x0 || y1 <= y0) throw new Error('Empty direction: ' + skin + direction);
      const crop = { left: Math.max(qx, x0 - 2), top: Math.max(qy, y0 - 2), width: x1 - x0 + 5, height: y1 - y0 + 5 };
      const output = `${skin}-${direction}.webp`;
      await sharp(file).extract(crop).resize({ width: 256, height: 256, fit: 'inside' }).webp({ quality: 88, alphaQuality: 100, effort: 6 }).toFile(path.join(dir, output));
      manifest[output] = crop;
    }
  }
  fs.writeFileSync(path.join(dir, 'crops.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('Exported 8 transparent directional sprites');
})();
