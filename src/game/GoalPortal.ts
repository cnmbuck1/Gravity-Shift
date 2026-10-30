import * as THREE from 'three';
import type { V3 } from '../levels/LevelTypes';

const PORTAL_COLOR = new THREE.Color('#47f0ff');

/** Animated energy ring standing on its surface. Centre point is where the ball must reach. */
export class GoalPortal {
  readonly object = new THREE.Group();
  readonly centre: THREE.Vector3;
  private ring: THREE.Mesh;
  private inner: THREE.Mesh;
  private sparks: THREE.Points;
  private completed = 0;

  constructor(position: V3, upArr: V3, facingArr?: V3) {
    const up = new THREE.Vector3(...upArr).normalize();
    // Ring faces along whichever world axis is perpendicular to its surface normal (z preferred).
    const facing = facingArr ? new THREE.Vector3(...facingArr).normalize() : Math.abs(up.z) < 0.5 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const right = new THREE.Vector3().crossVectors(up, facing);
    this.object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, facing));
    this.object.position.fromArray(position);
    this.centre = this.object.position.clone().addScaledVector(up, 1.3);

    const ringMat = new THREE.MeshStandardMaterial({ color: PORTAL_COLOR, emissive: PORTAL_COLOR, emissiveIntensity: 3, metalness: 0.3, roughness: 0.2 });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.09, 16, 64), ringMat);
    this.ring.position.y = 1.3;
    this.object.add(this.ring);

    const innerMat = new THREE.MeshBasicMaterial({ color: PORTAL_COLOR, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.inner = new THREE.Mesh(new THREE.CircleGeometry(1.05, 48), innerMat);
    this.inner.position.y = 1.3;
    this.object.add(this.inner);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.2, 0.12, 32),
      new THREE.MeshStandardMaterial({ color: '#30384a', metalness: 0.9, roughness: 0.35, emissive: PORTAL_COLOR, emissiveIntensity: 0.25 }),
    );
    base.position.y = 0.06;
    this.object.add(base);

    const n = 80;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      p.set([Math.cos(a) * 1.1, 1.3 + Math.sin(a) * 1.1, (Math.random() - 0.5) * 0.3], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.sparks = new THREE.Points(g, new THREE.PointsMaterial({ color: PORTAL_COLOR, size: 0.08, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.object.add(this.sparks);

    const light = new THREE.PointLight(PORTAL_COLOR, 8, 7, 1.5);
    light.position.y = 1.3;
    this.object.add(light);
  }

  /** Plays a short burst when the level is completed. */
  celebrate(): void {
    this.completed = 1;
  }

  reset(): void {
    this.completed = 0;
  }

  update(dt: number, time: number): void {
    const pulse = 1 + Math.sin(time * 3) * 0.04;
    const burst = this.completed > 0 ? 1 + (1 - this.completed) * 1.5 : 1;
    if (this.completed > 0) this.completed = Math.max(0.0001, this.completed - dt * 0.9);
    this.ring.scale.setScalar(pulse * burst);
    this.inner.scale.setScalar(pulse * burst);
    (this.inner.material as THREE.MeshBasicMaterial).opacity = this.completed > 0 ? 0.5 * this.completed + 0.18 : 0.18 + Math.sin(time * 2) * 0.05;
    this.sparks.rotation.z = time * 0.8;
  }
}
