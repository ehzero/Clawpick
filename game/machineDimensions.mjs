export const PRIZE_DECK_FLOOR_Y = 0;
export const PRIZE_DECK_COLLIDER_HALF_HEIGHT = 0.12;
export const PRIZE_DECK_COLLIDER_CENTER_Y =
  PRIZE_DECK_FLOOR_Y - PRIZE_DECK_COLLIDER_HALF_HEIGHT;

/**
 * Fixed simulation rate. The machine step, the winch trajectory and every
 * Rapier write run on this clock rather than on the display refresh rate, so
 * the mechanism behaves identically on a 60 Hz and a 144 Hz screen.
 */
export const PHYSICS_TIME_STEP = 1 / 60;

/**
 * Cabinet interior, measured to the faces the gantry has to stay clear of.
 * Rod lengths are derived from these rather than being dimensioned by hand.
 * `tests/drive-axis.test.mjs` pins them against the colliders in MachineScene.
 */
export const CABINET = Object.freeze({
  /** Inner face of the side glass. */
  glassHalfWidth: 2.8325,
  /** Inner face of the front and rear glass. */
  glassHalfDepth: 1.7925,
  /** Inner edge of the top side trim, which the rail wheels pass beside. */
  topTrimHalfWidth: 2.78,
  /** Inner face of the side and end wall colliders. */
  wallHalfWidth: 2.88,
  wallHalfDepth: 1.78,
});

/** Solver budget for the closed-loop finger linkage. */
export const SOLVER_ITERATIONS = 12;
export const INTERNAL_PGS_ITERATIONS = 2;
