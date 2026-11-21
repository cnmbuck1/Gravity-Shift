import { Capacitor } from '@capacitor/core';
import type { SaveManager } from '../settings/SaveManager';

/**
 * Player-progress analytics (Firebase Analytics, iPhone app only).
 *
 * Logs one event per level start, fall, finish, skip and quit, so the Firebase console shows
 * how long each level takes, how many tries it needs and where players get stuck or give up.
 * Nothing identifies the player: no user ID, no advertising ID (the plugin is built without
 * IDFA support) and no ad personalisation signals (see Info.plist).
 *
 * On the web build (GitHub Pages, test links) and in an iPhone build without
 * GoogleService-Info.plist, every call here is a harmless no-op. Analytics never blocks or
 * breaks the game: calls are fire-and-forget and errors are swallowed.
 *
 * Events (all carry level_id, level_name, world, level and label, e.g. "3-7"):
 *   level_start  attempt                     each try: first play, retry, restart
 *   level_fail   attempt, falls, time_sec    each fall into the void
 *   level_end    success, attempt, time_sec, falls, shifts, stars, play_sec, first_clear
 *   level_skip   attempt, falls, play_sec    skipped with a rewarded ad
 *   level_quit   reason, attempt, time_sec   left mid-level (restart or menu)
 *
 * time_sec is this try's time; play_sec is all tries at this level added up, across app
 * launches, until it is first finished or skipped.
 */

/** A campaign level, as analytics reports it. */
export interface LevelInfo {
  id: string;
  name: string;
  /** World number, from 1. */
  world: number;
  /** Position in the whole campaign, from 1 (1-100). */
  number: number;
  /** "world-level", as the game shows it, e.g. "3-7". */
  label: string;
}

/** Saved per level so tries and time add up across app launches. */
interface LevelTally {
  attempts: number;
  playSec: number;
  cleared: boolean;
}

type FirebaseApi = typeof import('@capacitor-firebase/analytics').FirebaseAnalytics;
type Params = Record<string, string | number>;

export class Analytics {
  readonly native = Capacitor.isNativePlatform();
  private fb: Promise<FirebaseApi | null>;
  private level: LevelInfo | null = null;
  private tally: LevelTally = { attempts: 0, playSec: 0, cleared: false };
  /** Whether the current try is still running (not yet finished, skipped or quit). */
  private live = false;
  private falls = 0;

  /** `loadFirebase` is replaceable for tests. */
  constructor(private save: SaveManager, loadFirebase: () => Promise<FirebaseApi> = loadPlugin) {
    // Loaded lazily, like the ads and store plugins, so the web bundle never touches it.
    this.fb = this.native
      ? loadFirebase().catch((e) => {
          console.warn('Analytics unavailable', e);
          return null;
        })
      : Promise.resolve(null);
  }

  /** A new try at `level` begins (first play, retry, restart or next level). null: a test course, not tracked. */
  levelStart(level: LevelInfo | null): void {
    this.level = level;
    this.live = false;
    if (!level) return;
    this.tally = this.save.load<LevelTally>(key(level.id), { attempts: 0, playSec: 0, cleared: false });
    this.tally.attempts++;
    this.store();
    this.live = true;
    this.falls = 0;
    this.log('level_start', { attempt: this.tally.attempts });
  }

  /** The ball fell into the void. `timeSec` is this try's time so far. */
  levelFail(timeSec: number): void {
    if (!this.live) return;
    this.falls++;
    this.log('level_fail', { attempt: this.tally.attempts, falls: this.falls, time_sec: round(timeSec) });
  }

  /** Reached the goal. */
  levelEnd(run: { time: number; falls: number; shifts: number }, stars: number): void {
    if (!this.live) return;
    this.live = false;
    const firstClear = !this.tally.cleared;
    if (firstClear) this.tally.playSec += run.time;
    const playSec = this.tally.playSec;
    this.tally.cleared = true;
    this.store();
    this.log('level_end', {
      success: 'true',
      attempt: this.tally.attempts,
      time_sec: round(run.time),
      falls: run.falls,
      shifts: run.shifts,
      stars,
      play_sec: round(playSec),
      first_clear: firstClear ? 1 : 0,
    });
  }

  /** Skipped with a rewarded ad. `timeSec` is this try's time; `totalFalls` counts all tries. */
  levelSkip(timeSec: number, totalFalls: number): void {
    if (!this.live) return;
    this.live = false;
    if (!this.tally.cleared) this.tally.playSec += timeSec;
    this.store();
    this.log('level_skip', { attempt: this.tally.attempts, falls: totalFalls, play_sec: round(this.tally.playSec) });
  }

  /** Left the level before finishing it: restarted it or went back to the menu. */
  levelQuit(reason: 'restart' | 'menu', timeSec: number): void {
    if (!this.live) return;
    this.live = false;
    if (!this.tally.cleared) this.tally.playSec += timeSec;
    this.store();
    this.log('level_quit', { reason, attempt: this.tally.attempts, time_sec: round(timeSec) });
  }

  /** How many campaign levels this player has finished: a user property for slicing reports. */
  setLevelsCleared(n: number): void {
    void this.fb.then((fb) => fb?.setUserProperty({ key: 'levels_cleared', value: String(n) })).catch(() => {});
  }

  private log(name: string, extra: Params): void {
    const l = this.level;
    if (!l) return;
    const params: Params = { level_id: l.id, level_name: l.name, world: l.world, level: l.number, label: l.label, ...extra };
    void this.fb.then((fb) => fb?.logEvent({ name, params })).catch(() => {});
  }

  private store(): void {
    if (this.level) this.save.save(key(this.level.id), this.tally);
  }
}

const loadPlugin = () => import('@capacitor-firebase/analytics').then((m) => m.FirebaseAnalytics);
const key = (levelId: string) => `analytics:${levelId}`;
const round = (s: number) => Math.round(s * 10) / 10;
