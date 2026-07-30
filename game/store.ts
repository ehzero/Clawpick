"use client";

import { create, type StateCreator } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";
import {
  migratePersistedSettings,
  SETTINGS_STORAGE_VERSION,
} from "./settingsMigration.mjs";
import {
  createSettingsStorage,
  SETTINGS_STORAGE_KEY,
} from "./settingsStorage.mjs";
import type {
  GamePhase,
  GameResult,
  ManualCableDirection,
  ManualPlungerState,
  PerformanceMetrics,
  PhysicsSettings,
  SessionEvent,
} from "./types";

export const DEFAULT_SETTINGS: PhysicsSettings = {
  moveSpeed: 1.35,
  trolleyAcceleration: 5.2,
  gantryDriveStiffness: 900,
  gantryCoastRatio: 0.45,
  returnSpeedMultiplier: 0.9,
  returnAccelerationMultiplier: 0.73,
  lowerSpeed: 1.1,
  liftSpeed: 1.25,
  plungerSpeed: 0.19,
  plungerMaxForce: 18,
  plungerPositionTolerance: 0.006,
  plungerVelocityTolerance: 0.018,
  plungerStallTimeout: 2.4,
  clawFriction: 1.25,
  swingLinearDamping: 0.38,
  housingAngularDamping: 0,
  prizeMass: 0.38,
  prizeFriction: 0.78,
  prizeLinearDamping: 0.34,
  angularDamping: 0.55,
  gravity: -9.81,
};

export const PHYSICS_SETTING_LIMITS: Record<
  keyof PhysicsSettings,
  { min: number; max: number }
> = {
  moveSpeed: { min: 0.4, max: 2.5 },
  trolleyAcceleration: { min: 1, max: 10 },
  // Low values let the hanging claw visibly drag the gantry; high values model
  // a stiff geared drive that the pendulum cannot move.
  gantryDriveStiffness: { min: 40, max: 4000 },
  gantryCoastRatio: { min: 0.1, max: 1 },
  returnSpeedMultiplier: { min: 0.2, max: 1.2 },
  returnAccelerationMultiplier: { min: 0.2, max: 1.2 },
  lowerSpeed: { min: 0.2, max: 2 },
  liftSpeed: { min: 0.2, max: 2 },
  plungerSpeed: { min: 0.04, max: 0.35 },
  plungerMaxForce: { min: 4, max: 100 },
  plungerPositionTolerance: { min: 0.001, max: 0.02 },
  plungerVelocityTolerance: { min: 0.001, max: 0.06 },
  plungerStallTimeout: { min: 0.5, max: 5 },
  clawFriction: { min: 0.1, max: 2 },
  swingLinearDamping: { min: 0.05, max: 1.2 },
  housingAngularDamping: { min: 0, max: 10 },
  prizeMass: { min: 0.15, max: 1.2 },
  prizeFriction: { min: 0.1, max: 1.5 },
  prizeLinearDamping: { min: 0.05, max: 1.5 },
  angularDamping: { min: 0, max: 2 },
  gravity: { min: -14, max: -5 },
};

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function clampSetting(
  key: keyof PhysicsSettings,
  value: number,
) {
  const { min, max } = PHYSICS_SETTING_LIMITS[key];
  return Math.min(max, Math.max(min, value));
}

export function normalizePhysicsSettings(
  input: unknown,
): PhysicsSettings {
  const source =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const read = (
    key: keyof PhysicsSettings,
    legacyValue?: number,
  ) =>
    clampSetting(
      key,
      finiteNumber(source[key]) ??
        legacyValue ??
        DEFAULT_SETTINGS[key],
    );
  const legacyCloseSpeed = finiteNumber(source.closeSpeed);
  const legacySwingDamping = finiteNumber(source.swingDamping);

  return {
    moveSpeed: read("moveSpeed"),
    trolleyAcceleration: read("trolleyAcceleration"),
    gantryDriveStiffness: read("gantryDriveStiffness"),
    gantryCoastRatio: read("gantryCoastRatio"),
    returnSpeedMultiplier: read("returnSpeedMultiplier"),
    returnAccelerationMultiplier: read("returnAccelerationMultiplier"),
    lowerSpeed: read("lowerSpeed"),
    liftSpeed: read("liftSpeed"),
    plungerSpeed: read(
      "plungerSpeed",
      legacyCloseSpeed === undefined
        ? undefined
        : legacyCloseSpeed * 0.142,
    ),
    plungerMaxForce: read(
      "plungerMaxForce",
      finiteNumber(source.clawStrength),
    ),
    plungerPositionTolerance: read("plungerPositionTolerance"),
    plungerVelocityTolerance: read("plungerVelocityTolerance"),
    plungerStallTimeout: read("plungerStallTimeout"),
    clawFriction: read("clawFriction"),
    swingLinearDamping: read(
      "swingLinearDamping",
      legacySwingDamping === undefined
        ? undefined
        : 0.18 + legacySwingDamping * 0.28,
    ),
    housingAngularDamping: read("housingAngularDamping"),
    prizeMass: read("prizeMass"),
    prizeFriction: read("prizeFriction"),
    prizeLinearDamping: read("prizeLinearDamping"),
    angularDamping: read("angularDamping"),
    gravity: read("gravity"),
  };
}

