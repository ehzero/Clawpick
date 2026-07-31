import assert from "node:assert/strict";
import test from "node:test";
import {
  CHUTE_GUIDE,
  CHUTE_GUIDE_CENTER_Y,
  createChuteGuideColliders,
  createChuteGuideOutline,
} from "../game/chuteShell.mjs";
import { GLASS, measureWinding } from "../game/glassShell.mjs";

test("the outer ring is one thickness outside the inner one", () => {
  const outline = createChuteGuideOutline();

  assert.ok(
    Math.abs(
      outline.outerHalfWidth - outline.innerHalfWidth - CHUTE_GUIDE.thickness,
    ) < 1e-9,
  );
  assert.ok(
    Math.abs(
      outline.outerHalfDepth - outline.innerHalfDepth - CHUTE_GUIDE.thickness,
    ) < 1e-9,
  );
});

test("both rings are closed rectangles, so no corner can be left open", () => {
  const outline = createChuteGuideOutline();

  for (const [name, ring] of [
    ["outer", outline.outer],
    ["inner", outline.inner],
  ]) {
    assert.equal(ring.length, 4, `${name} ring is not a rectangle`);
  }
});

test("the outer ring winds outward and the inner one winds as a hole", () => {
  const outline = createChuteGuideOutline();

  // ExtrudeGeometry needs the hole wound against the shape, or the wall inverts.
  assert.ok(measureWinding(outline.outer) > 0, "outer ring is not counter-clockwise");
  assert.ok(measureWinding(outline.inner) < 0, "inner ring is not clockwise");
});

test("the guides keep the contact face the panels they replaced had", () => {
  const outline = createChuteGuideOutline();

  // The four loose panels sat at +-0.585 and were 35mm thick, so their inner
  // faces — the surface a prize touches — were at 0.5675. Converting them to one
  // tunnel and thinning them to the glass gauge must not move that face.
  assert.equal(outline.innerHalfWidth, 0.5675);
  assert.equal(outline.innerHalfDepth, 0.5675);
  assert.equal(CHUTE_GUIDE.height, 0.62);
  // The panels were centred at 0.42, which the tunnel reproduces from its base.
  assert.ok(Math.abs(CHUTE_GUIDE_CENTER_Y - 0.42) < 1e-9);
});

test("the guides are the same sheet gauge as the enclosure glass", () => {
  // Two literals had drifted 10mm apart for no mechanical reason. Reading one
  // from the other is what keeps them from drifting again.
  assert.equal(CHUTE_GUIDE.thickness, GLASS.thickness);
});

test("the barrier is four cuboids that overlap at every corner", () => {
  const colliders = createChuteGuideColliders();
  const outline = createChuteGuideOutline();

  assert.equal(colliders.length, 4, "Rapier has no hollow primitive to use here");

  const [minusX, plusX, minusZ, plusZ] = colliders;

  // Each wall reaches the far face of the perpendicular wall. The loose panels
  // stopped 2.5mm short of this and left a slot at each corner.
  assert.ok(
    minusX.halfExtents[2] >= outline.outerHalfDepth - 1e-9,
    "side walls do not span the full outer depth",
  );
  assert.ok(
    minusZ.halfExtents[0] >= outline.outerHalfWidth - 1e-9,
    "front and back do not span the full outer width",
  );

  // Contact faces sit on the acrylic's inner faces, not outside them.
  assert.ok(
    Math.abs(
      Math.abs(minusX.position[0]) -
        minusX.halfExtents[0] -
        outline.innerHalfWidth,
    ) < 1e-9,
  );
  assert.equal(plusX.position[0], -minusX.position[0]);
  assert.equal(plusZ.position[2], -minusZ.position[2]);

  for (const collider of colliders) {
    assert.ok(
      Math.abs(collider.position[1] - CHUTE_GUIDE_CENTER_Y) < 1e-9,
      "a wall is not centred on the guide height",
    );
  }
});
