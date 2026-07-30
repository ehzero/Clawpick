import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CLAW_GEOMETRY,
  createClawGeometry,
  getClawPose,
  getClawPoseFromPlungerY,
  sampleClawClearance,
} from "../game/clawKinematics.mjs";

test("editable finger dimensions preserve the linkage and scale the path", () => {
  const scaled = createClawGeometry({
    fingerLength: CLAW_GEOMETRY.fingerLength * 1.1,
    fingerWidth: 0.09,
    fingerThickness: 0.035,
    fingerTaperStart: 0.72,
    fingerTipWidthScale: 0.55,
  });

  assert.equal(scaled.fingerWidth, 0.09);
  assert.equal(scaled.fingerThickness, 0.035);
  assert.equal(scaled.fingerTaperStart, 0.72);
  assert.equal(scaled.fingerTipWidthScale, 0.55);
  assert.ok(
    Math.abs(
      scaled.curvePoints.at(-1).y /
        CLAW_GEOMETRY.curvePoints.at(-1).y -
        1.1,
    ) < 1e-9,
  );
  assert.equal(scaled.rockerLength, CLAW_GEOMETRY.rockerLength);
  assert.equal(
    scaled.fingerPlungerLength,
    CLAW_GEOMETRY.fingerPlungerLength,
  );
});

