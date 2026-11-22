/** True in App Store builds: testing options are hidden and switched off (see vite.config.ts). */
declare const __RELEASE__: boolean;
/** The app's version (MARKETING_VERSION from the Xcode project), such as "1.0.3". See vite.config.ts. */
declare const __APP_VERSION__: string;
/** The TestFlight build number, such as "125", or "" in local builds. */
declare const __APP_BUILD__: string;
