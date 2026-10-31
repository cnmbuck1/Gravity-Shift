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
  async function go(T, cruise = 3.2, tol = 0.4, maxS = 25, live = null) {
    const t0 = await gameTime();
    const d0 = await downKey();
    const f0 = await page.evaluate(() => window.gravityShift.stats.falls);
    const s0 = await page.evaluate(() => { const p = window.gravityShift.ball.position; return [p.x, p.y, p.z]; });
    let n = 0;
    let stuck = 0;
    let forced = false;
    while ((await gameTime()) - t0 < maxS && n++ < 4000) {
      if (live) T = await live();
      const r = await page.evaluate(([T, s0]) => {
        const gm = window.gravityShift; const v = gm.ball.body.linvel(); const p = gm.ball.position; const f = gm.frame;
        const d = (a, b) => a[0] * b.x + a[1] * b.y + a[2] * b.z;
        const e = [T[0] - p.x, T[1] - p.y, T[2] - p.z]; const V = [v.x, v.y, v.z];
        const L = [T[0] - s0[0], T[1] - s0[1], T[2] - s0[2]]; const P = [p.x - s0[0], p.y - s0[1], p.z - s0[2]];
        return { ef: d(e, f.forward), er: d(e, f.right), vf: d(V, f.forward), vr: d(V, f.right), lf: d(L, f.forward), lr: d(L, f.right), pf: d(P, f.forward), pr: d(P, f.right), falls: gm.stats.falls, state: gm.state, down: [f.down.x, f.down.y, f.down.z].map(Math.round).join(',') };
      }, [T, s0]);
      if (r.state !== 'playing') return 'state';
      if (r.falls > f0) return 'fell';
      if (r.down !== d0) return 'frame';
      const dist = Math.hypot(r.ef, r.er);
      if (dist < tol && !live) return 'ok';
      // Carried past the target along the leg (boost pads, conveyors): count it as reached.
      const lineLen = Math.hypot(r.lf, r.lr);
      if (!live && lineLen > 0.5 && dist < 1 && (r.pf * r.lf + r.pr * r.lr) / lineLen >= lineLen) return 'ok';
      const sp = live ? Math.min(cruise, dist * 3) : Math.max(1.2, Math.min(cruise, dist * 1.5));
      let wf = (r.ef / (dist || 1)) * sp, wr = (r.er / (dist || 1)) * sp;
      // Hold the straight line from where this leg started (resists conveyors and ice drift).
      const ll = Math.hypot(r.lf, r.lr);
      if (!live && ll > 1.5 && dist > 1) {
        const nf = -r.lr / ll, nr = r.lf / ll;
        const cross = r.pf * nf + r.pr * nr;
        wf -= nf * cross * 4; wr -= nr * cross * 4;
      }
      // Wedged on a wall corner: line up with the target along the short axis first.
      stuck = Math.hypot(r.vf, r.vr) < 0.15 && dist > 0.7 ? stuck + 1 : Math.max(0, stuck - 1);
      if (stuck > 20 && !live) {
        if (Math.abs(r.er) > Math.abs(r.ef)) { wf = r.ef * 3; wr = Math.sign(r.er) * 1.5; } else { wr = r.er * 3; wf = Math.sign(r.ef) * 1.5; }
        if (stuck > 45) stuck = 0;
      }
      // Push harder while stuck (against a conveyor, say).
      const gain = stuck > 20 ? 14 : 7;
      let tf = Math.max(-20, Math.min(20, (wf - r.vf) * gain));
      let tr = Math.max(-20, Math.min(20, (wr - r.vr) * gain));
      if (stuck > 20) forced = true;
      if (forced && !live) { if (Math.abs(wr) > Math.abs(wf)) tr = Math.sign(wr) * 20; else tf = Math.sign(wf) * 20; }
      await tilt(40 - tf, tr);
      await page.waitForTimeout(40);
      if (live && live.done && (await live.done())) return 'ok';
    }
    return 'timeout';
  }
  const still = () => tilt(40, 0);
  // Brake to a stop where we are (so we don't roll into a laser or an arm while waiting).
  async function settle() {
    for (let k = 0; k < 60; k++) {
      const v = await page.evaluate(() => { const gm = window.gravityShift; const v = gm.ball.body.linvel(); const f = gm.frame; return [v.x * f.forward.x + v.y * f.forward.y + v.z * f.forward.z, v.x * f.right.x + v.y * f.right.y + v.z * f.right.z]; });
      if (Math.hypot(v[0], v[1]) < 0.2) break;
      await tilt(40 + Math.max(-16, Math.min(16, v[0] * 7)), Math.max(-16, Math.min(16, -v[1] * 7)));
      await page.waitForTimeout(40);
    }
    await still();
  }

  const steps = routes[ID];
  let i = 0;
  let fallsSeen = 0;
  let status = 'route';
  const skipToAfterShift = () => { while (i < steps.length && !steps[i].shift) i++; i++; };
  while (i < steps.length) {
    const s = steps[i];
    const now = await st(); if (process.env.DBG) console.log('step', i, JSON.stringify(now));
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
      await settle();
      // Wait for the platform to come to this side, ride it to the far side, then step off.
      const near = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
      // Let it leave first if it is already here, then catch it as it arrives.
      for (let k = 0; k < 200 && near(await pos(), s.near) < 3.2; k++) await page.waitForTimeout(50);
      for (let k = 0; k < 300 && near(await pos(), s.near) > 2.8; k++) await page.waitForTimeout(30);
      const ride = async () => pos();
      ride.done = async () => near(await pos(), s.far) < 2.8;
      const r = await go(null, 4, 0.3, 20, ride);
      if (r !== 'ok') { status = r; break; }
      const r2 = await go(s.far, 2.5);
      if (r2 !== 'ok') { status = r2; break; }
      i++;
      continue;
    }
    if (s.laser !== undefined) {
      // Wait close to the beam (1.3 m short of it) so one off-phase is enough to cross.
      let wait = null; if (s.near) { const m = s.at ?? [0, 1, 2].map((k) => (s.near[k] + s.far[k]) / 2); const L = Math.hypot(m[0] - s.near[0], m[2] - s.near[2]); wait = m.map((v, k) => v - ((m[k] - s.near[k]) / L) * Math.min(1.6, L) * (k === 1 ? 0 : 1)); await go(wait, 1.4, 0.3); }
      await settle();
      if ((await st()).falls > fallsSeen) continue;
      const on = () => page.evaluate((k) => window.gravityShift.features['lasers'][k].on, s.laser);
      // Hold this spot while waiting (on ice the ball would otherwise creep into the beam).
      const here = wait ?? (await st()).pos; if (process.env.DBG) console.log('hold at', here);
      const hold = async () => {
        const r = await page.evaluate((H) => { const gm = window.gravityShift; const v = gm.ball.body.linvel(); const p = gm.ball.position; const f = gm.frame; const d = (a, b) => a[0] * b.x + a[1] * b.y + a[2] * b.z; const e = [H[0] - p.x, 0, H[2] - p.z]; const V = [v.x, v.y, v.z]; return [d(e, f.forward), d(e, f.right), d(V, f.forward), d(V, f.right)]; }, here);
        const tf = Math.max(-16, Math.min(16, (r[0] * 2 - r[2]) * 7)), tr = Math.max(-16, Math.min(16, (r[1] * 2 - r[3]) * 7));
        await tilt(40 - tf, tr);
        await page.waitForTimeout(30);
      };
      for (let k = 0; k < 200 && !(await on()); k++) await hold();
      for (let k = 0; k < 200 && (await on()); k++) await hold();
      if (process.env.DBG) console.log('after wait', JSON.stringify(await st()));
      if ((await st()).falls > fallsSeen) continue;
      const r = await go(s.far, 4, 0.3);
      if (r !== 'ok') { status = r; break; }
      i++;
      continue;
    }
    if (s.piston !== undefined) {
      await go(s.near);
      await settle();
      // Go as the piston swings out of the middle toward one end (it stays clear for about half a cycle).
      // Where the piston is along its stroke (0..1), and where our lane crosses that stroke.
      const k = () => page.evaluate((m) => { const mv = window.gravityShift.levels['movers'][m]; const t = mv.body.translation(); const f = mv.def.from, to = mv.def.to; const L = Math.hypot(to[0] - f[0], to[1] - f[1], to[2] - f[2]); return Math.hypot(t.x - f[0], t.y - f[1], t.z - f[2]) / L; }, s.piston);
      const lane = await page.evaluate(([m, p]) => { const mv = window.gravityShift.levels['movers'][m]; const f = mv.def.from, to = mv.def.to; const d = [to[0] - f[0], to[1] - f[1], to[2] - f[2]]; const L2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2; return ((p[0] - f[0]) * d[0] + (p[1] - f[1]) * d[1] + (p[2] - f[2]) * d[2]) / L2; }, [s.piston, s.near]);
      let prev = Math.abs((await k()) - lane);
      for (let n = 0; n < 300; n++) { await page.waitForTimeout(20); const c = Math.abs((await k()) - lane); if (c > 0.32 && prev <= 0.32) break; prev = c; }
      const r = await go(s.far, 4, 0.4);
      if (r !== 'ok') { status = r; break; }
      i++;
      continue;
    }
    if (s.arm !== undefined) {
      await go(s.near);
      await settle();
      // Go just after the bar lines up with the corridor.
      const ang = () => page.evaluate((k) => { const q = window.gravityShift.features['rotators'][k].body.rotation(); return 2 * Math.atan2(q.y, q.w); }, s.arm);
      // Go the moment the bar swings out of our lane (|sin| drops below the lane threshold).
      let prev = Math.abs(Math.sin(await ang()));
      for (let k = 0; k < 400; k++) { await page.waitForTimeout(20); const c = Math.abs(Math.sin(await ang())); if (c < 0.75 && prev >= 0.75) break; prev = c; }
      const r = await go(s.far, 3.6);
      if (r !== 'ok') { status = r; break; }
      i++;
      continue;
    }
    // Sharp turn here (on the floor): brake first so momentum doesn't carry us wide into a hole.
    const pv = steps[i - 1], pp = steps[i - 2];
    if (pv && pp && pv.p && pp.p && !s.v && pv.p[1] < 1) {
      const a1 = [pv.p[0] - pp.p[0], pv.p[2] - pp.p[2]], a2 = [s.p[0] - pv.p[0], s.p[2] - pv.p[2]];
      const cos = (a1[0] * a2[0] + a1[1] * a2[1]) / ((Math.hypot(...a1) * Math.hypot(...a2)) || 1);
      if (cos < 0.5 && Math.hypot(...a1) > 0.3) await settle();
    }
    const r = await go(s.p, s.v ?? 3.2);
    if (r === 'frame') { skipToAfterShift(); await page.waitForTimeout(1500); continue; }
    if (r === 'timeout') { console.log('  timeout at step', i, JSON.stringify(s), JSON.stringify(await st())); status = 'timeout'; break; }
    if (r === 'state') break;
    if (r === 'fell') { console.log('  fell during step', i, JSON.stringify(s), 'prev', JSON.stringify(steps[i - 1])); status = 'fell'; break; }
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
