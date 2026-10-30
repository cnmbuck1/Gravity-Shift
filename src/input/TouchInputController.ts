import type { InputSource } from './InputSource';
import type { Vec2 } from './tiltMath';

const RADIUS_PX = 64;

/**
 * Floating virtual joystick: touch anywhere on the play area, the base appears under the
 * thumb, and dragging sets the direction. Output feeds the same acceleration path as tilt.
 */
export class TouchInputController implements InputSource {
  enabled = false;
  private pointerId: number | null = null;
  private origin: Vec2 = [0, 0];
  private value: Vec2 = [0, 0];
  private base: HTMLDivElement;
  private knob: HTMLDivElement;

  constructor(private surface: HTMLElement, overlayRoot: HTMLElement) {
    this.base = document.createElement('div');
    this.base.className = 'joystick';
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.base.appendChild(this.knob);
    overlayRoot.appendChild(this.base);

    surface.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  read(): Vec2 {
    return this.enabled ? this.value : [0, 0];
  }

  release(): void {
    this.pointerId = null;
    this.value = [0, 0];
    this.base.classList.remove('visible');
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled || this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.origin = [e.clientX, e.clientY];
    this.base.style.left = `${e.clientX}px`;
    this.base.style.top = `${e.clientY}px`;
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.base.classList.add('visible');
    this.surface.setPointerCapture?.(e.pointerId);
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    let dx = e.clientX - this.origin[0];
    let dy = e.clientY - this.origin[1];
    const d = Math.hypot(dx, dy);
    if (d > RADIUS_PX) {
      dx = (dx / d) * RADIUS_PX;
      dy = (dy / d) * RADIUS_PX;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    // Small dead zone, then linear. Screen up = forward.
    const m = Math.min(1, d / RADIUS_PX);
    const scaled = m < 0.08 ? 0 : (m - 0.08) / 0.92;
    const len = Math.hypot(dx, dy) || 1;
    this.value = [(dx / len) * scaled, (-dy / len) * scaled];
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.release();
  };
}
