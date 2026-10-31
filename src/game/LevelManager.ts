import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsManager } from '../physics/PhysicsManager';
import type { CheckpointDef, LevelDef, MoverDef, PlatformDef, PylonDef, ShiftZoneDef, V3 } from '../levels/LevelTypes';
import { COLORS, platformMaterial, trimMaterial, undersideMaterial } from '../render/Materials';
import { GoalPortal } from './GoalPortal';
import { buildMaze } from './MazeBuilder';

const TRIM = 0.07;
const TEXTURE_TILE = 4; // metres per texture repeat

interface MoverRuntime {
  def: MoverDef;
  body: RAPIER.RigidBody;
  mesh: THREE.Mesh;
  /** Where the mover is headed this step, and how far that is from last step (ride platforms carry the ball). */
  target?: THREE.Vector3;
  delta?: THREE.Vector3;
}

export interface CheckpointRuntime {
  def: CheckpointDef;
  mesh: THREE.Mesh;
  beam: THREE.Mesh;
  active: boolean;
}

/**
 * Builds a level from its data definition: render meshes + static Rapier colliders.
 * Levels are plain data, so new levels never need new code.
 */
export class LevelManager {
  level: LevelDef | null = null;
  readonly group = new THREE.Group();
  readonly bounds = new THREE.Box3();
  checkpoints: CheckpointRuntime[] = [];
  goal: GoalPortal | null = null;
  hazards: THREE.Box3[] = [];
  /** Colliders the camera looks straight through (glass ceilings). */
  readonly seeThrough = new Set<number>();

  private movers: MoverRuntime[] = [];
  private hazardMaterial: THREE.MeshStandardMaterial | null = null;
  private edgeMaterial: THREE.MeshStandardMaterial | null = null;
  private moverTime = 0;

  private body: RAPIER.RigidBody | null = null;
  private disposables: { dispose(): void }[] = [];

  constructor(private physics: PhysicsManager, scene: THREE.Scene) {
    scene.add(this.group);
  }

  load(def: LevelDef): void {
    this.unload();
    this.level = def;
    const R = this.physics.rapier;
    this.body = this.physics.world.createRigidBody(R.RigidBodyDesc.fixed());

    this.bounds.makeEmpty();
    if (def.maze) {
      const maze = buildMaze(def.maze, this.physics, this.body, def.theme);
      maze.objects.forEach((o) => this.group.add(o));
      this.disposables.push(...maze.disposables);
      this.hazards = maze.hazards;
      this.hazardMaterial = maze.hazardMaterial;
      this.edgeMaterial = maze.edgeMaterial;
      this.bounds.union(maze.bounds);
    }
    for (const p of def.platforms) {
      const half = new THREE.Vector3(...p.size).multiplyScalar(0.5);
      const c = new THREE.Vector3(...p.position);
      this.bounds.expandByPoint(c.clone().sub(half)).expandByPoint(c.clone().add(half));
    }
    const centre = this.bounds.getCenter(new THREE.Vector3());

    for (const p of def.platforms) this.addPlatform(p, centre);
    for (const p of def.pylons ?? []) this.addPylon(p);
    for (const m of def.movers ?? []) this.addMover(m);
    this.moverTime = 0;
    this.checkpoints = (def.checkpoints ?? []).map((c) => this.addCheckpoint(c));
    if (def.goal) {
      this.goal = new GoalPortal(def.goal.position, def.goal.up, def.goal.facing);
      this.group.add(this.goal.object);
    }
  }

  unload(): void {
    if (this.body) this.physics.world.removeRigidBody(this.body);
    for (const m of this.movers) this.physics.world.removeRigidBody(m.body);
    this.movers = [];
    this.hazards = [];
    this.hazardMaterial = null;
    this.edgeMaterial = null;
    this.body = null;
    this.group.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.checkpoints = [];
    this.goal = null;
    this.seeThrough.clear();
  }

  /** Ball has touched red energy floor. */
  inHazard(p: THREE.Vector3): boolean {
    return this.hazards.some((h) => h.containsPoint(p));
  }

