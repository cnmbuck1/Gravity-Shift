import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsManager } from '../physics/PhysicsManager';
import type { CrumbleDef, DoorDef, FanDef, GravityWellDef, KeyDef, LaserDef, LevelDef, PadDef, PortalDef, PulseDef, RotatorDef, SwitchDef } from '../levels/LevelTypes';
import { DROP_COLOR } from './MazeBuilder';
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
/** Seconds a switch keeps its doors open when the level doesn't say. */
export const DOOR_OPEN_SECONDS = 5;
/** The last seconds of a switch's timer: the switch blinks fast and ticks to warn the door is about to shut. */
const DOOR_WARN_SECONDS = 1.5;
/** How fast a door sinks and rises (fraction of its height per second). */
const DOOR_SPEED = 2.2;
/** Pull (m/s²) toward a hole when the sphere hangs over its edge, so holes catch it instead of letting it skim past. */
const HOLE_PULL = 10;
/** How far (m) the sphere must hang over a hole's edge before the pull starts. */
const HOLE_GRACE = 0.22;

/** Segments in a switch's countdown ring. */
const RING_SEGMENTS = 48;

interface CrumbleRt { def: CrumbleDef; collider: RAPIER.Collider; mesh: THREE.Mesh; timer: number; gone: boolean; drop: number }
interface LaserRt { def: LaserDef; beam: THREE.Mesh; a: THREE.Vector3; b: THREE.Vector3; on: boolean }
interface DoorRt { def: DoorDef; collider: RAPIER.Collider; mesh: THREE.Mesh; open: boolean; sink: number }
/** `left` counts down the seconds the switch's doors have left (0 when not pressed). */
interface SwitchRt { def: SwitchDef; mesh: THREE.Mesh; pressed: boolean; left: number; occupied: boolean }
interface RotatorRt { def: RotatorDef; body: RAPIER.RigidBody; mesh: THREE.Object3D }
/** `armed[i]` is false while the sphere still sits on gate i after arriving (so it doesn't bounce straight back). */
interface PortalRt { def: PortalDef; gates: THREE.Object3D[]; armed: [boolean, boolean] }
interface KeyRt { def: KeyDef; mesh: THREE.Object3D; got: boolean; fly: number }
interface FanRt { def: FanDef; on: boolean; level: number; blades: THREE.Object3D; air: THREE.Mesh }
interface PulseRt { def: PulseDef; on: boolean; mat: THREE.MeshBasicMaterial; edge: THREE.LineBasicMaterial }

