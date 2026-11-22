import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { WORLDS } from '../src/levels/worlds';
import { BOARDS, achievements, boardCatalog, centiseconds, levelBoardId } from '../src/gamecenter/catalog';
import { EMPTY_STATS, achievementProgress, backfillClean, recordRun, type Best, type RunResult } from '../src/gamecenter/progress';
import { weekEnds, weekNumber, weeklyLevel, weeklyPool } from '../src/gamecenter/weekly';

const CATALOG = new URL('../tools/gamecenter/catalog.json', import.meta.url);

/** What App Store Connect needs, as tools/gamecenter/setup.py reads it. */
function catalogJson(): string {
  const { boards, sets } = boardCatalog(WORLDS);
  const achs = achievements(WORLDS).map(({ id, name, points, goal, earned }) => ({ id, name, points, goal, earned }));
  return JSON.stringify({ boards, sets, achievements: achs }, null, 2) + '\n';
}

describe('Game Center catalog', () => {
  const { boards, sets } = boardCatalog(WORLDS);
  const achs = achievements(WORLDS);

  it('fits Game Center limits: 500 boards, 100 sets, 100 boards per set, every board in a set', () => {
    expect(boards.length).toBe(WORLDS.reduce((n, w) => n + w.levels.length, 0) + 3);
    expect(boards.length).toBeLessThanOrEqual(500);
    expect(sets.length).toBeLessThanOrEqual(100);
    for (const s of sets) expect(s.boards.length).toBeLessThanOrEqual(100);
    const inSets = new Set(sets.flatMap((s) => s.boards));
    for (const b of boards) expect(inSets.has(b.id)).toBe(true);
  });

  it('uses unique, short, plain IDs', () => {
    const ids = [...boards.map((b) => b.id), ...sets.map((s) => s.id), ...achs.map((a) => a.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id.length).toBeLessThanOrEqual(100);
      expect(id).toMatch(/^gravitor\.[a-z0-9._]+$/i);
    }
    expect(levelBoardId('w11-first-drop')).toBe('gravitor.time.w11_first_drop');
  });

  it('keeps achievements within 1000 points (100 each at most)', () => {
    const total = achs.reduce((n, a) => n + a.points, 0);
    expect(total).toBeLessThanOrEqual(1000);
    for (const a of achs) expect(a.points).toBeGreaterThan(0), expect(a.points).toBeLessThanOrEqual(100);
    expect(achs.find((a) => a.id === 'gravitor.ach.dark_clean')?.goal).toMatch(/World 15/);
  });

  it('times are hundredths of a second', () => {
    expect(centiseconds(12.345)).toBe(1235);
    expect(boards.find((b) => b.id === BOARDS.weekly)?.recurring?.days).toBe(7);
  });

  it('tools/gamecenter/catalog.json matches the game (GC_WRITE=1 npx vitest run tests/gamecenter.test.ts rewrites it)', () => {
    if (process.env.GC_WRITE) writeFileSync(CATALOG, catalogJson());
    expect(readFileSync(CATALOG, 'utf8')).toBe(catalogJson());
  });
});

const run = (over: Partial<RunResult>): RunResult => ({
  levelId: 'l1-first-roll', time: 10, falls: 0, fallsInLevel: 0, restarts: 0, shifts: 2, stars: 3, prevBest: null, prevStars: 0, ...over,
});

describe('competition stats', () => {
  it('counts clean runs, first tries, streaks, bests and comebacks', () => {
    let s = recordRun(EMPTY_STATS, run({}));
    expect(s.clean).toEqual(['l1-first-roll']);
    expect(s.firstTryClean).toEqual(['l1-first-roll']);
    expect(s.streak).toBe(1);
    s = recordRun(s, run({ levelId: 'a', restarts: 1 }));
    expect(s.firstTryClean).toHaveLength(1);
    expect(s.streak).toBe(2);
    s = recordRun(s, run({ levelId: 'b', falls: 0, fallsInLevel: 6 }));
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(2);
    expect(s.mostFallsBeaten).toBe(6);
    expect(s.clean).toContain('b');
    s = recordRun(s, run({ levelId: 'a', time: 8, prevBest: 9 }));
    expect(s.personalBests).toBe(1);
    expect(s.shifts).toBe(8);
  });

  it('turns stats into achievement progress', () => {
    const w15 = WORLDS.find((w) => w.id === 'w15')!;
    const records = new Map<string, Best>(w15.levels.map((l) => [l.id, { bestTime: 30, bestStars: 2 }]));
    const best = (id: string): Best => records.get(id) ?? { bestTime: null, bestStars: 0 };
    const half = { ...EMPTY_STATS, clean: w15.levels.slice(0, 5).map((l) => l.id) };
    const defs = achievements(WORLDS);
    let p = achievementProgress(defs, WORLDS, best, half);
    expect(p.get('gravitor.ach.dark_clean')).toBe(50);
    expect(p.get('gravitor.ach.world_15')).toBe(100);
    expect(p.get('gravitor.ach.first_clear')).toBe(100);
    expect(p.get('gravitor.ach.stars3_1')).toBe(0);
    p = achievementProgress(defs, WORLDS, best, { ...half, clean: w15.levels.map((l) => l.id) });
    expect(p.get('gravitor.ach.dark_clean')).toBe(100);
  });

  it('treats old 3-star clears as clean', () => {
    const id = WORLDS[0].levels[0].id;
    const s = backfillClean(EMPTY_STATS, WORLDS, (x) => (x === id ? { bestTime: 5, bestStars: 3 } : { bestTime: null, bestStars: 0 }));
    expect(s.clean).toEqual([id]);
  });
});

describe('weekly challenge', () => {
  it('changes level each Monday 00:00 UTC', () => {
    expect(weekNumber(Date.parse('2026-11-23T00:00:00Z'))).toBe(0);
    expect(weekNumber(Date.parse('2026-11-29T23:59:59Z'))).toBe(0);
    expect(weekNumber(Date.parse('2026-11-30T00:00:00Z'))).toBe(1);
    expect(new Date(weekEnds(0)).getUTCDay()).toBe(1);
  });

  it('only uses free worlds, the same order on every device, no repeats for a long time', () => {
    const free = new Set(WORLDS.slice(0, 11).flatMap((w) => w.levels.map((l) => l.id)));
    const pool = weeklyPool(WORLDS);
    expect(pool.length).toBeGreaterThan(100);
    for (const l of pool) expect(free.has(l.id)).toBe(true);
    expect(new Set(pool.map((l) => l.id)).size).toBe(pool.length);
    expect(weeklyLevel(WORLDS, 3).id).toBe(weeklyPool(WORLDS)[3].id);
  });
});
