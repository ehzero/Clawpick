import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  measureInextensibleCable,
  projectInextensibleCableVelocity,
} from "../game/cableDynamics.mjs";

const ZERO = { x: 0, y: 0, z: 0 };

test("the raised claw retracts almost all visible cable", async () => {
  const source = await readFile(
    new URL("../components/MechanicalClaw.tsx", import.meta.url),
    "utf8",
  );
  const minimumLength = Number(
    source.match(/const MIN_CABLE_LENGTH = ([\d.]+);/)?.[1],
  );
  const attachmentY = Number(
    source.match(/const CLAW_ATTACHMENT_Y = ([\d.]+);/)?.[1],
  );

  assert.ok(minimumLength <= 0.05);
  assert.ok(attachmentY >= 0.36);
});

function radialRate(direction, anchorVelocity, attachmentVelocity) {
  return (
    (anchorVelocity.x - attachmentVelocity.x) * direction.x +
    (anchorVelocity.y - attachmentVelocity.y) * direction.y +
    (anchorVelocity.z - attachmentVelocity.z) * direction.z
  );
}

test("the cable reports slack and overrun without a spring force", () => {
  const slack = measureInextensibleCable({
    anchor: ZERO,
    attachment: { x: 0, y: -0.8, z: 0 },
    targetLength: 1,
  });
  assert.equal(slack.overrun, 0);
  assert.ok(Math.abs(slack.slack - 0.2) < 1e-9);

  const overrun = measureInextensibleCable({
    anchor: ZERO,
    attachment: { x: 0, y: -1.04, z: 0 },
    targetLength: 1,
  });
  assert.equal(overrun.slack, 0);
  assert.ok(Math.abs(overrun.overrun - 0.04) < 1e-9);
});

test("winch speed is imposed directly without elastic oscillation", () => {
  const direction = { x: 0, y: 1, z: 0 };
  const projected = projectInextensibleCableVelocity({
    direction,
    anchorVelocity: ZERO,
    bodyLinearVelocity: { x: 0, y: -0.5, z: 0 },
    attachmentVelocity: { x: 0, y: -0.5, z: 0 },
    targetLengthRate: -1.25,
  });

  assert.ok(
    Math.abs(
      radialRate(
        direction,
        ZERO,
        projected.attachmentVelocity,
      ) - (-1.25),
    ) < 1e-9,
  );
});

test("horizontal trolley offset produces a measurable pendulum angle", () => {
  const constraint = measureInextensibleCable({
    anchor: { x: 0.5, y: 0, z: 0 },
    attachment: { x: 0, y: -1, z: 0 },
    targetLength: 1,
  });

  assert.ok(constraint.swingAngle > 20);
});

test("radial projection preserves tangential swing velocity", () => {
  const direction = { x: 0, y: 1, z: 0 };
  const projected = projectInextensibleCableVelocity({
    direction,
    anchorVelocity: ZERO,
    bodyLinearVelocity: { x: 2.4, y: -0.8, z: -1.1 },
    attachmentVelocity: { x: 2.4, y: -0.8, z: -1.1 },
    targetLengthRate: 0,
  });

  assert.equal(projected.bodyLinearVelocity.x, 2.4);
  assert.equal(projected.bodyLinearVelocity.z, -1.1);
  assert.equal(projected.bodyLinearVelocity.y, 0);
});

test("cable projection does not copy attachment rotation into body velocity", () => {
  const direction = { x: 1, y: 0, z: 0 };
  const projected = projectInextensibleCableVelocity({
    direction,
    anchorVelocity: ZERO,
    bodyLinearVelocity: ZERO,
    attachmentVelocity: { x: 2, y: 0, z: 0 },
    targetLengthRate: 0,
  });

  assert.equal(projected.radialCorrection, -2);
  assert.equal(projected.attachmentVelocity.x, 0);
  assert.equal(projected.bodyLinearVelocity.x, -2);
});

test("the suspended claw keeps all body rotation axes physical", async () => {
  const source = await readFile(
    new URL("../components/MechanicalClaw.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /enabledRotations=\{\[true, true, true\]\}/,
  );
  assert.match(
    source,
    /JointData\.rope\([\s\S]*?\{ x: 0, y: CLAW_ATTACHMENT_Y, z: 0 \}/,
  );
  assert.match(
    source,
    /HOUSING_COLLISION_GROUPS = interactionGroups\(\[1\], \[0, 4\]\)/,
  );
  assert.match(
    source,
    /WIRE_GUIDE_COLLISION_GROUPS = interactionGroups\(\[4\], \[1\]\)/,
  );
  assert.match(
    source,
    /name="winch-rope-anchor"[\s\S]*?<CylinderCollider[\s\S]*?args=\{\[0\.02, 0\.22\]\}[\s\S]*?position=\{\[0, 0\.02, 0\]\}[\s\S]*?collisionGroups=\{WIRE_GUIDE_COLLISION_GROUPS\}/,
  );
  assert.match(
    source,
    /position=\{\[0, 3\.84, 0\]\}[\s\S]*?<cylinderGeometry args=\{\[0\.22, 0\.22, 0\.08, 24\]\}/,
  );
  assert.match(
    source,
    /ropeJoint\.current\.setContactsEnabled\(true\)/,
  );
  assert.match(
    source,
    /bodyLinearVelocity: housing\.linvel\(\)/,
  );
  assert.match(
    source,
    /projectedVelocity\.bodyLinearVelocity/,
  );
  assert.doesNotMatch(
    source,
    /setAngvel|applyTorqueImpulse|addTorque/,
  );
});
