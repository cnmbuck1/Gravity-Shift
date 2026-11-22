import type { WorldDef } from '../levels/worldTypes';
import type { LevelDef } from '../levels/LevelTypes';
import type { SaveManager } from '../settings/SaveManager';
import { GameCenter, type RankEntry } from './GameCenter';
import { BOARDS, achievements, centiseconds, levelBoardId, type AchievementDef } from './catalog';
import { EMPTY_STATS, achievementProgress, backfillClean, recordRun, recordWeek, totals, type Best, type CompetitionStats, type RunResult } from './progress';
import { weekEnds, weekNumber, weeklyLevel } from './weekly';

/** What a board said about the player after a run. */
export interface RankNews {
  rank: number;
  total: number;
  /** The player's place before this run, when known. */
  before?: number;
  /** Friends this run moved the player past. */
  passed: string[];
  /** Next friend (or, failing that, player) to beat, and by how much. */
  next?: RankEntry & { gap: number; friend: boolean };
  /** Time board (gaps in seconds) or count board. */
  timed: boolean;
}

interface SavedRank {
  rank: number;
  friendsAhead: string[];
}

/**
 * Leaderboards, achievements and the Weekly Challenge. Keeps the stats behind them on the device
 * (so achievements and affirmations work offline and on the web build) and sends scores to Game
 * Center when the player is signed in. Never blocks the game: everything to Game Center is
 * fire-and-forget, and every failure is swallowed.
 */
export class Competition {
  readonly gc = new GameCenter();
  readonly achievementDefs: AchievementDef[];
  private stats: CompetitionStats;

  constructor(private save: SaveManager, private worlds: readonly WorldDef[], private best: (levelId: string) => Best) {
    this.achievementDefs = achievements(worlds);
    this.stats = backfillClean(save.load('competition', EMPTY_STATS), worlds, best);
    // Achievements already earned before this update shouldn't pop up as new on the next run.
    if (!save.load('competition:earned-init', { done: false }).done) {
      this.save.save('competition:earned', { ids: this.earnedNow() });
      this.save.save('competition:earned-init', { done: true });
    }
  }

  get streak(): number {
    return this.stats.streak;
  }

  /** Signs in to Game Center and brings its boards and achievements up to date with this device. */
  async init(): Promise<void> {
    if (!(await this.gc.authenticate())) return;
    const t = totals(this.worlds, this.best);
    void this.gc.submit([BOARDS.totalStars], t.stars);
    void this.gc.submit([BOARDS.levelsCompleted], t.levels);
    // Level times set before Game Center was added (or while offline) go up once.
    const synced = this.save.load<{ ids: string[] }>('competition:synced', { ids: [] });
    const toSync = this.worlds.flatMap((w) => w.levels).filter((l) => this.best(l.id).bestTime !== null && !synced.ids.includes(l.id));
    for (const l of toSync) void this.gc.submit([levelBoardId(l.id)], centiseconds(this.best(l.id).bestTime!));
    if (toSync.length) this.save.save('competition:synced', { ids: [...synced.ids, ...toSync.map((l) => l.id)] });
    this.reportAchievements();
  }

  /**
   * A campaign level was finished (its record is already saved). Updates the stats, sends the
   * scores, and returns the achievements this run earned (names) for the result screen.
   */
  campaignFinished(run: RunResult): string[] {
    this.stats = recordRun(this.stats, run);
    this.save.save('competition', this.stats);
    const best = this.best(run.levelId).bestTime;
    if (best !== null && this.gc.available) {
      void this.gc.submit([levelBoardId(run.levelId)], centiseconds(best)).then((ok) => {
        if (!ok) return;
        const synced = this.save.load<{ ids: string[] }>('competition:synced', { ids: [] });
        if (!synced.ids.includes(run.levelId)) this.save.save('competition:synced', { ids: [...synced.ids, run.levelId] });
      });
      const t = totals(this.worlds, this.best);
      void this.gc.submit([BOARDS.totalStars], t.stars);
      void this.gc.submit([BOARDS.levelsCompleted], t.levels);
    }
    return this.newAchievements();
  }

  /** A run lost its streak without finishing (the player went back to the menu or skipped). */
  breakStreak(): void {
    if (!this.stats.streak) return;
    this.stats = { ...this.stats, streak: 0 };
    this.save.save('competition', this.stats);
  }

  // ---------- Weekly Challenge ----------

