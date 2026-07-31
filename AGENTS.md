# AGENTS.md

이 저장소에서 작업하는 코딩 에이전트를 위한 안내다. 기능 소개는 `README.md`,
기구 사양과 결정 이력은 `docs/claw-mechanism-spec.md`에 있다. 코드를 고치기 전에
최소한 `docs/claw-mechanism-spec.md`의 §10.5 "구현 변경 이력과 이유" 표를 읽어라.
이미 시도했다가 폐기한 접근이 거기에 정리되어 있다.

## 1. 프로젝트 성격과 현재 단계

Clawpick은 온라인 인형뽑기 게임이고, **실제 인형뽑기 기계와 같은 조작감을 내기 위해
물리 엔진과 기구 부품을 만들어 보는 프로토타입 단계**다. 완성된 제품 코드가 아니다.

여기서 나오는 모든 규칙은 하나의 목표에서 파생된다.

> 화면에서 일어나는 일은 **기구가 힘을 받아 움직인 결과**여야 하고,
> 게임을 잘 굴러가게 만드는 눈속임이어서는 안 된다.

저장소 역사는 눈속임을 계속 걷어낸 궤적이다. 숨은 파지 보정 제거, 스프링 케이블 →
비신축 로프, 위치 서보(PD) → 방향·속도제한·최대 축력, 키네마틱 추종 → 동적 폐쇄 링크,
키네마틱 갠트리 앵커 → prismatic 조인트 + 속도 모터, 렌더 프레임 물리 → 고정 60Hz 스텝,
손으로 적은 벽 콜라이더 → 유리 외곽선에서 파생. 이 방향을 되돌리는 변경은 거의 항상
잘못된 변경이다.

시행착오 단계이므로 "지금 코드가 이상해 보인다"는 이유만으로 구조를 되돌리지 마라.
대부분 한 번 시도해 보고 실패해서 지금 형태가 된 것이고, 그 이유가 주석과 스펙 문서와
`assert.doesNotMatch` 회귀 테스트에 남아 있다.

## 2. 아키텍처

의존 방향은 단방향이다. 순수 로직은 아무것도 위로 참조하지 않는다.

```
app/*.tsx  (페이지·모달·레이아웃)
   └─ components/*.tsx  (R3F 씬, Rapier 바디/조인트, DOM 패널)
         └─ game/store.ts, game/clawSpecs.ts, game/types.ts   (zustand 상태·타입)
         └─ game/*.mjs                                        (순수 로직)
```

### game/\*.mjs — 순수 로직

React·Rapier 의존이 **0건**이다. 계층 내부 import도 네 개뿐이라(`machineStep → driveAxis`,
`gantryGeometry → machineDimensions`, `glassShell → machineDimensions`,
`chuteShell → glassShell`) 순환이 없다.
`game/umbilicalDynamics.mjs`만 예외적으로 `three`를 import한다(three는 헤드리스에서
돌아가므로 테스트 가능).

| 파일 | 책임 |
| --- | --- |
| `game/machineStep.mjs` | 8단계 상태 머신 전이 판정, 윈치 궤적, 축 목표 속도 |
| `game/driveAxis.mjs` | 축 모터 램프와 제동 곡선 |
| `game/cableTravel.mjs` / `game/cableDynamics.mjs` | 비신축 와이어 길이와 속도 투영 |
| `game/clawKinematics.mjs` / `game/clawActuator.mjs` | 집게 폐쇄 링크 해석 기구학, 솔레노이드 축력 |
| `game/gantryGeometry.mjs` / `game/machineDimensions.mjs` | as-built 치수와 파생 이동 범위 |
| `game/glassShell.mjs` | 강화유리 외곽선 **그리고 거기서 파생되는 캐비닛 벽 콜라이더**(`createGlassWallColliders`) |
| `game/chuteShell.mjs` | 상품 낙하구 아크릴 가이드 외곽선과 거기서 파생되는 가이드 콜라이더. 두께는 `glassShell`의 `GLASS.thickness`를 읽는다 |
| `game/joystick.mjs` / `game/clawTuning.mjs` | 입력 정규화, UI 레벨 ↔ 물리값 매핑 |
| `game/settingsStorage.mjs` / `game/settingsMigration.mjs` | 물리 설정 영속화와 마이그레이션 |

`game/glassShell.mjs`를 렌더 전용으로 오해하지 마라. 벽 barrier의 유일한 치수 소스다.
`game/chuteShell.mjs`도 같다 — 낙하구 가이드의 보이는 면과 인형이 닿는 면이 같은
외곽선에서 나온다. 두 모듈의 링 산술이 닮았다고 공용 함수로 합치지 마라. 유리의 내측면은
갠트리 여유가 측정되는 기준이라 `CABINET`에서 오고, 가이드의 내측면은 낙하구 입구에
맞춰져 있어서 소스가 다르다.

### components/\*.tsx — 렌더와 물리 적용

`components/GameCanvas.tsx`(Canvas·카메라) → `components/MachineScene.tsx`(Physics,
캐비닛·바닥·천장 콜라이더, Prize 20개) → `components/MechanicalClaw.tsx`(집게, 케이블,
그 안에 `components/GantryMechanism.tsx`). `components/Controls.tsx`는 조이스틱·수동
승강·집게 개폐 UI이자 `game/joystick.mjs`의 유일한 소비처다.

컴포넌트는 결정하지 않고 **측정 → 순수 함수 호출 → 적용**만 한다.

### 상태 계층 — 서로 독립된 zustand persist 스토어 2개

| | `useGameStore` (`game/store.ts`) | `useClawSpecStore` (`game/clawSpecs.ts`) |
| --- | --- | --- |
| 담는 것 | 런타임 게임 상태 + `PhysicsSettings`(23키) | `ClawPartSpecs`(24키, 그중 갠트리 6키) |
| 저장 키 | `clawpick-physics-settings` | `clawpick-claw-part-specs` |
| 버전 | `SETTINGS_STORAGE_VERSION`(현재 5, `game/settingsMigration.mjs`) | persist `version: 10` (인라인) |
| 하이드레이션 | `skipHydration: true`, `app/ClawLab.tsx`가 마운트 후 수동 rehydrate | 모듈 로드 시 즉시 |
| 영속 범위 | `settings`만(`partialize`) | `specs`만(`partialize`, `revision` 제외) |
| storage 어댑터 | `game/settingsStorage.mjs`의 `createSettingsStorage` (아래 참고) | 기본 localStorage |

