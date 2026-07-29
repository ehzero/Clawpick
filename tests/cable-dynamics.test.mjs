import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  bodyVelocityForAttachmentTarget,
  computeSuspensionTiltTorque,
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
  assert.match(source, /enabledRotations=\{\[true, true, true\]\}/);
  assert.match(source, /computeSuspensionTiltTorque/);
  assert.match(source, /housing\.addTorque\(tiltControl\.torque, true\)/);
  assert.doesNotMatch(
    source,
    /enabledRotations=\{\[false, true, false\]\}/,
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
    attachmentVelocity: { x: 0, y: -0.5, z: 0 },
    targetLengthRate: -1.25,
  });

  assert.ok(
    Math.abs(
      radialRate(direction, ZERO, projected.velocity) - (-1.25),
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
    attachmentVelocity: { x: 2.4, y: -0.8, z: -1.1 },
    targetLengthRate: 0,
  });

  assert.equal(projected.velocity.x, 2.4);
  assert.equal(projected.velocity.z, -1.1);
  assert.equal(projected.velocity.y, 0);
});

test("attachment projection preserves rotational point velocity", () => {
  const bodyVelocity = bodyVelocityForAttachmentTarget({
    bodyVelocity: { x: 1, y: 0, z: 0 },
    attachmentVelocity: { x: 1.4, y: 0, z: -0.3 },
    targetAttachmentVelocity: { x: 0.2, y: -0.5, z: 0.1 },
  });

  assert.ok(Math.abs(bodyVelocity.x + 0.2) < 1e-9);
  assert.equal(bodyVelocity.y, -0.5);
  assert.equal(bodyVelocity.z, 0.4);
});

test("soft tilt control limits pitch and roll without restoring yaw", () => {
  const angle = Math.PI / 6;
  const tilted = computeSuspensionTiltTorque({
    bodyUp: { x: 0, y: Math.cos(angle), z: Math.sin(angle) },
    angularVelocity: { x: 0, y: 4, z: 0 },
    swingDamping: 0.8,
  });

  assert.ok(Math.abs(tilted.tiltAngle - angle) < 1e-9);
  assert.ok(tilted.torque.x < 0);
  assert.equal(tilted.torque.y, 0);
  assert.ok(Math.abs(tilted.torque.z) < 1e-9);

  const upright = computeSuspensionTiltTorque({
    bodyUp: { x: 0, y: 1, z: 0 },
    angularVelocity: { x: 1, y: 3, z: -1 },
    swingDamping: 0.8,
  });
  assert.ok(upright.torque.x < 0);
  assert.equal(upright.torque.y, 0);
  assert.ok(upright.torque.z > 0);
});
