# 1–4장 챕터 배경 추가

2026-10-03. 5·6장에만 있던 챕터 소개 그림을 1–4장에도 같은 형식으로 추가했다.

| 장 | 테마 | 게임용 파일 |
|---|---|---|
| 1 · 북항 수로 | 작은 항구·구조정·굽은 수로 | `assets/art/regions/harbor-canals.webp` |
| 2 · 친수공원 운하 | 정원·꽃·산책로·보행교 | `assets/art/regions/waterside-park.webp` |
| 3 · 방파제 너머 | 등대·방파제·바다로 열린 물길 | `assets/art/regions/beyond-breakwater.webp` |
| 4 · 외항 물길 | 모래톱·바깥바다·완만한 소용돌이 | `assets/art/regions/outer-harbor.webp` |

밝은 아쿠아색 물, 둥근 아이보리 난간, 파란 지붕과 주황색 구명튜브로 기존 5·6장 그림과 톤을 맞췄다. 네 장을 각각 내장 ImageGen으로 제작했고 외부 다운로드 자산은 사용하지 않았다. 원본 PNG와 전체 프롬프트는 [chapter-scenes-v1](../assets/art/chapter-scenes-v1/README.md)에 보관한다.

기존 `CHAPTERS.region → REGION_ART → setRegionArt()` 경로를 사용한다. 선택한 챕터의 설명 위에만 3:2 그림을 표시하고, 5·6장의 배치·그림과 플레이 판 색상은 유지한다. 스테이지 배치·규칙·저장·별·해금 조건은 바꾸지 않았다.

네 WebP는 각각 720×480이며 합계 267.1 KiB다. `tools/build-source.js`가 단일 HTML·아티팩트·웹/PWA에 내장하므로 오프라인에서도 별도 이미지 요청 없이 표시한다. 큰 원본 PNG와 프롬프트 문서는 게임 빌드에 포함하지 않는다.

재생성: `node tools/prepare-region-art.js <기존 sharp 설치 경로> --chapters-only`. 이 옵션은 1–4장만 변환해 기존 5·6장 파일을 덮어쓰지 않는다.

검증: 자동 검사 157개와 전체 60개 수로 해법 검사 통과. 단일 HTML·아티팩트·웹/PWA 빌드 통과. 브라우저에서 여섯 장을 순서대로 선택해 모든 이미지의 로딩(720×480), 실제 표시 비율(3:2), 내장 data URL과 콘솔 오류 없음을 확인했다. 실물 기기 및 네이티브 앱 배포는 이번 웹 반영에 포함하지 않는다.
