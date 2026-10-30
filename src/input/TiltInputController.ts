import type { InputSource } from './InputSource';
import type { CalibrationManager } from './CalibrationManager';
import {
  gravityFromOrientation,
  normalize,
  relativeTiltDegrees,
  shapeTilt,
  toScreenFrame,
  type ResponseShape,
  type Vec2,
  type Vec3,
} from './tiltMath';

export type MotionPermission = 'granted' | 'denied' | 'unsupported';

/** Tilt (beyond the dead zone) that produces full acceleration. */
const MAX_TILT_DEG = 20;
/** No sensor events for this long → treat as neutral, never keep pushing on stale data. */
const STALE_MS = 400;

interface IOSPermissionAPI {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/**
 * Reads phone tilt via the W3C DeviceOrientation API. On iOS this is backed by Core Motion's
 * sensor-fused attitude (gyro + accelerometer), which is far smoother and lower-latency than
 * raw accelerometer data. In a Capacitor app it runs inside WKWebView, so the same code path
 * works in Safari for quick testing and in the packaged app.
 */
export class TiltInputController implements InputSource {
  readonly shape: ResponseShape = { deadZoneDeg: 1.5, maxTiltDeg: MAX_TILT_DEG, sensitivity: 1, curve: 1.2 };
  /** Seconds. Low-pass time constant applied to the gravity vector. */
  smoothing = 0.045;

  private filtered: Vec3 | null = null;
  private lastEventTime = 0;
  private listening = false;
  private eventCount = 0;
  private rateWindowStart = performance.now();
  /** Measured sensor event rate, for the debug overlay. */
  sampleRateHz = 0;
  /** Latest relative tilt in degrees, for the debug overlay. */
  tiltDeg: Vec2 = [0, 0];

  constructor(private calibration: CalibrationManager) {}

  get hasData(): boolean {
    return this.filtered !== null && performance.now() - this.lastEventTime < STALE_MS;
  }

  /**
   * Must be called synchronously from a user gesture (tap) on iOS 13+, otherwise
   * Safari/WKWebView rejects the permission request without showing a prompt.
   */
  async requestPermission(): Promise<MotionPermission> {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return 'unsupported';
    const api = window.DeviceOrientationEvent as unknown as IOSPermissionAPI;
    if (typeof api.requestPermission === 'function') {
      try {
        const result = await api.requestPermission();
        if (result !== 'granted') return 'denied';
      } catch {
        return 'denied';
      }
    }
    this.start();
    // Desktop browsers expose the API but never deliver real data. Wait briefly for a sample.
    const ok = await this.waitForData(1500);
    return ok ? 'granted' : 'unsupported';
  }

  start(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('deviceorientation', this.onOrientation);
  }

  stop(): void {
    this.listening = false;
    window.removeEventListener('deviceorientation', this.onOrientation);
    this.filtered = null;
  }

  /** Clears filter state, e.g. after the app returns from the background. */
  resetFilter(): void {
    this.filtered = null;
  }

  read(): Vec2 {
    if (!this.hasData || !this.calibration.isCalibrated || this.calibration.isCollecting) {
      this.tiltDeg = [0, 0];
      return [0, 0];
    }
    this.tiltDeg = relativeTiltDegrees(this.filtered!, this.calibration.current);
    return shapeTilt(this.tiltDeg, this.shape);
  }

  private waitForData(timeoutMs: number): Promise<boolean> {
    const start = performance.now();
    return new Promise((resolve) => {
      const check = () => {
        if (this.filtered) resolve(true);
        else if (performance.now() - start > timeoutMs) resolve(false);
        else window.setTimeout(check, 50);
      };
      check();
    });
  }

  private onOrientation = (e: DeviceOrientationEvent): void => {
    if (e.beta === null || e.gamma === null) return;
    const now = performance.now();
    const raw = toScreenFrame(gravityFromOrientation(e.beta, e.gamma), screenAngle());

    if (!this.filtered || now - this.lastEventTime > STALE_MS) {
      this.filtered = raw;
    } else {
      // Frame-rate independent exponential smoothing. Small time constant keeps latency
      // to roughly one or two sensor frames while removing hand tremor.
      const dt = (now - this.lastEventTime) / 1000;
      const a = this.smoothing <= 0 ? 1 : 1 - Math.exp(-dt / this.smoothing);
      const f = this.filtered;
      this.filtered = normalize([f[0] + (raw[0] - f[0]) * a, f[1] + (raw[1] - f[1]) * a, f[2] + (raw[2] - f[2]) * a]);
    }
    this.lastEventTime = now;
    this.calibration.addSample(this.filtered);

    this.eventCount++;
    if (now - this.rateWindowStart >= 1000) {
      this.sampleRateHz = (this.eventCount * 1000) / (now - this.rateWindowStart);
      this.eventCount = 0;
      this.rateWindowStart = now;
    }
  };
}

function screenAngle(): number {
  if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.angle === 'number') {
    return screen.orientation.angle;
  }
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}
