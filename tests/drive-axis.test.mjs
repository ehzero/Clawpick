import assert from "node:assert/strict";
import test from "node:test";
import {
  positionApproachVelocity,
  stepAxisCommand,
  travelLimitedSpeed,
} from "../game/driveAxis.mjs";
import { CHUTE_ARRIVAL_DISTANCE } from "../game/machineStep.mjs";
import { CABINET } from "../game/machineDimensions.mjs";
import {
  DEFAULT_GANTRY_PART_SPECS,
  createGantryGeometry,
  normalizeGantryPartSpecs,
  BRIDGE,
  BRIDGE_HALF_DEPTH,
  BRIDGE_TRAVEL_Z,
  RAIL,
  TROLLEY,
  TROLLEY_TRAVEL_MAX_X,
  TROLLEY_TRAVEL_MIN_X,
  GANTRY_TOP_Y,
  measureCarriageClearance,
  measureTieClearance,
  measureTravelDriveFit,
  measureWheelFit,
  measureStopClearance,
  trolleyClearsStops,
} from "../game/gantryGeometry.mjs";

const AXIS = {
  acceleration: 5.2,
  maxSpeed: 1.35,
  minPosition: TROLLEY_TRAVEL_MIN_X,
  maxPosition: TROLLEY_TRAVEL_MAX_X,
  dt: 1 / 60,
};

/**
 * Leftmost column of the shipped prize layout in MachineScene. The travel drive
 * eats into the carriage's reach on its own side, so this is the line it must
 * not cross.
 */
const LEFTMOST_PRIZE_X = -1.72;

function drive(steps, { desired, position = 0, commanded = 0, ...rest } = {}) {
  let velocity = commanded;
  let where = position;
  for (let index = 0; index < steps; index += 1) {
    velocity = stepAxisCommand({
      ...AXIS,
      ...rest,
      commanded: velocity,
      desired: typeof desired === "function" ? desired(where, index) : desired,
      position: where,
    });
    where += velocity * AXIS.dt;
  }
  return { velocity, position: where };
}

test("the axis spins up to the requested speed instead of stepping to it", () => {
  const first = stepAxisCommand({ ...AXIS, commanded: 0, desired: 1.35, position: 0 });
  assert.ok(first > 0);
  assert.ok(
    first < 1.35,
    "one step must not reach full speed, that is the instant jump we are avoiding",
  );
  assert.ok(Math.abs(first - AXIS.acceleration * AXIS.dt) < 1e-9);

  const settled = drive(30, { desired: 1.35 });
  assert.ok(Math.abs(settled.velocity - 1.35) < 1e-9);
});

test("the request is clamped to the axis maximum speed", () => {
  const settled = drive(60, { desired: 99 });
  assert.ok(Math.abs(settled.velocity - AXIS.maxSpeed) < 1e-9);
});

test("a released control coasts more gently than it accelerates", () => {
  const braking = stepAxisCommand({
    ...AXIS,
    commanded: 1.35,
    desired: 0,
    position: 0,
  });
  const coasting = stepAxisCommand({
    ...AXIS,
    commanded: 1.35,
    desired: 0,
    position: 0,
    coastAcceleration: 1.3,
  });

  assert.ok(coasting > braking, "coasting must shed speed more slowly");
  assert.ok(coasting < 1.35, "but it still sheds speed");
});

test("the axis tapers its speed so it can brake before the end of travel", () => {
  // Approaching the far limit at full speed, the command must fall away.
  const nearLimit = stepAxisCommand({
    ...AXIS,
    commanded: AXIS.maxSpeed,
    desired: AXIS.maxSpeed,
    position: TROLLEY_TRAVEL_MAX_X - 0.05,
  });
  assert.ok(
    nearLimit < AXIS.maxSpeed,
    "full speed 50 mm from the stop is not brakeable",
  );

  const farFromLimit = stepAxisCommand({
    ...AXIS,
    commanded: AXIS.maxSpeed,
    desired: AXIS.maxSpeed,
    position: 0,
  });
  assert.ok(Math.abs(farFromLimit - AXIS.maxSpeed) < 1e-9);
});

