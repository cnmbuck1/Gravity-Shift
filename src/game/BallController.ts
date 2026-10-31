import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsManager } from '../physics/PhysicsManager';
import type { GravityFrame } from './GravityFrame';
import { COLORS } from '../render/Materials';
import { REFINED, type PhysicsTuning } from './PhysicsTuning';

export const BALL_RADIUS = 0.5;

/**
 * The player sphere: Rapier dynamic body + metallic mesh. Records previous and current
 * physics transforms each step so rendering can interpolate between them.
 */
export class BallController {
  readonly mesh: THREE.Group;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  grounded = false;
  /** Active feel profile (see PhysicsTuning). Input becomes acceleration in the floor plane,
   * which Rapier integrates with gravity, friction and collisions; rolling comes from contact
   * friction, so the spin you see is simulated, not animated. */
  tuning: PhysicsTuning = REFINED;
  /** Set after each step when the ball's velocity changed more than its forces explain. */
  lastImpact = 0;
  private expectedVel = new THREE.Vector3();
  /** Seconds since last grounded; used for a short "coyote" window. */
  airTime = 0;

  private prevPos = new THREE.Vector3();
  private currPos = new THREE.Vector3();
  private prevRot = new THREE.Quaternion();
  private currRot = new THREE.Quaternion();
  private ray: RAPIER.Ray;
  private tmp = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private glow: THREE.Mesh;
  private trail: THREE.Mesh[] = [];
  private trailTimer = 0;
  private trailIndex = 0;

  constructor(private physics: PhysicsManager, scene: THREE.Scene) {
    const R = physics.rapier;
    this.body = physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setCcdEnabled(true)
        .setLinearDamping(REFINED.linearDamping)
        .setAngularDamping(REFINED.angularDamping)
        .setCanSleep(false),
    );
    this.collider = physics.world.createCollider(
      R.ColliderDesc.ball(BALL_RADIUS)
        .setDensity(REFINED.density)
        .setFriction(REFINED.friction)
        .setRestitution(REFINED.restitution)
        .setFrictionCombineRule(R.CoefficientCombineRule.Max),
      this.body,
    );
    this.ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

