# Clawpick Mechanical Lab

실제 인형 뽑기 머신의 노출 기구와 조작감을 브라우저에서 검증하는 물리
프로토타입입니다. Next.js 기반 UI와 React Three Fiber, Rapier 물리 엔진을
사용합니다.

## 구현 범위

- 공유 플런저로 함께 움직이는 3지 다관절 집게
- 관절 한계와 물리 콜라이더에 의한 집게 간섭 방지
- 윈치 길이 제어와 비신축 로프 제약을 이용한 승강
- 트롤리 이동 관성에 따른 케이블 진자 운동
- 상부 X/Z 레일, 트롤리 휠, 윈치 드럼과 머신 외부 프레임
- 장력, 케이블 길이, 흔들림 각도, 집게 간격 디버그 계측

## 실행

Node.js `22.13.0` 이상이 필요합니다.

```bash
npm install
npm run dev
```

## 검증

```bash
npm run typecheck
npm run lint
npm test
```

`npm test`는 프로덕션 빌드와 함께 집게 기구학, 케이블 장력, 숨은 파지
보정 제거 여부, 서버 렌더링을 검증합니다.
