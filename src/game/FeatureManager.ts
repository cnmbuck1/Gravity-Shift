import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsManager } from '../physics/PhysicsManager';
import type { CrumbleDef, DoorDef, LaserDef, LevelDef, PadDef, RotatorDef, SwitchDef } from '../levels/LevelTypes';
import { COLORS, mazeFloorMaterial, trimMaterial } from '../render/Materials';
import { BALL_RADIUS } from './BallController';

/** How a floor pad changes the ball's handling this step (see BallController.applyInput). */
export interface SurfaceMod {
  /** Multiplies the player's acceleration. */
  accel: number;
  /** Multiplies rolling resistance. */
  rr: number;
  /** Multiplies the speed limit. */
  speed: number;
  /** Extra acceleration (m/s²) in world space, applied regardless of input. */
  push: THREE.Vector3 | null;
}

const NORMAL: SurfaceMod = { accel: 1, rr: 1, speed: 1, push: null };
/** Seconds a crumbling tile shakes before it drops. */
const CRUMBLE_DELAY = 0.75;
const JUMP_SPEED = 6;
/** Pull (m/s²) toward a hole when the sphere hangs over its edge, so holes catch it instead of letting it skim past. */
const HOLE_PULL = 10;
/** How far (m) the sphere must hang over a hole's edge before the pull starts. */
const HOLE_GRACE = 0.22;

interface CrumbleRt { def: CrumbleDef; collider: RAPIER.Collider; mesh: THREE.Mesh; timer: number; gone: boolean; drop: number }
interface LaserRt { def: LaserDef; beam: THREE.Mesh; a: THREE.Vector3; b: THREE.Vector3; on: boolean }
interface DoorRt { def: DoorDef; collider: RAPIER.Collider; mesh: THREE.Mesh; open: boolean; sink: number }
interface SwitchRt { def: SwitchDef; mesh: THREE.Mesh; pressed: boolean }
interface RotatorRt { def: RotatorDef; body: RAPIER.RigidBody; mesh: THREE.Object3D }

/**
 * The mechanics that later worlds add on top of the maze: crumbling tiles, floor pads
 * (boost, conveyor, ice, sticky, jump), blinking lasers, switches and doors, gravity wells
 * and rotating arms and discs. Everything is level data; this class builds and runs it.
 */
export class FeatureManager {
  readonly group = new THREE.Group();
  private crumble: CrumbleRt[] = [];
  private lasers: LaserRt[] = [];
  private doors: DoorRt[] = [];
  private switches: SwitchRt[] = [];
  private rotators: RotatorRt[] = [];
  private pads: { def: PadDef; mat: THREE.MeshBasicMaterial | null }[] = [];
  private def: LevelDef | null = null;
  private body: RAPIER.RigidBody | null = null;
  private disposables: { dispose(): void }[] = [];
  private time = 0;
  private jumpCooldown = 0;
  private boostTimer = 0;
  private padTexture: THREE.CanvasTexture | null = null;

  constructor(private physics: PhysicsManager, scene: THREE.Scene) {
    scene.add(this.group);
  }

  load(def: LevelDef): void {
    this.unload();
    this.def = def;
    const R = this.physics.rapier;
    this.body = this.physics.world.createRigidBody(R.RigidBodyDesc.fixed());
    for (const c of def.crumble ?? []) this.addCrumble(c);
    for (const p of def.pads ?? []) this.addPad(p);
    for (const l of def.lasers ?? []) this.addLaser(l);
    for (const d of def.doors ?? []) this.addDoor(d);
    for (const s of def.switches ?? []) this.addSwitch(s);
    for (const r of def.rotators ?? []) this.addRotator(r);
    this.time = 0;
    this.findHoles(def);
  }

  /** Holes in the floor grid that should catch the sphere. Chasms beside gravity pads are left out (you wait beside them to shift). */
  private holes: [number, number][] = [];
  private findHoles(def: LevelDef): void {
    this.holes = [];
    const m = def.maze;
    if (!m) return;
    const at = (r: number, c: number) => m.rows[r]?.[c] ?? '#';
    for (let r = 1; r < m.rows.length - 1; r++) {
      for (let c = 1; c < m.rows[r].length - 1; c++) {
        if (at(r, c) !== ' ') continue;
        let nearPad = false;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ('P|'.includes(at(r + dr, c + dc))) nearPad = true;
        if (!nearPad) this.holes.push([m.origin[0] + c * m.cell, m.origin[1] + r * m.cell]);
      }
    }
  }

