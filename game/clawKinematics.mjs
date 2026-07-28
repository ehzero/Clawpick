const DEG = Math.PI / 180;

export const CLAW_GEOMETRY = Object.freeze({
  hingeRadius: 0.27,
  hingeY: -0.16,
  proximalLength: 0.42,
  distalLength: 0.47,
  tineRadius: 0.05,
  scoopRadius: 0.07,
  bendAngle: -48 * DEG,
  openAngle: 50 * DEG,
  closedAngle: 13 * DEG,
  minimumAngle: 10 * DEG,
  maximumAngle: 54 * DEG,
  connectorRadius: 0.1,
  connectorLength: 0.42,
  connectorTineOffset: 0.24,
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
  const distalAngle = angle + geometry.bendAngle;
  const hinge = { r: geometry.hingeRadius, y: geometry.hingeY };
  const knee = {
    r: hinge.r + Math.sin(angle) * geometry.proximalLength,
    y: hinge.y - Math.cos(angle) * geometry.proximalLength,
  };
  const tip = {
    r: knee.r + Math.sin(distalAngle) * geometry.distalLength,
    y: knee.y - Math.cos(distalAngle) * geometry.distalLength,
  };
  const linkEnd = {
    r: hinge.r + Math.sin(angle) * geometry.connectorTineOffset,
    y: hinge.y - Math.cos(angle) * geometry.connectorTineOffset,
  };
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
    distalAngle,
    hinge,
    knee,
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
