// App icon concepts for Gravitor. Each draws a full-bleed square (iOS applies its own rounded mask).
// The Cnmbuck Orb (brand kit) is the hero of every concept.
import { drawOrbIcon } from '../../src/brand/cnmbuck-orb';

type Draw = (g: CanvasRenderingContext2D, s: number) => void;

const NAVY_TOP = '#0a1430';
const NAVY_BOTTOM = '#05070d';
const CYAN = '#00d8ff';
const ORANGE = '#ff9a1a';
const PURPLE = '#a050ff';

function sky(g: CanvasRenderingContext2D, s: number, top = NAVY_TOP, bottom = NAVY_BOTTOM) {
  const grad = g.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, top); grad.addColorStop(1, bottom);
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
}

function glowLine(g: CanvasRenderingContext2D, color: string, width: number, blur: number, path: () => void) {
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = color; g.shadowBlur = blur;
  g.strokeStyle = color; g.lineWidth = width; path(); g.stroke();
  g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = width * 0.35; path(); g.stroke();
  g.restore();
}

function orb(g: CanvasRenderingContext2D, s: number, size: number, cx: number, cy: number) {
  drawOrbIcon(g, size * s, cx * s - (size * s) / 2, cy * s - (size * s) / 2);
}

/** A: the Orb hovering over the neon grid floor (current icon). */
const grid: Draw = (g, s) => {
  sky(g, s);
  const horizon = s * 0.62;
  g.save();
  g.beginPath(); g.rect(0, horizon, s, s - horizon); g.clip();
  const fade = g.createLinearGradient(0, horizon, 0, s);
  fade.addColorStop(0, 'rgba(0,216,255,0)'); fade.addColorStop(1, 'rgba(0,216,255,0.55)');
  g.strokeStyle = fade; g.lineWidth = Math.max(2, s / 400);
  for (let i = -12; i <= 12; i++) { g.beginPath(); g.moveTo(s / 2 + i * s * 0.02, horizon); g.lineTo(s / 2 + i * s * 0.28, s); g.stroke(); }
  for (let k = 1; k < 12; k++) { const y = horizon + (s - horizon) * Math.pow(k / 11, 2.2); g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
  g.restore();
  const pool = g.createRadialGradient(s / 2, s * 0.8, 0, s / 2, s * 0.8, s * 0.42);
  pool.addColorStop(0, 'rgba(0,200,255,0.35)'); pool.addColorStop(1, 'rgba(0,200,255,0)');
  g.fillStyle = pool; g.fillRect(0, 0, s, s);
  orb(g, s, 0.8, 0.5, 0.47);
};

/** B: top-down neon labyrinth, the Orb rolling through it toward an orange goal. */
const maze: Draw = (g, s) => {
  sky(g, s, '#071026', '#04060c');
  const u = s / 10; // grid of 10 cells; the outer wall sits inside the iOS corner mask
  const walls: [number, number, number, number][] = [
    [1, 1, 9, 1], [9, 1, 9, 9], [9, 9, 1, 9], [1, 9, 1, 1],
    [1, 3.4, 3, 3.4], [6, 1, 6, 3.4], [6, 3.4, 9, 3.4],
    [3, 6.6, 3, 9], [1, 6.6, 3, 6.6], [7, 6.6, 7, 9], [7, 6.6, 9, 6.6],
  ];
  const path = () => { g.beginPath(); for (const [a, b, c, d] of walls) { g.moveTo(a * u, b * u); g.lineTo(c * u, d * u); } };
  glowLine(g, CYAN, s * 0.032, s * 0.045, path);
  g.save();
  g.shadowColor = ORANGE; g.shadowBlur = s * 0.05; g.strokeStyle = ORANGE; g.lineWidth = s * 0.024;
  g.beginPath(); g.arc(8 * u, 7.9 * u, u * 0.55, 0, Math.PI * 2); g.stroke();
  g.restore();
  orb(g, s, 0.5, 0.5, 0.5);
};

/** C: gravity shift. The Orb in a room corner: floor, a cyan wall and a purple shift wall, with a 90° turn arrow. */
const shift: Draw = (g, s) => {
  sky(g, s, '#0b0f2a', '#05070d');
  const P = (x: number, y: number): [number, number] => [x * s, y * s];
  const corner = P(0.5, 0.56), left = P(0.0, 0.3), right = P(1.0, 0.3), bottomL = P(0.0, 1.0), bottomR = P(1.0, 1.0), top = P(0.5, -0.1);
  const face = (pts: [number, number][], fill: CanvasGradient | string, edge: string) => {
    g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.closePath();
    g.fillStyle = fill; g.fill();
    g.save(); g.shadowColor = edge; g.shadowBlur = s * 0.03; g.strokeStyle = edge; g.lineWidth = s * 0.012; g.stroke(); g.restore();
  };
  const lw = g.createLinearGradient(0, 0, s * 0.5, 0); lw.addColorStop(0, 'rgba(0,120,255,0.25)'); lw.addColorStop(1, 'rgba(0,200,255,0.08)');
  const rw = g.createLinearGradient(s, 0, s * 0.5, 0); rw.addColorStop(0, 'rgba(160,80,255,0.45)'); rw.addColorStop(1, 'rgba(160,80,255,0.12)');
  const fl = g.createLinearGradient(0, s * 0.56, 0, s); fl.addColorStop(0, 'rgba(0,216,255,0.12)'); fl.addColorStop(1, 'rgba(0,216,255,0.3)');
  face([top, corner, left, P(0, -0.1)], lw, 'rgba(0,216,255,0.7)');
  face([top, corner, right, P(1, -0.1)], rw, PURPLE);
  face([corner, right, bottomR, bottomL, left], fl, 'rgba(0,216,255,0.7)');
  // Curved arrow from the floor up onto the purple wall: the 90° gravity shift.
  g.save();
  g.shadowColor = PURPLE; g.shadowBlur = s * 0.035; g.strokeStyle = '#e2c8ff'; g.lineWidth = s * 0.035; g.lineCap = 'round';
  const cx = s * 0.5, cy = s * 0.6, r = s * 0.39, a0 = Math.PI * 0.32, a1 = -Math.PI * 0.12;
  g.beginPath(); g.arc(cx, cy, r, a0, a1, true); g.stroke();
  const ex = cx + Math.cos(a1) * r, ey = cy + Math.sin(a1) * r, t = a1 - Math.PI / 2; // tangent (counter-clockwise)
  const hx = Math.cos(t), hy = Math.sin(t), nx = -hy, ny = hx, L = s * 0.075;
  g.fillStyle = '#e2c8ff'; g.beginPath();
  g.moveTo(ex + hx * L, ey + hy * L); g.lineTo(ex + nx * L * 0.75, ey + ny * L * 0.75); g.lineTo(ex - nx * L * 0.75, ey - ny * L * 0.75); g.closePath(); g.fill();
  g.restore();
  orb(g, s, 0.56, 0.47, 0.62);
};

/** D: tilt. The Orb rolling down a tilted floating platform with a light trail. */
const tilt: Draw = (g, s) => {
  sky(g, s, '#0a1838', '#04060c');
  const glow = g.createRadialGradient(s * 0.5, s * 0.55, 0, s * 0.5, s * 0.55, s * 0.6);
  glow.addColorStop(0, 'rgba(20,60,160,0.45)'); glow.addColorStop(1, 'rgba(20,60,160,0)');
  g.fillStyle = glow; g.fillRect(0, 0, s, s);
  g.save();
  g.translate(s * 0.5, s * 0.64); g.rotate(0.26);
  const w = s * 0.92, h = s * 0.1;
  const top = g.createLinearGradient(0, -h, 0, h); top.addColorStop(0, '#1b3d8c'); top.addColorStop(1, '#0a1a44');
  g.fillStyle = top; g.fillRect(-w / 2, -h / 2, w, h);
  g.shadowColor = CYAN; g.shadowBlur = s * 0.04; g.fillStyle = CYAN; g.fillRect(-w / 2, -h / 2 - s * 0.006, w, s * 0.014);
  g.shadowColor = ORANGE; g.fillStyle = ORANGE; g.fillRect(-w / 2, h / 2 - s * 0.008, w, s * 0.01);
  // Light trail along the top edge, behind the Orb as it rolls downhill to the right.
  g.shadowBlur = 0;
  const trail = g.createLinearGradient(-w / 2, 0, s * 0.06, 0);
  trail.addColorStop(0, 'rgba(0,216,255,0)'); trail.addColorStop(1, 'rgba(0,216,255,0.6)');
  g.fillStyle = trail; g.shadowColor = CYAN; g.shadowBlur = s * 0.03;
  g.beginPath(); g.moveTo(-w / 2, -h / 2 - s * 0.03); g.quadraticCurveTo(-s * 0.1, -h / 2 - s * 0.25, s * 0.06, -h / 2 - s * 0.26);
  g.lineTo(s * 0.06, -h / 2 - s * 0.02); g.closePath(); g.fill();
  g.restore();
  orb(g, s, 0.6, 0.6, 0.38);
};

export const ICONS = { grid, maze, shift, tilt } as const;
export type IconName = keyof typeof ICONS;
export const ICON_LABELS: Record<IconName, string> = {
  grid: 'A  Orb over the grid (first TestFlight build)',
  maze: 'B  Neon maze (chosen 2026-11-16)',
  shift: 'C  Gravity shift',
  tilt: 'D  Tilt and roll',
};
