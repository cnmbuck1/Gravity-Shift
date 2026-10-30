import type { ControlMode } from '../settings/SettingsManager';
import { CalibrationManager } from './CalibrationManager';
import { KeyboardInputController } from './KeyboardInputController';
import { TiltInputController, type MotionPermission } from './TiltInputController';
import { TouchInputController } from './TouchInputController';
import type { Vec2 } from './tiltMath';

/**
 * Chooses the active control scheme and merges it into one movement intent.
 * Keyboard is always merged in so desktop development works in either mode.
 */
export class InputManager {
  readonly calibration = new CalibrationManager();
  readonly tilt = new TiltInputController(this.calibration);
  readonly touch: TouchInputController;
  readonly keyboard = new KeyboardInputController();
  mode: ControlMode = 'tilt';
  permission: MotionPermission | 'unknown' = 'unknown';
  /** Last merged value, for debug display. */
  current: Vec2 = [0, 0];

  constructor(touchSurface: HTMLElement, overlayRoot: HTMLElement) {
    this.touch = new TouchInputController(touchSurface, overlayRoot);
  }

  setMode(mode: ControlMode): void {
    this.mode = mode;
    this.touch.enabled = mode === 'touch';
    if (mode !== 'touch') this.touch.release();
  }

  /** Call from a tap handler (see TiltInputController.requestPermission). */
  async enableTilt(): Promise<MotionPermission> {
    this.permission = await this.tilt.requestPermission();
    return this.permission;
  }

  sample(dt: number): Vec2 {
    this.keyboard.update(dt);
    const primary = this.mode === 'tilt' ? this.tilt.read() : this.touch.read();
    const kb = this.keyboard.read();
    let x = primary[0] + kb[0];
    let y = primary[1] + kb[1];
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    this.current = [x, y];
    return this.current;
  }
}
