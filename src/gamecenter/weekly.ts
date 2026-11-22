import type { LevelDef } from '../levels/LevelTypes';
import type { WorldDef } from '../levels/worldTypes';
import { WEEKLY_START } from './catalog';

/**
 * The Weekly Challenge: one level a week, the same for every player, with its own Game Center
 * board that restarts every Monday 00:00 UTC (the recurring board starts on WEEKLY_START too,
 * so the game's weeks and Game Center's line up).
 *
 * Levels come from the free worlds (1-11), skipping World 1's first few tutorials, in a fixed
 * shuffled order, so a level doesn't come round again until the whole pool has been used
 * (about two years).
 */

const WEEK_MS = 7 * 24 * 3600 * 1000;
const START_MS = Date.parse(WEEKLY_START);
/** Worlds that every player can play (paid packs start at World 12). */
const FREE_WORLDS = 11;
/** World 1's first levels are tutorials. */
const SKIP_TUTORIALS = 4;

/** Week number: 0 for the week starting WEEKLY_START. */
export function weekNumber(now = Date.now()): number {
  return Math.max(0, Math.floor((now - START_MS) / WEEK_MS));
}

/** When this week's challenge ends (next Monday 00:00 UTC). */
export function weekEnds(week: number): number {
  return START_MS + (week + 1) * WEEK_MS;
}

/** The levels the challenge rotates through, in their fixed order. */
export function weeklyPool(worlds: readonly WorldDef[]): LevelDef[] {
  const pool = worlds.slice(0, FREE_WORLDS).flatMap((w, wi) => (wi === 0 ? w.levels.slice(SKIP_TUTORIALS) : w.levels));
  // Deterministic shuffle (mulberry32), the same on every device.
  let seed = 0x6a7a1e;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

export function weeklyLevel(worlds: readonly WorldDef[], week: number): LevelDef {
  const pool = weeklyPool(worlds);
  return pool[week % pool.length];
}

/** "3d 4h", "5h 12m", "12m": time left until `end`. */
export function timeLeft(end: number, now = Date.now()): string {
  const m = Math.max(0, Math.floor((end - now) / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}
