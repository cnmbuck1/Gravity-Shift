# Game Center: leaderboards, Weekly Challenge, achievements

Gravitor uses Game Center (iPhone app only) for:

- **A fastest-time leaderboard on every level.** After a run the result screen shows the player's world rank and the next friend (or player) to beat, and tapping it opens that level's board.
- **Overall boards**: Total Stars and Levels Completed.
- **Weekly Challenge**: one level a week, the same for everyone, picked from the free worlds (1-11). It has its own recurring board that restarts every Monday 00:00 UTC. Weekly runs never change campaign progress.
- **39 achievements** (905 of the 1000 points Game Center allows), including Night Vision: finish every World 15 level in the dark without falling.

The web build (GitHub Pages) has the Weekly Challenge, achievements progress and affirmations but no Game Center.

## Why 21 leaderboard sets

Game Center allows 100 leaderboards per app, or up to 500 when they are grouped into leaderboard sets (at most 100 sets, 100 leaderboards per set). Gravitor needs 203 (200 levels, 2 overall, 1 weekly), so each world's 10 level boards form a set and the overall and weekly boards form an "Overall" set. Level boards are keyed by the level's id, not its position, so reordering levels never mixes up scores.

## Code

| Where | What |
|---|---|
| `src/gamecenter/catalog.ts` | Every leaderboard, set and achievement ID, name and rule (the single source of truth) |
| `src/gamecenter/Competition.ts` | Saves the stats behind achievements, sends scores and achievements, reads ranks |
| `src/gamecenter/weekly.ts` | Weekly Challenge level and week maths |
| `src/gamecenter/GameCenter.ts` + `ios/App/App/GameCenterPlugin.swift` | The native bridge (sign-in, scores, ranks, achievements, Apple's leaderboard screens) |
| `src/ui/affirmations.ts` | Affirmation lines and which moment gets the headline |
| `tools/gamecenter/catalog.json` | The catalog for App Store Connect. `tests/gamecenter.test.ts` fails if it is stale; `GC_WRITE=1 npx vitest run tests/gamecenter.test.ts` rewrites it |
| `tools/gamecenter/setup.py` + Actions → "Set up Game Center" | Creates everything in App Store Connect from catalog.json |
| `tools/gamecenter/badges/` | The 512×512 achievement badges (`node tools/gamecenter/render-badges.mjs` redraws them) |

## Setting it up in App Store Connect

1. **Create everything with the workflow** (recommended): GitHub → Actions → **Set up Game Center** → Run workflow. Leave *apply* unticked first: the log lists what it would create. Then run it again with *apply* ticked. It uses the same App Store Connect key as TestFlight, skips anything that already exists, and uploads each achievement's badge. Or create them by hand from the tables below.
2. In App Store Connect → Gravitor → the **1.1.0** version page → **Game Center**: turn it on and add the leaderboard sets and achievements to the version (new Game Center items go live with an app version).
3. Upload a TestFlight build. Sign in to Game Center in the iPhone's Settings with a sandbox or real account and test: finish a level, check the rank line, open Leaderboards and Achievements from the home screen.

Leaderboard and achievement IDs can't be changed or reused once created, so check the dry run first.

## App Privacy

No change is needed. Game Center data is collected and handled by Apple; Gravitor only reads ranks and player names on the device to show them, and sends nothing to Cnmbuck Studios or Firebase. Firebase Analytics events don't include any Game Center ID.

## IDs

### Overall leaderboards (set `gravitor.set.overall`, "Overall")

| Leaderboard ID | Name | Score format | Sort | Type |
|---|---|---|---|---|
| `gravitor.total_stars` | Total Stars | Integer | High to low | Classic |
| `gravitor.levels_completed` | Levels Completed | Integer | High to low | Classic |
| `gravitor.weekly_challenge` | Weekly Challenge | Elapsed time (hundredths) | Low to high | Recurring: 7 days, every Monday 00:00 UTC from 2026-11-23 |

### Level leaderboards (200, one set per world)

All: Classic, Best Score, elapsed time to the hundredth of a second, low to high. ID = `gravitor.time.` + the level id with `-` turned into `_`.

| Set ID | Set name | Leaderboard IDs |
|---|---|---|
| `gravitor.set.w1` | World 1 · Launch Deck | `gravitor.time.l1_first_roll`, `gravitor.time.w1_wide_turns`, `gravitor.time.l2_corners`, `gravitor.time.w1_first_maze`, `gravitor.time.w1_hole_punch`, `gravitor.time.w1_branches`, `gravitor.time.w1_narrow_ways`, `gravitor.time.w1_labyrinth`, `gravitor.time.l3_mind_the_gap`, `gravitor.time.w1_launch_finale` |
| `gravitor.set.w2` | World 2 · Piston Works | `gravitor.time.l4_moving_parts`, `gravitor.time.w2_piston_alley`, `gravitor.time.w2_hot_floor`, `gravitor.time.w2_overpass`, `gravitor.time.w2_coffee_break`, `gravitor.time.w2_switchback`, `gravitor.time.w2_gears`, `gravitor.time.w2_red_line`, `gravitor.time.w2_crossfire`, `gravitor.time.w2_piston_works` |
| `gravitor.set.w3` | World 3 · Wall Walk | `gravitor.time.l6_wall_walk`, `gravitor.time.w3_side_step`, `gravitor.time.w3_wall_run`, `gravitor.time.w3_both_ways`, `gravitor.time.w3_easy_rider`, `gravitor.time.w3_wall_maze`, `gravitor.time.w3_twin_walls`, `gravitor.time.w3_high_wire`, `gravitor.time.w3_event_horizon`, `gravitor.time.orbital_labyrinth` |
| `gravitor.set.w4` | World 4 · Crumble Belt | `gravitor.time.w4_soft_ground`, `gravitor.time.w4_ferry`, `gravitor.time.w4_falling_floor`, `gravitor.time.w4_crossing`, `gravitor.time.w4_rest_stop`, `gravitor.time.w4_crumble_maze`, `gravitor.time.w4_ferry_lines`, `gravitor.time.w4_quick_feet`, `gravitor.time.w4_breakaway`, `gravitor.time.w4_crumble_belt` |
| `gravitor.set.w5` | World 5 · Flux Rails | `gravitor.time.w5_boost_lane`, `gravitor.time.w5_ice_rink`, `gravitor.time.w5_conveyor`, `gravitor.time.w5_side_wind`, `gravitor.time.w5_glide`, `gravitor.time.w5_slippery_maze`, `gravitor.time.w5_thin_ice`, `gravitor.time.w5_fast_lane`, `gravitor.time.w5_rails`, `gravitor.time.w5_flux_rails` |
| `gravitor.set.w6` | World 6 · Skyward | `gravitor.time.w6_upside_down`, `gravitor.time.w6_ceiling_walk`, `gravitor.time.w6_flip_maze`, `gravitor.time.w6_auto_flip`, `gravitor.time.w6_skylight`, `gravitor.time.w6_flip_and_wall`, `gravitor.time.w6_high_ceiling`, `gravitor.time.w6_topsy`, `gravitor.time.w6_sky_maze`, `gravitor.time.w6_skyward` |
| `gravitor.set.w7` | World 7 · Circuit | `gravitor.time.w7_switch_on`, `gravitor.time.w7_laser_gate`, `gravitor.time.w7_locked_maze`, `gravitor.time.w7_red_lights`, `gravitor.time.w7_power_nap`, `gravitor.time.w7_double_lock`, `gravitor.time.w7_wiring`, `gravitor.time.w7_short_circuit`, `gravitor.time.w7_overload`, `gravitor.time.w7_circuit` |
| `gravitor.set.w8` | World 8 · Low Orbit | `gravitor.time.w8_hop`, `gravitor.time.w8_low_gravity`, `gravitor.time.w8_autopilot`, `gravitor.time.w8_moon_maze`, `gravitor.time.w8_orbit_rest`, `gravitor.time.w8_long_jump`, `gravitor.time.w8_slingshot`, `gravitor.time.w8_zero_g`, `gravitor.time.w8_escape_velocity`, `gravitor.time.w8_low_orbit` |
| `gravitor.set.w9` | World 9 · Spin Cycle | `gravitor.time.w9_sweeper`, `gravitor.time.w9_turntable`, `gravitor.time.w9_spin_doctor`, `gravitor.time.w9_roundabout`, `gravitor.time.w9_merry_go_round`, `gravitor.time.w9_windmill`, `gravitor.time.w9_gearbox`, `gravitor.time.w9_centrifuge`, `gravitor.time.w9_vortex`, `gravitor.time.w9_spin_cycle` |
| `gravitor.set.w10` | World 10 · Event Horizon | `gravitor.time.w10_horizon_line`, `gravitor.time.w10_mixed_signals`, `gravitor.time.w10_dark_matter`, `gravitor.time.w10_gravity_well`, `gravitor.time.w10_quiet_orbit`, `gravitor.time.w10_singularity`, `gravitor.time.w10_accretion`, `gravitor.time.w10_redshift`, `gravitor.time.w10_point_of_no_return`, `gravitor.time.w10_event_horizon` |
| `gravitor.set.w11` | World 11 · Depths | `gravitor.time.w11_first_drop`, `gravitor.time.w11_basement`, `gravitor.time.w11_glide_path`, `gravitor.time.w11_three_floors`, `gravitor.time.w11_stairwell`, `gravitor.time.w11_sinkhole`, `gravitor.time.w11_free_fall`, `gravitor.time.w11_undercroft`, `gravitor.time.w11_abyss`, `gravitor.time.w11_depths` |
| `gravitor.set.w12` | World 12 · Warp Gate | `gravitor.time.w12_warp_gate`, `gravitor.time.w12_jump_cut`, `gravitor.time.w12_wrong_ring`, `gravitor.time.w12_relay`, `gravitor.time.w12_shortcut`, `gravitor.time.w12_phase_shift`, `gravitor.time.w12_mirror_hall`, `gravitor.time.w12_teleporter`, `gravitor.time.w12_wormhole`, `gravitor.time.w12_warp_core` |
| `gravitor.set.w13` | World 13 · Vault | `gravitor.time.w13_first_key`, `gravitor.time.w13_key_ring`, `gravitor.time.w13_locksmith`, `gravitor.time.w13_strongroom`, `gravitor.time.w13_spare_key`, `gravitor.time.w13_deposit_box`, `gravitor.time.w13_master_key`, `gravitor.time.w13_safe_cracker`, `gravitor.time.w13_bank_job`, `gravitor.time.w13_vault` |
| `gravitor.set.w14` | World 14 · Storm Front | `gravitor.time.w14_breeze`, `gravitor.time.w14_crosswind`, `gravitor.time.w14_wind_tunnel`, `gravitor.time.w14_gusts`, `gravitor.time.w14_calm`, `gravitor.time.w14_updraft`, `gravitor.time.w14_headwind`, `gravitor.time.w14_jet_stream`, `gravitor.time.w14_cyclone`, `gravitor.time.w14_storm_front` |
| `gravitor.set.w15` | World 15 · Blackout | `gravitor.time.w15_lights_out`, `gravitor.time.w15_night_maze`, `gravitor.time.w15_blind_corner`, `gravitor.time.w15_glowworm`, `gravitor.time.w15_night_light`, `gravitor.time.w15_dark_side`, `gravitor.time.w15_eclipse`, `gravitor.time.w15_new_moon`, `gravitor.time.w15_pitch_black`, `gravitor.time.w15_blackout` |
| `gravitor.set.w16` | World 16 · Pulse | `gravitor.time.w16_heartbeat`, `gravitor.time.w16_rhythm`, `gravitor.time.w16_pulse_maze`, `gravitor.time.w16_syncopation`, `gravitor.time.w16_resting_rate`, `gravitor.time.w16_tempo`, `gravitor.time.w16_double_time`, `gravitor.time.w16_arrhythmia`, `gravitor.time.w16_flatline`, `gravitor.time.w16_pulse` |
| `gravitor.set.w17` | World 17 · Deep Vault | `gravitor.time.w17_key_drop`, `gravitor.time.w17_cellar_door`, `gravitor.time.w17_deep_storage`, `gravitor.time.w17_locker_room`, `gravitor.time.w17_dumbwaiter`, `gravitor.time.w17_safe_deposit`, `gravitor.time.w17_undervault`, `gravitor.time.w17_treasury`, `gravitor.time.w17_bottomless`, `gravitor.time.w17_deep_vault` |
| `gravitor.set.w18` | World 18 · Warp Storm | `gravitor.time.w18_warp_wind`, `gravitor.time.w18_static`, `gravitor.time.w18_thunderclap`, `gravitor.time.w18_lightning`, `gravitor.time.w18_drizzle`, `gravitor.time.w18_supercell`, `gravitor.time.w18_monsoon`, `gravitor.time.w18_hailstorm`, `gravitor.time.w18_typhoon`, `gravitor.time.w18_warp_storm` |
| `gravitor.set.w19` | World 19 · Night Shift | `gravitor.time.w19_night_drop`, `gravitor.time.w19_moonlight`, `gravitor.time.w19_nocturne`, `gravitor.time.w19_graveyard_shift`, `gravitor.time.w19_stargazer`, `gravitor.time.w19_midnight`, `gravitor.time.w19_dead_of_night`, `gravitor.time.w19_witching_hour`, `gravitor.time.w19_nightfall`, `gravitor.time.w19_night_shift` |
| `gravitor.set.w20` | World 20 · Singularity | `gravitor.time.w20_event_zero`, `gravitor.time.w20_graviton`, `gravitor.time.w20_tidal_force`, `gravitor.time.w20_spaghettify`, `gravitor.time.w20_quiet_zone`, `gravitor.time.w20_hawking`, `gravitor.time.w20_dark_energy`, `gravitor.time.w20_perihelion`, `gravitor.time.w20_last_light`, `gravitor.time.w20_singularity` |

### Achievements (all one-time, shown before earned)

| Achievement ID | Name | Points | Before earned | After earned |
|---|---|---|---|---|
| `gravitor.ach.first_clear` | Lift-Off | 10 | Finish your first level. | You finished your first level. |
| `gravitor.ach.clean_1` | Clean Orbit | 10 | Finish a level without falling. | You finished a level without a single fall. |
| `gravitor.ach.clean_25` | Steady Hands | 25 | Finish 25 levels without falling. | You finished 25 levels without falling. |
| `gravitor.ach.clean_100` | Untouchable | 50 | Finish 100 levels without falling. | You finished 100 levels without falling. |
| `gravitor.ach.first_try_10` | Natural Talent | 25 | Finish 10 levels on your first try without falling. | Ten levels, first try, no falls. |
| `gravitor.ach.streak_5` | In the Zone | 25 | Finish 5 levels in a row without falling. | Five flawless levels in a row. |
| `gravitor.ach.stars3_1` | Triple Star | 10 | Earn 3 stars on a level. | You earned 3 stars on a level. |
| `gravitor.ach.stars_150` | Star Collector | 25 | Earn 150 stars. | You collected 150 stars. |
| `gravitor.ach.stars_300` | Constellation | 50 | Earn 300 stars. | You collected 300 stars. |
| `gravitor.ach.stars_all` | Supernova | 100 | Earn every star in the game. | Every star in the game is yours. |
| `gravitor.ach.perfect_world` | Perfect World | 50 | Earn 3 stars on every level of a world. | A whole world, all 3 stars. |
| `gravitor.ach.levels_100` | Centurion | 25 | Finish 100 levels. | You finished 100 levels. |
| `gravitor.ach.levels_all` | Gravitor Legend | 75 | Finish every level. | You finished every level in Gravitor. |
| `gravitor.ach.dark_clean` | Night Vision | 75 | Finish every World 15 level in the dark without falling. | You beat World 15 in the dark without a single fall. |
| `gravitor.ach.shifts_250` | Gravity Bender | 25 | Shift gravity 250 times. | You bent gravity 250 times. |
| `gravitor.ach.pb_25` | Always Faster | 25 | Beat your own best time 25 times. | You beat your own best 25 times. |
| `gravitor.ach.comeback` | Never Give Up | 10 | Finish a level after falling 5 times in it. | Five falls, and you still made it. |
| `gravitor.ach.weekly_1` | Weekly Contender | 15 | Finish a Weekly Challenge. | You took on the Weekly Challenge. |
| `gravitor.ach.weekly_4` | Weekly Regular | 25 | Finish 4 different Weekly Challenges. | Four Weekly Challenges finished. |
| `gravitor.ach.world_01` | Cleared for Launch | 10 | Finish every level of World 1, Launch Deck. | You cleared World 1, Launch Deck. |
| `gravitor.ach.world_02` | Piston Proof | 10 | Finish every level of World 2, Piston Works. | You cleared World 2, Piston Works. |
| `gravitor.ach.world_03` | Wall Walker | 10 | Finish every level of World 3, Wall Walk. | You cleared World 3, Wall Walk. |
| `gravitor.ach.world_04` | Solid Ground | 10 | Finish every level of World 4, Crumble Belt. | You cleared World 4, Crumble Belt. |
| `gravitor.ach.world_05` | Rail Rider | 10 | Finish every level of World 5, Flux Rails. | You cleared World 5, Flux Rails. |
| `gravitor.ach.world_06` | Sky Walker | 10 | Finish every level of World 6, Skyward. | You cleared World 6, Skyward. |
| `gravitor.ach.world_07` | Short Circuit | 10 | Finish every level of World 7, Circuit. | You cleared World 7, Circuit. |
| `gravitor.ach.world_08` | Escape Velocity | 10 | Finish every level of World 8, Low Orbit. | You cleared World 8, Low Orbit. |
| `gravitor.ach.world_09` | Spin Doctor | 10 | Finish every level of World 9, Spin Cycle. | You cleared World 9, Spin Cycle. |
| `gravitor.ach.world_10` | Beyond the Horizon | 10 | Finish every level of World 10, Event Horizon. | You cleared World 10, Event Horizon. |
| `gravitor.ach.world_11` | Deep Diver | 15 | Finish every level of World 11, Depths. | You cleared World 11, Depths. |
| `gravitor.ach.world_12` | Gatekeeper | 15 | Finish every level of World 12, Warp Gate. | You cleared World 12, Warp Gate. |
| `gravitor.ach.world_13` | Vault Breaker | 15 | Finish every level of World 13, Vault. | You cleared World 13, Vault. |
| `gravitor.ach.world_14` | Storm Chaser | 15 | Finish every level of World 14, Storm Front. | You cleared World 14, Storm Front. |
| `gravitor.ach.world_15` | Lights Out | 15 | Finish every level of World 15, Blackout. | You cleared World 15, Blackout. |
| `gravitor.ach.world_16` | In the Rhythm | 15 | Finish every level of World 16, Pulse. | You cleared World 16, Pulse. |
| `gravitor.ach.world_17` | Treasure Hunter | 15 | Finish every level of World 17, Deep Vault. | You cleared World 17, Deep Vault. |
| `gravitor.ach.world_18` | Eye of the Storm | 15 | Finish every level of World 18, Warp Storm. | You cleared World 18, Warp Storm. |
| `gravitor.ach.world_19` | Night Owl | 15 | Finish every level of World 19, Night Shift. | You cleared World 19, Night Shift. |
| `gravitor.ach.world_20` | Singularity | 15 | Finish every level of World 20, Singularity. | You cleared World 20, Singularity. |

Total: 905 of Game Center's 1000 points.
