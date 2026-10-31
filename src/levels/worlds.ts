import { world, THEMES, type WorldDef } from './worldTypes';
import { CORNERS, FIRST_ROLL, MIND_THE_GAP, MOVING_PARTS } from './campaign';
import { CROSSFIRE, EVENT_HORIZON, SWITCHBACK, TWIN_WALLS, WALL_WALK } from './campaignAdvanced';
import { ORBITAL_LABYRINTH } from './orbitalLabyrinth';
import * as W1 from './generated/world1';
import * as W2 from './generated/world2';
import * as W3 from './generated/world3';

/**
 * The campaign: worlds of ten levels, each built around one new idea.
 * Per world: 1-2 intro, 3-4 practice, 5 breather, 6-8 combine, 9 challenge, 10 finale.
 * Hand-made levels from earlier builds sit among the generated ones (tools/levelgen).
 */
export const WORLDS: WorldDef[] = [
  world('w1', 'Launch Deck', 'Tilt, corners, holes and mazes', THEMES.launch, [
    FIRST_ROLL, W1.WIDE_TURNS, CORNERS, W1.FIRST_MAZE, MIND_THE_GAP,
    W1.HOLE_PUNCH, W1.BRANCHES, W1.NARROW_WAYS, W1.LABYRINTH, W1.LAUNCH_FINALE,
  ]),
  world('w2', 'Piston Works', 'Pistons, energy strips and bridges', THEMES.piston, [
    MOVING_PARTS, W2.PISTON_ALLEY, W2.HOT_FLOOR, W2.OVERPASS, W2.COFFEE_BREAK,
    SWITCHBACK, W2.GEARS, W2.RED_LINE, CROSSFIRE, W2.PISTON_WORKS,
  ]),
  world('w3', 'Wall Walk', 'Gravity walls: shift left and right', THEMES.wall, [
    WALL_WALK, W3.SIDE_STEP, W3.WALL_RUN, W3.BOTH_WAYS, W3.EASY_RIDER,
    W3.WALL_MAZE, TWIN_WALLS, W3.HIGH_WIRE, EVENT_HORIZON, ORBITAL_LABYRINTH,
  ]),
];
