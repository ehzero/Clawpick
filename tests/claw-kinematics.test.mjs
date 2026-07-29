import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CLAW_GEOMETRY,
  getClawPose,
  sampleClawClearance,
} from "../game/clawKinematics.mjs";

test("each curved finger has one hinge and stays inside its hard limits", () => {
  assert.equal(CLAW_GEOMETRY.jointsPerFinger, 1);
  assert.ok(CLAW_GEOMETRY.curvePoints.length >= 6);
  assert.ok(CLAW_GEOMETRY.fingerWidth > CLAW_GEOMETRY.fingerThickness);
  assert.notEqual(
    CLAW_GEOMETRY.curvePoints[1].r / CLAW_GEOMETRY.curvePoints[1].y,
    CLAW_GEOMETRY.curvePoints[3].r / CLAW_GEOMETRY.curvePoints[3].y,
    "the single rigid finger should follow a curve instead of a straight line",
  );

  for (let index = 0; index <= 100; index += 1) {
    const pose = getClawPose(index / 100);
    assert.ok(pose.angle >= CLAW_GEOMETRY.minimumAngle);
    assert.ok(pose.angle <= CLAW_GEOMETRY.maximumAngle);
    assert.ok(
      Math.abs(pose.linkLength - CLAW_GEOMETRY.connectorLength) < 1e-9,
    );
  }
});

test("the shared plunger rises through a visible stroke as the fingers close", () => {
  const open = getClawPose(0);
  const closed = getClawPose(1);

  assert.ok(closed.plungerY > open.plungerY);
  assert.ok(
    closed.plungerY - open.plungerY > 0.12,
    "the common actuator stroke should remain visible",
  );
  assert.ok(CLAW_GEOMETRY.bracketTop.y > CLAW_GEOMETRY.hingeY);
  assert.ok(CLAW_GEOMETRY.bracketTop.r < CLAW_GEOMETRY.hingeRadius);
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
  assert.match(source, /MotorModel\.ForceBased/);
  assert.match(source, /createFingerStripGeometry/);
  assert.doesNotMatch(source, /<tubeGeometry/);
  assert.match(source, /umbilicalRef/);
  assert.match(source, /serviceCableRef/);
  assert.equal(source.match(/useRevoluteJoint\(/g)?.length, 1);
  assert.doesNotMatch(source, /proximalLength|distalLength|bendAngle|shape\.knee/);
  assert.match(source, /JointData\.rope\(\s*cableLength\.current/);
  assert.doesNotMatch(source, /applyImpulse|cableStiffness|cableDamping/);
});
