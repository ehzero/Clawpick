"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  CircleDot,
  RotateCcw,
  Ruler,
  Save,
} from "lucide-react";
import {
  CLAW_PART_SPEC_LIMITS,
  DEFAULT_CLAW_PART_SPECS,
  normalizeClawPartSpecs,
  useClawSpecStore,
} from "@/game/clawSpecs";
import { CLAW_GEOMETRY } from "@/game/clawKinematics.mjs";
import type { ClawPartSpecs } from "@/game/types";

type SpecKey = keyof ClawPartSpecs;

interface SpecField {
  key: SpecKey;
  label: string;
  description: string;
  unit?: "mm" | "%" | "회" | "개";
}

interface DerivedField {
  label: string;
  value: string;
  description: string;
}

interface PartDefinition {
  id: string;
  number: string;
  name: string;
  english: string;
  count: number;
  role: string;
  scope: ReadonlyArray<"렌더 매시" | "콜라이더">;
  fields: ReadonlyArray<SpecField>;
  derived?: ReadonlyArray<DerivedField>;
}

const PARTS: ReadonlyArray<PartDefinition> = [
  {
    id: "power-cable",
    number: "01",
    name: "나선형 전원공급 케이블",
    english: "Coiled power umbilical",
    count: 1,
    role:
      "트롤리에서 집게 액추에이터로 전원과 신호를 전달하는 시각 전용 케이블입니다.",
    scope: ["렌더 매시"],
    fields: [
      {
        key: "powerCableDiameter",
        label: "케이블 선경",
        description: "나선을 이루는 검은 케이블 자체의 전체 굵기",
      },
      {
        key: "powerCableCoilDiameter",
        label: "코일 외경",
        description: "케이블 선경까지 포함한 나선 전체의 일정한 지름",
      },
      {
        key: "powerCableTurns",
        label: "나선 회전 수",
        description: "양쪽 연결점 사이에 균일하게 배치되는 전체 회전 횟수",
        unit: "회",
      },
      {
        key: "powerCableSegments",
        label: "경로 세그먼트",
        description: "연속 Tube 중심 경로를 구성하는 길이 방향 분할 수",
        unit: "개",
      },
      {
        key: "powerCableSlack",
        label: "여유 길이",
        description: "두 연결점의 직선거리보다 중심축에 추가되는 길이",
      },
    ],
  },
  {
    id: "housing",
    number: "02",
    name: "집게 몸통",
    english: "Solenoid housing",
    count: 1,
    role: "와이어에 매달리는 중심 강체이자 플런저 직선 가이드와 로커 피벗의 기준입니다.",
    scope: ["렌더 매시", "콜라이더"],
    fields: [
      {
        key: "housingDiameter",
        label: "외경",
        description: "몸통과 단순 원통 콜라이더의 전체 지름",
      },
      {
        key: "housingHeight",
        label: "전체 높이",
        description: "몸통 렌더 비율과 원통 콜라이더의 축 길이",
      },
    ],
  },
  {
    id: "plunger-shaft",
    number: "03",
    name: "플런저 샤프트",
    english: "Plunger shaft",
    count: 1,
    role: "몸통 중심에서 수직으로 이동하며 링크 기구에 개폐 입력을 전달합니다.",
    scope: ["렌더 매시", "콜라이더"],
    fields: [
      {
        key: "plungerShaftDiameter",
        label: "샤프트 지름",
        description: "플런저 중심봉의 원형 단면 지름",
      },
      {
        key: "plungerShaftLength",
        label: "샤프트 길이",
        description: "허브 위로 이어지는 중심봉의 축 길이",
      },
    ],
  },
  {
    id: "plunger-hub",
    number: "04",
    name: "플런저 허브",
    english: "Plunger hub",
    count: 1,
    role:
      "세 방향 공통 힌지 핀이 직접 결합되는 플런저의 중앙 원통입니다.",
    scope: ["렌더 매시", "콜라이더"],
    fields: [
      {
        key: "plungerHubDiameter",
        label: "허브 외경",
        description: "중앙 허브의 전체 지름",
      },
      {
        key: "plungerHubThickness",
        label: "허브 두께",
        description: "허브의 수직 축 두께",
      },
    ],
  },
  {
    id: "shared-link-stock",
    number: "05",
    name: "링크·손가락 공통 판재",
    english: "Shared link stock",
    count: 6,
    role:
      "로커 링크 3개와 곡선 손가락 3개가 동일한 기본 너비와 두께를 공유합니다.",
    scope: ["렌더 매시", "콜라이더"],
    fields: [
      {
        key: "linkWidth",
        label: "공통 너비",
        description: "로커 링크와 테이퍼 시작 전 손가락의 기본 폭",
      },
      {
        key: "linkThickness",
        label: "공통 두께",
        description: "로커 링크와 손가락 금속 판재의 공통 단면 두께",
      },
    ],
  },
  {
    id: "rocker",
    number: "06",
    name: "로커 링크",
    english: "Rocker link",
    count: 3,
    role:
      "공통 판재 단면을 사용하며 몸통 피벗을 중심으로 이동 손가락 힌지를 원호로 안내합니다.",
    scope: ["렌더 매시", "콜라이더"],
    fields: [],
    derived: [
      {
        label: "피벗 중심 거리",
        value: `${(CLAW_GEOMETRY.rockerLength * 1000).toFixed(1)} mm`,
        description:
          "폐쇄 링크 구속조건에서 결정되는 값으로 1차 편집 범위에서는 고정됩니다.",
      },
    ],
  },
  {
    id: "finger",
    number: "07",
    name: "곡선 손가락",
    english: "Curved claw finger",
    count: 3,
    role: "상품에 직접 접촉하고 표면 마찰로 파지하는 두 번 꺾인 금속 손가락입니다.",
    scope: ["렌더 매시", "콜라이더"],
    fields: [
      {
        key: "fingerLength",
        label: "경로 길이",
        description: "이동 힌지에서 끝단까지 중심선을 따라 측정한 길이",
      },
      {
        key: "fingerTaperStart",
        label: "끝단 축소 시작",
        description: "전체 경로 중 폭이 좁아지기 시작하는 위치",
        unit: "%",
      },
      {
        key: "fingerTipWidthScale",
        label: "끝단 너비 비율",
        description: "기본 너비에 대한 맨 끝 면의 너비 비율",
        unit: "%",
      },
    ],
    derived: [
      {
        label: "손가락 레버 중심 거리",
        value: `${(CLAW_GEOMETRY.fingerPlungerLength * 1000).toFixed(1)} mm`,
        description:
          "플런저와 손가락 폐쇄 링크를 유지하는 중심 간 거리로 현재는 고정됩니다.",
      },
    ],
  },
  {
    id: "hinge-pin",
    number: "08",
    name: "공통 힌지 핀",
    english: "Shared hinge pin",
    count: 9,
    role:
      "몸통 피벗 3곳, 이동 손가락 힌지 3곳, 플런저 연결부 3곳에 동일하게 사용하는 하나의 표준 핀 오브젝트입니다.",
    scope: ["렌더 매시", "콜라이더"],
    fields: [
      {
        key: "hingePinDiameter",
        label: "핀 지름",
        description: "모든 회전 결합부가 공유하는 원형 단면 지름",
      },
      {
        key: "hingePinLength",
        label: "핀 길이",
        description: "모든 회전 결합부가 공유하는 힌지 축 방향 길이",
      },
    ],
  },
  {
    id: "gantry-rod",
    number: "09",
    name: "갠트리 봉",
    english: "Gantry rod",
    count: 5,
    role:
      "고정 측면 봉 2개, 캐리지가 타는 브리지 봉 2개, 그 위를 잇는 타이 봉 1개가 모두 같은 규격의 봉입니다. 길이는 지정하지 않고 캐비닛 내부 치수에서 자동으로 계산됩니다.",
    scope: ["렌더 매시", "콜라이더"],
    fields: [
      {
        key: "rodDiameter",
        label: "봉 지름",
        description: "모든 봉이 공유하는 단면 지름. 바퀴 축 높이에 반영됩니다",
      },
      {
        key: "bridgeRodSpacing",
        label: "브리지 봉 간격",
        description: "캐리지가 기우는 것을 막는 두 봉의 전후 중심 간격",
      },
    ],
  },
  {
    id: "gantry-wheel",
    number: "10",
    name: "갠트리 홈 바퀴",
    english: "Grooved gantry wheel",
    count: 8,
    role:
      "레일 위 4개와 캐리지 4개가 모두 같은 규격의 흰색 나일론 홈 바퀴입니다. 홈이 봉에 얹히고 플랜지가 봉을 감쌉니다. 플랜지 지름과 홈 폭은 봉을 물 수 있는 최소값으로 자동 보정됩니다.",
    scope: ["렌더 매시"],
    fields: [
      {
        key: "wheelGrooveDiameter",
        label: "홈 지름",
        description: "봉에 닿는 홈 바닥의 지름. 바퀴 축 높이를 결정합니다",
      },
      {
        key: "wheelFlangeDiameter",
        label: "플랜지 지름",
        description: "봉을 감싸 이탈을 막는 양쪽 테두리의 외경",
      },
      {
        key: "wheelGrooveWidth",
        label: "홈 폭",
        description: "봉이 들어앉는 홈의 축 방향 폭",
      },
      {
        key: "trolleyWheelSpacing",
        label: "캐리지 바퀴 간격",
        description: "캐리지 앞뒤 두 축의 좌우 중심 간격",
      },
    ],
  },
];

