import RAPIER from '@dimforge/rapier3d-compat';

export type Rapier = typeof RAPIER;

export const FIXED_DT = 1 / 60;
/** Upper bound on catch-up steps per frame so a long hitch can't spiral. */
const MAX_STEPS_PER_FRAME = 5;

/**
 * Owns the Rapier world and the fixed-timestep accumulator. Rendering never touches physics
 * directly: it reads interpolated transforms that the game objects record each step.
 */
export class PhysicsManager {
  readonly world: RAPIER.World;
  private accumulator = 0;

  private constructor(readonly rapier: Rapier) {
    this.world = new rapier.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_DT;
    // A couple of extra solver iterations keep the rolling contact stable at speed.
    this.world.numSolverIterations = 6;
  }

  static async create(): Promise<PhysicsManager> {
    await RAPIER.init();
    return new PhysicsManager(RAPIER);
  }

  /**
   * Advances the simulation by real elapsed time in fixed steps.
   * `beforeStep` runs before every step (apply forces); returns the interpolation alpha.
   */
  advance(frameDt: number, beforeStep: (dt: number) => void, afterStep: () => void): number {
    this.accumulator += Math.min(frameDt, MAX_STEPS_PER_FRAME * FIXED_DT);
    while (this.accumulator >= FIXED_DT) {
      beforeStep(FIXED_DT);
      this.world.step();
      afterStep();
      this.accumulator -= FIXED_DT;
    }
    return this.accumulator / FIXED_DT;
  }

  resetAccumulator(): void {
    this.accumulator = 0;
  }
}