test("driving into the stop arrives slowly instead of slamming", () => {
  const fast = drive(600, { desired: AXIS.maxSpeed });

  // The taper's job is to bleed off speed; the hard backstop is the prismatic
  // joint limit in the scene, so a sub-millimetre command overshoot is fine.
  // What matters is that the axis is no longer travelling when it gets there.
  assert.ok(
    Math.abs(fast.position - TROLLEY_TRAVEL_MAX_X) < 0.001,
    `expected to settle on ${TROLLEY_TRAVEL_MAX_X}, reached ${fast.position}`,
  );
  assert.ok(
    Math.abs(fast.velocity) < 0.05,
    `arrived at ${fast.velocity.toFixed(3)} m/s, should be nearly stopped`,
  );

  // Without the taper the same run would hit the stop at full speed.
  let naive = 0;
  let position = 0;
  for (let i = 0; i < 600; i += 1) {
    naive = Math.min(AXIS.maxSpeed, naive + AXIS.acceleration * AXIS.dt);
    position = Math.min(TROLLEY_TRAVEL_MAX_X, position + naive * AXIS.dt);
  }
  assert.ok(
    naive > 1.3,
    "the untapered axis reaches the stop still at full speed",
  );
});

test("travel-limited speed is zero once there is no travel left", () => {
  assert.equal(
    travelLimitedSpeed({
      position: TROLLEY_TRAVEL_MAX_X,
      direction: 1,
      minPosition: TROLLEY_TRAVEL_MIN_X,
      maxPosition: TROLLEY_TRAVEL_MAX_X,
      deceleration: 5.2,
      maxSpeed: 1.35,
    }),
    0,
  );
  // Standing at the limit but driving away from it is unrestricted.
  assert.equal(
    travelLimitedSpeed({
      position: TROLLEY_TRAVEL_MAX_X,
      direction: -1,
      minPosition: TROLLEY_TRAVEL_MIN_X,
      maxPosition: TROLLEY_TRAVEL_MAX_X,
      deceleration: 5.2,
      maxSpeed: 1.35,
    }),
    1.35,
  );
});

test("a position request brakes onto the target without overshooting", () => {
  const target = 1.18;
  const result = drive(600, {
    desired: (position) =>
      positionApproachVelocity({
        position,
        target,
        maxSpeed: AXIS.maxSpeed,
        deceleration: AXIS.acceleration,
      }),
  });

  assert.ok(
    Math.abs(result.position - target) < 0.01,
    `expected to arrive at ${target}, reached ${result.position}`,
  );
  assert.ok(Math.abs(result.velocity) < 0.05, "and to stop there");
});

test("a position request inside the deadband asks for no motion", () => {
  assert.equal(
    positionApproachVelocity({
      position: 1.1799,
      target: 1.18,
      maxSpeed: 1.35,
      deceleration: 5.2,
    }),
    0,
  );
});

test("the carriage gets close enough to the chute to hand over", () => {
  // Reaching the chute's exact centre is not the requirement — the return phase
  // hands over once the carriage is within CHUTE_ARRIVAL_DISTANCE of it.
  const layout = createGantryGeometry();
  const errorX = 2.28 - layout.travelMaxX;
  const errorZ = 1.18 - layout.travelZ;

  assert.ok(
    errorX < CHUTE_ARRIVAL_DISTANCE,
    `X stops ${errorX} short of the chute, outside the ${CHUTE_ARRIVAL_DISTANCE} tolerance`,
  );
  assert.ok(errorZ < CHUTE_ARRIVAL_DISTANCE, `Z stops ${errorZ} short`);
});

test("the carriage stops before the end plate instead of through it", () => {
  const layout = createGantryGeometry();
  const carriageEdge = layout.travelMaxX + TROLLEY.size / 2;
  const plateInnerFace = layout.endPlateX - layout.endPlate.thickness / 2;

  assert.ok(
    carriageEdge <= plateInnerFace + 1e-9,
    `carriage reaches ${carriageEdge}, past the plate face at ${plateInnerFace}`,
  );
});

test("the carriage stops before the travel drive on the drive side", () => {
  const layout = createGantryGeometry();
  const drive = layout.travelDrive;
  const carriageEdge = -layout.travelMinX + TROLLEY.size / 2;

  assert.equal(drive.side, -1, "the reference machine drives from the left");
  assert.ok(
    carriageEdge <= drive.innerFaceX + 1e-9,
    `carriage reaches ${carriageEdge}, into the gearcase at ${drive.innerFaceX}`,
  );
  // The gearcase reaches further inboard than the plate, so this end of travel
  // really is shorter. A symmetric limit here would drive through the gearbox.
  assert.ok(
    -layout.travelMinX < layout.travelMaxX,
    "the drive side must be the shorter of the two X limits",
  );
});

