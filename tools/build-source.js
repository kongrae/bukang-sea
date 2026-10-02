const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
function gameBody() {
  const read = file => fs.readFileSync(path.join(root, 'src', file), 'utf8');
  let body = [read('shell.html'), '<style>', read('art-theme.css'), '</style>', '<script>',
    ...['engine.js', 'levels.js', 'variety.js', 'variety-reserves.js', 'daily.js', 'free.js', 'device-demo.js', 'art.js', 'game.js'].map(read), '</script>'].join('\n');
  // Embedded WebP works in standalone artifacts and offline apps, and participates in build hashes.
  for (const name of ['hero', 'portrait', 'swim']) {
    const data = fs.readFileSync(path.join(root, 'assets', 'art', `shark-${name}.webp`));
    body = body.replaceAll(`@@ART_${name.toUpperCase()}@@`, 'data:image/webp;base64,' + data.toString('base64'));
  }
  return body;
}
module.exports = { gameBody };
