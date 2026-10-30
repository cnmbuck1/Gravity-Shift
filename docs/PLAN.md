# Gravity Shift — Technical Plan (v0.2)

_Tilt Your World. Defy Gravity._

This covers the build sheet's section 17 items, updated for two design changes: player-triggered 90° gravity shifts (v0.1), then the correction that **Gravity Shift is ~80% continuous tilt labyrinth and ~20% gravity manipulation** (v0.2).

## 0. Labyrinth direction (v0.2)

- **Course architecture:** a level can carry a `maze` text grid (`#` wall, `.` floor, space = hole, `X` red energy floor, `P` purple zone floor, `B` filled by explicit platforms). `MazeBuilder` turns it into merged wall/floor meshes (a few draw calls), one collider per row run, cyan borders on wall tops, red edges around holes. Ramps and bridges are rotated `platforms`; sliding blocks are `movers` (kinematic bodies that push the ball).
- **Gravity as an occasional event:** `shiftZones` restrict shifts to marked volumes, under a given gravity, in given directions. The HUD shows only the shifts that are possible right now; outside a zone the shift pad is hidden.
- **Camera:** per-level settings (`camera`). Mazes use a steeper 58° pitch and 16 m distance, follow smoothly, and lead along the ball's velocity so the next corridor stays in view. It rotates only during a shift.
- **Scoring:** per-level `par` times. Stars = time + falls; gravity shifts never affect stars.
- **Benchmark level:** `levels/orbitalLabyrinth.ts`.


## 1. Architecture

Three.js renders, Rapier simulates, TypeScript glues it together, Vite bundles, Capacitor wraps it as a native iOS app. Systems are separated so each can change independently:

| Layer | Modules (in `src/`) | Responsibility |
|---|---|---|
| Core | `core/GameManager` | Main loop, game state, rules (falls, checkpoints, goal, scoring) |
| Physics | `physics/PhysicsManager` | Rapier world, fixed 60 Hz step with accumulator |
| Input | `input/InputManager`, `TiltInputController`, `TouchInputController`, `KeyboardInputController`, `CalibrationManager`, `tiltMath` | Every scheme produces one normalized movement intent `(right, forward)` |
| Gameplay | `game/BallController`, `GravityFrame`, `CameraController`, `LevelManager`, `GoalPortal` | Ball forces, gravity frames, camera, building levels from data |
| Levels | `levels/*.ts` | Pure data (`LevelDef`): platforms, pylons, checkpoints, goal, starting gravity |
| Render | `render/SceneRenderer`, `Materials` | Renderer, lights, environment, ambient effects, procedural materials |
| UI | `ui/UIManager`, `styles.css` | DOM overlay: menu, HUD, settings, completion; talks to the game only via public methods/events |
| Persistence | `settings/SettingsManager`, `SaveManager` | Settings and personal bests in local storage |

Modules from the build sheet not needed yet (`HazardManager`, `ScoringManager`, `AudioManager`, `CheckpointManager`, `GravityZone`) have obvious homes: today their small amount of logic lives in `GameManager`/`LevelManager` and will be split out when Milestones 2–4 give them real work.

**Loop:** each animation frame → physics advances in fixed 1/60 s steps (input sampled and forces applied before every step) → ball/camera render with interpolation between the last two physics states. Rendering frame rate can drop without changing how the ball behaves.

## 2. Physics engine: Rapier

**Choice:** `@dimforge/rapier3d-compat` (WASM, ships inline so it works in Capacitor with no extra config).

- Deterministic, fast, actively maintained; built-in CCD so a fast ball cannot tunnel through thin walls.
- Correct rolling from contact friction (the spin you see is simulated, not animated).
- Ray casts used for ground detection and camera anti-clipping.
- Alternatives: cannon-es (unmaintained, weaker stacking/CCD), Ammo.js (heavy, awkward API), Jolt (excellent but heavier WASM, less JS ecosystem). Rapier is the best fit.
- Validated in this build: stable rolling, collisions with pylons, falls, respawns, and gravity changes mid-run.

**Ball model** (`BallController.BALL_TUNING`, all in one place for tuning): tilt → planar acceleration up to 17 m/s², extra braking when pushing against motion, speed cap 11 m/s (input can steer but not accelerate past it), 25% air control, custom rolling resistance (Rapier has none), mild linear/angular damping.

## 3. iPhone motion sensors

- **Source:** W3C `deviceorientation` events. On iOS these come from Core Motion's sensor-fused attitude (gyro + accelerometer), which is smoother and lower-latency than raw accelerometer data. It runs identically in Safari (quick testing) and in the Capacitor WKWebView.
- **Gravity vector, not angles:** beta/gamma are converted into a gravity vector in phone coordinates. Compass heading (alpha) is ignored, so magnetometer drift cannot move the ball.
- **Calibration:** averages 300 ms of samples into a "neutral" gravity vector, then measures tilt relative to it. Players can hold the phone at any comfortable angle (e.g. 40° toward the face). Runs automatically when a level starts, and on the CALIBRATE button anytime.
- **Shaping:** radial dead zone (default 1.5°, continuous at its edge), full input at 20° beyond it, mild response curve for fine control at small angles, sensitivity multiplier (0.5×–2×).
- **Filtering:** frame-rate-independent low-pass on the gravity vector (default 45 ms time constant, adjustable 0–150 ms) to remove hand tremor while keeping latency to roughly one or two sensor frames.
- **Safety:** if no sensor data arrives for 400 ms the input reads as neutral, so the ball never keeps pushing on stale data. Backgrounding pauses the game and resets the filter on resume.
- **Upgrade path:** if on-device testing shows latency or rate problems, swap in a small native Core Motion Capacitor plugin (`CMMotionManager.deviceMotion.gravity` at 60–100 Hz). Only `TiltInputController`'s event source changes; the math and calibration stay.

