/**
 * Pure tilt math, kept free of DOM and Three.js so it can be unit tested.
 *
 * Coordinate frames
 * - Device frame (W3C): +x to the right edge of the screen, +y toward the top edge,
 *   +z out of the screen toward the player's face.
 * - "Gravity vector" g: unit vector pointing toward the ground, expressed in the device frame.
 *   A phone lying flat on a table gives g = (0, 0, -1).
 *
 * Calibration stores a neutral gravity vector g0. Tilt is measured relative to g0 so the
 * player can hold the phone at any comfortable angle (e.g. 30-45 degrees toward their face).
 */

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

const DEG = Math.PI / 180;

export function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-9) return [0, 0, -1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Gravity direction in the device frame from W3C DeviceOrientation beta/gamma (degrees).
 * Derived from R = Rz(alpha) * Rx(beta) * Ry(gamma); g = R^T * (0, 0, -1).
 * Alpha (compass heading) does not affect gravity, so magnetometer drift cannot cause drift here.
 */
export function gravityFromOrientation(betaDeg: number, gammaDeg: number): Vec3 {
  const b = betaDeg * DEG;
  const g = gammaDeg * DEG;
  return [Math.cos(b) * Math.sin(g), -Math.sin(b), -Math.cos(b) * Math.cos(g)];
}

/**
 * Rotates a device-frame gravity vector into the current screen frame. In portrait
 * (angle 0) this is the identity; other angles are handled in case orientation lock fails.
 */
export function toScreenFrame(g: Vec3, screenAngleDeg: number): Vec3 {
  const a = (((screenAngleDeg % 360) + 360) % 360) * DEG;
  if (a === 0) return g;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [g[0] * c - g[1] * s, g[0] * s + g[1] * c, g[2]];
}

export interface NeutralBasis {
  neutral: Vec3;
  right: Vec3;
  forward: Vec3;
}

/**
 * Builds an orthonormal basis around the neutral gravity vector. "right" is the screen's
 * x axis projected onto the plane perpendicular to neutral gravity; "forward" is the screen's
 * y axis projected the same way. Projecting the screen axes keeps "tilt right" meaning
 * "right edge goes down" no matter how steeply the phone is held.
 */
export function buildNeutralBasis(neutralGravity: Vec3): NeutralBasis {
  const n = normalize(neutralGravity);
  // If the phone is held almost exactly vertical, the screen y axis is parallel to gravity;
  // fall back to the screen z axis so the basis stays well defined.
  let right = normalize(sub([1, 0, 0], scale(n, n[0])));
  const yRef: Vec3 = Math.abs(n[1]) > 0.97 ? [0, 0, n[1] > 0 ? 1 : -1] : [0, 1, 0];
  let forward = sub(yRef, scale(n, dot(yRef, n)));
  forward = normalize(sub(forward, scale(right, dot(forward, right))));
  right = normalize(right);
  return { neutral: n, right, forward };
}

/**
 * Returns tilt angles in degrees relative to the neutral basis:
 *  x > 0 : right edge lowered (ball should roll right)
 *  y > 0 : top edge lowered / tipped away from the player (ball should roll forward)
 */
export function relativeTiltDegrees(g: Vec3, basis: NeutralBasis): Vec2 {
  const gx = clamp(dot(g, basis.right), -1, 1);
  const gy = clamp(dot(g, basis.forward), -1, 1);
  return [Math.asin(gx) / DEG, Math.asin(gy) / DEG];
}

export interface ResponseShape {
  /** Tilt (degrees) ignored around neutral. */
  deadZoneDeg: number;
  /** Tilt (degrees), measured beyond the dead zone, that produces full input. */
  maxTiltDeg: number;
  /** Multiplier applied to the tilt before shaping. 1 = default. */
  sensitivity: number;
  /** 1 = linear, >1 = finer control at small angles. */
  curve: number;
}

/**
 * Converts tilt angles into a normalized input vector with |v| <= 1.
 * Uses a radial dead zone (no diagonal bias) with a smooth re-scale so input begins at 0
 * right at the dead-zone edge, avoiding a jump.
 */
export function shapeTilt(tiltDeg: Vec2, shape: ResponseShape): Vec2 {
  const x = tiltDeg[0] * shape.sensitivity;
  const y = tiltDeg[1] * shape.sensitivity;
  const mag = Math.hypot(x, y);
  if (mag <= shape.deadZoneDeg || mag < 1e-6) return [0, 0];
  const t = clamp((mag - shape.deadZoneDeg) / Math.max(0.001, shape.maxTiltDeg), 0, 1);
  const out = Math.pow(t, shape.curve);
  return [(x / mag) * out, (y / mag) * out];
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
