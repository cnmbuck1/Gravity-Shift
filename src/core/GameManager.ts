import * as THREE from 'three';
import { PhysicsManager } from '../physics/PhysicsManager';
import { SceneRenderer } from '../render/SceneRenderer';
import { InputManager } from '../input/InputManager';
import { BallController, BALL_RADIUS } from '../game/BallController';
import { CameraController, FALL_FOLLOW, FALL_FOLLOW_TIERS } from '../game/CameraController';
import { GravityFrame, type ShiftDirection } from '../game/GravityFrame';
import { LevelManager, v3 } from '../game/LevelManager';
import { FeatureManager } from '../game/FeatureManager';
import type { GravityFrameDef, LevelDef, ShiftZoneDef } from '../levels/LevelTypes';
import type { SettingsManager, Settings } from '../settings/SettingsManager';
import { orbAvailable } from '../settings/SettingsManager';
import { PROFILES } from '../game/PhysicsTuning';
import { AudioManager } from '../feedback/AudioManager';
import { HapticsManager } from '../feedback/HapticsManager';
import type { SaveManager } from '../settings/SaveManager';

export const GRAVITY = 14;
/** Downward speed (m/s) a sphere gets the moment it rolls off into a hole, so holes catch it at any speed. */
const HOLE_DROP_SPEED = 5;
/** Share of sideways speed kept on that first drop step (a little drag so it can't hop the far rim). */
const HOLE_DRAG = 0.85;
/** Seconds after leaving the floor during which rolling over a hole still grabs the sphere. */
const HOLE_GRAB_WINDOW = 0.3;
/** Fastest fall (m/s) inside a glide chute (a gravity well with `steer`). */
const GLIDE_FALL_SPEED = 2.3;
const RESPAWN_DELAY = 1.1;
/** Short grace period after leaving a surface during which a shift is still allowed. */
const COYOTE_TIME = 0.15;
/** Velocity change (m/s) in one step, beyond applied forces, that counts as a collision. */
const IMPACT_THRESHOLD = 1.6;

export type GameState = 'menu' | 'preview' | 'playing' | 'paused' | 'complete';

export interface RunStats {
  time: number;
  falls: number;
  shifts: number;
}

export interface LevelRecord {
  bestTime: number | null;
  bestStars: number;
}

export interface GameEvents {
  onShift?(dir: ShiftDirection, surface: string): void;
  onShiftRejected?(reason: string): void;
  onFall?(): void;
  onCheckpoint?(): void;
  onSwitch?(): void;
  onZoneEnter?(zone: ShiftZoneDef): void;
  onPreviewEnd?(): void;
  onComplete?(stats: RunStats, stars: number, record: LevelRecord, newBest: boolean): void;
}

/**
 * Orchestrates the systems. Owns the main loop: input is sampled each fixed step, physics
 * advances at a fixed 60 Hz, and rendering interpolates between physics states.
 */
export class GameManager {
  state: GameState = 'menu';
  readonly stats: RunStats = { time: 0, falls: 0, shifts: 0 };
  events: GameEvents = {};
  fps = 0;

  readonly frame = new GravityFrame({ down: [0, -1, 0], forward: [0, 0, -1] });
  private respawnFrame: GravityFrameDef = this.frame.toDef();
  private respawnPoint = new THREE.Vector3();
  private respawnTimer = -1;
  private lastTime = performance.now();
  private elapsed = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  /** Gravity zone the ball is currently in (only meaningful for levels with zones). */
  zone: ShiftZoneDef | null = null;
  readonly audio = new AudioManager();
  readonly haptics = new HapticsManager();
  private frameImpact = 0;
  /** Current gravity multiplier from gravity wells (1 outside them). */
  private gravityScale = 1;

  private constructor(
    readonly physics: PhysicsManager,
    readonly view: SceneRenderer,
    readonly input: InputManager,
    readonly ball: BallController,
    readonly camera: CameraController,
    readonly levels: LevelManager,
    readonly features: FeatureManager,
    settings: SettingsManager,
    private save: SaveManager,
  ) {
    this.applySettings(settings.get());
    settings.onChange((s) => this.applySettings(s));
  }

  static async create(canvas: HTMLCanvasElement, overlay: HTMLElement, settings: SettingsManager, save: SaveManager): Promise<GameManager> {
    const physics = await PhysicsManager.create();
    const view = new SceneRenderer(canvas, settings.get().graphics);
    const input = new InputManager(canvas, overlay);
    const ball = new BallController(physics, view.scene);
    const camera = new CameraController(view.camera, physics);
    const levels = new LevelManager(physics, view.scene);
    const features = new FeatureManager(physics, view.scene);
    const game = new GameManager(physics, view, input, ball, camera, levels, features, settings, save);
    features.doorTick = () => game.audio.tick();
    return game;
  }

