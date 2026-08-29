# Motion Workspace UI TODO

이번 실행에서는 UI 코드를 변경하지 않는다. 아래 프롬프트만 저장하며, 구현 시 기존 `CompilerDialogue`와 디자인 primitives를 재사용한다.

> 기존 Scene Review를 하나의 양방향 모션 워크스페이스로 개선하라. 데스크톱은 왼쪽 50% Claude/ChatGPT형 채팅, 오른쪽 50% 인터랙티브 캔버스·타임라인·속성 패널로 구성한다. 두 패널 사이에 native pointer events 기반 draggable separator를 두고 30:70~70:30으로 제한한다. 키보드 화살표는 2%씩 조절하고 Home/End를 지원하며 `role="separator"`와 ARIA 현재 비율을 제공한다. 마지막 비율은 localStorage에 저장한다. 모바일은 상태가 보존되는 Chat/Editor 탭으로 전환하고 separator를 숨긴다.
>
> 채팅 수정과 직접 조작은 동일한 shared `SceneOperation`, ETag, version history를 사용한다. 직접 수정은 채팅에 작업 이벤트로 기록한다. Native/Adobe backend 선택, Adobe MCP 연결, project 선택, queued/running/result 상태, 검증, Undo, rollback, render와 다운로드를 action card로 표시한다. 기존 `CompilerDialogue`와 디자인 primitives를 재사용하고 새 state manager·splitter·canvas 라이브러리는 추가하지 않는다. 44px target, keyboard parity, screen reader, reduced motion, 한·영 문구, 320px 무가로스크롤을 검증한다.
