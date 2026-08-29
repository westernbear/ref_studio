# Motion Workspace UI Completion Record

상태: **완료**
구현 기준: `stitch_ui_todo.zip`의 Stitch 화면·토큰과 기존 `CompilerDialogue`/design primitives

## 완료된 UI

- [x] 데스크톱 채팅/에디터 split workspace와 30:70~70:30 제한
- [x] native pointer drag, 44px pointer hit area, 키보드 2% 이동, Home/End, `role="separator"`, ARIA 현재 비율, localStorage 복원
- [x] 모바일에서 mounted 상태를 보존하는 Chat/Editor 탭과 separator 숨김
- [x] 인터랙티브 SceneSpec 캔버스, 선택, pointer drag, 키보드 nudge, zoom, frame scrubber
- [x] 타임라인/속성 inspector와 직접 속성 수정
- [x] 채팅 수정과 직접 조작이 동일한 `SceneOperation`, ETag, immutable version history를 사용
- [x] 직접 수정/Undo/rollback을 채팅 작업 이벤트로 기록
- [x] 검증 상태, version 선택, Undo, rollback, render queue/progress/result, MP4/Scene Package 다운로드 action card
- [x] Native backend를 기본으로 연결하고 실제 API 응답만 표시
- [x] Adobe는 connector enrollment와 실제 AE QA gate 전까지 잠긴 capability로 표시하고, 연결되지 않은 connect/project/result UI는 만들지 않음
- [x] 한·영 문구, 44px control target, keyboard parity, reduced motion, 320px 무가로스크롤
- [x] 개발 환경의 React Grab/Scan/Doctor와 production 제외 설정

## 기능 연결 원칙

장식용 버튼이나 가짜 성공 상태는 없다. 채팅, canvas drag/nudge, 속성 변경, Undo, rollback, render, 다운로드는 실제 API로 연결된다. Adobe 선택은 `RVS_ADOBE_MCP`의 프로토콜·보안·실기 gate를 통과하기 전에는 disabled 상태이며 Native 전달은 계속 동작한다.

## 검증 기록

- `$browse` + `GSTACK_CHROMIUM_NO_SANDBOX=1`: desktop/tablet/mobile/320 viewport에서 실제 production build와 실제 API fixture 사용
- Scene 수정: property PATCH, canvas keyboard/pointer PATCH, chat refine, ETag/version 증가 확인
- 이력: Undo와 선택 version rollback이 새 immutable version을 생성하고 이전 장면을 복구함
- 전달: render `QUEUED → COMPLETED`, progress 100%, MP4 `200 video/mp4`, Scene Package `200 application/x-tar`
- 접근성/반응형: separator pointer/Arrow/Home/End, ARIA 값, localStorage, mobile tab state 보존, reduced-motion, 320px `scrollWidth === clientWidth`
- 화면 증거: `.omo/evidence/motion-workspace-ui/`

원래 구현 프롬프트의 모든 UI 항목은 위 완료 목록과 검증 기록으로 대체되었다.
