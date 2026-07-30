/**
 * As-built dimensions of the overhead gantry, and the travel each axis gets.
 *
 * Built to match the real mechanism: chromed round rod for every rail, with
 * grooved white nylon wheels whose flanges wrap the rod they ride. Nothing
 * interpenetrates — every wheel's groove floor is tangent to its rod.
 *
 * Vertical stack, top to bottom:
 *
 *   rail wheels     (○)     grooved wheels, flanges wrapping the side rod
 *   side rails       ◯      two round rods running front-back (Z), fixed
 *   tie rod        ◯───◯    third rod above the pair, spanning left-right;
 *                           brackets on its ends carry the front rail wheels
 *   bridge rods    ◯   ◯    two round rods running left-right (X), same height,
 *                           spaced in Z so the carriage cannot pitch
 *   carriage wheels (○) (○) four grooved wheels, two per rod
 *   yoke              ║     ONE plate, between the rods, inboard of the wheels
 *   carriage         ▓▓▓    hangs clear below the rods
 *      wire guide     ◉     bolted under the carriage
 *
 * Seen along the bridge, the left end also carries the travel drive:
 *
 *   ═╤═══════════════════   side rail
 *    │ (○)                  rail wheel this gearcase turns
 *   ████████════════════    gearcase bolted to the end plate, the three
 *                           bridge rods ending inside it
 *
 * The drive is the gearcase alone — no motor can, cover or terminal box. That
 * gearcase is what the carriage runs into on the left, so X travel is not
 * symmetric about the machine centre.
 *
 * Pure data plus derived travel, so the renderer and the physics bodies read
 * one source instead of repeating magic numbers.
 */

import { CABINET } from "./machineDimensions.mjs";

/**
 * A grooved wheel. The rod sits in the groove, so the wheel's centre rides one
 * groove radius plus one rod radius above the rod's centre, and the flanges
 * reach back down past the rod to hold it captive.
 */
function wheel({ grooveRadius, flangeRadius, grooveWidth, flangeWidth }) {
  return Object.freeze({
    grooveRadius,
    flangeRadius,
    grooveWidth,
    flangeWidth,
    /** Total width across both flanges. */
    width: grooveWidth + flangeWidth * 2,
  });
}

/**
 * The rod and wheel dimensions a user can edit. Everything else in the gantry
 * is fixed structure; these are the parts you would actually swap on a bench.
 */
export const DEFAULT_GANTRY_PART_SPECS = Object.freeze({
  /** Every rod in the gantry is the same stock; only the cut length differs. */
  rodDiameter: 0.105,
  /** Every wheel is the same part too. */
  wheelGrooveDiameter: 0.12,
  wheelFlangeDiameter: 0.27,
  wheelGrooveWidth: 0.13,
  /** Spacing of the two bridge rods, and of the carriage's two axles. */
  bridgeRodSpacing: 0.32,
  trolleyWheelSpacing: 0.3,
});

/** Flange thickness is a fixed feature of the wheel, not a tuned dimension. */
const WHEEL_FLANGE_WIDTH = 0.02;
/** Plate that carries the rail wheels and ties the three rods together. */
const END_PLATE = Object.freeze({ thickness: 0.018, depth: 0.52 });
/** Room left between the outermost wheel face and the cabinet's top trim. */
const TRIM_CLEARANCE = 0.01;
/** Room left at each end of a side rod. */
const RAIL_END_CLEARANCE = 0.04;

/**
 * Fixed side rods the bridge runs along, front to back. Their X position and
 * length are derived from the cabinet, so only the mounting height and the end
 * collar live here.
 */
export const RAIL = Object.freeze({
  y: 3.92,
  /** Collars swaged onto the rod ends; these are the Z end stops. */
  stopRadius: 0.09,
  stopLength: 0.16,
});

/** The bridge: a rod pair plus a tie rod, on end plates, riding the side rods. */
export const BRIDGE = Object.freeze({
  y: 3.8,
  /** Rods, plates and the travel gearcase together. */
  mass: 4.8,
  /** Rail wheels sit this far fore and aft, giving the bridge its anti-tip base. */
  wheelZ: 0.17,
  /**
   * How the bridge mass is split across its colliders. The gearcase is a quarter
   * of the assembly, which is why it is worth carrying rather than assuming a
   * massless drive. Shares must sum to one over the parts each is applied to:
   * two rods, one tie, two plates, one gearcase.
   */
  massShare: Object.freeze({
    rod: 0.26,
    tie: 0.11,
    endPlate: 0.055,
    driveCase: 0.26,
  }),
});

