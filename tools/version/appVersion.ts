import { readFileSync } from 'node:fs';

/**
 * The app's version lives in one place: MARKETING_VERSION in the Xcode project (Xcode → App target →
 * General → Version). Xcode puts it in the app bundle as CFBundleShortVersionString, App Store
 * Connect reads it from there, and the web build reads it here, so the home screen always shows the
 * version that was uploaded. Bump it in Xcode (or in project.pbxproj) and nowhere else.
 */
export const PBXPROJ_PATH = new URL('../../ios/App/App.xcodeproj/project.pbxproj', import.meta.url);

/** Reads MARKETING_VERSION from project.pbxproj text. Every build configuration must agree. */
export function marketingVersion(pbxproj: string): string {
  const versions = [...pbxproj.matchAll(/MARKETING_VERSION = "?([^";\s]+)"?;/g)].map((m) => m[1]);
  if (versions.length === 0) throw new Error('No MARKETING_VERSION found in project.pbxproj');
  const unique = [...new Set(versions)];
  if (unique.length > 1) {
    throw new Error(`project.pbxproj has different MARKETING_VERSION values (${unique.join(', ')}); make Debug and Release match`);
  }
  return unique[0];
}

/** The version and build number baked into the web build. Build comes from GRAVITOR_BUILD (set by the TestFlight workflow). */
export function appVersion(env: Record<string, string | undefined> = process.env): { version: string; build: string } {
  const version = marketingVersion(readFileSync(PBXPROJ_PATH, 'utf8'));
  const build = (env.GRAVITOR_BUILD ?? '').trim();
  return { version, build: /^\d+$/.test(build) ? build : '' };
}
