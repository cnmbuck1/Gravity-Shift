import type { LevelDef, WorldTheme } from './LevelTypes';
import { MAZE_CAMERA } from './levelHelpers';

/**
 * Multi-level boards (prototype for the next batch of levels, Chris 2026-11-17): the course is
 * stacked floors. A teal-edged drop hole ('D') lets the ball fall to the floor below, where it lands
 * on a teal landing pad ('L'). While the ball is under a floor, that floor fades out so the view stays
 * clear. A glide chute (a well with `steer`) slows the fall and gives more air control, so the drop
 * itself becomes a balancing act: steer onto a small landing island before you hit the bottom.
 *
 * Floors sit 5 m apart: the gap fits the ball and the camera follows the whole drop.
 */
const FLOOR = { down: [0, -1, 0] as [number, number, number], forward: [0, 0, -1] as [number, number, number] };

/** Colours of the multi-level prototypes (a possible world: deep indigo, teal drops). */
export const DEPTHS_THEME: WorldTheme = { accent: '#7a8cff', sky: '#04040f', floor: '#646a86', wall: '#d2d6f0' };

/**
 * Two floors. Run the ring around an open atrium (the reactor glows red on the floor below:
 * fall in and it's over), drop through the trapdoor, then go either way round the reactor to the goal.
 */
export const TRAPDOOR: LevelDef = {
  id: 'ml-trapdoor',
  name: 'Trapdoor',
  subtitle: 'Multi-level · drop to the floor below',
  spawn: [5.5, 0.6, 4.5],
  frame: FLOOR,
  allowShifts: false,
  maze: {
    cell: 1,
    wallHeight: 0.9,
    floorY: 0,
    origin: [-7, -7],
    rows: [
      '###############', // 0  z -7
      '#.............#', // 1
      '#.............#', // 2
      '#..         ..#', // 3
      '#..         ..#', // 4
      '#..         ..#', // 5
      '#..         ..#', // 6
      '#..         ..#', // 7
      '#..         ..#', // 8
      '#..         ..#', // 9
      '#.....#.......#', // 10
      '#DD...#.....SS#', // 11
      '#DD...#.....SS#', // 12
      '###############', // 13 z 6
    ],
  },
  tiers: [
    {
      cell: 1,
      wallHeight: 0.9,
      floorY: -5,
      origin: [-7, -7],
      rows: [
        '###############', // 0  z -7
        '#..........GG.#', // 1
        '#..........GG.#', // 2
        '#..XXXXXXXXX..#', // 3
        '#..XXXXXXXXX..#', // 4
        '#..XXXXXXXXX..#', // 5
        '#..XXXXXXXXX..#', // 6
        '#..XXXXXXXXX..#', // 7
        '#..XXXXXXXXX..#', // 8
        '#..XXXXXXXXX..#', // 9
        '#.............#', // 10
        '#LL...........#', // 11
        '#LL...........#', // 12
        '###############', // 13 z 6
      ],
    },
  ],
  platforms: [],
  checkpoints: [{ position: [-5.5, -5, 4.5], frame: FLOOR }],
  goal: { position: [4.5, -5, -5.5], up: [0, 1, 0], facing: [0, 0, 1] },
  camera: MAZE_CAMERA,
  killY: -11,
  par: { three: 30, two: 50 },
  fallMargin: 6,
};

/**
 * Three floors. Thread the top floor to a trapdoor, work up the middle floor past two chasms,
 * then drop down the glide chute: the fall is slow and you can steer, and the only safe landing
 * is an island off to the right. Bridge to the goal.
 */
export const FREE_FALL: LevelDef = {
  id: 'ml-free-fall',
  name: 'Free Fall',
  subtitle: 'Multi-level · steer the drop onto the island',
  spawn: [3, 0.6, 9.5],
  frame: FLOOR,
  allowShifts: false,
  maze: {
    cell: 1,
    wallHeight: 0.9,
    floorY: 0,
    origin: [-5, 0],
    rows: [
      '###########', // 0  z 0
      '#DD.......#', // 1
      '#DD.......#', // 2
      '#######...#', // 3
      '#.........#', // 4
      '#...  ....#', // 5
      '#...  ....#', // 6
      '#...#######', // 7
      '#.........#', // 8
      '#......SSS#', // 9
      '#......SSS#', // 10
      '###########', // 11 z 11
    ],
  },
  tiers: [
    {
      cell: 1,
      wallHeight: 0.9,
      floorY: -5,
      origin: [-5, -12],
      rows: [
        '###########', // 0  z -12
        '#DD..CC..##', // 1
        '#DD..CC..##', // 2
        '#####  ..##', // 3
        '#####  ..##', // 4
        '#........##', // 5
        '#........##', // 6
        '#..  ######', // 7
        '#..  ######', // 8
        '#........##', // 9
        '#........##', // 10
        '######...##', // 11
        '######...##', // 12
        '#LL......##', // 13
        '#LL......##', // 14
        '###########', // 15 z 3
      ],
    },
    {
      cell: 1,
      wallHeight: 0.9,
      floorY: -10,
      origin: [-5, -16],
      rows: [
        '           ', // 0  z -16
        '     GGG   ', // 1
        '     GGG   ', // 2
        '     ..    ', // 3
        '     LLL   ', // 4
        '     LLL   ', // 5
        '     LLL   ', // 6
        '           ', // 7  z -9
      ],
    },
  ],
  // The glide chute under the second trapdoor: slow fall, strong air control.
  wells: [{ min: [-5, -9.4, -12.6], max: [2.6, -5.3, -9.6], scale: 0.3, steer: 2.6 }],
  platforms: [],
  checkpoints: [
    { position: [-3.5, -5, 1.5], frame: FLOOR },
    { position: [0.5, -5, -10.5], frame: FLOOR },
  ],
  goal: { position: [1, -10, -14.5], up: [0, 1, 0], facing: [0, 0, 1] },
  camera: MAZE_CAMERA,
  killY: -16,
  par: { three: 45, two: 70 },
  fallMargin: 6,
};

export const MULTI_LEVEL_PROTOTYPES: LevelDef[] = [TRAPDOOR, FREE_FALL].map((l) => ({ ...l, theme: DEPTHS_THEME }));
