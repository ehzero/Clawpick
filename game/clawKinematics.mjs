const DEG = Math.PI / 180;

export const CLAW_GEOMETRY = Object.freeze({
  rigidSegmentsPerFinger: 1,
  linkageJointsPerFinger: 2,
  curvePoints: Object.freeze([
    Object.freeze({ r: 0, y: 0 }),
    Object.freeze({ r: 0.01, y: -0.12 }),
    Object.freeze({ r: -0.02, y: -0.28 }),
    Object.freeze({ r: -0.1, y: -0.48 }),
    Object.freeze({ r: -0.23, y: -0.67 }),
    Object.freeze({ r: -0.37, y: -0.78 }),
  ]),
  fingerWidth: 0.082,
  fingerThickness: 0.032,
  tineRadius: 0.038,
  scoopRadius: 0.065,
  minimumAngle: 10 * DEG,
  maximumAngle: 54 * DEG,
  housingPivot: Object.freeze({ r: 0.23, y: 0.12 }),
  openFingerHinge: Object.freeze({ r: 0.31, y: -0.32 }),
  plungerRadius: 0.12,
  openPlungerY: -0.42,
  closedPlungerY: -0.278,
  fingerPlungerDirection: Object.freeze({
    r: Math.cos(158 * DEG),
    y: Math.sin(158 * DEG),
  }),
  rockerLength: Math.hypot(0.31 - 0.23, -0.32 - 0.12),
  fingerPlungerLength: Math.hypot(0.12 - 0.31, -0.42 + 0.32),
});

export function clampClosure(value) {
  return Math.min(1, Math.max(0, value));
}

export function smoothClosure(value) {
  const t = clampClosure(value);
  return t * t * (3 - 2 * t);
}

/**
 * Solves the shared plunger, rocker link, and rigid finger in a radial plane.
 * `r` points out from the claw centre and `y` points upward.
 */
export function getClawPose(closure) {
  const geometry = CLAW_GEOMETRY;
  const t = smoothClosure(closure);
  const housingPivot = geometry.housingPivot;
  const plungerY =
    geometry.openPlungerY +
    (geometry.closedPlungerY - geometry.openPlungerY) * t;
  const plungerPin = { r: geometry.plungerRadius, y: plungerY };
  const deltaR = plungerPin.r - housingPivot.r;
  const deltaY = plungerPin.y - housingPivot.y;
  const pivotDistance = Math.hypot(deltaR, deltaY);
  const along =
    (geometry.rockerLength * geometry.rockerLength -
      geometry.fingerPlungerLength * geometry.fingerPlungerLength +
      pivotDistance * pivotDistance) /
    (2 * pivotDistance);
  const perpendicular = Math.sqrt(
    Math.max(
      0,
      geometry.rockerLength * geometry.rockerLength - along * along,
    ),
  );
  const baseR = housingPivot.r + (along * deltaR) / pivotDistance;
  const baseY = housingPivot.y + (along * deltaY) / pivotDistance;
  const hinge = {
    r: baseR - (perpendicular * deltaY) / pivotDistance,
    y: baseY + (perpendicular * deltaR) / pivotDistance,
  };
  const fingerRootAngle = Math.atan2(
    plungerPin.y - hinge.y,
    plungerPin.r - hinge.r,
  );
  const localRootAngle = Math.atan2(
    geometry.fingerPlungerDirection.y,
    geometry.fingerPlungerDirection.r,
  );
  let angle = fingerRootAngle - localRootAngle;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  const rockerAngle = Math.atan2(
    hinge.y - housingPivot.y,
    hinge.r - housingPivot.r,
  );
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

  return {
    closure: t,
    angle,
    rockerAngle,
    housingPivot,
    hinge,
    tip,
    plungerPin,
    plungerY,
    tipSeparation: Math.sqrt(3) * Math.abs(tip.r),
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