  /** Sideways pull toward any hole the sphere overlaps (null when clear). `p` must be on the floor frame. */
  holePull(p: THREE.Vector3, grounded: boolean): THREE.Vector3 | null {
    if (!grounded || !this.def?.maze || p.y > this.def.maze.floorY + BALL_RADIUS + 0.2) return null;
    // A turning disc covers its hole.
    for (const r of this.rotators) {
      if (r.def.kind === 'disc' && Math.hypot(p.x - r.def.centre[0], p.z - r.def.centre[2]) < r.def.size + 0.3) return null;
    }
    const half = this.def.maze.cell / 2;
    let best: THREE.Vector3 | null = null;
    for (const [hx, hz] of this.holes) {
      const dx = p.x - Math.max(hx - half, Math.min(hx + half, p.x));
      const dz = p.z - Math.max(hz - half, Math.min(hz + half, p.z));
      const d = Math.hypot(dx, dz);
      const reach = BALL_RADIUS - HOLE_GRACE;
      if (d >= reach) continue;
      const toward = new THREE.Vector3(hx - p.x, 0, hz - p.z);
      if (toward.lengthSq() < 1e-6) continue;
      const pull = toward.normalize().multiplyScalar(HOLE_PULL * (1 - d / reach));
      if (!best || pull.lengthSq() > best.lengthSq()) best = pull;
    }
    return best;
  }

  unload(): void {
    if (this.body) this.physics.world.removeRigidBody(this.body);
    for (const r of this.rotators) this.physics.world.removeRigidBody(r.body);
    this.body = null;
    this.crumble = [];
    this.lasers = [];
    this.doors = [];
    this.switches = [];
    this.rotators = [];
    this.pads = [];
    this.group.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.def = null;
  }

  /** After a fall: crumbled tiles come back. Pressed switches stay pressed. */
  respawn(): void {
    for (const c of this.crumble) {
      c.timer = -1;
      c.gone = false;
      c.drop = 0;
      c.collider.setEnabled(true);
      c.mesh.visible = true;
      c.mesh.position.set(c.def.position[0], c.def.position[1] - 0.3, c.def.position[2]);
    }
    this.jumpCooldown = 0;
    this.boostTimer = 0;
  }

  /** Restarting the level resets everything, doors included. */
  reset(): void {
    this.respawn();
    for (const d of this.doors) {
      d.open = false;
      d.sink = 0;
      d.collider.setEnabled(true);
      d.mesh.position.fromArray(d.def.position);
    }
    for (const s of this.switches) s.pressed = false;
    this.time = 0;
  }