test("all rods share one diameter and all wheels one spec", () => {
  const layout = createGantryGeometry({
    ...DEFAULT_GANTRY_PART_SPECS,
    rodDiameter: 0.12,
    wheelGrooveDiameter: 0.13,
  });

  // One rod radius drives the side rods, the bridge pair and the tie rod, and
  // one wheel spec drives all eight wheels, so both axles sit at heights that
  // differ only by the rod height they rest on.
  assert.equal(layout.rodRadius, 0.06);
  assert.equal(layout.wheel.grooveRadius, 0.065);
  assert.equal(
    layout.bridgeWheelY - RAIL.y,
    layout.trolleyWheelY - BRIDGE.y,
    "identical parts must give an identical stand-off from their rod",
  );
});

test("rod lengths come from the cabinet, not from a dimension", () => {
  const layout = createGantryGeometry();

  // Side rods span the interior depth, less an end clearance at each end.
  assert.ok(layout.railLength < CABINET.glassHalfDepth * 2);
  assert.ok(layout.railLength > CABINET.glassHalfDepth * 2 - 0.2);
  // Bridge and tie rods are cut to reach the end plates.
  assert.ok(
    Math.abs(
      layout.rodSpan -
        (layout.endPlateX + layout.endPlate.thickness / 2) * 2,
    ) < 1e-9,
  );
  // And the outermost wheel face stays inboard of the cabinet's top trim.
  assert.ok(
    layout.wheelOuterX < CABINET.topTrimHalfWidth,
    `wheel reaches ${layout.wheelOuterX}, into the trim at ${CABINET.topTrimHalfWidth}`,
  );

  // A fatter wheel pushes the rails inboard, so the rods get shorter by itself.
  const fat = createGantryGeometry({ wheelGrooveWidth: 0.18 });
  assert.ok(fat.railX < layout.railX);
  assert.ok(fat.rodSpan < layout.rodSpan);
  assert.ok(fat.wheelOuterX < CABINET.topTrimHalfWidth);
});

test("editable rod and wheel specs keep every wheel seated", () => {
  const ranges = {
    rodDiameter: [0.07, 0.11],
    wheelGrooveDiameter: [0.09, 0.14],
    wheelFlangeDiameter: [0.2, 0.28],
    wheelGrooveWidth: [0.09, 0.13],
    bridgeRodSpacing: [0.2, 0.44],
    trolleyWheelSpacing: [0.18, 0.46],
  };

  for (const [key, [low, high]] of Object.entries(ranges)) {
    for (let step = 0; step <= 10; step += 1) {
      const value = low + ((high - low) * step) / 10;
      const specs = normalizeGantryPartSpecs({ [key]: value });
      const layout = createGantryGeometry(specs);
      const where = `${key}=${value.toFixed(3)}`;

      for (const [name, fit] of Object.entries(measureWheelFit(specs))) {
        assert.ok(fit.bite < 1e-9, `${where}: ${name} sinks ${fit.bite}`);
        assert.ok(fit.wrap > 0, `${where}: ${name} wrap is ${fit.wrap}`);
        assert.ok(
          fit.grooveSlack > 0,
          `${where}: ${name} groove slack is ${fit.grooveSlack}`,
        );
      }

      // The gearcase face is the carriage's stop on the drive side, so the can
      // and the terminal box have to stay behind it or the carriage would reach
      // them instead of the flat face the stop is dimensioned from.
      const drive = measureTravelDriveFit(specs);
      assert.ok(
        drive.motorSetback >= 0,
        `${where}: motor can stands ${-drive.motorSetback} proud of the end stop`,
      );
      assert.ok(
        drive.terminalSetback >= 0,
        `${where}: terminal box stands ${-drive.terminalSetback} proud`,
      );
      assert.ok(
        drive.axleInsideCase > 0,
        `${where}: gearcase stops ${-drive.axleInsideCase} below the wheel axles it turns`,
      );
      assert.ok(
        drive.plateOverhang <= 0,
        `${where}: gearcase overhangs its end plate by ${drive.plateOverhang}`,
      );
      assert.ok(
        drive.depthMargin >= 0,
        `${where}: the drive sets the bridge depth, costing ${-drive.depthMargin} of Z travel`,
      );
      // The can hangs into open air under the bridge; the carriage top is the
      // nearest thing below it, and the two never share an X.
      assert.ok(
        drive.motorBottomY > TROLLEY.y - TROLLEY.size / 2,
        `${where}: motor can reaches ${drive.motorBottomY}, down past the carriage`,
      );

      assert.ok(
        layout.travelMaxX + TROLLEY.size / 2 <=
          layout.endPlateX - layout.endPlate.thickness / 2 + 1e-9,
        `${where}: carriage runs into the end plate`,
      );
      assert.ok(
        -layout.travelMinX + TROLLEY.size / 2 <=
          layout.travelDrive.innerFaceX + 1e-9,
        `${where}: carriage runs into the travel gearcase`,
      );
      assert.ok(
        layout.travelMinX < LEFTMOST_PRIZE_X,
        `${where}: X reach ${layout.travelMinX} cannot centre on the leftmost prize`,
      );
      assert.ok(
        layout.wheelOuterX < CABINET.topTrimHalfWidth,
        `${where}: wheel at ${layout.wheelOuterX} fouls the top trim`,
      );
      assert.ok(
        layout.topY < 4.2,
        `${where}: gantry reaches ${layout.topY}, into the ceiling`,
      );
      assert.ok(
        2.28 - layout.travelMaxX < CHUTE_ARRIVAL_DISTANCE,
        `${where}: X reach ${layout.travelMaxX} loses the chute`,
      );
      assert.ok(
        1.18 - layout.travelZ < CHUTE_ARRIVAL_DISTANCE,
        `${where}: Z reach ${layout.travelZ} loses the chute`,
      );
    }
  }
});

