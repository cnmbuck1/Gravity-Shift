import type { LevelDef } from './LevelTypes';
import { MAZE_CAMERA, rampX } from './levelHelpers';

/**
 * Levels 1–4: a gentle ramp into the labyrinth. Each introduces one idea:
 *  1 First Roll   — tilt to roll; wide corridors, no hazards.
 *  2 Corners      — tighter 3-wide corridors, many turns, a dead end, the first checkpoint.
 *  3 Mind the Gap — holes in the floor and a narrow two-wide passage.
 *  4 Moving Parts — red energy strips, sliding pistons, a ramp and raised bridge.
 * Level 5 is Orbital Labyrinth, which adds shortcuts and the gravity wall.
 * Grid cell (c, r) has its centre at (c + origin.x, r + origin.z).
 */
const FLOOR = { down: [0, -1, 0] as [number, number, number], forward: [0, 0, -1] as [number, number, number] };

export const FIRST_ROLL: LevelDef = {
  id: 'l1-first-roll',
  name: 'First Roll',
  subtitle: 'Tilt to roll',
  spawn: [-5.5, 0.6, 8],
  frame: FLOOR,
  allowShifts: false,
  maze: {
    cell: 1,
    wallHeight: 0.9,
    floorY: 0,
    origin: [-8, -12],
    rows: [
      '#################', // 0
      '#...........GGGG#', // 1
      '#...........GGGG#', // 2
      '#...........GGGG#', // 3
      '#...........GGGG#', // 4
      '#....############', // 5
      '#....############', // 6
      '#....############', // 7
      '#....############', // 8
      '#...............#', // 9
      '#...............#', // 10
      '#...............#', // 11
      '#...............#', // 12
      '############....#', // 13
      '############....#', // 14
      '############....#', // 15
      '############....#', // 16
      '############....#', // 17
      '#SSSS...........#', // 18
      '#SSSS...........#', // 19
      '#SSSS...........#', // 20
      '#SSSS...........#', // 21
      '#SSSS############', // 22
      '#################', // 23
    ],
  },
  platforms: [],
  goal: { position: [5.5, 0, -9.5], up: [0, 1, 0], facing: [0, 0, 1] },
  camera: MAZE_CAMERA,
  killY: -6,
  par: { three: 25, two: 45 },
  fallMargin: 6,
};

export const CORNERS: LevelDef = {
  id: 'l2-corners',
  name: 'Corners',
  subtitle: 'Turns, a dead end, your first checkpoint',
  spawn: [-6.5, 0.6, 10.5],
  frame: FLOOR,
  allowShifts: false,
  maze: {
    cell: 1,
    wallHeight: 0.9,
    floorY: 0,
    origin: [-9, -14],
    rows: [
      '###################', // 0
      '#..............GGG#', // 1
      '#..............GGG#', // 2
      '#..............GGG#', // 3
      '#...###########GGG#', // 4
      '#...###############', // 5
      '#...............###', // 6
      '#...............###', // 7
      '#...............###', // 8
      '#############...###', // 9
      '#############...###', // 10
      '#############...###', // 11
      '#####....CCC....###', // 12
      '#####....CCC....###', // 13
      '#####....CCC....###', // 14
      '#####...###########', // 15
      '#####...###########', // 16
      '#####...###########', // 17
      '#####.............#', // 18
      '#####.............#', // 19
      '#####.............#', // 20
      '#########...###...#', // 21
      '#########...###...#', // 22
      '#SSSS##########...#', // 23
      '#SSSS.............#', // 24
      '#SSSS.............#', // 25
      '#SSSS.............#', // 26
      '###################', // 27
    ],
  },
  platforms: [],
  checkpoints: [{ position: [1, 0, -1], frame: FLOOR }],
  goal: { position: [7, 0, -11.5], up: [0, 1, 0], facing: [0, 0, 1] },
  camera: MAZE_CAMERA,
  killY: -6,
  par: { three: 35, two: 60 },
  fallMargin: 6,
};