`createSettingsStorage`는 단순 래퍼가 아니다. 현재 키가 비어 있으면 레거시 키
(`clawpick-settings` / `clawpick-settings-version`, 구 TuningPanel 자체 영속화)를 **딱 한 번**
읽어 현재 형식으로 감싸 돌려주고 두 레거시 키를 즉시 지운다. 저장 키나 마이그레이션을
건드리기 전에 이 경로를 먼저 읽어라.

UI는 `components/InspectorPanel.tsx`에서 `components/TuningPanel.tsx`(물리 튜닝
슬라이더)와 `components/ClawSpecsPanel.tsx`(부품 스펙 숫자 입력)를 탭으로 전환한다.

## 3. 반드시 지킬 불변 규칙

1. **`game/*.mjs`에서 React·Rapier를 import하지 않는다.** `three`는
   `game/umbilicalDynamics.mjs`의 기존 예외에 한정한다. 새 물리/기하 로직은
   `.tsx`가 아니라 `.mjs`로 만들고 컴포넌트에서 호출한다.
2. **물리 월드 쓰기는 `useBeforePhysicsStep` 안에서만.** 물리 스텝 콜백은 셋뿐이다 —
   `useBeforePhysicsStep` 2개(`components/MechanicalClaw.tsx`,
   `components/GantryMechanism.tsx`)와 계측 전용 `useAfterPhysicsStep` 1개
   (`components/MechanicalClaw.tsx`, `physicsStepMs`만 기록). after 쪽에 월드 쓰기를
   넣지 마라. `useFrame`에서는 RigidBody·조인트·월드를 절대 건드리지 않는다.
3. **스텝 안의 dt는 항상 `PHYSICS_TIME_STEP`(1/60, `game/machineDimensions.mjs`).**
   프레임 delta를 물리 계산에 끌어들이지 않는다. `useFrame`의 delta는
   `Math.min(unsafeDelta, 0.04)`로 클램프한 뒤 시각 계산에만 쓴다.
4. **측정·결정이 있는 스텝 콜백은 `// --- measure ---` → `// --- decide ---` →
   `// --- apply: … ---` 순서를 지킨다.** 현재 이 마커를 쓰는 것은
   `components/MechanicalClaw.tsx`의 콜백 하나다. 순수 apply만 하는 콜백
   (`GantryMechanism.tsx`의 `GantryAxes`)은 마커 없이 짧게 둔다 — 여기에 마커를
   붙이려고 리팩터하지 마라. 프로덕션 코드의 `stepMachine()` 호출은
   `components/MechanicalClaw.tsx` 한 곳뿐이고(테스트 하네스는 별도로 호출한다)
   그 상태를 유지한다.
5. **숨은 파지 보정 금지.** 거리 기반 부착, 인형 흡착력, 파지 반경 같은 것은 초기
   프로토타입에 있다가 제거됐고 `tests/claw-kinematics.test.mjs`가
   `applyGripAssist|gripRadius|grabbed.current`를 정규식으로 막는다. 파지는 형상·마찰·
   관절력으로만 성립해야 한다.
6. **위치 서보/PD 금지.** 플런저는 방향 + 속도 컷오프 + 최대 축력만 명령한다
   (`game/clawActuator.mjs`). 인형의 저항이 실제 스트로크를 결정해야 한다.
   제거된 구식 설정 키(서보 계열 + 케이블 길이 2개)는
   `game/settingsMigration.mjs`의 `OBSOLETE_PHYSICS_SETTINGS`에 있다.
7. **플런저 외의 링크(로커·손가락)에 모터·토크·애니메이션을 걸지 않는다.**
   유일한 입력은 플런저 축력이고 나머지 자세는 Rapier 폐쇄 링크 솔버가 정한다.
   `tests/claw-actuator.test.mjs`와 `tests/claw-kinematics.test.mjs` **두 곳**이
   `components/MechanicalClaw.tsx` 소스에서 `configureMotor`/`MotorModel` 사용을 막는다.
   이 금지는 그 파일 한정이다 — `components/GantryMechanism.tsx`는
   `MotorModel.ForceBased` + `configureMotorVelocity`를 정상적으로 쓴다.
8. **스프링/신축 케이블 금지.** 승강 와이어는 비신축 rope joint + 방사 속도 투영이다.
   `cableStiffness`/`cableDamping`/`applyImpulse`는 테스트가 막는다.
9. **한계는 숫자 clamp가 아니라 물리로 구현한다.** 축 끝단 = prismatic joint limit +
   명령 테이퍼, 손가락 간섭 = 관절 한계 + 콜라이더, 케이블 = rope joint + 속도 투영.
10. **치수는 손으로 적지 않고 파생시킨다.** 봉 길이·축 이동 범위는
    `CABINET`(`game/machineDimensions.mjs`)에서, 벽 콜라이더는
    `createGlassWallColliders()`가 유리 외곽선에서, 최대 케이블 길이는 집게 형상과 바닥
    높이에서 나온다. 새 숫자 리터럴을 넣기 전에 기존 상수에서 계산 가능한지 확인하라.
11. **벽 barrier를 다시 리터럴로 적지 마라.** `CABINET`이 `wallHalfWidth`/`wallHalfDepth`를
    들고 있다가 유리와 어긋난 적이 있어서 제거했다(`game/machineDimensions.mjs`에 사유
    주석이 남아 있다). `tests/glass-shell.test.mjs`가 내부 링과
    `CABINET.glassHalfWidth`/`glassHalfDepth`의 일치를 `assert.equal`로 못박는다.
12. **렌더 메시와 콜라이더는 같은 RigidBody의 자식으로 두고 같은 치수 소스를 읽는다.**
    별도 키네마틱 바디로 월드 자세를 복사하지 않는다(폐기된 방식).