  get level(): LevelDef | null {
    return this.levels.level;
  }

  get surfaceName(): string {
    const d = this.frame.down;
    if (d.y < -0.5) return 'FLOOR';
    if (d.y > 0.5) return 'CEILING';
    return 'WALL';
  }

  start(): void {
    requestAnimationFrame(this.loop);
  }

  loadLevel(def: LevelDef): void {
    this.levels.load(def);
    this.features.load(def);
    this.view.setTheme(def.theme);
    // Compile every shader the level needs now, at load, instead of the first time an object
    // comes into view (that stalled the course preview and the first seconds of some levels).
    this.view.prewarm();
    this.levels.disposeRetired();
    this.features.disposeRetired();
    this.camera.configure(def.camera);
    this.camera.seeThrough = this.levels.seeThrough;
    // Multi-level boards: follow the ball all the way down a drop to the floor below.
    this.camera.fallFollow = def.tiers?.length ? FALL_FOLLOW_TIERS : FALL_FOLLOW;
    this.respawnFrame = def.frame;
    this.respawnPoint.copy(v3(def.spawn));
    this.restart();
  }

  restart(): void {
    const def = this.levels.level;
    if (!def) return;
    this.stats.time = this.stats.falls = this.stats.shifts = 0;
    for (const c of this.levels.checkpoints) c.active = false;
    this.levels.goal?.reset();
    this.features.reset();
    this.respawnFrame = def.frame;
    this.respawnPoint.copy(v3(def.spawn));
    this.respawn();
    this.state = 'playing';
  }

  /**
   * Plays the course flyover if previews are on and this level hasn't been previewed
   * before. Returns false (and does nothing) otherwise. Retries never replay it.
   */
  startPreview(enabled: boolean): boolean {
    const def = this.levels.level;
    if (!def || !enabled) return false;
    const key = `seen:${def.id}`;
    if (this.save.load(key, { seen: false }).seen) return false;
    this.save.save(key, { seen: true });
    const pts: THREE.Vector3[] = [];
    if (this.levels.goal) pts.push(this.levels.goal.centre.clone());
    for (const c of [...this.levels.checkpoints].reverse()) pts.push(v3(c.def.position));
    pts.push(this.levels.bounds.getCenter(new THREE.Vector3()).setY(v3(def.spawn).y));
    pts.push(v3(def.spawn));
    if (pts.length < 2) return false;
    this.state = 'preview';
    this.camera.flyover(pts, this.frame, 4.5, () => {
      this.state = 'playing';
      this.lastTime = performance.now();
      this.physics.resetAccumulator();
      this.events.onPreviewEnd?.();
    });
    return true;
  }

  skipPreview(): void {
    if (this.state === 'preview') this.camera.skipFlyover();
  }

  /** Levels skipped with "Skip level": they unlock the next level but stay unplayed (no stars, no time). */
  wasSkipped(levelId: string): boolean {
    return this.save.load(`skipped:${levelId}`, { skipped: false }).skipped;
  }

  markSkipped(levelId: string): void {
    this.save.save(`skipped:${levelId}`, { skipped: true });
  }

  recordFor(levelId: string): LevelRecord {
    return this.save.load<LevelRecord>(`record:${levelId}`, { bestTime: null, bestStars: 0 });
  }

  /** Shift directions available right now (drives which HUD buttons are shown). */
  availableShifts(): ShiftDirection[] {
    const def = this.levels.level;
    if (!def?.allowShifts) return [];
    if (!def.shiftZones) return ['left', 'forward', 'right'];
    // Auto-shift pads shift by themselves, so they never offer buttons.
    return this.zone && !this.zone.auto ? this.zone.allow : [];
  }

  /** Back to the latest checkpoint, without counting a fall (the RESET button). */
  respawn(): void {
    this.respawnTimer = -1;
    this.zone = null;
    this.features.respawn();
    this.camera.lean = null;
    this.setFrame(this.respawnFrame);
    this.ball.teleport(this.respawnPoint);
    this.camera.snap(this.frame, this.respawnPoint);
    this.physics.resetAccumulator();
  }

  pause(): void {
    if (this.state === 'playing') this.state = 'paused';
    this.audio.setRolling(0, false);
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.lastTime = performance.now();
    this.physics.resetAccumulator();
    this.input.tilt.resetFilter();
  }

  toMenu(): void {
    this.state = 'menu';
  }

