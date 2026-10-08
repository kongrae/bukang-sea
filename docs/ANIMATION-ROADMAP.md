# 애니메이션 개선 순서

> 2026-10-08: 실제 게임 사례를 참고한 사운드·연출 보강은 [SOUND-MOTION-HANDOFF.md](SOUND-MOTION-HANDOFF.md)의 FX01–FX06으로 진행한다(미착수, 시작 요청을 기다림).

콘텐츠 개선 번호와 별개인 연출 작업 목록이다. 사용자 요청에 따라 1–8번의 코드 작업과 자동/브라우저 검증을 완료했다. 실물 Android 검증은 남아 있다.

| 번호 | 내용 | 추천 모델 | 추론 강도 | 상태 |
|---|---|---|---|---|
| 1 | 클리어 별 순차 획득, 조건 강조, 반짝임과 효과음 | GPT-6.1 Sol | high | 구현 완료 |
| 2 | 다음 수로·챕터 해금, 갱신한 별과 여정 표시 | GPT-6.1 Sol | high | 구현 완료 |
| 3 | 구조작전 단계 완료, 구조일지 도장과 새 배지 | GPT-6.1 Sol | high | 구현 완료 |
| 4 | 새 상어 획득 미리보기, 선택한 상어의 짧은 수영 | GPT-6.1 Sol | high | 구현 완료 |
| 5 | 수로 안 이동·정지·숭어·장치 반응의 연결감 점검과 개선 | GPT-6 Astra | xhigh | 구현·자동/브라우저 검증 완료 |
| 6 | 메인 상어·바다·출발 버튼의 가벼운 반응 | GPT-6.1 Sol | high | 구현·자동/브라우저 검증 완료 |
| 7 | 메뉴·시트·설정·버튼 전환과 입력 반응 통일 | GPT-6.1 Sol | high | 구현·자동/브라우저 검증 완료 |
| 8 | 전체 연출의 모바일 성능·동작 줄이기·중단 처리 최종 점검 | GPT-6 Astra | xhigh | 코드·자동/브라우저 완료, 실기기 대기 |

1–4번 구현과 검증 범위는 [REWARD-ANIMATIONS.md](REWARD-ANIMATIONS.md), 5번은 [PLAY-MOTION.md](PLAY-MOTION.md), 6번은 [HERO-MOTION.md](HERO-MOTION.md), 7번은 [SHEET-MOTION.md](SHEET-MOTION.md), 8번은 [MOTION-AUDIT.md](MOTION-AUDIT.md)에 기록한다. 다음 권장은 해당 문서의 실물 Android 시험과 `PLAYTEST.md`의 실제 이용자 시험이다. 새 번호의 작업은 별도 시작 요청을 기다린다.