test("each curved finger stays rigid while its two linkage pivots move", () => {
  assert.equal(CLAW_GEOMETRY.rigidSegmentsPerFinger, 1);
  assert.equal(CLAW_GEOMETRY.linkageJointsPerFinger, 2);
  assert.equal(CLAW_GEOMETRY.fingerBendCount, 2);
  assert.equal(CLAW_GEOMETRY.fingerStraightEndIndex, 3);
  assert.equal(CLAW_GEOMETRY.fingerCurveEndIndex, 6);
  assert.ok(CLAW_GEOMETRY.curvePoints.length >= 6);
  assert.ok(CLAW_GEOMETRY.fingerWidth > CLAW_GEOMETRY.fingerThickness);
  assert.notEqual(
    CLAW_GEOMETRY.curvePoints[1].r / CLAW_GEOMETRY.curvePoints[1].y,
    CLAW_GEOMETRY.curvePoints[3].r / CLAW_GEOMETRY.curvePoints[3].y,
    "the single rigid finger should follow a curve instead of a straight line",
  );
  const straightEnd =
    CLAW_GEOMETRY.curvePoints[CLAW_GEOMETRY.fingerStraightEndIndex];
  for (
    let index = 1;
    index < CLAW_GEOMETRY.fingerStraightEndIndex;
    index += 1
  ) {
    const point = CLAW_GEOMETRY.curvePoints[index];
    assert.ok(
      Math.abs(point.r * straightEnd.y - point.y * straightEnd.r) < 0.001,
      "the section after the hinge should be exactly straight",
    );
  }
  const lowerSegments = [0, 1, 2].map((offset) => {
    const index = CLAW_GEOMETRY.fingerStraightEndIndex + offset;
    return {
      r:
        CLAW_GEOMETRY.curvePoints[index + 1].r -
        CLAW_GEOMETRY.curvePoints[index].r,
      y:
        CLAW_GEOMETRY.curvePoints[index + 1].y -
        CLAW_GEOMETRY.curvePoints[index].y,
    };
  });
  const lowerTurns = [0, 1].map(
    (index) =>
      lowerSegments[index].r * lowerSegments[index + 1].y -
      lowerSegments[index].y * lowerSegments[index + 1].r,
  );
  assert.ok(
    lowerTurns.every((turn) => turn < 0),
    "the lower profile should turn inward as one continuous rounded bend",
  );
  const turnRatio = Math.abs(lowerTurns[0] / lowerTurns[1]);
  assert.ok(
    turnRatio > 0.8 && turnRatio < 1.2,
    "the curve handles should distribute curvature uniformly",
  );
  const firstLower = lowerSegments[0];
  const lastLower = lowerSegments.at(-1);
  const lowerBendDot =
    (firstLower.r * lastLower.r + firstLower.y * lastLower.y) /
    (Math.hypot(firstLower.r, firstLower.y) *
      Math.hypot(lastLower.r, lastLower.y));
  assert.ok(
    Math.acos(lowerBendDot) > 0.85,
    "the single lower bend should visibly turn the tip inward",
  );
  const lowerStraightStart =
    CLAW_GEOMETRY.curvePoints[CLAW_GEOMETRY.fingerCurveEndIndex];
  const fingerTip = CLAW_GEOMETRY.curvePoints.at(-1);
  assert.ok(
    Math.hypot(
      fingerTip.r - lowerStraightStart.r,
      fingerTip.y - lowerStraightStart.y,
    ) > 0.22,
    "the lower straight should remain visibly long after the bend",
  );

  for (let index = 0; index <= 100; index += 1) {
    const plungerY =
      CLAW_GEOMETRY.openPlungerY +
      (CLAW_GEOMETRY.closedPlungerY - CLAW_GEOMETRY.openPlungerY) *
        (index / 100);
    const pose = getClawPoseFromPlungerY(plungerY);
    assert.ok(Math.abs(pose.plungerY - plungerY) < 1e-9);
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
  const open = getClawPoseFromPlungerY(CLAW_GEOMETRY.openPlungerY);
  const closed = getClawPoseFromPlungerY(CLAW_GEOMETRY.closedPlungerY);

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

test("plunger displacement is the sole input to the linkage solver", () => {
  const quarterStroke =
    CLAW_GEOMETRY.openPlungerY +
    (CLAW_GEOMETRY.closedPlungerY - CLAW_GEOMETRY.openPlungerY) * 0.25;
  const pose = getClawPoseFromPlungerY(quarterStroke);

  assert.ok(Math.abs(pose.stroke - 0.25) < 1e-9);
  assert.ok(Math.abs(pose.plungerY - quarterStroke) < 1e-9);
  assert.deepEqual(
    getClawPoseFromPlungerY(CLAW_GEOMETRY.openPlungerY - 1),
    getClawPoseFromPlungerY(CLAW_GEOMETRY.openPlungerY),
  );
  assert.deepEqual(
    getClawPoseFromPlungerY(CLAW_GEOMETRY.closedPlungerY + 1),
    getClawPoseFromPlungerY(CLAW_GEOMETRY.closedPlungerY),
  );
});

test("three fingers retain physical clearance throughout closure", () => {
  assert.ok(
    sampleClawClearance(501) > 0.02,
    "finger colliders must not overlap at any closure value",
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
  assert.match(source, /power-umbilical-continuous-tube/);
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
  assert.match(source, /JointData\.rope\(\s*cableLength[,\s]/);
  assert.doesNotMatch(source, /applyImpulse|cableStiffness|cableDamping/);
});

test("the complete linkage is a force-driven dynamic closed loop", async () => {
  const source = await readFile(
    new URL("../components/MechanicalClaw.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /function ClawClosedLinkage/);
  assert.match(source, /function FingerClosedLoopJoints/);
  assert.match(source, /const plungerY = useRef<number>/);
  assert.doesNotMatch(source, /closure\.current/);
  assert.match(source, /usePrismaticJoint/);
  assert.equal(source.match(/useRevoluteJoint\(/g)?.length, 3);
  assert.match(source, /computeAxialForceCommand/);
  assert.match(source, /plunger\.addForce\(plungerForce, true\)/);
  assert.match(
    source,
    /housing\.addForce\(housingReactionForce, true\)/,
  );
  assert.doesNotMatch(source, /configureMotor/);
  assert.doesNotMatch(source, /MotorModel/);
  // The commanded stroke is still measured from the open end stop.
  assert.match(
    source,
    /plungerY\.current - CLAW_GEOMETRY\.openPlungerY/,
  );
  assert.match(source, /function RockerLink/);
  assert.match(source, /function RockerLinkCollider/);
  assert.match(source, /function PlungerVisual/);
  assert.match(source, /function PlungerCollider/);
  assert.match(source, /function ClawFingerVisual/);
  assert.match(source, /function ClawFingerCollider/);
  assert.match(source, /const FINGER_PATH_SEGMENTS = 24/);
  assert.match(source, /linkage\.curve\.getPoints\(FINGER_PATH_SEGMENTS\)/);
  assert.match(source, /name="claw-plunger-collider"/);
  assert.match(source, /name=\{`claw-rocker-collider-\$\{index \+ 1\}`\}/);
  assert.match(source, /<PlungerVisual \/>/);
  assert.match(source, /<RockerLink index=\{index\} \/>/);
  assert.match(source, /<ClawFingerVisual index=\{index\} \/>/);
  assert.match(
    source,
    /useRevoluteJoint\(\s*housingRef as RefObject<RapierRigidBody>,\s*rockerRef/,
  );
  assert.match(
    source,
    /useRevoluteJoint\(\s*rockerRef as RefObject<RapierRigidBody>,\s*fingerRef/,
  );
  assert.match(
    source,
    /useRevoluteJoint\(\s*fingerRef as RefObject<RapierRigidBody>,\s*plungerRef/,
  );
  assert.doesNotMatch(source, /function ClawLinkageDriver/);
  assert.doesNotMatch(
    source,
    /type="kinematicPosition"[\s\S]{0,220}claw-(?:plunger|rocker|finger)-collider/,
  );
  assert.match(source, /interactionGroups\(\[2\], \[0\]\)/);
  assert.doesNotMatch(source, /interactionGroups\(\[2\], \[0, 2\]\)/);
});

test("housing seams use horizontal collars instead of vertical torus rings", async () => {
  const source = await readFile(
    new URL("../components/MechanicalClaw.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const HOUSING_COLLARS =/);
  assert.match(source, /HOUSING_COLLARS\.map/);
  assert.match(source, /collar\.radius/);
  assert.match(source, /collar\.height/);
  assert.doesNotMatch(source, /\{\[0\.4, 0\.195, 0\.035, -0\.19\]\.map/);
});

test("the housing uses one simple cylindrical collider", async () => {
  const source = await readFile(
    new URL("../components/MechanicalClaw.tsx", import.meta.url),
    "utf8",
  );
  const housingStart = source.indexOf('name="claw-solenoid-housing"');
  const visualStart = source.indexOf(
    '<group name="claw-render-meshes"',
    housingStart,
  );
  const housingColliders = source.slice(housingStart, visualStart);

  assert.ok(housingStart >= 0);
  assert.ok(visualStart > housingStart);
  assert.equal(housingColliders.match(/<CylinderCollider/g)?.length, 1);
  assert.match(
    housingColliders,
    /clawPartDimensions\.housing\.halfHeight/,
  );
  assert.match(
    housingColliders,
    /clawPartDimensions\.housing\.radius/,
  );
  assert.match(source, /const HOUSING_COLLIDER_CENTER_Y = 0\.09;/);
  assert.match(
    housingColliders,
    /position=\{\[0, HOUSING_COLLIDER_CENTER_Y, 0\]\}/,
  );
  assert.match(housingColliders, /mass=\{1\.02\}/);
  assert.match(
    housingColliders,
    /collisionGroups=\{HOUSING_COLLISION_GROUPS\}/,
  );
});
