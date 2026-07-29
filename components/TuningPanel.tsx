"use client";

import { useEffect, useRef, useState } from "react";
import {
  Download,
  Gauge,
  RotateCcw,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import {
  PHYSICS_SETTING_LIMITS,
  normalizePhysicsSettings,
  useGameStore,
} from "@/game/store";
import type { PhysicsSettings } from "@/game/types";

interface SliderProps {
  label: string;
  setting: keyof PhysicsSettings;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

function Slider({ label, setting, min, max, step, unit = "" }: SliderProps) {
  const value = useGameStore((state) => state.settings[setting]);
  const updateSetting = useGameStore((state) => state.updateSetting);

  return (
    <label className="slider-field">
      <span>
        <span>{label}</span>
        <output>
          {value.toFixed(step < 0.1 ? 2 : 1)}
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
  const inputRef = useRef<HTMLInputElement>(null);
  const settings = useGameStore((state) => state.settings);
  const replaceSettings = useGameStore((state) => state.replaceSettings);
  const resetSettings = useGameStore((state) => state.resetSettings);
  const record = useGameStore((state) => state.record);

  useEffect(() => {
    const saved = localStorage.getItem("clawpick-settings");
    if (!saved) return;
    try {
      replaceSettings(normalizePhysicsSettings(JSON.parse(saved)));
    } catch {
      localStorage.removeItem("clawpick-settings");
    }
  }, [replaceSettings]);

  useEffect(() => {
    localStorage.setItem("clawpick-settings", JSON.stringify(settings));
  }, [settings]);

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
    <aside className="tuning-panel">
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
              version: 2,
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
          <>
            <Slider label="트롤리 최고 속도" setting="moveSpeed" min={0.4} max={2.5} step={0.05} unit=" m/s" />
            <Slider label="트롤리 가속도" setting="trolleyAcceleration" min={1} max={10} step={0.1} unit=" m/s²" />
            <Slider label="와이어 하강 속도" setting="lowerSpeed" min={0.2} max={2} step={0.05} unit=" m/s" />
            <Slider label="와이어 상승 속도" setting="liftSpeed" min={0.2} max={2} step={0.05} unit=" m/s" />
            <Slider label="플런저 속도" setting="plungerSpeed" min={0.04} max={0.35} step={0.01} unit=" m/s" />
            <Slider label="플런저 최대 축력" setting="plungerMaxForce" min={4} max={40} step={0.5} unit=" N" />
            <Slider label="손가락 마찰계수" setting="clawFriction" min={0.1} max={2} step={0.05} unit=" μ" />
            <Slider label="진자 선형 감쇠" setting="swingLinearDamping" min={0.05} max={1.2} step={0.01} unit=" s⁻¹" />
          </>
        ) : tab === "prize" ? (
          <>
            <Slider label="인형 질량" setting="prizeMass" min={0.15} max={1.2} step={0.01} unit=" kg" />
            <Slider label="표면 마찰계수" setting="prizeFriction" min={0.1} max={1.5} step={0.05} unit=" μ" />
            <Slider label="선형 감쇠" setting="prizeLinearDamping" min={0.05} max={1.5} step={0.05} unit=" s⁻¹" />
            <Slider label="회전 감쇠" setting="angularDamping" min={0} max={2} step={0.05} unit=" s⁻¹" />
          </>
        ) : (
          <>
            <Slider label="중력" setting="gravity" min={-14} max={-5} step={0.01} unit=" m/s²" />
          </>
        )}
      </div>

      <div className="tuning-note">
        <Gauge size={17} />
        <p>
          속도·가속도·힘·질량은 SI 단위입니다. 질량과 중력을 바꾼 뒤에는
          새 라운드를 시작해 정확히 비교하세요.
        </p>
      </div>
    </aside>
  );
}
