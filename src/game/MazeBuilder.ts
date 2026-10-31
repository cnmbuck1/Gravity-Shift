import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsManager } from '../physics/PhysicsManager';
import type { MazeDef } from '../levels/LevelTypes';
import { COLORS, hazardStripeTexture, mazeFloorMaterial, mazeWallMaterial, trimMaterial } from '../render/Materials';

const FLOOR_THICKNESS = 0.6;
const TRIM = 0.06;
const FLOOR_CHARS = '.SCGPX';
const NO_FLOOR = ' B';

export interface MazeBuildResult {
  objects: THREE.Object3D[];
  disposables: { dispose(): void }[];
  /** Red energy floor volumes; touching one destroys the ball. */
  hazards: THREE.Box3[];
  /** Animated materials: red energy floor, red hole edges. */
  hazardMaterial: THREE.MeshStandardMaterial;
  edgeMaterial: THREE.MeshStandardMaterial;
  bounds: THREE.Box3;
}

/**
 * Turns a text maze into geometry. Adjacent cells in a row are merged into one box, and all
 * boxes of a kind are merged into one mesh, so a whole labyrinth is a handful of draw calls
 * and a few dozen colliders.
 */
export function buildMaze(def: MazeDef, physics: PhysicsManager, body: RAPIER.RigidBody): MazeBuildResult {
  const { cell, floorY, wallHeight, rows } = def;
  const at = (r: number, c: number): string => rows[r]?.[c] ?? ' ';
  // A wall face is visible (and gets a glowing border) where it borders a pathway or a hole.
  // Wall cells buried deep inside solid regions are dropped, so the maze reads as walled
  // corridors suspended in space rather than channels cut into a slab.
  const buried = (r: number, c: number): boolean => {
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const n = rows[r + dr]?.[c + dc];
        if (n !== undefined && n !== '#' && n !== '|') return false;
      }
    return true;
  };
  const open = (r: number, c: number): boolean => r >= 0 && r < rows.length && c >= 0 && c < rows[r].length && at(r, c) !== '#' && at(r, c) !== '|';
  const cx = (c: number) => def.origin[0] + c * cell;
  const cz = (r: number) => def.origin[1] + r * cell;
  const R = physics.rapier;

  const floorBoxes: THREE.BufferGeometry[] = [];
  const wallBoxes: THREE.BufferGeometry[] = [];
  const cyanTrims: THREE.BufferGeometry[] = [];
  const redTrims: THREE.BufferGeometry[] = [];
  const purpleTiles: THREE.BufferGeometry[] = [];
  const baseGlows: THREE.BufferGeometry[] = [];
  const padTiles: Record<string, THREE.BufferGeometry[]> = { S: [], C: [], G: [] };
  const hazardTiles: THREE.BufferGeometry[] = [];
  const hazards: THREE.Box3[] = [];
  const bounds = new THREE.Box3();

  const addCollider = (centre: THREE.Vector3, size: THREE.Vector3) => {
    physics.world.createCollider(
      R.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
        .setTranslation(centre.x, centre.y, centre.z)
        .setFriction(0.9)
        .setRestitution(0.2),
      body,
    );
  };

  const box = (centre: THREE.Vector3, size: THREE.Vector3) => {
    const g = new THREE.BoxGeometry(size.x, size.y, size.z);
    g.translate(centre.x, centre.y, centre.z);
    return g;
  };

  for (let r = 0; r < rows.length; r++) {
    // Merge horizontal runs of the same kind (floor vs wall).
    let c = 0;
    while (c < rows[r].length) {
      const kindAt = (cc: number) => {
        const ch = at(r, cc);
        if (ch === '#') return buried(r, cc) ? 'none' : 'wall';
        return FLOOR_CHARS.includes(ch) ? 'floor' : 'none';
      };
      const kind = kindAt(c);
      let end = c;
      while (end + 1 < rows[r].length) {
        const nk = kindAt(end + 1);
        if (nk !== kind) break;
        end++;
      }
      if (kind !== 'none') {
        const x0 = cx(c) - cell / 2;
        const x1 = cx(end) + cell / 2;
        const top = kind === 'wall' ? floorY + wallHeight : floorY;
        const bottom = floorY - FLOOR_THICKNESS;
        const centre = new THREE.Vector3((x0 + x1) / 2, (top + bottom) / 2, cz(r));
        const size = new THREE.Vector3(x1 - x0, top - bottom, cell);
        if (kind === 'wall') {
          // Bevelled wall runs: the rounded edges catch the light and read as machined metal.
          const g = new RoundedBoxGeometry(size.x, size.y, size.z, 2, 0.09);
          g.translate(centre.x, centre.y, centre.z);
          wallBoxes.push(g);
        } else floorBoxes.push(box(centre, size));
        addCollider(centre, size);
        bounds.expandByPoint(new THREE.Vector3(x0, bottom, cz(r) - cell / 2)).expandByPoint(new THREE.Vector3(x1, top, cz(r) + cell / 2));
      }
      c = end + 1;
    }

    for (let c2 = 0; c2 < rows[r].length; c2++) {
      const ch = at(r, c2);
      const x = cx(c2);
      const z = cz(r);
      if (ch === '#') {
        if (buried(r, c2)) continue;
        // Glowing cyan border along wall tops wherever they face a pathway.
        const y = floorY + wallHeight;
        const h = cell / 2;
        // Soft glow strip where each visible wall face meets the floor.
        const gy = floorY + 0.03;
        const G = 0.035;
        if (FLOOR_CHARS.includes(at(r - 1, c2))) baseGlows.push(box(new THREE.Vector3(x, gy, z - h - G / 2), new THREE.Vector3(cell, G, G)));
        if (FLOOR_CHARS.includes(at(r + 1, c2))) baseGlows.push(box(new THREE.Vector3(x, gy, z + h + G / 2), new THREE.Vector3(cell, G, G)));
        if (FLOOR_CHARS.includes(at(r, c2 - 1))) baseGlows.push(box(new THREE.Vector3(x - h - G / 2, gy, z), new THREE.Vector3(G, G, cell)));
        if (FLOOR_CHARS.includes(at(r, c2 + 1))) baseGlows.push(box(new THREE.Vector3(x + h + G / 2, gy, z), new THREE.Vector3(G, G, cell)));
        if (open(r - 1, c2)) cyanTrims.push(box(new THREE.Vector3(x, y, z - h), new THREE.Vector3(cell + TRIM, TRIM, TRIM)));
        if (open(r + 1, c2)) cyanTrims.push(box(new THREE.Vector3(x, y, z + h), new THREE.Vector3(cell + TRIM, TRIM, TRIM)));
        if (open(r, c2 - 1)) cyanTrims.push(box(new THREE.Vector3(x - h, y, z), new THREE.Vector3(TRIM, TRIM, cell + TRIM)));
        if (open(r, c2 + 1)) cyanTrims.push(box(new THREE.Vector3(x + h, y, z), new THREE.Vector3(TRIM, TRIM, cell + TRIM)));
        continue;
      }
      if (!FLOOR_CHARS.includes(ch)) continue;
      // Red warning edge wherever the floor drops into a hole.
      const h = cell / 2;
      const y = floorY + 0.005;
      if (NO_FLOOR.includes(at(r - 1, c2))) redTrims.push(box(new THREE.Vector3(x, y, z - h + TRIM / 2), new THREE.Vector3(cell, TRIM, TRIM)));
      if (NO_FLOOR.includes(at(r + 1, c2))) redTrims.push(box(new THREE.Vector3(x, y, z + h - TRIM / 2), new THREE.Vector3(cell, TRIM, TRIM)));
      if (NO_FLOOR.includes(at(r, c2 - 1))) redTrims.push(box(new THREE.Vector3(x - h + TRIM / 2, y, z), new THREE.Vector3(TRIM, TRIM, cell)));
      if (NO_FLOOR.includes(at(r, c2 + 1))) redTrims.push(box(new THREE.Vector3(x + h - TRIM / 2, y, z), new THREE.Vector3(TRIM, TRIM, cell)));

      if (ch in padTiles) {
        const tile = new THREE.PlaneGeometry(cell * 0.96, cell * 0.96);
        tile.rotateX(-Math.PI / 2);
        tile.translate(x, floorY + 0.01, z);
        padTiles[ch].push(tile);
      }
      if (ch === 'P' || ch === 'X') {
        const tile = new THREE.PlaneGeometry(cell * 0.92, cell * 0.92);
        tile.rotateX(-Math.PI / 2);
        tile.translate(x, floorY + 0.012, z);
        (ch === 'P' ? purpleTiles : hazardTiles).push(tile);
      }
      if (ch === 'X') {
        hazards.push(new THREE.Box3(new THREE.Vector3(x - h, floorY - 0.1, z - h), new THREE.Vector3(x + h, floorY + 1.2, z + h)));
      }
    }
  }

  const objects: THREE.Object3D[] = [];
  const disposables: { dispose(): void }[] = [];
  const addMerged = (parts: THREE.BufferGeometry[], material: THREE.Material, opts: { shadow?: boolean; worldUV?: number } = {}) => {
    if (!parts.length) return;
    const g = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    if (opts.worldUV) applyWorldUVs(g, opts.worldUV);
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    m.castShadow = Boolean(opts.shadow);
    objects.push(m);
    disposables.push(g);
  };

  const floorMat = mazeFloorMaterial();
  const wallMat = mazeWallMaterial();
  // Red energy floor: scrolling warning stripes (animated via texture offset).
  const stripes = hazardStripeTexture();
  const hazardMat = new THREE.MeshStandardMaterial({ color: COLORS.hazard, emissive: COLORS.hazard, emissiveMap: stripes, map: stripes, emissiveIntensity: 1.8, transparent: true, opacity: 0.92 });
  const purpleMat = new THREE.MeshStandardMaterial({ color: COLORS.gravity, emissive: COLORS.gravity, emissiveIntensity: 0.9, transparent: true, opacity: 0.55 });
  const cyanMat = trimMaterial('safe');
  const redMat = trimMaterial('hazard');
  const baseMat = new THREE.MeshBasicMaterial({ color: COLORS.safe, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const padMats: Record<string, THREE.Material> = {
    S: new THREE.MeshStandardMaterial({ color: '#0d3a4a', emissive: COLORS.safe, emissiveIntensity: 0.25, transparent: true, opacity: 0.5 }),
    C: new THREE.MeshStandardMaterial({ color: '#0d4a3a', emissive: '#3dffc8', emissiveIntensity: 0.45, transparent: true, opacity: 0.55 }),
    G: new THREE.MeshStandardMaterial({ color: '#0d3a4a', emissive: '#47f0ff', emissiveIntensity: 0.6, transparent: true, opacity: 0.55 }),
  };
  disposables.push(floorMat, wallMat, hazardMat, purpleMat, cyanMat, redMat, baseMat, stripes, ...Object.values(padMats));

  addMerged(floorBoxes, floorMat, { worldUV: 0.25 });
  addMerged(wallBoxes, wallMat, { shadow: true, worldUV: 0.5 });
  addMerged(cyanTrims, cyanMat);
  addMerged(redTrims, redMat);
  addMerged(purpleTiles, purpleMat);
  addMerged(hazardTiles, hazardMat);
  addMerged(baseGlows, baseMat);
  for (const k of Object.keys(padTiles)) addMerged(padTiles[k], padMats[k]);

  return { objects, disposables, hazards, hazardMaterial: hazardMat, edgeMaterial: redMat, bounds };
}

/** Box-projected UVs in world space, so merged geometry tiles its texture seamlessly. */
function applyWorldUVs(g: THREE.BufferGeometry, scale: number): void {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u: number, v: number;
    if (ny >= nx && ny >= Math.abs(nor.getZ(i))) [u, v] = [x, z];
    else if (nx >= Math.abs(nor.getZ(i))) [u, v] = [z, y];
    else [u, v] = [x, y];
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