/**
 * Bridge travel drive: the gearcase on the left end plate that turns the two rail
 * wheels on that side, which is what moves the whole bridge along the fixed side
 * rods. The far plate's wheels idle.
 *
 * The whole drive is this one case. Its motor, cover and terminal box are inside
 * it or left unmodelled, so nothing on the drive projects past the case faces.
 *
 * It lives inboard of the plate, in the only pocket the layout leaves free, and
 * that is also the pocket the carriage would otherwise run through — so the
 * gearcase face is the carriage's left mechanical end stop.
 */
export const TRAVEL_DRIVE = Object.freeze({
  /** Which end plate carries it. Left, as on the reference machine. */
  side: -1,
  /** How far the gearcase reaches inboard of the end plate's inner face. */
  caseDepth: 0.28,
  /** The case is a box bolted onto the plate, inset from the plate outline. */
  caseInset: 0.02,
});

/** Plain stub axle every rail wheel turns on. */
const STUB_AXLE_RADIUS = 0.016;

/** The carriage, straddling both bridge rods and hanging below them. */
export const TROLLEY = Object.freeze({
  size: 0.64,
  y: 3.4,
  mass: 2,
  /** A single plate on the centreline, inboard of the wheels. */
  yoke: Object.freeze({ thickness: 0.05, width: 0.44 }),
});

/**
 * Raises a wheel's flange and groove to the minimum that actually works for the
 * rod it rides: the flange has to reach past the rod's centreline to hold the
 * wheel captive, and the groove has to be wider than the rod it swallows.
 */
export function normalizeGantryPartSpecs(specs) {
  const spec = { ...DEFAULT_GANTRY_PART_SPECS, ...specs };
  return {
    ...spec,
    wheelFlangeDiameter: Math.max(
      spec.wheelFlangeDiameter,
      spec.wheelGrooveDiameter + spec.rodDiameter + 0.02,
    ),
    wheelGrooveWidth: Math.max(
      spec.wheelGrooveWidth,
      spec.rodDiameter + 0.02,
    ),
  };
}

/**
 * Places the travel drive against one end plate. Everything is local to the
 * bridge body and on the drive side's own sign of X, so the renderer can mirror
 * nothing and read these straight.
 */
function travelDriveLayout({ plateInnerX, plateHeight, plateLocalY }) {
  const caseHeight = plateHeight - TRAVEL_DRIVE.caseInset * 2;
  const caseWidth = END_PLATE.depth - TRAVEL_DRIVE.caseInset * 2;
  // Measured from the machine centre outwards, so the carriage's stop follows
  // from one subtraction rather than from a sign.
  const innerFaceX = plateInnerX - TRAVEL_DRIVE.caseDepth;
  const caseX = innerFaceX + TRAVEL_DRIVE.caseDepth / 2;

  return {
    side: TRAVEL_DRIVE.side,
    /** Gearcase, bolted to the plate with the three bridge rods ending inside. */
    case: {
      depth: TRAVEL_DRIVE.caseDepth,
      height: caseHeight,
      width: caseWidth,
      x: caseX,
      y: plateLocalY,
    },
    /** |x| of the face the carriage runs into. */
    innerFaceX,
    /** Highest and widest points, so the drive is checked like the rest. */
    localTopY: plateLocalY + caseHeight / 2,
    halfDepth: caseWidth / 2,
  };
}

/**
 * Resolves the editable rod and wheel dimensions into the layout the renderer
 * and the physics bodies need.
 *
 * Every rod in the gantry is the same stock and every wheel the same part, so
 * one diameter and one wheel spec drive the whole assembly. Lengths are never
 * dimensioned by hand: the side rods follow the cabinet's interior depth, and
 * the bridge rods are cut to reach the end plates, whose position follows from
 * the cabinet's top trim and the wheel width.
 */
