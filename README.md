# Gravity Shift

_Tilt Your World. Defy Gravity._ A futuristic 3D physics puzzle game for iPhone: roll a metallic sphere by tilting your phone, and shift gravity 90° to turn walls and ceilings into floors.

**Status:** v0.2: Orbital Labyrinth benchmark maze (about 80% tilt labyrinth, 20% gravity shifting) on the Milestone 1 tilt-control foundation. See [docs/PLAN.md](docs/PLAN.md).

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

- **Play: Orbital Labyrinth** (target 45–60 s). Roll through the maze: weave past three holes, time the amber sliding block, cross the checkpoint, climb the ramp and cross the narrow bridge over the chasm, dodge the red energy strips, and reach the portal. No gravity shift is needed.
  - **Optional shortcut:** in the purple pad by the tall purple wall (near the start), the ▶ button appears. Shift onto the wall, climb a little (tilt right), roll forward over the chasm, and at the purple band near the far end press ◀ to drop back into the maze.
  - Stars depend on time and falls only: 3★ ≤ 50 s with no falls, 2★ ≤ 80 s with at most 2 falls.
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