  requestShift(dir: ShiftDirection): boolean {
    if (this.state !== 'playing' || !this.levels.level?.allowShifts) return false;
    if (this.respawnTimer >= 0) return false;
    if (this.camera.transitioning) return false;
    if (!this.availableShifts().includes(dir) && !this.zone?.auto) return false;
    if (!this.ball.grounded && this.ball.airTime > COYOTE_TIME) {
      this.events.onShiftRejected?.('Land on a surface to shift');
      return false;
    }
    if (this.zone?.lean) this.camera.lean = v3(this.zone.lean);
    this.setFrame(this.frame.shifted(dir));
    // Keep momentum but drop spin: otherwise the old rolling spin grips the new surface and
    // flings the ball sideways on landing, which reads as random rather than skilful.
    this.ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.camera.transitionTo(this.frame);
    this.stats.shifts++;
    this.audio.shift();
    this.haptics.shift();
    this.events.onShift?.(dir, this.surfaceName);
    return true;
  }

  private setFrame(def: GravityFrameDef): void {
    this.frame.set(def);
    this.applyGravity();
    this.view.setGravityDirection(this.frame.down);
  }

  private applyGravity(): void {
    const g = this.frame.down.clone().multiplyScalar(GRAVITY * this.gravityScale);
    this.physics.world.gravity = { x: g.x, y: g.y, z: g.z };
  }

  private applySettings(s: Readonly<Settings>): void {
    this.input.setMode(s.controlMode);
    this.input.tilt.shape.sensitivity = s.tiltSensitivity;
    this.input.tilt.shape.deadZoneDeg = s.deadZoneDeg;
    this.input.tilt.smoothing = s.smoothing;
    const tuning = PROFILES[s.physics] ?? PROFILES.refined;
    this.ball.applyTuning(tuning);
    this.ball.setSkin(orbAvailable(s) ? s.ball : 'chrome');
    this.input.tilt.shape.maxTiltDeg = tuning.maxTiltDeg;
    this.input.tilt.shape.curve = tuning.tiltCurve;
    this.view.setQuality(s.graphics);
    this.audio.enabled = s.sfx;
    this.haptics.enabled = s.haptics;
  }

  private loop = (now: number): void => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.elapsed += dt;

    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    let alpha = 1;
    if (this.state === 'playing' || this.state === 'complete') {
      alpha = this.physics.advance(
        dt,
        (step) => {
          this.levels.stepMovers(step);
          // Ride platforms carry the sphere with them (friction alone lets it roll off the back).
          const carry = this.frame.down.y < -0.5 ? this.levels.platformCarry(this.ball.position, BALL_RADIUS) : null;
          if (carry) {
            const t = this.ball.body.translation();
            this.ball.body.setTranslation({ x: t.x + carry.x, y: t.y + carry.y, z: t.z + carry.z }, true);
          }
          this.features.step(step, this.ball.position);
          // Gravity wells scale gravity while the ball is inside them.
          const scale = this.features.gravityScale(this.ball.position);
          if (scale !== this.gravityScale) {
            this.gravityScale = scale;
            this.applyGravity();
          }
          const move = this.state === 'playing' && this.respawnTimer < 0 ? this.input.sample(step) : ([0, 0] as [number, number]);
          let mod = this.features.surface(this.ball.position, this.ball.grounded, this.frame.down.y < -0.5, this.ball.body);
          // Holes tug the sphere in when it rolls over their edge (not while it rides a platform across one,
          // or while a conveyor or boost pad is already pushing it).
          const pull = this.frame.down.y < -0.5 && !carry && !mod.push ? this.features.holePull(this.ball.position, this.ball.grounded) : null;
          if (pull) mod = { ...mod, push: mod.push ? mod.push.clone().add(pull) : pull };
          // Rolling off into a hole: drop at once. Real gravity alone let a fast sphere cross a
          // 2 m hole before it sank below the far rim. Only for a sphere that just rolled off the
          // floor: not one resting on a bridge, crumble tile or platform over a hole cell, nor one
          // flying over on a jump pad.
          if (this.frame.down.y < -0.5 && !carry && !this.ball.grounded && this.ball.airTime < HOLE_GRAB_WINDOW && this.features.overHole(this.ball.position)) {
            const v = this.ball.body.linvel();
            // v.y > 1: launched upward by a jump pad, leave it alone.
            if (v.y > -HOLE_DROP_SPEED && v.y < 1) this.ball.body.setLinvel({ x: v.x * HOLE_DRAG, y: -HOLE_DROP_SPEED, z: v.z * HOLE_DRAG }, true);
          }
          // Glide chutes (multi-level boards): more air control while dropping, to steer onto the landing.
          if (!this.ball.grounded) {
            const steer = this.features.steerAt(this.ball.position);
            if (steer !== 1) {
              mod = { ...mod, accel: mod.accel * steer };
              // ...and a gentle, capped fall speed, so there is time to steer.
              const v = this.ball.body.linvel();
              const d = this.frame.down;
              const fall = v.x * d.x + v.y * d.y + v.z * d.z;
              if (fall > GLIDE_FALL_SPEED) {
                const k = fall - GLIDE_FALL_SPEED;
                this.ball.body.setLinvel({ x: v.x - d.x * k, y: v.y - d.y * k, z: v.z - d.z * k }, true);
              }
            }
          }
          this.ball.applyInput(move, this.frame, step, mod);
        },
        () => {
          this.ball.recordState();
          this.frameImpact = Math.max(this.frameImpact, this.ball.lastImpact);
        },
      );
      if (this.frameImpact > IMPACT_THRESHOLD && this.respawnTimer < 0) {
        this.audio.impact(this.frameImpact);
        this.haptics.impact(this.frameImpact);
      }
      this.frameImpact = 0;
      if (this.state === 'playing') this.updateRules(dt);
    }

