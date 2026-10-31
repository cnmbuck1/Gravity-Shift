import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { GraphicsQuality } from '../settings/SettingsManager';
import { COLORS } from './Materials';
import type { WorldTheme } from '../levels/LevelTypes';

const DUST_COUNT = 700;
const DUST_RANGE = 40;

/**
 * Renderer, scene, lighting and ambient effects. Knows nothing about gameplay.
 * The "gravity dust" drifts along the current gravity direction, giving a constant,
 * peripheral cue for which way is down.
 */
export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** Spot light that follows the ball from "above" in the current frame, giving a contact shadow on any surface. */
  readonly ballLight: THREE.SpotLight;

  private dust: THREE.Points;
  private hemi = new THREE.HemisphereLight('#6fa8ff', '#1a0f2e', 0.5);
  private dustVel = new THREE.Vector3(0, -1, 0);
  private dustCentre = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, quality: GraphicsQuality) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.setQuality(quality);

    this.scene.background = COLORS.void.clone();
    this.scene.fog = new THREE.FogExp2(COLORS.void.getHex(), 0.022);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);

    this.scene.add(this.hemi);
    const key = new THREE.DirectionalLight('#dfe8ff', 1.1);
    key.position.set(-6, 14, 8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#7a4bff', 0.6);
    rim.position.set(8, -6, -10);
    this.scene.add(rim);

    this.ballLight = new THREE.SpotLight('#cfe9ff', 60, 18, Math.PI / 5, 0.6, 1.6);
    this.ballLight.castShadow = true;
    this.ballLight.shadow.mapSize.set(512, 512);
    this.ballLight.shadow.camera.near = 0.5;
    this.ballLight.shadow.camera.far = 18;
    this.ballLight.shadow.bias = -0.0008;
    this.scene.add(this.ballLight, this.ballLight.target);

    this.dust = this.createDust();
    this.scene.add(this.dust);
    this.scene.add(this.createStars());

    this.resize();
    window.addEventListener('resize', () => this.resize());
    // iOS changes the visible area without a window resize when the browser bars move.
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  setQuality(q: GraphicsQuality): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 2 : 1.25));
  }

  /** World colours: the void, fog and sky light take the world's tint (default: deep space). */
  setTheme(theme?: WorldTheme): void {
    const sky = new THREE.Color(theme?.sky ?? COLORS.void);
    (this.scene.background as THREE.Color).copy(sky);
    (this.scene.fog as THREE.FogExp2).color.copy(sky);
    this.hemi.color.set(theme ? new THREE.Color(theme.accent).lerp(new THREE.Color('#6fa8ff'), 0.5) : '#6fa8ff');
  }

  setGravityDirection(down: THREE.Vector3): void {
    this.dustVel.copy(down).multiplyScalar(1.6);
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.dustCentre.copy(focus);
    const pos = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    const half = DUST_RANGE / 2;
    for (let i = 0; i < a.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        let v = a[i + k] + this.dustVel.getComponent(k) * dt;
        const c = this.dustCentre.getComponent(k);
        // Wrap particles around the focus point so the field is infinite.
        if (v > c + half) v -= DUST_RANGE;
        else if (v < c - half) v += DUST_RANGE;
        a[i + k] = v;
      }
    }
    pos.needsUpdate = true;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait screens are narrow: widen vertical FOV slightly so the course stays visible.
    this.camera.fov = w / h < 0.75 ? 62 : 52;
    this.camera.updateProjectionMatrix();
  }

  private createDust(): THREE.Points {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < p.length; i++) p[i] = (Math.random() - 0.5) * DUST_RANGE;
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({
      color: COLORS.gravity.clone().lerp(new THREE.Color('#ffffff'), 0.35),
      size: 0.06,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    return pts;
  }

  private createStars(): THREE.Points {
    const n = 1200;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(90 + Math.random() * 40);
      v.toArray(p, i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ color: '#8fb8ff', size: 0.35, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.7 });
    return new THREE.Points(g, m);
  }
}
