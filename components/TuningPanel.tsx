"use client";

import { useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  Gauge,
  RotateCcw,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import {
  getSimpleClawTuningLevel,
  getSimpleClawTuningPatch,
} from "@/game/clawTuning.mjs";
import {
  PHYSICS_SETTING_LIMITS,
  normalizePhysicsSettings,
  useGameStore,
} from "@/game/store";
import { SETTINGS_STORAGE_VERSION } from "@/game/settingsMigration.mjs";
import type { PhysicsSettings } from "@/game/types";

interface SliderProps {
  label: string;
  setting: keyof PhysicsSettings;
  step: number;
  unit?: string;
}

type SimpleTuningKind = "grip" | "speed" | "stability";

const SIMPLE_TUNING_CONTROLS: Array<{
  kind: SimpleTuningKind;
  label: string;
  description: string;
  lowLabel: string;
  highLabel: string;
}> = [
  {
    kind: "grip",
    label: "파지력",
    description: "플런저 최대 축력과 손가락 마찰을 함께 조절합니다.",
    lowLabel: "약함",
    highLabel: "강함",
  },
  {
    kind: "speed",
    label: "작동 속도",
    description: "플런저 축력이 작용하는 속도 한계를 조절합니다.",
    lowLabel: "느림",
    highLabel: "빠름",
  },
  {
    kind: "stability",
    label: "안정성",
    description: "집게 몸통의 선형·회전 진동 억제를 함께 조절합니다.",
    lowLabel: "민감",
    highLabel: "안정",
  },
];

const CLAW_TUNING_SECTIONS: Array<{
  label: string;
  items: SliderProps[];
}> = [
  {
    label: "트롤리 이동",
    items: [
      {
        label: "트롤리 최고 속도",
        setting: "moveSpeed",
        step: 0.05,
        unit: " m/s",
      },
      {
        label: "트롤리 가속도",
        setting: "trolleyAcceleration",
        step: 0.1,
        unit: " m/s²",
      },
      {
        label: "복귀 속도 배율",
        setting: "returnSpeedMultiplier",
        step: 0.01,
        unit: " ×",
      },
      {
        label: "복귀 가속도 배율",
        setting: "returnAccelerationMultiplier",
        step: 0.01,
        unit: " ×",
      },
      {
        label: "구동축 강성",
        setting: "gantryDriveStiffness",
        step: 10,
      },
      {
        label: "관성 주행 비율",
        setting: "gantryCoastRatio",
        step: 0.01,
        unit: " ×",
      },
    ],
  },
  {
    label: "와이어 승강",
    items: [
      {
        label: "와이어 하강 속도",
        setting: "lowerSpeed",
        step: 0.05,
        unit: " m/s",
      },
      {
        label: "와이어 상승 속도",
        setting: "liftSpeed",
        step: 0.05,
        unit: " m/s",
      },
      {
        label: "진자 선형 감쇠",
        setting: "swingLinearDamping",
        step: 0.01,
        unit: " s⁻¹",
      },
      {
        label: "몸통 회전 감쇠",
        setting: "housingAngularDamping",
        step: 0.01,
        unit: " s⁻¹",
      },
    ],
  },
  {
    label: "플런저 구동",
    items: [
      {
        label: "플런저 속도",
        setting: "plungerSpeed",
        step: 0.01,
        unit: " m/s",
      },
      {
        label: "플런저 최대 축력",
        setting: "plungerMaxForce",
        step: 0.5,
        unit: " N",
      },
    ],
  },
  {
    label: "플런저 목표 판정",
    items: [
      {
        label: "위치 허용 오차",
        setting: "plungerPositionTolerance",
        step: 0.001,
        unit: " m",
      },
      {
        label: "속도 허용 오차",
        setting: "plungerVelocityTolerance",
        step: 0.001,
        unit: " m/s",
      },
      {
        label: "부하 정지 제한 시간",
        setting: "plungerStallTimeout",
        step: 0.1,
        unit: " s",
      },
    ],
  },
  {
    label: "손가락 접촉",
    items: [
      {
        label: "손가락 마찰계수",
        setting: "clawFriction",
        step: 0.05,
        unit: " μ",
      },
    ],
  },
];

const PRIZE_TUNING_ITEMS: SliderProps[] = [
  {
    label: "인형 질량",
    setting: "prizeMass",
    step: 0.01,
    unit: " kg",
  },
  {
    label: "표면 마찰계수",
    setting: "prizeFriction",
    step: 0.05,
    unit: " μ",
  },
  {
    label: "선형 감쇠",
    setting: "prizeLinearDamping",
    step: 0.05,
    unit: " s⁻¹",
  },
  {
    label: "회전 감쇠",
    setting: "angularDamping",
    step: 0.05,
    unit: " s⁻¹",
  },
];

const ENVIRONMENT_TUNING_ITEMS: SliderProps[] = [
  {
    label: "중력",
    setting: "gravity",
    step: 0.01,
    unit: " m/s²",
  },
];

function Slider({ label, setting, step, unit = "" }: SliderProps) {
  const value = useGameStore((state) => state.settings[setting]);
  const updateSetting = useGameStore((state) => state.updateSetting);
  const { min, max } = PHYSICS_SETTING_LIMITS[setting];
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)));

  return (
    <label className="slider-field">
      <span>
        <span>{label}</span>
        <output>
          {value.toFixed(decimals)}
          {unit}
        </output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => updateSetting(setting, Number(event.target.value))}
      />
    </label>
  );
}

