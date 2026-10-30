import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gravityshift.game',
  appName: 'Gravity Shift',
  webDir: 'dist',
  backgroundColor: '#05070d',
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
    backgroundColor: '#05070d',
  },
};

export default config;
