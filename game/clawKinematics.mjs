const DEG = Math.PI / 180;

const BASE_FINGER_LENGTH = 0.9765105457;
export const FINGER_COLLIDER_END_OVERLAP = 0.0015;
const BASE_CURVE_POINTS = [
  { r: 0, y: 0 },
  { r: -0.0174, y: -0.1239 },
  { r: -0.0348, y: -0.2478 },
  { r: -0.0522, y: -0.3717 },
  { r: -0.0702, y: -0.4995 },
  { r: -0.1625, y: -0.6044 },
  { r: -0.2871, y: -0.6383 },
  { r: -0.5041, y: -0.6974 },
];

export function createClawGeometry(specs = {}) {
  const fingerLength =
    Number.isFinite(specs.fingerLength) && specs.fingerLength > 0
      ? specs.fingerLength
      : BASE_FINGER_LENGTH;
  const fingerScale = fingerLength / BASE_FINGER_LENGTH;
  const curvePoints = BASE_CURVE_POINTS.map((point) =>
    Object.freeze({
      r: point.r * fingerScale,
      y: point.y * fingerScale,
    }),
  );

  return Object.freeze({
    rigidSegmentsPerFinger: 1,
    linkageJointsPerFinger: 2,
    fingerBendCount: 2,
    fingerStraightEndIndex: 3,
    fingerCurveEndIndex: 6,
    curvePoints: Object.freeze(curvePoints),
    fingerLength,
    fingerWidth: specs.linkWidth ?? specs.fingerWidth ?? 0.082,
    fingerThickness:
      specs.linkThickness ?? specs.fingerThickness ?? 0.032,
    fingerTaperStart: specs.fingerTaperStart ?? 0.77,
    fingerTipWidthScale: specs.fingerTipWidthScale ?? 0.62,
    minimumAngle: 10 * DEG,
    maximumAngle: 54 * DEG,
    housingPivot: Object.freeze({ r: 0.23, y: 0.12 }),
    openFingerHinge: Object.freeze({ r: 0.31, y: -0.32 }),
    plungerRadius: 0.12,
    openPlungerY: -0.42,
    closedPlungerY: -0.298,
    fingerPlungerDirection: Object.freeze({
      r: Math.cos(158 * DEG),
      y: Math.sin(158 * DEG),
    }),
    rockerLength: Math.hypot(0.31 - 0.23, -0.32 - 0.12),
    fingerPlungerLength: Math.hypot(0.12 - 0.31, -0.42 + 0.32),
  });
}

export const CLAW_GEOMETRY = createClawGeometry();

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
export function getClawPoseFromPlungerY(
  inputPlungerY,
  geometry = CLAW_GEOMETRY,
) {
  const plungerY = Math.min(
    geometry.closedPlungerY,
    Math.max(geometry.openPlungerY, inputPlungerY),
  );
  const stroke =
    (plungerY - geometry.openPlungerY) /
    (geometry.closedPlungerY - geometry.openPlungerY);
  const housingPivot = geometry.housingPivot;
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
    closure: stroke,
    stroke,
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

export function getOpenClawLowestY(geometry = CLAW_GEOMETRY) {
  const pose = getClawPoseFromPlungerY(
    geometry.openPlungerY,
    geometry,
  );
  const start =
    geometry.curvePoints[geometry.fingerCurveEndIndex];
  const end = geometry.curvePoints.at(-1);
  const deltaR = end.r - start.r;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaR, deltaY);
  const directionR = deltaR / length;
  const directionY = deltaY / length;
  const sine = Math.sin(pose.angle);
  const cosine = Math.cos(pose.angle);
  const centerR = (start.r + end.r) / 2;
  const centerY = (start.y + end.y) / 2;
  const worldCenterY =
    pose.hinge.y + sine * centerR + cosine * centerY;
  const worldDirectionY =
    sine * directionR + cosine * directionY;
  const worldFaceNormalY =
    cosine * directionR - sine * directionY;
  const verticalHalfExtent =
    (length / 2 + FINGER_COLLIDER_END_OVERLAP) *
      Math.abs(worldDirectionY) +
    (geometry.fingerThickness / 2) *
      Math.abs(worldFaceNormalY);

  return worldCenterY - verticalHalfExtent;
}

export function getClawPose(closure, geometry = CLAW_GEOMETRY) {
  const stroke = smoothClosure(closure);
  const plungerY =
    geometry.openPlungerY +
    (geometry.closedPlungerY - geometry.openPlungerY) * stroke;
  return getClawPoseFromPlungerY(plungerY, geometry);
}

export function sampleClawClearance(
  samples = 101,
  geometry = CLAW_GEOMETRY,
) {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < samples; index += 1) {
    const stroke = index / Math.max(1, samples - 1);
    const plungerY =
      geometry.openPlungerY +
      (geometry.closedPlungerY - geometry.openPlungerY) *
        stroke;
    const pose = getClawPoseFromPlungerY(plungerY, geometry);
    const clearance =
      pose.tipSeparation - geometry.fingerWidth;
    minimum = Math.min(minimum, clearance);
  }
  return minimum;
}
