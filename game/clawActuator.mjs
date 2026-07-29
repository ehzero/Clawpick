export function computeForceLimitedActuator({
  targetPosition,
  currentPosition,
  relativeVelocity,
  maxForce,
  responseDistance = 0.006,
  effectiveMass = 0.16,
}) {
  const safeMaxForce = Math.max(0, maxForce);
  const safeResponseDistance = Math.max(0.0001, responseDistance);
  const stiffness = safeMaxForce / safeResponseDistance;
  const damping =
    2 * Math.sqrt(stiffness * Math.max(0.001, effectiveMass)) * 0.82;
  const positionError = targetPosition - currentPosition;
  const requestedForce =
    positionError * stiffness - relativeVelocity * damping;
  const force = Math.min(
    safeMaxForce,
    Math.max(-safeMaxForce, requestedForce),
  );

  return {
    force,
    positionError,
    stiffness,
    damping,
    saturated:
      safeMaxForce > 0 &&
      Math.abs(requestedForce) >= safeMaxForce,
  };
}
