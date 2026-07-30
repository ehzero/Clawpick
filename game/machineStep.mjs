/**
 * Pure claw machine step.
 *
 * Owns every phase transition, the winch length trajectory and the trolley
 * kinematics. It reads measurements taken from the physics world and returns
 * the next machine state plus the intents the caller should apply, so the
 * whole machine can be advanced headlessly — in a test, or later on a server.
 *
 * Nothing in here touches React, three.js or Rapier.
 */

import {
  positionApproachVelocity,
  stepAxisCommand,
} from "./driveAxis.mjs";

export const CABLE_LIMIT_EPSILON = 0.001;
export const CHUTE_ARRIVAL_DISTANCE = 0.035;
export const CHUTE_ARRIVAL_SPEED = 0.01;
export const DESCENT_ARRIVAL_SLACK = 0.07;
export const DESCENT_TIMEOUT = 3;
export const SETTLING_DURATION = 3.1;

export function createMachineState(cableLength) {
  return {
    phase: "aiming",
    phaseElapsed: 0,
    cableLength,
    // Ramped velocity commands handed to the gantry axis motors. The axes'
    // actual positions are measured from the physics bodies, not tracked here.
    commandedX: 0,
    commandedZ: 0,
  };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * The plunger has reached its commanded end of travel and stopped moving.
 * `stroke` and `targetStroke` are both measured from the open position.
 */
export function isPlungerSettled(
  motion,
  targetStroke,
  positionTolerance,
  velocityTolerance,
) {
  if (!motion) return false;
  return (
    Math.abs(targetStroke - motion.stroke) <= positionTolerance &&
    Math.abs(motion.velocity) <= velocityTolerance
  );
}

/**
 * Advances the machine by `dt` seconds.
 *
 * `machine` is the state returned by the previous call (or `createMachineState`)
 * and is never mutated. `phase` and `result` are the authoritative values from
 * the session store, which the UI can also change directly (pressing drop, or
 * a prize tripping the chute sensor).
 */
export function stepMachine({
  machine,
  phase,
  result,
  input,
  manualPlungerState,
  manualCableDirection,
  settings,
  limits,
  plunger,
  /** Measured carriage position, read from the gantry bodies. */
  trolley,
  actualCableLength,
  dt,
}) {
  const {
    minimumCableLength,
    maximumCableLength,
    trolleyLimitX,
    trolleyLimitZ,
    chuteX,
    chuteZ,
  } = limits;

  // The store may have changed phase since the previous step (drop pressed,
  // prize won). A phase we have not seen before restarts the dwell timer.
  const phaseElapsed = machine.phase === phase ? machine.phaseElapsed + dt : 0;

  // Re-clamp first: the geometric maximum shifts when the finger specs are
  // edited while the claw is already lowered.
  const previousCableLength = clamp(
    machine.cableLength,
    minimumCableLength,
    maximumCableLength,
  );
  let cableLength = previousCableLength;

  // --- plunger command ----------------------------------------------------
  const forceClosed =
    phase === "aiming"
      ? manualPlungerState === "closed"
      : phase === "closing" ||
        phase === "lifting" ||
        phase === "returning";
  const plungerTarget = forceClosed ? plunger.closedY : plunger.openY;
  const closedStroke = plunger.closedY - plunger.openY;

  // --- gantry axes --------------------------------------------------------
  // Each axis is an independent motor, so each brakes onto its own target.
  // A two-axis gantry does not travel in a straight diagonal, and this is why.
  const acceleration =
    settings.trolleyAcceleration *
    (phase === "aiming" ? 1 : settings.returnAccelerationMultiplier);
  const maxSpeed =
    settings.moveSpeed *
    (phase === "returning" ? settings.returnSpeedMultiplier : 1);

  let desiredX = 0;
  let desiredZ = 0;
  if (phase === "aiming") {
    desiredX = input.x * settings.moveSpeed;
    desiredZ = input.z * settings.moveSpeed;
  } else if (phase === "returning") {
    desiredX = positionApproachVelocity({
      position: trolley.x,
      target: chuteX,
      maxSpeed,
      deceleration: acceleration,
    });
    desiredZ = positionApproachVelocity({
      position: trolley.z,
      target: chuteZ,
      maxSpeed,
      deceleration: acceleration,
    });
  }

  const axis = {
    acceleration,
    coastAcceleration: acceleration * settings.gantryCoastRatio,
    maxSpeed,
    dt,
  };
  const commandedX = stepAxisCommand({
    ...axis,
    commanded: machine.commandedX,
    desired: desiredX,
    position: trolley.x,
    minPosition: -trolleyLimitX,
    maxPosition: trolleyLimitX,
  });
  const commandedZ = stepAxisCommand({
    ...axis,
    commanded: machine.commandedZ,
    desired: desiredZ,
    position: trolley.z,
    minPosition: -trolleyLimitZ,
    maxPosition: trolleyLimitZ,
  });

  // --- winch and phase transitions ---------------------------------------
  let nextPhase = phase;
  let clearManualCableDirection = false;
  let recordGripAttempt = false;
  let loseByTimeout = false;

  const activeManualDirection =
    phase === "aiming" ? manualCableDirection : null;

  if (activeManualDirection === "lower") {
    cableLength = Math.min(
      maximumCableLength,
      cableLength + settings.lowerSpeed * dt,
    );
    if (cableLength >= maximumCableLength - CABLE_LIMIT_EPSILON) {
      clearManualCableDirection = true;
    }
  } else if (activeManualDirection === "raise") {
    cableLength = Math.max(
      minimumCableLength,
      cableLength - settings.liftSpeed * dt,
    );
    if (cableLength <= minimumCableLength + CABLE_LIMIT_EPSILON) {
      clearManualCableDirection = true;
    }
  } else if (phase === "descending") {
    cableLength = Math.min(
      maximumCableLength,
      cableLength + settings.lowerSpeed * dt,
    );
    // Wait for the claw to actually catch up with the spooled length, so a
    // swinging descent does not close early. The timeout covers a claw that
    // landed on a prize and can never reach the commanded length.
    if (
      cableLength >= maximumCableLength - CABLE_LIMIT_EPSILON &&
      (actualCableLength >= maximumCableLength - DESCENT_ARRIVAL_SLACK ||
        phaseElapsed > DESCENT_TIMEOUT)
    ) {
      nextPhase = "closing";
    }
  }

  // A plunger that stopped before its end stop is holding a prize, which is a
  // successful grip rather than a fault.
  const stalledUnderLoad =
    phaseElapsed > settings.plungerStallTimeout &&
    plunger.motion !== null &&
    Math.abs(plunger.motion.velocity) <=
      settings.plungerVelocityTolerance;

  if (phase === "closing") {
    if (
      isPlungerSettled(
        plunger.motion,
        closedStroke,
        settings.plungerPositionTolerance,
        settings.plungerVelocityTolerance,
      ) ||
      stalledUnderLoad
    ) {
      recordGripAttempt = true;
      nextPhase = "lifting";
    }
  }

  if (!activeManualDirection && phase === "lifting") {
    cableLength = Math.max(
      minimumCableLength,
      cableLength - settings.liftSpeed * dt,
    );
    if (cableLength <= minimumCableLength + CABLE_LIMIT_EPSILON) {
      nextPhase = "returning";
    }
  }

  if (phase === "returning") {
    const distance = Math.hypot(chuteX - trolley.x, chuteZ - trolley.z);
    if (
      distance < CHUTE_ARRIVAL_DISTANCE &&
      Math.hypot(commandedX, commandedZ) < CHUTE_ARRIVAL_SPEED
    ) {
      nextPhase = "releasing";
    }
  }

  if (phase === "releasing") {
    if (
      isPlungerSettled(
        plunger.motion,
        0,
        settings.plungerPositionTolerance,
        settings.plungerVelocityTolerance,
      ) ||
      stalledUnderLoad
    ) {
      nextPhase = "settling";
    }
  }

  if (phase === "settling" && phaseElapsed > SETTLING_DURATION) {
    loseByTimeout = !result;
    nextPhase = "result";
  }

  return {
    machine: {
      phase,
      phaseElapsed,
      cableLength,
      commandedX,
      commandedZ,
    },
    nextPhase,
    // Target velocities for the gantry axis motors, in m/s.
    driveX: commandedX,
    driveZ: commandedZ,
    plungerTarget,
    targetLengthRate:
      (cableLength - previousCableLength) / Math.max(dt, 0.0001),
    // The winch is paying cable in or out, so the cable is being driven and
    // its radial velocity must be imposed even when it is momentarily slack.
    winding: phase === "descending" || phase === "lifting",
    drumDirection: phase === "descending" ? 1 : phase === "lifting" ? -1 : 0,
    clearManualCableDirection,
    recordGripAttempt,
    loseByTimeout,
  };
}
