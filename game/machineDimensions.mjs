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

/** Solver budget for the closed-loop finger linkage. */
export const SOLVER_ITERATIONS = 12;
export const INTERNAL_PGS_ITERATIONS = 2;
