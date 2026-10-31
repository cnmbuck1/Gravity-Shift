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
}

/** Volume in which a gravity shift is allowed, and which way. */
export interface ShiftZoneDef {
  min: V3;
  max: V3;
  allow: ('left' | 'right' | 'forward')[];
  /** Only active while gravity points this way (so a zone on a wall ignores floor traffic). */
  whenDown?: V3;
  /** Short hint shown when the ball enters. */
  hint: string;
}

export interface CameraDef {
  pitchDeg: number;
  distance: number;
  /** Maximum metres of look-ahead along the ball's direction of travel. */
  lookAhead: number;
  /** Constant metres the view is shifted forward, so the ball sits a little below centre. */
  forwardBias?: number;
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
}