13. **집게 몸통 회전을 잠그거나 자세를 덮어쓰거나 복원 토크를 가하지 않는다.**
    과회전 제한은 와이어 출구 가이드와 몸통 윗면의 실제 접촉으로만 한다.
14. **되돌리면 안 되는 결정은 문서 서술로 끝내지 말고 `assert.doesNotMatch` 회귀
    테스트로 고정한다.** 이 저장소의 확립된 관행이다.

## 4. 흔한 작업별 절차

### 4.1 부품 스펙(치수) 값 추가

1. `game/types.ts` — `ClawPartSpecs`에 키 추가
2. 기본값 — 집게 계열은 `game/clawSpecs.ts`의 `DEFAULT_CLAW_PART_SPECS`,
   **갠트리 계열은 `game/gantryGeometry.mjs`의 `DEFAULT_GANTRY_PART_SPECS`**
   (`DEFAULT_CLAW_PART_SPECS`가 이것을 스프레드로 흡수한다)
3. `game/clawSpecs.ts` — `CLAW_PART_SPEC_LIMITS`에 범위 추가. 갠트리 키도 여기다
   (`Record<keyof ClawPartSpecs, …>`라 누락하면 typecheck 실패). 즉 갠트리 키는
   기본값만 `gantryGeometry.mjs`에 있고 나머지는 이 절차 전부를 그대로 밟는다.
4. 정수여야 하면 `clampSpec`의 반올림 분기에 키 추가
   (현재 `powerCableTurns`, `powerCableSegments`)
5. 다른 치수와 물리적으로 충돌 가능하면 `normalizeClawPartSpecs` /
   `normalizeGantryPartSpecs` 하단 보정에 규칙 추가. 소비처 방어 코드로 처리하지 않는다.
6. `components/ClawSpecsPanel.tsx` — 해당 PART의 `fields`에 추가
   (`unit` 미지정이면 mm 표시). **패널 노출은 자동 검증되지 않는다.**
   `tests/claw-specs-panel.test.mjs`는 손으로 유지되는 14개 키만 대조하므로, 새 키를
   빠뜨리면 테스트는 통과하고 편집 불가능한 값만 생긴다. 현재 24/24 전부 노출 상태이니
   유지할 것.
7. 소비처 연결 — **여기가 가장 자주 빠진다.**
   - 집게 몸통·플런저·로커·핀 계열 → `components/MechanicalClaw.tsx`의
     `getClawPartDimensions`
   - 손가락·링크 계열(`fingerLength`, `linkWidth`, `linkThickness`,
     `fingerTaperStart`, `fingerTipWidthScale` 등) → `game/clawKinematics.mjs`의
     `createClawGeometry(specs)`
   - 갠트리 → `game/gantryGeometry.mjs`의 `createGantryGeometry`

   `getClawPartDimensions`만 고치면 손가락 계열 신규 키는 메시·콜라이더에 전혀
   반영되지 않고 typecheck·테스트는 전부 통과한다.
8. 기본값 변경을 기존 사용자에게 강제하려면 persist `version`을 올리고 `migrate`에 조건
   추가. `game/clawSpecs.ts`의 `migrate`는 `if (version >= 10) return persisted;`로 조기
   반환하므로 **이 상수도 같이 올려야** 새 조건에 도달한다.
   **키 추가만 하는 경우는 버전을 올릴 필요가 없다**(normalize가 기본값으로 채움).
9. `tests/claw-specs-panel.test.mjs` 갱신. 갠트리 계열이면
   `tests/drive-axis.test.mjs`의 `ranges`에도 키/범위를 손으로 추가해야 스윕된다.
10. `docs/claw-mechanism-spec.md` §6(필요한 실제 부품) / §7(3D 객체 계층) /
    §13(렌더링 메시와 충돌체) / §18의 "집게 부품 스펙 편집", 그리고 `README.md` 갱신

### 4.2 물리 튜닝 파라미터 추가

1. `game/types.ts` — `PhysicsSettings`
2. `game/store.ts` — `DEFAULT_SETTINGS`, `PHYSICS_SETTING_LIMITS`,
   `normalizePhysicsSettings`의 `read` 호출 **세 곳 모두**
3. `components/TuningPanel.tsx` — 해당 섹션에 슬라이더 추가.
   빠뜨리면 `tests/debug-plunger-control.test.mjs`가 자동으로 실패한다
   (store 소스에서 리밋 표를 정규식으로 파싱해 패널과 대조).
4. 소비 컴포넌트에서 좁은 셀렉터로 구독
5. 간단 설정(grip/speed/stability)에 묶을 값이면 `game/clawTuning.mjs`의
   `LEVEL_PARAMETERS`와 `getSimpleClawTuningPatch` **양쪽 모두** 수정
   (앵커 숫자가 두 함수에 각각 복제되어 있다)
6. `docs/claw-mechanism-spec.md` §10.3 단위 표 갱신

리밋 표는 `  키: { min: X, max: Y },` 형태로 **정확히 2칸 들여쓰기 한 줄**로 쓴다.
테스트가 `/^ {2}([a-zA-Z]+): \{ min:/gm`로 파싱하므로 여러 줄로 나누면 조용히 검증에서
빠진다. 키 이름에 숫자나 언더스코어를 넣어도 같은 이유로 빠진다. 파서는 표 전체가
무너질 때만 잡아내고(`settings.length > 15` 가드) 한 줄이 빠지는 것은 못 잡는다.
파서가 `store.indexOf("PHYSICS_SETTING_LIMITS")`부터 `store.indexOf("function clampSetting")`
까지를 슬라이스하므로 `clampSetting`을 리밋 표 위로 옮기면 파싱이 통째로 무너진다.

### 4.3 물리 튜닝 파라미터 이름 변경 / 제거

경로가 셋이고 목적이 다르다.

