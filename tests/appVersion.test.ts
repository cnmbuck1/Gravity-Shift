import { describe, expect, it } from 'vitest';
import { appVersion, marketingVersion } from '../tools/version/appVersion';

describe('app version', () => {
  it('reads MARKETING_VERSION from the Xcode project', () => {
    expect(marketingVersion('MARKETING_VERSION = 1.0.3;\n MARKETING_VERSION = 1.0.3;')).toBe('1.0.3');
    expect(marketingVersion('MARKETING_VERSION = "2.1";')).toBe('2.1');
  });

  it('refuses mismatched Debug and Release versions', () => {
    expect(() => marketingVersion('MARKETING_VERSION = 1.0.2;\nMARKETING_VERSION = 1.0.3;')).toThrow(/different/);
    expect(() => marketingVersion('')).toThrow(/No MARKETING_VERSION/);
  });

  it('matches the real project and takes the build number from the workflow', () => {
    const { version } = appVersion({});
    expect(version).toMatch(/^\d+\.\d+(\.\d+)?$/);
    expect(appVersion({ GRAVITOR_BUILD: '125' })).toEqual({ version, build: '125' });
    expect(appVersion({}).build).toBe('');
  });

  it('builds the home screen footer from it', () => {
    expect(__APP_VERSION__).toBe(appVersion({}).version);
  });
});
