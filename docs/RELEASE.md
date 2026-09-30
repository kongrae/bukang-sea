# 출시 가이드

순서: **웹(PWA) → Android(Capacitor) → iOS**. 게임 코드(`src/`)는 세 경로 모두 같다.

## 1. 웹 (PWA)

```bash
npm run build:web      # www/ 생성: index.html, manifest.webmanifest, sw.js, icons/
npm run serve          # http://localhost:5173 에서 확인
```

- `www/` 폴더를 정적 호스팅(GitHub Pages, Netlify, Cloudflare Pages 등)에 그대로 올리면 된다. **HTTPS 필수**(서비스 워커 조건).
- 한 번 열면 오프라인에서도 동작한다(앱 파일 + 내장 폰트 캐시). 휴대폰 브라우저의 "홈 화면에 추가"로 앱처럼 설치된다.
- 개인정보처리방침은 `www/privacy.html`로 함께 배포된다(원본 `assets/privacy.html`, [대괄호] 값 채울 것). 스토어 등록 문구·그래픽은 `docs/STORE.md`.
- 새로 빌드하면 `sw.js`의 캐시 버전이 자동으로 바뀌어 다음 방문 때 갱신된다.
- 아이콘을 바꾸려면 `assets/icon.svg`를 고친 뒤 `npm run icons` (Edge 또는 Chrome 필요) → PNG를 커밋.
- Claude 아티팩트 링크로 공유할 때는 `npm run build:artifact`로 만든 `dist/artifact.html`을 게시한다(PWA 기능은 없음).

## 2. Android (Capacitor 8)

### 준비물 (한 번만)
- **Node.js 22 이상** (Capacitor 8 CLI 요구 사항). `winget install OpenJS.NodeJS.LTS`
- **Android Studio** (SDK, 에뮬레이터, 빌드 도구 포함). 처음 실행할 때 설정 마법사로 SDK 설치.
- Google Play 개발자 계정 (25달러, 1회)

### 처음 세팅
```bash
npm install
npx cap add android        # android/ 네이티브 프로젝트 생성 (생성 후 커밋)
npm run cap:sync           # www 빌드 + android 로 복사
npm run cap:open           # Android Studio 에서 열기 → 기기/에뮬레이터 선택 → Run
```

게임 코드를 고친 뒤에는 `npm run cap:sync`만 다시 하면 된다.

### 출시 전에 정할 것
- **appId** (`capacitor.config.json`의 `kr.lostshark.app`는 임시값): 스토어에 한 번 올리면 **영구히 못 바꾼다**. 본인 도메인이나 고유한 역도메인으로 정한 뒤 `npx cap add android` 전에 바꿀 것.
- **앱 이름**: "길 잃은 상어"로 확정(2026-09-30). "부캉이"는 개인 상표 출원·공공기관 명칭 문제로 쓰지 않는다.
- 앱 아이콘: Android Studio → `res` 우클릭 → New → Image Asset 에서 `assets/icons/icon-512.png`로 적응형 아이콘 생성.
- 서명 키(업로드 키) 생성: Android Studio → Build → Generate Signed App Bundle. **키 파일과 비밀번호는 저장소 밖에 백업**(잃어버리면 업데이트 불가).

### Google Play 등록 흐름
1. Play Console에서 앱 만들기 → 스토어 등록정보(설명, 스크린샷, 아이콘 512px, 그래픽 이미지 1024×500)
2. 콘텐츠 등급 설문(IARC) → 국내 게임 등급분류도 이걸로 처리됨
3. 개인정보처리방침 URL (광고를 넣으면 필수, 없어도 요구될 수 있음)
4. **개인 개발자 계정은 비공개 테스트에 테스터 12명 이상, 14일 연속 참여**가 있어야 프로덕션 출시 신청 가능
5. `.aab` 업로드 → 검토 → 출시

### 앱에서 확인할 것
- 하드웨어 뒤로가기: 게임 화면 → 수로 목록, 목록 → 앱 종료 (`@capacitor/app` 사용, `src/game.js`)
- 노치·제스처 바 여백: `shell.html`의 `.app`이 `env(safe-area-inset-*)`를 쓴다. 실제 기기에서 위아래가 가려지지 않는지 확인.
- 폰트: `www/fonts/`에 게임에서 쓰는 글자만 담은 서브셋 폰트가 들어 있어 네트워크 없이 표시된다. 새 글자(레벨 이름·안내문 등)를 추가했는데 빌드가 경고하면 `npm run fonts`로 다시 받는다.

## 3. iOS

- **Mac + Xcode 필수**(Windows에서는 빌드 불가). Mac이 없으면 Codemagic, GitHub Actions macOS 러너 같은 클라우드 빌드를 쓴다.
- Apple Developer Program 연 99달러.
- `npm install @capacitor/ios` → `npx cap add ios` → `npx cap open ios` → Xcode에서 서명 팀 지정 후 Archive → App Store Connect 업로드.
- 심사 가이드라인 4.2(최소 기능): 웹을 감싸기만 한 앱은 반려될 수 있다. 이 게임은 파일이 앱 안에 있어 오프라인으로 돌아가므로 유리하지만, 진동(Haptics 플러그인) 같은 네이티브 기능을 조금 더하면 안전하다.
