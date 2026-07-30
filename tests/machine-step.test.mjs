import assert from "node:assert/strict";
import test from "node:test";
import {
  CABLE_LIMIT_EPSILON,
  DESCENT_TIMEOUT,
  SETTLING_DURATION,
  createMachineState,
  isPlungerSettled,
  stepMachine,
} from "../game/machineStep.mjs";

const SETTINGS = {
  moveSpeed: 1.35,
  trolleyAcceleration: 5.2,
  returnSpeedMultiplier: 0.9,
  returnAccelerationMultiplier: 0.73,
  lowerSpeed: 1.1,
  liftSpeed: 1.25,
  plungerSpeed: 0.19,
  plungerMaxForce: 18,
  plungerPositionTolerance: 0.006,
  plungerVelocityTolerance: 0.018,
  plungerStallTimeout: 2.4,
  clawFriction: 1.25,
  swingLinearDamping: 0.38,
  housingAngularDamping: 0,
  prizeMass: 0.38,
  prizeFriction: 0.78,
  prizeLinearDamping: 0.34,
  angularDamping: 0.55,
  gravity: -9.81,
};

const LIMITS = {
  minimumCableLength: 0.01,
  maximumCableLength: 2.4,
  trolleyLimitX: 2.32,
  trolleyLimitZ: 1.38,
  chuteX: 2.28,
  chuteZ: 1.18,
};

const PLUNGER = { openY: -0.42, closedY: -0.298 };
const CLOSED_STROKE = PLUNGER.closedY - PLUNGER.openY;
const FRAME = 1 / 60;

function machineIn(phase, extra = {}) {
  return {
    ...createMachineState(LIMITS.minimumCableLength),
    phase,
    ...extra,
  };
}

function step(overrides = {}) {
  const {
    machine = createMachineState(LIMITS.minimumCableLength),
    phase = machine.phase,
    result = null,
    input = { x: 0, z: 0 },
    manualPlungerState = "open",
    manualCableDirection = null,
    settings = SETTINGS,
    limits = LIMITS,
    motion = null,
    actualCableLength,
    dt = FRAME,
  } = overrides;

  return stepMachine({
    machine,
    phase,
    result,
    input,
    manualPlungerState,
    manualCableDirection,
    settings,
    limits,
    plunger: { ...PLUNGER, motion },
    // A perfectly tracking claw by default: the hanging body is exactly as far
    // from the guide as the winch has paid out.
    actualCableLength: actualCableLength ?? machine.cableLength,
    dt,
  });
}

/**
 * Advances the machine, feeding each phase transition back in.
 * `stopOnChange` returns the moment the phase moves on, so a transition test
 * asserts on the step that caused it rather than on whatever came later.
 */
function drive(steps, overrides = {}, { stopOnChange = false } = {}) {
  let machine =
    overrides.machine ?? createMachineState(LIMITS.minimumCableLength);
  let phase = overrides.phase ?? machine.phase;
  let last = null;
  const phases = [phase];

  for (let index = 0; index < steps; index += 1) {
    last = step({ ...overrides, machine, phase });
    machine = last.machine;
    const changed = last.nextPhase !== phase;
    if (changed) phases.push(last.nextPhase);
    phase = last.nextPhase;
    if (changed && stopOnChange) break;
  }

  return { machine, phase, last, phases };
}

function driveUntilChange(steps, overrides = {}) {
  return drive(steps, overrides, { stopOnChange: true });
}

test("the joystick accelerates the trolley toward the commanded speed", () => {
  // Half a second: long enough to saturate at moveSpeed, short enough to stay
  // clear of the travel limit that would zero the velocity again.
  const { machine } = drive(30, {
    machine: machineIn("aiming"),
    input: { x: 1, z: 0 },
  });

  assert.ok(Math.abs(machine.trolleyVelocity.x - SETTINGS.moveSpeed) < 1e-9);
  assert.equal(machine.trolleyVelocity.z, 0);
  assert.ok(machine.trolley.x > 0);
  assert.ok(machine.trolley.x < LIMITS.trolleyLimitX);
});

test("the trolley stops dead at its travel limits", () => {
  const { machine } = drive(600, {
    machine: machineIn("aiming"),
    input: { x: 1, z: 1 },
  });

  assert.equal(machine.trolley.x, LIMITS.trolleyLimitX);
  assert.equal(machine.trolley.z, LIMITS.trolleyLimitZ);
  assert.equal(machine.trolleyVelocity.x, 0);
  assert.equal(machine.trolleyVelocity.z, 0);
});

test("the joystick is ignored outside the aiming phase", () => {
  const result = step({
    machine: machineIn("lifting"),
    input: { x: 1, z: 1 },
  });

  assert.equal(result.machine.trolleyVelocity.x, 0);
  assert.equal(result.machine.trolleyVelocity.z, 0);
});

