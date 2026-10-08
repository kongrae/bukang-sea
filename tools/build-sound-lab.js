// Development-only A/B audition + actual-rule game soak. Nothing here is copied to www/dist.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { gameBody, embedAudio } = require('./build-source');
const root = path.resolve(__dirname, '..'), folder = path.join(root, 'outputs/audio');
const baseline = process.argv[2] || 'def8fd47bc50a4274a4380424fd08c915b2edee7';
if (!/^[a-zA-Z0-9_.\/-]+$/.test(baseline) || baseline.startsWith('-')) throw Error('Invalid baseline ref');
const old = cp.execFileSync('git', ['show', baseline + ':src/game.js'], {cwd:root, encoding:'utf8'});
const current = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8');
const oldAudio = old.slice(old.indexOf('let actx = null;'), old.indexOf('/* ---------- easing'));
if (!oldAudio.includes('const sfx =')) throw Error('Baseline sound section missing');
fs.mkdirSync(folder, {recursive:true});
const factory = `function createBeforeAudio(context) { const save={sound:true}; ${oldAudio.replace('let actx = null;', 'let actx = context;')} return sfx; }`;
const sounds = embedAudio(fs.readFileSync(path.join(root,'src/sound.js'),'utf8'));
const page = fs.readFileSync(path.join(__dirname,'sound-lab.html'),'utf8').replace('<!-- sound-code -->', `<script>${sounds}\n${factory}\n${fs.readFileSync(path.join(__dirname,'sound-lab.js'),'utf8')}</script>`);
fs.writeFileSync(path.join(folder,'index.html'), page.replaceAll('BASELINE_COMMIT',baseline));
const controls = fs.readFileSync(path.join(__dirname,'sound-game-qa.js'),'utf8');
for (const [name, source] of [['before', old], ['after', current]]) {
  const game = source.replace("const STORE_KEY = 'bukang-sea-v1';", `const STORE_KEY = 'bukang-audio-qa-${name}';`)
    .replace('let reduceMotion = motionPreference.matches;', 'let reduceMotion = false;')
    .replace('const boot = () =>', controls + '\nconst boot = () =>');
  if (!game.includes('qaAudioPanel')) throw Error('QA marker missing');
  const style = `#qaAudioPanel{position:fixed;z-index:50;bottom:0;left:0;right:0;background:#fff4cd;color:#123;padding:5px;font:12px system-ui;max-height:140px;overflow:auto}#qaAudioPanel button{padding:6px;margin:2px}#qaAudioLog{white-space:pre-wrap;margin:0}#app{height:calc(100% - 140px)}`;
  fs.writeFileSync(path.join(folder,`game-${name}.html`),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sound game ${name}</title><style>${style}</style><body>${gameBody().replace(current,game)}</body></html>`);
}
console.log(`Built outputs/audio/index.html and game-{before,after}.html; baseline ${baseline}`);
