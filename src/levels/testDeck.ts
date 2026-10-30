import type { LevelDef } from './LevelTypes';

/**
 * Milestone 1 control test bed: one large floating platform with a few pylons to bump
 * into, so tilt feel, momentum and collisions can be judged in isolation.
 */
export const TEST_DECK: LevelDef = {
  id: 'test-deck',
  name: 'Test Deck',
  subtitle: 'Tilt sandbox · no goal',
  spawn: [0, 1, 8],
  frame: { down: [0, -1, 0], forward: [0, 0, -1] },
  allowShifts: false,
  platforms: [{ position: [0, -0.5, 0], size: [12, 1, 26], role: 'safe' }],
  pylons: [
    { position: [-3.2, 0, -1], radius: 0.45, height: 1.2 },
    { position: [3.2, 0, -4], radius: 0.45, height: 1.2 },
    { position: [0, 0, -7.5], radius: 0.45, height: 1.2 },
  ],
  fallMargin: 10,
};
