import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'Com.cnmbuckstudios.gravitor',
  appName: 'Gravitor',
  webDir: 'dist',
  backgroundColor: '#05070d',
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
    backgroundColor: '#05070d',
  },
  experimental: {
    ios: {
      spm: {
        // Package traits need Swift tools 6.1 (Xcode 16.3+; the TestFlight workflow uses Xcode 26).
        swiftToolsVersion: '6.1',
        // Firebase Analytics without the advertising ID (IDFA): no tracking, no ATT prompt.
        packageTraits: { '@capacitor-firebase/analytics': ['AnalyticsWithoutAdIdSupport'] },
      },
    },
  },
};

export default config;