/** Seconds before a pulse floor lights (or a fan starts) during which it flickers as a warning. */
const WARN_AHEAD = 0.6;
const PORTAL_COLOR = '#ffffff';
const PORTAL_TINTS = ['#3dffa0', '#ffd23d', '#4dc3ff', '#ff7ad9', '#b48cff', '#ff9a3d'];
const DECOY_COLOR = '#ff3b4e';
const KEY_COLOR = '#ffd84a';
const FAN_COLOR = '#d8f6ff';

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
  /** Glide chutes: rings that drift down the shaft. */
  private chutes: { def: GravityWellDef; rings: THREE.Mesh[] }[] = [];
  private pads: { def: PadDef; mat: THREE.MeshBasicMaterial | null }[] = [];
  private portals: PortalRt[] = [];
  private keys: KeyRt[] = [];
  /** Key pickups (they stay lit on dark levels). */
  get keyObjects(): THREE.Object3D[] {
    return this.keys.map((k) => k.mesh);
  }
  private fans: FanRt[] = [];
  private pulses: PulseRt[] = [];
  private def: LevelDef | null = null;
  private body: RAPIER.RigidBody | null = null;
  private disposables: { dispose(): void }[] = [];
  private retired: { dispose(): void }[] = [];

  /** Frees the previous level's geometry, materials and textures (see unload). */
  disposeRetired(): void {
    for (const d of this.retired) d.dispose();
    this.retired = [];
  }
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
    for (const w of def.wells ?? []) if (w.steer) this.addChute(w);
    for (const r of def.rotators ?? []) this.addRotator(r);
    (def.portals ?? []).forEach((p, i) => this.addPortal(p, i));
    for (const k of def.keys ?? []) this.addKey(k);
    for (const f of def.fans ?? []) this.addFan(f);
    for (const p of def.pulses ?? []) this.addPulse(p);
    this.time = 0;
    this.findHoles(def);
  }

  /** Holes in the floor grid that should catch the sphere. Chasms beside gravity pads are left out (you wait beside them to shift). */
  /** Hole cells: x, z, the floor height they sit in, and the cell size. Drop holes ('D') of multi-level boards count too. */
  private holes: [number, number, number, number][] = [];
  /** Open cells of an upper floor (holes, crumble tiles, gaps): falling through one is a fall, not a drop. */
  private voids: [number, number, number, number][] = [];
  private findHoles(def: LevelDef): void {
    this.holes = [];
    this.voids = [];
    const floors = [...(def.maze ? [def.maze] : []), ...(def.tiers ?? [])];
    const lowest = Math.min(...floors.map((m) => m.floorY));
    for (const m of floors) {
      const at = (r: number, c: number) => m.rows[r]?.[c] ?? '#';
      for (let r = 1; r < m.rows.length - 1; r++) {
        for (let c = 1; c < m.rows[r].length - 1; c++) {
          if (m.floorY > lowest && ' KB|'.includes(at(r, c))) this.voids.push([m.origin[0] + c * m.cell, m.origin[1] + r * m.cell, m.floorY, m.cell]);
          if (at(r, c) !== ' ' && at(r, c) !== 'D') continue;
          let nearPad = false;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ('P|'.includes(at(r + dr, c + dc))) nearPad = true;
          if (!nearPad) this.holes.push([m.origin[0] + c * m.cell, m.origin[1] + r * m.cell, m.floorY, m.cell]);
        }
      }
    }
  }

  /** The sphere has fallen through an open cell of an upper floor (it would land on the floor below). */
  fellThrough(p: THREE.Vector3): boolean {
    for (const [hx, hz, floorY, cell] of this.voids) {
      if (p.y > floorY - 1.1 || p.y < floorY - 3) continue;
      const half = cell / 2 + 0.05;
      if (Math.abs(p.x - hx) <= half && Math.abs(p.z - hz) <= half) return true;
    }
    return false;
  }

  /** Sideways pull toward any hole the sphere overlaps (null when clear). `p` must be on the floor frame. */
  holePull(p: THREE.Vector3, grounded: boolean): THREE.Vector3 | null {
    if (!grounded || !this.holes.length) return null;
    // A turning disc covers its hole.
    for (const r of this.rotators) {
      if (r.def.kind === 'disc' && Math.hypot(p.x - r.def.centre[0], p.z - r.def.centre[2]) < r.def.size + 0.3) return null;
    }
    let best: THREE.Vector3 | null = null;
    for (const [hx, hz, floorY, cell] of this.holes) {
      // Only holes in the floor the ball is rolling on.
      if (p.y > floorY + BALL_RADIUS + 0.2 || p.y < floorY) continue;
      const half = cell / 2;
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

  /**
   * True when the sphere's centre is over an open hole cell at rolling height (on the floor
   * frame, not over a turning disc). The caller then pulls it down hard, so a hole catches
   * the sphere at any speed instead of letting it skim across (Chris, 2026-11-19).
   */
  overHole(p: THREE.Vector3): boolean {
    if (!this.holes.length) return false;
    for (const r of this.rotators) {
      if (r.def.kind === 'disc' && Math.hypot(p.x - r.def.centre[0], p.z - r.def.centre[2]) < r.def.size + 0.3) return false;
    }
    for (const [hx, hz, floorY, cell] of this.holes) {
      if (p.y > floorY + BALL_RADIUS + 0.15 || p.y < floorY - 1.5) continue;
      const half = cell / 2;
      if (Math.abs(p.x - hx) <= half && Math.abs(p.z - hz) <= half) return true;
    }
    return false;
  }

  /** A glide chute: a faint shaft with glowing rings sinking down it, so the slow fall reads as a place to steer. */
  private addChute(w: GravityWellDef): void {
    const cx = (w.min[0] + w.max[0]) / 2;
    const cz = (w.min[2] + w.max[2]) / 2;
    const sx = w.max[0] - w.min[0];
    const sz = w.max[2] - w.min[2];
    const h = w.max[1] - w.min[1];
    const shaftGeo = new THREE.BoxGeometry(sx, h, sz);
    const shaftMat = new THREE.MeshBasicMaterial({ color: DROP_COLOR, transparent: true, opacity: 0.06, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.set(cx, (w.min[1] + w.max[1]) / 2, cz);
    this.group.add(shaft);
    // A rectangular frame of four thin bars that follows the chute's outline.
    const T = 0.07;
    const bars = [
      [sx, T, T, 0, -sz / 2],
      [sx, T, T, 0, sz / 2],
      [T, T, sz, -sx / 2, 0],
      [T, T, sz, sx / 2, 0],
    ].map(([a, b, c, x, z]) => new THREE.BoxGeometry(a, b, c).translate(x, 0, z));
    const ringGeo = mergeGeometries(bars);
    bars.forEach((g) => g.dispose());
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: DROP_COLOR, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.position.set(cx, w.max[1], cz);
      this.group.add(ring);
      rings.push(ring);
      this.disposables.push(mat);
    }
    this.disposables.push(shaftGeo, shaftMat, ringGeo);
    this.chutes.push({ def: w, rings });
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
    this.chutes = [];
    this.pads = [];
    this.portals = [];
    this.keys = [];
    this.fans = [];
    this.pulses = [];
    this.group.clear();
    // Disposed only after the next level is built and its shaders compiled (disposeRetired):
    // freeing first would drop shader programs the next level reuses and recompile them mid-play.
    this.retired.push(...this.disposables);
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
    for (const p of this.portals) p.armed = [true, true];
  }

  /** Restarting the level resets everything, doors included. */
  reset(): void {
    this.respawn();
    for (const d of this.doors) {
      d.open = false;
      d.sink = 0;
      d.collider.setEnabled(true);
      d.mesh.position.fromArray(d.def.position);
      d.mesh.visible = true;
    }
    for (const s of this.switches) {
      s.pressed = false;
      s.left = 0;
      s.occupied = false;
    }
    for (const k of this.keys) {
      k.got = false;
      k.fly = 0;
      k.mesh.visible = true;
      k.mesh.position.fromArray(k.def.position);
      k.mesh.scale.setScalar(1);
    }
    for (const p of this.portals) p.armed = [true, true];
    this.time = 0;
  }

  /** Called with the remaining whole seconds while an open door is about to shut (for a tick sound). */
  doorTick: ((secondsLeft: number) => void) | null = null;

  /** Before each physics step: time-driven obstacles. `ball` is the sphere's centre. */
  step(dt: number, ball?: THREE.Vector3): void {
    this.time += dt;
    this.stepDoors(dt, ball);
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
    for (const f of this.fans) f.on = this.cycleOn(f.def);
    for (const p of this.pulses) p.on = this.cycleOn(p.def);
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

  /** Air-control multiplier at `p` (glide chutes: wells with `steer`). */
  steerAt(p: THREE.Vector3): number {
    for (const w of this.def?.wells ?? []) {
      if (w.steer && p.x >= w.min[0] && p.x <= w.max[0] && p.y >= w.min[1] && p.y <= w.max[1] && p.z >= w.min[2] && p.z <= w.max[2]) return w.steer;
    }
    return 1;
  }

  /** Gravity multiplier at `p` (gravity wells). */
  gravityScale(p: THREE.Vector3): number {
    for (const w of this.def?.wells ?? []) {
      if (p.x >= w.min[0] && p.x <= w.max[0] && p.y >= w.min[1] && p.y <= w.max[1] && p.z >= w.min[2] && p.z <= w.max[2]) return w.scale;
    }
    return 1;
  }

  /** Whether a cycling obstacle (fan, pulse floor) is on right now. */
  private cycleOn(d: { period: number; on: number; phase?: number }): boolean {
    return this.cyclePos(d) < d.on;
  }

  /** 0..1 position in an obstacle's on/off cycle (on during [0, on)). */
  private cyclePos(d: { period: number; on: number; phase?: number }): number {
    return ((this.time / d.period + (d.phase ?? 0)) % 1 + 1) % 1;
  }

  /** Seconds until a cycling obstacle next switches on (0 while it is on). */
  private untilOn(d: { period: number; on: number; phase?: number }): number {
    const t = this.cyclePos(d);
    return t < d.on ? 0 : (1 - t) * d.period;
  }

  /** Wind from fans that are blowing on the sphere at `p` (m/s², world space), or null. */
  windAt(p: THREE.Vector3): THREE.Vector3 | null {
    let out: THREE.Vector3 | null = null;
    for (const f of this.fans) {
      if (!f.on) continue;
      const { min, max } = f.def;
      if (p.x < min[0] || p.x > max[0] || p.y < min[1] || p.y > max[1] || p.z < min[2] || p.z > max[2]) continue;
      const d = new THREE.Vector3(f.def.dir[0], 0, f.def.dir[1]).normalize().multiplyScalar(f.def.strength);
      out = out ? out.add(d) : d;
    }
    return out;
  }

  /** A lit pulse floor is under the sphere. */
  inPulse(p: THREE.Vector3): boolean {
    for (const q of this.pulses) {
      if (!q.on) continue;
      const { min, max, y } = q.def;
      // The sphere's footprint must be well onto the patch (a brush along its edge is forgiven).
      const m = 0.15;
      if (p.x > min[0] + m && p.x < max[0] - m && p.z > min[1] + m && p.z < max[1] - m && p.y > y && p.y < y + BALL_RADIUS + 0.35) return true;
    }
    return false;
  }

  /**
   * Warp gates: if the sphere rolls into an armed gate, returns where it comes out and which way
   * it leaves (null otherwise). The exit gate stays disarmed until the sphere has rolled off it.
   */
  checkPortals(p: THREE.Vector3): { to: THREE.Vector3; dir: THREE.Vector3 | null; decoy: boolean } | null {
    for (const g of this.portals) {
      const ends = [g.def.a, g.def.b];
      for (let i = 0; i < 2; i++) {
        const e = ends[i];
        const on = Math.hypot(p.x - e[0], p.z - e[2]) < 0.75 && Math.abs(p.y - e[1]) < 1.2;
        if (!on) {
          g.armed[i] = true;
          continue;
        }
        if (!g.armed[i] || (i === 1 && !g.def.twoWay)) continue;
        const o = 1 - i;
        g.armed[o] = false;
        const to = new THREE.Vector3(...ends[o]);
        const dir = i === 0 && g.def.exit ? new THREE.Vector3(g.def.exit[0], 0, g.def.exit[1]).normalize() : null;
        return { to, dir, decoy: Boolean(g.def.decoy) };
      }
    }
    return null;
  }

  /** Collects any key the sphere touches. Returns how many were picked up this call. */
  collectKeys(p: THREE.Vector3): number {
    let n = 0;
    for (const k of this.keys) {
      if (k.got) continue;
      const [x, y, z] = k.def.position;
      if (Math.hypot(p.x - x, p.z - z) < 0.95 && Math.abs(p.y - y) < 1.4) {
        k.got = true;
        k.fly = 0.0001;
        n++;
      }
    }
    return n;
  }

  get keyCount(): number {
    return this.keys.length;
  }

  get keysLeft(): number {
    return this.keys.filter((k) => !k.got).length;
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

  /**
   * Switch timers: when one runs out its doors rise again and the switch re-arms. A door never
   * shuts on the sphere: it waits until the sphere has rolled clear.
   */
  private stepDoors(dt: number, ball?: THREE.Vector3): void {
    for (const s of this.switches) {
      if (!s.pressed) continue;
      const before = s.left;
      s.left = Math.max(0, s.left - dt);
      if (s.left > 0) {
        if (s.left < DOOR_WARN_SECONDS && Math.ceil(s.left * 2) !== Math.ceil(before * 2)) this.doorTick?.(s.left);
        continue;
      }
      const doors = s.def.doors.map((i) => this.doors[i]).filter(Boolean);
      if (ball && doors.some((d) => this.touchesDoor(d, ball))) continue;
      // Another pressed switch may still be holding one of these doors open.
      for (const d of doors) {
        const held = this.switches.some((o) => o !== s && o.pressed && o.left > 0 && o.def.doors.includes(this.doors.indexOf(d)));
        if (held) continue;
        d.open = false;
        d.collider.setEnabled(true);
      }
      s.pressed = false;
    }
  }

  private touchesDoor(d: DoorRt, p: THREE.Vector3): boolean {
    const [x, y, z] = d.def.position;
    const [w, h, l] = d.def.size;
    const m = BALL_RADIUS + 0.15;
    return Math.abs(p.x - x) < w / 2 + m && Math.abs(p.y - y) < h / 2 + m && Math.abs(p.z - z) < l / 2 + m;
  }

  /** Seconds left on the most recently pressed switch that is still running (0 when every door is shut). */
  doorTimeLeft(): number {
    let t = 0;
    for (const s of this.switches) if (s.pressed) t = Math.max(t, s.left);
    return t;
  }

  /** Presses any switch the ball rolls over. Returns true if a switch was pressed this call. */
  checkSwitches(p: THREE.Vector3): boolean {
    let pressed = false;
    for (const s of this.switches) {
      const d = Math.hypot(p.x - s.def.position[0], p.z - s.def.position[2]);
      const on = d < 0.85 && Math.abs(p.y - s.def.position[1]) < 1.2;
      // A switch fires as the sphere rolls onto it: sitting on it after the time runs out doesn't press it again.
      const arriving = on && !s.occupied;
      s.occupied = on;
      if (s.pressed) continue;
      if (arriving) {
        s.pressed = true;
        s.left = s.def.time ?? DOOR_OPEN_SECONDS;
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
    for (const c of this.chutes) {
      const [y0, y1] = [c.def.min[1], c.def.max[1]];
      c.rings.forEach((ring, i) => {
        const u = ((time * 0.35 + i / c.rings.length) % 1 + 1) % 1;
        ring.position.y = y1 - u * (y1 - y0);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.5 * Math.sin(u * Math.PI);
      });
    }
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
      const target = d.open ? 1 : 0;
      if (d.sink === target) {
        d.mesh.visible = d.sink < 1;
        continue;
      }
      d.sink = d.open ? Math.min(1, d.sink + dt * DOOR_SPEED) : Math.max(0, d.sink - dt * DOOR_SPEED);
      // Sink a little past the floor and then hide: a door top resting exactly at floor height
      // z-fights with the floor and flickers (the "flashing" open door from the playtest).
      d.mesh.position.set(d.def.position[0], d.def.position[1] - (d.def.size[1] + 0.08) * d.sink, d.def.position[2]);
      d.mesh.visible = d.sink < 1;
    }
    for (const s of this.switches) {
      const m = s.mesh.material as THREE.MeshStandardMaterial;
      if (!s.pressed) m.emissiveIntensity = 1.6 + Math.sin(time * 5) * 0.6;
      else if (s.left < DOOR_WARN_SECONDS) m.emissiveIntensity = Math.sin(time * 22) > 0 ? 2.2 : 0.3;
      else m.emissiveIntensity = 0.9;
      s.mesh.position.y = s.def.position[1] + (s.pressed ? -0.02 : 0.05);
      // The ring around the switch drains as the doors' time runs out.
      const ring = s.mesh.children[0] as THREE.Mesh | undefined;
      if (ring) {
        const total = s.def.time ?? DOOR_OPEN_SECONDS;
        const k = s.pressed ? s.left / total : 0;
        ring.visible = k > 0;
        (ring.geometry as THREE.RingGeometry).setDrawRange(0, Math.ceil(k * RING_SEGMENTS) * 6);
      }
    }
    for (const g of this.portals) {
      g.gates.forEach((gate, i) => {
        gate.rotation.y = time * (i ? -1.6 : 1.6);
        const swirl = gate.children[1] as THREE.Mesh | undefined;
        if (swirl) (swirl.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(time * 4 + i) * 0.12;
      });
    }
    for (const k of this.keys) {
      const [x, y, z] = k.def.position;
      if (k.got) {
        if (k.fly > 0 && k.fly < 1) {
          k.fly = Math.min(1, k.fly + dt * 2.2);
          k.mesh.position.set(x, y + 0.6 + k.fly * 2.5, z);
          k.mesh.scale.setScalar(1 - k.fly * 0.9);
        }
        k.mesh.visible = k.fly < 1;
        continue;
      }
      k.mesh.position.set(x, y + 0.6 + Math.sin(time * 2.4 + x) * 0.12, z);
      k.mesh.rotation.y = time * 1.8;
    }
    for (const f of this.fans) {
      const warn = !f.on && this.untilOn(f.def) < WARN_AHEAD;
      f.level += ((f.on ? 1 : warn ? 0.25 : 0) - f.level) * Math.min(1, dt * 6);
      f.blades.rotation.z += dt * (2 + f.level * 26);
      const m = f.air.material as THREE.MeshBasicMaterial;
      m.opacity = 0.04 + f.level * 0.5;
      if (m.map) m.map.offset.y = (m.map.offset.y - dt * (0.3 + f.level * 3) + 1) % 1;
    }
    for (const q of this.pulses) {
      const warn = !q.on && this.untilOn(q.def) < WARN_AHEAD;
      q.mat.opacity = q.on ? 0.85 + Math.sin(time * 30) * 0.1 : warn ? (Math.sin(time * 40) > 0 ? 0.45 : 0.12) : 0.1;
      q.mat.color.set(q.on || warn ? COLORS.hazard : '#ff9a5a');
      q.edge.opacity = q.on ? 1 : 0.55;
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
    // Countdown ring: a bright arc around the switch that shrinks while its doors are open.
    const ringGeo = new THREE.RingGeometry(0.78, 0.92, RING_SEGMENTS, 1, Math.PI / 2, Math.PI * 2);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffe14d', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.07;
    ring.visible = false;
    mesh.add(ring);
    this.group.add(mesh);
    this.disposables.push(geo, mat, ringGeo, ringMat);
    this.switches.push({ def, mesh, pressed: false, left: 0, occupied: false });
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

  /** Two glowing gate rings on the floor, tinted per pair so pairs can be told apart (decoys are red). */
  private addPortal(def: PortalDef, index: number): void {
    const tint = def.decoy ? DECOY_COLOR : PORTAL_TINTS[index % PORTAL_TINTS.length];
    const ringGeo = new THREE.TorusGeometry(0.72, 0.07, 10, 48);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 2.4, metalness: 0.4, roughness: 0.3 });
    const swirlGeo = new THREE.CircleGeometry(0.68, 6);
    swirlGeo.rotateX(-Math.PI / 2);
    const gates: THREE.Object3D[] = [];
    const ends = [def.a, def.b];
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      g.position.set(ends[i][0], ends[i][1] + 0.04, ends[i][2]);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.05;
      g.add(ring);
      const swirlMat = new THREE.MeshBasicMaterial({ color: i === 0 || def.twoWay ? tint : PORTAL_COLOR, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const swirl = new THREE.Mesh(swirlGeo, swirlMat);
      swirl.position.y = 0.02;
      g.add(swirl);
      this.disposables.push(swirlMat);
      // The entry gate has a short glow column so it reads from a distance; the exit is a flat ring.
      if (i === 0 || def.twoWay) {
        const colGeo = new THREE.CylinderGeometry(0.7, 0.7, 1.4, 24, 1, true);
        const colMat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const col = new THREE.Mesh(colGeo, colMat);
        col.position.y = 0.7;
        g.add(col);
        this.disposables.push(colGeo, colMat);
      }
      this.group.add(g);
      gates.push(g);
    }
    this.disposables.push(ringGeo, ringMat, swirlGeo);
    this.portals.push({ def, gates, armed: [true, true] });
  }

  /** A floating golden key core. */
  /** A gold key (ring, shaft, teeth) leaning back and spinning over a glowing ring on the floor. */
  private addKey(def: KeyDef): void {
    const holder = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: KEY_COLOR, emissive: KEY_COLOR, emissiveIntensity: 0.55, metalness: 0.9, roughness: 0.2 });
    const key = new THREE.Group();
    const geos: THREE.BufferGeometry[] = [];
    const part = (geo: THREE.BufferGeometry, x: number, y: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, 0);
      key.add(m);
      geos.push(geo);
      return m;
    };
    // Bow: the ring you hold, with a small gem in the middle.
    part(new THREE.TorusGeometry(0.17, 0.055, 12, 32), 0, 0.27);
    part(new THREE.OctahedronGeometry(0.06, 0), 0, 0.27);
    // Collar where the bow meets the shaft, then the shaft.
    part(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 16), 0, 0.075);
    part(new THREE.CylinderGeometry(0.045, 0.045, 0.56, 12), 0, -0.2);
    // Bit: two teeth sticking out to one side near the tip.
    part(new THREE.BoxGeometry(0.17, 0.075, 0.07), 0.1, -0.43);
    part(new THREE.BoxGeometry(0.12, 0.06, 0.07), 0.075, -0.29);
    // Big enough to read at a glance, and leaning back so the camera above sees its face as it spins.
    key.scale.setScalar(1.45);
    key.rotation.x = -1.0;
    holder.add(key);
    // A soft ring on the floor under the key so it reads as a pickup from above.
    const haloGeo = new THREE.TorusGeometry(0.42, 0.025, 8, 40);
    const haloMat = new THREE.MeshBasicMaterial({ color: KEY_COLOR, transparent: true, opacity: 0.55, depthWrite: false });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -0.52;
    holder.add(halo);
    const light = new THREE.PointLight(KEY_COLOR, 3, 3.5, 1.8);
    holder.add(light);
    holder.position.fromArray(def.position);
    this.group.add(holder);
    this.disposables.push(mat, haloGeo, haloMat, ...geos);
    this.keys.push({ def, mesh: holder, got: false, fly: 0 });
  }

  /** A fan housing on the upwind side of its air box, and moving streaks showing where the air blows. */
  private addFan(def: FanDef): void {
    const dir = new THREE.Vector3(def.dir[0], 0, def.dir[1]).normalize();
    const cx = (def.min[0] + def.max[0]) / 2;
    const cz = (def.min[2] + def.max[2]) / 2;
    const sx = def.max[0] - def.min[0];
    const sz = def.max[2] - def.min[2];
    const floorY = def.min[1] + 0.5;
    // Housing sits at the upwind edge, facing downwind.
    const alongX = Math.abs(dir.x) > Math.abs(dir.z);
    const span = alongX ? sz : sx;
    // Just in front of the upwind wall, so the whole rotor shows above the floor.
    const hx = alongX ? (dir.x > 0 ? def.min[0] : def.max[0]) + dir.x * 0.03 : cx;
    const hz = alongX ? cz : (dir.z > 0 ? def.min[2] : def.max[2]) + dir.z * 0.03;
    const housing = new THREE.Group();
    const r = Math.min(0.62, span / 2 - 0.05);
    housing.position.set(hx, floorY + r + 0.08, hz);
    housing.rotation.y = Math.atan2(dir.x, dir.z);
    const rimGeo = new THREE.TorusGeometry(r, 0.07, 8, 40);
    const rimMat = new THREE.MeshStandardMaterial({ color: '#8fa0b8', metalness: 0.9, roughness: 0.3, emissive: FAN_COLOR, emissiveIntensity: 0.5 });
    housing.add(new THREE.Mesh(rimGeo, rimMat));
    const blades = new THREE.Group();
    const bladeGeo = new THREE.BoxGeometry(0.16, r * 1.8, 0.04);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(bladeGeo, rimMat);
      b.rotation.z = (i / 3) * Math.PI;
      blades.add(b);
    }
    housing.add(blades);
    this.group.add(housing);
    // Air: chevrons scrolling over the floor along the wind.
    this.padTexture ??= chevronTexture();
    const tex = this.padTexture.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, alongX ? sx : sz);
    const airMat = new THREE.MeshBasicMaterial({ color: FAN_COLOR, map: tex, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending });
    const airGeo = alongX ? new THREE.PlaneGeometry(sz * 0.96, sx) : new THREE.PlaneGeometry(sx * 0.96, sz);
    airGeo.rotateX(-Math.PI / 2);
    const air = new THREE.Mesh(airGeo, airMat);
    air.position.set(cx, floorY - 0.5 + 0.35, cz);
    air.rotation.y = Math.atan2(-dir.x, -dir.z);
    this.group.add(air);
    this.disposables.push(rimGeo, rimMat, bladeGeo, tex, airMat, airGeo);
    this.fans.push({ def, on: false, level: 0, blades, air });
  }

  /** A pulse floor: a tinted patch with a bright edge that turns hazard red while it is live. */
  private addPulse(def: PulseDef): void {
    const w = def.max[0] - def.min[0];
    const d = def.max[1] - def.min[1];
    const geo = new THREE.PlaneGeometry(w * 0.98, d * 0.98);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: '#ff9a5a', transparent: true, opacity: 0.1, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((def.min[0] + def.max[0]) / 2, def.y + 0.02, (def.min[1] + def.max[1]) / 2);
    const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w * 0.98, 0.001, d * 0.98));
    const edge = new THREE.LineBasicMaterial({ color: COLORS.hazard, transparent: true, opacity: 0.55 });
    const line = new THREE.LineSegments(edgeGeo, edge);
    line.position.y = 0.01;
    mesh.add(line);
    this.group.add(mesh);
    this.disposables.push(geo, mat, edgeGeo, edge);
    this.pulses.push({ def, on: false, mat, edge });
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
