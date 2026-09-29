# 부캉이 바다로

부산 북항 수로에 갇힌 상어 부캉이를 바다로 보내는 슬라이드 퍼즐 게임 (웹 프로토타입, 12스테이지).

## 바로 해 보기

`dist/index.html`을 브라우저로 열면 된다. 휴대폰에서는 파일을 옮겨 열거나 간단한 로컬 서버로 띄운다.

```bash
npx serve dist        # 또는 python3 -m http.server -d dist
```

## 개발

```bash
npm run build     # src/ 수정 후 dist/index.html 다시 만들기
npm run verify    # 레벨 검증 (par 확인)
```

자세한 구조와 규칙은 `CLAUDE.md` 참고. Claude Code에서 이 폴더를 열면 자동으로 읽는다.

## Claude Code로 이어서 작업하기

```bash
cd bukang-sea
claude
```

예시 요청:
- "레벨 13~20 만들어줘. gen.js로 뽑고 verify 통과시켜"
- "턴마다 한 칸씩 움직이는 구조정을 추가해줘"
- "Capacitor로 안드로이드 앱 빌드할 수 있게 세팅해줘"