function displayFactor(unit: SpecField["unit"]) {
  if (unit === "%") return 100;
  if (unit === "회" || unit === "개") return 1;
  return 1000;
}

function fieldValue(value: number, unit: SpecField["unit"]) {
  const scaled = value * displayFactor(unit);
  return unit === "%" ? Number(scaled.toFixed(1)) : Number(scaled.toFixed(1));
}

function SpecNumberInput({
  field,
  partName,
  specs,
  updateSpec,
}: {
  field: SpecField;
  partName: string;
  specs: ClawPartSpecs;
  updateSpec: (key: SpecKey, value: number) => void;
}) {
  const unit = field.unit ?? "mm";
  const factor = displayFactor(unit);
  const limits = CLAW_PART_SPEC_LIMITS[field.key];
  const committedDisplayValue = fieldValue(specs[field.key], unit);
  const [draft, setDraft] = useState(String(committedDisplayValue));

  const commit = () => {
    if (draft.trim() === "") {
      setDraft(String(committedDisplayValue));
      return;
    }
    const displayValue = Number(draft);
    if (!Number.isFinite(displayValue)) {
      setDraft(String(committedDisplayValue));
      return;
    }

    const internalValue = displayValue / factor;
    const normalized = normalizeClawPartSpecs({
      ...specs,
      [field.key]: internalValue,
    });
    updateSpec(field.key, internalValue);
    setDraft(String(fieldValue(normalized[field.key], unit)));
  };

  return (
    <div className="spec-input-wrap">
      <input
        type="number"
        value={draft}
        min={fieldValue(limits.min, unit)}
        max={fieldValue(limits.max, unit)}
        step={unit === "%" ? 0.1 : 1}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setDraft(String(committedDisplayValue));
            event.currentTarget.blur();
          }
        }}
        aria-label={`${partName} ${field.label}`}
      />
      <span>{unit}</span>
    </div>
  );
}