- **이름 변경(값 보존)** — `normalizePhysicsSettings`의 레거시 폴백 사다리를 따른다
  (`closeSpeed → plungerSpeed * 0.142`, `clawStrength → plungerMaxForce`,
  `swingDamping → 0.18 + x * 0.28 → swingLinearDamping`). 이걸 빼먹으면 기존 사용자
  값이 조용히 기본값으로 리셋된다. 같은 레거시 별칭 3개가
  `components/TuningPanel.tsx`의 `importPreset`에도 손으로 복제돼 있으니 함께 고친다.
- **제거** — `normalizePhysicsSettings`가 알려진 키만 화이트리스트로 재조립하고
  `merge`가 **항상** 그것을 통과시키므로, 키를 지우기만 해도 localStorage에서 되살아나지
  않는다. 그래도 `OBSOLETE_PHYSICS_SETTINGS` 등록 + `SETTINGS_STORAGE_VERSION` +1은
  이 저장소의 관행이다 — 제거 이력을 코드에 남기고 회귀 테스트의 근거가 되기 때문이다.
  (`migrate`가 `migratePersistedSettings(normalizePhysicsSettings(...), version)` 순서라
  등록된 키의 `delete`는 실제로는 no-op이다. 마이그레이션을 새로 쓸 때 이 순서를 전제하라.)
- **부활 감시** — 제거한 식별자에 대한 `assert.doesNotMatch` 테스트를 함께 추가한다.

### 4.4 새 기구 부품 추가

1. 치수 — 편집 불가면 `game/gantryGeometry.mjs` / `game/machineDimensions.mjs` /
   `game/glassShell.mjs`의 파생식. 편집 가능하면 4.1 절차 **전부**를 밟는다
   (갠트리라도 기본값만 `DEFAULT_GANTRY_PART_SPECS`이고 타입·리밋·패널·스윕은 동일).
2. 물리적으로 불가능한 조합 차단은 `normalizeGantryPartSpecs` /
   `normalizeClawPartSpecs`에서
3. 계측 함수 `measureX`를 기하 모듈에 추가하고 `tests/drive-axis.test.mjs`의
   스윕 루프에 단언 추가
4. 바디·콜라이더·메시는 `components/GantryMechanism.tsx` 또는
   `components/MechanicalClaw.tsx`. 캐비닛 구조물이면 `components/MachineScene.tsx`
5. 단계 전이가 바뀌면 `game/machineStep.mjs` + `tests/machine-step.test.mjs`
6. 조작 UI가 붙으면 `components/Controls.tsx`(+`tests/joystick.test.mjs`),
   카메라가 바뀌면 `components/GameCanvas.tsx`(+`tests/camera-controls.test.mjs`)
7. `app/PartsGlossaryModal.tsx`에 용어집 항목 추가. 항목은 해당 카테고리 블록 안
   적절한 위치에 넣되 **번호는 전역 최댓값 다음 번호를 새로 부여하고 기존 항목의 번호는
   절대 재배치하지 마라.** 두 도식의 콜아웃 배열이 id를 값으로 하드코딩하고 있어서
   번호를 밀면 화살표가 엉뚱한 부품을 가리킨다. (배열 순서와 번호 순서는 일치하지 않아도
   된다 — 실제로 최근 항목들이 블록 중간에 들어가 있다.)
8. 새 UI 요소를 만들었으면 `app/globals.css`에 클래스 추가. 클래스 존재를 직접 검사하는
   테스트가 있다: `tests/claw-specs-panel.test.mjs`(`.inspector-tabs`,
   `.spec-panel-scroll`, `.spec-parts-list`, `.spec-input-wrap`)와
   `tests/parts-glossary.test.mjs`(`.parts-modal-backdrop`, `.parts-modal-scroll` 등).
9. `docs/claw-mechanism-spec.md`(§6/§7/§13, 접근을 바꿨으면 §10.5) / `README.md` 갱신

## 5. 검증

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

CI(`.github/workflows/verify.yml`)는 master·main push와 모든 PR에서
`npm ci` → `npm run typecheck` → `npm run lint` → `npm test` 순서로 돈다.
로컬에서도 같은 순서로 돌려라. 원격은 아직 설정돼 있지 않고 로컬 브랜치는 `master`
하나뿐이다.

**기준선: 세 가지 모두 통과하는 상태에서 시작한다.** 시작하자마자 실패가 보이면
네 변경 때문인지 먼저 확인하라.

`npm test`는 `npm run build`를 먼저 실행한다. `tests/rendered-html.test.mjs`가 빌드
산출물 `dist/server/index.js`를 동적 import해 `worker.fetch()`를 실제로 호출하기 때문이다.
빠른 반복은 개별 파일로 돌리고 최종 확인만 `npm test`로 한다.

```bash
node --test tests/machine-step.test.mjs
```

### 테스트 작성 규칙

- 러너는 `node:test`뿐이다. 최상위에 평평한 `test("...", fn)`만 나열하고
  `describe`/`it`/훅/mock을 쓰지 않는다.
- import는 모듈 지정자 알파벳순이다: `node:assert/strict` → (필요하면)
  `node:fs/promises` → `node:test` → 프로젝트 모듈. 즉 첫 줄은 항상
  `import assert from "node:assert/strict";`다.
- 파일명은 kebab-case `<대상>.test.mjs`. 확장자는 반드시 `.mjs` — 러너에 로더·트랜스파일
  설정이 없어 `.tsx`는 import할 수 없고, `.ts`는 Node 버전에 따라 되기도 안 되기도 하니
  의존하지 않는다. 검증할 로직은 `.mjs`로 뽑아라.
- 경로는 항상 `new URL("../<경로>", import.meta.url)`.
- 테스트 이름은 영어 소문자 서술문으로, 구현이 아니라 관찰 가능한 기계 동작을 쓴다.
  한국어는 UI 문자열을 매칭하는 정규식 안에서만 등장한다.
- 부동소수: 수학적 항등식은 `Math.abs(a - b) < 1e-9`, 물리 허용오차는 도메인 단위
  리터럴(0.001 m, 0.05 m/s), 진짜 이산값만 `assert.equal`.
