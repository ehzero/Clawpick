import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CLAW_GEOMETRY,
  getClawPose,
  sampleClawClearance,
} from "../game/clawKinematics.mjs";

test("each curved finger stays rigid while its two linkage pivots move", () => {
  assert.equal(CLAW_GEOMETRY.rigidSegmentsPerFinger, 1);
  assert.equal(CLAW_GEOMETRY.linkageJointsPerFinger, 2);
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
      Math.abs(
        Math.hypot(
          pose.hinge.r - pose.housingPivot.r,
          pose.hinge.y - pose.housingPivot.y,
        ) - CLAW_GEOMETRY.rockerLength,
      ) < 1e-9,
      "the housing-to-finger rocker must keep a fixed length",
    );
    assert.ok(
      Math.abs(
        Math.hypot(
          pose.plungerPin.r - pose.hinge.r,
          pose.plungerPin.y - pose.hinge.y,
        ) - CLAW_GEOMETRY.fingerPlungerLength,
      ) < 1e-9,
      "the rigid finger root must keep its distance from the plunger",
    );
    const rootR =
      pose.hinge.r +
      Math.cos(pose.angle) *
        CLAW_GEOMETRY.fingerPlungerDirection.r *
        CLAW_GEOMETRY.fingerPlungerLength -
      Math.sin(pose.angle) *
        CLAW_GEOMETRY.fingerPlungerDirection.y *
        CLAW_GEOMETRY.fingerPlungerLength;
    const rootY =
      pose.hinge.y +
      Math.sin(pose.angle) *
        CLAW_GEOMETRY.fingerPlungerDirection.r *
        CLAW_GEOMETRY.fingerPlungerLength +
      Math.cos(pose.angle) *
        CLAW_GEOMETRY.fingerPlungerDirection.y *
        CLAW_GEOMETRY.fingerPlungerLength;
    assert.ok(Math.abs(rootR - pose.plungerPin.r) < 1e-9);
    assert.ok(Math.abs(rootY - pose.plungerPin.y) < 1e-9);
  }
});

test("the rising plunger swings the moving finger hinge away from the body", () => {
  const open = getClawPose(0);
  const closed = getClawPose(1);

  assert.ok(closed.plungerY > open.plungerY);
  assert.ok(
    closed.plungerY - open.plungerY > 0.12,
    "the common actuator stroke should remain visible",
  );
  assert.ok(
    closed.hinge.r - open.hinge.r > 0.02,
    "the moving hinge should swing outward as the plunger rises",
  );
  assert.notEqual(closed.rockerAngle, open.rockerAngle);
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
  assert.match(source, /createFingerStripGeometry/);
  assert.doesNotMatch(source, /<tubeGeometry/);
  assert.match(source, /umbilicalRef/);
  assert.match(source, /rockerLink/);
  assert.match(source, /plungerArm/);
  assert.doesNotMatch(source, /driveTail|driveSlot/);
  assert.doesNotMatch(source, /serviceCableRef|SERVICE_CABLE_SEGMENTS/);
  assert.doesNotMatch(
    source,
    /connectorRefOne|connectorLength|connectorPoint/,
  );
  assert.match(source, /claw-central-plunger/);
  assert.doesNotMatch(source, /proximalLength|distalLength|bendAngle|shape\.knee/);
  assert.match(source, /JointData\.rope\(\s*cableLength\.current/);
  assert.doesNotMatch(source, /applyImpulse|cableStiffness|cableDamping/);
});

test("the complete linkage follows the suspended housing pose", async () => {
  const source = await readFile(
    new URL("../components/MechanicalClaw.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /function ClawLinkageDriver/);
  assert.equal(source.match(/type="kinematicPosition"/g)?.length, 3);
  assert.match(source, /setNextKinematicTranslation/);
  assert.match(source, /setNextKinematicRotation/);
  assert.match(source, /function RockerLink/);
  assert.match(
    source,
    /<group ref=\{rockerRef\} position=\{shape\.housingPivot\}>/,
  );
  assert.match(source, /rocker\.quaternion\.copy\(rockerLocalRotation\)/);
  assert.match(
    source,
    /applyQuaternion\(housingQuaternion\)\.add\(housingPosition\)/,
  );
  assert.doesNotMatch(source, /useRevoluteJoint|usePrismaticJoint/);
});
