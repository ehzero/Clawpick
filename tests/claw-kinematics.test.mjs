import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CLAW_GEOMETRY,
  getClawPose,
  sampleClawClearance,
} from "../game/clawKinematics.mjs";

test("the shared plunger keeps all linkage poses inside hard limits", () => {
  for (let index = 0; index <= 100; index += 1) {
    const pose = getClawPose(index / 100);
    assert.ok(pose.angle >= CLAW_GEOMETRY.minimumAngle);
    assert.ok(pose.angle <= CLAW_GEOMETRY.maximumAngle);
    assert.ok(
      Math.abs(pose.linkLength - CLAW_GEOMETRY.connectorLength) < 1e-9,
    );
  }
});

test("three scoops retain physical clearance throughout closure", () => {
  assert.ok(
    sampleClawClearance(501) > 0.02,
    "scoop colliders must not overlap at any closure value",
  );

  let previousRadius = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= 100; index += 1) {
    const pose = getClawPose(index / 100);
    assert.ok(
      pose.tip.r <= previousRadius + 1e-9,
      "tips should move monotonically toward the centre",
    );
    previousRadius = pose.tip.r;
  }
});

test("the mechanical claw does not use a hidden prize attraction force", async () => {
  const source = await readFile(
    new URL("../components/MechanicalClaw.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /applyGripAssist|gripRadius|grabbed\.current/);
  assert.match(source, /configureMotorPosition/);
  assert.match(source, /JointData\.rope/);
  assert.match(source, /applyImpulse/);
});
