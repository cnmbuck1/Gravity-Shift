import type { WorldDef } from '../levels/worldTypes';

/**
 * Everything Gravitor puts on Game Center: its leaderboard and achievement IDs, names and
 * scoring rules. App Store Connect must hold exactly these IDs (tools/gamecenter creates them
 * from catalog.json, which tests/gamecenter.test.ts keeps in step with this file).
 *
 * Game Center allows 100 leaderboards per app, or 500 when they are grouped into leaderboard
 * sets (100 sets at most, 100 leaderboards per set). Gravitor has 200 levels, so every level's
 * fastest-time board sits in its world's set (20 sets of 10) and the overall boards plus the
 * weekly challenge sit in an "Overall" set: 203 leaderboards in 21 sets.
 *
 * IDs are permanent once created, so level boards are keyed by the level's id (not its place
 * in the campaign): reordering levels or worlds never moves a score to another level.
 */

const PREFIX = 'gravitor';

/** Fastest time on one level (elapsed time to the hundredth, lowest wins). */
export function levelBoardId(levelId: string): string {
  return `${PREFIX}.time.${levelId.replace(/[^A-Za-z0-9]/g, '_')}`;
}

export const BOARDS = {
  /** All stars earned across the campaign (highest wins, 600 max). */
  totalStars: `${PREFIX}.total_stars`,
  /** Campaign levels finished (highest wins, 200 max). */
  levelsCompleted: `${PREFIX}.levels_completed`,
  /** Fastest time on this week's challenge level. A recurring board that restarts each Monday 00:00 UTC. */
  weekly: `${PREFIX}.weekly_challenge`,
} as const;

export function worldSetId(worldId: string): string {
  return `${PREFIX}.set.${worldId}`;
}
export const OVERALL_SET = `${PREFIX}.set.overall`;

/** What an achievement measures; progress is computed from the player's saved stats (see progress.ts). */
export type AchievementRule =
  | { kind: 'levels'; count: number }
  | { kind: 'world'; world: string }
  | { kind: 'stars'; count: number }
  | { kind: 'threeStarLevel' }
  | { kind: 'perfectWorld' }
  | { kind: 'clean'; count: number }
  | { kind: 'cleanWorld'; world: string }
  | { kind: 'firstTryClean'; count: number }
  | { kind: 'cleanStreak'; count: number }
  | { kind: 'shifts'; count: number }
  | { kind: 'personalBests'; count: number }
  | { kind: 'comeback'; falls: number }
  | { kind: 'weekly'; count: number };

export interface AchievementDef {
  id: string;
  name: string;
  /** Shown before it is earned. */
  goal: string;
  /** Shown once earned. */
  earned: string;
  points: number;
  rule: AchievementRule;
}

const a = (key: string, name: string, points: number, goal: string, earned: string, rule: AchievementRule): AchievementDef => ({
  id: `${PREFIX}.ach.${key}`,
  name,
  points,
  goal,
  earned,
  rule,
});

/** Names for the world-cleared achievements (World 1 first). */
const WORLD_BADGES = [
  'Cleared for Launch', 'Piston Proof', 'Wall Walker', 'Solid Ground', 'Rail Rider',
  'Sky Walker', 'Short Circuit', 'Escape Velocity', 'Spin Doctor', 'Beyond the Horizon',
  'Deep Diver', 'Gatekeeper', 'Vault Breaker', 'Storm Chaser', 'Lights Out',
  'In the Rhythm', 'Treasure Hunter', 'Eye of the Storm', 'Night Owl', 'Singularity',
];

/**
 * The achievements, at most 1000 points in all (Game Center's cap). 905 are used, so there is
 * room for new worlds.
 */
