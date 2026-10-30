import type { LevelDef, PlatformDef, V3 } from './LevelTypes';

/**
 * Ramp between two heights along the x axis, as a tilted slab.
 * The top surface runs from (xLow, yLow) to (xHigh, yHigh).
 */
function rampX(xLow: number, yLow: number, xHigh: number, yHigh: number, z: number, width: number): PlatformDef {
  const t = 0.3;
  const dx = xHigh - xLow;
  const dy = yHigh - yLow;
  const len = Math.hypot(dx, dy);
  // Rotate about z so the slab's x axis lies along the slope (either way round).
  const angle = dx >= 0 ? Math.atan2(dy, dx) : Math.atan2(-dy, -dx);
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  const position: V3 = [(xLow + xHigh) / 2 - (nx * t) / 2, (yLow + yHigh) / 2 - (ny * t) / 2, z];
  return { position, size: [len, t, width], rotation: [0, 0, (angle * 180) / Math.PI], role: 'safe' };
}

const BRIDGE_Y = 0.8;
const BRIDGE_Z = -1;

/**
 * Orbital Labyrinth: benchmark maze for "80% labyrinth, 20% gravity".
 *
 * Route (no shifts needed): start bottom-left, east along the start corridor, north,
 * west past three holes, north, east past the sliding block, north, west over the
 * checkpoint, up a ramp and across a narrow raised bridge over a chasm, north through the
 * red energy strips, east, north, and west to the portal. About 150 m with 10+ turns.
 *
 * Optional gravity shortcut: the purple pad by the tall purple wall (east side, near the
 * start) lets you shift gravity RIGHT onto the wall. Roll north along the wall over the
 * chasm, then at the purple band near the far end shift LEFT to drop back into the maze.
 * Skips most of the course, but missing the drop sends you into the chasm.
 */
export const ORBITAL_LABYRINTH: LevelDef = {
  id: 'orbital-labyrinth',
  name: 'Orbital Labyrinth',
  subtitle: 'Benchmark maze',
  spawn: [-11, 0.6, 18],
  frame: { down: [0, -1, 0], forward: [0, 0, -1] },
  allowShifts: true,
  shiftZones: [
    { min: [9.5, 0, 9.5], max: [12.5, 2, 12.5], allow: ['right'], whenDown: [0, -1, 0], hint: 'GRAVITY ZONE · SHIFT ▶ ONTO THE WALL' },
    { min: [11, 0.2, -12.5], max: [12.6, 7.5, -9.5], allow: ['left'], whenDown: [1, 0, 0], hint: 'GRAVITY ZONE · SHIFT ◀ TO DROP IN' },
  ],
  maze: {
    cell: 1,
    wallHeight: 0.9,
    floorY: 0,
    origin: [-13, -20],
    rows: [
      '###########################', // 0
      '#GGG......................#', // 1
      '#GGG......................#', // 2
      '#GGG......................#', // 3
      '#######################...#', // 4
      '#######################...#', // 5
      '#######################...#', // 6
      '#######################...#', // 7
      '#......................PPP|', // 8
      '#......................PPP|', // 9
      '#......................PPP|', // 10
      '#...###################   |', // 11
      '#.XX###################   |', // 12
      '#...###################   |', // 13
      '#...###################   |', // 14
      '#XX.###################   |', // 15
      '#...###################   |', // 16
      '#...###################   |', // 17
      '#.....BBBBBBB...CCC..##   |', // 18
      '#.....BBBBBBB...CCC..##   |', // 19
      '#.....BBBBBBB...CCC..##   |', // 20
      '##################...##   |', // 21
      '##################...##   |', // 22
      '##################...##   |', // 23
      '#....................##   |', // 24
      '#....................##   |', // 25
      '#....................##   |', // 26
      '#...###################   |', // 27
      '#...###################   |', // 28
      '#...###################   |', // 29
      '#.....  ........  .....PPP|', // 30
      '#.....  ........  .....PPP|', // 31
      '#..........  ..........PPP|', // 32
      '#..........  .............|', // 33
      '#######################...#', // 34
      '#######################...#', // 35
      '#######################...#', // 36
      '#SSS......................#', // 37
      '#SSS......................#', // 38
      '#SSS......................#', // 39
      '###########################', // 40
    ],
  },
  platforms: [
    // Tall purple gravity wall along the east edge (inner face x = 12.5).
    { position: [13, 3, 0.5], size: [1, 8, 26], role: 'gravity' },
    // Purple band on the wall marking where to shift back down.
    { position: [12.52, 3.2, -11], size: [0.04, 6.2, 3], role: 'gravity' },
    // Ramp up, narrow raised bridge across the chasm, ramp down.
    rampX(2.5, 0, -0.5, BRIDGE_Y, BRIDGE_Z, 3),
    { position: [-4, BRIDGE_Y - 0.15, BRIDGE_Z], size: [7, 0.3, 1.4], role: 'safe' },
    rampX(-10.5, 0, -7.5, BRIDGE_Y, BRIDGE_Z, 3),
  ],
  movers: [
    // Amber block sliding across the eastbound corridor.
    { from: [-2, 0.45, 3.9], to: [-2, 0.45, 6.1], size: [1.2, 0.9, 0.9], period: 3.2 },
  ],
  checkpoints: [{ position: [4, 0, -1], frame: { down: [0, -1, 0], forward: [0, 0, -1] } }],
  goal: { position: [-11, 0, -18], up: [0, 1, 0], facing: [0, 0, 1] },
  camera: { pitchDeg: 58, distance: 16, lookAhead: 3 },
  killY: -3,
  par: { three: 50, two: 80 },
  fallMargin: 6,
};
