import type { CameraDef, PlatformDef, V3 } from './LevelTypes';

/** Shared maze camera: elevated, steep, small look-ahead. */
export const MAZE_CAMERA: CameraDef = { pitchDeg: 64, distance: 17, lookAhead: 2.2, forwardBias: 1.2 };

/**
 * Ramp between two heights along the x axis, as a tilted slab.
 * The top surface runs from (xLow, yLow) to (xHigh, yHigh).
 */
export function rampX(xLow: number, yLow: number, xHigh: number, yHigh: number, z: number, width: number): PlatformDef {
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

