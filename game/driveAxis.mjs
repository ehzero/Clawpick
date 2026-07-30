/**
 * Motor model for a positioned machine axis.
 *
 * A geared DC axis cannot change speed instantly and cannot stop on a dime, so
 * a command is ramped toward the request and tapered as the axis runs out of
 * travel. The result is a target velocity handed to a joint motor, which the
 * constraint solver then realises against the axis' real inertia.
 *
 * Pure: no React, three.js or Rapier.
 */

/** Ignore position error below this to avoid hunting around the target. */
export const POSITION_DEADBAND = 0.004;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function approach(current, target, amount) {
  if (current < target) return Math.min(target, current + amount);
  return Math.max(target, current - amount);
}

/**
 * Velocity that arrives at `target` without overshooting, given how hard the
 * axis can brake. This is the usual sqrt(2·a·d) braking curve.
 */
export function positionApproachVelocity({
  position,
  target,
  maxSpeed,
  deceleration,
  deadband = POSITION_DEADBAND,
}) {
  const error = target - position;
  const distance = Math.abs(error);
  if (distance <= deadband) return 0;
  const braking = Math.sqrt(2 * Math.max(0, deceleration) * distance);
  return Math.sign(error) * Math.min(maxSpeed, braking);
}

/**
 * Largest speed the axis may still carry at `position` and keep enough room to
 * brake before the end of travel. Prevents slamming into the hard joint limit.
 */
export function travelLimitedSpeed({
  position,
  direction,
  minPosition,
  maxPosition,
  deceleration,
  maxSpeed,
  currentSpeed = 0,
  dt = 0,
}) {
  if (direction === 0) return maxSpeed;
  const remaining =
    direction > 0 ? maxPosition - position : position - minPosition;
  if (remaining <= 0) return 0;
  // The command can only be revised once per step, so the axis keeps its
  // current speed for one more step before any new braking takes effect.
  // Reserve that distance, otherwise the taper always starts a step too late.
  const braking = Math.max(
    0,
    remaining - Math.abs(currentSpeed) * dt,
  );
  return Math.min(
    maxSpeed,
    Math.sqrt(2 * Math.max(0, deceleration) * braking),
  );
}

/**
 * Advances the axis command by `dt`.
 *
 * `commanded` is the previous target velocity, which is what gives the axis its
 * spin-up and coast instead of stepping instantly to the requested speed.
 * Pass `coastAcceleration` to let a released control decay more gently than it
 * accelerates, the way an unpowered geared axis actually behaves.
 */
export function stepAxisCommand({
  commanded,
  desired,
  position,
  acceleration,
  coastAcceleration = acceleration,
  maxSpeed,
  minPosition,
  maxPosition,
  dt,
}) {
  const request = clamp(desired, -maxSpeed, maxSpeed);
  // The taper has to assume the rate the command can actually fall at, which is
  // the coast rate — assuming the (faster) drive rate makes it brake too late.
  const brakingRate = Math.min(acceleration, coastAcceleration);
  const ceiling = travelLimitedSpeed({
    position,
    direction: Math.sign(request),
    minPosition,
    maxPosition,
    deceleration: brakingRate,
    maxSpeed,
    currentSpeed: commanded,
    dt,
  });
  const target = clamp(request, -ceiling, ceiling);
  // Slowing down is a different ramp than speeding up: releasing the control
  // coasts, while driving spins the motor up.
  const releasing = Math.abs(target) < Math.abs(commanded);
  const rate = releasing ? coastAcceleration : acceleration;

  return approach(commanded, target, Math.max(0, rate) * dt);
}
