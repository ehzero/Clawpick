"use client";

import { Ruler, SlidersHorizontal } from "lucide-react";
import ClawSpecsPanel from "@/components/ClawSpecsPanel";
import { TuningPanel } from "@/components/TuningPanel";

export type InspectorMode = "physics" | "specs";

interface InspectorPanelProps {
  mode: InspectorMode;
  onModeChange: (mode: InspectorMode) => void;
}

export default function InspectorPanel({
  mode,
  onModeChange,
}: InspectorPanelProps) {
  return (
    <aside className="tuning-panel">
      <div
        className="inspector-tabs"
        role="tablist"
        aria-label="우측 설정 패널"
      >
        <button
          type="button"
          className={mode === "physics" ? "active" : ""}
          onClick={() => onModeChange("physics")}
          role="tab"
          aria-selected={mode === "physics"}
        >
          <SlidersHorizontal size={14} />
          물리 튜닝
        </button>
        <button
          type="button"
          className={mode === "specs" ? "active" : ""}
          onClick={() => onModeChange("specs")}
          role="tab"
          aria-selected={mode === "specs"}
        >
          <Ruler size={14} />
          부품 스펙
        </button>
      </div>

      {mode === "physics" ? <TuningPanel /> : <ClawSpecsPanel />}
    </aside>
  );
}
