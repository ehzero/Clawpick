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

export interface PhysicsSettings {
  moveSpeed: number;
  trolleyAcceleration: number;
  lowerSpeed: number;
  liftSpeed: number;
  plungerSpeed: number;
  plungerMaxForce: number;
  clawFriction: number;
  swingLinearDamping: number;
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
}

export interface SessionEvent {
  at: number;
  type: string;
  data?: Record<string, string | number | boolean>;
}
