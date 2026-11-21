import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath } from 'node:url';

// `npm run dev:phone` serves over HTTPS on the LAN: iOS Safari only delivers
// motion sensor events to secure origins, so plain http:// would show no tilt.
export default defineConfig(({ mode }) => ({
  // Relative asset paths so the bundle loads from Capacitor's capacitor://localhost origin.
  base: './',
  plugins: mode === 'phone' ? [basicSsl()] : [],
  // Analytics run only in the iPhone app (native Firebase SDK); the plugin's unused web side
  // gets a stub instead of the Firebase JS SDK. See src/analytics/firebase-web-stub.ts.
  resolve: {
    alias: { 'firebase/analytics': fileURLToPath(new URL('./src/analytics/firebase-web-stub.ts', import.meta.url)) },
  },
  // App Store builds (GRAVITOR_RELEASE=1, set by the TestFlight workflow) hide the testing options.
  define: { __RELEASE__: JSON.stringify(process.env.GRAVITOR_RELEASE === '1') },
  build: {
    target: 'es2022',
    outDir: 'dist',
    chunkSizeWarningLimit: 6000,
  },
  server: { host: true },
}));
