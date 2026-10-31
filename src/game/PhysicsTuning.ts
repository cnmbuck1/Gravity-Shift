/**
 * Everything that shapes how the ball feels, grouped into switchable profiles so changes
 * can be compared side by side on a phone (Settings → Physics) instead of tuned blindly.
 */
export interface PhysicsTuning {
  /** m/s² of planar acceleration at full tilt. */
  maxAccel: number;
  /** Multiplier on the part of the push that opposes current motion (braking). */
  brakeBoost: number;
  /** Planar speed cap, m/s. Above it input can only steer or slow. */
  maxSpeed: number;
  /** Fraction of control while airborne. */
  airControl: number;
  /** Rolling resistance deceleration, m/s², when grounded. */
  rollingResistance: number;
  friction: number;
  /** Bounciness off walls (0 = dead, 1 = perfectly elastic). */
  restitution: number;
  density: number;
  linearDamping: number;
  angularDamping: number;
  /** Tilt (degrees beyond the dead zone) for full input. */
  maxTiltDeg: number;
  /** Response curve exponent: 1 = linear, higher = finer at small angles. */
  tiltCurve: number;
}

export type PhysicsProfile = 'classic' | 'refined';

/** The v0.1/v0.2 behaviour, kept unchanged for comparison. */
export const CLASSIC: PhysicsTuning = {
  maxAccel: 17,
  brakeBoost: 1.5,
  maxSpeed: 11,
  airControl: 0.25,
  rollingResistance: 0.7,
  friction: 1.0,
  restitution: 0.25,
  density: 2.0,
  linearDamping: 0.04,
  angularDamping: 0.12,
  maxTiltDeg: 20,
  tiltCurve: 1.2,
};

/**
 * Tuned for narrow labyrinth corridors:
 * - lower top speed and stronger braking so corners can be taken without overshooting;
 * - more rolling resistance so a level phone brings the ball to rest instead of coasting;
 * - less bounce so wall contact feels weighty rather than pinball-like;
 * - full input at a slightly smaller tilt and a gentler curve, so small tilts respond sooner.
 */
export const REFINED: PhysicsTuning = {
  ...CLASSIC,
  maxAccel: 16,
  brakeBoost: 2.1,
  maxSpeed: 9,
  rollingResistance: 1.1,
  restitution: 0.12,
  linearDamping: 0.06,
  angularDamping: 0.2,
  maxTiltDeg: 18,
  tiltCurve: 1.1,
};

export const PROFILES: Record<PhysicsProfile, PhysicsTuning> = { classic: CLASSIC, refined: REFINED };
