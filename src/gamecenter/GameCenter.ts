import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Game Center (iPhone app only), through the app's own native plugin
 * (ios/App/App/GameCenterPlugin.swift). On the web build every call is a harmless no-op and
 * `available` stays false, so the game never depends on it.
 */

export interface RankEntry {
  name: string;
  /** Raw score: hundredths of a second for time boards, a count otherwise. */
  score: number;
  rank: number;
}

export interface RankInfo {
  /** The player's place (1 = best), when they have a score on this board. */
  rank?: number;
  score?: number;
  /** Players on the board. */
  total: number;
  /** The player just above on the global board. */
  ahead?: RankEntry;
  /** Friends above the player, closest first (at most 2). */
  friendsAhead: RankEntry[];
}

interface GameCenterPlugin {
  authenticate(): Promise<{ authenticated: boolean; name?: string; error?: string }>;
  submitScore(o: { leaderboardIDs: string[]; score: number; context?: number }): Promise<void>;
  loadRank(o: { leaderboardID: string }): Promise<RankInfo>;
  reportAchievements(o: { achievements: { id: string; percent: number }[] }): Promise<void>;
  showDashboard(o: { leaderboardID?: string; state?: 'leaderboards' | 'achievements' }): Promise<void>;
  addListener(event: 'authChanged', fn: (info: { authenticated: boolean; name?: string }) => void): Promise<unknown>;
}

/**
 * Created once, at load. Never resolve a promise to the plugin object itself: a Capacitor
 * plugin is a Proxy that answers `then` too (see Analytics.ts).
 */
const native = Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('GameCenter') ? registerPlugin<GameCenterPlugin>('GameCenter') : null;

export class GameCenter {
  /** The plugin exists (iPhone app). */
  readonly supported = native !== null;
  /** Signed in to Game Center. */
  available = false;
  playerName = '';
  lastError = '';
  private signIn: Promise<boolean> | null = null;
  /** Called when the player signs in after launch (for example from the Settings app). */
  onSignIn: (() => void) | null = null;

  constructor() {
    void native?.addListener('authChanged', (info) => {
      const was = this.available;
      this.available = info.authenticated;
      this.playerName = info.name ?? '';
      if (info.authenticated && !was) this.onSignIn?.();
    }).catch(() => {});
  }

  /** Signs in (Game Center shows its own sheet or banner). Safe to call more than once. */
  authenticate(): Promise<boolean> {
    if (!native) return Promise.resolve(false);
    this.signIn ??= native
      .authenticate()
      .then((r) => {
        this.available = r.authenticated;
        this.playerName = r.name ?? '';
        if (r.error) this.lastError = r.error;
        return r.authenticated;
      })
      .catch((e) => {
        this.lastError = String(e?.message ?? e);
        return false;
      })
      .finally(() => {
        // A player who said "not now" can sign in later from Settings > Game Center; try again next time.
        if (!this.available) this.signIn = null;
      });
    return this.signIn;
  }

  async submit(leaderboardIDs: string[], score: number, context = 0): Promise<boolean> {
    if (!native || !this.available || !leaderboardIDs.length) return false;
    try {
      await native.submitScore({ leaderboardIDs, score: Math.round(score), context });
      return true;
    } catch (e) {
      this.lastError = `submit: ${String((e as Error)?.message ?? e)}`;
      return false;
    }
  }

  async rank(leaderboardID: string): Promise<RankInfo | null> {
    if (!native || !this.available) return null;
    try {
      const r = await native.loadRank({ leaderboardID });
      return { total: r.total ?? 0, rank: r.rank, score: r.score, ahead: r.ahead, friendsAhead: r.friendsAhead ?? [] };
    } catch (e) {
      this.lastError = `rank: ${String((e as Error)?.message ?? e)}`;
      return null;
    }
  }

  async report(achievements: { id: string; percent: number }[]): Promise<boolean> {
    if (!native || !this.available || !achievements.length) return false;
    try {
      await native.reportAchievements({ achievements });
      return true;
    } catch (e) {
      this.lastError = `achievements: ${String((e as Error)?.message ?? e)}`;
      return false;
    }
  }

  /** Opens Apple's Game Center screen. False when the player isn't signed in (or it failed). */
  async show(o: { leaderboardID?: string; state?: 'leaderboards' | 'achievements' } = {}): Promise<boolean> {
    if (!native) return false;
    if (!this.available && !(await this.authenticate())) return false;
    try {
      await native.showDashboard(o);
      return true;
    } catch (e) {
      this.lastError = `dashboard: ${String((e as Error)?.message ?? e)}`;
      return false;
    }
  }
}