export function achievements(worlds: readonly WorldDef[]): AchievementDef[] {
  const list: AchievementDef[] = [
    a('first_clear', 'Lift-Off', 10, 'Finish your first level.', 'You finished your first level.', { kind: 'levels', count: 1 }),
    a('clean_1', 'Clean Orbit', 10, 'Finish a level without falling.', 'You finished a level without a single fall.', { kind: 'clean', count: 1 }),
    a('clean_25', 'Steady Hands', 25, 'Finish 25 levels without falling.', 'You finished 25 levels without falling.', { kind: 'clean', count: 25 }),
    a('clean_100', 'Untouchable', 50, 'Finish 100 levels without falling.', 'You finished 100 levels without falling.', { kind: 'clean', count: 100 }),
    a('first_try_10', 'Natural Talent', 25, 'Finish 10 levels on your first try without falling.', 'Ten levels, first try, no falls.', { kind: 'firstTryClean', count: 10 }),
    a('streak_5', 'In the Zone', 25, 'Finish 5 levels in a row without falling.', 'Five flawless levels in a row.', { kind: 'cleanStreak', count: 5 }),
    a('stars3_1', 'Triple Star', 10, 'Earn 3 stars on a level.', 'You earned 3 stars on a level.', { kind: 'threeStarLevel' }),
    a('stars_150', 'Star Collector', 25, 'Earn 150 stars.', 'You collected 150 stars.', { kind: 'stars', count: 150 }),
    a('stars_300', 'Constellation', 50, 'Earn 300 stars.', 'You collected 300 stars.', { kind: 'stars', count: 300 }),
    a('stars_all', 'Supernova', 100, 'Earn every star in the game.', 'Every star in the game is yours.', { kind: 'stars', count: worlds.reduce((n, w) => n + w.levels.length * 3, 0) }),
    a('perfect_world', 'Perfect World', 50, 'Earn 3 stars on every level of a world.', 'A whole world, all 3 stars.', { kind: 'perfectWorld' }),
    a('levels_100', 'Centurion', 25, 'Finish 100 levels.', 'You finished 100 levels.', { kind: 'levels', count: 100 }),
    a('levels_all', 'Gravitor Legend', 75, 'Finish every level.', 'You finished every level in Gravitor.', { kind: 'levels', count: worlds.reduce((n, w) => n + w.levels.length, 0) }),
    a('dark_clean', 'Night Vision', 75, 'Finish every World 15 level in the dark without falling.', 'You beat World 15 in the dark without a single fall.', { kind: 'cleanWorld', world: 'w15' }),
    a('shifts_250', 'Gravity Bender', 25, 'Shift gravity 250 times.', 'You bent gravity 250 times.', { kind: 'shifts', count: 250 }),
    a('pb_25', 'Always Faster', 25, 'Beat your own best time 25 times.', 'You beat your own best 25 times.', { kind: 'personalBests', count: 25 }),
    a('comeback', 'Never Give Up', 10, 'Finish a level after falling 5 times in it.', 'Five falls, and you still made it.', { kind: 'comeback', falls: 5 }),
    a('weekly_1', 'Weekly Contender', 15, 'Finish a Weekly Challenge.', 'You took on the Weekly Challenge.', { kind: 'weekly', count: 1 }),
    a('weekly_4', 'Weekly Regular', 25, 'Finish 4 different Weekly Challenges.', 'Four Weekly Challenges finished.', { kind: 'weekly', count: 4 }),
  ];
  worlds.forEach((w, i) => {
    const n = String(i + 1).padStart(2, '0');
    list.push(a(`world_${n}`, WORLD_BADGES[i] ?? `World ${i + 1} Cleared`, i < 10 ? 10 : 15, `Finish every level of World ${i + 1}, ${w.name}.`, `You cleared World ${i + 1}, ${w.name}.`, { kind: 'world', world: w.id }));
  });
  return list;
}

export interface BoardDef {
  id: string;
  name: string;
  /** ELAPSED_TIME_CENTISECOND: scores are hundredths of a second. INTEGER: plain counts. */
  format: 'ELAPSED_TIME_CENTISECOND' | 'INTEGER';
  sort: 'ASC' | 'DESC';
  /** Recurring boards only: restarts every 7 days from this UTC start. */
  recurring?: { start: string; days: number };
}

export interface SetDef {
  id: string;
  name: string;
  boards: string[];
}

/** First week of the Weekly Challenge (a Monday, 00:00 UTC). The game and the recurring board count weeks from here. */
export const WEEKLY_START = '2026-11-23T00:00:00Z';

/** Every leaderboard and set, as App Store Connect needs them. */
export function boardCatalog(worlds: readonly WorldDef[]): { boards: BoardDef[]; sets: SetDef[] } {
  const boards: BoardDef[] = [
    { id: BOARDS.totalStars, name: 'Total Stars', format: 'INTEGER', sort: 'DESC' },
    { id: BOARDS.levelsCompleted, name: 'Levels Completed', format: 'INTEGER', sort: 'DESC' },
    { id: BOARDS.weekly, name: 'Weekly Challenge', format: 'ELAPSED_TIME_CENTISECOND', sort: 'ASC', recurring: { start: WEEKLY_START, days: 7 } },
  ];
  const sets: SetDef[] = [{ id: OVERALL_SET, name: 'Overall', boards: boards.map((b) => b.id) }];
  worlds.forEach((w, wi) => {
    const ids: string[] = [];
    w.levels.forEach((l, li) => {
      const id = levelBoardId(l.id);
      ids.push(id);
      boards.push({ id, name: `${wi + 1}-${li + 1} ${l.name}`, format: 'ELAPSED_TIME_CENTISECOND', sort: 'ASC' });
    });
    sets.push({ id: worldSetId(w.id), name: `World ${wi + 1} · ${w.name}`, boards: ids });
  });
  return { boards, sets };
}

/** A run's time as a Game Center elapsed-time score (hundredths of a second). */
export function centiseconds(seconds: number): number {
  return Math.max(1, Math.round(seconds * 100));
}
