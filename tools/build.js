// Builds a single self-contained HTML file from src/.
//   node tools/build.js            -> dist/index.html   (standalone, open directly in a browser)
//   node tools/build.js --artifact -> dist/artifact.html (no <html>/<head>/<body>, for Claude artifact publishing)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');

const body = [
  read('shell.html'),
  '<script>',
  read('engine.js'),
  read('levels.js'),
  read('game.js'),
  '</script>',
].join('\n');

const artifact = process.argv.includes('--artifact');
const out = artifact
  ? body
  : `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
</head>
<body style="margin:0">
${body}
</body>
</html>
`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const file = path.join(root, 'dist', artifact ? 'artifact.html' : 'index.html');
fs.writeFileSync(file, out);
console.log(`built ${path.relative(root, file)} (${(out.length / 1024).toFixed(1)} KB)`);
