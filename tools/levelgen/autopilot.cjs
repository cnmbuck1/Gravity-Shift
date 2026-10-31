// Autopilot: plays a generated level along its route (routes.json) in headless Chromium.
// Usage: node autopilot.cjs <level-id> [shots-dir]   (needs `npx vite preview --port 4173` running)
const { chromium } = require('playwright');
const routes = require('./routes.json');
const ID = process.argv[2];
const SHOTS = process.argv[3];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 240, height: 520 } });
  await context.grantPermissions(['accelerometer', 'gyroscope', 'magnetometer']);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:4173/');
  await page.waitForFunction(() => window.gravityShift);
  await page.evaluate(() => localStorage.setItem('gravity-shift:settings', JSON.stringify({ preview: false, graphics: 'low' })));
  await page.reload();
  await page.waitForFunction(() => window.gravityShift);
  await page.evaluate(() => {
    window.__tilt = { beta: 40, gamma: 0 };
    setInterval(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: window.__tilt.beta, gamma: window.__tilt.gamma })), 16);
  });
  const index = await page.evaluate((id) => window.gravitorWorlds.flatMap((w) => w.levels).findIndex((l) => l.id === id), ID);
  if (index < 0) throw new Error('unknown level ' + ID);
  await page.evaluate((i) => window.gravitorUI.startLevel(i), index);
  await page.waitForTimeout(2200);
  const st = () => page.evaluate(() => { const g = window.gravityShift; const p = g.ball.position; return { state: g.state, pos: [p.x, p.y, p.z].map((v) => +v.toFixed(2)), down: [g.frame.down.x, g.frame.down.y, g.frame.down.z].map(Math.round), time: +g.stats.time.toFixed(1), falls: g.stats.falls }; });
  const tilt = (b, g) => page.evaluate(([b, g]) => { window.__tilt.beta = b; window.__tilt.gamma = g; }, [b, g]);
  const downKey = async () => (await st()).down.join(',');

  // Roll toward a point, steering in the current gravity frame. Returns 'ok', 'frame' (gravity changed), 'state', or 'timeout'.
  // Time limits are in game seconds, so a slow machine doesn't fail levels.
  const gameTime = () => page.evaluate(() => window.gravityShift.stats.time);
  async function go(T, cruise = 3.2, tol = 0.6, maxS = 25, live = null) {
    const t0 = await gameTime();
    const d0 = await downKey();
    let n = 0;
    while ((await gameTime()) - t0 < maxS && n++ < 4000) {
      if (live) T = await live();
      const r = await page.evaluate((T) => {
        const gm = window.gravityShift; const v = gm.ball.body.linvel(); const p = gm.ball.position; const f = gm.frame;
        const d = (a, b) => a[0] * b.x + a[1] * b.y + a[2] * b.z;
        const e = [T[0] - p.x, T[1] - p.y, T[2] - p.z]; const V = [v.x, v.y, v.z];
        return { ef: d(e, f.forward), er: d(e, f.right), vf: d(V, f.forward), vr: d(V, f.right), state: gm.state, down: [f.down.x, f.down.y, f.down.z].map(Math.round).join(',') };
      }, T);
      if (r.state !== 'playing') return 'state';
      if (r.down !== d0) return 'frame';
      const dist = Math.hypot(r.ef, r.er);
      if (dist < tol && !live) return 'ok';
      const sp = live ? Math.min(cruise, dist * 2) : Math.max(1.2, Math.min(cruise, dist * 1.5));
      const tf = Math.max(-16, Math.min(16, ((r.ef / (dist || 1)) * sp - r.vf) * 7));
      const tr = Math.max(-16, Math.min(16, ((r.er / (dist || 1)) * sp - r.vr) * 7));
      await tilt(40 - tf, tr);
      await page.waitForTimeout(40);
      if (live && live.done && (await live.done())) return 'ok';
    }
    return 'timeout';
  }
  const still = () => tilt(40, 0);

  const steps = routes[ID];
  let i = 0;
  let fallsSeen = 0;
  let status = 'route';
  const skipToAfterShift = () => { while (i < steps.length && !steps[i].shift) i++; i++; };
  while (i < steps.length) {
    const s = steps[i];
    const now = await st();
    if (now.state !== 'playing') break;
    if (now.falls > fallsSeen) {
      fallsSeen = now.falls;
      console.log('  fall near step', i, JSON.stringify(s));
      status = 'fell';
      break;
    }
    if (s.shift) {
      await still();
      if (s.auto) {
        const d = await downKey();
        for (let k = 0; k < 60 && (await downKey()) === d; k++) await page.waitForTimeout(50);
      } else {
        await page.waitForTimeout(400);
        const ok = await page.evaluate((d) => window.gravityShift.requestShift(d), s.shift);
        if (!ok) { console.log('  shift refused', s.shift, JSON.stringify(await st())); status = 'shift'; break; }
      }
      await page.waitForTimeout(1500);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${ID}-shift${i}.png` });
      i++;
      continue;
    }
    if (s.platform !== undefined) {
      const pos = () => page.evaluate((k) => { const t = window.gravityShift.levels['movers'][k].body.translation(); return [t.x, 0.5, t.z]; }, s.platform);
      await go(s.near);
      await still();
      // Wait for the platform to come to this side, ride it to the far side, then step off.
      const near = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
      for (let k = 0; k < 200 && near(await pos(), s.near) > 2.2; k++) await page.waitForTimeout(50);
      const ride = async () => pos();
      ride.done = async () => near(await pos(), s.far) < 2.3;
      const r = await go(null, 2.5, 0.3, 20, ride);
      if (r !== 'ok') { status = r; break; }
      const r2 = await go(s.far, 2.5);
      if (r2 !== 'ok') { status = r2; break; }
      i++;
      continue;
    }
    if (s.laser !== undefined) {
      await still();
      const on = () => page.evaluate((k) => window.gravityShift.features['lasers'][k].on, s.laser);
      for (let k = 0; k < 200 && !(await on()); k++) await page.waitForTimeout(30);
      for (let k = 0; k < 200 && (await on()); k++) await page.waitForTimeout(30);
      const r = await go(s.far, 4);
      if (r !== 'ok') { status = r; break; }
      i++;
      continue;
    }
    if (s.arm !== undefined) {
      await go(s.near);
      await still();
      // Go just after the bar lines up with the corridor.
      const ang = () => page.evaluate((k) => { const q = window.gravityShift.features['rotators'][k].body.rotation(); return 2 * Math.atan2(q.y, q.w); }, s.arm);
      for (let k = 0; k < 300; k++) { const a = await ang(); if (Math.abs(Math.sin(a)) < 0.2) break; await page.waitForTimeout(30); }
      const r = await go(s.far, 3.6);
      if (r !== 'ok') { status = r; break; }
      i++;
      continue;
    }
    const r = await go(s.p, s.v ?? 3.2);
    if (r === 'frame') { skipToAfterShift(); await page.waitForTimeout(1500); continue; }
    if (r === 'timeout') { console.log('  timeout at step', i, JSON.stringify(s), JSON.stringify(await st())); status = 'timeout'; break; }
    if (r === 'state') break;
    i++;
  }
  await still();
  await page.waitForTimeout(800);
  const end = await st();
  const ok = end.state === 'complete';
  console.log(`${ok ? 'PASS' : 'FAIL'} ${ID} time ${end.time}s falls ${end.falls}${ok ? '' : ' (' + status + ' at step ' + i + '/' + steps.length + ') ' + JSON.stringify(end)}${errors.length ? ' ERRORS ' + errors.join(' | ') : ''}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${ID}-end.png` });
  await browser.close();
})();
