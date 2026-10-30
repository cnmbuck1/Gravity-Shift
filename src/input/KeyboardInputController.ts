import type { InputSource } from './InputSource';
import type { Vec2 } from './tiltMath';

/** Desktop development input (arrow keys / WASD). Ramps in so it behaves like an analog tilt. */
export class KeyboardInputController implements InputSource {
  private keys = new Set<string>();
  private value: Vec2 = [0, 0];

  constructor() {
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  update(dt: number): void {
    const k = this.keys;
    const tx = (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0);
    const ty = (k.has('arrowup') || k.has('w') ? 1 : 0) - (k.has('arrowdown') || k.has('s') ? 1 : 0);
    const a = 1 - Math.exp(-dt / 0.08);
    this.value = [this.value[0] + (tx - this.value[0]) * a, this.value[1] + (ty - this.value[1]) * a];
  }

  read(): Vec2 {
    const m = Math.hypot(this.value[0], this.value[1]);
    return m > 1 ? [this.value[0] / m, this.value[1] / m] : this.value;
  }
}
