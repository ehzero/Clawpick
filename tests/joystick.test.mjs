import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  clampJoystickOffset,
  getEightWayInput,
} from "../game/joystick.mjs";

const EPSILON = 1e-12;

test("pointer angles are quantized into eight equal-speed directions", () => {
  const directions = [
    { point: [10, 0], expected: [1, 0], index: 0 },
    { point: [10, 10], expected: [Math.SQRT1_2, Math.SQRT1_2], index: 1 },
    { point: [0, 10], expected: [0, 1], index: 2 },
    { point: [-10, 10], expected: [-Math.SQRT1_2, Math.SQRT1_2], index: 3 },
    { point: [-10, 0], expected: [-1, 0], index: 4 },
    { point: [-10, -10], expected: [-Math.SQRT1_2, -Math.SQRT1_2], index: 5 },
    { point: [0, -10], expected: [0, -1], index: 6 },
    { point: [10, -10], expected: [Math.SQRT1_2, -Math.SQRT1_2], index: 7 },
  ];

  for (const { point, expected, index } of directions) {
    const input = getEightWayInput(point[0], point[1]);
    assert.equal(input.index, index);
    assert.ok(Math.abs(input.x - expected[0]) < EPSILON);
    assert.ok(Math.abs(input.z - expected[1]) < EPSILON);
    assert.ok(Math.abs(Math.hypot(input.x, input.z) - 1) < EPSILON);
  }
});

test("the joystick keeps a neutral dead zone and clamps its visual travel", () => {
  assert.deepEqual(getEightWayInput(3, 4, 5), {
    x: 0,
    z: 0,
    index: -1,
  });
  assert.deepEqual(clampJoystickOffset(3, 4, 10), { x: 3, y: 4 });
  assert.deepEqual(clampJoystickOffset(30, 40, 10), { x: 6, y: 8 });
});

test("the control captures the pointer and updates direction while dragging", async () => {
  const source = await readFile(
    new URL("../components/Controls.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /DIRECTION_MARKERS/);
  assert.match(source, /setPointerCapture\(event\.pointerId\)/);
  assert.match(source, /onPointerMove=/);
  assert.match(source, /updateFromPointer/);
  assert.match(source, /releasePointerCapture\(pointerId\)/);
  assert.doesNotMatch(source, /onPointerLeave=/);
  assert.match(source, /magnitude > 1 \? 1 \/ magnitude : 1/);
});
