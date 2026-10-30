import type { LevelDef } from './LevelTypes';

/**
 * Gravity-shift proof of concept.
 *
 *  1. Start floor (y = 0), normal gravity. It ends in a wide gap you cannot roll across.
 *  2. A tall purple wall runs along the right side (inner face x = 4) and spans the gap.
 *     SHIFT RIGHT → gravity points +x, the wall becomes the floor.
 *  3. Roll along the wall (a checkpoint pad sits on it). The wall ends in a red edge.
 *  4. A purple ceiling (underside y = 9) hangs over the far end. While under it,
 *     SHIFT RIGHT again → gravity points +y, you "fall" up onto the ceiling.
 *  5. The goal portal stands on the ceiling.
 *
 * Shifting in the wrong place drops you into the void, which is the puzzle.
 */
export const SHIFT_PROOF: LevelDef = {
  id: 'shift-proof',
  name: 'Gravity Shift',
  subtitle: 'Proof of concept',
  spawn: [0, 1, 12],
  frame: { down: [0, -1, 0], forward: [0, 0, -1] },
  allowShifts: true,
  platforms: [
    // 1. Start floor, ends at z = 3. Beyond it is the gap.
    { position: [0, -0.5, 8.5], size: [8, 1, 11], role: 'safe' },
    // Low red lip at the end of the start floor, signalling "no way through".
    { position: [0, 0.15, 3.25], size: [8, 0.3, 0.5], role: 'hazard' },
    // 2. The wall. Inner (playable) face at x = 4, spans y -3..8 and z -15..14.
    { position: [4.5, 2.5, -0.5], size: [1, 11, 29], role: 'gravity' },
    // 3. Red edge where the wall ends, visible from the wall.
    { position: [3.85, 2.5, -15.25], size: [0.3, 11, 0.5], role: 'hazard' },
    // 4. Ceiling. Underside at y = 9, spans x -4..4, z -26..-7.
    { position: [0, 9.5, -16.5], size: [8, 1, 19], role: 'gravity' },
  ],
  pylons: [
    // Pylons on the start floor teach steering before the first shift.
    { position: [-2, 0, 9], radius: 0.4, height: 1.1 },
    { position: [1.6, 0, 6], radius: 0.4, height: 1.1 },
    // Pylons on the wall (pointing -x out of the wall face) to steer around.
    { position: [4, 2, -4], radius: 0.4, height: 1.1, axis: [-1, 0, 0] },
    { position: [4, 5.5, -8], radius: 0.4, height: 1.1, axis: [-1, 0, 0] },
  ],
  checkpoints: [{ position: [4, 3.5, 1], frame: { down: [1, 0, 0], forward: [0, 0, -1] } }],
  goal: { position: [0, 9, -22], up: [0, -1, 0] },
  fallMargin: 9,
};