  /** The gravity zone containing `p` that is active under the current gravity, if any. */
  shiftZoneAt(p: THREE.Vector3, down: THREE.Vector3): ShiftZoneDef | null {
    for (const z of this.level?.shiftZones ?? []) {
      if (z.whenDown && v3(z.whenDown).dot(down) < 0.99) continue;
      if (new THREE.Box3(v3(z.min), v3(z.max)).containsPoint(p)) return z;
    }
    return null;
  }

  /** Advances moving obstacles; call before every physics step. */
  stepMovers(dt: number): void {
    this.moverTime += dt;
    for (const m of this.movers) {
      const t = ((this.moverTime / m.def.period + (m.def.phase ?? 0)) % 1 + 1) % 1;
      // Smooth ping-pong: ease at both ends so the block visibly pauses before reversing.
      let k = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
      if (m.def.kind === 'platform') {
        // Ride platforms wait at each end for a fifth of the cycle so the sphere can roll on and off.
        const u = t < 0.2 ? 0 : t < 0.5 ? (t - 0.2) / 0.3 : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
        k = 0.5 - 0.5 * Math.cos(u * Math.PI);
      }
      const p = v3(m.def.from).lerp(v3(m.def.to), k);
      m.delta = m.target ? p.clone().sub(m.target) : new THREE.Vector3();
      m.target = p;
      m.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
    }
  }

  /** How far the ride platform under a ball at `p` moves this step (null when not on one), so the ball travels with it. */
  platformCarry(p: THREE.Vector3, radius: number): THREE.Vector3 | null {
    for (const m of this.movers) {
      if (m.def.kind !== 'platform' || !m.target || !m.delta) continue;
      const half = m.def.size.map((v) => v / 2);
      const top = m.target.y - m.delta.y + half[1];
      const c = m.target.clone().sub(m.delta);
      if (Math.abs(p.x - c.x) < half[0] + 0.1 && Math.abs(p.z - c.z) < half[2] + 0.1 && p.y > top && p.y < top + radius + 0.3) return m.delta;
    }
    return null;
  }

  isOutOfBounds(p: THREE.Vector3): boolean {
    if (this.level?.killY !== undefined && p.y < this.level.killY) return true;
    const m = this.level?.fallMargin ?? 10;
    const b = this.bounds;
    return p.x < b.min.x - m || p.y < b.min.y - m || p.z < b.min.z - m || p.x > b.max.x + m || p.y > b.max.y + m || p.z > b.max.z + m;
  }

  update(dt: number, time: number): void {
    this.goal?.update(dt, time);
    for (const m of this.movers) {
      const t = m.body.translation();
      m.mesh.position.set(t.x, t.y, t.z);
    }
    if (this.hazardMaterial) {
      this.hazardMaterial.emissiveIntensity = 1.3 + Math.sin(time * 6) * 0.6;
      this.hazardMaterial.map!.offset.x = (time * 0.6) % 1;
    }
    if (this.edgeMaterial) this.edgeMaterial.emissiveIntensity = 1.6 + Math.sin(time * 4) * 0.9;
    for (const c of this.checkpoints) {
      const mat = c.mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = c.active ? 2.5 + Math.sin(time * 4) * 0.6 : 0.8 + Math.sin(time * 2) * 0.3;
      const bm = c.beam.material as THREE.MeshBasicMaterial;
      bm.opacity += ((c.active ? 0.14 + Math.sin(time * 3) * 0.04 : 0) - bm.opacity) * Math.min(1, dt * 4);
    }
  }