  /** Before each physics step: time-driven obstacles. */
  step(dt: number): void {
    this.time += dt;
    for (const r of this.rotators) {
      const a = (r.def.phase ?? 0) + this.time * r.def.speed;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      r.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
    for (const c of this.crumble) {
      if (c.timer < 0 || c.gone) continue;
      c.timer += dt;
      if (c.timer >= CRUMBLE_DELAY) {
        c.gone = true;
        c.collider.setEnabled(false);
      }
    }
    for (const l of this.lasers) {
      const t = ((this.time / l.def.period + (l.def.phase ?? 0)) % 1 + 1) % 1;
      l.on = t < l.def.on;
    }
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    this.boostTimer = Math.max(0, this.boostTimer - dt);
  }

  /**
   * Floor effects under the ball. `floor` is true only while gravity points down (pads,
   * tiles and switches are floor features). May change the ball's velocity (jump pads).
   */
  surface(p: THREE.Vector3, grounded: boolean, floor: boolean, body: RAPIER.RigidBody): SurfaceMod {
    if (!floor) return NORMAL;
    // Crumbling tiles start to go the moment the ball touches them.
    for (const c of this.crumble) {
      if (c.timer >= 0 || c.gone) continue;
      const [x, y, z] = c.def.position;
      const [w, d] = c.def.size;
      if (Math.abs(p.x - x) < w / 2 + 0.1 && Math.abs(p.z - z) < d / 2 + 0.1 && p.y > y - BALL_RADIUS - 0.2 && p.y < y + BALL_RADIUS + 0.4) c.timer = 0;
    }
    let mod = this.boostTimer > 0 ? { ...NORMAL, speed: 1.45 } : NORMAL;
    if (!grounded) return mod;
    for (const { def: pad } of this.pads) {
      if (p.x < pad.min[0] || p.x > pad.max[0] || p.z < pad.min[1] || p.z > pad.max[1]) continue;
      if (p.y < pad.y || p.y > pad.y + BALL_RADIUS + 0.35) continue;
      const dir = pad.dir ? new THREE.Vector3(pad.dir[0], 0, pad.dir[1]).normalize() : null;
      switch (pad.kind) {
        case 'boost':
          this.boostTimer = 1.2;
          mod = { accel: 1, rr: 0.3, speed: 1.45, push: dir ? dir.multiplyScalar(38) : null };
          break;
        case 'conveyor':
          mod = { accel: 1, rr: 1, speed: 1, push: dir ? dir.multiplyScalar(7) : null };
          break;
        case 'ice':
          mod = { accel: 0.3, rr: 0.04, speed: 1.15, push: null };
          break;
        case 'sticky':
          mod = { accel: 0.8, rr: 6, speed: 0.38, push: null };
          break;
        case 'jump':
          if (this.jumpCooldown <= 0) {
            this.jumpCooldown = 0.6;
            const v = body.linvel();
            const out = { x: v.x, y: JUMP_SPEED, z: v.z };
            if (dir) {
              const along = v.x * dir.x + v.z * dir.z;
              const add = Math.max(0, 5 - along);
              out.x += dir.x * add;
              out.z += dir.z * add;
            }
            body.setLinvel(out, true);
          }
          break;
      }
    }
    return mod;
  }

  /** Gravity multiplier at `p` (gravity wells). */
  gravityScale(p: THREE.Vector3): number {
    for (const w of this.def?.wells ?? []) {
      if (p.x >= w.min[0] && p.x <= w.max[0] && p.y >= w.min[1] && p.y <= w.max[1] && p.z >= w.min[2] && p.z <= w.max[2]) return w.scale;
    }
    return 1;
  }

  /** A lit laser is touching the ball. */
  inLaser(p: THREE.Vector3): boolean {
    const tmp = new THREE.Vector3();
    for (const l of this.lasers) {
      if (!l.on) continue;
      const seg = new THREE.Line3(l.a, l.b);
      seg.closestPointToPoint(p, true, tmp);
      if (tmp.distanceTo(p) < BALL_RADIUS + 0.06) return true;
    }
    return false;
  }

  /** Presses any switch the ball rolls over. Returns true if a switch was pressed this call. */
  checkSwitches(p: THREE.Vector3): boolean {
    let pressed = false;
    for (const s of this.switches) {
      if (s.pressed) continue;
      const d = Math.hypot(p.x - s.def.position[0], p.z - s.def.position[2]);
      if (d < 0.85 && Math.abs(p.y - s.def.position[1]) < 1.2) {
        s.pressed = true;
        pressed = true;
        for (const i of s.def.doors) {
          const door = this.doors[i];
          if (door && !door.open) {
            door.open = true;
            door.collider.setEnabled(false);
          }
        }
      }
    }
    return pressed;
  }

  /** Per rendered frame: visuals only. */
  update(dt: number, time: number): void {
    for (const r of this.rotators) {
      const q = r.body.rotation();
      r.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    }
    for (const c of this.crumble) {
      const [x, y, z] = c.def.position;
      if (c.gone) {
        c.drop += dt;
        c.mesh.position.set(x, y - 0.3 - 4 * c.drop * c.drop, z);
        c.mesh.rotation.set(c.drop * 0.8, 0, c.drop * 0.5);
        if (c.drop > 1.5) c.mesh.visible = false;
      } else if (c.timer >= 0) {
        // Shake before dropping.
        const k = c.timer / CRUMBLE_DELAY;
        c.mesh.position.set(x + Math.sin(time * 70) * 0.04 * k, y - 0.3 - 0.05 * k, z + Math.cos(time * 63) * 0.04 * k);
      } else c.mesh.rotation.set(0, 0, 0);
    }
    for (const l of this.lasers) {
      const m = l.beam.material as THREE.MeshBasicMaterial;
      m.opacity += ((l.on ? 0.95 : 0.08) - m.opacity) * Math.min(1, dt * 25);
      l.beam.scale.set(l.on ? 1 + Math.sin(time * 40) * 0.15 : 0.5, 1, l.on ? 1 + Math.sin(time * 40) * 0.15 : 0.5);
    }
    for (const d of this.doors) {
      if (!d.open || d.sink >= 1) continue;
      d.sink = Math.min(1, d.sink + dt * 1.6);
      d.mesh.position.set(d.def.position[0], d.def.position[1] - d.def.size[1] * d.sink, d.def.position[2]);
    }
    for (const s of this.switches) {
      const m = s.mesh.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = s.pressed ? 0.6 : 1.6 + Math.sin(time * 5) * 0.6;
      s.mesh.position.y = s.def.position[1] + (s.pressed ? -0.02 : 0.05);
    }
    for (const p of this.pads) if (p.mat?.map) {
      const dir = p.def.dir;
      if (!dir) continue;
      const rate = p.def.kind === 'boost' ? 2.2 : 0.8;
      p.mat.map.offset.y = (p.mat.map.offset.y - dt * rate + 1) % 1;
    }
  }

  // ---------- building ----------

  private addCrumble(def: CrumbleDef): void {
    const [x, y, z] = def.position;
    const [w, d] = def.size;
    const R = this.physics.rapier;
    const collider = this.physics.world.createCollider(
      R.ColliderDesc.cuboid(w / 2, 0.3, d / 2).setTranslation(x, y - 0.3, z).setFriction(0.9).setRestitution(0.1),
      this.body!,
    );
    const geo = new RoundedBoxGeometry(w * 0.96, 0.6, d * 0.96, 2, 0.05);
    const mat = mazeFloorMaterial();
    mat.color.set('#8a6a52');
    mat.emissive = new THREE.Color('#ff7a3d');
    mat.emissiveIntensity = 0.12;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y - 0.3, z);
    mesh.receiveShadow = true;
    // Cracks drawn as a glowing orange cross on top.
    const crackGeo = new THREE.PlaneGeometry(w * 0.8, 0.05);
    crackGeo.rotateX(-Math.PI / 2);
    const crackMat = new THREE.MeshBasicMaterial({ color: '#ff7a3d', transparent: true, opacity: 0.8 });
    for (const rot of [0.6, -0.7]) {
      const crack = new THREE.Mesh(crackGeo, crackMat);
      crack.position.y = 0.305;
      crack.rotation.y = rot;
      mesh.add(crack);
    }
    this.group.add(mesh);
    this.disposables.push(geo, mat, crackGeo, crackMat);
    this.crumble.push({ def, collider, mesh, timer: -1, gone: false, drop: 0 });
  }

