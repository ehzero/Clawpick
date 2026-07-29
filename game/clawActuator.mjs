export const END_STOP_FORCE_RAMP_DISTANCE = 0.003;
export const END_STOP_HOLD_FORCE_RATIO = 0.1;

export function computeAxialForceCommand({
  direction,
  relativeVelocity,
  maxSpeed = 0.2,
  maxForce,
  remainingTravel = Number.POSITIVE_INFINITY,
}) {
  const safeMaxForce = Math.max(0, maxForce);
  const normalizedDirection = Math.sign(direction);
  const speedTowardTarget =
    relativeVelocity * normalizedDirection;
  const endStopBlend = Math.min(
    1,
    Math.max(0, remainingTravel) /
      END_STOP_FORCE_RAMP_DISTANCE,
  );
  const forceScale =
    END_STOP_HOLD_FORCE_RATIO +
    (1 - END_STOP_HOLD_FORCE_RATIO) * endStopBlend;
  const speedLimited =
    normalizedDirection !== 0 &&
    speedTowardTarget >= Math.max(0, maxSpeed);
  const force =
    normalizedDirection === 0 || speedLimited
      ? 0
      : normalizedDirection * safeMaxForce * forceScale;

  return {
    direction: normalizedDirection,
    speedTowardTarget,
    force,
    forceScale,
    atEndStop: endStopBlend === 0,
    speedLimited,
  };
}
