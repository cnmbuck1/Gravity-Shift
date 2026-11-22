// Draws the 512x512 achievement badges App Store Connect needs (one per achievement) into
// tools/gamecenter/badges/, from catalog.json. Run: node tools/gamecenter/render-badges.mjs
import { createRequire } from 'module';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Playwright comes preinstalled globally on the dev machines, as for tools/levelgen/autopilot.cjs.
const { chromium } = createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const { achievements } = JSON.parse(readFileSync(join(here, 'catalog.json'), 'utf8'));
// World accents, in world order (src/levels/worldTypes.ts THEMES).
const WORLD = ['#2ee6ff', '#ffc24a', '#b46bff', '#ff7a3d', '#3a8bff', '#9fe8ff', '#ff4fa0', '#5fffd8', '#ff9a1a', '#d27bff',
  '#7a8cff', '#3dffa0', '#ffd84a', '#9fd8ff', '#ffffff', '#ff5a5a', '#f0b93a', '#4dffd2', '#8f9dff', '#ff7af0'];
const STYLE = {
  first_clear: ['#2ee6ff', '▲'], clean_1: ['#5fffd8', '◎'], clean_25: ['#5fffd8', '◎', '25'], clean_100: ['#5fffd8', '◎', '100'],
  first_try_10: ['#ff7af0', '1ST', '×10'], streak_5: ['#ff7a3d', '»', '5'], stars3_1: ['#ffb02e', '★★★'], stars_150: ['#ffb02e', '★', '150'],
  stars_300: ['#ffb02e', '★', '300'], stars_all: ['#ffd84a', '✦', 'ALL'], perfect_world: ['#ffd84a', '★', 'WORLD'],
  levels_100: ['#3a8bff', '100'], levels_all: ['#d27bff', '∞'], dark_clean: ['#8f9dff', '◐', '15'], shifts_250: ['#a24bff', '⟲', '250'],
  pb_25: ['#3dffa0', '◷', '25'], comeback: ['#ff5a5a', '↺'], weekly_1: ['#b46bff', 'W'], weekly_4: ['#b46bff', 'W', '×4'],
};
const out = join(here, 'badges');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
await page.setContent('<canvas id="c" width="512" height="512"></canvas>');
for (const a of achievements) {
  const key = a.id.split('.').pop();
  const m = key.match(/^world_(\d+)$/);
  const [color, glyph, sub] = m ? [WORLD[Number(m[1]) - 1], m[1].replace(/^0/, ''), 'WORLD'] : STYLE[key] ?? ['#2ee6ff', '★'];
  const png = await page.evaluate(({ color, glyph, sub }) => {
    const c = document.getElementById('c');
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 512);
    const bg = g.createRadialGradient(256, 220, 20, 256, 256, 300);
    bg.addColorStop(0, '#16203a'); bg.addColorStop(1, '#03050b');
    g.fillStyle = bg; g.fillRect(0, 0, 512, 512);
    // Starfield
    let s = glyph.length * 977 + color.charCodeAt(1) * 31;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.5})`; g.fillRect(r() * 512, r() * 512, 1.6, 1.6); }
    // Neon ring
    g.shadowColor = color; g.shadowBlur = 40; g.strokeStyle = color; g.lineWidth = 16;
    g.beginPath(); g.arc(256, 256, 190, 0, Math.PI * 2); g.stroke();
    g.shadowBlur = 16; g.lineWidth = 4; g.globalAlpha = 0.6;
    g.beginPath(); g.arc(256, 256, 160, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
    // Glyph
    g.fillStyle = '#ffffff'; g.shadowColor = color; g.shadowBlur = 30; g.textAlign = 'center'; g.textBaseline = 'middle';
    const size = glyph.length > 2 ? 110 : 170;
    g.font = `900 ${size}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
    g.fillText(glyph, 256, sub ? 236 : 262);
    if (sub) { g.font = '800 54px -apple-system, "Helvetica Neue", Arial, sans-serif'; g.fillStyle = color; g.fillText(sub, 256, 350); }
    return c.toDataURL('image/png');
  }, { color, glyph, sub });
  writeFileSync(join(out, `${key}.png`), Buffer.from(png.split(',')[1], 'base64'));
}
await browser.close();
console.log(`${achievements.length} badges in ${out}`);
