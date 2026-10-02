// Downloads subsetted copies of the game fonts (only the characters used in src/) into assets/fonts/,
// so the PWA / native app shows the right fonts offline. Fonts are SIL OFL; license texts are saved alongside.
// Run again whenever src/ gains characters that are not in assets/fonts/chars.txt (build --web warns).
//   node tools/fonts.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'assets', 'fonts');
const FAMILIES = [
  { family: 'Jua', file: 'jua', weights: [400], ofl: 'jua' },
  { family: 'Noto Sans KR', file: 'noto-sans-kr', weights: [400, 500, 700], ofl: 'notosanskr' },
];
// a modern browser UA makes Google Fonts answer with woff2
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

function usedChars() {
  const text = ['shell.html', 'engine.js', 'levels.js', 'variety.js', 'daily.js', 'free.js', 'device-demo.js', 'game.js'].map(f => fs.readFileSync(path.join(root, 'src', f), 'utf8')).join('');
  const set = new Set();
  for (let c = 0x20; c < 0x7f; c++) set.add(String.fromCharCode(c));   // all printable ASCII
  for (const ch of text) if (ch.codePointAt(0) > 0x7f && !/\s/.test(ch)) set.add(ch);
  return [...set].sort().join('');
}

async function get(url, binary) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return binary ? Buffer.from(await res.arrayBuffer()) : res.text();
}

(async () => {
  const chars = usedChars();
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of FAMILIES) {
    for (const w of f.weights) {
      const css = await get(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family)}:wght@${w}&text=${encodeURIComponent(chars)}&display=swap`);
      const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
      if (urls.length !== 1) throw new Error(`expected one font file for ${f.family} ${w}, got ${urls.length}`);
      const data = await get(urls[0], true);
      const name = `${f.file}-${w}.woff2`;
      fs.writeFileSync(path.join(outDir, name), data);
      console.log(`wrote assets/fonts/${name} (${(data.length / 1024).toFixed(1)} KB)`);
    }
    const license = await get(`https://raw.githubusercontent.com/google/fonts/main/ofl/${f.ofl}/OFL.txt`);
    fs.writeFileSync(path.join(outDir, `OFL-${f.file}.txt`), license);
  }
  fs.writeFileSync(path.join(outDir, 'chars.txt'), chars);
  console.log(`${[...chars].length} characters`);
})().catch(e => { console.error(e.message); process.exit(1); });
