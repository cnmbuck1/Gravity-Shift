/**
 * Thin, failure-tolerant wrapper over local storage. Everything persisted on device goes
 * through here so the backend can later move to @capacitor/preferences without touching callers.
 */
const PREFIX = 'gravity-shift:';

export class SaveManager {
  load<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
    } catch {
      return fallback;
    }
  }

  save<T>(key: string, value: T): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Storage unavailable (private mode / quota); settings simply won't persist.
    }
  }
}
