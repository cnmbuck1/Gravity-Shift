import { beforeEach, describe, expect, it, vi } from 'vitest';

const logged: { name: string; params: Record<string, string | number> }[] = [];
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));

import { Analytics as RealAnalytics, type LevelInfo } from '../src/analytics/Analytics';
import type { SaveManager } from '../src/settings/SaveManager';

/** In-memory stand-in for the device's saved data. */
function memorySave(): SaveManager {
  const m = new Map<string, string>();
  return {
    load: <T,>(k: string, f: T): T => (m.has(k) ? { ...f, ...JSON.parse(m.get(k)!) } : f),
    save: <T,>(k: string, v: T) => void m.set(k, JSON.stringify(v)),
  } as SaveManager;
}

/**
 * Firebase stand-in that records what would be sent. Like a real Capacitor plugin, it is a Proxy
 * that answers every property, `then` included (a native "then" call rejects), so analytics
 * must never resolve a promise to the plugin itself.
 */
const methods: Record<string, unknown> = {
  logEvent: async (e: { name: string; params: Record<string, string | number> }) => void logged.push(e),
  setUserProperty: async () => {},
};
const fakePlugin = new Proxy({}, {
  get: (_, prop) => methods[prop as string] ?? (() => Promise.reject(new Error(`${String(prop)} is not implemented on ios`))),
});
class Analytics extends RealAnalytics {
  constructor(save: SaveManager) {
    super(save, async () => ({ api: fakePlugin as never }));
  }
}

const L1: LevelInfo = { id: 'w1-l1', name: 'Launch Deck', world: 1, number: 1, label: '1-1' };
const flush = () => new Promise((r) => setTimeout(r, 0));
const names = () => logged.map((e) => e.name);

describe('level analytics', () => {
  beforeEach(() => void (logged.length = 0));

  it('logs start, falls and finish with tries and total play time', async () => {
    const a = new Analytics(memorySave());
    a.levelStart(L1);
    a.levelFail(4);
    a.levelQuit('restart', 6);
    a.levelStart(L1);
    a.levelEnd({ time: 10.04, falls: 0, shifts: 2 }, 3);
    await flush();
    expect(names()).toEqual(['level_start', 'level_fail', 'level_quit', 'level_start', 'level_end']);
    const end = logged[4].params;
    expect(end).toMatchObject({ level_id: 'w1-l1', label: '1-1', world: 1, level: 1, success: 'true', attempt: 2, time_sec: 10, play_sec: 16, stars: 3, first_clear: 1 });
  });

  it('keeps counting tries across app launches, and replays are not first clears', async () => {
    const save = memorySave();
    new Analytics(save).levelStart(L1);
    const a = new Analytics(save);
    a.levelStart(L1);
    a.levelEnd({ time: 20, falls: 1, shifts: 0 }, 2);
    a.levelStart(L1);
    a.levelEnd({ time: 15, falls: 0, shifts: 0 }, 3);
    await flush();
    const ends = logged.filter((e) => e.name === 'level_end').map((e) => e.params);
    expect(ends[0]).toMatchObject({ attempt: 2, first_clear: 1, play_sec: 20 });
    expect(ends[1]).toMatchObject({ attempt: 3, first_clear: 0, play_sec: 20 });
  });

  it('logs a skip once and ignores test courses and events after the try ended', async () => {
    const a = new Analytics(memorySave());
    a.levelStart(L1);
    a.levelSkip(30, 5);
    a.levelQuit('menu', 30);
    a.levelStart(null);
    a.levelFail(1);
    a.levelEnd({ time: 5, falls: 0, shifts: 0 }, 3);
    await flush();
    expect(names()).toEqual(['level_start', 'level_skip']);
    expect(logged[1].params).toMatchObject({ falls: 5, play_sec: 30, attempt: 1 });
  });
});
