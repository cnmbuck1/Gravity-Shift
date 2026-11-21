# Firebase level analytics (Gravitor 1.0.2)

Gravitor sends anonymous level events to Firebase Analytics, so you can see how fast each level
is finished, how many tries it takes and where players get stuck. Only the iPhone app sends them
(not the GitHub Pages build). No ad ID, no tracking prompt, nothing tied to a person.

## Events

Every event carries `level_id`, `level_name`, `world` (1-10), `level` (1-100) and `label` ("3-7").

| Event | When | Extra values |
|---|---|---|
| `level_start` | each try: first play, retry, restart, next level | `attempt` (tries at this level so far, across launches) |
| `level_fail` | each fall into the void | `attempt`, `falls` (this try), `time_sec` |
| `level_end` | reached the goal | `success`, `attempt`, `time_sec` (this run), `falls`, `shifts`, `stars`, `play_sec` (all tries added up until the first finish), `first_clear` (1 the first time) |
| `level_skip` | skipped with the rewarded ad | `attempt`, `falls` (all tries), `play_sec` |
| `level_quit` | left mid-level | `reason` (`restart` or `menu`), `attempt`, `time_sec` |

User property `levels_cleared`: how many campaign levels the player has finished.

The questions you asked map to these:

- **How fast is level X finished?** `level_end` where `first_clear = 1`: `play_sec` is the total time it took
  to beat it the first time, `attempt` the number of tries. `time_sec` is the winning run itself.
- **Too easy?** Lots of `first_clear` with `attempt = 1`, 3 stars and few falls.
- **Too hard?** Many `level_fail`, `level_skip` or `level_quit` per `level_start`, and a drop in players between levels.

## One-time setup (Chris, about 10 minutes)

1. **Create the project.** Go to https://console.firebase.google.com → **Create a project** → name it
   **Gravitor**. Keep **Google Analytics on**, create a new Analytics account (for example
   "Cnmbuck Studios"), pick your country, accept the terms, **Create project**.
2. **Add the iPhone app.** On the project page, click the **iOS+** icon (Add app).
   - Apple bundle ID: **`Com.cnmbuckstudios.gravitor`** (capital C, exactly like this)
   - App nickname: Gravitor
   - App Store ID: `6829235034`
   - **Register app**, then **Download GoogleService-Info.plist**. Skip the remaining steps
     (Next, Next, Continue to console); the code side is already done.
3. **Give the file to the build.** Open the downloaded file in TextEdit and copy all of it. In GitHub:
   **cnmbuck1/Gravity-Shift → Settings → Secrets and variables → Actions → New repository secret**,
   name **`GOOGLE_SERVICE_INFO_PLIST`**, paste the whole file as the value, **Add secret**.
   (The file stays out of git; the TestFlight workflow writes it into the app and checks the bundle ID.)
4. **Make the values show up in reports.** Firebase keeps the extra values, but its reports only
   show the ones you register. In the Firebase console: **Analytics → Custom definitions**
   (in Google Analytics: Admin → Custom definitions).
   - **Custom dimensions** (scope Event): `label`, `level_id`, `level_name`, `reason`
   - **Custom dimension** (scope User): `levels_cleared`
   - **Custom metrics** (scope Event): `time_sec` and `play_sec` (unit: Seconds), `attempt`, `falls`, `stars` (unit: Standard)
   - The numbers `world`, `level` and `first_clear` can be added as dimensions too, if you want to filter on them.
5. **Build.** Merge the pull request, then GitHub → Actions → **Upload to TestFlight** → Run workflow.
   The log step "Add the Firebase config" should not show a warning.
6. **Check it works.** Play a level on the TestFlight build, then open Firebase → Analytics →
   **Realtime** (Google Analytics → Reports → Realtime). Events show up within a few minutes;
   the normal reports fill in after about 24 hours.

## App Store privacy (before submitting 1.0.2)

App Store Connect → Gravitor → **App Privacy** → Edit, and add:

- **Identifiers → Device ID** (Firebase's random app instance ID, not the ad ID)
- **Usage Data → Product Interaction**

For both: used for **Analytics**, **not linked** to the user's identity, **not used for tracking**.
Then **Publish**. No App Tracking Transparency prompt is needed: the Firebase plugin is built
without ad ID support and ad personalisation signals are off (`Info.plist`). The app's privacy
manifest (`ios/App/App/PrivacyInfo.xcprivacy`) declares the same two data types.

## Reading the data

- **Quick look:** Reports → Engagement → **Events** → `level_end` shows counts and, once registered, average `time_sec`/`play_sec` by `label`.
- **Per-level table:** **Explore → Free form**. Rows: `label`. Values: Event count, Average `play_sec`, Average `attempt`.
  Filter: Event name = `level_end` and `first_clear` = 1. Swap the event to `level_skip` or `level_fail` to see trouble spots.
- **Drop-off:** Explore → **Funnel exploration**, steps `level_start` with `label` 1-1, 1-2, 1-3 ...
- **Exact medians:** Project settings → Integrations → **BigQuery** (free sandbox tier) exports every raw event.

## Builds without the file

Without the secret (or locally without `ios/App/App/GoogleService-Info.plist`), the app builds and
runs normally and simply sends nothing. The Xcode build phase "Copy Firebase config" copies the file
into the app when it exists.
