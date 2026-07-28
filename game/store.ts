"use client";

import { create } from "zustand";
import type {
  GamePhase,
  GameResult,
  PerformanceMetrics,
  PhysicsSettings,
  SessionEvent,
} from "./types";

export const DEFAULT_SETTINGS: PhysicsSettings = {
  moveSpeed: 1.35,
  lowerSpeed: 1.1,
  liftSpeed: 1.25,
  closeSpeed: 1.35,
  clawStrength: 18,
  clawFriction: 1.25,
  cableStiffness: 560,
  cableDamping: 46,
  swingDamping: 0.72,
  prizeMass: 0.38,
  prizeFriction: 0.78,
  angularDamping: 0.55,
  gravity: -9.81,
};

const defaultMetrics: PerformanceMetrics = {
  fps: 60,
  minFps: 60,
  physicsMs: 0,
  activeBodies: 20,
  cableTension: 0,
  cableLength: 0,
  cableDistance: 0,
  swingAngle: 0,
  tipClearance: 0,
};

interface GameStore {
  phase: GamePhase;
  result: GameResult;
  input: { x: number; z: number };
  settings: PhysicsSettings;
  metrics: PerformanceMetrics;
  events: SessionEvent[];
  startedAt: number;
  round: number;
  debug: boolean;
  setInput: (x: number, z: number) => void;
  drop: () => void;
  setPhase: (phase: GamePhase) => void;
  finish: (result: Exclude<GameResult, null>) => void;
  reset: () => void;
  updateSetting: (key: keyof PhysicsSettings, value: number) => void;
  replaceSettings: (settings: PhysicsSettings) => void;
  resetSettings: () => void;
  updateMetrics: (metrics: Partial<PerformanceMetrics>) => void;
  toggleDebug: () => void;
  record: (
    type: string,
    data?: Record<string, string | number | boolean>,
  ) => void;
}

function event(
  startedAt: number,
  type: string,
  data?: Record<string, string | number | boolean>,
): SessionEvent {
  return { at: Math.max(0, Date.now() - startedAt), type, data };
}

export const useGameStore = create<GameStore>((set, get) => ({
  phase: "aiming",
  result: null,
  input: { x: 0, z: 0 },
  settings: DEFAULT_SETTINGS,
  metrics: defaultMetrics,
  events: [event(Date.now(), "session_started")],
  startedAt: Date.now(),
  round: 1,
  debug: false,

  setInput: (x, z) => {
    const state = get();
    if (state.phase !== "aiming") return;
    if (state.input.x === x && state.input.z === z) return;
    set({
      input: { x, z },
      events: [
        ...state.events,
        event(state.startedAt, "input", { x, z }),
      ].slice(-400),
    });
  },

  drop: () => {
    const state = get();
    if (state.phase !== "aiming") return;
    set({
      phase: "descending",
      input: { x: 0, z: 0 },
      events: [
        ...state.events,
        event(state.startedAt, "drop_pressed"),
      ],
    });
  },

  setPhase: (phase) => {
    const state = get();
    if (state.phase === phase) return;
    set({
      phase,
      events: [
        ...state.events,
        event(state.startedAt, "phase_changed", { phase }),
      ].slice(-400),
    });
  },

  finish: (result) => {
    const state = get();
    if (state.result === "win") return;
    set({
      result,
      events: [
        ...state.events,
        event(state.startedAt, "result", { result }),
      ].slice(-400),
    });
  },

  reset: () => {
    const startedAt = Date.now();
    set((state) => ({
      phase: "aiming",
      result: null,
      input: { x: 0, z: 0 },
      startedAt,
      round: state.round + 1,
      metrics: defaultMetrics,
      events: [event(startedAt, "session_started")],
    }));
  },

  updateSetting: (key, value) => {
    const state = get();
    set({
      settings: { ...state.settings, [key]: value },
      events: [
        ...state.events,
        event(state.startedAt, "setting_changed", { key, value }),
      ].slice(-400),
    });
  },

  replaceSettings: (settings) => {
    const state = get();
    set({
      settings,
      events: [
        ...state.events,
        event(state.startedAt, "preset_imported"),
      ].slice(-400),
    });
  },

  resetSettings: () => {
    const state = get();
    set({
      settings: DEFAULT_SETTINGS,
      events: [
        ...state.events,
        event(state.startedAt, "preset_reset"),
      ].slice(-400),
    });
  },

  updateMetrics: (metrics) =>
    set((state) => ({ metrics: { ...state.metrics, ...metrics } })),

  toggleDebug: () => set((state) => ({ debug: !state.debug })),

  record: (type, data) => {
    const state = get();
    set({
      events: [
        ...state.events,
        event(state.startedAt, type, data),
      ].slice(-400),
    });
  },
}));
