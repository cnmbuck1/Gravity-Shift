export type V3 = [number, number, number];

/** Colour language: cyan safe, amber moving, red danger, purple gravity-shift surface. */
export type SurfaceRole = 'safe' | 'moving' | 'hazard' | 'gravity';

/**
 * A gravity frame: which way is "down" and which way is "forward" (away from the camera).
 * Both are axis-aligned unit vectors and must be perpendicular.
 */
export interface GravityFrameDef {
  down: V3;
  forward: V3;
}

export interface PlatformDef {
  /** Centre of the box. */
  position: V3;
  /** Full extents along x, y, z. */
  size: V3;
  role?: SurfaceRole;
  friction?: number;
  /** Euler rotation in degrees (XYZ). Used for ramps. */
  rotation?: V3;
  /** Drawn as translucent glass and ignored by the camera's anti-clipping (ceilings over flip crossings). */
  glass?: boolean;
}

export interface PylonDef {
  /** Base centre; the pylon extends along `axis` (defaults to +y). */
  position: V3;
  radius: number;
  height: number;
  axis?: V3;
}

export interface CheckpointDef {
  position: V3;
  frame: GravityFrameDef;
}

/**
 * Grid labyrinth. Each character is one square cell of `cell` metres, floor top at `floorY`.
 *   '#' wall      '.' floor        ' ' hole / chasm (no floor)
 *   'X' red energy floor (destroys the ball)
 *   'P' purple floor (marks a gravity zone; the zone itself is in `shiftZones`)
 *   'S' 'C' 'G' floor, labelled start / checkpoint / goal for readability
 *   'B' no floor and no wall, filled by explicit platforms (bridges, ramps)
 *   '|' nothing: an explicit platform occupies this cell
 * Row 0 is the far end of the maze (most negative z); column 0 is the left edge.
 */
export interface MazeDef {
  cell: number;
  wallHeight: number;
  floorY: number;
  /** World x/z of the centre of cell (0, 0). */
  origin: [number, number];
  rows: string[];
}

/** A block that slides back and forth between two points (kinematic: it pushes the ball). */
export interface MoverDef {
  from: V3;
  to: V3;
  size: V3;
  /** Seconds for a full there-and-back cycle. */
  period: number;
  /** 0..1 starting point in the cycle. */
  phase?: number;
  /** 'platform' is a flat cyan slab the ball rides across the void (default 'piston'). */
  kind?: 'piston' | 'platform';
}

/** Volume in which a gravity shift is allowed, and which way. */
export interface ShiftZoneDef {
  min: V3;
  max: V3;
  allow: ('left' | 'right' | 'forward' | 'flip')[];
  /** Only active while gravity points this way (so a zone on a wall ignores floor traffic). */
  whenDown?: V3;
  /** Short hint shown when the ball enters. */
  hint: string;
  /** Shift as soon as the ball enters (an auto-shift pad), using the first allowed direction. */
  auto?: boolean;
  /** World direction the camera leans toward after shifting here (keeps the view clear of the course). */
  lean?: V3;
}

export interface CameraDef {
  pitchDeg: number;
  distance: number;
  /** Maximum metres of look-ahead along the ball's direction of travel. */
  lookAhead: number;
  /** Constant metres the view is shifted forward, so the ball sits a little below centre. */
  forwardBias?: number;
}

/** Colour scheme of a world, applied to every level in it. */
export interface WorldTheme {
  /** Wall-top trim, floor glow and pad colour. */
  accent: string;
  /** Background and fog. */
  sky: string;
  /** Tint multiplied into the maze floor and walls. */
  floor: string;
  wall: string;
}

/** A floor tile that crumbles a moment after the ball rolls onto it (back on respawn). */
export interface CrumbleDef {
  /** Centre of the tile's top face. */
  position: V3;
  /** Width (x) and depth (z) in metres. */
  size: [number, number];
}

/**
 * A floor effect over a rectangle of floor (x/z, top at `y`).
 *  boost    : strong push along `dir` (a speed strip)
 *  conveyor : steady push along `dir`
 *  ice      : little grip; hard to steer or stop
 *  sticky   : heavy drag; slow but safe
 *  jump     : launches the ball upward (plus a push along `dir` if given)
 */
export interface PadDef {
  kind: 'boost' | 'conveyor' | 'ice' | 'sticky' | 'jump';
  min: [number, number];
  max: [number, number];
  y: number;
  dir?: [number, number];
}

/** A red laser beam across a corridor that blinks on and off. */
export interface LaserDef {
  from: V3;
  to: V3;
  /** Seconds per on/off cycle. */
  period: number;
  /** Fraction of the cycle the beam is on. */
  on: number;
  phase?: number;
}

/** A floor switch that opens one or more doors (wall blocks that sink into the floor) for good. */
export interface SwitchDef {
  position: V3;
  doors: number[];
}

export interface DoorDef {
  /** Centre and size of the blocking box. */
  position: V3;
  size: V3;
}

/** Inside this box gravity is scaled (e.g. 0.35 for low gravity). */
export interface GravityWellDef {
  min: V3;
  max: V3;
  scale: number;
}

/** A spinning obstacle: an arm that sweeps a room, or a disc platform that turns over the void. */
export interface RotatorDef {
  kind: 'arm' | 'disc';
  /** Pivot (arm: on the floor; disc: centre of its top face). */
  centre: V3;
  /** Arm length tip to tip, or disc radius. */
  size: number;
  /** Radians per second (sign sets the direction). */
  speed: number;
  phase?: number;
}

export interface LevelDef {
  id: string;
  name: string;
  subtitle: string;
  spawn: V3;
  frame: GravityFrameDef;
  /** Whether the player may trigger gravity shifts in this level. */
  allowShifts: boolean;
  /** If present, shifts only work inside these zones. */
  shiftZones?: ShiftZoneDef[];
  maze?: MazeDef;
  movers?: MoverDef[];
  camera?: CameraDef;
  /** Falling below this height always counts as a fall (holes in a maze floor). */
  killY?: number;
  /** Star thresholds in seconds: 3 stars needs par3 and no falls, 2 stars needs par2 and at most 2 falls. */
  par: { three: number; two: number };
  platforms: PlatformDef[];
  pylons?: PylonDef[];
  /** Touching a checkpoint pad makes it the respawn point (including its gravity frame). */
  checkpoints?: CheckpointDef[];
  /** Goal portal centre and the surface "up" it stands on. Omit for sandbox levels. */
  goal?: { position: V3; up: V3; facing?: V3 };
  /** Distance outside the level's bounding box that counts as falling into the void. */
  fallMargin: number;
  theme?: WorldTheme;
  crumble?: CrumbleDef[];
  pads?: PadDef[];
  lasers?: LaserDef[];
  switches?: SwitchDef[];
  doors?: DoorDef[];
  wells?: GravityWellDef[];
  rotators?: RotatorDef[];
}
