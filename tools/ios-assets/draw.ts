// Draws the iOS app icon and launch image from the Cnmbuck Orb brand kit.
// Run `node tools/ios-assets/render.mjs` to regenerate the PNGs in the Xcode asset catalog.
import { drawOrbIcon } from '../../src/brand/cnmbuck-orb';
import { ICONS, type IconName } from './icons';

const BG_TOP = '#0a1430';
const BG_BOTTOM = '#05070d';

/** The icon concept used for the app (see icons.ts; render.mjs --icon overrides it). */
const params = new URLSearchParams(location.search);
const chosen = (params.get('icon') ?? 'maze') as IconName;

function icon(size: number, name: IconName = chosen) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d', { alpha: false })!;
  ICONS[name](g, size);
  return c;
}

function splash(size: number) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d', { alpha: false })!;
  // Plain dark field so the edges cropped away on a phone match the launch background colour.
  g.fillStyle = BG_BOTTOM; g.fillRect(0, 0, size, size);
  const glow = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.3);
  glow.addColorStop(0, 'rgba(10,30,80,0.9)'); glow.addColorStop(1, 'rgba(5,7,13,0)');
  g.fillStyle = glow; g.fillRect(0, 0, size, size);
  // Wordmark GRAVIT(O)R with the Orb as the O, kept inside the centre ~1100 px a portrait phone shows.
  const fs = size * 0.05;
  g.font = `800 ${fs}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
  g.textBaseline = 'middle';
  const spacing = fs * 0.12;
  const measure = (s: string) => [...s].reduce((w, ch) => w + g.measureText(ch).width + spacing, 0);
  const orbBox = fs * 1.5; // drawOrbIcon fills ~0.76 of its box with the ball and glow
  const orbW = orbBox * 0.8;
  const total = measure('GRAVIT') + orbW + measure('R') - spacing;
  let x = size / 2 - total / 2; const y = size / 2;
  const text = (s: string) => {
    for (const ch of s) {
      g.shadowColor = '#0a8cff'; g.shadowBlur = fs * 0.35;
      g.fillStyle = '#eaf6ff'; g.fillText(ch, x, y);
      g.shadowBlur = 0;
      x += g.measureText(ch).width + spacing;
    }
  };
  text('GRAVIT');
  drawOrbIcon(g, orbBox, x + orbW / 2 - orbBox / 2, y - orbBox / 2);
  x += orbW + spacing;
  text('R');
  return c;
}

/** Opaque RGB pixels (App Store icons must not have an alpha channel), base64 encoded. */
function rgb(c: HTMLCanvasElement) {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  const out = new Uint8Array((d.length / 4) * 3);
  for (let i = 0, j = 0; i < d.length; i += 4) { out[j++] = d[i]; out[j++] = d[i + 1]; out[j++] = d[i + 2]; }
  let s = '';
  for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000));
  return { size: c.width, data: btoa(s) };
}

const preview = params.has('preview');
(window as unknown as { assets: unknown }).assets = preview
  ? { previews: Object.fromEntries((Object.keys(ICONS) as IconName[]).map((n) => [n, rgb(icon(1024, n))])) }
  : { icon: rgb(icon(1024)), splash: rgb(splash(2732)) };
