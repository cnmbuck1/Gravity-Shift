import { buildNeutralBasis, normalize, type NeutralBasis, type Vec3 } from './tiltMath';

/**
 * Owns the neutral orientation. Calibration averages a short window of samples so a
 * button-press jolt doesn't become the new neutral.
 */
export class CalibrationManager {
  private basis: NeutralBasis = buildNeutralBasis([0, 0, -1]);
  private collecting: { sum: Vec3; count: number; resolve: (ok: boolean) => void } | null = null;
  private calibrated = false;

  get current(): NeutralBasis {
    return this.basis;
  }

  get isCalibrated(): boolean {
    return this.calibrated;
  }

  get isCollecting(): boolean {
    return this.collecting !== null;
  }

  /** Feed every filtered gravity sample here. */
  addSample(g: Vec3): void {
    if (!this.collecting) return;
    const s = this.collecting.sum;
    s[0] += g[0];
    s[1] += g[1];
    s[2] += g[2];
    this.collecting.count++;
  }

  /** Captures the average orientation over `durationMs` as the new neutral. */
  calibrate(durationMs = 250): Promise<boolean> {
    if (this.collecting) this.collecting.resolve(false);
    return new Promise((resolve) => {
      this.collecting = { sum: [0, 0, 0], count: 0, resolve };
      window.setTimeout(() => {
        const c = this.collecting;
        if (!c || c.resolve !== resolve) return;
        this.collecting = null;
        if (c.count === 0) {
          resolve(false);
          return;
        }
        this.basis = buildNeutralBasis(normalize(c.sum));
        this.calibrated = true;
        resolve(true);
      }, durationMs);
    });
  }
}
