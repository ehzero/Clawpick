const DEG = Math.PI / 180;

export const CLAW_GEOMETRY = Object.freeze({
  hingeRadius: 0.31,
  hingeY: -0.32,
  jointsPerFinger: 1,
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
  openAngle: 50 * DEG,
  closedAngle: 12 * DEG,
  minimumAngle: 10 * DEG,
  maximumAngle: 54 * DEG,
  drivePinRadius: 0.12,
  driveSlotDirection: Object.freeze({
    r: Math.cos(158 * DEG),
    y: Math.sin(158 * DEG),
  }),
  driveTailLength: 0.245,
  driveSlotStart: 0.165,
  driveSlotEnd: 0.235,
  bracketTop: Object.freeze({ r: 0.23, y: 0.12 }),
});

export function clampClosure(value) {
  return Math.min(1, Math.max(0, value));
}

export function smoothClosure(value) {
  const t = clampClosure(value);
  return t * t * (3 - 2 * t);
}

/**
 * Solves the shared plunger and direct pin-in-slot pose in a radial plane.
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
  const driveDirection = {
    r:
      Math.cos(angle) * geometry.driveSlotDirection.r -
      Math.sin(angle) * geometry.driveSlotDirection.y,
    y:
      Math.sin(angle) * geometry.driveSlotDirection.r +
      Math.cos(angle) * geometry.driveSlotDirection.y,
  };
  const driveTravel =
    (geometry.drivePinRadius - hinge.r) / driveDirection.r;
  const plungerY = hinge.y + driveDirection.y * driveTravel;
  const drivePin = { r: geometry.drivePinRadius, y: plungerY };

  return {
    closure: t,
    angle,
    hinge,
    tip,
    driveDirection,
    driveTravel,
    drivePin,
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