- 비자명한 단언에는 "왜 이 값이어야 하는지"를 기계적으로 설명하는 메시지를 붙인다.
- 기하/물리를 단언할 때는 모듈에 `measure*` 헬퍼를 export해서 테스트가 raw 수치를
  다시 계산하지 않게 한다(`game/gantryGeometry.mjs`의 `measureWheelFit` 등).
- 순수 함수 테스트에는 결정성·비변경 단언을 별도로 둔다(입력 스냅샷 비교 + 동일 입력
  2회 `deepEqual`).

### 정규식 → 동작 테스트 이전 중

테스트는 두 갈래다. `game/*.mjs`를 실제로 실행하는 **동작 테스트**
(`machine-step`, `drive-axis`, `glass-shell`, `cable-dynamics`, `claw-kinematics`,
`claw-actuator`, `umbilical-dynamics`, `joystick`, `claw-tuning`, `settings-storage`)와,
`.tsx`/`.ts` 소스를 `readFile`로 읽어 정규식으로 확인하는 **소스 테스트**. README가
밝힌 대로 후자를 전자로 옮기는 중이다.

**새 기능에서 검증할 로직이 있으면 `.tsx`에 두지 말고 `game/*.mjs` 순수 함수로 뽑아
동작 테스트를 써라.** 정규식 테스트는 순수 함수로 분리 불가능한 React/Rapier 배선에
한해서만 새로 추가한다.

## 6. 좌표계·단위·물리 규약

- **좌표계**: Y 위, X 좌우(캐리지 = 트롤리 축), Z 전후(브리지 축). 배출구는
  X = 2.28, Z = 1.18 (`components/MechanicalClaw.tsx`에서 export). 조이스틱 화면
  아래 방향(+deltaY)이 +Z.
- **X축 이동 한계는 비대칭이다.** `stepMachine`의 `limits`가 `trolleyMinX`/`trolleyMaxX`
  두 값을 받는 반면 Z는 대칭 `trolleyLimitZ` 하나다. 트래블 드라이브 기어케이스 때문이며
  사유가 `components/GantryMechanism.tsx`의 조인트 주석에 있다. 대칭으로 "정리"하지 마라.
- **단위**: 내부는 전부 SI(m, kg, s, N, rad, s⁻¹). 교환되는 각도는 항상 라디안이다.
  도(°) 리터럴은 `cableDynamics`의 `swingAngle`(출력)과 `game/clawKinematics.mjs`의
  `DEG` 상수(정의 시 라디안 변환) 두 곳뿐이다. 표시 단위 변환은
  `components/ClawSpecsPanel.tsx`의 `displayFactor`(`unit`: mm/%/회/개, 미지정은 mm)에서
  표시 직전에만 한다.
- **월드가 실물 기계보다 크게 잡혀 있다**(캐비닛 내부 폭 5.665 m, 집게 몸통 지름 0.44 m).
  중력 기본값은 -9.81 m/s²이고 `gravity` 슬라이더로 -14 ~ -5 범위에서 조정 가능하다.
  "확대된 미터"이므로 실제 기계 데이터시트 수치를 그대로 대입해 치수를 "교정"하지 마라.
  정확한 배율은 검증되지 않았다.
- **물리 클럭**: 고정 60Hz. `PHYSICS_TIME_STEP = 1/60`이 `<Physics timeStep>`에 주입되고
  같은 값이 `stepMachine`의 dt로 재사용된다.
- **솔버 예산**: `SOLVER_ITERATIONS = 12`, `INTERNAL_PGS_ITERATIONS = 2`
  (`game/machineDimensions.mjs`). 폐쇄 링크 안정성 때문에 기본값(4/1)보다 올려 잡았다.
- **8단계**: `aiming → descending → closing → lifting → returning → releasing →
  settling → result` (`game/types.ts`의 `GamePhase`). 전이 판정은
  `game/machineStep.mjs`가 한다. 예외는 둘 — `aiming→descending`은 `drop()`
  (phase 가드 있음), `→aiming` 복귀는 `reset()`(**phase 가드 없음, 어느 단계에서든
  초기화된다**)이 만든다.
- **판정 상수**(`game/machineStep.mjs` 상단 export): `CABLE_LIMIT_EPSILON` 0.001 m,
  `CHUTE_ARRIVAL_DISTANCE` 0.035 m, `CHUTE_ARRIVAL_SPEED` 0.01 m/s,
  `DESCENT_ARRIVAL_SLACK` 0.07 m, `DESCENT_TIMEOUT` 3 s, `SETTLING_DURATION` 3.1 s.
- **충돌 그룹**: 1 하우징, 2 손가락, 3 링키지/플런저/핀, 4 와이어 가이드, 5 갠트리.
  집게·갠트리 계열 콜라이더에는 항상 `collisionGroups`를 명시한다. 안 주면 Rapier
  기본값이 전 그룹 멤버라 링키지끼리 충돌해 조인트 구속과 싸운다.
- **콜라이더 half-extent 규약**: `CuboidCollider args`는 반크기,
  `CylinderCollider args`는 `[halfHeight, radius]`. 렌더 `boxGeometry`/`cylinderGeometry`는
  전체 크기이므로 `/2`, `*2` 변환을 명시적으로 쓴다.

## 7. 코드·커밋·문서 규약

### 언어

문서(`README.md`, `docs/`)·커밋 메시지·사용자 UI 문자열은 **한국어**.
코드 식별자·JSDoc·인라인 주석·테스트 이름은 **영어**. `game/`의 모든 파일에 한글이
한 줄도 없는 상태를 유지한다.

### 코드 스타일

- 파일 확장자가 계약이다. `.mjs` = 순수 로직, `.ts` = 스토어·타입, `.tsx` = UI.
- `.ts`에서 `.mjs`를 import할 때 확장자를 명시한다(`from "./settingsMigration.mjs"`).
- 경로 별칭은 `@/*` → `./*` 하나뿐이다.
- 함수 명명이 역할이다: `measureX`(테스트가 단언에 쓰는 계측), `stepX`(한 틱 적분),
  `createX`(불변 데이터 팩토리), `getX`(해석적 해), `sampleX`(전 구간 스윕),
  `normalizeX`(불가능한 스펙 조합 교정).