function SimpleTuningSlider({
  kind,
  label,
  description,
  lowLabel,
  highLabel,
}: (typeof SIMPLE_TUNING_CONTROLS)[number]) {
  const settings = useGameStore((state) => state.settings);
  const updateSettings = useGameStore((state) => state.updateSettings);
  const value = Math.round(getSimpleClawTuningLevel(kind, settings));
  const descriptionId = `simple-tuning-${kind}-description`;

  return (
    <label className="simple-slider-field">
      <span>
        <span>{label}</span>
        <output>{value}</output>
      </span>
      <small id={descriptionId}>{description}</small>
      <input
        aria-label={label}
        aria-describedby={descriptionId}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(event) => {
          const level = Number(event.target.value);
          updateSettings(
            getSimpleClawTuningPatch(kind, level),
            `simple_${kind}`,
          );
        }}
      />
      <span className="simple-slider-range" aria-hidden="true">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </span>
    </label>
  );
}

function TuningSection({
  label,
  items,
  defaultOpen = false,
}: {
  label: string;
  items: SliderProps[];
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <details
      className="tuning-section"
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary>
        <span>{label}</span>
        <span>
          {items.length}개
          <ChevronDown size={14} aria-hidden="true" />
        </span>
      </summary>
      <div>
        {items.map((item) => (
          <Slider key={item.setting} {...item} />
        ))}
      </div>
    </details>
  );
}

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function TuningPanel() {
  const [tab, setTab] = useState<"claw" | "prize" | "environment">(
    "claw",
  );
  const [settingsMode, setSettingsMode] = useState<"simple" | "advanced">(
    "simple",
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const settings = useGameStore((state) => state.settings);
  const replaceSettings = useGameStore((state) => state.replaceSettings);
  const resetSettings = useGameStore((state) => state.resetSettings);
  const record = useGameStore((state) => state.record);

  const importPreset = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid preset");
      }
      const record = parsed as Record<string, unknown>;
      const knownKeys = new Set([
        ...Object.keys(PHYSICS_SETTING_LIMITS),
        "closeSpeed",
        "clawStrength",
        "swingDamping",
      ]);
      const suppliedSettings = Object.entries(record).filter(([key]) =>
        knownKeys.has(key),
      );
      if (
        suppliedSettings.length === 0 ||
        suppliedSettings.some(
          ([, value]) =>
            typeof value !== "number" || !Number.isFinite(value),
        )
      ) {
        throw new Error("Invalid preset");
      }
      replaceSettings(normalizePhysicsSettings(parsed));
    } catch {
      record("preset_import_failed");
      window.alert("올바른 Clawpick 프리셋 파일이 아닙니다.");
    }
  };

  return (
    <div className="tuning-panel-view inspector-view">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">LIVE PARAMETERS</span>
          <h2>물리 튜닝</h2>
        </div>
        <SlidersHorizontal size={20} />
      </div>

      <div className="preset-row">
        <button
          type="button"
          onClick={() =>
            downloadJson("clawpick-preset.json", {
              version: SETTINGS_STORAGE_VERSION,
              ...settings,
            })
          }
        >
          <Download size={15} />
          저장
        </button>
        <button type="button" onClick={() => inputRef.current?.click()}>
          <Upload size={15} />
          불러오기
        </button>
        <button type="button" onClick={resetSettings} aria-label="기본값 복원">
          <RotateCcw size={15} />
        </button>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept="application/json"
          onChange={(event) => importPreset(event.target.files?.[0])}
        />
      </div>

      <div className="panel-tabs" role="tablist" aria-label="튜닝 대상">
        <button
          type="button"
          className={tab === "claw" ? "active" : ""}
          onClick={() => setTab("claw")}
          role="tab"
          aria-selected={tab === "claw"}
        >
          집게
        </button>
        <button
          type="button"
          className={tab === "prize" ? "active" : ""}
          onClick={() => setTab("prize")}
          role="tab"
          aria-selected={tab === "prize"}
        >
          인형
        </button>
        <button
          type="button"
          className={tab === "environment" ? "active" : ""}
          onClick={() => setTab("environment")}
          role="tab"
          aria-selected={tab === "environment"}
        >
          환경
        </button>
      </div>

      <div className="slider-list">
        {tab === "claw" ? (
          <div className="claw-settings">
            <div
              className="settings-mode-tabs"
              role="tablist"
              aria-label="집게 설정 수준"
            >
              <button
                type="button"
                className={settingsMode === "simple" ? "active" : ""}
                role="tab"
                aria-selected={settingsMode === "simple"}
                aria-controls="simple-claw-settings"
                onClick={() => setSettingsMode("simple")}
              >
                간단 설정
              </button>
              <button
                type="button"
                className={settingsMode === "advanced" ? "active" : ""}
                role="tab"
                aria-selected={settingsMode === "advanced"}
                aria-controls="advanced-claw-settings"
                onClick={() => setSettingsMode("advanced")}
              >
                고급 설정
              </button>
            </div>

            {settingsMode === "simple" ? (
              <div
                id="simple-claw-settings"
                className="simple-settings"
                role="tabpanel"
              >
                <div className="simple-settings-intro">
                  <strong>핵심 특성만 조정</strong>
                  <p>
                    하나의 슬라이더가 관련된 세부 물리값을 함께 조절합니다.
                  </p>
                </div>
                {SIMPLE_TUNING_CONTROLS.map((control) => (
                  <SimpleTuningSlider key={control.kind} {...control} />
                ))}
              </div>
            ) : (
              <div
                id="advanced-claw-settings"
                className="claw-tuning-sections"
                role="tabpanel"
              >
                {CLAW_TUNING_SECTIONS.map((section, index) => (
                  <TuningSection
                    key={section.label}
                    label={section.label}
                    items={section.items}
                    defaultOpen={index === 0}
                  />
                ))}
              </div>
            )}
          </div>
        ) : tab === "prize" ? (
          <TuningSection
            label="인형 물리"
            items={PRIZE_TUNING_ITEMS}
            defaultOpen
          />
        ) : (
          <TuningSection
            label="환경 물리"
            items={ENVIRONMENT_TUNING_ITEMS}
            defaultOpen
          />
        )}
      </div>

      <div className="tuning-note">
        <Gauge size={17} />
        <p>
          속도·가속도·힘·질량은 SI 단위입니다. 질량과 중력을 바꾼 뒤에는
          새 라운드를 시작해 정확히 비교하세요.
        </p>
      </div>
    </div>
  );
}