  private addPlatform(p: PlatformDef, levelCentre: THREE.Vector3): void {
    const role = p.role ?? 'safe';
    const [sx, sy, sz] = p.size;
    const pos = new THREE.Vector3(...p.position);

    // Main slab with bevelled edges. Texture repeat follows the two largest dimensions.
    const dims = [sx, sy, sz].sort((a, b) => b - a);
    const geo = new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(0.12, Math.min(sx, sy, sz) * 0.2));
    const mat = platformMaterial(dims[0] / TEXTURE_TILE, dims[1] / TEXTURE_TILE, role);
    if (p.glass) {
      // Gravity glass: see the course through it from above, and roll on it from below.
      mat.transparent = true;
      mat.opacity = 0.28;
      mat.depthWrite = false;
      mat.color.set('#c9a8ff');
      mat.emissive = new THREE.Color('#a24bff');
      mat.emissiveIntensity = 0.25;
    }
    const holder = new THREE.Group();
    holder.position.copy(pos);
    const rot = p.rotation ? new THREE.Euler(...(p.rotation.map((d) => (d * Math.PI) / 180) as V3)) : null;
    if (rot) holder.rotation.copy(rot);
    this.group.add(holder);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = role !== 'gravity' && !p.glass;
    holder.add(mesh);
    this.disposables.push(geo, mat);

