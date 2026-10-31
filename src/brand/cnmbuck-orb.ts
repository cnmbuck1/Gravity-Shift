// The Cnmbuck Orb: Cnmbuck Studios' signature ball, the same in every Cnmbuck game.
//
// One self-contained file: copy it into a game as is (it only needs three.js). It gives
//   - createOrbMaterial(): the ball itself, deep blue glass circled by a glowing neon band;
//   - OrbFx: the extras that go with it, a blue-and-orange rim glow that stays put while the ball rolls,
//     a neon halo, an optional glow on the ground beneath it and a light trail behind it;
//   - drawOrbIcon(): the Orb drawn flat on a 2D canvas, for menus, icons and 2D games.
// See README.md beside this file for the colours and the rules for using it.
//
// Source of truth: cnmbuck1/poolgolf brand/cnmbuck-orb/. Change it there, then copy it to the games.
import * as THREE from 'three';

/** The Orb's colours. Use these, not near matches, anywhere the Orb or its glow appears. */
export const ORB = {
  glassDeep: 0x020818, // the glass at its darkest (bottom)
  glass: 0x0c3486, // the glass lit from above
  bandOuter: 0x0a8cff, // the band's soft outer glow
  band: 0x00e5ff, // the neon band
  bandCore: 0xf0feff, // the band's white-hot core
  rimBlue: 0x00d8ff, // rim light, left side
  rimOrange: 0xff9a1a, // rim light, right side
} as const;

type RGB = [number, number, number];
const hex = (c: number): RGB => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
/** Soft-edged line: 1 on the line, fading to 0 at `w` away. */
const line = (d: number, w: number) => clamp01(1 - Math.abs(d) / w);
const wob = (x: number, y: number, z: number, f: number) => Math.sin(x * f + 1.3) * Math.sin(y * f * 1.1 + 2.1) + Math.sin(z * f * 0.9 + y * 2 + 0.7) * 0.6;

/** The neon band: distance from a tilted ring with a gentle ripple. It runs over the top of the ball. */
function band(x: number, y: number, z: number) {
  const a = Math.atan2(y, z);
  return 0.42 * y + 0.88 * x - 0.12 * Math.sin(3 * a);
}

