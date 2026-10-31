import { world, THEMES, type WorldDef } from './worldTypes';
import { CORNERS, FIRST_ROLL, MIND_THE_GAP, MOVING_PARTS } from './campaign';
import { WALL_WALK } from './campaignAdvanced';
import { ORBITAL_LABYRINTH } from './orbitalLabyrinth';
import * as W1 from './generated/world1';
import * as W2 from './generated/world2';
import * as W3 from './generated/world3';
import * as W4 from './generated/world4';
import * as W5 from './generated/world5';
import * as W6 from './generated/world6';
import * as W7 from './generated/world7';
import * as W8 from './generated/world8';
import * as W9 from './generated/world9';
import * as W10 from './generated/world10';

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
    W2.SWITCHBACK2, W2.GEARS, W2.RED_LINE, W2.CROSSFIRE2, W2.PISTON_WORKS,
  ]),
  world('w3', 'Wall Walk', 'Gravity walls: shift left and right', THEMES.wall, [
    WALL_WALK, W3.SIDE_STEP, W3.WALL_RUN, W3.BOTH_WAYS, W3.EASY_RIDER,
    W3.WALL_MAZE, W3.TWIN_WALLS2, W3.HIGH_WIRE, W3.EVENT_HORIZON2, ORBITAL_LABYRINTH,
  ]),
  world('w4', 'Crumble Belt', 'Crumbling floors and moving platforms', THEMES.crumble, [
    W4.SOFT_GROUND, W4.FERRY, W4.FALLING_FLOOR, W4.CROSSING, W4.REST_STOP,
    W4.CRUMBLE_MAZE, W4.FERRY_LINES, W4.QUICK_FEET, W4.BREAKAWAY, W4.CRUMBLE_BELT,
  ]),
  world('w5', 'Flux Rails', 'Boost pads, conveyors, ice and sticky ground', THEMES.flux, [
    W5.BOOST_LANE, W5.ICE_RINK, W5.CONVEYOR, W5.SIDE_WIND, W5.GLIDE,
    W5.SLIPPERY_MAZE, W5.THIN_ICE, W5.FAST_LANE, W5.RAILS, W5.FLUX_RAILS,
  ]),
  world('w6', 'Skyward', 'Flip gravity onto glass ceilings', THEMES.skyward, [
    W6.UPSIDE_DOWN, W6.CEILING_WALK, W6.FLIP_MAZE, W6.AUTO_FLIP, W6.SKYLIGHT,
    W6.FLIP_AND_WALL, W6.HIGH_CEILING, W6.TOPSY, W6.SKY_MAZE, W6.SKYWARD,
  ]),
  world('w7', 'Circuit', 'Switches, doors and blinking lasers', THEMES.circuit, [
    W7.SWITCH_ON, W7.LASER_GATE, W7.LOCKED_MAZE, W7.RED_LIGHTS, W7.POWER_NAP,
    W7.DOUBLE_LOCK, W7.WIRING, W7.SHORT_CIRCUIT, W7.OVERLOAD, W7.CIRCUIT,
  ]),
  world('w8', 'Low Orbit', 'Jump pads, low gravity and automatic shifts', THEMES.orbit, [
    W8.HOP, W8.LOW_GRAVITY, W8.AUTOPILOT, W8.MOON_MAZE, W8.ORBIT_REST,
    W8.LONG_JUMP, W8.SLINGSHOT, W8.ZERO_G, W8.ESCAPE_VELOCITY, W8.LOW_ORBIT,
  ]),
  world('w9', 'Spin Cycle', 'Sweeping arms and turning discs', THEMES.spin, [
    W9.SWEEPER, W9.TURNTABLE, W9.SPIN_DOCTOR, W9.ROUNDABOUT, W9.MERRY_GO_ROUND,
    W9.WINDMILL, W9.GEARBOX, W9.CENTRIFUGE, W9.VORTEX, W9.SPIN_CYCLE,
  ]),
  world('w10', 'Event Horizon', 'Everything at once', THEMES.horizon, [
    W10.HORIZON_LINE, W10.MIXED_SIGNALS, W10.DARK_MATTER, W10.GRAVITY_WELL, W10.QUIET_ORBIT,
    W10.SINGULARITY, W10.ACCRETION, W10.REDSHIFT, W10.EVENT_HORIZON_X, W10.HORIZON,
  ]),
];