export const MIND_THE_GAP: LevelDef = {
  id: 'l3-mind-the-gap',
  name: 'Mind the Gap',
  subtitle: 'Holes and a narrow passage',
  spawn: [-7.5, 0.6, 11],
  frame: FLOOR,
  allowShifts: false,
  maze: {
    cell: 1,
    wallHeight: 0.9,
    floorY: 0,
    origin: [-10, -15],
    rows: [
      '#####################', // 0
      '################GGGG#', // 1
      '################GGGG#', // 2
      '################GGGG#', // 3
      '################....#', // 4
      '###.................#', // 5
      '###.................#', // 6
      '###........  .......#', // 7
      '###........  .......#', // 8
      '###..################', // 9
      '###..################', // 10
      '###..################', // 11
      '###..################', // 12
      '###...###############', // 13
      '###...  ....  ......#', // 14
      '###...  ....  ......#', // 15
      '###.................#', // 16
      '###.....  ..........#', // 17
      '###.....  ..........#', // 18
      '################  ..#', // 19
      '################  ..#', // 20
      '################....#', // 21
      '################CCCC#', // 22
      '################CCCC#', // 23
      '#SSSS....  .........#', // 24
      '#SSSS....  .........#', // 25
      '#SSSS.........  ....#', // 26
      '#SSSS.........  ....#', // 27
      '#SSSS################', // 28
      '#####################', // 29
    ],
  },
  platforms: [],
  checkpoints: [{ position: [7.5, 0, 7.5], frame: FLOOR }],
  goal: { position: [7.5, 0, -13], up: [0, 1, 0], facing: [0, 0, 1] },
  camera: MAZE_CAMERA,
  killY: -6,
  par: { three: 35, two: 60 },
  fallMargin: 6,
};

const L4_BRIDGE_Y = 0.8;
export const MOVING_PARTS: LevelDef = {
  id: 'l4-moving-parts',
  name: 'Moving Parts',
  subtitle: 'Pistons, energy strips, a raised bridge',
  spawn: [-8.5, 0.6, 11],
  frame: FLOOR,
  allowShifts: false,
  maze: {
    cell: 1,
    wallHeight: 0.9,
    floorY: 0,
    origin: [-11, -15],
    rows: [
      '#######################', // 0
      '#GGGG##################', // 1
      '#GGGG.................#', // 2
      '#GGGG.................#', // 3
      '#GGGG.................#', // 4
      '#GGGG##############...#', // 5
      '###################...#', // 6
      '###################...#', // 7
      '###################...#', // 8
      '###################...#', // 9
      '###################...#', // 10
      '#####......BBBBB......#', // 11
      '#####......BBBBB......#', // 12
      '#####......BBBBB......#', // 13
      '#####...###############', // 14
      '#####...###############', // 15
      '#####...###############', // 16
      '#####...###############', // 17
      '#####.........X.......#', // 18
      '#####.....X...X.......#', // 19
      '#####.....X...........#', // 20
      '###################...#', // 21
      '###################...#', // 22
      '###################...#', // 23
      '#SSSS##############...#', // 24
      '#SSSS.................#', // 25
      '#SSSS.................#', // 26
      '#SSSS.................#', // 27
      '#SSSS##################', // 28
      '#######################', // 29
    ],
  },
  platforms: [
    rampX(-3.5, 0, -0.5, L4_BRIDGE_Y, -3, 3),
    { position: [2.0, L4_BRIDGE_Y - 0.15, -3], size: [5, 0.3, 2.2], role: 'safe' },
    rampX(7.5, 0, 4.5, L4_BRIDGE_Y, -3, 3),
  ],
  movers: [
    { from: [0, 0.45, 10], to: [0, 0.45, 12], size: [1.3, 0.9, 0.9], period: 3.6 },
    { from: [8, 0.45, -8], to: [10, 0.45, -8], size: [0.9, 0.9, 1.3], period: 3.2, phase: 0.5 },
  ],
  checkpoints: [{ position: [-5, 0, 4], frame: FLOOR }],
  goal: { position: [-8.5, 0, -12], up: [0, 1, 0], facing: [0, 0, 1] },
  camera: MAZE_CAMERA,
  killY: -6,
  par: { three: 45, two: 75 },
  fallMargin: 6,
};
