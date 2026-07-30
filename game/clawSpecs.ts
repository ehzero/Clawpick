"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_GANTRY_PART_SPECS,
  normalizeGantryPartSpecs,
} from "./gantryGeometry.mjs";
import type { ClawPartSpecs } from "./types";

export const DEFAULT_CLAW_PART_SPECS: Readonly<ClawPartSpecs> = Object.freeze({
  powerCableDiameter: 0.06,
  powerCableCoilDiameter: 0.14,
  powerCableTurns: 28,
  powerCableSegments: 280,
  powerCableSlack: 0.24,
  housingDiameter: 0.44,
  housingHeight: 0.62,
  plungerShaftDiameter: 0.104,
  plungerShaftLength: 0.56,
  plungerHubDiameter: 0.26,
  plungerHubThickness: 0.065,
  linkWidth: 0.08,
  linkThickness: 0.03,
  hingePinDiameter: 0.09,
  hingePinLength: 0.115,
  fingerLength: 0.9765105457,
  fingerTaperStart: 0.77,
  fingerTipWidthScale: 0.62,
  ...DEFAULT_GANTRY_PART_SPECS,
});

export const CLAW_PART_SPEC_LIMITS: Record<
  keyof ClawPartSpecs,
  { min: number; max: number }
> = {
  powerCableDiameter: { min: 0.025, max: 0.1 },
  powerCableCoilDiameter: { min: 0.1, max: 0.24 },
  powerCableTurns: { min: 6, max: 120 },
  powerCableSegments: { min: 48, max: 1200 },
  powerCableSlack: { min: 0.04, max: 2 },
  housingDiameter: { min: 0.32, max: 0.56 },
  housingHeight: { min: 0.46, max: 0.76 },
  plungerShaftDiameter: { min: 0.05, max: 0.16 },
  plungerShaftLength: { min: 0.36, max: 0.72 },
  plungerHubDiameter: { min: 0.18, max: 0.34 },
  plungerHubThickness: { min: 0.035, max: 0.11 },
  linkWidth: { min: 0.04, max: 0.13 },
  linkThickness: { min: 0.014, max: 0.065 },
  hingePinDiameter: { min: 0.04, max: 0.13 },
  hingePinLength: { min: 0.06, max: 0.18 },
  fingerLength: { min: 0.72, max: 1.18 },
  fingerTaperStart: { min: 0.55, max: 0.92 },
  fingerTipWidthScale: { min: 0.35, max: 1 },
  // The rod, its wheel groove and that wheel's flange stack straight up from
  // the rail centre, so their maxima together decide how close the gantry gets
  // to the cabinet ceiling at 4.20. Keep the sum under 0.55.
  // A wider wheel pushes the side rods inboard, which shortens the carriage's
  // travel; these maxima keep it within reach of the prize chute.
  rodDiameter: { min: 0.07, max: 0.11 },
  wheelGrooveDiameter: { min: 0.09, max: 0.14 },
  wheelFlangeDiameter: { min: 0.2, max: 0.28 },
  wheelGrooveWidth: { min: 0.09, max: 0.13 },
  bridgeRodSpacing: { min: 0.2, max: 0.44 },
  trolleyWheelSpacing: { min: 0.18, max: 0.46 },
};

function clampSpec(key: keyof ClawPartSpecs, value: number) {
  const { min, max } = CLAW_PART_SPEC_LIMITS[key];
  const clamped = Math.min(max, Math.max(min, value));
  return key === "powerCableTurns" ||
    key === "powerCableSegments"
    ? Math.round(clamped)
    : clamped;
}

