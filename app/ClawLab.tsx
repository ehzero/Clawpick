"use client";
import {
  Activity,
  Box,
  Bug,
  CheckCircle2,
  Download,
  RefreshCcw,
  TimerReset,
  XCircle,
} from "lucide-react";
import GameCanvas from "@/components/GameCanvas";
import { Controls } from "@/components/Controls";
import { TuningPanel } from "@/components/TuningPanel";
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
  const phase = useGameStore((state) => state.phase);
  const result = useGameStore((state) => state.result);
  const metrics = useGameStore((state) => state.metrics);
  const reset = useGameStore((state) => state.reset);
  const debug = useGameStore((state) => state.debug);
  const toggleDebug = useGameStore((state) => state.toggleDebug);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            C
          </span>
          <div>
            <strong>CLAWPICK</strong>
            <span>PHYSICS LAB / PROTOTYPE 01</span>
          </div>
        </div>

        <div className="topbar-status">
          <span className="live-dot" />
          LOCAL SIMULATION
        </div>

        <div className="topbar-actions">
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
                <span className="eyebrow">MACHINE 01 · BEAR STACK</span>
                <h1>집게 물리 검증실</h1>
              </div>
              <div className={`phase-pill phase-${phase}`}>
                <span>{String(Object.keys(PHASE_LABELS).indexOf(phase) + 1).padStart(2, "0")}</span>
                {PHASE_LABELS[phase]}
              </div>
            </div>

            <div className="viewport">
              <GameCanvas />

              <div className="viewport-badge">
                <span>RAPIER</span>
                FIXED 60 HZ
              </div>

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
                <strong>고정 물리 스텝</strong>
                <p>렌더 프레임과 분리된 60Hz 시뮬레이션</p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <strong>20개 동적 인형</strong>
                <p>질량·마찰·감쇠를 실시간으로 비교</p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <strong>재현 가능한 기록</strong>
                <p>설정과 입력 이벤트를 JSON으로 보존</p>
              </div>
            </article>
          </div>
        </div>

        <TuningPanel />
      </section>
    </main>
  );
}
