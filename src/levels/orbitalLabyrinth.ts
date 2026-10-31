import type { LevelDef } from './LevelTypes';
import { MAZE_CAMERA, rampX } from './levelHelpers';

const BRIDGE_Y = 0.8;
const BRIDGE_Z = -4;

/**
 * Orbital Labyrinth (v0.3): benchmark maze for "80% labyrinth, 20% gravity".
 *
 * Main route, no shifts needed (~146 m): start plaza → east corridor → north → west
 * through the wide hall with three holes → up the narrow two-wide climb → east past the
 * sliding piston → north into the hub (checkpoint) → west up the ramp, across the narrow
 * raised bridge, down the far ramp → north through the red energy strips → east → north
 * → west into the goal plaza.
 *
 * Optional shortcuts:
 *  - Skywalk: from the hole hall, an unwalled 1.2 m catwalk straight north over a gap
 *    into the piston corridor. Saves ~20 m, risks a fall.
 *  - Gravity wall: the purple pad beside the tall purple wall allows SHIFT ▶ onto the wall.
 *    Roll north over the chasm and SHIFT ◀ at the purple band to drop in near the end.
 *
 * Grid: cell (c, r) has its centre at x = c - 13, z = r - 21.
 */
export const ORBITAL_LABYRINTH: LevelDef = {
  id: 'orbital-labyrinth',
  name: 'Orbital Labyrinth',
  subtitle: 'Shortcuts and the gravity wall',
  spawn: [-10.5, 0.6, 17],
  frame: { down: [0, -1, 0], forward: [0, 0, -1] },
  allowShifts: true,
  shiftZones: [
    { min: [9.5, 0, 7.5], max: [12.5, 2, 10.5], allow: ['right'], whenDown: [0, -1, 0], hint: 'GRAVITY ZONE · SHIFT ▶ ONTO THE WALL' },
    { min: [11, 0.2, -14.5], max: [12.6, 7.5, -11.5], allow: ['left'], whenDown: [1, 0, 0], hint: 'GRAVITY ZONE · SHIFT ◀ TO DROP IN' },
  ],
  maze: {
    cell: 1,
    wallHeight: 0.9,
    floorY: 0,
    origin: [-13, -21],
    rows: [
      '###########################', // 0
      '#GGGGG#####################', // 1
      '#GGGGG....................#', // 2
      '#GGGGG....................#', // 3
      '#GGGGG....................#', // 4
      '#GGGGG#################...#', // 5
      '#######################...#', // 6
      '#......................PPP|', // 7
      '#......................PPP|', // 8
      '#......................PPP|', // 9
      '#...###################   |', // 10
      '#.XX###################   |', // 11
      '#...###################   |', // 12
      '#XX.###################   |', // 13
      '#...###################   |', // 14
      '#...###################   |', // 15
      '#.....BBBBB...........#   |', // 16
      '#.....BBBBB...........#   |', // 17
      '#.....BBBBB......CCC..#   |', // 18
      '###############..CCC..#   |', // 19
      '###############..CCC..#   |', // 20
      '###############.......#   |', // 21
      '###############.......#   |', // 22
      '#....................##   |', // 23
      '#....................##   |', // 24
      '#....................##   |', // 25
      '#..########BBB#########   |', // 26
      '#..########BBB#########   |', // 27
      '#..########BBB#########   |', // 28
      '#.......  .......  ....PPP|', // 29
      '#.......  .......  ....PPP|', // 30
      '#......................PPP|', // 31
      '#............  ...........#', // 32
      '#............  ...........#', // 33
      '#######################...#', // 34
      '#######################...#', // 35
      '#SSSS##################...#', // 36
      '#SSSS.....................#', // 37
      '#SSSS.....................#', // 38
      '#SSSS.....................#', // 39
      '#SSSS######################', // 40
      '###########################', // 41
    ],
  },
  platforms: [
    // Tall purple gravity wall along the east edge (inner face x = 12.5).
    { position: [13, 3, -2], size: [1, 8, 25], role: 'gravity' },
    // Purple band on the wall marking where to shift back down.
    { position: [12.52, 3.2, -13], size: [0.04, 6.2, 3], role: 'gravity' },
    // Ramp up, narrow raised bridge across the chasm, ramp down.
    rampX(0.5, 0, -2.5, BRIDGE_Y, BRIDGE_Z, 3),
    { position: [-5, BRIDGE_Y - 0.15, BRIDGE_Z], size: [5, 0.3, 1.6], role: 'safe' },
    rampX(-10.5, 0, -7.5, BRIDGE_Y, BRIDGE_Z, 3),
    // Skywalk shortcut: unwalled catwalk over the gap between the hole hall and the piston corridor.
    { position: [-1, -0.15, 6], size: [1.2, 0.3, 3.2], role: 'safe' },
  ],
  movers: [
    // Piston sliding across the eastbound corridor.
    { from: [-6, 0.45, 1.95], to: [-6, 0.45, 4.05], size: [1.3, 0.9, 0.9], period: 3.4 },
  ],
  checkpoints: [{ position: [5, 0, -2], frame: { down: [0, -1, 0], forward: [0, 0, -1] } }],
  goal: { position: [-10, 0, -18], up: [0, 1, 0], facing: [0, 0, 1] },
  camera: MAZE_CAMERA,
  killY: -6,
  par: { three: 60, two: 95 },
  fallMargin: 6,
};