export function createGantryGeometry(specs = {}) {
  const spec = normalizeGantryPartSpecs(specs);
  const rodRadius = spec.rodDiameter / 2;
  const rodSpacingZ = spec.bridgeRodSpacing / 2;

  const wheelSpec = wheel({
    grooveRadius: spec.wheelGrooveDiameter / 2,
    flangeRadius: spec.wheelFlangeDiameter / 2,
    grooveWidth: spec.wheelGrooveWidth,
    flangeWidth: WHEEL_FLANGE_WIDTH,
  });

  // Side rods sit as far outboard as the wheels can go without fouling the
  // cabinet's top trim; their length then follows the interior depth.
  const railX =
    CABINET.topTrimHalfWidth - wheelSpec.width / 2 - TRIM_CLEARANCE;
  const railHalfLength = CABINET.glassHalfDepth - RAIL_END_CLEARANCE;
  const stopZ = railHalfLength - RAIL.stopLength / 2;

  // The plate lands against the wheels' inboard faces and the rods are cut to
  // reach its outer face.
  const endPlateX = railX - wheelSpec.width / 2 - END_PLATE.thickness / 2;
  const rodSpan = (endPlateX + END_PLATE.thickness / 2) * 2;

  const bridgeWheelY = RAIL.y + rodRadius + wheelSpec.grooveRadius;
  const trolleyWheelY = BRIDGE.y + rodRadius + wheelSpec.grooveRadius;

  // End plate, in the bridge body's own coordinates. The drive bolts onto it, so
  // both read the same two numbers.
  const plateBottomLocalY = -rodRadius - 0.02;
  const plateTopLocalY = bridgeWheelY - BRIDGE.y + rodRadius + 0.02;
  const plateHeight = plateTopLocalY - plateBottomLocalY;
  const plateLocalY = plateBottomLocalY + plateHeight / 2;
  const plateInnerX = endPlateX - END_PLATE.thickness / 2;

  const travelDrive = travelDriveLayout({
    plateInnerX,
    plateHeight,
    plateLocalY,
  });

  const halfDepth = Math.max(
    rodSpacingZ + rodRadius,
    BRIDGE.wheelZ + wheelSpec.flangeRadius,
    travelDrive.halfDepth,
  );

  // The carriage runs out of rod at the end plate on one side and at the travel
  // gearcase on the other, so its two limits are genuinely different numbers.
  const clearOfPlateX = plateInnerX - TROLLEY.size / 2;
  const clearOfDriveX = travelDrive.innerFaceX - TROLLEY.size / 2;
  const driveOnLeft = travelDrive.side < 0;

  return {
    rodRadius,
    rodSpacingZ,
    wheel: wheelSpec,
    railX,
    railLength: railHalfLength * 2,
    stopZ,
    /** Bridge rods and the tie rod are cut to the same span. */
    rodSpan,
    endPlate: END_PLATE,
    endPlateX,
    plateHeight,
    /** Plate centre in the bridge body's coordinates. */
    plateLocalY,
    /** Stub axle from that plate face out through the wheel. */
    stubAxleX: railX - wheelSpec.width / 2,
    stubAxleRadius: STUB_AXLE_RADIUS,
    travelDrive,
    bridgeWheelY,
    tieY: bridgeWheelY,
    trolleyWheelY,
    trolleyWheelSpacingX: spec.trolleyWheelSpacing / 2,
    halfDepth,
    travelZ: stopZ - RAIL.stopLength / 2 - halfDepth,
    /** Where the carriage stops against the end plate, and against the drive. */
    travelToPlateX: clearOfPlateX,
    travelToDriveX: clearOfDriveX,
    travelMinX: -(driveOnLeft ? clearOfDriveX : clearOfPlateX),
    travelMaxX: driveOnLeft ? clearOfPlateX : clearOfDriveX,
    topY: Math.max(
      bridgeWheelY + wheelSpec.flangeRadius,
      BRIDGE.y + travelDrive.localTopY,
    ),
    /** Outermost wheel face, which must stay inboard of the top trim. */
    wheelOuterX: railX + wheelSpec.width / 2,
  };
}

/** The layout at the shipped defaults, for callers needing plain constants. */
export const DEFAULT_GANTRY_LAYOUT = createGantryGeometry();

export const BRIDGE_WHEEL_Y = DEFAULT_GANTRY_LAYOUT.bridgeWheelY;
export const BRIDGE_TIE_Y = DEFAULT_GANTRY_LAYOUT.tieY;
export const TROLLEY_WHEEL_Y = DEFAULT_GANTRY_LAYOUT.trolleyWheelY;
export const BRIDGE_HALF_DEPTH = DEFAULT_GANTRY_LAYOUT.halfDepth;
export const BRIDGE_TRAVEL_Z = DEFAULT_GANTRY_LAYOUT.travelZ;
export const TROLLEY_TRAVEL_MIN_X = DEFAULT_GANTRY_LAYOUT.travelMinX;
export const TROLLEY_TRAVEL_MAX_X = DEFAULT_GANTRY_LAYOUT.travelMaxX;
export const GANTRY_TOP_Y = DEFAULT_GANTRY_LAYOUT.topY;

