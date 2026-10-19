# CerebraQ Companion v0.6.0 — Optimization & Launch Plan
Prepared 2026-10-16 from the actual v0.6.0 source (syntax check passes on all 5 JS files).

## What v0.6.0 already has (verified in code)
- Built-in hydration / break / eye-break reminders on a **screen-time clock** (sleep/lock pause, 5+ min away resets), queue + snooze + answer-timeout + cooldown in the main process
- Guided breaks (eye 20s, stretch/code-break 60s, step engine + progress + Skip)
- Custom reminders (max 12) + Code-break preset
- Meeting alerts from a private ICS link (Google/Outlook): lead + at-start alerts, new-invite detection, Join with a strict host whitelist (Meet/Teams/Zoom/Webex), link stored encrypted via safeStorage, never sent to the renderer
- Quiet hours (overnight ranges), hydration goal + daily counter, screen-time-today
- Tray, global shortcut Ctrl+Alt+C, single-instance lock, launch-at-login, pause 30m/1h/2h
- Character: custom WebGL renderer (no Three.js), one unrigged 0.65 MB GLB, procedural walk + shader blink/wink, ~30fps at idle, loop pauses when hidden
- Security posture is good: contextIsolation, sandbox, nodeIntegration off, CSP, settings sanitized in main
- Windows NSIS x64 installer, asar, electron-updater dependency present

## Optimizations (in impact order)
1. **Shrink the window.** It is full-screen-width × 680px, transparent, always-on-top, `backgroundThrottling:false` — the OS composites that whole surface even though the character is small. Move to a small window (~character+bubble+panel bounds) that repositions, or two windows (buddy / panel).
2. **Throttle the mousemove handler** (renderer.js): `elementFromPoint` runs on every mousemove event. Throttle to rAF/50 ms; the IPC toggle is already change-guarded.
3. **Stop writing to disk every 15s.** The tick calls `store.set('screenTime', …)` each tick (~4/min, all day, synchronous JSON write). Accumulate in memory; flush every 5 min, on lock/suspend/quit, and when the panel opens.
4. **Let the render loop actually stop at idle.** It still draws ~30fps whenever visible. Render one static frame when idle; wake on the blink/wink timer and on state changes. Cap DPR at 1.5 for this stylized model.
5. **Move calendar parsing off the main thread** (utilityProcess/worker). A 60-day horizon with up to 5,000 occurrences per recurring event, re-parsed every 5 min, can stall the main process. Add ETag/Last-Modified conditional fetch; alerts only need ~2 days, invite scan can be less frequent.
6. **Upgrade the toolchain.** Electron 29 is end-of-life (no Chromium security patches); electron-builder 24 / electron-store 8 are old. Move the *build* machine to Node 22 LTS (the README's Node 20.11 pin is a build-env constraint, not a runtime one) and current Electron, then re-test the NSIS build + safeStorage + global shortcut.
7. **Tests + CI.** Zero tests today. `calendar.js` and the settings sanitizers are pure — cover them with Node's built-in test runner (no new deps): recurrence expansion, cancelled/moved events, URL whitelist, quiet-hours overnight, snooze math. Add a GitHub Actions Windows job: check + test + build installer.
8. **Local rotating log + crash dumps (opt-in sending).** Today only `console.warn` — public users' bugs will be un-diagnosable. Add a small log file in userData and Electron crashReporter with local-only dumps by default.
9. **Modularize main.js (817 lines).** Split scheduler / calendar / settings / tray / updater into modules before adding features; it is the single point of failure for every future change.

## Launch blockers (not code features)
- **Code signing.** Installer is unsigned → SmartScreen "Windows protected your PC" for every new user. Get a cert (or Azure Trusted Signing) and wire `win.certificateFile` / `azureSignOptions`. Alternative: Microsoft Store (MSIX) — signing + auto-update handled by the Store.
- **Auto-update is scaffold only.** `electron-updater` is installed but there is no `publish` provider in package.json, so nothing updates. Configure GitHub Releases (or a static server), then test 0.6.0 → 0.6.1 end-to-end on a clean VM.
- **Windows x64 only.** No ARM64 build (Snapdragon laptops), no macOS. Electron code is mostly portable; macOS is a Phase-2 port, ARM64 is a builder target change.
- **No onboarding.** First run drops the user into a settings panel. Add a ~60-second wizard: pick reminders, water goal, paste calendar link (optional), launch-at-startup, shortcut check.
- **No privacy/support surface.** Local-only data is a selling point — say so on a simple page/in-app note ("your calendar link never leaves this PC"). Add a support email + feedback link in the tray/panel. Add a LICENSE file (package.json says MIT, no file exists).

## Feature roadmap
### Phase B — retention (data already collected, just not kept)
- **Daily history + streaks:** persist per-day aggregates (water, breaks taken/skipped, screen time, focus) → streaks, a 7-day view in the panel. Today everything resets at midnight with no history.
- **Morning briefing:** on first unlock of the day — today's meetings (already parsed), water goal, first meeting time.
- **Post-meeting break:** after 60–90 min of back-to-back meetings, suggest a real break (meetings data already available).
- **Pomodoro / Focus mode:** proper focus timer that auto-pauses reminders (except meetings) and logs sessions. A resumable Pomodoro already exists in the CrazyBuddy scaffold — port it.
- **Battery + idle nudges, time-of-day greetings:** also already built in the CrazyBuddy scaffold (EventBus with priority/dedupe/cooldown) — port the alert sources, not the character.
- **More guided content:** breathing 4-4-4, neck/shoulder rotation, posture check — the guide step engine already supports this with data only.

### Phase C — differentiation
- **Skins / multiple buddies + a rigged GLB** with real idle/walk clips (model.js header already anticipates this swap), outfits unlocked by streaks.
- **Developer alerts:** loopback-only `POST /notify` webhook (build/CI/test results) — already built in CrazyBuddy; pairs with the Code-break preset for a dev audience.
- **Multi-calendar** (work + personal ICS), per-calendar lead times.
- **Rule-based smart timing:** shift intervals based on when the user actually takes breaks — local only, no ML needed at v1.

### Monetization (if consumer launch, decide before Phase C)
Free core (3 reminders, meetings, guided breaks) + Pro one-time license: unlimited custom reminders, multi-calendar, skins, advanced stats, sound packs. Needs a license-key check (local validation + a simple key server or Gumroad/Stripe license API). Microsoft Store IAP is the alternative if distributed there.

## Suggested sequence
- **Phase A — Optimize & harden (do first):** items 1–5 + 7–8 above, no behaviour change. Result: lower battery/CPU, diagnosable, test-covered.
- **Phase B — Launch polish:** signing, real update channel, onboarding wizard, daily history/streaks.
- **Phase C — Features:** Pomodoro/focus, morning briefing, post-meeting break, battery/idle ports, breathing guides, skins.
- Then: clean-VM install test, SmartScreen check, update test, 5-user beta before any public launch.
