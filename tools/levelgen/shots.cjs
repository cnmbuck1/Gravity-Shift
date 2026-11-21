// Screenshots of a level at chosen route points (for reviews and the App Store).
// Usage: node shots.cjs <level-id> <out-dir> [step indexes...]   (needs `npx vite preview --port 4173`)
// Without step indexes it shoots just before each special step (gates, fans, pulses, drops, lasers).
const { chromium } = require('playwright');
const routes = require('./routes.json');
const [ID, OUT, ...picks] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await page.goto('http://localhost:4173/');
  await page.waitForFunction(() => window.gravityShift);
  await page.evaluate(() => localStorage.setItem('gravity-shift:settings', JSON.stringify({ preview: false, graphics: 'high', controlMode: 'touch' })));
  await page.reload();
  await page.waitForFunction(() => window.gravityShift);
  const index = await page.evaluate((id) => window.gravitorWorlds.flatMap((w) => w.levels).findIndex((l) => l.id === id), ID);
  await page.evaluate((i) => window.gravitorUI.startLevel(i), index);
  await page.waitForTimeout(2500);
  const steps = routes[ID];
  let idx = picks.map(Number);
  if (!idx.length) {
    idx = steps.map((s, i) => (s.warp !== undefined || s.cycle || s.drop !== undefined || s.laser !== undefined ? i - 1 : -1)).filter((i) => i >= 0);
    idx = [0, ...idx.filter((v, k, a) => a.indexOf(v) === k)].slice(0, 6);
  }
  for (const i of idx) {
    let s = steps[i];
    let k = i;
    while (s && !s.p && !s.near) s = steps[--k];
    const p = s.p ?? s.near;
    await page.evaluate((p) => {
      const g = window.gravityShift;
      const T = g.ball.position.clone().set(p[0], p[1] + 0.1, p[2]);
      g.ball.teleport(T);
      g.camera.snap(g.frame, T);
    }, p);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}/${ID}-${i}.png` });
  }
  await browser.close();
})();