/** Paint a sphere map (THREE.SphereGeometry's UV layout) pixel by pixel from the surface direction. */
function sphereMap(fn: (x: number, y: number, z: number) => RGB, w = 512, h = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let py = 0; py < h; py++) {
    const th = ((py + 0.5) / h) * Math.PI;
    for (let px = 0; px < w; px++) {
      const ph = ((px + 0.5) / w) * Math.PI * 2;
      const [r, gg, b] = fn(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th));
      const k = (py * w + px) * 4;
      img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let material: THREE.MeshPhysicalMaterial | null = null;
/** The Orb's material (built once and shared). Put it on a THREE.SphereGeometry. */
export function createOrbMaterial() {
  if (material) return material;
  const map = sphereMap((x, y, z) => {
    const s = band(x, y, z);
    let c = mix(hex(ORB.glassDeep), hex(ORB.glass), clamp01(0.45 + 0.55 * y + 0.12 * wob(x, y, z, 3)));
    c = mix(c, hex(ORB.bandOuter), line(s, 0.34) * 0.7);
    c = mix(c, hex(ORB.band), line(s, 0.16));
    return mix(c, hex(ORB.bandCore), line(s, 0.06));
  });
  const glow = sphereMap((x, y, z) => {
    const s = band(x, y, z);
    let c = mix(hex(0x000208), hex(0x020c2e), clamp01(0.5 + 0.5 * y));
    c = mix(c, hex(ORB.bandOuter), line(s, 0.36));
    c = mix(c, hex(ORB.band), line(s, 0.18));
    return mix(c, [255, 255, 255], line(s, 0.06));
  });
  material = new THREE.MeshPhysicalMaterial({
    map, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08,
    emissiveMap: glow, emissive: new THREE.Color(0xffffff), emissiveIntensity: 2.6,
  });
  return material;
}

/** A soft round dot, for the trail, halo and ground glow. */
function dotTexture(inner: string, outer: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(0.45, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface OrbFxOptions {
  /** Draw a glow on the ground beneath the ball (needs a ground height in update). Default true. */
  groundGlow?: boolean;
  /** Trail points kept and how long each lasts, in seconds. */
  trailLength?: number;
  trailLife?: number;
}

/**
 * The Orb's extras. Add `group` to the scene once, set `on` while the Orb is the ball in play, and call
 * update every frame with the ball's centre.
 */
export class OrbFx {
  readonly group = new THREE.Group();
  private rim: THREE.Mesh;
  private halo: THREE.Sprite;
  private ground: THREE.Mesh | null = null;
  private trail: THREE.Points;
  private points: { p: THREE.Vector3; age: number }[] = [];
  private t = 0;
  private readonly trailLength: number;
  private readonly trailLife: number;
  private readonly blue = new THREE.Color(ORB.rimBlue);
  private readonly orange = new THREE.Color(ORB.rimOrange);

  constructor(private readonly radius: number, opts: OrbFxOptions = {}) {
    this.trailLength = opts.trailLength ?? 26;
    this.trailLife = opts.trailLife ?? 0.45;
    this.group.visible = false;
    // Rim glow: brightest at the ball's edge, blue on the screen-left side and orange on the right
    this.rim = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.08, 32, 20), new THREE.ShaderMaterial({
      uniforms: { blue: { value: this.blue }, orange: { value: this.orange }, pulse: { value: 1 } },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 blue; uniform vec3 orange; uniform float pulse; varying vec3 vN; varying vec3 vV;
        void main() {
          float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.4);
          float warm = smoothstep(-0.2, 0.6, vN.x);
          gl_FragColor = vec4(mix(blue, orange, warm) * f * (2.4 + warm * 1.0) * pulse, f);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.rim.renderOrder = 3;
    // Neon halo round the ball (the ball itself hides the middle of it)
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture('rgba(0, 220, 255, 0.9)', 'rgba(0, 150, 255, 0.35)'), transparent: true, depthWrite: false, toneMapped: false }));
    this.halo.scale.setScalar(radius * 4.2);
    this.halo.renderOrder = 2;
    this.group.add(this.halo, this.rim);
    if (opts.groundGlow ?? true) {
      this.ground = new THREE.Mesh(new THREE.PlaneGeometry(radius * 6, radius * 6), new THREE.MeshBasicMaterial({
        map: dotTexture('rgba(60, 190, 255, 0.85)', 'rgba(40, 120, 255, 0.4)'), transparent: true, depthWrite: false, toneMapped: false,
      }));
      this.ground.rotation.x = -Math.PI / 2;
      this.group.add(this.ground);
    }
    // Light trail: soft dots that shrink and fade, drawn as colour over the scene (not added light) so it
    // shows on pale ground as well as dark
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.trailLength * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.trailLength * 3), 3));
    geo.setAttribute('life', new THREE.BufferAttribute(new Float32Array(this.trailLength), 1));
    geo.setDrawRange(0, 0);
    this.trail = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { size: { value: radius * 2.1 }, scale: { value: 1 } },
      vertexShader: `attribute float life; attribute vec3 color; uniform float size; uniform float scale; varying vec3 vC; varying float vL;
        void main() { vC = color; vL = life; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * (0.35 + 0.65 * life) * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vL;
        void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.3, d) * min(1.0, vL * 1.3) * 0.9; if (a < 0.01) discard;
          gl_FragColor = vec4(mix(vC, vec3(0.85, 0.97, 1.0), smoothstep(0.35, 0.0, d) * vL * 0.35), a); }`,
      transparent: true, depthWrite: false,
    }));
    this.trail.frustumCulled = false;
    this.group.add(this.trail);
  }

  set on(v: boolean) { this.group.visible = v; if (!v) this.points = []; }
  get on() { return this.group.visible; }

  /**
   * Follow the ball. `groundY` is the ground height under it (null hides the ground glow, e.g. in the air or
   * when "down" isn't -Y). Pass the camera and renderer so the trail is sized for the screen.
   */
  update(pos: THREE.Vector3, groundY: number | null, moving: boolean, visible: boolean, dt: number, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
    if (!this.group.visible) return;
    this.t += dt;
    const pulse = 0.85 + 0.15 * Math.sin(this.t * 3);
    (this.rim.material as THREE.ShaderMaterial).uniforms.pulse.value = pulse;
    (this.trail.material as THREE.ShaderMaterial).uniforms.scale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.rim.visible = this.halo.visible = visible;
    this.rim.position.copy(pos);
    this.halo.position.copy(pos);
    this.halo.material.opacity = 0.5 * pulse;
    if (this.ground) {
      this.ground.visible = visible && groundY != null;
      if (groundY != null) {
        this.ground.position.set(pos.x, groundY + this.radius * 0.07, pos.z);
        const lift = Math.max(0, pos.y - groundY - this.radius);
        (this.ground.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - lift / (this.radius * 5)) * pulse;
      }
    }
    // Trail: drop a point every so often while rolling; points fade out and the oldest go
    for (const p of this.points) p.age += dt;
    this.points = this.points.filter((p) => p.age < this.trailLife);
    const last = this.points[this.points.length - 1];
    if (moving && visible && (!last || last.p.distanceTo(pos) > this.radius * 0.35)) {
      this.points.push({ p: pos.clone(), age: 0 });
      if (this.points.length > this.trailLength) this.points.shift();
    }
    const geo = this.trail.geometry;
    const P = geo.getAttribute('position') as THREE.BufferAttribute, Cl = geo.getAttribute('color') as THREE.BufferAttribute, Lf = geo.getAttribute('life') as THREE.BufferAttribute;
    const c = new THREE.Color();
    this.points.forEach((pt, i) => {
      const k = 1 - pt.age / this.trailLife; // 1 fresh, 0 gone
      c.copy(this.orange).lerp(this.blue, k);
      P.setXYZ(i, pt.p.x, pt.p.y, pt.p.z);
      Cl.setXYZ(i, c.r, c.g, c.b);
      Lf.setX(i, k);
    });
    P.needsUpdate = true; Cl.needsUpdate = true; Lf.needsUpdate = true;
    geo.setDrawRange(0, this.points.length);
  }
}

