import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  computeAxialForceCommand,
  END_STOP_FORCE_RAMP_DISTANCE,
  END_STOP_HOLD_FORCE_RATIO,
} from "../game/clawActuator.mjs";

test("plunger actuator applies the configured axial force in both directions", () => {
  const closing = computeAxialForceCommand({
    direction: 1,
    relativeVelocity: 0,
    maxForce: 18,
  });
  const opening = computeAxialForceCommand({
    direction: -1,
    relativeVelocity: 0,
    maxForce: 18,
  });

  assert.equal(closing.force, 18);
  assert.equal(closing.direction, 1);
  assert.equal(opening.force, -18);
  assert.equal(opening.direction, -1);
});

test("plunger actuator lowers its holding force at the mechanical stop", () => {
  const atStop = computeAxialForceCommand({
    direction: 1,
    relativeVelocity: 0,
    maxForce: 100,
    remainingTravel: 0,
  });
  const approaching = computeAxialForceCommand({
    direction: 1,
    relativeVelocity: 0,
    maxForce: 100,
    remainingTravel: END_STOP_FORCE_RAMP_DISTANCE / 2,
  });
  const underLoad = computeAxialForceCommand({
    direction: 1,
    relativeVelocity: 0,
    maxForce: 100,
    remainingTravel: END_STOP_FORCE_RAMP_DISTANCE,
  });

  assert.equal(atStop.force, 100 * END_STOP_HOLD_FORCE_RATIO);
  assert.equal(atStop.forceScale, END_STOP_HOLD_FORCE_RATIO);
  assert.equal(atStop.atEndStop, true);
  assert.ok(approaching.force > atStop.force);
  assert.ok(approaching.force < underLoad.force);
  assert.equal(underLoad.force, 100);
});

test("plunger speed is a drive cutoff instead of a motion profile", () => {
  const limited = computeAxialForceCommand({
    direction: 1,
    relativeVelocity: 0.2,
    maxSpeed: 0.19,
    maxForce: 40,
  });
  const recovering = computeAxialForceCommand({
    direction: 1,
    relativeVelocity: -0.2,
    maxSpeed: 0.19,
    maxForce: 40,
  });

  assert.equal(limited.force, 0);
  assert.equal(limited.speedLimited, true);
  assert.equal(recovering.force, 40);
  assert.equal(recovering.speedLimited, false);
});

test("plunger uses a force-driven prismatic actuator without servo coefficients", async () => {
  const [clawSource, panelSource, storeSource] = await Promise.all([
    readFile(
      new URL("../components/MechanicalClaw.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/TuningPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../game/store.ts", import.meta.url), "utf8"),
  ]);
  const removedSettings = [
    "plungerBrakingAcceleration",
    "plungerSettlingTime",
    "plungerResponseDistance",
    "plungerTravelLeadDistance",
    "plungerGripLeadDistance",
    "plungerGripEngagementDistance",
    "plungerEffectiveMass",
    "plungerDampingRatio",
    "plungerGripDampingMultiplier",
    "plungerReleaseSpeedMultiplier",
    "plungerClosedStroke",
  ];

  assert.match(clawSource, /computeAxialForceCommand/);
  assert.match(clawSource, /remainingTravel/);
  assert.match(clawSource, /plunger\.addForce\(plungerForce, true\)/);
  assert.match(
    clawSource,
    /housing\.addForce\(housingReactionForce, true\)/,
  );
  assert.match(clawSource, /plunger\.resetForces\(true\)/);
  assert.match(clawSource, /housing\.resetForces\(true\)/);
  assert.doesNotMatch(clawSource, /configureMotor/);
  assert.doesNotMatch(clawSource, /MotorModel/);
  assert.match(panelSource, /플런저 최대 축력/);
  assert.match(panelSource, /setting: "plungerSpeed"/);
  assert.match(panelSource, /setting: "trolleyAcceleration"/);
  assert.match(panelSource, /setting: "swingLinearDamping"/);
  assert.match(panelSource, /version: SETTINGS_STORAGE_VERSION/);
  assert.match(storeSource, /legacyCloseSpeed \* 0\.142/);
  assert.match(
    storeSource,
    /0\.18 \+ legacySwingDamping \* 0\.28/,
  );

  for (const setting of removedSettings) {
    assert.doesNotMatch(panelSource, new RegExp(setting));
    assert.doesNotMatch(storeSource, new RegExp(setting));
  }
});
