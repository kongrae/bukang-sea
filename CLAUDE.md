# 길 잃은 상어 — 프로젝트 가이드

2026년 9월 부산 북항 친수공원 인공 수로에 들어온 무태상어에서 착안한 모바일 퍼즐 게임 **길 잃은 상어**(웹 + PWA + Capacitor 앱)다. 저장소·저장 키·내부 이름의 `bukang`은 옛 가제의 흔적이라 그대로 둔다(진행 기록 호환).
장르는 하이퍼캐주얼 슬라이드 퍼즐이고, 목표는 앱스토어 출시용 모바일 게임으로 발전시키는 것이다.

## 작업 규칙

- **작업을 마칠 때마다 자동으로 커밋한다**(사용자 요청, 2026-09-30). verify·빌드 통과 후 `master`에 바로 커밋, `.claude/`는 제외, 메시지는 한국어 요약.
- `src/` 를 고쳤으면 `dist/`(build, build:artifact)도 다시 빌드해 함께 커밋한다.

## 명령어

```bash
npm run build            # src/ → dist/index.html (브라우저에서 바로 열리는 단일 파일)
npm run build:artifact   # src/ → dist/artifact.html (<html>/<head> 없이, Claude 아티팩트 게시용)
npm run build:web        # src/ → www/ (PWA: manifest, 서비스 워커, 아이콘. Capacitor webDir 겸용)
npm run serve            # www/ 를 http://localhost:5173 으로 띄움 (--host 붙이면 같은 Wi-Fi 휴대폰에서 접속)
npm run icons            # assets/icon.svg → assets/icons/*.png (Edge/Chrome 헤드리스 필요)
npm run fonts            # src/ 에 쓰인 글자만 담은 서브셋 폰트 → assets/fonts/ (build:web 이 누락 글자를 경고하면 실행)
node tools/shots.js      # build:web 후 스토어 스크린샷 6장 + 그래픽 이미지 → docs/store/ (Edge/Chrome 헤드리스)
npm run cap:sync         # build:web + Capacitor android 동기화
npm run android:debug    # cap:sync + 디버그 APK 빌드(JDK 21: ~/.jdks/jdk-21*, 시스템 JDK 17은 그대로)
npm run android:release  # cap:sync + 서명된 AAB(업로드 키: ~/.android-keys, 비밀번호는 android/keystore.properties, 둘 다 커밋 금지)
npm run verify           # 모든 레벨이 풀리는지, par가 최적 이동 수와 같은지 검사 (실패 시 exit 1)
npm run gen -- basin '{"buoys":3,"jets":2,"fish":2}' 8 42   # 레벨 자동 생성기 (spec에 "bits":16 을 넣으면 목표 난이도로 탐색)
npm run difficulty       # 장별 난이도 곡선(bits) 출력, 앞 수로보다 쉬워지면 ▼ 표시
npm run daily -- 365     # 오늘의 수로: 앞으로 N일 치를 미리 생성해 전부 풀리는지·생성 시간 확인
```

게임과 tools/ 는 외부 의존성 없음(Node 18+). Capacitor(앱 빌드)만 npm 패키지와 Node 22+ 가 필요하다. 출시 절차는 docs/RELEASE.md.

## 구조

```
src/
  shell.html   마크업 + CSS (디자인 토큰은 :root 변수)
  engine.js    이동 규칙(slide)과 풀이기(bfsFrom, plan). 브라우저와 node 양쪽에서 쓰는 순수 함수
  levels.js    LEVELS 배열 (36개 수로) + CHAPTERS (장 이름, 레벨 수)
  daily.js     오늘의 수로 생성기 + 수로 마스크(MASKS)·rng·place (tools/gen.js도 공유). 브라우저·node 겸용
  game.js      렌더링(canvas), 입력, 상태, UI. IIFE 하나
tools/
  build.js     src 파일들을 이어 붙여 단일 HTML 생성
  verify.js    레벨 검증 (난이도 bits도 함께 출력)
  difficulty.js  난이도 지표: 무작위 플레이어가 별 3개를 받을 확률 P의 -log2 (그물은 무작위 칸에 친다고 가정)
  gen.js       수로 마스크에 물체를 무작위 배치해 목표 par에 가까운 레벨 탐색
  icons.js     아이콘 PNG 렌더링
  serve.js     로컬 정적 서버
assets/        icon.svg(원본) + icons/*.png, fonts/(서브셋 woff2 + OFL 라이선스 + chars.txt), privacy.html(개인정보처리방침)
docs/RELEASE.md  웹/Android/iOS 출시 가이드
docs/STORE.md    Play 등록 문구, 설문 답변 가이드 / docs/store/ 스크린샷·그래픽 이미지
capacitor.config.json  appId kr.hongrae.lostshark, webDir=www, SystemBars(DARK, insets→CSS 변수)
android/       Capacitor Android 프로젝트(커밋). 아이콘·스플래시는 @capacitor/assets로 생성, 세로 고정
www/           build:web 결과 (gitignore)
```

