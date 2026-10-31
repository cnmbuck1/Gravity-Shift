import { buildNeutralBasis, dot, normalize, type NeutralBasis, type Vec3 } from './tiltMath';

export type CalibrationResult = 'ok' | 'unsteady' | 'no-data';

/** Samples further than this from the window's average mean the phone was moving. */
const MAX_SPREAD_DEG = 3;
/** How long to keep retrying for a steady window before accepting the best one. */
const MAX_WAIT_MS = 1500;

/**
 * Owns the neutral orientation. Calibration averages a short window of samples, and only
 * accepts a window in which the phone was held steady, so the jolt of tapping the button
 * (or still settling into a grip) doesn't become the new neutral. If the phone never
 * settles, the steadiest window seen is used and the result says so.
 */
export class CalibrationManager {
  private basis: NeutralBasis = buildNeutralBasis([0, 0, -1]);
  private window: Vec3[] | null = null;
  private calibrated = false;

  get current(): NeutralBasis {
    return this.basis;
  }

  get isCalibrated(): boolean {
    return this.calibrated;
  }

  get isCollecting(): boolean {
    return this.window !== null;
  }

  /** Feed every filtered gravity sample here. */
  addSample(g: Vec3): void {
    this.window?.push([g[0], g[1], g[2]]);
  }

  async calibrate(windowMs = 300): Promise<CalibrationResult> {
    const started = performance.now();
    let best: { mean: Vec3; spread: number } | null = null;
    while (performance.now() - started < MAX_WAIT_MS) {
      this.window = [];
      await new Promise((r) => window.setTimeout(r, windowMs));
      const samples = this.window;
      if (!samples.length) continue;
      const mean = normalize(samples.reduce<Vec3>((a, s) => [a[0] + s[0], a[1] + s[1], a[2] + s[2]], [0, 0, 0]));
      const spread = Math.max(...samples.map((s) => (Math.acos(Math.min(1, dot(normalize(s), mean))) * 180) / Math.PI));
      if (!best || spread < best.spread) best = { mean, spread };
      if (spread <= MAX_SPREAD_DEG) break;
    }
    this.window = null;
    if (!best) return 'no-data';
    this.basis = buildNeutralBasis(best.mean);
    this.calibrated = true;
    return best.spread <= MAX_SPREAD_DEG ? 'ok' : 'unsteady';
  }
}
