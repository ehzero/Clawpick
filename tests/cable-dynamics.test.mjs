import assert from "node:assert/strict";
import test from "node:test";
import {
  measureInextensibleCable,
  projectInextensibleCableVelocity,
} from "../game/cableDynamics.mjs";

const ZERO = { x: 0, y: 0, z: 0 };

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
