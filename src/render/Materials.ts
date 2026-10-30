import * as THREE from 'three';
import type { SurfaceRole } from '../levels/LevelTypes';

export const COLORS = {
  safe: new THREE.Color('#2ee6ff'),
  moving: new THREE.Color('#ffb02e'),
  hazard: new THREE.Color('#ff3b4e'),
  gravity: new THREE.Color('#a24bff'),
  void: new THREE.Color('#05070d'),
};

/** Procedural brushed-metal + panel-line texture, generated once on a canvas (no asset download). */
function brushedMetalTexture(size = 512): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8a929e';
  g.fillRect(0, 0, size, size);
  // Brushed streaks.
  for (let i = 0; i < 2200; i++) {
    const y = Math.random() * size;
    const shade = 120 + Math.random() * 60;
    g.strokeStyle = `rgba(${shade},${shade + 6},${shade + 14},${0.05 + Math.random() * 0.08})`;
    g.lineWidth = Math.random() * 1.4;
    g.beginPath();
    const x = Math.random() * size;
    g.moveTo(x - 80, y);
    g.lineTo(x + 80 + Math.random() * 120, y + (Math.random() - 0.5) * 2);
    g.stroke();
  }
  // Panel seams on a 4x4 grid.
  g.strokeStyle = 'rgba(20,24,32,0.85)';
  g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    const p = (i / 4) * size;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
  }
  // Rivets.
  g.fillStyle = 'rgba(30,34,42,0.9)';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    for (const [ox, oy] of [[10, 10], [size / 4 - 10, 10], [10, size / 4 - 10], [size / 4 - 10, size / 4 - 10]]) {
      g.beginPath();
      g.arc((i * size) / 4 + ox, (j * size) / 4 + oy, 2.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;

  // Roughness: seams rough, streaks vary slightly.
  const rc = document.createElement('canvas');
  rc.width = rc.height = size;
  const rg = rc.getContext('2d')!;
  rg.drawImage(c, 0, 0);
  const img = rg.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 255 - img.data[i] * 0.9; // darker colour → rougher
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v + 40);
  }
  rg.putImageData(img, 0, 0);
  const rough = new THREE.CanvasTexture(rc);

  for (const t of [map, rough]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  return { map, rough };
}

let shared: ReturnType<typeof brushedMetalTexture> | null = null;

/** Platform surface material. Textures are shared; each platform gets its own repeat. */
export function platformMaterial(repeatX: number, repeatY: number, role: SurfaceRole): THREE.MeshStandardMaterial {
  shared ??= brushedMetalTexture();
  const map = shared.map.clone();
  const rough = shared.rough.clone();
  map.repeat.set(repeatX, repeatY);
  rough.repeat.set(repeatX, repeatY);
  map.needsUpdate = rough.needsUpdate = true;
  const tint = role === 'gravity' ? new THREE.Color('#b6a8d6') : new THREE.Color('#c4ccd8');
  return new THREE.MeshStandardMaterial({
    color: tint,
    map,
    roughnessMap: rough,
    metalness: 0.85,
    roughness: 0.55,
    envMapIntensity: 0.9,
  });
}

export const undersideMaterial = new THREE.MeshStandardMaterial({ color: '#1a1f29', metalness: 0.9, roughness: 0.5 });

export function trimMaterial(role: SurfaceRole): THREE.MeshStandardMaterial {
  const c = COLORS[role];
  return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.2, metalness: 0.2, roughness: 0.4 });
}

/** Maze floor: dark brushed metal panels, tiled in world space (see MazeBuilder). */
export function mazeFloorMaterial(): THREE.MeshStandardMaterial {
  shared ??= brushedMetalTexture();
  const map = shared.map.clone();
  const rough = shared.rough.clone();
  map.needsUpdate = rough.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ color: '#8d97a8', map, roughnessMap: rough, metalness: 0.8, roughness: 0.6, envMapIntensity: 0.8 });
}

/** Maze walls: brighter polished metal so the corridors read clearly against the floor. */
export function mazeWallMaterial(): THREE.MeshStandardMaterial {
  shared ??= brushedMetalTexture();
  const map = shared.map.clone();
  map.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ color: '#dfe6f2', map, metalness: 0.9, roughness: 0.32, envMapIntensity: 1.2 });
}
