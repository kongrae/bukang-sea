// Assemble actual browser captures into a local comparison page and durable documentation images.
// Run after board-art-qa.js check. Screenshots are composed by the browser, with no generated replacement art.
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.argv[2] || 'playwright');
const root = path.join(__dirname, '..'), out = path.join(root, 'outputs/qa/board-art');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5182';
const checks = JSON.parse(fs.readFileSync(path.join(out, 'check-checks.json'), 'utf8'));
if (!checks.success) throw Error('Complete the browser checks first');
const scenes = [
  ['first', '첫 굽이', '따뜻한 돌 부두와 얕은 물가 · 출구 밖으로 넓어지는 바다'],
  ['devices', '마지막 갑문', '좁은 통로와 열린·닫힌 수문 구분 · 배경보다 먼저 읽히는 장치'],
];
const pairs = scenes.map(([id,title,caption]) => `<section class="comparison" id="${id}"><h2>${title} <span style="font-size:12px;font-weight:400">왼쪽: 개선 전 / 오른쪽: 개선 후</span></h2><p>${caption}</p><div class="pair">${['before','after'].map((name,i) => `<figure><figcaption>${i ? '개선 후' : '개선 전'}</figcaption><img src="${name}-${id}-board.png" alt="${title} ${i ? '개선 후' : '개선 전'} 맵"><a href="${name}-${id}.png">전체 플레이 화면 보기</a></figure>`).join('')}</div></section>`).join('');
const examples = [[5,'구조정'],[9,'그물'],[36,'모래톱'],[47,'소용돌이'],[83,'나무 상자']];
fs.writeFileSync(path.join(out,'review.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>상어 SOS · 맵 그래픽 전후 비교</title>
<style>*{box-sizing:border-box}body{margin:0;background:#e8f3ef;color:#153f53;font:15px/1.6 'Malgun Gothic',sans-serif}main{max-width:820px;margin:auto;padding:32px 18px}header{padding:12px 18px 24px}h1{font-size:28px;letter-spacing:-1px;margin:4px 0 12px}h2{margin:0;font-size:21px}p{margin:8px 0 16px;color:#486d74}a{color:#1c6d82;text-underline-offset:3px}nav{display:flex;gap:18px;flex-wrap:wrap}.comparison{padding:22px;background:#f9fcf7;border-radius:20px;margin:20px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0;min-width:0}figcaption{font-weight:700;margin-bottom:8px}img{display:block;width:100%;border-radius:12px}figure a{display:block;font-size:12px;margin-top:10px}.examples{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.examples figcaption{margin:8px 0}aside{padding:18px;background:#d9ebe6;border-radius:14px}small{display:block;color:#54747a;margin-top:12px}@media(max-width:500px){main{padding:16px 8px}.comparison{padding:14px}.pair{gap:8px}.examples{grid-template-columns:repeat(2,1fr)}h1{font-size:23px}}</style>
<main><header><small>상어 SOS / 2026.10.14</small><h1>길은 그대로, 더 깊어진 바다</h1><p>첫 수로와 복합 장치 수로를 같은 크기·같은 시작 상태로 비교했습니다. 실제 게임 렌더러의 브라우저 캡처이며, 비교를 위해 첫 안내만 생략했습니다.</p><nav><a href="#first">첫 굽이</a><a href="#devices">마지막 갑문</a><a href="https://kongrae.github.io/bukang-sea/">배포된 게임</a></nav></header>${pairs}
<section class="comparison"><h2>전체 수로의 공통 재질</h2><p>같은 물가·부두 표현을 84개 수로, 오늘의 도전, 자유 수로에 공유합니다.</p><div class="examples">${examples.map(([i,label])=>`<figure><img src="after-level-${i}-board.png" alt="${label} 수로"><figcaption>${label}</figcaption></figure>`).join('')}</div></section>
<aside><b>검증</b><p>기존 테스트 237개 / 84개 맵 렌더링 / 32번 입력의 변경 전후 상태·저장 일치 / 이전 진행 복원 / 이미지 실패 대체 표시 / 일반·동작 줄이기 / 320–412px 세로 화면 / 가로 스크롤 확인</p><a href="after-gate-open.png">수문이 열린 상태</a> · <a href="after-net.png">그물 설치</a> · <a href="after-guide.png">장치 안내</a> · <a href="after-devices-320.png">320px 화면</a> · <a href="after-fallback.png">이미지 실패 시</a><small>PC의 Edge 모바일 에뮬레이션입니다. 실제 Android 기기의 터치·GPU 성능 확인은 이번 작업에 포함되지 않았습니다. 기준 소스 ${checks.baseline}.</small></aside></main></html>`);
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:820,height:1100},deviceScaleFactor:1});
    await page.goto(`${origin}/outputs/qa/board-art/review.html`);
    await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
    const folder=path.join(root,'docs/board-art'); fs.mkdirSync(folder,{recursive:true});
    for(const [id] of scenes) await page.locator('#'+id).screenshot({path:path.join(folder,id+'-comparison.png')});
    console.log('Created review.html and docs/board-art/{first,devices}-comparison.png');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
