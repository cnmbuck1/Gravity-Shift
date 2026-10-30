import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsManager } from '../physics/PhysicsManager';
import type { GravityFrame } from './GravityFrame';

const PITCH_DEG = 40;
const DISTANCE = 10.5;
const LOOK_AHEAD = 2.5;
const SHIFT_DURATION = 0.75;

/**
 * Elevated follow camera locked to the gravity frame (no free rotation). Screen-up is
 * always the frame's forward and screen-right the frame's right, which is what keeps tilt
 * intuitive: tilting the phone right always rolls the ball toward screen-right.
 *
 * On a gravity shift the frame orientation is slerped with ease-in-out, so the world
 * appears to rotate around the ball rather than the camera cutting.
 */
export class CameraController {
  private frameQ = new THREE.Quaternion();
  private fromQ = new THREE.Quaternion();
  private toQ = new THREE.Quaternion();
  private t = 1;
  private focus = new THREE.Vector3();
  private pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (-PITCH_DEG * Math.PI) / 180);
  private ray: RAPIER.Ray;
  frozen = false;

  constructor(private camera: THREE.PerspectiveCamera, private physics: PhysicsManager) {
    this.ray = new physics.rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  }

  get transitioning(): boolean {
    return this.t < 1;
  }

  /** Snap instantly (level start / respawn). */
  snap(frame: GravityFrame, focus: THREE.Vector3): void {
    frame.quaternion(this.frameQ);
    this.toQ.copy(this.frameQ);
    this.t = 1;
    this.focus.copy(focus);
    this.frozen = false;
  }

  /** Begin a smooth rotation to a new gravity frame. */
  transitionTo(frame: GravityFrame): void {
    this.fromQ.copy(this.frameQ);
    frame.quaternion(this.toQ);
    this.t = 0;
  }

  update(dt: number, target: THREE.Vector3, ignore?: RAPIER.Collider): void {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / SHIFT_DURATION);
      const e = this.t < 0.5 ? 4 * this.t ** 3 : 1 - (-2 * this.t + 2) ** 3 / 2;
      this.frameQ.slerpQuaternions(this.fromQ, this.toQ, e);
    }

    if (!this.frozen) {
      // Follow fast, but slower while rotating so the move reads as one smooth motion.
      const k = this.t < 1 ? 4 : 7;
      this.focus.lerp(target, 1 - Math.exp(-dt * k));
    }

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.frameQ);
    const camQ = this.frameQ.clone().multiply(this.pitchQ);
    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camQ);
    const lookAt = this.focus.clone().addScaledVector(forward, LOOK_AHEAD);

    // Pull the camera in if geometry sits between it and the ball.
    let dist = DISTANCE;
    const back = lookDir.clone().negate();
    this.ray.origin = { x: lookAt.x, y: lookAt.y, z: lookAt.z };
    this.ray.dir = { x: back.x, y: back.y, z: back.z };
    const hit = this.physics.world.castRay(this.ray, DISTANCE, true, undefined, undefined, ignore);
    if (hit) dist = Math.max(2, hit.timeOfImpact - 0.4);

    this.camera.position.copy(lookAt).addScaledVector(back, dist);
    this.camera.quaternion.copy(camQ);
  }
}
