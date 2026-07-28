"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleDot } from "lucide-react";
import {
  clampJoystickOffset,
  getEightWayInput,
} from "@/game/joystick.mjs";
import { useGameStore } from "@/game/store";

const DIRECTION_MARKERS = [
  { symbol: "→", className: "east", label: "오른쪽" },
  { symbol: "↘", className: "south-east", label: "오른쪽 아래" },
  { symbol: "↓", className: "south", label: "아래" },
  { symbol: "↙", className: "south-west", label: "왼쪽 아래" },
  { symbol: "←", className: "west", label: "왼쪽" },
  { symbol: "↖", className: "north-west", label: "왼쪽 위" },
  { symbol: "↑", className: "north", label: "위" },
  { symbol: "↗", className: "north-east", label: "오른쪽 위" },
];

interface JoystickVisual {
  className: string;
  x: number;
  y: number;
  directionIndex: number;
  active: boolean;
}

const NEUTRAL_VISUAL: JoystickVisual = {
  className: "",
  x: 0,
  y: 0,
  directionIndex: -1,
  active: false,
};

function EightWayJoystick() {
  const setInput = useGameStore((state) => state.setInput);
  const phase = useGameStore((state) => state.phase);
  const pointerIdRef = useRef<number | null>(null);
  const [visual, setVisual] = useState<JoystickVisual>(NEUTRAL_VISUAL);

  const resetJoystick = () => {
    pointerIdRef.current = null;
    setVisual(NEUTRAL_VISUAL);
    setInput(0, 0);
  };

  const updateFromPointer = useCallback(
    (element: HTMLButtonElement, clientX: number, clientY: number) => {
      const bounds = element.getBoundingClientRect();
      const deltaX = clientX - (bounds.left + bounds.width / 2);
      const deltaY = clientY - (bounds.top + bounds.height / 2);
      const size = Math.min(bounds.width, bounds.height);
      const maxTravel = size * 0.28;
      const direction = getEightWayInput(deltaX, deltaY, size * 0.1);
      const offset = clampJoystickOffset(deltaX, deltaY, maxTravel);

      setInput(direction.x, direction.z);
      setVisual({
        className:
          direction.index === -1
            ? ""
            : DIRECTION_MARKERS[direction.index].className,
        x: offset.x,
        y: offset.y,
        directionIndex: direction.index,
        active: true,
      });
    },
    [setInput],
  );

  const stopPointer = (element: HTMLButtonElement, pointerId: number) => {
    if (pointerIdRef.current !== pointerId) return;
    pointerIdRef.current = null;
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
    setVisual(NEUTRAL_VISUAL);
    setInput(0, 0);
  };

  const directionLabel =
    visual.directionIndex === -1
      ? "중립"
      : DIRECTION_MARKERS[visual.directionIndex].label;

  return (
    <button
      type="button"
      className={`joystick${visual.active ? " active" : ""}`}
      aria-label={`8방향 집게 조이스틱, 현재 ${directionLabel}`}
      data-direction={visual.className || "neutral"}
      disabled={phase !== "aiming"}
      onPointerDown={(event) => {
        if (pointerIdRef.current !== null) return;
        event.preventDefault();
        pointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromPointer(
          event.currentTarget,
          event.clientX,
          event.clientY,
        );
      }}
      onPointerMove={(event) => {
        if (pointerIdRef.current !== event.pointerId) return;
        event.preventDefault();
        updateFromPointer(
          event.currentTarget,
          event.clientX,
          event.clientY,
        );
      }}
      onPointerUp={(event) => {
        stopPointer(event.currentTarget, event.pointerId);
      }}
      onPointerCancel={(event) => {
        stopPointer(event.currentTarget, event.pointerId);
      }}
      onLostPointerCapture={(event) => {
        if (pointerIdRef.current === event.pointerId) {
          resetJoystick();
        }
      }}
    >
      <span className="joystick-gate" aria-hidden="true" />
      {DIRECTION_MARKERS.map((marker, index) => (
        <span
          key={marker.className}
          className={`joystick-direction ${marker.className}${
            visual.directionIndex === index ? " selected" : ""
          }`}
          aria-hidden="true"
        >
          {marker.symbol}
        </span>
      ))}
      <span
        className="joystick-thumb"
        style={{
          transform: `translate3d(${visual.x}px, ${visual.y}px, 0)`,
        }}
        aria-hidden="true"
      >
        <CircleDot size={19} strokeWidth={2.2} />
      </span>
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
      const rawX = Number(pressed.has("ArrowRight") || pressed.has("KeyD")) -
        Number(pressed.has("ArrowLeft") || pressed.has("KeyA"));
      const rawZ = Number(pressed.has("ArrowDown") || pressed.has("KeyS")) -
        Number(pressed.has("ArrowUp") || pressed.has("KeyW"));
      const magnitude = Math.hypot(rawX, rawZ);
      const scale = magnitude > 1 ? 1 / magnitude : 1;
      setInput(rawX * scale, rawZ * scale);
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
        <div className="control-kicker">
          MOVE CLAW
          <span className="joystick-mode">8-WAY · HOLD &amp; DRAG</span>
        </div>
        <EightWayJoystick key={phase} />
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
