import { CABINET } from "./machineDimensions.mjs";

/**
 * The tempered glass enclosure, as one closed rectangular tunnel rather than
 * four loose panels.
 *
 * Four separate panels left the corners open — the front panel stopped short of
 * the side panel and vice versa — and needed hand-picked `renderOrder` values to
 * stop the transparent sheets sorting against each other. A single extruded
 * outline has no corners to miss and nothing to sort against itself.
 *
 * The inner faces are the cabinet's interior, which is what the gantry's
 * clearance maths is measured against, so they are read from `CABINET` rather
 * than repeated here.
 */
export const GLASS = Object.freeze({
  thickness: 0.025,
  height: 3.78,
  /** Sits on the prize deck trim and stops below the top trim. */
  bottomY: 0.23,
});

/** Centre height of the shell, for callers positioning a single mesh. */
export const GLASS_CENTER_Y = GLASS.bottomY + GLASS.height / 2;

/**
 * Corner points of the shell, as an outer ring and the hole inside it. Both are
 * closed rectangles, so every corner meets by construction.
 *
 * Returned in shape space: `u` runs along the cabinet's width and `v` along its
 * depth. The caller extrudes along the remaining axis to stand the tunnel up.
 */
export function createGlassShellOutline({
  innerHalfWidth = CABINET.glassHalfWidth,
  innerHalfDepth = CABINET.glassHalfDepth,
  thickness = GLASS.thickness,
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
 * The barrier behind the glass.
 *
 * Rapier has no hollow primitive, and a convex hull of a tunnel is a solid box,
 * so the wall stays four cuboids on one fixed body — which is what a compound
 * shape is in Rapier anyway. What matters is that they come from the outline
 * above instead of their own literals, so the barrier and the pane a player sees
 * can never drift apart again.
 *
 * Only the contact face is pinned to the glass. The rest grows outward, away
 * from the play area: a barrier thick enough that a prize slammed into it cannot
 * pass through, without that thickness eating into the interior.
 */
export const GLASS_WALL = Object.freeze({
  thickness: 0.24,
  /** Runs past the glass at both ends to meet the prize deck and the ceiling. */
  bottomY: -0.15,
  topY: 4.35,
});

/**
 * Wall colliders for the enclosure, as half-extents and centres ready to hand
 * to `CuboidCollider`.
 *
 * The side walls span the full outer depth and the front and back the full outer
 * width, so the four overlap at the corners rather than leaving a slot there.
 */
export function createGlassWallColliders({
  thickness = GLASS_WALL.thickness,
  bottomY = GLASS_WALL.bottomY,
  topY = GLASS_WALL.topY,
  ...outlineOverrides
} = {}) {
  const { innerHalfWidth, innerHalfDepth } =
    createGlassShellOutline(outlineOverrides);

  const halfThickness = thickness / 2;
  const halfHeight = (topY - bottomY) / 2;
  const centreY = (topY + bottomY) / 2;
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

/** Signed area of a closed polygon; the sign tells you its winding. */
export function measureWinding(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}
