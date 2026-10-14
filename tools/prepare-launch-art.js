// Reuse the unmodified hero artwork inside Android's 288dp splash icon safe zone.
// node tools/prepare-launch-art.js <existing sharp module path>
const path = require('node:path');
const fs = require('node:fs');
const sharp = require(process.argv[2] || 'sharp');
const root = path.join(__dirname, '..');
async function main() {
  const scale = 3; // Preserve source detail on high-density screens; Android fits the 288dp icon bounds.
  const hero = await sharp(path.join(root, 'assets/art/shark-hero.webp')).resize(164 * scale, 164 * scale, { fit: 'contain' }).png().toBuffer();
  const dir = path.join(root, 'android/app/src/main/res/drawable-nodpi');
  fs.mkdirSync(dir, { recursive: true });
  await sharp({ create: { width: 288 * scale, height: 288 * scale, channels: 4, background: '#00000000' } })
    .composite([{ input: hero, gravity: 'centre' }]).png().toFile(path.join(dir, 'launch_shark.png'));
  console.log('built launch_shark.png from existing hero artwork');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
