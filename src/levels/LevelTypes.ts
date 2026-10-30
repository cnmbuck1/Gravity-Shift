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

export interface LevelDef {
  id: string;
  name: string;
  subtitle: string;
  spawn: V3;
  frame: GravityFrameDef;
  /** Whether the player may trigger gravity shifts in this level. */
  allowShifts: boolean;
  platforms: PlatformDef[];
  pylons?: PylonDef[];
  /** Touching a checkpoint pad makes it the respawn point (including its gravity frame). */
  checkpoints?: CheckpointDef[];
  /** Goal portal centre and the surface "up" it stands on. Omit for sandbox levels. */
  goal?: { position: V3; up: V3 };
  /** Distance outside the level's bounding box that counts as falling into the void. */
  fallMargin: number;
}
