import * as THREE from 'three';
import { PhysicsManager } from '../physics/PhysicsManager';
import { SceneRenderer } from '../render/SceneRenderer';
import { InputManager } from '../input/InputManager';
import { BallController, BALL_RADIUS } from '../game/BallController';
import { CameraController } from '../game/CameraController';
import { GravityFrame, type ShiftDirection } from '../game/GravityFrame';
import { LevelManager, v3 } from '../game/LevelManager';
import type { GravityFrameDef, LevelDef, ShiftZoneDef } from '../levels/LevelTypes';
import type { SettingsManager, Settings } from '../settings/SettingsManager';
import type { SaveManager } from '../settings/SaveManager';

export const GRAVITY = 14;
const RESPAWN_DELAY = 0.7;
/** Short grace period after leaving a surface during which a shift is still allowed. */
const COYOTE_TIME = 0.15;

export type GameState = 'menu' | 'playing' | 'paused' | 'complete';

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
  onZoneEnter?(zone: ShiftZoneDef): void;
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

  private constructor(
    readonly physics: PhysicsManager,
    readonly view: SceneRenderer,
    readonly input: InputManager,
    readonly ball: BallController,
    readonly camera: CameraController,
    readonly levels: LevelManager,
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
    return new GameManager(physics, view, input, ball, camera, levels, settings, save);
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
    this.camera.configure(def.camera);
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
    this.respawnFrame = def.frame;
    this.respawnPoint.copy(v3(def.spawn));
    this.respawn();
    this.state = 'playing';
  }

  /** Shift directions available right now (drives which HUD buttons are shown). */
  availableShifts(): ShiftDirection[] {
    const def = this.levels.level;
    if (!def?.allowShifts) return [];
    if (!def.shiftZones) return ['left', 'forward', 'right'];
    return this.zone ? this.zone.allow : [];
  }

  /** Back to the latest checkpoint, without counting a fall (the RESET button). */
  respawn(): void {
    this.respawnTimer = -1;
    this.zone = null;
    this.setFrame(this.respawnFrame);
    this.ball.teleport(this.respawnPoint);
    this.camera.snap(this.frame, this.respawnPoint);
    this.physics.resetAccumulator();
  }

  pause(): void {
    if (this.state === 'playing') this.state = 'paused';
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
    if (!this.availableShifts().includes(dir)) return false;
    if (!this.ball.grounded && this.ball.airTime > COYOTE_TIME) {
      this.events.onShiftRejected?.('Land on a surface to shift');
      return false;
    }
    this.setFrame(this.frame.shifted(dir));
    // Keep momentum but drop spin: otherwise the old rolling spin grips the new surface and
    // flings the ball sideways on landing, which reads as random rather than skilful.
    this.ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.camera.transitionTo(this.frame);
    this.stats.shifts++;
    this.events.onShift?.(dir, this.surfaceName);
    return true;
  }

  private setFrame(def: GravityFrameDef): void {
    this.frame.set(def);
    const g = this.frame.down.clone().multiplyScalar(GRAVITY);
    this.physics.world.gravity = { x: g.x, y: g.y, z: g.z };
    this.view.setGravityDirection(this.frame.down);
  }

  private applySettings(s: Readonly<Settings>): void {
    this.input.setMode(s.controlMode);
    this.input.tilt.shape.sensitivity = s.tiltSensitivity;
    this.input.tilt.shape.deadZoneDeg = s.deadZoneDeg;
    this.input.tilt.smoothing = s.smoothing;
    this.view.setQuality(s.graphics);
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
          const move = this.state === 'playing' && this.respawnTimer < 0 ? this.input.sample(step) : ([0, 0] as [number, number]);
          this.ball.applyInput(move, this.frame, step);
        },
        () => this.ball.recordState(),
      );
      if (this.state === 'playing') this.updateRules(dt);
    }

    this.ball.render(alpha, dt);
    this.camera.update(dt, this.ball.mesh.position, this.ball.body.linvel(), this.frame, this.ball.collider);
    this.levels.update(dt, this.elapsed);
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

    if (this.levels.isOutOfBounds(p) || this.levels.inHazard(p)) {
      this.stats.falls++;
      this.respawnTimer = 0;
      this.camera.frozen = true;
      this.events.onFall?.();
      return;
    }

    const zone = this.levels.shiftZoneAt(p, this.frame.down);
    if (zone !== this.zone) {
      this.zone = zone;
      if (zone) this.events.onZoneEnter?.(zone);
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
        this.events.onCheckpoint?.();
      }
    }

    const goal = this.levels.goal;
    if (goal && goal.centre.distanceTo(p) < 1.4) this.complete();
  }

  private complete(): void {
    this.state = 'complete';
    this.levels.goal?.celebrate();
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