- 다인자 함수는 이름 있는 객체 하나를 받는다(구조분해). 위치 인자는 2개 이하가 기본이고,
  `game/joystick.mjs`의 3인자 함수 둘(좌표쌍 + 임계값)이 기존 예외다.
- 데이터 상수는 `Object.freeze`로 얼린다.
- **공용 util 모듈을 새로 만들지 마라.** 각 `.mjs`가 자기 `clamp`/`approach`를 로컬로
  정의한다. 계층을 파일 하나만 읽어도 이해할 수 있게 하려는 의도다.
- 스텝/프레임 콜백에서 스토어는 `useGameStore.getState()`로 읽고 구독하지 않는다.
  컴포넌트 본문에서 구독할 때는 필요한 필드 하나만 뽑는 좁은 셀렉터를 쓴다.
- 주석은 "무엇을 하는가"가 아니라 "왜 기계적으로 이렇게 되는가"(폐기한 대안 포함)를 쓴다.
- 클라이언트 경계는 `"use client"` 지시어만 쓴다. `next/dynamic` + `ssr: false`나
  `typeof window` 가드는 이 저장소에서 쓰지 않는다.

### 커밋

- 제목: `type: 한국어 요약` (feat/fix/refactor/docs/chore). 스코프 괄호 미사용,
  50자 이내, 마침표 없음.
- 본문: `- ` 불릿 목록 **3개 이상**. 코드 변경뿐 아니라 문서 갱신과 회귀 테스트
  추가/갱신도 거의 항상 한 줄로 포함한다 — 구현·문서·테스트를 같은 커밋에서 동기화한다.
- 트레일러(Co-Authored-By, Generated with 등) 금지. 저장소 이력에 단 한 건도 없다.
- 여러 관심사를 묶을 때만 불릿 뒤에 자유 문단으로 이유를 쓴다. 유일한 정당화 사유는
  "분리하면 어느 커밋도 단독으로 검증을 통과하지 못한다"이다.

### 문서

- 접근을 바꿨으면 `docs/claw-mechanism-spec.md` §10.5 표에 폐기/과도/현재 방식으로
  행을 추가한다.
- 용어는 문서·코드·UI에서 통일한다(레버 암/링크 암 → **로커 링크**, 집게 스펙 →
  **부품 스펙**). 용어를 바꾸면 `app/PartsGlossaryModal.tsx`와 테스트도 함께 고친다.
- 검증하지 않은 것은 검증하지 않았다고 명시한다.

### 빌드·툴링

- 실행/빌드는 `vinext` CLI로만 한다(Next.js 16 소스 + Vite/Rolldown + Cloudflare
  Workers). `next dev`/`next build`를 추가하지 마라.
- Worker 설정은 wrangler 파일이 아니라 `vite.config.ts`의 `localBindingConfig`
  인라인 객체에 있다. 바인딩을 추가할 때도 여기다.
- `vite.config.ts`에서 `@cloudflare/vite-plugin`은 환경변수 설정 **이후** 동적
  import한다. 정적 import로 되돌리면 wrangler 로그가 프로젝트 밖으로 샌다.
- dev/build/start 스크립트의 `WRANGLER_LOG_PATH=.wrangler/wrangler.log` 접두사를 유지한다.
- 생성물은 커밋하지 않는다: `dist/`, `.vinext/`, `.wrangler/`, `tsconfig.tsbuildinfo`,
  `.claude/`, `.env*`.

## 8. 함정 (gotchas)

### 상태 머신 / 물리 루프

- `stepMachine`이 돌려주는 `machine.phase`는 `nextPhase`가 아니라 **입력으로 받은
  phase**다. `phaseElapsed`는 전이한 그 스텝이 아니라 다음 스텝에서 0이 된다. 여기에
  `nextPhase`를 넣도록 "고치면" 모든 타임아웃 판정이 한 틱씩 어긋난다.
- 배출구 도착 판정은 측정 속도가 아니라 **명령 속도**(`hypot(commandedX, commandedZ)`)로
  한다. 측정 속도로 바꾸면 진자 반작용 때문에 영영 정착하지 않을 수 있다.
- 스텝 콜백은 프레임당 0회일 수도 여러 번일 수도 있다(누산기 루프). 프레임당 정확히
  1회를 가정하는 카운터·엣지 검출을 스텝 안에 넣지 마라.
- `useBeforePhysicsStep` 실행 순서는 useEffect 등록 순서(= Set 삽입 순서)이고 React가
  자식 effect를 먼저 돌리므로 `GantryAxes`(`MechanicalClaw` 서브트리 안) → `MechanicalClaw`
  순서가 보장된다. 즉 갠트리 모터 설정이 읽는 축 명령은 **직전 틱 값**이다(1틱 지연).
  축 응답 타이밍을 튜닝하기 전에 이 지연을 전제하라.
- 케이블 최대 길이는 매 스텝 재클램프되지만 그것은 윈치 동작이 아니다. 재클램프분이
  `targetLengthRate`에 반영되면 안 되고 `tests/machine-step.test.mjs`가 그것을 단언한다.
  클램프 위치를 뒤로 옮기면 이 불변식이 깨진다.
- 로프 조인트는 Rapier JS 바인딩에 길이 setter가 없어서 길이가 2 mm 넘게 변하면
  **매번 삭제하고 재생성**한다. 하강/상승 중에는 사실상 매 틱 재생성이므로 조인트
  누적 상태에 의존하는 로직을 붙이면 안 된다. 임계값을 낮추면 매 틱 재생성, 높이면
  승강이 계단식으로 끊긴다.
- 갠트리 prismatic 조인트는 한 번 만들고 재생성하지 않는다. 스펙이 바뀌면
  `layout.travel*`이 달라지므로 매 스텝 `setLimits`로 밀어 넣어야 한다. 이 두 줄을
  "중복 호출"로 보고 최적화하면 스펙 변경이 엔드스톱에 반영되지 않는다.
- 케이블 속도 투영은 체결점 속도 전체를 `setLinvel`로 덮어쓰지 않는다. 방사 방향
  **보정량만** 몸통 중심 선형 속도에 더한다. 전체를 쓰면 ω×r이 중복돼 회전 에너지가 발산한다.