const defaultMetrics: PerformanceMetrics = {
  fps: 60,
  minFps: 60,
  physicsMs: 0,
  activeBodies: 20,
  cableError: 0,
  cableLength: 0,
  cableDistance: 0,
  swingAngle: 0,
  tipClearance: 0,
  plungerForce: 0,
  plungerStroke: 0,
  plungerVelocity: 0,
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
  topCoverHidden: boolean;
  manualPlungerState: ManualPlungerState;
  manualCableDirection: ManualCableDirection;
  setInput: (x: number, z: number) => void;
  drop: () => void;
  setPhase: (phase: GamePhase) => void;
  finish: (result: Exclude<GameResult, null>) => void;
  reset: () => void;
  updateSetting: (key: keyof PhysicsSettings, value: number) => void;
  updateSettings: (
    values: Partial<PhysicsSettings>,
    source?: string,
  ) => void;
  replaceSettings: (settings: PhysicsSettings) => void;
  resetSettings: () => void;
  updateMetrics: (metrics: Partial<PerformanceMetrics>) => void;
  toggleDebug: () => void;
  toggleTopCover: () => void;
  setManualPlungerState: (state: ManualPlungerState) => void;
  setManualCableDirection: (direction: ManualCableDirection) => void;
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

interface PersistedSettings {
  settings: PhysicsSettings;
}

const settingsStorage = createSettingsStorage(() =>
  typeof localStorage === "undefined" ? null : localStorage,
) as PersistStorage<PersistedSettings>;

const createGameState: StateCreator<GameStore> = (set, get) => ({
  phase: "aiming",
  result: null,
  input: { x: 0, z: 0 },
  settings: DEFAULT_SETTINGS,
  metrics: defaultMetrics,
  events: [event(Date.now(), "session_started")],
  startedAt: Date.now(),
  round: 1,
  debug: false,
  topCoverHidden: false,
  manualPlungerState: "open",
  manualCableDirection: null,

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
      manualCableDirection: null,
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
      manualPlungerState: "open",
      manualCableDirection: null,
      metrics: defaultMetrics,
      events: [event(startedAt, "session_started")],
    }));
  },

  updateSetting: (key, value) => {
    const state = get();
    const nextValue = clampSetting(key, value);
    set({
      settings: { ...state.settings, [key]: nextValue },
      events: [
        ...state.events,
        event(state.startedAt, "setting_changed", {
          key,
          value: nextValue,
        }),
      ].slice(-400),
    });
  },

  updateSettings: (values, source = "batch") => {
    const state = get();
    const nextSettings = { ...state.settings };
    let changed = 0;

    for (const [key, value] of Object.entries(values) as Array<
      [keyof PhysicsSettings, number]
    >) {
      if (!(key in PHYSICS_SETTING_LIMITS) || !Number.isFinite(value)) {
        continue;
      }
      const nextValue = clampSetting(key, value);
      if (nextSettings[key] === nextValue) continue;
      nextSettings[key] = nextValue;
      changed += 1;
    }
    if (changed === 0) return;

    set({
      settings: nextSettings,
      events: [
        ...state.events,
        event(state.startedAt, "settings_batch_changed", {
          source,
          changed,
        }),
      ].slice(-400),
    });
  },

  replaceSettings: (settings) => {
    const state = get();
    set({
      settings: normalizePhysicsSettings(settings),
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

  // Purely a view toggle, like debug: the marquee hides the gantry from above.
  toggleTopCover: () =>
    set((state) => ({ topCoverHidden: !state.topCoverHidden })),

  setManualPlungerState: (manualPlungerState) => {
    const state = get();
    if (
      state.phase !== "aiming" ||
      state.manualPlungerState === manualPlungerState
    ) {
      return;
    }
    set({
      manualPlungerState,
      events: [
        ...state.events,
        event(state.startedAt, "manual_plunger_state_changed", {
          state: manualPlungerState,
        }),
      ].slice(-400),
    });
  },

  setManualCableDirection: (manualCableDirection) => {
    const state = get();
    if (
      state.phase !== "aiming" ||
      state.manualCableDirection === manualCableDirection
    ) {
      return;
    }
    set({
      manualCableDirection,
      events: [
        ...state.events,
        event(state.startedAt, "manual_cable_direction_changed", {
          direction: manualCableDirection ?? "stop",
        }),
      ].slice(-400),
    });
  },

  record: (type, data) => {
    const state = get();
    set({
      events: [
        ...state.events,
        event(state.startedAt, type, data),
      ].slice(-400),
    });
  },
});

export const useGameStore = create<GameStore>()(
  persist(createGameState, {
    name: SETTINGS_STORAGE_KEY,
    version: SETTINGS_STORAGE_VERSION,
    storage: settingsStorage,
    // Only the tuning is worth keeping; phase, metrics and the session log are
    // all per-round state.
    partialize: (state) => ({ settings: state.settings }),
    // Rehydration is deferred to the client so the server-rendered sliders and
    // the first client render agree. ClawLab kicks it off after mounting.
    skipHydration: true,
    migrate: (persisted, version) =>
      ({
        settings: migratePersistedSettings(
          normalizePhysicsSettings(
            (persisted as Partial<PersistedSettings> | undefined)?.settings,
          ),
          version,
        ),
      }) as PersistedSettings,
    merge: (persisted, current) => ({
      ...current,
      settings: normalizePhysicsSettings(
        (persisted as Partial<PersistedSettings> | undefined)?.settings,
      ),
    }),
  }),
);
