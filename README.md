# Gravitor

_Tilt Your World. Defy Gravity._ A futuristic 3D physics puzzle game for iPhone: roll a metallic sphere by tilting your phone, and shift gravity 90° to turn walls and ceilings into floors.

**Status:** v0.7: 100 levels in 10 worlds, each world built around one new idea (crumbling floors, moving platforms, boost/conveyor/ice/sticky pads, glass-ceiling flips, switches, doors and lasers, jump pads and low gravity, automatic shifts, sweeping arms and turning discs). All levels are unlocked while the world order is being decided (Settings → Unlock all levels), and the Cnmbuck Orb ball is selectable while that is on; otherwise it is won by finishing 50 levels. v0.6: the game is renamed Gravitor (the title logo uses the Cnmbuck Orb as the O; the Orb ball is still won by finishing the campaign). v0.5: ten levels (Orbital Labyrinth is now level 7), Cnmbuck Orb mark on the title screen (the Orb ball itself is won by finishing all ten levels). v0.4 added the five-level progression, level select and How to Play. Previously v0.3: refined Orbital Labyrinth benchmark (about 80% tilt labyrinth, 20% gravity shifting): new camera, compact HUD, redesigned maze, REFINED physics profile, sound and haptics, course preview. See [docs/PLAN.md](docs/PLAN.md).

Stack: Three.js · TypeScript · Vite · Rapier · Capacitor (iOS).

## Run on a computer

```bash
npm install
npm run dev        # http://localhost:5173
```

Keyboard: arrows/WASD to roll, **Q / E / R** to shift gravity left / right / forward, **C** to calibrate.

## Test on a physical iPhone

### Option A: Safari over Wi-Fi (fastest, no Xcode)

1. Mac and iPhone on the same Wi-Fi.
2. `npm run dev:phone` and note the `Network: https://192.168.x.x:5173` address.
3. Open that address in Safari on the iPhone. Accept the certificate warning (Show Details → visit this website).
4. Lock rotation to portrait, tap **PLAY**, then **Allow** motion access.

Motion sensors only work over HTTPS in Safari, which is why this mode uses a self-signed certificate.

### Option B: native app via Xcode (the real target)

Needs a Mac with Xcode 16+ and an Apple ID.

1. `npm install`
2. `npm run ios:sync` (builds the web app and copies it into the iOS project)
3. `npm run ios:open` (opens Xcode)
4. In Xcode select the **App** target → **Signing & Capabilities** → choose your Team. Change the bundle ID if Xcode says it's taken.
5. Connect the iPhone by cable, select it as the run destination, press **Run** (⌘R).
6. First time only: on the iPhone, enable **Settings → Privacy & Security → Developer Mode**, and trust your developer certificate under **Settings → General → VPN & Device Management**.

In the native app there's no motion prompt; access is granted automatically.

After code changes run `npm run ios:sync` again, then Run in Xcode.

## What to try

**Worlds** (Main menu → LEVELS shows a card per world, then its ten levels with stars and best times):

| World | Idea |
|---|---|
| 1 Launch Deck | Tilt, corners, holes and mazes |
| 2 Piston Works | Pistons, energy strips and bridges |
| 3 Wall Walk | Gravity walls: shift left and right |
| 4 Crumble Belt | Crumbling floors and moving platforms |
| 5 Flux Rails | Boost pads, conveyors, ice and sticky ground |
| 6 Skyward | Flip gravity onto glass ceilings |
| 7 Circuit | Switches, doors and blinking lasers |
| 8 Low Orbit | Jump pads, low gravity and automatic shifts |
| 9 Spin Cycle | Sweeping arms and turning discs |
| 10 Event Horizon | Everything at once |

Each world runs: levels 1–2 introduce the idea, 3–4 practise it, 5 is a breather, 6–8 combine it with earlier ideas, 9 is the challenge and 10 the finale. The world list is in `src/levels/worlds.ts`. Hand-made levels live in `src/levels/campaign*.ts` and `orbitalLabyrinth.ts`; the rest are generated (see Level generator below).

**How to Play** on the main menu explains tilt, calibration, hazards, checkpoints, gravity zones and touch controls.


- **Play: Orbital Labyrinth** (target 45–60 s). The first time you play, a 4–5 second flyover previews the course (tap to skip; it won't replay on retries). Roll through the maze: weave past three holes in the wide hall, climb the narrow two-wide passage, time the amber piston, reach the checkpoint pad in the hub, climb the ramp and cross the narrow raised bridge, dodge the red energy strips, and roll into the portal plaza. No gravity shift is needed.
  - **Skywalk shortcut:** from the hole hall, a narrow unwalled catwalk leads straight north over a gap into the piston corridor.
  - **Gravity shortcut:** on the purple pad by the tall purple wall (near the start), ▶ appears. Shift onto the wall, roll north over the chasm, and at the purple band press ◀ to drop back in near the end.
  - Stars depend on time and falls only: 3★ ≤ 50 s with no falls, 2★ ≤ 80 s with at most 2 falls.
- **Physics comparison:** Settings → Physics switches between REFINED (new) and CLASSIC (previous build). `npm test` prints a side-by-side table (time to 5 m/s, top speed, braking distance, coasting distance).
- **Shift Lab:** the earlier proof of concept, where shifts work anywhere (floor → wall → ceiling).
- **Test Deck:** a flat platform with no goal for judging tilt feel. Turn on **Settings → Debug readout** to see tilt angles, sensor rate and FPS.
- Hold the phone however is comfortable, then tap **◎** to make that the neutral pose.
- Tune **Sensitivity**, **Dead zone** and **Smoothing** in Settings; they apply instantly.

## Level generator

Most levels are generated from short specs in `tools/levelgen/` (`worlds_1_3.py`, `worlds_4_10.py`). Each level is a stack of corridors, mazes and connectors with features along them. Edit a spec and run `python3 worlds_4_10.py` in that folder to rewrite `src/levels/generated/worldN.ts`. Don't edit the generated files by hand.

The generator also writes a route for each level to `routes.json`. `node autopilot.cjs <level-id>` plays that route in headless Chromium (with `npx vite preview --port 4173` running) and prints PASS or FAIL, which proves every level can be finished.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (http, LAN-visible) |
| `npm run dev:phone` | Dev server over HTTPS for iPhone Safari |
| `npm run build` | Type-check + production build into `dist/` |
| `npm test` | Unit tests (tilt math, gravity frames) |
| `npm run ios:sync` | Build and copy into the Xcode project |
| `npm run ios:open` | Open the Xcode project |