/**
 * The Orb drawn flat: halo, blue-to-orange rim, glass, the neon band and a highlight, filling a `size`
 * square at (x, y). `spin` turns the band (radians), for a rolling ball in a 2D game.
 */
export function drawOrbIcon(g: CanvasRenderingContext2D, size: number, x = 0, y = 0, spin = 0, halo = true) {
  const cx = x + size / 2, cy = y + size / 2, r = size * 0.38;
  g.save();
  if (halo) {
    const h = g.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.32);
    h.addColorStop(0, 'rgba(0, 200, 255, 0.55)'); h.addColorStop(1, 'rgba(0, 200, 255, 0)');
    g.fillStyle = h; g.fillRect(x, y, size, size);
  }
  const ring = g.createLinearGradient(cx - r, 0, cx + r, 0);
  ring.addColorStop(0, '#00d8ff'); ring.addColorStop(0.5, '#3a7aff'); ring.addColorStop(1, '#ff9a1a');
  g.shadowColor = '#00d8ff'; g.shadowBlur = halo ? size * 0.1 : 0;
  g.fillStyle = ring; g.beginPath(); g.arc(cx, cy, r + size * 0.03, 0, Math.PI * 2); g.fill();
  g.shadowBlur = 0;
  const body = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  body.addColorStop(0, '#2a62e8'); body.addColorStop(0.55, '#0a2470'); body.addColorStop(1, '#020a1e');
  g.fillStyle = body; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
  const warm = g.createRadialGradient(cx + r * 0.95, cy + r * 0.1, 0, cx + r * 0.95, cy + r * 0.1, r * 0.8);
  warm.addColorStop(0, 'rgba(255, 150, 30, 0.8)'); warm.addColorStop(1, 'rgba(255, 150, 30, 0)');
  g.fillStyle = warm; g.fillRect(x, y, size, size);
  // The neon band: the front of a tilted ring round the ball, with a gentle ripple
  const bandPath = () => {
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const t = Math.PI * (i / 40);
      const bx = -Math.cos(t), by = Math.sin(t) * (0.26 + 0.05 * Math.sin(t * 3));
      const rot = -0.42 + spin, px = bx * Math.cos(rot) - by * Math.sin(rot), py = bx * Math.sin(rot) + by * Math.cos(rot);
      if (i === 0) g.moveTo(cx + px * r * 1.12, cy + py * r * 1.12); else g.lineTo(cx + px * r * 1.12, cy + py * r * 1.12);
    }
  };
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = '#00e5ff'; g.shadowBlur = size * 0.12;
  g.strokeStyle = 'rgba(0, 170, 255, 0.9)'; g.lineWidth = r * 0.34; bandPath(); g.stroke();
  g.strokeStyle = '#00e5ff'; g.lineWidth = r * 0.18; bandPath(); g.stroke();
  g.shadowBlur = 0;
  g.strokeStyle = '#ffffff'; g.lineWidth = r * 0.07; bandPath(); g.stroke();
  const hi = g.createRadialGradient(cx - r * 0.4, cy - r * 0.5, 0, cx - r * 0.4, cy - r * 0.5, r * 0.28);
  hi.addColorStop(0, 'rgba(255,255,255,0.95)'); hi.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hi; g.fillRect(x, y, size, size);
  g.restore();
}