빌드는 단순 연결이라 `engine.js → levels.js → daily.js → game.js` 순서가 중요하다. 모듈 시스템 없이 전역 이름(`LEVELS`, `CHAPTERS`, `slide`, `plan` 등)을 공유한다.
`engine.js` 마지막 줄의 `module.exports`는 node 도구용이며 브라우저에서는 무시된다.

## 게임 규칙 (engine.js가 기준)

- 스와이프한 방향으로 **막힐 때까지** 미끄러진다. 한 번 스와이프 = 이동 1회. 움직이지 못하면 이동으로 치지 않는다.
- 막는 것: `#` 산책로(격자 밖도 동일), `o` 부표, `b` 구조정, 플레이어가 친 그물.
- `^ v < >` 물줄기 칸에 들어가면 그 방향으로 꺾여 계속 미끄러진다. 같은 물줄기를 한 번의 이동에서 두 번 지나면 루프 방지로 멈춘다. 출발 칸의 물줄기는 무시.
- `E` 바다 칸에 닿는 순간 클리어.
- `f` 숭어는 지나가거나 멈추기만 해도 먹는다.
- `s` 모래톱: 미끄러지다 올라서면 그 칸에서 멈춘다(막는 칸은 아님). 출발 칸이면 무시.
- `w` 소용돌이: 레벨당 정확히 한 쌍. 들어가면 짝 소용돌이로 옮겨져 같은 방향으로 계속 미끄러진다(slide 경로에 4번째 원소 true로 표시). 한 이동에서 같은 소용돌이를 다시 만나면 멈춘다.
- 그물: 레벨의 `nets` 개수만큼 빈 물 칸(`.`)을 탭해서 설치/회수. 이동 횟수에 포함되지 않음. 숭어·상어 위치·물줄기 칸에는 설치 불가.
- 별 3개 = 탈출 + 숭어 전부 + `이동 수 ≤ par`.

## 레벨 형식

```js
{ par: 7, name: '구조정 등장', nets: 0, tip: '한 줄 안내', map: [
  '###E###',   // 모든 행 길이가 같아야 함
  '##o..##',
  ...
  '###S###',
] }
```

기호: `#` 산책로 · `.` 물 · `S` 시작 · `E` 바다 출구(가장자리) · `f` 숭어 · `o` 부표 · `b` 구조정 · `^v<>` 물줄기 · `s` 모래톱 · `w` 소용돌이(한 쌍)

장 구성: 1장 북항 수로(1–12) · 2장 친수공원 운하(13–24) · 3장 방파제 너머(25–36) · 4장 외항 물길(37–48, 모래톱·소용돌이). 레벨은 배열 끝에만 추가한다(진행 상황이 인덱스로 저장되므로 중간 삽입·순서 변경 금지). 추가하면 `CHAPTERS`의 count도 맞춘다(verify가 검사). (출시 전이라 2026-09-30에 2·3장 순서를 한 번 재배치했다. 출시 후에는 순서 변경 금지.)

난이도 곡선(톱니형 상승): 장 안에서는 bits가 계속 오르고, 다음 장은 앞 장 중간 난이도에서 다시 시작한다. 현재 1장 5→19, 2장 8.9→19.5, 3장 12.5→27.4, 4장 9.9→26.5.
예외는 새 장치를 처음 소개하는 연습판(7 물대포, 10 그물 작전, 37 모래톱, 40 소용돌이)뿐이다. 레벨을 바꾸면 `npm run difficulty`로 ▼(하락)가 생기지 않았는지 확인한다.
bits는 그물 난이도를 과대평가하므로(사람은 추론해서 친다) 실제 기기 플레이 감각으로 보정할 것.

