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
import * as W11 from './generated/world11';
import * as W12 from './generated/world12';
import * as W13 from './generated/world13';
import * as W14 from './generated/world14';
import * as W15 from './generated/world15';
import * as W16 from './generated/world16';
import * as W17 from './generated/world17';
import * as W18 from './generated/world18';
import * as W19 from './generated/world19';
import * as W20 from './generated/world20';

/**
 * The campaign: worlds of ten levels, each built around one new idea.
 * Per world: 1-2 intro, 3-4 practice, 5 breather, 6-8 combine, 9 challenge, 10 finale.
 * Hand-made levels from earlier builds sit among the generated ones (tools/levelgen).
 */
export const WORLDS: WorldDef[] = [
  world('w1', 'Launch Deck', 'Tilt, corners, holes and mazes', THEMES.launch, [
    // Mind the Gap was 1-5; moved to 1-9 after Chris's playtest (2026-11-16), the four after it each move up one.
    FIRST_ROLL, W1.WIDE_TURNS, CORNERS, W1.FIRST_MAZE, W1.HOLE_PUNCH,
    W1.BRANCHES, W1.NARROW_WAYS, W1.LABYRINTH, MIND_THE_GAP, W1.LAUNCH_FINALE,
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
  // Worlds 11-20 (levels 101-200): tools/levelgen/worlds_11_20.py. Harder from the first level.
  world('w11', 'Depths', 'Multi-level boards: drop to the floor below', THEMES.depths, [
    W11.FIRST_DROP, W11.BASEMENT, W11.GLIDE_PATH, W11.THREE_FLOORS, W11.STAIRWELL,
    W11.SINKHOLE, W11.FREE_FALL, W11.UNDERCROFT, W11.ABYSS, W11.DEPTHS,
  ]),
  world('w12', 'Warp Gate', 'Warp gates: roll in, come out elsewhere', THEMES.warp, [
    W12.WARP_GATE, W12.JUMP_CUT, W12.WRONG_RING, W12.RELAY, W12.SHORTCUT,
    W12.PHASE_SHIFT, W12.MIRROR_HALL, W12.TELEPORTER, W12.WORMHOLE, W12.WARP_GATE_X,
  ]),
  world('w13', 'Vault', 'Collect every key to open the goal', THEMES.vault, [
    W13.FIRST_KEY, W13.KEY_RING, W13.LOCKSMITH, W13.STRONGROOM, W13.SPARE_KEY,
    W13.DEPOSIT_BOX, W13.MASTER_KEY, W13.SAFE_CRACKER, W13.BANK_JOB, W13.VAULT,
  ]),
  world('w14', 'Storm Front', 'Fans blow you toward the edge', THEMES.storm, [
    W14.BREEZE, W14.CROSSWIND, W14.WIND_TUNNEL, W14.GUSTS, W14.CALM,
    W14.UPDRAFT, W14.HEADWIND, W14.JET_STREAM, W14.CYCLONE, W14.STORM_FRONT,
  ]),
  world('w15', 'Blackout', 'The lights are out', THEMES.blackout, [
    W15.LIGHTS_OUT, W15.NIGHT_MAZE, W15.BLIND_CORNER, W15.GLOWWORM, W15.NIGHT_LIGHT,
    W15.DARK_SIDE, W15.ECLIPSE, W15.NEW_MOON, W15.PITCH_BLACK, W15.BLACKOUT,
  ]),
  world('w16', 'Pulse', 'Floors that pulse with energy', THEMES.pulse, [
    W16.HEARTBEAT, W16.RHYTHM, W16.PULSE_MAZE, W16.SYNCOPATION, W16.RESTING_RATE,
    W16.TEMPO, W16.DOUBLE_TIME, W16.ARRHYTHMIA, W16.FLATLINE, W16.PULSE,
  ]),
  world('w17', 'Deep Vault', 'Keys on every floor', THEMES.deepvault, [
    W17.KEY_DROP, W17.CELLAR_DOOR, W17.DEEP_STORAGE, W17.LOCKER_ROOM, W17.DUMBWAITER,
    W17.SAFE_DEPOSIT, W17.UNDERVAULT, W17.TREASURY, W17.BOTTOMLESS, W17.DEEP_VAULT,
  ]),
  world('w18', 'Warp Storm', 'Gates, fans and pulses together', THEMES.warpstorm, [
    W18.WARP_WIND, W18.STATIC, W18.THUNDERCLAP, W18.LIGHTNING, W18.DRIZZLE,
    W18.SUPERCELL, W18.MONSOON, W18.HAILSTORM, W18.TYPHOON, W18.WARP_STORM,
  ]),
  world('w19', 'Night Shift', 'Drops, gates and keys in the dark', THEMES.night, [
    W19.NIGHT_DROP, W19.MOONLIGHT, W19.NOCTURNE, W19.GRAVEYARD_SHIFT, W19.STARGAZER,
    W19.MIDNIGHT, W19.DEAD_OF_NIGHT, W19.WITCHING_HOUR, W19.NIGHTFALL, W19.NIGHT_SHIFT,
  ]),
  world('w20', 'Singularity', 'Everything, at the end of everything', THEMES.singularity, [
    W20.EVENT_ZERO, W20.GRAVITON, W20.TIDAL_FORCE, W20.EVENT_HORIZON_2, W20.QUIET_ZONE,
    W20.HAWKING, W20.DARK_ENERGY, W20.PERIHELION, W20.POINT_OF_NO_RETURN_2, W20.SINGULARITY_X,
  ]),
];