    this.audio.setRolling(this.state === 'playing' ? this.ball.speed : 0, this.ball.grounded);
    this.ball.render(alpha, dt, this.view.camera, this.view.renderer);
    this.camera.update(dt, this.ball.mesh.position, this.ball.body.linvel(), this.frame, this.ball.grounded, this.ball.collider);
    this.levels.update(dt, this.elapsed);
    this.levels.setGhost(this.camera.ceilingView);
    this.levels.updateTiers(this.ball.mesh.position, dt);
    this.features.update(dt, this.elapsed);
    this.view.ballLight.position.copy(this.ball.mesh.position).addScaledVector(this.frame.up, 6);
    this.view.ballLight.target.position.copy(this.ball.mesh.position);
    this.view.update(dt, this.ball.mesh.position);
    this.view.render();
  };

  private updateRules(dt: number): void {
    if (this.respawnTimer >= 0) {
      this.respawnTimer += dt;
      if (this.respawnTimer >= RESPAWN_DELAY) this.respawn();
      return;
    }
    this.stats.time += dt;
    const p = this.ball.position;

    if (this.levels.isOutOfBounds(p) || this.levels.inHazard(p) || this.features.inLaser(p)) {
      this.stats.falls++;
      this.respawnTimer = 0;
      this.audio.fall();
      this.haptics.warning();
      this.events.onFall?.();
      return;
    }

    const zone = this.levels.shiftZoneAt(p, this.frame.down);
    if (zone !== this.zone) {
      this.zone = zone;
      if (zone) {
        this.audio.zone();
        if (zone.auto) this.requestShift(zone.allow[0]);
        else this.events.onZoneEnter?.(zone);
      }
    }

    if (this.features.checkSwitches(p)) {
      this.audio.checkpoint();
      this.haptics.success();
      this.events.onSwitch?.();
    }

    for (const c of this.levels.checkpoints) {
      if (c.active) continue;
      const surfacePoint = v3(c.def.position);
      if (surfacePoint.distanceTo(p) < 1.4) {
        for (const o of this.levels.checkpoints) o.active = false;
        c.active = true;
        this.respawnFrame = c.def.frame;
        const up = v3(c.def.frame.down).negate();
        this.respawnPoint.copy(surfacePoint).addScaledVector(up, BALL_RADIUS + 0.1);
        this.audio.checkpoint();
        this.haptics.success();
        this.events.onCheckpoint?.();
      }
    }

    const goal = this.levels.goal;
    if (goal && goal.centre.distanceTo(p) < 1.4) this.complete();
  }

  private complete(): void {
    this.state = 'complete';
    this.levels.goal?.celebrate();
    this.audio.goal();
    this.haptics.success();
    const def = this.levels.level!;
    const { time, falls } = this.stats;
    // Stars reward clean, fast navigation. Gravity shifts deliberately don't count.
    const stars = falls === 0 && time <= def.par.three ? 3 : falls <= 2 && time <= def.par.two ? 2 : 1;
    const key = `record:${def.id}`;
    const prev = this.save.load<LevelRecord>(key, { bestTime: null, bestStars: 0 });
    const newBest = prev.bestTime === null || time < prev.bestTime;
    const record: LevelRecord = { bestTime: newBest ? time : prev.bestTime, bestStars: Math.max(prev.bestStars, stars) };
    this.save.save(key, record);
    this.events.onComplete?.({ ...this.stats }, stars, record, newBest);
  }
}
