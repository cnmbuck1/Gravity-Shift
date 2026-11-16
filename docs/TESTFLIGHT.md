# Gravitor on TestFlight

What is already set up in the repo:

| Item | Value |
|---|---|
| Bundle ID | `Com.cnmbuckstudios.gravitor`, capital C, exactly as registered for the App Store Connect app. Apple won't register the lowercase form, and Xcode's signing and upload look the ID up with its exact case |
| App Store name / home-screen name | Gravitor: Tilt Maze / Gravitor |
| Version / build | 1.0 (build 1). CI uploads use build 100 + the run number, so they never collide |
| Devices | iPhone only, portrait. iPads can still run it in iPhone mode, and no iPad screenshots are needed |
| Minimum iOS | 15.0 |
| App icon | "Neon maze": the Cnmbuck Orb in a glowing labyrinth with an orange goal ring, 1024 px, no transparency (`npm run ios:assets` redraws it; concepts in `tools/ios-assets/icons.ts`) |
| Launch screen | Dark background with the GRAVITOR wordmark, the Orb as the O |
| Motion permission text | `NSMotionUsageDescription` in `ios/App/App/Info.plist` |
| Export compliance | `ITSAppUsesNonExemptEncryption = NO` (the game only uses HTTPS), so uploads skip the encryption question |
| Privacy manifest | `ios/App/App/PrivacyInfo.xcprivacy`: no tracking, no data collected by the game. AdMob and Capacitor bring their own |
| CI upload | `.github/workflows/testflight.yml` (run by hand) |

## 1. One-time Apple setup (you)

1. **Apple Developer Program** membership is active (developer.apple.com → Account). Note the **Team ID** under Membership details.
2. **App Store Connect app record** for `Com.cnmbuckstudios.gravitor` exists (done 2026-10-31, SKU GRAVITOR-IOS-001).
3. **Agreements**: App Store Connect → Business → accept the **Paid Apps** agreement and fill in tax and banking. The Remove Ads purchase does not work, even in TestFlight, until this is done.
4. **In-app purchase**: App Store Connect → Gravitor → Monetization → In-App Purchases → add a **Non-Consumable** with Product ID `com.cnmbuckstudios.gravitor.removeads`, price $2.99, a display name and description, and a review screenshot.
5. **TestFlight testers**: App Store Connect → Gravitor → TestFlight → Internal Testing → create a group and add yourself (and anyone else on your team). External testers need a short Beta App Review the first time.

## 2. Upload a build: pick one route

### Route A: GitHub Actions (no Mac needed)

1. App Store Connect → Users and Access → Integrations → **App Store Connect API** → generate a key with the **Admin** role (Admin lets Xcode create the distribution certificate and profile in the cloud). Download the `.p8` file (only downloadable once) and note the **Key ID** and **Issuer ID**.
2. GitHub → this repo → Settings → Secrets and variables → Actions → add:
   - `APPLE_TEAM_ID`: your Team ID
   - `ASC_KEY_ID`: the Key ID
   - `ASC_ISSUER_ID`: the Issuer ID
   - `ASC_KEY_P8`: the whole text of the `.p8` file, including the BEGIN/END lines
3. GitHub → Actions → **Upload to TestFlight** → Run workflow (branch `main`).
4. About 15 to 30 minutes later the build shows in App Store Connect → TestFlight (it says "Processing" first). Add it to your internal group and install it with the TestFlight app on your iPhone.

macOS runners use GitHub Actions minutes at 10× the Linux rate on private repos; this repo is public, so they are free.

### Route B: Xcode on a Mac

1. Install Xcode 26 or later, then in Xcode → Settings → Accounts, sign in with your Apple ID.
2. In the repo: `npm install`, then `npm run ios:sync`, then `npm run ios:open`.
3. Select the **App** target → Signing & Capabilities → tick *Automatically manage signing* and choose your Team. The bundle ID must stay `Com.cnmbuckstudios.gravitor` (capital C).
4. Set the run destination to **Any iOS Device (arm64)**, then Product → **Archive**.
5. In the Organizer window: **Distribute App** → **App Store Connect** → Upload. Then continue from step 4 of Route A.
6. For the next upload, raise the build number (target → General → Build) or Apple rejects it as a duplicate.

## 3. Before submitting to the App Store (not needed for TestFlight)

- **Real AdMob IDs**: put your AdMob app ID in `Info.plist` (`GADApplicationIdentifier`) and the interstitial unit ID in `src/monetization/Monetization.ts` (`AD_UNIT_ID`). TestFlight builds show Google's test ads until then. Also add Google's full SKAdNetwork list to `Info.plist`.
- **Testing switches**: "Unlock all levels" is on by default and makes the Cnmbuck Orb selectable. Turn the default off in `src/settings/SettingsManager.ts` once the world order is final.
- **App Privacy answers** (App Store Connect → App Privacy): because of AdMob, declare Device ID, Advertising Data, Product Interaction, and Crash/Performance data, collected by third parties, not linked to identity, not used for tracking (non-personalised ads, no tracking prompt).
- **Privacy policy URL** and **support URL** (required on the store page).
- **Screenshots**: 6.9" iPhone (1320 × 2868 or 1290 × 2796). One size is enough; Apple scales it for smaller phones.
- **Age rating** questionnaire (expect 4+), category Games → Puzzle (secondary: Action), description, keywords, and promotional text.
- Bump `MARKETING_VERSION` (target → General → Version) for each App Store release after 1.0.

## Troubleshooting the GitHub upload

- **`exportArchive Error Downloading App Information`**: the build and signing worked, but App Store Connect refused the API key's request for the app. Check, in this order:
  1. App Store Connect home page and Business: no banner asking the Account Holder to accept a new or updated agreement (the Free Apps or Paid Apps agreement must be active).
  2. The API key's role is **Admin** (Users and Access → Integrations). A Developer-role key can sign but cannot upload.
  3. The project's bundle ID matches the app record's exactly, including case (`Com.cnmbuckstudios.gravitor`). A case mismatch makes Xcode fall back to the wildcard "iOS Team Provisioning Profile: *" in the archive log.
  4. Under Users and Access → Integrations → Team Keys, the key's access is Admin (not the People tab).
  5. The four secrets have no extra spaces, and `APPLE_TEAM_ID` is the team that owns the app.
- When an upload fails, the run prints Xcode's distribution log under "Show why the upload failed" and attaches it as the `distribution-logs` artifact.