    // Glowing trim along all 12 edges (merged into one draw call).
    const trims: THREE.BufferGeometry[] = [];
    const h = [sx / 2, sy / 2, sz / 2];
    for (let axis = 0; axis < 3; axis++) {
      const a1 = (axis + 1) % 3;
      const a2 = (axis + 2) % 3;
      for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
        const size = [TRIM, TRIM, TRIM];
        size[axis] = p.size[axis] + TRIM;
        const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
        const off = [0, 0, 0];
        off[a1] = s1 * h[a1];
        off[a2] = s2 * h[a2];
        g.translate(off[0], off[1], off[2]);
        trims.push(g);
      }
    }
    const trimGeo = mergeGeometries(trims);
    trims.forEach((g) => g.dispose());
    const trimMat = trimMaterial(role === 'gravity' ? 'gravity' : role);
    const trim = new THREE.Mesh(trimGeo, trimMat);
    holder.add(trim);
    this.disposables.push(trimGeo, trimMat);

    // Mechanical underside detail on the face pointing away from the course.
    if (role !== 'hazard' && !rot && !p.glass) this.addUnderside(p, levelCentre);

    const R = this.physics.rapier;
    const q = new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler());
    const col = R.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2)
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setFriction(p.friction ?? 0.9)
      .setRestitution(0.15);
    const collider = this.physics.world.createCollider(col, this.body!);
    if (p.glass) this.seeThrough.add(collider.handle);
  }

  private addUnderside(p: PlatformDef, levelCentre: THREE.Vector3): void {
    const size = p.size;
    const thin = size.indexOf(Math.min(...size));
    const toCentre = levelCentre.getComponent(thin) - p.position[thin];
    const sign = Math.abs(toCentre) < 0.01 ? -1 : -Math.sign(toCentre);
    const a1 = (thin + 1) % 3;
    const a2 = (thin + 2) % 3;
    const parts: THREE.BufferGeometry[] = [];
    const n1 = Math.max(1, Math.floor(size[a1] / 3));
    const n2 = Math.max(1, Math.floor(size[a2] / 3));
    for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) {
      const g = new THREE.CylinderGeometry(0.35, 0.55, 0.6, 8);
      // Cylinder is along y; rotate onto the thin axis.
      if (thin === 0) g.rotateZ(Math.PI / 2);
      if (thin === 2) g.rotateX(Math.PI / 2);
      const off = [0, 0, 0];
      off[thin] = sign * (size[thin] / 2 + 0.3);
      off[a1] = (i + 0.5 - n1 / 2) * (size[a1] / n1);
      off[a2] = (j + 0.5 - n2 / 2) * (size[a2] / n2);
      g.translate(p.position[0] + off[0], p.position[1] + off[1], p.position[2] + off[2]);
      parts.push(g);
    }
    // Two long ribs.
    for (const s of [-1, 1]) {
      const dims = [0, 0, 0];
      dims[thin] = 0.35;
      dims[a1] = size[a1] * 0.9;
      dims[a2] = 0.3;
      const g = new THREE.BoxGeometry(dims[0], dims[1], dims[2]);
      const off = [0, 0, 0];
      off[thin] = sign * (size[thin] / 2 + 0.17);
      off[a2] = s * size[a2] * 0.3;
      g.translate(p.position[0] + off[0], p.position[1] + off[1], p.position[2] + off[2]);
      parts.push(g);
    }
    const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()));
    parts.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, undersideMaterial);
    this.group.add(mesh);
    this.disposables.push(merged);
  }

  private addPylon(p: PylonDef): void {
    const axis = new THREE.Vector3(...(p.axis ?? [0, 1, 0])).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    const centre = new THREE.Vector3(...p.position).addScaledVector(axis, p.height / 2);

    const geo = new THREE.CylinderGeometry(p.radius, p.radius * 1.1, p.height, 24);
    const mat = new THREE.MeshStandardMaterial({ color: '#9aa4b2', metalness: 0.95, roughness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(centre);
    mesh.quaternion.copy(q);
    mesh.castShadow = mesh.receiveShadow = true;
    const ringGeo = new THREE.TorusGeometry(p.radius * 1.02, 0.04, 8, 32);
    const ring = new THREE.Mesh(ringGeo, trimMaterial('safe'));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = p.height / 2 - 0.12;
    mesh.add(ring);
    this.group.add(mesh);
    this.disposables.push(geo, mat, ringGeo);

    const R = this.physics.rapier;
    const col = R.ColliderDesc.cylinder(p.height / 2, p.radius)
      .setTranslation(centre.x, centre.y, centre.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setFriction(0.5)
      .setRestitution(0.4);
    this.physics.world.createCollider(col, this.body!);
  }

  private addMover(def: MoverDef): void {
    const R = this.physics.rapier;
    const start = v3(def.from);
    const body = this.physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, start.y, start.z));
    const platform = def.kind === 'platform';
    this.physics.world.createCollider(R.ColliderDesc.cuboid(def.size[0] / 2, def.size[1] / 2, def.size[2] / 2).setFriction(platform ? 1 : 0.6).setRestitution(platform ? 0.05 : 0.3), body);
    if (platform) {
      this.addRidePlatform(def, body, start);
      return;
    }

    const geo = new RoundedBoxGeometry(def.size[0], def.size[1], def.size[2], 2, 0.08);
    const mat = new THREE.MeshStandardMaterial({ color: '#4a3a1c', metalness: 0.85, roughness: 0.35, emissive: COLORS.moving, emissiveIntensity: 0.35 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    // Amber hazard stripes on top.
    const stripeGeo = new THREE.BoxGeometry(def.size[0] * 1.01, 0.05, def.size[2] * 0.25);
    const stripeMat = trimMaterial('moving');
    for (const off of [-0.3, 0.3]) {
      const s = new THREE.Mesh(stripeGeo, stripeMat);
      s.position.set(0, def.size[1] / 2, off * def.size[2]);
      mesh.add(s);
    }
    mesh.position.copy(start);
    // Amber running light on top so the piston is readable even at the edge of the screen.
    const lamp = new THREE.PointLight(COLORS.moving, 3, 3.5, 1.8);
    lamp.position.y = def.size[1] / 2 + 0.3;
    mesh.add(lamp);
    this.group.add(mesh);

    // Recessed guide track with glowing amber rails, showing exactly where the piston travels.
    const end = v3(def.to);
    const travel = end.clone().sub(start);
    const len = travel.length() + Math.max(def.size[0], def.size[2]);
    const alongX = Math.abs(travel.x) > Math.abs(travel.z);
    const trackW = alongX ? def.size[2] : def.size[0];
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const floorY = start.y - def.size[1] / 2;
    const trackGeo = new THREE.BoxGeometry(alongX ? len : trackW + 0.2, 0.02, alongX ? trackW + 0.2 : len);
    const trackMat = new THREE.MeshStandardMaterial({ color: '#141820', metalness: 0.9, roughness: 0.5 });
    const track = new THREE.Mesh(trackGeo, trackMat);
    track.position.set(mid.x, floorY + 0.011, mid.z);
    track.receiveShadow = true;
    this.group.add(track);
    const railGeo = new THREE.BoxGeometry(alongX ? len : 0.05, 0.03, alongX ? 0.05 : len);
    for (const sgn of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, stripeMat);
      const off = (trackW / 2 + 0.1) * sgn;
      rail.position.set(mid.x + (alongX ? 0 : off), floorY + 0.02, mid.z + (alongX ? off : 0));
      this.group.add(rail);
    }
    this.disposables.push(geo, mat, stripeGeo, stripeMat, trackGeo, trackMat, railGeo);
    this.movers.push({ def, body, mesh });
  }

  /** A cyan slab that carries the ball over the void, with a faint line showing its route. */
  private addRidePlatform(def: MoverDef, body: RAPIER.RigidBody, start: THREE.Vector3): void {
    const geo = new RoundedBoxGeometry(def.size[0], def.size[1], def.size[2], 2, 0.08);
    const mat = platformMaterial(def.size[0] / TEXTURE_TILE, def.size[2] / TEXTURE_TILE, 'safe');
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = mesh.castShadow = true;
    mesh.position.copy(start);
    const edgeGeo = new THREE.BoxGeometry(def.size[0] + 0.04, 0.05, def.size[2] + 0.04);
    const edgeMat = trimMaterial('safe');
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.position.y = def.size[1] / 2 - 0.02;
    edge.scale.set(1, 1, 1);
    mesh.add(edge);
    this.group.add(mesh);
    const end = v3(def.to);
    const routeGeo = new THREE.BufferGeometry().setFromPoints([start.clone().setY(start.y - def.size[1] / 2 - 0.2), end.clone().setY(end.y - def.size[1] / 2 - 0.2)]);
    const routeMat = new THREE.LineDashedMaterial({ color: COLORS.safe, dashSize: 0.3, gapSize: 0.25, transparent: true, opacity: 0.6 });
    const route = new THREE.Line(routeGeo, routeMat);
    route.computeLineDistances();
    this.group.add(route);
    this.disposables.push(geo, mat, edgeGeo, edgeMat, routeGeo, routeMat);
    this.movers.push({ def, body, mesh });
  }

  private addCheckpoint(def: CheckpointDef): CheckpointRuntime {
    const up = new THREE.Vector3(...def.frame.down).negate();
    const holder = new THREE.Group();
    holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    holder.position.fromArray(def.position);
    this.group.add(holder);

    const geo = new THREE.RingGeometry(1.05, 1.3, 48);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: '#3dffc8', emissive: '#3dffc8', emissiveIntensity: 0.8, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.02;
    holder.add(mesh);

    // Four bevelled bollards frame the pad so it reads as a place, not just a decal.
    const postGeo = new RoundedBoxGeometry(0.22, 0.5, 0.22, 2, 0.05);
    const postMat = new THREE.MeshStandardMaterial({ color: '#b9c3d2', metalness: 0.95, roughness: 0.25 });
    const capMat = trimMaterial('safe');
    const capGeo = new THREE.BoxGeometry(0.24, 0.05, 0.24);
    for (const [px, pz] of [[-1.25, -1.25], [1.25, -1.25], [-1.25, 1.25], [1.25, 1.25]]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(px, 0.25, pz);
      post.castShadow = true;
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = 0.26;
      post.add(cap);
      holder.add(post);
    }

    // Light column that appears once the checkpoint is active.
    const beamGeo = new THREE.CylinderGeometry(1.0, 1.15, 3, 32, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({ color: '#3dffc8', transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 1.5;
    holder.add(beam);
    this.disposables.push(geo, mat, postGeo, postMat, capMat, capGeo, beamGeo, beamMat);
    return { def, mesh, beam, active: false };
  }
}

export function v3(a: V3): THREE.Vector3 {
  return new THREE.Vector3(a[0], a[1], a[2]);
}
