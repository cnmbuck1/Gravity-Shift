import * as THREE from 'three';
import type { GravityFrameDef, V3 } from '../levels/LevelTypes';

export type ShiftDirection = 'left' | 'right' | 'forward' | 'flip';

/**
 * The player's reference frame. `down` is the gravity direction; `forward` is "away from
 * the camera / up the screen"; `right` is screen right. Tilt input is expressed in this
 * frame, and the camera is aligned to it, so controls always stay relative to the screen.
 */
export class GravityFrame {
  readonly down = new THREE.Vector3();
  readonly forward = new THREE.Vector3();
  readonly up = new THREE.Vector3();
  readonly right = new THREE.Vector3();

  constructor(def: GravityFrameDef) {
    this.set(def);
  }

  set(def: GravityFrameDef): void {
    this.down.fromArray(def.down).normalize();
    this.forward.fromArray(def.forward).normalize();
    this.derive();
  }

  toDef(): GravityFrameDef {
    return { down: snap(this.down), forward: snap(this.forward) };
  }

  /**
   * Returns the frame after a 90° gravity shift.
   *  left / right : the surface on that side becomes the floor; forward is unchanged
   *                 (the camera rolls around the direction of travel).
   *  forward      : the surface ahead becomes the floor; you now travel "up" what was the sky
   *                 (the camera pitches).
   *  flip         : gravity reverses (180°): the ceiling becomes the floor; forward is unchanged.
   */
  shifted(dir: ShiftDirection): GravityFrameDef {
    switch (dir) {
      case 'right':
        return { down: snap(this.right), forward: snap(this.forward) };
      case 'left':
        return { down: snap(this.right.clone().negate()), forward: snap(this.forward) };
      case 'forward':
        return { down: snap(this.forward), forward: snap(this.up) };
      case 'flip':
        return { down: snap(this.up), forward: snap(this.forward) };
    }
  }

  /** Orientation whose local axes are (right, up, -forward), matching a Three.js camera. */
  quaternion(out = new THREE.Quaternion()): THREE.Quaternion {
    const back = this.forward.clone().negate();
    const m = new THREE.Matrix4().makeBasis(this.right, this.up, back);
    return out.setFromRotationMatrix(m);
  }

  private derive(): void {
    this.up.copy(this.down).negate();
    // Right-handed: right = forward × up.
    this.right.crossVectors(this.forward, this.up).normalize();
  }
}

/** Rounds to exact axis directions so repeated shifts never accumulate float error. */
function snap(v: THREE.Vector3): V3 {
  return [Math.round(v.x) || 0, Math.round(v.y) || 0, Math.round(v.z) || 0];
}