export default function ClawSpecsPanel() {
  const specs = useClawSpecStore((state) => state.specs);
  const updateSpec = useClawSpecStore((state) => state.updateSpec);
  const resetPart = useClawSpecStore((state) => state.resetPart);
  const resetSpecs = useClawSpecStore((state) => state.resetSpecs);
  const editedCount = (
    Object.keys(DEFAULT_CLAW_PART_SPECS) as SpecKey[]
  ).filter((key) => specs[key] !== DEFAULT_CLAW_PART_SPECS[key]).length;

  return (
    <div className="claw-specs-panel inspector-view">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">COMPONENT DIMENSIONS</span>
          <h2>부품 스펙</h2>
        </div>
        <Ruler size={20} />
      </div>

      <div className="spec-panel-summary">
        <div>
          <Ruler size={15} />
          <div>
            <span>고유 부품</span>
            <strong>{PARTS.length}</strong>
          </div>
        </div>
        <div>
          <CircleDot size={15} />
          <div>
            <span>편집값</span>
            <strong>{editedCount}</strong>
          </div>
        </div>
        <button
          type="button"
          onClick={resetSpecs}
          disabled={editedCount === 0}
          aria-label="집게 부품 전체 기본값 복원"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      <div className="spec-panel-scroll">
        <div className="spec-save-state" aria-live="polite">
          <Save size={13} />
          수정값은 브라우저에 자동 저장됩니다
        </div>

        <div className="spec-notice">
          <Check size={15} />
          <p>
            반복 부품은 하나만 표시합니다. 각 치수의 적용 범위는 부품
            카드의 배지로 구분하며 링크 중심 거리는 파생값으로 고정됩니다.
          </p>
        </div>

        <div className="spec-parts-list">
        {PARTS.map((part) => {
          const keys = part.fields.map((field) => field.key);
          const edited = keys.some(
            (key) => specs[key] !== DEFAULT_CLAW_PART_SPECS[key],
          );

          return (
            <details className="spec-part-card" key={part.id}>
              <summary>
                <span className="spec-part-number">{part.number}</span>
                <div>
                  <div className="spec-part-title">
                    <h2>{part.name}</h2>
                    <span>× {part.count}</span>
                  </div>
                  <p>{part.english}</p>
                </div>
                <ChevronDown
                  className="spec-part-chevron"
                  size={15}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className="spec-part-reset"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    resetPart(keys);
                  }}
                  disabled={!edited}
                  title={`${part.name} 기본값 복원`}
                >
                  <RotateCcw size={14} />
                </button>
              </summary>

              <p className="spec-part-role">{part.role}</p>

              <div className="spec-scope">
                {part.scope.map((scope) => (
                  <span key={scope}>{scope}</span>
                ))}
              </div>

              <div className="spec-fields">
                {part.fields.map((field) => {
                  return (
                    <label key={field.key}>
                      <span>
                        <strong>{field.label}</strong>
                        <small>{field.description}</small>
                      </span>
                      <SpecNumberInput
                        key={`${field.key}:${specs[field.key]}`}
                        field={field}
                        partName={part.name}
                        specs={specs}
                        updateSpec={updateSpec}
                      />
                    </label>
                  );
                })}

                {part.derived?.map((field) => (
                  <div className="spec-derived-field" key={field.label}>
                    <span>
                      <strong>{field.label}</strong>
                      <small>{field.description}</small>
                    </span>
                    <output>{field.value}</output>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
        </div>
      </div>
    </div>
  );
}