- 플런저 위상 판정용 속도(지수 평활)와 액추에이터용 속도(raw)가 다르다. 하나로 통일하면
  접촉 채터가 위상 전이를 오작동시키거나 속도 컷오프가 둔해진다.
- 엄빌리컬(검은 나선 케이블)은 **렌더 전용**이다. 물리 스텝 밖(`useFrame`)에서 자체
  클램프한 프레임 delta(1/240 ~ 1/30)로 Verlet 1스텝을 돌고 하우징에 반작용을 주지 않는다
  (`constraintIterations = 10`은 시간 적분이 아니라 위치 제약 완화다). 충돌 반작용이나
  하중 지지를 추가하면 문서·테스트가 정의한 책임 분리가 무너진다.
- `getOpenClawLowestY`, `sampleClawClearance`, `getClawPose*`는 **해석 기구학**이지
  실행 중 자세가 아니다. 실행 자세는 Rapier 폐쇄 링크 솔버가 정한다. 초기 앵커 정렬,
  최대 케이블 길이 계산, 치수 검증에만 쓰고 런타임 접촉 판정에 쓰지 마라.

### 치수 이중화

- **천장·바닥 콜라이더만 아직 손으로 적혀 있다.** `components/MachineScene.tsx`의
  천장 `<CuboidCollider args={[3, 0.12, 1.9]} position={[0, 4.32, 0]} />`(밑면 4.20)과
  프라이즈 데크의 반크기 `3`/`1.9`는 `CABINET`과 연결되어 있지 않다. 벽은 이미
  `createGlassWallColliders()`가 파생시키므로 벽 쪽은 걱정할 필요 없다.
- `game/machineDimensions.mjs`의 `CABINET` JSDoc이 "`tests/drive-axis.test.mjs` pins them
  against the colliders in MachineScene"이라고 주장하지만 그 테스트는 `MachineScene`을
  읽지 않는다(import·readFile 모두 없음). **주석이 stale하다.** "CABINET은 테스트가
  지켜준다"고 믿지 마라.
- `tests/drive-axis.test.mjs`에 매직 넘버가 하드코딩되어 있다: 배출구 `2.28`/`1.18`
  (출처 `components/MechanicalClaw.tsx`의 `CHUTE_X`/`CHUTE_Z`), 천장 `4.2`
  (출처 `MachineScene.tsx` 천장 콜라이더 밑면), `LEFTMOST_PRIZE_X = -1.72`
  (출처 `MachineScene.tsx`의 `PRIZE_POSITIONS` 생성식). 캐비닛·배출구·인형 배치를
  옮기면 테스트는 계속 통과하면서 잘못된 기준을 검사한다.
- `tests/drive-axis.test.mjs`의 스윕 `ranges`는 `CLAW_PART_SPEC_LIMITS`의 갠트리 6키를
  손으로 복제한 것이다(TS라 import 불가). 리밋을 넓히고 테스트를 안 고치면 새 구간이
  검증되지 않고, 좁히고 안 고치면 존재하지 않는 값을 스윕한다.
- `components/MechanicalClaw.tsx`가 하우징 메시 스케일 기준으로 `0.44`/`0.62`를
  하드코딩한다. `DEFAULT_CLAW_PART_SPECS.housingDiameter`/`housingHeight`를 바꾸면
  기본 상태 메시가 1.0 스케일이 아니게 되어 조용히 형상이 틀어진다.
- `CLAW_ATTACHMENT_Y = 0.4`(로프 조인트의 하우징 앵커)는 기본 하우징 높이에서만
  콜라이더 윗면과 일치한다(0.09 + 0.62/2). `housingHeight`를 바꾸면 와이어가 하우징
  윗면이 아닌 곳에 붙는다. 이 상수는 `CLAW_START_Y`와 최대 케이블 길이 계산에도 들어간다.
- `game/clawKinematics.mjs`의 `createClawGeometry` 폴백이 기본 스펙과 다르다
  (`linkWidth ?? fingerWidth ?? 0.082` vs 기본값 0.08, `linkThickness ?? … ?? 0.032`
  vs 0.03). 게다가 모듈 최상위 `export const CLAW_GEOMETRY = createClawGeometry()`가
  스펙 없이 만들어져 런타임에 그대로 쓰이는 경로가 있다. 기본값을 바꿀 때 이 둘을
  같이 보지 않으면 "슬라이더를 기본값에 둔 상태"와 "슬라이더를 안 건드린 상태"의
  형상이 달라진다.
- `game/clawTuning.mjs`의 앵커 start/end 숫자가 `LEVEL_PARAMETERS`(읽기)와
  `getSimpleClawTuningPatch`(쓰기)에 각각 하드코딩되어 있다. 한쪽만 바꾸면 슬라이더를
  움직였다 놓았을 때 레벨이 튄다. **더 나쁜 것은 일부 앵커 start가
  `PHYSICS_SETTING_LIMITS`의 min보다 낮아 도달 불가능하다는 점이다**:
  `swingLinearDamping` 0 vs min 0.05, `plungerMaxForce` 8 vs min 4,
  `clawFriction` 0.5 vs min 0.1. 레벨 0을 써도 clamp가 끌어올려서 왕복 손실이 난다.

### 의도적 예외 (통일하지 마라)

- 하우징과 `components/Prize.tsx`는 렌더 메시와 콜라이더 치수가 의도적으로 다르다.
  Prize의 캡슐/구 값을 시각에 맞춰 통일하면 파지 난이도가 바뀐다.
- `game/machineStep.mjs`의 `!activeManualDirection && phase === "lifting"` 가드는
  `activeManualDirection`이 `aiming`에서만 non-null이라 사실상 항상 참이다. 삭제하기 전에
  수동 승강 확장 여지를 남긴 방어인지 확인하라.
- `useClawSpecStore`의 `revision` 필드는 증가시키기만 하고 읽는 곳이 없다. 리렌더
  트리거로 착각해 의존하지 마라 — 실제 구독은 specs 객체 참조 변경으로 이뤄진다.
