const DEG = Math.PI / 180;

export const CLAW_GEOMETRY = Object.freeze({
  hingeRadius: 0.27,
  hingeY: -0.16,
  jointsPerFinger: 1,
  curvePoints: Object.freeze([
    Object.freeze({ r: 0, y: 0 }),
    Object.freeze({ r: -0.03, y: -0.23 }),
    Object.freeze({ r: -0.16, y: -0.52 }),
    Object.freeze({ r: -0.37, y: -0.78 }),
  ]),
  tineRadius: 0.05,
  scoopRadius: 0.07,
  openAngle: 50 * DEG,
  closedAngle: 14 * DEG,
  minimumAngle: 12 * DEG,
  maximumAngle: 54 * DEG,
  connectorRadius: 0.1,
  connectorLength: 0.42,
  connectorPoint: Object.freeze({ r: -0.03, y: -0.23 }),
});

export function clampClosure(value) {
  return Math.min(1, Math.max(0, value));
}

export function smoothClosure(value) {
  const t = clampClosure(value);
  return t * t * (3 - 2 * t);
}

/**
 * Solves the shared plunger/linkage pose in a two-dimensional radial plane.
 * `r` points out from the claw centre and `y` points upward.
 */
export function getClawPose(closure) {
  const geometry = CLAW_GEOMETRY;
  const t = smoothClosure(closure);
  const angle =
    geometry.openAngle +
    (geometry.closedAngle - geometry.openAngle) * t;
  const hinge = { r: geometry.hingeRadius, y: geometry.hingeY };
  const rotatePoint = (point) => ({
    r:
      hinge.r +
      Math.cos(angle) * point.r -
      Math.sin(angle) * point.y,
    y:
      hinge.y +
      Math.sin(angle) * point.r +
      Math.cos(angle) * point.y,
  });
  const tip = rotatePoint(
    geometry.curvePoints[geometry.curvePoints.length - 1],
  );
  const linkEnd = rotatePoint(geometry.connectorPoint);
  const horizontal = linkEnd.r - geometry.connectorRadius;
  const vertical = Math.sqrt(
    Math.max(
      0,
      geometry.connectorLength * geometry.connectorLength -
        horizontal * horizontal,
    ),
  );
  const plungerY = linkEnd.y + vertical;
  const linkStart = { r: geometry.connectorRadius, y: plungerY };

  return {
    closure: t,
    angle,
    hinge,
    tip,
    linkStart,
    linkEnd,
    plungerY,
    tipSeparation: Math.sqrt(3) * Math.abs(tip.r),
    linkLength: Math.hypot(
      linkEnd.r - linkStart.r,
      linkEnd.y - linkStart.y,
    ),
  };
}

export function sampleClawClearance(samples = 101) {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < samples; index += 1) {
    const pose = getClawPose(index / Math.max(1, samples - 1));
    const clearance =
      pose.tipSeparation - CLAW_GEOMETRY.scoopRadius * 2;
    minimum = Math.min(minimum, clearance);
  }
  return minimum;
}
