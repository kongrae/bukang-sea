# 효과음 음원 출처

게임에 내장한 효과음 19개는 모두 사람이 녹음·제작한 **CC0** 음원이다. AI로 생성한 오디오와 다른 게임에서 추출한 소리는 쓰지 않았다. 선택 과정과 기준은 [docs/SOUND-MOTION.md](../../docs/SOUND-MOTION.md)에 있다.

- **AI 아님 확인 방법:**
  - Kenney 팩: 각 팩의 License.txt에서 CC0와 제작 시기(2014–2020년)를 확인했다. 생성 AI 오디오가 쓰이기 전에 Kenney가 직접 만든 팩이다.
  - Freesound: 소리마다 페이지에서 라이선스(CC0), 업로드 날짜, 녹음 설명을 확인했다. 'AI generated'·'GenAI' 같은 문구나 'ai' 태그가 없는지도 검사했다(2026-10-08).
- **가공:** 파일은 원본(Kenney OGG, Freesound 미리듣기 MP3)을 그대로 넣었다. 시작 위치, 길이, 페이드, 음량, 재생 속도(음정)는 게임이 재생할 때 Web Audio로 처리한다(`src/sound.js` `SFX_SAMPLES`).
- **크레딧:** CC0라 표기 의무는 없지만, 이 파일로 출처를 남긴다.

| 파일 | 게임 용도 | 출처 (원본 이름) | 작성자 | 라이선스 | 공개 | AI 아님 근거 |
|---|---|---|---|---|---|---|
| soft-impact-0.ogg | 막힘, 숭어(냠) | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) (impactSoft_medium_000) | Kenney | CC0 | 2019-12-19 | 2019년 Kenney 제작 팩 |
| soft-impact-2.ogg | 막힘, 숭어(냠), 나무 상자 | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) (impactSoft_medium_002) | Kenney | CC0 | 2019-12-19 | 2019년 Kenney 제작 팩 |
| soft-impact-3.ogg | 막힘, 숭어(냠) | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) (impactSoft_medium_003) | Kenney | CC0 | 2019-12-19 | 2019년 Kenney 제작 팩 |
| water-drop.mp3 | 숭어(꿀꺽), 시작, 되돌리기(역재생) | [Freesound 348022](https://freesound.org/people/LilMati/sounds/348022/) (Water Drop 01) | LilMati | CC0 | 2016-06-18 | 물방울 녹음, AI 표시 없음 |
| water-drop-2.mp3 | 숭어(꿀꺽), 스킨 선택 | [Freesound 273870](https://freesound.org/people/beskhu/sounds/273870/) (water drop 1) | beskhu | CC0 | 2015-05-12 | 물방울 녹음, AI 표시 없음 |
| cloth-1.ogg | 그물 설치 | [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio) (cloth1) | Kenney | CC0 | 2014 | 2014년 Kenney 제작 팩 |
| cloth-3.ogg | 그물 회수 | [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio) (cloth3) | Kenney | CC0 | 2014 | 2014년 Kenney 제작 팩 |
| water-swish.mp3 | 물줄기, 수문 물, 구조정 | [Freesound 321489](https://freesound.org/people/dslrguide/sounds/321489/) (Water Swish) | dslrguide | CC0 | 2015-09-07 | 큰 그릇 물속에서 펜을 빠르게 움직인 녹음, AI 표시 없음 |
| drain-glug.mp3 | 소용돌이 | [Freesound 137028](https://freesound.org/people/majorasflask/sounds/137028/) (Drain glug) | majorasflask | CC0 | 2011-12-10 | 세면대 배수구로 빠지는 물 녹음, AI 표시 없음 |
| wet-sand-step.mp3 | 모래톱 | [Freesound 505160](https://freesound.org/people/mitchanary/sounds/505160/) (Foot_mud_sand_1) | mitchanary | CC0 | 2020-02-04 | 진흙 모래 발소리 녹음, AI 표시 없음 |
| toggle.ogg | 스위치 | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) (toggle_002) | Kenney | CC0 | 2020-02-11 | 2020년 Kenney 제작 팩 |
| wood-creak.ogg | 수문 | [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio) (creak3) | Kenney | CC0 | 2014 | 2014년 Kenney 제작 팩 |
| splash.mp3 | 탈출 | [Freesound 398032](https://freesound.org/people/swordofkings128/sounds/398032/) (Splash) | swordofkings128 | CC0 | 2017-07-22 | 손으로 물을 친 물보라 녹음, AI 표시 없음 |
| select.ogg | 버튼 | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) (select_002) | Kenney | CC0 | 2020-02-11 | 2020년 Kenney 제작 팩 |
| open.ogg | 시트 열기 | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) (open_001) | Kenney | CC0 | 2020-02-11 | 2020년 Kenney 제작 팩 |
| close.ogg | 시트 닫기 | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) (close_001) | Kenney | CC0 | 2020-02-11 | 2020년 Kenney 제작 팩 |
| marimba-c5.mp3 | 음 층 A4–C#5 (그물·스위치·탈출·별·시작·선택) | [Freesound 373580](https://freesound.org/people/sgossner/sounds/373580/) (Marimba - C5, VSCO 2 CE) | sgossner (Versilian Studios) | CC0 | 2017-01-05 | 공연장에서 실제 연주를 녹음(Rode NT1-A, 연주자 기재), AI 표시 없음 |
| marimba-g5.mp3 | 음 층 E5–A5 | [Freesound 373586](https://freesound.org/people/sgossner/sounds/373586/) (Marimba - F#5, 측정 음높이 G5, VSCO 2 CE) | sgossner (Versilian Studios) | CC0 | 2017-01-05 | 공연장 실제 연주 녹음, AI 표시 없음 |
| glockenspiel-c6.mp3 | 종 층 A5–E6 (별·해금·장 시작) | [Freesound 373364](https://freesound.org/people/sgossner/sounds/373364/) (Glockenspiel - C5, 측정 음높이 C6, VSCO 2 CE) | sgossner (Versilian Studios) | CC0 | 2017-01-05 | 공연장 실제 연주 녹음, AI 표시 없음 |

Freesound 파일은 공개 미리듣기 MP3다. 악기 3개는 용량을 줄이려고 저용량(lq) 미리듣기를 썼고, 나머지는 128kbps(hq)다. 라이선스는 원본과 같다.
