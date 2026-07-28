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
  lowerSpeed: number;
  liftSpeed: number;
  closeSpeed: number;
  clawStrength: number;
  clawFriction: number;
  swingDamping: number;
  prizeMass: number;
  prizeFriction: number;
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
}

export interface SessionEvent {
  at: number;
  type: string;
  data?: Record<string, string | number | boolean>;
}