export function normalizeClawPartSpecs(input: unknown): ClawPartSpecs {
  const source =
    input && typeof input === "object"
      ? (input as Partial<Record<keyof ClawPartSpecs, unknown>>)
      : {};
  const next = { ...DEFAULT_CLAW_PART_SPECS } as ClawPartSpecs;

  for (const key of Object.keys(DEFAULT_CLAW_PART_SPECS) as Array<
    keyof ClawPartSpecs
  >) {
    const candidate = source[key];
    next[key] = clampSpec(
      key,
      typeof candidate === "number" && Number.isFinite(candidate)
        ? candidate
        : DEFAULT_CLAW_PART_SPECS[key],
    );
  }
  next.powerCableCoilDiameter = Math.max(
    next.powerCableCoilDiameter,
    next.powerCableDiameter + 0.02,
  );
  // The wheel/rod fit constraints live with the geometry that depends on them.
  Object.assign(next, normalizeGantryPartSpecs(next));

  return next;
}

interface ClawSpecStore {
  specs: ClawPartSpecs;
  revision: number;
  updateSpec: (key: keyof ClawPartSpecs, value: number) => void;
  resetPart: (keys: ReadonlyArray<keyof ClawPartSpecs>) => void;
  resetSpecs: () => void;
}

export const useClawSpecStore = create<ClawSpecStore>()(
  persist(
    (set) => ({
      specs: { ...DEFAULT_CLAW_PART_SPECS },
      revision: 0,
      updateSpec: (key, value) =>
        set((state) => {
          const nextValue = clampSpec(key, value);
          if (state.specs[key] === nextValue) return state;
          return {
            specs: normalizeClawPartSpecs({
              ...state.specs,
              [key]: nextValue,
            }),
            revision: state.revision + 1,
          };
        }),
      resetPart: (keys) =>
        set((state) => {
          const specs = { ...state.specs };
          let changed = false;
          for (const key of keys) {
            if (specs[key] === DEFAULT_CLAW_PART_SPECS[key]) continue;
            specs[key] = DEFAULT_CLAW_PART_SPECS[key];
            changed = true;
          }
          return changed
            ? { specs, revision: state.revision + 1 }
            : state;
        }),
      resetSpecs: () =>
        set((state) => ({
          specs: { ...DEFAULT_CLAW_PART_SPECS },
          revision: state.revision + 1,
        })),
    }),
    {
      name: "clawpick-claw-part-specs",
      version: 10,
      partialize: (state) => ({ specs: state.specs }),
      migrate: (persisted, version) => {
        const state = persisted as {
          specs?: Record<string, unknown>;
        };
        const saved = state.specs ?? {};
        const numberOr = (value: unknown, fallback: number) =>
          typeof value === "number" && Number.isFinite(value)
            ? value
            : fallback;
        if (version >= 10) return persisted;
        if (version >= 4) {
          const savedTurns = numberOr(
            saved.powerCableTurns,
            DEFAULT_CLAW_PART_SPECS.powerCableTurns,
          );
          return {
            ...state,
            specs: {
              ...saved,
              powerCableTurns:
                version === 6 && savedTurns === 12
                  ? DEFAULT_CLAW_PART_SPECS.powerCableTurns
                  : savedTurns,
            },
          };
        }
        return {
          ...state,
          specs: {
            ...saved,
            linkWidth: numberOr(
              saved.fingerWidth ?? saved.rockerWidth,
              DEFAULT_CLAW_PART_SPECS.linkWidth,
            ),
            linkThickness: numberOr(
              saved.fingerThickness ?? saved.rockerThickness,
              DEFAULT_CLAW_PART_SPECS.linkThickness,
            ),
            hingePinDiameter: numberOr(
              saved.hingePinDiameter,
              DEFAULT_CLAW_PART_SPECS.hingePinDiameter,
            ),
            hingePinLength: numberOr(
              saved.hingePinLength,
              DEFAULT_CLAW_PART_SPECS.hingePinLength,
            ),
          },
        };
      },
      merge: (persisted, current) => {
        const saved = persisted as Partial<ClawSpecStore> | undefined;
        return {
          ...current,
          specs: normalizeClawPartSpecs(saved?.specs),
        };
      },
    },
  ),
);
