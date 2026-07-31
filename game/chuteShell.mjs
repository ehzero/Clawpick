/**
 * The prize chute's acrylic guides, as one closed rectangular tunnel rather than
 * four loose panels.
 *
 * The four panels each spanned `1.2` across while the tunnel they formed measured
 * `1.205` outside, so every corner was left with a 2.5mm slot — the same defect
 * the glass enclosure carried before it became a single extrusion, and the same
 * fix. A single extruded outline has no corner to miss, and one transparent mesh
 * has nothing to sort against itself.
 *
 * The ring arithmetic is deliberately not shared with `glassShell.mjs`. That
 * module's inner faces are read from `CABINET` because the gantry's clearance is
 * measured against them; these are pinned to the chute mouth instead. The two
 * have different sources and only the algebra looks alike.
 */

import { GLASS } from "./glassShell.mjs";

/**
 * As-built guide dimensions. The chute mouth's plate and trim are laid out in the
 * scene rather than in `machineDimensions.mjs`, so there is no shared constant to
 * derive the extents from — they are the panel values the guides already had.
 *
 * Thickness is the exception: the guides are the same transparent sheet stock as
 * the enclosure, so it reads from `GLASS` instead of repeating a literal that had
 * drifted 10mm thicker than the glass for no mechanical reason. Only the outer
 * face moves — the inner face a prize touches stays where the panels put it.
 */
export const CHUTE_GUIDE = Object.freeze({
  thickness: GLASS.thickness,
  height: 0.62,
  /** Sits above the chute's dark base plate and stops below the pink trim. */
  bottomY: 0.11,
  /** Inner faces: the surface a falling prize actually touches. */
  innerHalfWidth: 0.5675,
  innerHalfDepth: 0.5675,
});

/** Centre height of the guides, for callers positioning a single mesh. */
export const CHUTE_GUIDE_CENTER_Y =
  CHUTE_GUIDE.bottomY + CHUTE_GUIDE.height / 2;

/**
 * Corner points of the guides, as an outer ring and the hole inside it. Both are
 * closed rectangles, so every corner meets by construction.
 *
 * Returned in shape space: `u` runs along the chute's width and `v` along its
 * depth. The caller extrudes along the remaining axis to stand the tunnel up.
 */
export function createChuteGuideOutline({
  innerHalfWidth = CHUTE_GUIDE.innerHalfWidth,
  innerHalfDepth = CHUTE_GUIDE.innerHalfDepth,
  thickness = CHUTE_GUIDE.thickness,
} = {}) {
  const outerHalfWidth = innerHalfWidth + thickness;
  const outerHalfDepth = innerHalfDepth + thickness;

  return {
    innerHalfWidth,
    innerHalfDepth,
    outerHalfWidth,
    outerHalfDepth,
    // Counter-clockwise, so the extruded wall faces outward.
    outer: [
      [-outerHalfWidth, -outerHalfDepth],
      [outerHalfWidth, -outerHalfDepth],
      [outerHalfWidth, outerHalfDepth],
      [-outerHalfWidth, outerHalfDepth],
    ],
    // Clockwise, the winding a hole needs.
    inner: [
      [-innerHalfWidth, -innerHalfDepth],
      [-innerHalfWidth, innerHalfDepth],
      [innerHalfWidth, innerHalfDepth],
      [innerHalfWidth, -innerHalfDepth],
    ],
  };
}

/**
 * Barrier for the guides, as half-extents and centres ready to hand to
 * `CuboidCollider`, in chute-local coordinates.
 *
 * Rapier has no hollow primitive and a convex hull of a tunnel is a solid box, so
 * this stays four cuboids — which is what a compound shape is in Rapier anyway.
 * Unlike the enclosure's barrier these are the pane itself rather than a thicker
 * wall behind it: a prize dropping into the chute only grazes them, and anything
 * thicker would eat into a mouth barely wider than a prize.
 *
 * The side walls span the full outer depth and the front and back the full outer
 * width, so the four overlap at the corners rather than leaving the slot the
 * loose panels left there.
 */
export function createChuteGuideColliders({
  thickness = CHUTE_GUIDE.thickness,
  height = CHUTE_GUIDE.height,
  bottomY = CHUTE_GUIDE.bottomY,
  ...outlineOverrides
} = {}) {
  const { innerHalfWidth, innerHalfDepth } = createChuteGuideOutline({
    thickness,
    ...outlineOverrides,
  });

  const halfThickness = thickness / 2;
  const halfHeight = height / 2;
  const centreY = bottomY + halfHeight;
  // Reach to the far face of the perpendicular wall so the corners are covered.
  const spanHalfWidth = innerHalfWidth + thickness;
  const spanHalfDepth = innerHalfDepth + thickness;

  const side = (x) => ({
    halfExtents: [halfThickness, halfHeight, spanHalfDepth],
    position: [x, centreY, 0],
  });
  const face = (z) => ({
    halfExtents: [spanHalfWidth, halfHeight, halfThickness],
    position: [0, centreY, z],
  });

  return [
    side(-(innerHalfWidth + halfThickness)),
    side(innerHalfWidth + halfThickness),
    face(-(innerHalfDepth + halfThickness)),
    face(innerHalfDepth + halfThickness),
  ];
}
