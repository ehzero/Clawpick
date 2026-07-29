import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { computeForceLimitedActuator } from "../game/clawActuator.mjs";

test("plunger actuator force is capped in both directions", () => {
  const closing = computeForceLimitedActuator({
    targetPosition: 0.14,
    currentPosition: 0,
    relativeVelocity: 0,
    maxForce: 18,
  });
  const opening = computeForceLimitedActuator({
    targetPosition: 0,
    currentPosition: 0.14,
    relativeVelocity: 0,
    maxForce: 18,
  });

  assert.equal(closing.force, 18);
  assert.equal(opening.force, -18);
  assert.equal(closing.saturated, true);
  assert.equal(opening.saturated, true);
});

test("plunger actuator damps motion near its target", () => {
  const upward = computeForceLimitedActuator({
    targetPosition: 0.1,
    currentPosition: 0.1,
    relativeVelocity: 0.2,
    maxForce: 20,
  });
  const downward = computeForceLimitedActuator({
    targetPosition: 0.1,
    currentPosition: 0.1,
    relativeVelocity: -0.2,
    maxForce: 20,
  });

  assert.ok(upward.force < 0);
  assert.ok(downward.force > 0);
  assert.ok(Math.abs(upward.force) <= 20);
  assert.ok(Math.abs(downward.force) <= 20);
});

test("physics tuning exposes SI values instead of motor coefficients", async () => {
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

  assert.match(clawSource, /computeForceLimitedActuator/);
  assert.match(clawSource, /plunger\.addForce\(force, true\)/);
  assert.match(clawSource, /housing\.addForce/);
  assert.match(clawSource, /const actuatorPowered =/);
  assert.match(clawSource, /actuatorForceRef\.current = 0/);
  assert.doesNotMatch(clawSource, /configureMotorPosition/);
  assert.match(panelSource, /플런저 최대 축력/);
  assert.match(panelSource, /setting="plungerSpeed"/);
  assert.match(panelSource, /setting="trolleyAcceleration"/);
  assert.match(panelSource, /setting="swingLinearDamping"/);
  assert.match(panelSource, /version: 2/);
  assert.match(storeSource, /legacyCloseSpeed \* 0\.142/);
  assert.match(
    storeSource,
    /0\.18 \+ legacySwingDamping \* 0\.28/,
  );
});
