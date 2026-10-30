import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsManager } from '../physics/PhysicsManager';
import type { CameraDef } from '../levels/LevelTypes';
import type { GravityFrame } from './GravityFrame';

const DEFAULT_CAMERA: CameraDef = { pitchDeg: 40, distance: 10.5, lookAhead: 2.5 };
const SHIFT_DURATION = 0.75;

/**
 * Elevated follow camera locked to the gravity frame (no free rotation). Screen-up is
 * always the frame's forward and screen-right the frame's right, which is what keeps tilt
 * intuitive: tilting the phone right always rolls the ball toward screen-right.
 *
 * It only ever rotates during a gravity shift, slerping to the new frame with ease-in-out
 * so the world appears to turn around the ball. Between shifts it just follows, looking
 * a little ahead in the direction of travel so the next corridor stays in view.
 */
export class CameraController {
  private frameQ = new THREE.Quaternion();
  private fromQ = new THREE.Quaternion();
  private toQ = new THREE.Quaternion();
  private t = 1;
  private focus = new THREE.Vector3();
  private lead = new THREE.Vector3();
  private pitchQ = new THREE.Quaternion();
  private cfg: CameraDef = DEFAULT_CAMERA;
  private ray: RAPIER.Ray;
  frozen = false;

  constructor(private camera: THREE.PerspectiveCamera, private physics: PhysicsManager) {
    this.ray = new physics.rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    this.configure();
  }

  configure(cfg: CameraDef = DEFAULT_CAMERA): void {
    this.cfg = cfg;
    this.pitchQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), (-cfg.pitchDeg * Math.PI) / 180);
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
    this.lead.set(0, 0, 0);
    this.frozen = false;
  }

  /** Begin a smooth rotation to a new gravity frame. */
  transitionTo(frame: GravityFrame): void {
    this.fromQ.copy(this.frameQ);
    frame.quaternion(this.toQ);
    this.t = 0;
  }

  update(dt: number, target: THREE.Vector3, velocity: { x: number; y: number; z: number }, frame: GravityFrame, ignore?: RAPIER.Collider): void {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / SHIFT_DURATION);
      const e = this.t < 0.5 ? 4 * this.t ** 3 : 1 - (-2 * this.t + 2) ** 3 / 2;
      this.frameQ.slerpQuaternions(this.fromQ, this.toQ, e);
    }

    if (!this.frozen) {
      // Follow fast, but slower while rotating so the move reads as one smooth motion.
      const k = this.t < 1 ? 4 : 6;
      this.focus.lerp(target, 1 - Math.exp(-dt * k));

      // Velocity look-ahead in the floor plane, heavily smoothed so the view never jerks.
      const v = new THREE.Vector3(velocity.x, velocity.y, velocity.z);
      v.addScaledVector(frame.down, -v.dot(frame.down)).multiplyScalar(0.35);
      if (v.length() > this.cfg.lookAhead) v.setLength(this.cfg.lookAhead);
      this.lead.lerp(v, 1 - Math.exp(-dt * 1.8));
    }

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.frameQ);
    const camQ = this.frameQ.clone().multiply(this.pitchQ);
    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camQ);
    // A small constant forward bias keeps more of the course ahead than behind on screen.
    const lookAt = this.focus.clone().addScaledVector(forward, this.cfg.lookAhead * 0.35).add(this.lead);

    // Pull the camera in if geometry sits between it and the ball. The ray starts a little
    // above the look point so low maze walls right beside the ball don't count.
    let dist = this.cfg.distance;
    const back = lookDir.clone().negate();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.frameQ);
    const origin = lookAt.clone().addScaledVector(up, 1.2);
    this.ray.origin = { x: origin.x, y: origin.y, z: origin.z };
    this.ray.dir = { x: back.x, y: back.y, z: back.z };
    const hit = this.physics.world.castRay(this.ray, dist, true, undefined, undefined, ignore);
    if (hit) dist = Math.max(2, hit.timeOfImpact - 0.4);
    if (hit) lookAt.addScaledVector(up, 1.2);

    this.camera.position.copy(lookAt).addScaledVector(back, dist);
    this.camera.quaternion.copy(camQ);
  }
}