    this.mesh = new THREE.Group();
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS, 48, 32),
      new THREE.MeshPhysicalMaterial({ color: '#d9e2ee', metalness: 1, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.6 }),
    );
    sphere.castShadow = true;
    this.mesh.add(sphere);
    // Glowing equator + meridian bands make the rotation readable.
    const bandMat = new THREE.MeshStandardMaterial({ color: COLORS.safe, emissive: COLORS.safe, emissiveIntensity: 2.5 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(BALL_RADIUS * 1.001, 0.025, 8, 64), bandMat);
    this.mesh.add(band);
    const band2 = band.clone();
    band2.rotation.y = Math.PI / 2;
    this.mesh.add(band2);
    // Faint cyan rim so the sphere stays visible against bright metal and dark void alike.
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS * 1.08, 32, 16),
      new THREE.MeshBasicMaterial({ color: COLORS.safe, transparent: true, opacity: 0.16, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.mesh.add(rim);
    // Small cyan under-light: a pool of light on the floor marks the ball's position.
    const under = new THREE.PointLight(COLORS.safe, 2.2, 2.6, 2);
    this.mesh.add(under);
    scene.add(this.mesh);

    // Respawn flash.
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS * 1.6, 24, 16),
      new THREE.MeshBasicMaterial({ color: COLORS.safe, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    scene.add(this.glow);

    // Subtle motion trail: a few fading ghost spheres.
    const trailMat = new THREE.MeshBasicMaterial({ color: COLORS.safe, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 8; i++) {
      const t = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS * 0.55, 12, 8), trailMat.clone());
      scene.add(t);
      this.trail.push(t);
    }
  }

  get position(): THREE.Vector3 {
    return this.currPos;
  }

  get speed(): number {
    return this.vel.length();
  }

  teleport(p: THREE.Vector3): void {
    this.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.currPos.copy(p);
    this.prevPos.copy(p);
    this.vel.set(0, 0, 0);
    this.expectedVel.set(0, 0, 0);
    this.lastImpact = 0;
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.9;
  }

  /**
   * Called before each fixed physics step.
   * `input` is (x right, y forward), |input| <= 1, expressed in the gravity frame.
   */
  applyInput(input: [number, number], frame: GravityFrame, dt: number): void {
    const T = this.tuning;
    const lv = this.body.linvel();
    this.vel.set(lv.x, lv.y, lv.z);
    this.updateGrounded(frame, dt);

    // Planar velocity = velocity with the gravity component removed.
    const planar = this.tmp.copy(this.vel).addScaledVector(frame.down, -this.vel.dot(frame.down));
    const planarSpeed = planar.length();

    const accel = new THREE.Vector3()
      .addScaledVector(frame.right, input[0])
      .addScaledVector(frame.forward, input[1])
      .multiplyScalar(T.maxAccel * (this.grounded ? 1 : T.airControl));

    if (planarSpeed > 0.01) {
      const along = accel.dot(planar) / planarSpeed;
      if (along < 0) {
        // Pushing against motion: boost the braking component.
        accel.addScaledVector(planar, (along * (T.brakeBoost - 1)) / planarSpeed);
      } else if (planarSpeed >= T.maxSpeed) {
        // At the cap: strip the component that would add speed, keep steering.
        accel.addScaledVector(planar, -along / planarSpeed);
      }
      if (this.grounded) {
        // Rolling resistance (Rapier has no rolling friction), never reversing direction.
        const rr = Math.min(T.rollingResistance, planarSpeed / dt);
        accel.addScaledVector(planar, -rr / planarSpeed);
      }
    }

    const m = this.body.mass();
    this.body.applyImpulse({ x: accel.x * m * dt, y: accel.y * m * dt, z: accel.z * m * dt }, true);
    // What the velocity should be after this step if nothing is hit (used for impact detection).
    const g = this.physics.world.gravity;
    this.expectedVel.copy(this.vel).addScaledVector(accel, dt).add(new THREE.Vector3(g.x, g.y, g.z).multiplyScalar(dt));

    // Soft speed limit for anything that slips past (falls are excluded: only planar).
    if (planarSpeed > T.maxSpeed * 1.25) {
      const excess = (planarSpeed - T.maxSpeed * 1.25) / planarSpeed;
      this.body.applyImpulse({ x: -planar.x * excess * m, y: -planar.y * excess * m, z: -planar.z * excess * m }, true);
    }
  }

  applyTuning(t: PhysicsTuning): void {
    this.tuning = t;
    this.body.setLinearDamping(t.linearDamping);
    this.body.setAngularDamping(t.angularDamping);
    this.collider.setRestitution(t.restitution);
    this.collider.setFriction(t.friction);
  }

  /** Called after each fixed physics step. */
  recordState(): void {
    const lv = this.body.linvel();
    // Any velocity change beyond applied forces + gravity came from a contact: that's an impact.
    // Resting on a floor gives ~g·dt here, well below the threshold the feedback system uses.
    this.lastImpact = Math.hypot(lv.x - this.expectedVel.x, lv.y - this.expectedVel.y, lv.z - this.expectedVel.z);
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
    const t = this.body.translation();
    const r = this.body.rotation();
    this.currPos.set(t.x, t.y, t.z);
    this.currRot.set(r.x, r.y, r.z, r.w);
  }

  /** Called once per rendered frame. */
  render(alpha: number, dt: number): void {
    this.mesh.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.mesh.quaternion.slerpQuaternions(this.prevRot, this.currRot, alpha);
    this.glow.position.copy(this.mesh.position);
    const gm = this.glow.material as THREE.MeshBasicMaterial;
    gm.opacity = Math.max(0, gm.opacity - dt * 1.8);
    this.glow.scale.setScalar(1 + (0.9 - gm.opacity));

    this.trailTimer += dt;
    if (this.trailTimer > 0.035) {
      this.trailTimer = 0;
      const t = this.trail[this.trailIndex++ % this.trail.length];
      t.position.copy(this.mesh.position);
      (t.material as THREE.MeshBasicMaterial).opacity = Math.min(0.35, this.speed / 30);
    }
    for (const t of this.trail) {
      const m = t.material as THREE.MeshBasicMaterial;
      m.opacity = Math.max(0, m.opacity - dt * 1.2);
    }
  }

  private updateGrounded(frame: GravityFrame, dt: number): void {
    const p = this.body.translation();
    this.ray.origin = { x: p.x, y: p.y, z: p.z };
    this.ray.dir = { x: frame.down.x, y: frame.down.y, z: frame.down.z };
    const hit = this.physics.world.castRay(this.ray, BALL_RADIUS + 0.12, true, undefined, undefined, this.collider, this.body);
    this.grounded = hit !== null;
    this.airTime = this.grounded ? 0 : this.airTime + dt;
  }
}