test("manual lowering pays out cable and releases the button at the stop", () => {
  const partial = drive(30, {
    machine: machineIn("aiming"),
    manualCableDirection: "lower",
  });
  assert.ok(partial.machine.cableLength > LIMITS.minimumCableLength);
  assert.equal(partial.last.clearManualCableDirection, false);
  assert.ok(partial.last.targetLengthRate > 0);

  const full = drive(400, {
    machine: machineIn("aiming"),
    manualCableDirection: "lower",
  });
  assert.equal(full.machine.cableLength, LIMITS.maximumCableLength);
  assert.equal(full.last.clearManualCableDirection, true);
});

test("manual raising retracts cable and releases the button at the stop", () => {
  const full = drive(400, {
    machine: machineIn("aiming", {
      cableLength: LIMITS.maximumCableLength,
    }),
    manualCableDirection: "raise",
  });

  assert.equal(full.machine.cableLength, LIMITS.minimumCableLength);
  assert.equal(full.last.clearManualCableDirection, true);
});

test("manual winch input is ignored once a round is running", () => {
  const result = step({
    machine: machineIn("closing", { cableLength: 1.2 }),
    manualCableDirection: "lower",
  });

  assert.equal(result.machine.cableLength, 1.2);
  assert.equal(result.targetLengthRate, 0);
});

test("the manual claw button drives the plunger target while aiming", () => {
  assert.equal(
    step({ machine: machineIn("aiming"), manualPlungerState: "closed" })
      .plungerTarget,
    PLUNGER.closedY,
  );
  assert.equal(
    step({ machine: machineIn("aiming"), manualPlungerState: "open" })
      .plungerTarget,
    PLUNGER.openY,
  );
});

test("the plunger closes for the grip phases and opens for the rest", () => {
  for (const phase of ["closing", "lifting", "returning"]) {
    assert.equal(
      step({ machine: machineIn(phase), manualPlungerState: "open" })
        .plungerTarget,
      PLUNGER.closedY,
      `${phase} should hold the plunger closed`,
    );
  }
  for (const phase of ["descending", "releasing", "settling", "result"]) {
    assert.equal(
      step({ machine: machineIn(phase), manualPlungerState: "closed" })
        .plungerTarget,
      PLUNGER.openY,
      `${phase} should release the plunger`,
    );
  }
});

test("descent closes the claw only once the body catches up with the winch", () => {
  const tracking = drive(200, { machine: machineIn("descending") });
  assert.equal(tracking.phase, "closing");
  assert.ok(tracking.machine.cableLength >= LIMITS.maximumCableLength - CABLE_LIMIT_EPSILON);

  // A claw resting on a prize never reaches the commanded length, so the
  // swing-out guard must not fire before the timeout.
  const stuck = drive(150, {
    machine: machineIn("descending"),
    actualCableLength: 0.5,
  });
  assert.equal(stuck.phase, "descending");
  assert.ok(stuck.machine.phaseElapsed < DESCENT_TIMEOUT);
});

test("a descent that never lands still closes after the timeout", () => {
  const stuck = drive(260, {
    machine: machineIn("descending"),
    actualCableLength: 0.5,
  });

  assert.equal(stuck.phase, "closing");
});

test("closing hands over to lifting when the plunger reaches its end stop", () => {
  const result = step({
    machine: machineIn("closing"),
    motion: { stroke: CLOSED_STROKE, velocity: 0 },
  });

  assert.equal(result.nextPhase, "lifting");
  assert.equal(result.recordGripAttempt, true);
});

test("a plunger stalled on a prize counts as a completed grip", () => {
  const held = { stroke: CLOSED_STROKE * 0.4, velocity: 0 };

  const early = drive(100, { machine: machineIn("closing"), motion: held });
  assert.equal(early.phase, "closing", "must wait out the stall timeout");

  const stalled = driveUntilChange(400, {
    machine: machineIn("closing"),
    motion: held,
  });
  assert.equal(stalled.phase, "lifting");
  assert.equal(stalled.last.recordGripAttempt, true);
  assert.ok(stalled.machine.phaseElapsed > SETTINGS.plungerStallTimeout);
});

test("a plunger still travelling does not end the closing phase", () => {
  const result = step({
    machine: machineIn("closing"),
    motion: { stroke: CLOSED_STROKE * 0.5, velocity: 0.19 },
  });

  assert.equal(result.nextPhase, "closing");
  assert.equal(result.recordGripAttempt, false);
});

test("lifting retracts to the stop and then heads for the chute", () => {
  const result = driveUntilChange(400, {
    machine: machineIn("lifting", {
      cableLength: LIMITS.maximumCableLength,
    }),
    motion: { stroke: CLOSED_STROKE, velocity: 0 },
  });

  assert.equal(result.machine.cableLength, LIMITS.minimumCableLength);
  assert.equal(result.phase, "returning");
  assert.ok(result.last.targetLengthRate <= 0);
});

