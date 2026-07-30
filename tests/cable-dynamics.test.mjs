import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  measureInextensibleCable,
  projectInextensibleCableVelocity,
} from "../game/cableDynamics.mjs";
import {
  CLAW_FLOOR_CLEARANCE,
  RETRACTED_CABLE_LENGTH,
  calculateMaximumCableLength,
} from "../game/cableTravel.mjs";
import {
  CLAW_GEOMETRY,
  getOpenClawLowestY,
} from "../game/clawKinematics.mjs";
import { PRIZE_DECK_FLOOR_Y } from "../game/machineDimensions.mjs";

const ZERO = { x: 0, y: 0, z: 0 };

test("the raised claw retracts almost all visible cable", async () => {
  const source = await readFile(
    new URL("../components/MechanicalClaw.tsx", import.meta.url),
    "utf8",
  );
  const attachmentY = Number(
    source.match(/const CLAW_ATTACHMENT_Y = ([\d.]+);/)?.[1],
  );

  assert.equal(RETRACTED_CABLE_LENGTH, 0.01);
  assert.ok(attachmentY >= 0.36);
  assert.match(
    source,
    /WIRE_EXIT_Y - RETRACTED_CABLE_LENGTH - CLAW_ATTACHMENT_Y/,
  );
});

test("the hoist cable starts at the guide exit instead of its solid center", async () => {
  const source = await readFile(
    new URL("../components/MechanicalClaw.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /const WIRE_EXIT_LOCAL_Y = -WIRE_GUIDE_HEIGHT \/ 2;/,
  );
  assert.match(
    source,
    /const WIRE_EXIT_Y = WIRE_GUIDE_CENTER_Y \+ WIRE_EXIT_LOCAL_Y;/,
  );
  assert.match(
    source,
    /rapier\.JointData\.rope\([\s\S]*?\{ x: 0, y: WIRE_EXIT_LOCAL_Y, z: 0 \}/,
  );
  assert.match(
    source,
    /const anchor = new THREE\.Vector3\([\s\S]*?WIRE_EXIT_Y/,
  );
  assert.match(
    source,
    /const CLAW_START_Y =\s*WIRE_EXIT_Y - RETRACTED_CABLE_LENGTH/,
  );
});

test("the trolley body render mesh is a cube", async () => {
  const source = await readFile(
    new URL("../components/MechanicalClaw.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const TROLLEY_BODY_SIZE = 0\.64;/);
  assert.match(source, /name="trolley-body-cube"/);
  assert.match(
    source,
    /args=\{\[\s*TROLLEY_BODY_SIZE,\s*TROLLEY_BODY_SIZE,\s*TROLLEY_BODY_SIZE,\s*\]\}/,
  );
});

test("the extended cable stops the open claw 1 cm above the prize floor", () => {
  const wireExitY = 3.8;
  const housingAttachmentY = 0.4;
  const openClawLowestY = getOpenClawLowestY(CLAW_GEOMETRY);
  const maximumLength = calculateMaximumCableLength({
    wireExitY,
    housingAttachmentY,
    openClawLowestY,
    floorY: PRIZE_DECK_FLOOR_Y,
  });
  const housingY =
    wireExitY - maximumLength - housingAttachmentY;
  const lowestWorldY = housingY + openClawLowestY;

  assert.ok(
    Math.abs(
      lowestWorldY -
        (PRIZE_DECK_FLOOR_Y + CLAW_FLOOR_CLEARANCE),
    ) < 1e-9,
  );
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
  assert.match(source, /const WIRE_GUIDE_RADIUS = 0\.22;/);
  assert.match(source, /const WIRE_GUIDE_HEIGHT = 0\.08;/);
  assert.match(source, /const CLAW_ATTACHMENT_Y = 0\.4;/);
  assert.match(
    source,
    /name="wire-exit-guide"[\s\S]*?name="wire-exit-guide-render-meshes"[\s\S]*?<cylinderGeometry[\s\S]*?WIRE_GUIDE_RADIUS,[\s\S]*?WIRE_GUIDE_RADIUS,[\s\S]*?WIRE_GUIDE_HEIGHT,[\s\S]*?<torusGeometry args=\{\[0\.17, 0\.05, 8, 24\]\}[\s\S]*?<CylinderCollider[\s\S]*?args=\{\[WIRE_GUIDE_HEIGHT \/ 2, WIRE_GUIDE_RADIUS\]\}[\s\S]*?collisionGroups=\{WIRE_GUIDE_COLLISION_GROUPS\}/,
  );
  assert.match(
    source,
    /name="wire-exit-guide-render-meshes" visible=\{!debug\}/,
  );
  assert.doesNotMatch(
    source,
    /<CylinderCollider[\s\S]{0,160}args=\{\[WIRE_GUIDE_HEIGHT \/ 2, WIRE_GUIDE_RADIUS\]\}[\s\S]{0,160}position=/,
  );
  assert.doesNotMatch(
    source,
    /position=\{\[0, 0\.455, 0\]\}|position=\{\[0, 0\.505, 0\]\}/,
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
