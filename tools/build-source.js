const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
// Embedded art: shark WebP, sluice device SVG states and region card WebP. Data URLs work in standalone artifacts and
// offline apps, and participate in build hashes (the PWA cache name changes with them). Each token appears once in src/.
const ART = [
  ...['hero', 'portrait', 'swim'].map(name => [name.toUpperCase(), `art/shark-${name}.webp`]),
  ...['challenge', 'free', 'map', 'journal', 'settings'].map(name => [`UI_${name.toUpperCase()}`, `art/ui-v1/${name}.webp`]),
  ...['sakura', 'wave', 'maple', 'snow', 'gold', 'lighthouse', 'coral', 'starsea'].flatMap(id =>
    ['portrait', 'swim'].map(view => [`SKIN_${id.toUpperCase()}_${view.toUpperCase()}`, `art/skins-v2/${id}-${view}.webp`])),
  ['GATE_OPEN', 'art/content-refresh-v1/gate-open.svg'], ['GATE_CLOSED', 'art/content-refresh-v1/gate-closed.svg'],
  ['SWITCH_ON', 'art/content-refresh-v1/switch-on.svg'], ['SWITCH_OFF', 'art/content-refresh-v1/switch-off.svg'],
  ['REGION_NORTH', 'art/regions/north-harbor.webp'], ['REGION_SLUICE', 'art/regions/sluice-works.webp'],
];
function gameBody() {
  const read = file => fs.readFileSync(path.join(root, 'src', file), 'utf8');
  let body = [read('shell.html'), '<style>', read('art-theme.css'), '</style>', '<script>',
    ...['engine.js', 'levels.js', 'pilot.js', 'variety.js', 'variety-reserves.js', 'daily.js', 'free.js', 'device-demo.js', 'art.js', 'sound.js', 'game.js'].map(read), '</script>'].join('\n');
  for (const [token, file] of ART) {
    const data = fs.readFileSync(path.join(root, 'assets', file)), type = file.endsWith('.svg') ? 'image/svg+xml' : 'image/webp';
    body = body.replaceAll(`@@ART_${token}@@`, `data:${type};base64,` + data.toString('base64'));
  }
  return body;
}
module.exports = { gameBody, ART };
