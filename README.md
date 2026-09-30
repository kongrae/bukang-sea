# 길 잃은 상어

수로에서 길을 잃은 상어를 바다로 보내는 슬라이드 퍼즐 게임 (웹 + PWA + Android, 48스테이지 · 4장 + 오늘의 수로).

## 바로 해 보기

[GitHub Pages에서 플레이](https://kongrae.github.io/bukang-sea/)

`dist/index.html`을 브라우저로 열면 된다. 휴대폰에서는 파일을 옮겨 열거나 간단한 로컬 서버로 띄운다.

```bash
npx serve dist        # 또는 python3 -m http.server -d dist
```

## 개발

```bash
npm run build     # src/ 수정 후 dist/index.html 다시 만들기
npm run verify    # 해법 재생 검증 (실제 최소 이동 수와 별 기준을 따로 확인)
npm test          # 풀이기·일일 퍼즐 호환·구조정 연출·진행 복원·장치 안내 회귀 검사
npm run build:web # www/ PWA 빌드 (정적 호스팅에 그대로 업로드)
npm run serve     # www/ 를 localhost:5173 으로 확인
npm run build:playtest # 기록을 분리한 관찰용 빌드
npm run serve:playtest # localhost:5175/?tester=P01 (후반 시험만 &all=1)
npm run playtest:report -- attempts.csv survey.csv --out results.md
```

출시(웹 · Android · iOS) 절차는 `docs/RELEASE.md`, 자세한 구조와 규칙은 `CLAUDE.md`, 이동 기준과 대표 수로 조정은 `docs/BALANCE.md`, 화면 가독성 개선은 `docs/READABILITY.md`, 진행 저장·장치 안내는 `docs/PROGRESS-AND-GUIDES.md` 참고. Claude Code에서 이 폴더를 열면 자동으로 읽는다.

실제 이용자 시험 절차는 [docs/PLAYTEST.md](docs/PLAYTEST.md), 빈 기록 양식은 [RECORDS.xlsx](docs/playtest/RECORDS.xlsx), 현재 결과는 [RESULTS.md](docs/playtest/RESULTS.md)다. 아직 실제 이용자 결과는 없으며 테스트 준비·개발 검증까지 완료했다.

힌트는 수로마다 처음 2회 즉시 제공하고, 이후에는 12초 간격으로 계속 사용할 수 있다. 사용에 따른 별 감점은 없다. [힌트 정책](docs/HINT-POLICY.md) 참고.

## Claude Code로 이어서 작업하기

```bash
cd bukang-sea
claude
```

예시 요청:
- "레벨 13~20 만들어줘. gen.js로 뽑고 verify 통과시켜"
- "턴마다 한 칸씩 움직이는 구조정을 추가해줘"
- "Capacitor로 안드로이드 앱 빌드할 수 있게 세팅해줘"