test("returning steers to the chute and releases on arrival", () => {
  const result = driveUntilChange(900, {
    machine: machineIn("returning"),
    motion: { stroke: CLOSED_STROKE, velocity: 0 },
  });

  assert.equal(result.phase, "releasing");
  assert.ok(
    Math.hypot(
      LIMITS.chuteX - result.machine.trolley.x,
      LIMITS.chuteZ - result.machine.trolley.z,
    ) < 0.035,
  );
});

test("releasing waits for the plunger to return to the open stop", () => {
  assert.equal(
    step({
      machine: machineIn("releasing"),
      motion: { stroke: CLOSED_STROKE * 0.6, velocity: 0.1 },
    }).nextPhase,
    "releasing",
  );
  assert.equal(
    step({
      machine: machineIn("releasing"),
      motion: { stroke: 0, velocity: 0 },
    }).nextPhase,
    "settling",
  );
});

test("settling ends the round and only invents a loss when nothing was won", () => {
  const lost = driveUntilChange(400, { machine: machineIn("settling") });
  assert.equal(lost.phase, "result");
  assert.equal(lost.last.loseByTimeout, true);
  assert.ok(lost.machine.phaseElapsed > SETTLING_DURATION);

  const won = driveUntilChange(400, {
    machine: machineIn("settling"),
    result: "win",
  });
  assert.equal(won.phase, "result");
  assert.equal(won.last.loseByTimeout, false);
});

test("a phase changed by the store restarts the dwell timer", () => {
  const settled = drive(120, { machine: machineIn("aiming") });
  assert.ok(settled.machine.phaseElapsed > 1.9);

  // The player pressed drop: the store owns the phase, not this function.
  const dropped = step({ machine: settled.machine, phase: "descending" });
  assert.equal(dropped.machine.phaseElapsed, 0);
});

test("a shrinking geometric limit re-clamps a cable that is already out", () => {
  const result = step({
    machine: machineIn("aiming", { cableLength: 2.4 }),
    limits: { ...LIMITS, maximumCableLength: 1.5 },
  });

  assert.equal(result.machine.cableLength, 1.5);
  assert.equal(result.targetLengthRate, 0, "re-clamping is not a winch motion");
});

test("the winch flag and drum direction follow the active phase", () => {
  const descending = step({ machine: machineIn("descending") });
  assert.equal(descending.winding, true);
  assert.equal(descending.drumDirection, 1);

  const lifting = step({ machine: machineIn("lifting") });
  assert.equal(lifting.winding, true);
  assert.equal(lifting.drumDirection, -1);

  const aiming = step({ machine: machineIn("aiming") });
  assert.equal(aiming.winding, false);
  assert.equal(aiming.drumDirection, 0);
});

test("the step is deterministic and never mutates its input state", () => {
  const machine = machineIn("descending", { cableLength: 0.8 });
  const snapshot = JSON.stringify(machine);

  const first = step({ machine, input: { x: 0.5, z: -0.5 } });
  const second = step({ machine, input: { x: 0.5, z: -0.5 } });

  assert.equal(JSON.stringify(machine), snapshot);
  assert.deepEqual(first, second);
});

test("plunger settling needs both the position and the velocity window", () => {
  assert.equal(isPlungerSettled(null, 0, 0.006, 0.018), false);
  assert.equal(
    isPlungerSettled({ stroke: 0.122, velocity: 0 }, 0.122, 0.006, 0.018),
    true,
  );
  assert.equal(
    isPlungerSettled({ stroke: 0.122, velocity: 0.2 }, 0.122, 0.006, 0.018),
    false,
    "still moving fast is not settled",
  );
  assert.equal(
    isPlungerSettled({ stroke: 0.06, velocity: 0 }, 0.122, 0.006, 0.018),
    false,
    "stopped short of the target is not settled",
  );
});

test("a full automatic round walks the phases in order", () => {
  let machine = machineIn("descending");
  let phase = "descending";
  const seen = [phase];

  for (let index = 0; index < 2000 && phase !== "result"; index += 1) {
    // Stand in for the physics: report the plunger already parked at whichever
    // end stop the current phase commands.
    const closed =
      phase === "closing" || phase === "lifting" || phase === "returning";
    const result = step({
      machine,
      phase,
      motion: { stroke: closed ? CLOSED_STROKE : 0, velocity: 0 },
    });
    machine = result.machine;
    if (result.nextPhase !== phase) seen.push(result.nextPhase);
    phase = result.nextPhase;
  }

  assert.deepEqual(seen, [
    "descending",
    "closing",
    "lifting",
    "returning",
    "releasing",
    "settling",
    "result",
  ]);
});
