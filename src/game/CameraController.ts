import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsManager } from '../physics/PhysicsManager';
import type { CameraDef } from '../levels/LevelTypes';
import type { GravityFrame } from './GravityFrame';

/** How far (radians) the view rolls toward world up while the ball is on a wall. Zero keeps the full 90° turn. */
const WALL_LIFT = 0;
/** On a wall, the view is kept at least this high so it looks over the maze walls of the floor below. */
const WALL_VIEW_Y = 3;
/** How far the view leans out while the ball rolls on a ceiling. */
const CEILING_LEAN = 1.05;
const DEFAULT_CAMERA: CameraDef = { pitchDeg: 40, distance: 10.5, lookAhead: 2.5 };
const SHIFT_DURATION = 0.75;
/** How far (m) the camera sinks after a falling ball before letting it vanish below. */
const FALL_FOLLOW = 5;

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
  /** Ball position the last time it touched a surface; falls are followed relative to it. */
  private groundRef = new THREE.Vector3();
  /** Radians the view is rolled toward world up while on a wall (smoothed), see WALL_LIFT. */
  private lift = 0;
  /** Smoothed camera distance and raise after the anti-clipping pull-in. */
  private camDist = -1;
  private camRaise = 0;
  private wallRaise = 0;
  /** World direction to lean the view toward while on a ceiling (set by the shift zone used). */
  lean: THREE.Vector3 | null = null;
  /** Colliders the anti-clipping ray ignores (glass). */
  seeThrough: Set<number> = new Set();
  private fly: { curve: THREE.CatmullRomCurve3; t: number; duration: number; done: () => void } | null = null;

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
    this.groundRef.copy(focus);
    this.camDist = -1;
    this.camRaise = 0;
  }

  get inFlyover(): boolean {
    return this.fly !== null;
  }

  /**
   * Course preview: glide over `points` (goal → … → start) high above the maze, descending
   * into the normal gameplay view at the last point so the hand-off has no cut.
   */
  flyover(points: THREE.Vector3[], frame: GravityFrame, duration: number, done: () => void): void {
    frame.quaternion(this.frameQ);
    this.t = 1;
    this.lead.set(0, 0, 0);
    this.fly = { curve: new THREE.CatmullRomCurve3(points, false, 'centripetal'), t: 0, duration, done };
  }

  /** Jump to the end of the flyover. */
  skipFlyover(): void {
    if (this.fly) this.fly.t = this.fly.duration;
  }

  /** Begin a smooth rotation to a new gravity frame. */
  transitionTo(frame: GravityFrame): void {
    this.fromQ.copy(this.frameQ);
    frame.quaternion(this.toQ);
    this.t = 0;
  }

  update(dt: number, target: THREE.Vector3, velocity: { x: number; y: number; z: number }, frame: GravityFrame, grounded: boolean, ignore?: RAPIER.Collider): void {
    if (this.fly) {
      const f = this.fly;
      f.t = Math.min(f.duration, f.t + dt);
      const u = f.t / f.duration;
      const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      const focus = f.curve.getPoint(e);
      const pitch = THREE.MathUtils.lerp(80, this.cfg.pitchDeg, e);
      const dist = THREE.MathUtils.lerp(this.cfg.distance * 1.9, this.cfg.distance, e);
      const q = this.frameQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (-pitch * Math.PI) / 180));
      const back = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.frameQ);
      const lookAt = focus.clone().addScaledVector(fwd, (this.cfg.forwardBias ?? this.cfg.lookAhead * 0.35) * e);
      this.camera.position.copy(lookAt).addScaledVector(back, dist);
      this.camera.quaternion.copy(q);
      if (f.t >= f.duration) {
        this.fly = null;
        this.focus.copy(target);
        f.done();
      }
      return;
    }

    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / SHIFT_DURATION);
      const e = this.t < 0.5 ? 4 * this.t ** 3 : 1 - (-2 * this.t + 2) ** 3 / 2;
      this.frameQ.slerpQuaternions(this.fromQ, this.toQ, e);
    }

    if (grounded) this.groundRef.copy(target);
    if (!this.frozen) {
      // Falling into the abyss: keep following, but more lazily and only FALL_FOLLOW metres
      // below where the ball left the course, so it visibly drops away into the void.
      const t = target.clone();
      const drop = t.clone().sub(this.groundRef).dot(frame.down);
      const falling = drop > 0.6 && this.t >= 1;
      if (drop > FALL_FOLLOW) t.addScaledVector(frame.down, FALL_FOLLOW - drop);
      // Follow fast, but slower while rotating or falling so the move reads as one smooth motion.
      const k = this.t < 1 ? 4 : falling ? 3 : 6;
      this.focus.lerp(t, 1 - Math.exp(-dt * k));

      // Velocity look-ahead in the floor plane, heavily smoothed so the view never jerks.
      const v = new THREE.Vector3(velocity.x, velocity.y, velocity.z);
      v.addScaledVector(frame.down, -v.dot(frame.down)).multiplyScalar(0.3);
      if (v.length() > this.cfg.lookAhead) v.setLength(this.cfg.lookAhead);
      this.lead.lerp(v, 1 - Math.exp(-dt * 1.5));
    }

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.frameQ);
    // On a wall the camera would sit level with the floor the ball came from, so that floor
    // and its maze walls block the view. Roll the view about the forward axis so the camera
    // rises toward the sky side and looks down across the wall instead.
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.frameQ);
    // On a ceiling the camera sits under the course, so it leans out toward open space instead.
    const onWall = Math.abs(frame.down.y) < 0.5;
    const onCeiling = frame.down.y > 0.5;
    const leanTo = onWall ? new THREE.Vector3(0, 1, 0) : onCeiling ? this.lean : null;
    const liftTarget = leanTo ? (onWall ? WALL_LIFT : CEILING_LEAN) * Math.sign(right.dot(leanTo) || 1) : 0;
    this.lift += (liftTarget - this.lift) * (1 - Math.exp(-dt * 3));
    const roll = new THREE.Quaternion().setFromAxisAngle(forward, this.lift);
    const camQ = roll.clone().multiply(this.frameQ).multiply(this.pitchQ);
    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camQ);
    // A small constant forward bias keeps more of the course ahead than behind on screen.
    const lookAt = this.focus.clone().addScaledVector(forward, this.cfg.forwardBias ?? this.cfg.lookAhead * 0.35).add(this.lead);
    // Just after shifting onto a wall the ball sits at floor height, so a camera level with it would be
    // inside the maze walls. Slide the view (not tilt it) up to clear them; it centres again as the ball climbs.
    const wallRaise = onWall ? Math.max(0, WALL_VIEW_Y - lookAt.y) : 0;
    this.wallRaise += (wallRaise - this.wallRaise) * (1 - Math.exp(-dt * 4));
    lookAt.y += this.wallRaise;

    // Pull the camera in if geometry sits between it and the ball. The ray starts a little
    // above the look point so low maze walls right beside the ball don't count.
    let dist = this.cfg.distance;
    let raise = 0;
    const back = lookDir.clone().negate();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.frameQ).applyQuaternion(roll);
    const origin = lookAt.clone().addScaledVector(up, 1.2);
    this.ray.origin = { x: origin.x, y: origin.y, z: origin.z };
    this.ray.dir = { x: back.x, y: back.y, z: back.z };
    const skip = this.seeThrough;
    // Mid-shift the view swings through the floor plane; ignore the ray then or the camera lurches in at the ball.
    const hit = this.t < 1 ? null : this.physics.world.castRay(this.ray, dist, true, undefined, undefined, ignore, undefined, skip.size ? (c: RAPIER.Collider) => !skip.has(c.handle) : undefined);
    if (hit) {
      dist = Math.max(2, hit.timeOfImpact - 0.4);
      raise = 1.2;
    }
    // Ease the pull-in so the view never pops when the ray flickers on and off an edge
    // (snap in quickly so geometry doesn't cover the ball, drift back out slowly).
    if (this.camDist < 0) this.camDist = dist;
    const kIn = 1 - Math.exp(-dt * 14);
    const kOut = 1 - Math.exp(-dt * 2.5);
    this.camDist += (dist - this.camDist) * (dist < this.camDist ? kIn : kOut);
    this.camRaise += (raise - this.camRaise) * (raise > this.camRaise ? kIn : kOut);
    dist = this.camDist;
    lookAt.addScaledVector(up, this.camRaise);

    this.camera.position.copy(lookAt).addScaledVector(back, dist);
    this.camera.quaternion.copy(camQ);
  }
}