**레벨을 추가·수정하면 반드시 `npm run verify`를 돌리고, 출력된 최적 이동 수로 `par`를 맞춘다.**
par는 "숭어를 전부 먹고 탈출하는 최소 이동 수"(그물 사용 허용)다.
그물 레벨은 그물 없이는 숭어를 전부 먹고 나갈 수 없어야 한다(verify가 검사함).
그물 2개짜리까지만 풀이기가 빠르다(설치 조합 전수 탐색). 3개 이상이면 plan()을 개선해야 한다.

## game.js 개요

- 상태 `st = { pos, dir, fish[], nets[], moves, history[] }`. 되돌리기는 history 스냅샷 pop (그물 설치/회수도 포함).
- `tryMove(d)`는 결과를 즉시 확정하고, 화면은 `anim`으로 따라간다. 위치는 속도 곡선(GLIDE: 빠른 출발 → 긴 감속, 탈출은 DASH)으로 경로를 보간. 애니메이션 중 입력은 한 개까지 `queued`에 담았다가 멈춘 직후 실행.
- 연출(전부 tile 좌표 파티클): 속도에 따른 몸 늘어남, 정지 시 눌림+스프링(`settle`), 벽 충돌 물보라·파문(화면 흔들림·진동은 없음, 2026-09-30 제거), V자 항적(`wake`), 숭어 빨려 들어가기+냠!+반짝임, 물줄기 통과 번쩍임(`jetFlash`), 그물 톡 튀기(`netPop`), 탈출 시 바다로 사라짐, 물 위 코스틱 빛(타일러블 패턴을 waterPath로 clip). reduced-motion이면 대부분 생략.
- 입력: 게임 화면 어디서든 스와이프, 손가락이 `SWIPE`(18px) 움직이는 순간 발동(pointermove). 탭은 판 위에서만(그물). 키보드 동일.
- 판(카메라 뷰): 캔버스가 HUD와 버튼 사이 영역 전체를 가장자리까지 채운다(.board margin-inline -12px). 수로는 가운데에 최대 크기로(폭이 모자라면 바깥 산책로 열을 `CROP` 30%까지 화면 밖으로), 남는 공간은 판 밖 세계로 채움: 산책로(엔진도 격자 밖을 #로 봄) + 출구 바깥으로 이어지는 바다(`seaCells`, `~`). 그리드 원점은 `OX, OY`(캔버스 data-tile/ox/oy로 노출, tools/shots.js가 탭 좌표에 사용).
- 햅틱: Capacitor Haptics 플러그인이 있으면 사용, 없으면 navigator.vibrate. 모든 버튼 누름에 tick. 설정 창(톱니바퀴, 제목·게임 화면)에서 소리·진동을 따로 끔(`save.sound`, `save.vibe`).
- 첫 플레이 안내(`coach`): 수로 1에서 손가락 스와이프, 첫 그물 수로에서 손가락 탭. 한 번 하면 `save.coachSwipe/coachNet`으로 다시 안 뜸.
- 정적 배경(산책로, 난간, 구경꾼, 나무)은 `buildStatic()`에서 오프스크린 캔버스로 한 번 그림. 물결·물체·상어는 매 프레임.
- 힌트는 현재 상태에서 `plan()`을 돌려 첫 방향과 필요한 그물 위치를 보여준다.
- 진행 상황은 `localStorage['bukang-sea-v1']` = `{ best: {레벨인덱스: 별}, last, sound }`. 접근 실패해도 동작해야 하므로 try/catch 유지.
- **오늘의 수로**: `makeDaily(YYYY-MM-DD)`가 날짜 시드(FNV-1a, `DAILY_VERSION` 포함)로 요일별 레시피(`DAILY_TIERS`: 월 쉬움 → 주말 어려움, 금·일 그물)에 맞춰 수로를 생성·검증한다. 같은 날짜면 모든 기기에서 같은 퍼즐. 레시피·마스크·place를 바꾸면 과거·미래 퍼즐이 전부 바뀌므로 DAILY_VERSION을 올리고 `npm run daily`로 확인. 기록은 `save.daily = { 날짜: 별 }`(최근 120일), 연속 일수는 오늘(없으면 어제)부터 거꾸로 센다. 게임 안에서는 `DAILY`가 null이 아니면 오늘의 수로 모드(`curLevel()`, `replay()`, `deco` 시드 사용), 스토리 기록(save.best/last)은 건드리지 않는다.
- **상어 스킨**(`SKINS`): 기본·벚꽃(별20)·파도(45)·단풍(75)·눈꽃(105)·황금(144)·등대(오늘의 수로 7일 연속). `drawShark(..., skin)`가 몸·지느러미 색과 `pattern`(몸 안에 clip)·`deco`(몸 위 장식)를 그린다. 한 번 얻은 스킨은 `save.owned`에 남아 다시 잠기지 않는다(레벨이 늘어도 황금 기준 144는 고정). 해금은 `refreshSkins()`: 부팅 때(기존 진행 반영)와 클리어 때 호출, 새로 열리면 결과 시트에 표시. 제목 화면 "내 상어" 카드 → 고르기 시트.
- 제목 화면 수로 목록은 CHAPTERS 단위로 묶어 그림. 장의 마지막 수로를 깨면 '○○ 통과!' / '다음 장으로'.
- 화면 전환은 push(목록→수로)/pop(수로→목록) 슬라이드, 결과는 아래에서 올라오는 시트(넓은 화면에서는 가운데 카드).
- `window.Capacitor?.Plugins?.App`이 있으면(네이티브 앱) 하드웨어 뒤로가기 = 목록으로, 목록에서는 앱 종료.
- `window.claude?.hot` 부분은 Claude 아티팩트 실시간 업데이트용 훅이다. 일반 브라우저에서는 없는 값이라 무해하다.
- 사운드는 WebAudio로 합성(파일 없음). 첫 사용자 입력 후에만 재생.

## 디자인

- 단일 테마(항구의 깊은 청록 바탕 + 콘크리트 산책로 + 구명부표 주황 강조색). 색은 모두 `shell.html`의 `:root` 토큰에서 읽어 캔버스에도 쓴다.
- 폰트: 제목 Jua(주아), 본문 Noto Sans KR(Android 기본 한글 글꼴 계열). 2026-09-30 Bagel Fat One/IBM Plex Sans KR에서 교체(한글이 어색하다는 피드백). dist/·아티팩트는 Google Fonts, www/(PWA·앱)는 서브셋 내장본을 "Bukang Display/Body"로 이름 바꿔 사용. 실패 시 시스템 폰트.
- 한글 조판: body에 `word-break: keep-all`(단어 중간 줄바꿈 금지), 자간 -0.01em, `font-synthesis: none`(단일 굵기 Jua에 가짜 볼드 금지 — 제목 요소는 font-weight 400 유지).
- 상어는 코드로 그린 탑다운 무태상어. 기존 캐릭터를 닮게 만들지 말 것. 게임 속 호칭은 이름 없이 "상어(야)".
- 네이티브 느낌 유지: 텍스트 선택·롱프레스 메뉴·확대 금지, hover 효과는 `@media (hover: hover)` 안에만, 글자 버튼 대신 아이콘+라벨, 누름은 scale 스프링.

## 주의

- "부캉이"(부산시설공단이 붙인 애칭, 부산시 명예홍보대사)는 쓰지 않는다. 2026-09-25 개인이 상표 출원(심사 중)해 분쟁 소지가 있어 2026-09-30 앱 이름을 "길 잃은 상어"로 바꿨다. "아기상어"(핑크퐁), "죠스", "집으로 가는 길"(기존 부캉이 웹게임)도 피할 것.
- 톤은 "집(바다)에 돌려보내기". 상어를 괴롭히거나 먹이를 던지는 요소는 넣지 않는다.

## 다음 단계 후보

1. 실제 기기 터치 테스트, 스와이프 감도(현재 18px, 이동 중 발동) 조정
2. ~~레벨 30~50개로 확장 + 챕터 구분~~ (36개 · 3장 완료) → 플레이 테스트로 난이도 곡선 조정
3. 새 장치: 움직이는 구조정(턴마다 이동), 한 번 지나면 사라지는 얇은 얼음/부유물 등 — engine.js와 풀이기 상태에 반영 필요
4. 네이티브 전환: Capacitor 설정 완료(docs/RELEASE.md). 남은 일: Node 22+·Android Studio 설치 → npm install → npx cap add android → 기기 테스트 → Play 비공개 테스트 (폰트 내장·스토어 자료 초안 완료)
5. 수익화: 힌트를 보상형 광고로, 스테이지 사이 전면 광고, 스킨(계절 상어)
6. 실제 방류 성공 시 "해피엔딩" 업데이트