  get week(): number {
    return weekNumber();
  }

  weeklyLevel(week = this.week): LevelDef {
    return weeklyLevel(this.worlds, week);
  }

  weekEnds(week = this.week): number {
    return weekEnds(week);
  }

  /** The player's best on this week's challenge (seconds), or null. */
  weeklyBest(week = this.week): number | null {
    return this.save.load<{ time: number | null }>(`weekly:${week}`, { time: null }).time;
  }

  /** A Weekly Challenge run finished. Returns the old best (null: first finish this week) and new achievements. */
  weeklyFinished(week: number, time: number): { prevBest: number | null; achievements: string[] } {
    const prevBest = this.weeklyBest(week);
    if (prevBest === null || time < prevBest) this.save.save(`weekly:${week}`, { time });
    this.stats = recordWeek(this.stats, week);
    this.save.save('competition', this.stats);
    // The board restarts each Monday, so the week rides along as the score's context.
    void this.gc.submit([BOARDS.weekly], centiseconds(Math.min(time, prevBest ?? time)), week);
    return { prevBest, achievements: this.newAchievements() };
  }

  // ---------- ranks ----------

  /**
   * Where the player stands on a board after a run, compared with the last time we looked.
   * `score`: the best score the board should now hold for them (to wait out a stale answer).
   */
  async rankNews(boardId: string, score: number, timed: boolean): Promise<RankNews | null> {
    if (!this.gc.available) return null;
    let info = await this.gc.rank(boardId);
    // Game Center can take a moment to count a score just sent: ask once more if it looks stale.
    if (info && (info.score === undefined || (timed ? info.score > score : info.score < score))) {
      await new Promise((r) => setTimeout(r, 1500));
      info = (await this.gc.rank(boardId)) ?? info;
    }
    if (!info || info.rank === undefined) return null;
    const key = `competition:rank:${boardId}`;
    const before = this.save.load<SavedRank | null>(key, null);
    const passed = before ? before.friendsAhead.filter((n) => !info!.friendsAhead.some((f) => f.name === n)) : [];
    this.save.save<SavedRank>(key, { rank: info.rank, friendsAhead: info.friendsAhead.map((f) => f.name) });
    const target = info.friendsAhead[0] ?? info.ahead;
    const gapOf = (e: RankEntry) => (timed ? (info!.score! - e.score) / 100 : e.score - info!.score!);
    return {
      rank: info.rank,
      total: info.total,
      before: before?.rank,
      passed,
      next: target ? { ...target, gap: gapOf(target), friend: info.friendsAhead[0] === target } : undefined,
      timed,
    };
  }

  showLeaderboards(boardId?: string): void {
    void this.gc.show(boardId ? { leaderboardID: boardId } : { state: 'leaderboards' });
  }

  showAchievements(): void {
    void this.gc.show({ state: 'achievements' });
  }

  // ---------- achievements ----------

  private progress(): Map<string, number> {
    return achievementProgress(this.achievementDefs, this.worlds, this.best, this.stats);
  }

  private earnedNow(): string[] {
    return [...this.progress()].filter(([, p]) => p >= 100).map(([id]) => id);
  }

  /** Achievements completed since the last check (names), and reports progress to Game Center. */
  private newAchievements(): string[] {
    const earned = this.save.load<{ ids: string[] }>('competition:earned', { ids: [] }).ids;
    const now = this.earnedNow();
    const fresh = now.filter((id) => !earned.includes(id));
    if (fresh.length) this.save.save('competition:earned', { ids: [...earned, ...fresh] });
    this.reportAchievements();
    return fresh.map((id) => this.achievementDefs.find((d) => d.id === id)!.name);
  }

  /** Sends every achievement whose progress went up since it was last sent. */
  private reportAchievements(): void {
    if (!this.gc.available) return;
    const sent = this.save.load<Record<string, number>>('competition:reported', {});
    const changes = [...this.progress()].filter(([id, p]) => p > 0 && p > (sent[id] ?? 0)).map(([id, percent]) => ({ id, percent }));
    if (!changes.length) return;
    void this.gc.report(changes).then((ok) => {
      if (!ok) return;
      const now = this.save.load<Record<string, number>>('competition:reported', {});
      for (const c of changes) now[c.id] = Math.max(now[c.id] ?? 0, c.percent);
      this.save.save('competition:reported', now);
    });
  }
}
