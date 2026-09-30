# 길 잃은 상어

수로에서 길을 잃은 상어를 바다로 보내는 슬라이드 퍼즐 게임 (웹 + PWA + Android, 48스테이지 · 4장 + 오늘의 수로).

## 바로 해 보기

`dist/index.html`을 브라우저로 열면 된다. 휴대폰에서는 파일을 옮겨 열거나 간단한 로컬 서버로 띄운다.

```bash
npx serve dist        # 또는 python3 -m http.server -d dist
```

## 개발

```bash
npm run build     # src/ 수정 후 dist/index.html 다시 만들기
npm run verify    # 해법 재생 검증 (실제 최소 이동 수와 별 기준을 따로 확인)
npm test          # 그물 재배치 풀이기 회귀 검사
npm run build:web # www/ PWA 빌드 (정적 호스팅에 그대로 업로드)
npm run serve     # www/ 를 localhost:5173 으로 확인
```

출시(웹 · Android · iOS) 절차는 `docs/RELEASE.md`, 자세한 구조와 규칙은 `CLAUDE.md` 참고. Claude Code에서 이 폴더를 열면 자동으로 읽는다.

## Claude Code로 이어서 작업하기

```bash
cd bukang-sea
claude
```

예시 요청:
- "레벨 13~20 만들어줘. gen.js로 뽑고 verify 통과시켜"
- "턴마다 한 칸씩 움직이는 구조정을 추가해줘"
- "Capacitor로 안드로이드 앱 빌드할 수 있게 세팅해줘"
