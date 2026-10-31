# Gravitor

_Tilt Your World. Defy Gravity._ A futuristic 3D physics puzzle game for iPhone: roll a metallic sphere by tilting your phone, and shift gravity 90° to turn walls and ceilings into floors.

**Status:** v0.6: the game is renamed Gravitor (title logo uses the chrome ball as the O; the Cnmbuck Orb mark is off the home screen, the Orb ball is still won by finishing the campaign). v0.5: ten levels (Orbital Labyrinth is now level 7), Cnmbuck Orb mark on the title screen (the Orb ball itself is won by finishing all ten levels). v0.4 added the five-level progression, level select and How to Play. Previously v0.3: refined Orbital Labyrinth benchmark (about 80% tilt labyrinth, 20% gravity shifting): new camera, compact HUD, redesigned maze, REFINED physics profile, sound and haptics, course preview. See [docs/PLAN.md](docs/PLAN.md).

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

**Levels** (unlock in order; Main menu → LEVELS shows stars and best times; PLAY resumes at your next unfinished level):

| # | Level | Teaches |
|---|---|---|
| 1 | First Roll | Tilt to roll: wide corridors, four gentle turns, no hazards |
| 2 | Corners | Three-wide corridors, many turns, a dead end, first checkpoint |
| 3 | Mind the Gap | Holes in the floor, a narrow two-wide passage |
| 4 | Moving Parts | Red energy strips, two sliding pistons, ramp and raised bridge |
| 5 | Switchback | Longer runs, a two-wide stretch, a 2 m raised bridge, three pistons, two checkpoints |
| 6 | Wall Walk | First required gravity shift: onto a wall, over a chasm, and back down |
| 7 | Orbital Labyrinth | Everything so far, plus the skywalk and gravity-wall shortcuts |
| 8 | Crossfire | Two-wide corridors, faster pistons, an energy slalom, a 1.4 m bridge |
| 9 | Twin Walls | Two required wall crossings (right wall, then left wall), pistons between |
| 10 | Event Horizon | Finale: holes, slalom, thin bridge, fast pistons and a long wall crossing |

Levels 5, 6 and 8–10 live in `src/levels/campaignAdvanced.ts`.

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

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (http, LAN-visible) |
| `npm run dev:phone` | Dev server over HTTPS for iPhone Safari |
| `npm run build` | Type-check + production build into `dist/` |
| `npm test` | Unit tests (tilt math, gravity frames) |
| `npm run ios:sync` | Build and copy into the Xcode project |
| `npm run ios:open` | Open the Xcode project |