- `components/ClawSpecsPanel.tsx`의 `key={...}` 강제 리마운트를 최적화한다며 제거하면
  정규화로 보정된 값이 화면에 반영되지 않는다.

### 스토어·영속화

- `updateSetting`과 `clampSetting`/`clampSpec`은 리밋 표를 무조건 인덱싱한다. 표에 없는
  키가 런타임에 들어오면 TypeError로 죽는다(`updateSettings` 배치만 가드가 있다).
- **두 스토어 모두 `merge`가 최종 진실이다.** `useGameStore`는 `migrate` 결과를
  `merge`에서 `normalizePhysicsSettings`로 한 번 더 통과시키고, `useClawSpecStore`도
  `merge`에서 `normalizeClawPartSpecs(saved?.specs)`를 통과시킨다. migrate만 고치면
  의도한 변환이 덮어써질 수 있다.
- `useClawSpecStore`에는 `skipHydration`이 없다. 부품 스펙 값을 SSR되는 마크업에
  노출하면 하이드레이션 불일치가 난다.
- `normalizeClawPartSpecs`는 단순 클램프가 아니다. `powerCableCoilDiameter >=
  powerCableDiameter + 0.02`를 강제하고 `normalizeGantryPartSpecs`를 덧씌워 플랜지
  지름과 홈 폭을 봉 지름에 맞춰 **조용히 끌어올린다**. 슬라이더 min/max만 보고 실제
  적용값을 예측하면 틀린다.
- normalize 계열은 알 수 없는 키를 조용히 버리고 non-finite를 기본값으로 대체한다.
  키 오타는 에러 없이 "값이 반영되지 않는" 증상으로만 드러난다.
- 프리셋 불러오기(`components/TuningPanel.tsx`의 `importPreset`)는 알려진 키
  (`PHYSICS_SETTING_LIMITS`의 키 + 하드코딩된 레거시 별칭 3개)가 하나라도 있고
  **공급된 알려진 키의 값이 전부 유한 숫자여야** 통과한다. 하나라도 비수치면 전체를
  거부하고 `preset_import_failed`를 기록한다. 통과하면 나머지는 기본값으로 채워지므로
  부분 프리셋은 나머지를 기본값으로 되돌린다는 뜻이다.
- `events` 배열은 기록할 때 `.slice(-400)`으로 자른다 — 단 `drop()`만 slice를 빠뜨린
  상태다. 새 append를 추가할 때 slice를 붙여라.
- 용어집 번호(`app/PartsGlossaryModal.tsx`)와 부품 스펙 패널 번호("01"~"10",
  `components/ClawSpecsPanel.tsx`)는 **완전히 별개 체계**다. "07번 부품"이라는 말이
  나오면 어느 패널인지 먼저 확인하라.

### 테스트·툴링

- 정규식 테스트는 함수 이름, JSX prop 표기, group name, 머티리얼 리터럴, 심지어 공백까지
  매칭한다. 동작상 무해한 리팩터·포매팅도 테스트를 깨뜨린다. 반대로 이 단언들은
  "깨져야 정상"인 경우가 많으니(제거한 구현의 부활 감시) 무작정 느슨하게 고치지 말고
  그 단언이 무엇을 금지하려는지 먼저 읽어라.
- `assert.doesNotMatch`로 특정 식별자를 금지하는 테스트가 여러 파일에 흩어져 있다
  (`applyGripAssist`, `configureMotor`, `MotorModel`, `plungerDampingRatio`,
  `ConvexHullCollider`, `MeshReflectorMaterial` 등). 새 기능에 우연히 같은 이름을 쓰면
  관계없는 테스트가 실패한다.
- **`npm run typecheck`는 `game/*.mjs`와 테스트 파일을 검사하지 않는다.**
  tsconfig `include`에 `**/*.mjs`가 없고 `checkJs`도 꺼져 있다. 이 파일들의 안전망은
  `tests/*.test.mjs`와 eslint뿐이다.
- tsconfig의 `types: ["@cloudflare/workers-types"]`가 자동 @types 포함을 대체하므로
  `.ts`에서 `process`/`Buffer` 같은 Node 전역을 쓰면 타입 에러가 난다.
- `tests/claw-specs-panel.test.mjs`, `tests/parts-glossary.test.mjs`,
  `tests/collider-debug-view.test.mjs`, `tests/debug-plunger-control.test.mjs`는 모듈
  최상위에서 `readFile`을 await한다. 참조 파일을 삭제·이동하면 test 실패가 아니라
  모듈 로드 실패로 파일 전체가 죽는다.
- `tests/machine-step.test.mjs`의 SETTINGS/LIMITS 픽스처는 store 기본값의 수동 복제다.
  또 하네스가 `trolley.x += driveX * FRAME`으로 완벽한 모터를 가정하므로, 실제 Rapier
  솔버에서의 정착·오버슈트는 이 테스트로 검증되지 않는다. **machine-step 통과 = 실제
  씬에서 동작 보장이 아니다.**
- `npm start`는 workerd가 아니라 vinext의 Node 프로덕션 서버다. Workers 런타임 특유의
  문제는 재현되지 않는다. 역설적으로 `npm run dev`가 workerd(Miniflare) 위에서 돌아
  런타임 패리티가 더 높다.
- `compatibility_date`가 저장소에 고정돼 있지 않다. `@cloudflare/vite-plugin`의 기본값이
  쓰이므로 플러그인을 올리면 Workers 런타임 동작이 조용히 바뀔 수 있다.
- `worker/index.ts`는 `env.IMAGES` 바인딩을 타입으로 요구하지만 실제 바인딩 선언이
  어디에도 없다. `next/image`를 도입하는 순간 문제가 된다.
- lint 스크립트가 `--ignore-pattern dist --ignore-pattern .next`로 무시 경로를 때운다
  (`.next`는 `eslint.config.mjs`의 globalIgnores와 중복). 새 생성 디렉터리를 만들면
  `eslint.config.mjs`와 lint 스크립트 양쪽을 봐야 한다.
