"use client";

import { useEffect } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CircleDot,
} from "lucide-react";
import { useGameStore } from "@/game/store";

interface DirectionButtonProps {
  label: string;
  x: number;
  z: number;
  className: string;
  children: React.ReactNode;
}

function DirectionButton({
  label,
  x,
  z,
  className,
  children,
}: DirectionButtonProps) {
  const setInput = useGameStore((state) => state.setInput);
  const phase = useGameStore((state) => state.phase);
  const stop = () => setInput(0, 0);

  return (
    <button
      type="button"
      className={`direction-button ${className}`}
      aria-label={label}
      disabled={phase !== "aiming"}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setInput(x, z);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
    >
      {children}
    </button>
  );
}

export function Controls() {
  const phase = useGameStore((state) => state.phase);
  const drop = useGameStore((state) => state.drop);
  const setInput = useGameStore((state) => state.setInput);

  useEffect(() => {
    const pressed = new Set<string>();
    const sync = () => {
      const x = Number(pressed.has("ArrowRight") || pressed.has("KeyD")) -
        Number(pressed.has("ArrowLeft") || pressed.has("KeyA"));
      const z = Number(pressed.has("ArrowDown") || pressed.has("KeyS")) -
        Number(pressed.has("ArrowUp") || pressed.has("KeyW"));
      setInput(x, z);
    };
    const down = (event: KeyboardEvent) => {
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
          event.code,
        )
      ) {
        event.preventDefault();
      }
      if (event.code === "Space") {
        drop();
        return;
      }
      pressed.add(event.code);
      sync();
    };
    const up = (event: KeyboardEvent) => {
      pressed.delete(event.code);
      sync();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [drop, setInput]);

  return (
    <div className="control-deck">
      <div>
        <div className="control-kicker">MOVE CLAW</div>
        <div className="dpad" aria-label="집게 방향 조작">
          <DirectionButton label="앞으로 이동" x={0} z={-1} className="up">
            <ArrowUp size={18} strokeWidth={2.5} />
          </DirectionButton>
          <DirectionButton label="왼쪽으로 이동" x={-1} z={0} className="left">
            <ArrowLeft size={18} strokeWidth={2.5} />
          </DirectionButton>
          <div className="dpad-center">
            <CircleDot size={13} />
          </div>
          <DirectionButton label="오른쪽으로 이동" x={1} z={0} className="right">
            <ArrowRight size={18} strokeWidth={2.5} />
          </DirectionButton>
          <DirectionButton label="뒤로 이동" x={0} z={1} className="down">
            <ArrowDown size={18} strokeWidth={2.5} />
          </DirectionButton>
        </div>
      </div>

      <div className="drop-control">
        <span className="control-kicker">LOCK POSITION</span>
        <button
          type="button"
          className="drop-button"
          onClick={drop}
          disabled={phase !== "aiming"}
        >
          <span className="drop-icon" aria-hidden="true" />
          {phase === "aiming" ? "집게 내리기" : "작동 중"}
        </button>
        <span className="keyboard-hint">SPACE</span>
      </div>
    </div>
  );
}
