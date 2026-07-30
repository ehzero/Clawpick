"use client";
import {
  Activity,
  BookOpen,
  Box,
  Bug,
  CheckCircle2,
  Download,
  RefreshCcw,
  Ruler,
  TimerReset,
  XCircle,
} from "lucide-react";
import { useCallback, useState } from "react";
import PartsGlossaryModal from "@/app/PartsGlossaryModal";
import GameCanvas from "@/components/GameCanvas";
import { Controls } from "@/components/Controls";
import InspectorPanel, {
  type InspectorMode,
} from "@/components/InspectorPanel";
import { useClawSpecStore } from "@/game/clawSpecs";
import { useGameStore } from "@/game/store";
import type { GamePhase } from "@/game/types";

const PHASE_LABELS: Record<GamePhase, string> = {
  aiming: "위치 조정",
  descending: "집게 하강",
  closing: "집게 닫힘",
  lifting: "인형 들어올림",
  returning: "배출구 이동",
  releasing: "집게 열림",
  settling: "결과 판정",
  result: "라운드 완료",
};

function exportSession() {
  const state = useGameStore.getState();
  const payload = {
    schemaVersion: 1,
    sessionId: `clawpick-${state.startedAt}`,
    startedAt: new Date(state.startedAt).toISOString(),
    endedAt: new Date().toISOString(),
    device: navigator.userAgent,
    settings: state.settings,
    clawPartSpecs: useClawSpecStore.getState().specs,
    metrics: state.metrics,
    result: state.result,
    events: state.events,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${payload.sessionId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  state.record("session_exported");
}

export default function ClawLab() {
  const [partsOpen, setPartsOpen] = useState(false);
  const [inspectorMode, setInspectorMode] =
    useState<InspectorMode>("physics");
  const phase = useGameStore((state) => state.phase);
  const result = useGameStore((state) => state.result);
  const metrics = useGameStore((state) => state.metrics);
  const reset = useGameStore((state) => state.reset);
  const debug = useGameStore((state) => state.debug);
  const toggleDebug = useGameStore((state) => state.toggleDebug);
  const closeParts = useCallback(() => setPartsOpen(false), []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            C
          </span>
          <div>
            <strong>CLAWPICK</strong>
            <span>MECHANICAL LAB / PROTOTYPE 02</span>
          </div>
        </div>

        <div className="topbar-status">
          <span className="live-dot" />
          LOCAL SIMULATION
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className={
              inspectorMode === "specs"
                ? "parts-nav-link active"
                : "parts-nav-link"
            }
            onClick={() => setInspectorMode("specs")}
            aria-label="집게 부품 스펙"
            title="집게 부품 스펙"
            aria-pressed={inspectorMode === "specs"}
          >
            <Ruler size={16} />
            <span>집게 스펙</span>
          </button>
          <button
            type="button"
            className="parts-nav-link"
            onClick={() => setPartsOpen(true)}
            aria-label="부품 용어집"
            title="부품 용어집"
          >
            <BookOpen size={16} />
            <span>부품 용어집</span>
          </button>
          <button
            type="button"
            className={debug ? "icon-action active" : "icon-action"}
            onClick={toggleDebug}
            aria-label="물리 충돌체 표시"
            title="물리 충돌체 표시"
          >
            <Bug size={17} />
          </button>
          <button type="button" className="secondary-action" onClick={exportSession}>
            <Download size={16} />
            세션 JSON
          </button>
          <button type="button" className="primary-action" onClick={reset}>
            <RefreshCcw size={16} />
            새 라운드
          </button>
        </div>
      </header>

      <section className="workspace">
        <div className="simulation-column">
          <div className="machine-card">
            <div className="machine-heading">
              <div>
                <span className="eyebrow">MACHINE 01 · SOLENOID 3-PRONG</span>
                <h1>실물 기구 검증실</h1>
              </div>
              <div className={`phase-pill phase-${phase}`}>
                <span>{String(Object.keys(PHASE_LABELS).indexOf(phase) + 1).padStart(2, "0")}</span>
                {PHASE_LABELS[phase]}
              </div>
            </div>

            <div className="viewport">
              <GameCanvas />

              <div className="viewport-badge">
                <span>CLOSED LOOP LINKAGE</span>
                RAPIER · 60 HZ
              </div>
              <div className="camera-hint" aria-hidden="true">
                DRAG TO ORBIT · WHEEL / PINCH TO ZOOM
              </div>

              {debug && (
                <div className="mechanism-debug" aria-live="polite">
                  <span>MECHANISM DEBUG</span>
                  <dl>
                    <div>
                      <dt>LENGTH ERROR</dt>
                      <dd>{metrics.cableError.toFixed(1)} mm</dd>
                    </div>
                    <div>
                      <dt>LENGTH</dt>
                      <dd>
                        {metrics.cableDistance.toFixed(2)} /
                        {metrics.cableLength.toFixed(2)} m
                      </dd>
                    </div>
                    <div>
                      <dt>SWING</dt>
                      <dd>{metrics.swingAngle.toFixed(1)}°</dd>
                    </div>
                    <div>
                      <dt>TIP GAP</dt>
                      <dd>{metrics.tipClearance.toFixed(0)} mm</dd>
                    </div>
                    <div>
                      <dt>PLUNGER FORCE</dt>
                      <dd>{metrics.plungerForce.toFixed(1)} N</dd>
                    </div>
                    <div>
                      <dt>PLUNGER STROKE</dt>
                      <dd>{metrics.plungerStroke.toFixed(1)} mm</dd>
                    </div>
                    <div>
                      <dt>PLUNGER SPEED</dt>
                      <dd>{metrics.plungerVelocity.toFixed(3)} m/s</dd>
                    </div>
                  </dl>
                </div>
              )}

              <div className="metrics-strip">
                <div>
                  <Activity size={14} />
                  <span>FPS</span>
                  <strong>{metrics.fps}</strong>
                </div>
                <div>
                  <TimerReset size={14} />
                  <span>STEP</span>
                  <strong>{metrics.physicsMs.toFixed(2)}ms</strong>
                </div>
                <div>
                  <Box size={14} />
                  <span>BODIES</span>
                  <strong>{metrics.activeBodies}</strong>
                </div>
              </div>

              {phase === "result" && (
                <div className={`result-card ${result ?? "lose"}`}>
                  {result === "win" ? (
                    <CheckCircle2 size={30} />
                  ) : (
                    <XCircle size={30} />
                  )}
                  <div>
                    <span>ROUND RESULT</span>
                    <strong>{result === "win" ? "획득 성공" : "아쉽게 놓쳤어요"}</strong>
                  </div>
                  <button type="button" onClick={reset}>
                    다시 테스트
                  </button>
                </div>
              )}
            </div>

            <Controls />
          </div>

          <div className="validation-row">
            <article>
              <span>01</span>
              <div>
                <strong>로커 링크 곡선 집게</strong>
                <p>플런저 상승이 이동 힌지를 밀어 세 곡선 발을 동기 구동</p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <strong>비신축 와이어 승강</strong>
                <p>스프링 없이 윈치 길이 변화로만 하강·상승</p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <strong>물리 접촉 파지</strong>
                <p>숨은 흡착력 없이 형상·마찰·관절력으로 획득</p>
              </div>
            </article>
          </div>
        </div>

        <InspectorPanel
          mode={inspectorMode}
          onModeChange={setInspectorMode}
        />
      </section>
      <PartsGlossaryModal open={partsOpen} onClose={closeParts} />
    </main>
  );
}
