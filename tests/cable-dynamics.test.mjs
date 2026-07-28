import assert from "node:assert/strict";
import test from "node:test";
import { computeCableConstraint } from "../game/cableDynamics.mjs";

const ZERO = { x: 0, y: 0, z: 0 };

test("the cable only pulls and never pushes a slack claw", () => {
  const slack = computeCableConstraint({
    anchor: ZERO,
    attachment: { x: 0, y: -0.8, z: 0 },
    anchorVelocity: ZERO,
    attachmentVelocity: ZERO,
    targetLength: 1,
    stiffness: 560,
    damping: 46,
  });
  assert.equal(slack.tension, 0);
  assert.deepEqual(slack.force, ZERO);

  const movingWhileSlack = computeCableConstraint({
    anchor: ZERO,
    attachment: { x: 0, y: -0.8, z: 0 },
    anchorVelocity: ZERO,
    attachmentVelocity: { x: 0, y: -4, z: 0 },
    targetLength: 1,
    stiffness: 560,
    damping: 46,
  });
  assert.equal(movingWhileSlack.tension, 0);
});

test("falling away from the trolley increases cable tension", () => {
  const still = computeCableConstraint({
    anchor: ZERO,
    attachment: { x: 0, y: -1.04, z: 0 },
    anchorVelocity: ZERO,
    attachmentVelocity: ZERO,
    targetLength: 1,
    stiffness: 560,
    damping: 46,
  });
  const falling = computeCableConstraint({
    anchor: ZERO,
    attachment: { x: 0, y: -1.04, z: 0 },
    anchorVelocity: ZERO,
    attachmentVelocity: { x: 0, y: -0.5, z: 0 },
    targetLength: 1,
    stiffness: 560,
    damping: 46,
  });

  assert.ok(falling.tension > still.tension);
  assert.ok(falling.force.y > 0);
});

test("horizontal trolley offset produces a measurable pendulum angle", () => {
  const constraint = computeCableConstraint({
    anchor: { x: 0.5, y: 0, z: 0 },
    attachment: { x: 0, y: -1, z: 0 },
    anchorVelocity: { x: 1, y: 0, z: 0 },
    attachmentVelocity: ZERO,
    targetLength: 1,
    stiffness: 560,
    damping: 46,
  });

  assert.ok(constraint.swingAngle > 20);
  assert.ok(constraint.force.x > 0);
});
