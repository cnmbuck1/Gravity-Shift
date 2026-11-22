import type { WorldDef } from '../levels/worldTypes';
import type { AchievementDef } from './catalog';

/** A level's saved best (same shape as GameManager's LevelRecord). */
export interface Best {
  bestTime: number | null;
  bestStars: number;
}

/**
 * Competition stats saved on the device, beyond each level's best time and stars. They drive
 * the achievements and some of the affirmations, and work without Game Center too.
 */
export interface CompetitionStats {
  /** Levels ever finished without a fall. */
  clean: string[];
  /** Levels finished without a fall on the very first try (no earlier falls or restarts). */
  firstTryClean: string[];
  /** Campaign levels finished in a row without falling (a skip breaks it), and the longest such run. */
  streak: number;
  bestStreak: number;
  /** Gravity shifts made on finished runs. */
  shifts: number;
  /** Times a level's own best time was beaten (first clears don't count). */
  personalBests: number;
  /** Finished a level after falling at least this many times in it (largest so far). */
  mostFallsBeaten: number;
  /** Weekly Challenge weeks finished (week numbers, see weekly.ts). */
  weeks: number[];
}

export const EMPTY_STATS: CompetitionStats = {
  clean: [],
  firstTryClean: [],
  streak: 0,
  bestStreak: 0,
  shifts: 0,
  personalBests: 0,
  mostFallsBeaten: 0,
  weeks: [],
};

/** One finished campaign run, as the competition layer sees it. */
export interface RunResult {
  levelId: string;
  time: number;
  /** Falls in this run. */
  falls: number;
  /** Falls in this level since it was opened, across restarts. */
  fallsInLevel: number;
  /** Restarts since it was opened. */
  restarts: number;
  shifts: number;
  stars: number;
  /** Best time before this run (null: first clear). */
  prevBest: number | null;
  prevStars: number;
}

/** Folds one finished campaign run into the stats. Returns a new object. */
export function recordRun(s: CompetitionStats, r: RunResult): CompetitionStats {
  const clean = r.falls === 0;
  const firstTry = clean && r.fallsInLevel === 0 && r.restarts === 0 && r.prevBest === null;
  // The streak counts levels finished without any fall since they were opened.
  const streak = clean && r.fallsInLevel === 0 ? s.streak + 1 : 0;
  return {
    ...s,
    clean: clean && !s.clean.includes(r.levelId) ? [...s.clean, r.levelId] : s.clean,
    firstTryClean: firstTry && !s.firstTryClean.includes(r.levelId) ? [...s.firstTryClean, r.levelId] : s.firstTryClean,
    streak,
    bestStreak: Math.max(s.bestStreak, streak),
    shifts: s.shifts + r.shifts,
    personalBests: s.personalBests + (r.prevBest !== null && r.time < r.prevBest ? 1 : 0),
    mostFallsBeaten: Math.max(s.mostFallsBeaten, r.fallsInLevel),
  };
}

/** Adds a finished Weekly Challenge week. */
export function recordWeek(s: CompetitionStats, week: number): CompetitionStats {
  return s.weeks.includes(week) ? s : { ...s, weeks: [...s.weeks, week] };
}

/**
 * Players who already have 3-star clears from before this update: 3 stars needs a run with no
 * falls, so those levels count as clean.
 */
export function backfillClean(s: CompetitionStats, worlds: readonly WorldDef[], best: (id: string) => Best): CompetitionStats {
  const add = worlds.flatMap((w) => w.levels).filter((l) => best(l.id).bestStars === 3 && !s.clean.includes(l.id)).map((l) => l.id);
  return add.length ? { ...s, clean: [...s.clean, ...add] } : s;
}

export interface Totals {
  stars: number;
  levels: number;
}

export function totals(worlds: readonly WorldDef[], best: (id: string) => Best): Totals {
  let stars = 0;
  let levels = 0;
  for (const w of worlds) for (const l of w.levels) {
    const b = best(l.id);
    stars += b.bestStars;
    if (b.bestTime !== null) levels++;
  }
  return { stars, levels };
}

/** How far along each achievement is, 0-100. */
export function achievementProgress(defs: readonly AchievementDef[], worlds: readonly WorldDef[], best: (id: string) => Best, s: CompetitionStats): Map<string, number> {
  const t = totals(worlds, best);
  const pct = (have: number, need: number) => Math.min(100, Math.floor((have / Math.max(1, need)) * 100));
  const worldOf = (id: string) => worlds.find((w) => w.id === id);
  const out = new Map<string, number>();
  for (const d of defs) {
    const r = d.rule;
    let p = 0;
    switch (r.kind) {
      case 'levels': p = pct(t.levels, r.count); break;
      case 'stars': p = pct(t.stars, r.count); break;
      case 'threeStarLevel': p = worlds.some((w) => w.levels.some((l) => best(l.id).bestStars === 3)) ? 100 : 0; break;
      case 'perfectWorld':
        p = Math.max(0, ...worlds.map((w) => pct(w.levels.filter((l) => best(l.id).bestStars === 3).length, w.levels.length)));
        break;
      case 'world': {
        const w = worldOf(r.world);
        p = w ? pct(w.levels.filter((l) => best(l.id).bestTime !== null).length, w.levels.length) : 0;
        break;
      }
      case 'cleanWorld': {
        const w = worldOf(r.world);
        p = w ? pct(w.levels.filter((l) => s.clean.includes(l.id)).length, w.levels.length) : 0;
        break;
      }
      case 'clean': p = pct(s.clean.length, r.count); break;
      case 'firstTryClean': p = pct(s.firstTryClean.length, r.count); break;
      case 'cleanStreak': p = pct(s.bestStreak, r.count); break;
      case 'shifts': p = pct(s.shifts, r.count); break;
      case 'personalBests': p = pct(s.personalBests, r.count); break;
      case 'comeback': p = s.mostFallsBeaten >= r.falls ? 100 : 0; break;
      case 'weekly': p = pct(s.weeks.length, r.count); break;
    }
    out.set(d.id, p);
  }
  return out;
}
