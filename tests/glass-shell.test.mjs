import assert from "node:assert/strict";
import test from "node:test";
import {
  GLASS,
  GLASS_CENTER_Y,
  GLASS_WALL,
  createGlassShellOutline,
  createGlassWallColliders,
  measureWinding,
} from "../game/glassShell.mjs";
import { CABINET } from "../game/machineDimensions.mjs";

test("the shell's inner faces are the cabinet interior the gantry is measured against", () => {
  const outline = createGlassShellOutline();

  // The gantry keeps its wheels inboard of these, so the two must not drift.
  assert.equal(outline.innerHalfWidth, CABINET.glassHalfWidth);
  assert.equal(outline.innerHalfDepth, CABINET.glassHalfDepth);
});

test("the outer ring is one thickness outside the inner one", () => {
  const outline = createGlassShellOutline();

  assert.ok(
    Math.abs(outline.outerHalfWidth - outline.innerHalfWidth - GLASS.thickness) <
      1e-9,
  );
  assert.ok(
    Math.abs(outline.outerHalfDepth - outline.innerHalfDepth - GLASS.thickness) <
      1e-9,
  );
});

test("both rings are closed rectangles, so no corner can be left open", () => {
  const outline = createGlassShellOutline();

  for (const [name, ring] of [
    ["outer", outline.outer],
    ["inner", outline.inner],
  ]) {
    assert.equal(ring.length, 4, `${name} ring should have four corners`);

    // Every edge is axis-aligned and every corner is shared by two edges, which
    // is what the four loose panels could not guarantee — they stopped short of
    // each other and left a slot at all four corners.
    for (let index = 0; index < ring.length; index += 1) {
      const [x1, y1] = ring[index];
      const [x2, y2] = ring[(index + 1) % ring.length];
      const axisAligned = x1 === x2 || y1 === y2;
      assert.ok(axisAligned, `${name} edge ${index} is not axis-aligned`);
      assert.ok(
        Math.abs(x2 - x1) + Math.abs(y2 - y1) > 0,
        `${name} edge ${index} has zero length`,
      );
    }
  }
});

test("the hole winds opposite to the outline, as an extruded hole must", () => {
  const outline = createGlassShellOutline();
  const outer = measureWinding(outline.outer);
  const inner = measureWinding(outline.inner);

  assert.ok(outer > 0, "outer ring should wind counter-clockwise");
  assert.ok(inner < 0, "the hole should wind clockwise");
});

test("the shell spans the same height the four panels did", () => {
  // Previously four boxes 3.78 tall centred on y = 2.12.
  assert.equal(GLASS.height, 3.78);
  assert.ok(Math.abs(GLASS_CENTER_Y - 2.12) < 1e-9);
  assert.ok(GLASS.bottomY > 0, "it stands on the deck rather than through it");
});

/** Inner face of each wall, as a signed distance along the axis it blocks. */
function measureWallFaces() {
  return createGlassWallColliders().map(({ halfExtents, position }) => {
    const axis = halfExtents[0] < halfExtents[2] ? 0 : 2;
    const outward = Math.sign(position[axis]);
    return { axis, face: position[axis] - outward * halfExtents[axis] };
  });
}

test("every wall stops exactly at the pane it sits behind", () => {
  const outline = createGlassShellOutline();

  // The old hand-written literals had drifted both ways: the sides stopped
  // 47.5 mm outside the pane, letting a prize sink into the glass, and the front
  // and back stopped 12.5 mm inside it, holding a prize short of glass it never
  // reached. Deriving both from one outline is what rules that out.
  for (const { axis, face } of measureWallFaces()) {
    const pane = axis === 0 ? outline.innerHalfWidth : outline.innerHalfDepth;
    assert.ok(
      Math.abs(Math.abs(face) - pane) < 1e-9,
      `wall on axis ${axis} sits at ${face}, not at the pane at ${pane}`,
    );
  }
});

test("the barrier is thick enough to stop a prize, growing away from the play area", () => {
  for (const { axis, halfExtents, position } of createGlassWallColliders().map(
    (wall) => ({
      ...wall,
      axis: wall.halfExtents[0] < wall.halfExtents[2] ? 0 : 2,
    }),
  )) {
    // Thickness is the barrier's, not the pane's — a 25 mm collider would let a
    // slammed prize tunnel through.
    assert.ok(halfExtents[axis] * 2 > GLASS.thickness * 4);
    assert.ok(
      Math.abs(halfExtents[axis] * 2 - GLASS_WALL.thickness) < 1e-9,
      "the wall should be exactly one barrier thickness",
    );
    // Pinned at the pane and thick outward means the centre is further out.
    assert.ok(Math.abs(position[axis]) > 0);
  }
});

test("the four walls overlap at the corners instead of leaving a slot", () => {
  const outline = createGlassShellOutline();
  const walls = createGlassWallColliders();

  for (const { halfExtents, position } of walls) {
    const blocked = halfExtents[0] < halfExtents[2] ? 0 : 2;
    const along = blocked === 0 ? 2 : 0;
    const reach = blocked === 0 ? outline.innerHalfDepth : outline.innerHalfWidth;

    // Each wall runs past the far face of the wall it meets, so a prize cannot
    // squeeze out through a corner the way it could between four loose panels.
    assert.ok(
      halfExtents[along] >= reach + GLASS_WALL.thickness / 2,
      `wall at ${position} stops short of the corner`,
    );
  }
});

test("the walls reach past the glass to meet the deck and the ceiling", () => {
  // The pane spans 0.23–4.01; the barrier has to hand over to the prize deck
  // below and the ceiling collider above rather than ending with the glass.
  assert.ok(GLASS_WALL.bottomY < GLASS.bottomY);
  assert.ok(GLASS_WALL.topY > GLASS.bottomY + GLASS.height);

  for (const { halfExtents, position } of createGlassWallColliders()) {
    assert.ok(Math.abs(position[1] - halfExtents[1] - GLASS_WALL.bottomY) < 1e-9);
    assert.ok(Math.abs(position[1] + halfExtents[1] - GLASS_WALL.topY) < 1e-9);
  }
});

test("a thicker pane moves the barrier with it", () => {
  // The drift this replaced came from the walls not being able to hear about a
  // change like this one.
  const walls = createGlassWallColliders({ innerHalfWidth: 3.2 });
  const sides = walls.filter(
    ({ halfExtents }) => halfExtents[0] < halfExtents[2],
  );

  assert.equal(sides.length, 2);
  for (const { halfExtents, position } of sides) {
    assert.ok(Math.abs(Math.abs(position[0]) - halfExtents[0] - 3.2) < 1e-9);
  }
});

test("a thicker pane grows outward and leaves the interior alone", () => {
  const thick = createGlassShellOutline({ thickness: 0.1 });

  assert.equal(thick.innerHalfWidth, CABINET.glassHalfWidth);
  assert.equal(thick.innerHalfDepth, CABINET.glassHalfDepth);
  assert.ok(thick.outerHalfWidth > createGlassShellOutline().outerHalfWidth);
});