## 4. iOS permission and calibration issues

1. **Safari needs HTTPS and a tap.** iOS Safari only sends motion events to secure origins, and `DeviceOrientationEvent.requestPermission()` must be called directly inside a tap. The PLAY button does this. `npm run dev:phone` serves HTTPS on your LAN for this reason.
2. **Inside the Capacitor app there is no prompt.** Capacitor's WKWebView delegate grants motion access automatically (checked in `@capacitor/ios`), so the app just works. `NSMotionUsageDescription` is still set in Info.plist for App Review.
3. **Denied or no sensors** → automatic switch to the touch joystick with a message. Switching back to TILT in Settings re-requests.
4. **Holding near vertical** makes "forward" ambiguous; the calibration basis handles this with a fallback axis.
5. **Orientation lock:** the app is portrait-only in Info.plist; the math also corrects for screen rotation in case the lock fails.
6. **Re-gripping the phone** changes the comfortable neutral; that's why CALIBRATE is one tap on the HUD.

## 5. Gravity shifts: physics, camera and tilt

The player's world is described by a **gravity frame**: `down` (gravity), `forward` (up the screen) and the derived `right` and `up`. Every frame is axis-aligned, and vectors are snapped to exact axes after each shift so nothing drifts.

- **Shift buttons:** ◀ and ▶ make the surface on that side the new floor (the camera rolls around the direction of travel). ▲ makes the surface ahead the floor (the camera pitches, and "forward" becomes the old sky). Keyboard: Q / E / R.
- **Physics:** a shift sets Rapier's world gravity to `down × 14 m/s²`. The ball keeps its momentum but its spin is cleared, so leftover rolling spin can't fling it sideways on landing. Shifts are only allowed on a surface (with a 0.15 s grace period after leaving one), which keeps them deliberate and stops mid-air spamming. Ground checks ray-cast along the current `down`.
- **Camera:** always aligned to the gravity frame (screen-up = forward, screen-right = right). On a shift it slerps to the new frame over 0.75 s with ease-in-out, so the world appears to rotate around the ball instead of cutting. It also pulls in if geometry would block the view.
- **Tilt:** input stays in screen terms. Tilting right always pushes toward screen-right, whatever surface you're on, because the input vector is applied along the frame's `right` and `forward`. No recalibration is needed after a shift.
- **Readability:** purple surfaces mean you can shift onto them; a HUD chip shows the current surface (FLOOR / WALL / CEILING); ambient dust particles drift in the gravity direction; a purple edge flash shows which way you shifted.
- **Falls and checkpoints** store the gravity frame too, so respawning restores the orientation you had there.
- **Future GravityZone:** zones that override gravity inside a volume reuse `GravityFrame` and `PhysicsManager`; nothing here needs rewriting.

## 6. Folder structure

```
gravity-shift/
├─ index.html                 # canvas + UI root
├─ vite.config.ts             # relative base for Capacitor; HTTPS phone mode
├─ capacitor.config.ts        # appId com.gravityshift.game
├─ ios/                       # Xcode project (portrait-only, status bar hidden)
├─ docs/PLAN.md               # this document
├─ src/
│  ├─ main.ts
│  ├─ core/GameManager.ts
│  ├─ physics/PhysicsManager.ts
│  ├─ input/   (InputManager, Tilt/Touch/Keyboard controllers, CalibrationManager, tiltMath)
│  ├─ game/    (BallController, GravityFrame, CameraController, LevelManager, GoalPortal)
│  ├─ levels/  (LevelTypes, shiftProof, testDeck)
│  ├─ render/  (SceneRenderer, Materials)
│  ├─ settings/(SettingsManager, SaveManager)
│  └─ ui/      (UIManager, styles.css)
└─ tests/     (tiltMath, gravityFrame unit tests)
```

## 7. Milestones (revised for gravity shifts)

1. **Technical foundation + gravity-shift proof of concept** — _this build._ Tilt controls, calibration, sensitivity, touch fallback, camera, reset; plus the shift mechanic and one proof-of-concept course. **Waiting for your on-device approval.**
2. **First real level:** a teaching course that introduces tilt, then a single shift; proper checkpoint system, fall animation, completion flow, local progress.
3. **Premium visual pass:** bloom, portal effects, particles, sound and haptics (Capacitor Haptics), performance profiling on device.
4. **More gameplay:** two more levels built around shift puzzles, moving obstacles, a GravityZone, star thresholds per level, level select.
5. **iPhone testing and refinement:** permissions, drift, backgrounding, battery, frame rate, saving.

## 8. Questions for Chris

1. **Shift controls:** three on-screen buttons (◀ ▲ ▶) are in now. Would you rather try swipe gestures, or a "back" shift too?
2. **Shift rules:** should shifts be unlimited, or limited per level (a puzzle resource, with the counter feeding star rating)?
3. **Repository:** where should this live? Create an empty GitHub repo and tell me its name, and I'll push it there.
4. **Bundle ID / Apple team:** is `com.gravityshift.game` OK, and do you have a paid Apple Developer account (free accounts work for testing but need re-signing every 7 days)?
