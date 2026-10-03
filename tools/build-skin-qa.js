// Isolated local art inspection; no QA controls or synthetic ownership enter release builds.
const fs = require('node:fs');
const path = require('node:path');
const { gameBody } = require('./build-source');
const controls = `
const qaPanel = document.createElement('aside'); qaPanel.id = 'skinQA';
qaPanel.innerHTML = '<button id="qaCollection">스킨 모두 보기</button><button id="qaGallery">그림 비교</button><button id="qaBack">게임으로</button><p>로컬 QA · 합성 보유 기록</p>';
document.body.append(qaPanel);
save.owned = SKINS.map(s => s.id); save.sound = false; save.vibe = false;
const qaGallery = document.createElement('section'); qaGallery.id = 'skinGallery'; qaGallery.hidden = true; document.body.append(qaGallery);
qaGallery.innerHTML = '<h1>스킨 디테일 · 실제 게임 렌더러</h1><p>선택 화면 / 게임판 48px / 게임판 32px · 원본 방향</p><div>' + SKINS.map(s => '<article><b>' + s.name + '</b><canvas data-portrait="' + s.id + '"></canvas><span><canvas width="64" height="64" data-swim="' + s.id + '"></canvas><canvas width="48" height="48" data-tiny="' + s.id + '"></canvas></span></article>').join('') + '</div>';
function qaPaintGallery() {
  if (qaGallery.hidden) return;
  SKINS.forEach(s => {
    drawSkinPreview(qaGallery.querySelector('[data-portrait="' + s.id + '"]'), s);
    for (const [kind, size, width] of [['swim',48,64],['tiny',32,48]]) {
      const canvas=qaGallery.querySelector('[data-' + kind + '="' + s.id + '"]'), ctx=canvas.getContext('2d');
      ctx.clearRect(0,0,width,width);drawShark(ctx,width/2,width/2,0,size,0,false,1,1,s);
    }
  });
}
const qaReady = SHARK_ART.onReady; SHARK_ART.onReady = (...args) => {qaReady(...args); qaPaintGallery();};
$('qaCollection').onclick = () => {qaGallery.hidden=true;openSkins();};
$('qaGallery').onclick = () => {qaGallery.hidden=false;qaPaintGallery();};
$('qaBack').onclick = () => {qaGallery.hidden=true;if(skinsOpen())closeSkins();};
`;
let body = gameBody().replace("const STORE_KEY = 'bukang-sea-v1';", "const STORE_KEY = 'bukang-skin-v2-qa';")
  .replace('if (document.fonts && document.fonts.ready)', controls + '\nif (document.fonts && document.fonts.ready)');
const font = [400,500,700].map(w => `@font-face{font-family:'Bukang Body';font-weight:${w};src:url('/assets/fonts/noto-sans-kr-${w}.woff2')}`).join('') + "@font-face{font-family:'Bukang Display';font-weight:400;src:url('/assets/fonts/jua-400.woff2')}";
const css = '#skinQA{position:fixed;z-index:60;bottom:0;right:0;display:flex;gap:4px;background:#fff;padding:4px;font:11px sans-serif}#skinQA p{display:none}#skinQA button{font:11px sans-serif;padding:5px;color:#123;background:#eee}#skinGallery{position:fixed;inset:0;z-index:50;overflow:auto;background:#eff6f4;color:#164c60;padding:24px;text-align:center}#skinGallery h1{font-size:28px}#skinGallery>div{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:940px;margin:auto}#skinGallery article{background:white;border:1px solid #aacdcf;border-radius:18px;padding:10px;display:grid;gap:6px}#skinGallery [data-portrait]{width:100%;height:150px;border-radius:12px}#skinGallery span{display:flex;justify-content:center;align-items:center;background:#3a9cb2;border-radius:10px}';
const out = path.join(__dirname,'../outputs/qa/skin-v2.html');fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out, '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Skin QA</title><style>'+font+css+'</style></head><body>'+body+'</body></html>');
console.log(out);
