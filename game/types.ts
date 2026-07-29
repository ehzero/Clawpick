export type GamePhase =
  | "aiming"
  | "descending"
  | "closing"
  | "lifting"
  | "returning"
  | "releasing"
  | "settling"
  | "result";

export type GameResult = "win" | "lose" | null;

export type ManualPlungerState = "open" | "closed";

export type ManualCableDirection = "lower" | "raise" | null;

export interface PhysicsSettings {
  moveSpeed: number;
  trolleyAcceleration: number;
  returnSpeedMultiplier: number;
  returnAccelerationMultiplier: number;
  lowerSpeed: number;
  liftSpeed: number;
  cableRetractedLength: number;
  cableExtendedLength: number;
  plungerSpeed: number;
  plungerMaxForce: number;
  plungerPositionTolerance: number;
  plungerVelocityTolerance: number;
  plungerStallTimeout: number;
  clawFriction: number;
  swingLinearDamping: number;
  housingAngularDamping: number;
  prizeMass: number;
  prizeFriction: number;
  prizeLinearDamping: number;
  angularDamping: number;
  gravity: number;
}

export interface PerformanceMetrics {
  fps: number;
  minFps: number;
  physicsMs: number;
  activeBodies: number;
  cableError: number;
  cableLength: number;
  cableDistance: number;
  swingAngle: number;
  tipClearance: number;
  plungerForce: number;
  plungerStroke: number;
  plungerVelocity: number;
}

export interface SessionEvent {
  at: number;
  type: string;
  data?: Record<string, string | number | boolean>;
}
