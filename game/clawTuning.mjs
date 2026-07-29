const clampLevel = (value) => Math.min(100, Math.max(0, value));
const mix = (minimum, maximum, amount) =>
  minimum + (maximum - minimum) * amount;
const round = (value) => Number(value.toFixed(6));

const LEVEL_PARAMETERS = Object.freeze({
  grip: Object.freeze([
    Object.freeze({ setting: "plungerMaxForce", start: 8, end: 100 }),
    Object.freeze({ setting: "clawFriction", start: 0.5, end: 2 }),
  ]),
  speed: Object.freeze([
    Object.freeze({ setting: "plungerSpeed", start: 0.08, end: 0.32 }),
  ]),
  stability: Object.freeze([
    Object.freeze({ setting: "swingLinearDamping", start: 0, end: 0.8 }),
    Object.freeze({ setting: "housingAngularDamping", start: 0, end: 1 }),
  ]),
});

export function getSimpleClawTuningLevel(kind, settings) {
  const parameters = LEVEL_PARAMETERS[kind];
  if (!parameters) throw new Error(`Unknown claw tuning kind: ${kind}`);
  return Math.min(
    ...parameters.map(({ setting, start, end }) =>
      clampLevel(((settings[setting] - start) / (end - start)) * 100),
    ),
  );
}

export function getSimpleClawTuningPatch(kind, rawLevel) {
  const level = clampLevel(rawLevel);
  const amount = level / 100;

  if (kind === "grip") {
    return {
      plungerMaxForce: round(mix(8, 100, amount)),
      clawFriction: round(mix(0.5, 2, amount)),
    };
  }

  if (kind === "speed") {
    return {
      plungerSpeed: round(mix(0.08, 0.32, amount)),
    };
  }

  if (kind === "stability") {
    return {
      swingLinearDamping: round(mix(0, 0.8, amount)),
      housingAngularDamping: round(mix(0, 1, amount)),
    };
  }

  throw new Error(`Unknown claw tuning kind: ${kind}`);
}