test("the carriage hangs clear of the bridge rods and the rail collars", () => {
  assert.ok(
    measureCarriageClearance() > 0,
    "the carriage top must sit below the bridge rods, with the yoke spanning",
  );
  assert.ok(
    measureStopClearance() > 0,
    "and pass under the rail end collars so they stop the bridge alone",
  );
  assert.equal(trolleyClearsStops(), true);

  // Raising it back to rail height is the arrangement that interpenetrated.
  assert.equal(trolleyClearsStops({ trolleyY: RAIL.y }), false);
});

test("the tie rod clears the carriage passing under it", () => {
  const tie = measureTieClearance();
  assert.ok(tie.overYoke > 0, `the yoke fouls the tie rod by ${-tie.overYoke}`);
  assert.ok(
    tie.wheelZGap > 0,
    "and the carriage wheels sit outboard of it in Z",
  );
});

test("the gantry stays under the marquee", () => {
  // The ceiling collider starts at 4.20 and the marquee light panel at 4.218.
  assert.ok(
    GANTRY_TOP_Y < 4.2,
    `gantry reaches ${GANTRY_TOP_Y}, which is into the cabinet ceiling`,
  );
});

test("axis travel is derived from the gantry, not hand-picked", () => {
  const layout = createGantryGeometry();

  // Z is the bridge's rail wheels meeting the rail collars.
  assert.ok(
    Math.abs(
      BRIDGE_TRAVEL_Z -
        (layout.stopZ - RAIL.stopLength / 2 - BRIDGE_HALF_DEPTH),
    ) < 1e-9,
  );
  // X is the carriage meeting the end plate one way…
  assert.ok(
    Math.abs(
      TROLLEY_TRAVEL_MAX_X -
        (layout.endPlateX -
          layout.endPlate.thickness / 2 -
          TROLLEY.size / 2),
    ) < 1e-9,
  );
  // …and the travel gearcase the other.
  assert.ok(
    Math.abs(
      TROLLEY_TRAVEL_MIN_X +
        (layout.travelDrive.innerFaceX - TROLLEY.size / 2),
    ) < 1e-9,
  );
});

test("the bridge mass is split across every collider that carries it", () => {
  const share = BRIDGE.massShare;
  // Two rods, one tie, two plates, one gearcase, one motor.
  const total =
    share.rod * 2 +
    share.tie +
    share.endPlate * 2 +
    share.driveCase +
    share.driveMotor;

  assert.ok(
    Math.abs(total - 1) < 1e-9,
    `shares sum to ${total}, so the bridge does not weigh BRIDGE.mass`,
  );
  assert.ok(
    share.driveCase + share.driveMotor > share.endPlate * 2,
    "a real gearmotor outweighs the plates it hangs off",
  );
});
