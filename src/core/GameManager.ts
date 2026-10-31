import * as THREE from 'three';
import { PhysicsManager } from '../physics/PhysicsManager';
import { SceneRenderer } from '../render/SceneRenderer';
import { InputManager } from '../input/InputManager';
import { BallController, BALL_RADIUS } from '../game/BallController';
import { CameraController } from '../game/CameraController';
import { GravityFrame, type ShiftDirection } from '../game/GravityFrame';
import { LevelManager, v3 } from '../game/LevelManager';
import { FeatureManager } from '../game/FeatureManager';
import type { GravityFrameDef, LevelDef, ShiftZoneDef } from '../levels/LevelTypes';
import type { SettingsManager, Settings } from '../settings/SettingsManager';
import { PROFILES } from '../game/PhysicsTuning';
import { AudioManager } from '../feedback/AudioManager';
import { HapticsManager } from '../feedback/HapticsManager';
import type { SaveManager } from '../settings/SaveManager';

export const GRAVITY = 14;
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
    return new GameManager(physics, view, input, ball, camera, levels, features, settings, save);
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
    this.camera.configure(def.camera);
    this.camera.seeThrough = this.levels.seeThrough;
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
    this.ball.setSkin(s.orbWon ? s.ball : 'chrome');
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
          this.features.step(step);
          // Gravity wells scale gravity while the ball is inside them.
          const scale = this.features.gravityScale(this.ball.position);
          if (scale !== this.gravityScale) {
            this.gravityScale = scale;
            this.applyGravity();
          }
          const move = this.state === 'playing' && this.respawnTimer < 0 ? this.input.sample(step) : ([0, 0] as [number, number]);
          const mod = this.features.surface(this.ball.position, this.ball.grounded, this.frame.down.y < -0.5, this.ball.body);
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