/**
 * How far a wheel's groove floor overlaps the rod it rides. Zero means tangent,
 * which is what resting on a rod should be; positive means it is sunk into the
 * rod, the artefact this layout exists to avoid.
 */
export function measureWheelBite({ axleY, wheelSpec, rodY, rodRadius }) {
  const gap = axleY - rodY - (wheelSpec.grooveRadius + rodRadius);
  return gap < 0 ? -gap : 0;
}

/**
 * How far a wheel's flanges reach past the rod's centreline. Positive means the
 * groove actually wraps the rod rather than perching on top of it.
 */
export function measureFlangeWrap({ axleY, wheelSpec, rodY }) {
  return rodY - (axleY - wheelSpec.flangeRadius);
}

/** Both wheel/rod interfaces, for a single assertion in tests. */
export function measureWheelFit(specs) {
  const layout = specs ? createGantryGeometry(specs) : DEFAULT_GANTRY_LAYOUT;
  const pairs = {
    bridgeOnRail: {
      axleY: layout.bridgeWheelY,
      wheelSpec: layout.wheel,
      rodY: RAIL.y,
      rodRadius: layout.rodRadius,
    },
    trolleyOnBridge: {
      axleY: layout.trolleyWheelY,
      wheelSpec: layout.wheel,
      rodY: BRIDGE.y,
      rodRadius: layout.rodRadius,
    },
  };
  return Object.fromEntries(
    Object.entries(pairs).map(([name, pair]) => [
      name,
      {
        bite: measureWheelBite(pair),
        wrap: measureFlangeWrap(pair),
        grooveSlack: layout.wheel.grooveWidth - layout.rodRadius * 2,
      },
    ]),
  );
}

/** Gap between the carriage rods' underside and the top of the carriage. */
export function measureCarriageClearance({
  trolleyY = TROLLEY.y,
  trolleySize = TROLLEY.size,
  specs,
} = {}) {
  const layout = specs ? createGantryGeometry(specs) : DEFAULT_GANTRY_LAYOUT;
  return BRIDGE.y - layout.rodRadius - (trolleyY + trolleySize / 2);
}

/** Gap between a rail end collar's underside and the top of the carriage. */
export function measureStopClearance({
  trolleyY = TROLLEY.y,
  trolleySize = TROLLEY.size,
} = {}) {
  return RAIL.y - RAIL.stopRadius - (trolleyY + trolleySize / 2);
}

/** True when the carriage cannot foul a rail end collar. */
export function trolleyClearsStops(options) {
  return measureStopClearance(options) > 0;
}

/**
 * Whether the travel drive sits in the pocket it is supposed to. The gearcase is
 * the whole drive, so its own faces are the only thing to check: the inboard one
 * is the carriage's end stop, and the rest has to stay within the plate it bolts
 * to and reach the axles it turns.
 */
export function measureTravelDriveFit(specs) {
  const layout = specs ? createGantryGeometry(specs) : DEFAULT_GANTRY_LAYOUT;
  const drive = layout.travelDrive;
  const caseTopY = BRIDGE.y + drive.case.y + drive.case.height / 2;

  return {
    /** The case must reach the driven wheels' axles to drive them. */
    axleInsideCase: caseTopY - layout.bridgeWheelY,
    /** And it must not stand proud of the plate it is bolted to. */
    plateOverhang: drive.case.width / 2 - layout.endPlate.depth / 2,
    /** The drive may not be what sets the bridge's Z extent. */
    depthMargin: layout.halfDepth - drive.halfDepth,
    /** Its underside has to clear the bridge rods it is clamped around. */
    caseBottomY: BRIDGE.y + drive.case.y - drive.case.height / 2,
  };
}

/** Gap between the tie rod's underside and the tallest thing beneath it. */
export function measureTieClearance(specs) {
  const layout = specs ? createGantryGeometry(specs) : DEFAULT_GANTRY_LAYOUT;
  return {
    /** The tie rod sits on the centreline, so only the yoke passes under it. */
    overYoke:
      layout.tieY - layout.rodRadius - (layout.trolleyWheelY + 0.025),
    /** Carriage wheels are outboard in Z, so they clear it sideways instead. */
    wheelZGap:
      layout.rodSpacingZ - layout.wheel.width / 2 - layout.rodRadius,
  };
}