  private addPad(def: PadDef): void {
    const w = def.max[0] - def.min[0];
    const d = def.max[1] - def.min[1];
    const colour = { boost: '#2eff8a', conveyor: '#3a7bff', ice: '#bff4ff', sticky: '#c08a2e', jump: '#ff5fd2' }[def.kind];
    let mat: THREE.MeshBasicMaterial;
    if (def.kind === 'boost' || def.kind === 'conveyor') {
      this.padTexture ??= chevronTexture();
      const tex = this.padTexture.clone();
      tex.needsUpdate = true;
      // Chevrons point along the pad's direction; repeat one per metre of length.
      const len = def.dir && Math.abs(def.dir[0]) > Math.abs(def.dir[1]) ? w : d;
      tex.offset.set(0, 0);
      tex.repeat.set(1, len);
      mat = new THREE.MeshBasicMaterial({ color: colour, map: tex, transparent: true, opacity: 0.9, depthWrite: false });
      this.disposables.push(tex);
    } else {
      mat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: def.kind === 'ice' ? 0.45 : 0.6, depthWrite: false });
    }
    // Directional pads are built pointing -z and turned to face `dir`, so swap extents for x-facing pads.
    const alongX = Boolean(def.dir && Math.abs(def.dir[0]) > Math.abs(def.dir[1]));
    const geo = alongX ? new THREE.PlaneGeometry(d * 0.96, w * 0.96) : new THREE.PlaneGeometry(w * 0.96, d * 0.96);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((def.min[0] + def.max[0]) / 2, def.y + 0.015, (def.min[1] + def.max[1]) / 2);
    if (def.dir && (def.kind === 'boost' || def.kind === 'conveyor' || alongX)) mesh.rotation.y = Math.atan2(-def.dir[0], -def.dir[1]);
    if (def.kind === 'jump') {
      const ringGeo = new THREE.RingGeometry(0.35, 0.5, 32);
      ringGeo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, trimMaterial('safe'));
      (ring.material as THREE.MeshStandardMaterial).color.set(colour);
      (ring.material as THREE.MeshStandardMaterial).emissive.set(colour);
      ring.position.y = 0.01;
      mesh.add(ring);
      this.disposables.push(ringGeo, ring.material as THREE.Material);
    }
    this.group.add(mesh);
    this.disposables.push(geo, mat);
    this.pads.push({ def, mat });
  }

  private addLaser(def: LaserDef): void {
    const a = new THREE.Vector3(...def.from);
    const b = new THREE.Vector3(...def.to);
    const len = a.distanceTo(b);
    const geo = new THREE.CylinderGeometry(0.06, 0.06, len, 8, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: COLORS.hazard, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const beam = new THREE.Mesh(geo, mat);
    beam.position.copy(a).add(b).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    this.group.add(beam);
    // Emitter posts at both ends.
    const postGeo = new RoundedBoxGeometry(0.22, 0.9, 0.22, 2, 0.04);
    const postMat = trimMaterial('hazard');
    postMat.emissiveIntensity = 0.8;
    for (const end of [a, b]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(end.x, end.y, end.z);
      this.group.add(post);
    }
    this.disposables.push(geo, mat, postGeo, postMat);
    this.lasers.push({ def, beam, a, b, on: true });
  }

  private addDoor(def: DoorDef): void {
    const R = this.physics.rapier;
    const [x, y, z] = def.position;
    const collider = this.physics.world.createCollider(
      R.ColliderDesc.cuboid(def.size[0] / 2, def.size[1] / 2, def.size[2] / 2).setTranslation(x, y, z).setFriction(0.6),
      this.body!,
    );
    const geo = new RoundedBoxGeometry(def.size[0], def.size[1], def.size[2], 2, 0.06);
    const mat = new THREE.MeshStandardMaterial({ color: '#3a3410', metalness: 0.8, roughness: 0.35, emissive: '#ffe14d', emissiveIntensity: 0.35 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.group.add(mesh);
    this.disposables.push(geo, mat);
    this.doors.push({ def, collider, mesh, open: false, sink: 0 });
  }

  private addSwitch(def: SwitchDef): void {
    const geo = new THREE.CylinderGeometry(0.6, 0.7, 0.1, 32);
    const mat = new THREE.MeshStandardMaterial({ color: '#4a3f0a', emissive: '#ffe14d', emissiveIntensity: 1.6, metalness: 0.6, roughness: 0.4 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.fromArray(def.position);
    this.group.add(mesh);
    this.disposables.push(geo, mat);
    this.switches.push({ def, mesh, pressed: false });
  }

  private addRotator(def: RotatorDef): void {
    const R = this.physics.rapier;
    const [x, y, z] = def.centre;
    const body = this.physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    if (def.kind === 'arm') {
      // Sweeper: a long bar at ball height spinning around a hub.
      this.physics.world.createCollider(R.ColliderDesc.cuboid(def.size / 2, 0.35, 0.18).setTranslation(0, 0.45, 0).setFriction(0.4).setRestitution(0.5), body);
      const barGeo = new RoundedBoxGeometry(def.size, 0.7, 0.36, 2, 0.08);
      const barMat = new THREE.MeshStandardMaterial({ color: '#4a3a1c', metalness: 0.85, roughness: 0.35, emissive: COLORS.moving, emissiveIntensity: 0.4 });
      const bar = new THREE.Mesh(barGeo, barMat);
      bar.position.y = 0.45;
      bar.castShadow = true;
      holder.add(bar);
      const hubGeo = new THREE.CylinderGeometry(0.45, 0.55, 1.1, 24);
      const hub = new THREE.Mesh(hubGeo, trimMaterial('moving'));
      hub.position.y = 0.55;
      holder.add(hub);
      this.disposables.push(barGeo, barMat, hubGeo, hub.material as THREE.Material);
    } else {
      // Turning disc: the ball rides it across a gap.
      this.physics.world.createCollider(R.ColliderDesc.cylinder(0.25, def.size).setTranslation(0, -0.25, 0).setFriction(1).setRestitution(0.1), body);
      const discGeo = new THREE.CylinderGeometry(def.size, def.size, 0.5, 48);
      const discMat = mazeFloorMaterial();
      discMat.color.set('#7c8698');
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.position.y = -0.25;
      disc.receiveShadow = true;
      holder.add(disc);
      // Glowing spokes make the rotation readable.
      const spokeGeo = new THREE.BoxGeometry(def.size * 1.9, 0.02, 0.08);
      const spokeMat = trimMaterial('safe');
      for (const r of [0, Math.PI / 2]) {
        const spoke = new THREE.Mesh(spokeGeo, spokeMat);
        spoke.position.y = 0.01;
        spoke.rotation.y = r;
        holder.add(spoke);
      }
      const rimGeo = new THREE.TorusGeometry(def.size, 0.05, 8, 64);
      rimGeo.rotateX(Math.PI / 2);
      const rim = new THREE.Mesh(rimGeo, spokeMat);
      holder.add(rim);
      this.disposables.push(discGeo, discMat, spokeGeo, spokeMat, rimGeo);
    }
    this.group.add(holder);
    this.rotators.push({ def, body, mesh: holder });
  }
}

/** Arrow chevrons for boost and conveyor pads (tinted by the material colour). */
function chevronTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(10, 44);
  g.lineTo(32, 20);
  g.lineTo(54, 44);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
