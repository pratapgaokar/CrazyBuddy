# CerebraQ Companion

CerebraQ Companion is a personal floating desktop companion for hydration, break, and eye-break reminders. This build is pinned for the user's current Windows setup:

- Node.js: `20.11.0`
- npm: `10.2.4`
- Electron: `29.4.6`
- electron-builder: `24.13.3`

Do not use the latest Electron or electron-builder packages with Node 20.11.0. Newer dependency chains can require Node 22 or Node 22.12 and may appear stuck during `npm install` at steps such as `app-builder-lib/reify`.

## Setup

1. Stop any stuck install with `Ctrl + C`.
2. From this project folder, remove the failed install if it exists:

   ```powershell
   Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue
   ```

3. Confirm the version:

   ```powershell
   node -v
   npm -v
   ```

   Expected:

   ```text
   v20.11.0
   10.2.4
   ```

4. Install:

   ```powershell
   npm install
   ```

   This project keeps npm's cache inside `.npm-cache` so the install does not depend on access to the global Windows npm cache.

5. Run:

   ```powershell
   npm start
   ```

## Useful Commands

```powershell
npm run check
npm test
npm start
npm run dist
```

`npm run dist` creates a Windows installer in the `release` folder.

## Reproducible setup

The supported runtime is pinned in `.nvmrc` and `package-lock.json`.

```bash
nvm install
nvm use
npm ci --cache .npm-cache
make test
make check
```

To run the desktop app locally, use `make run` (a graphical desktop session is
required). The same dependency installation and test suite can run in Docker:

```bash
docker build -t cerebraq-companion .
docker run --rm cerebraq-companion
```

The Docker command starts Electron under Xvfb. To create the Windows installer,
run `npm run dist` on a supported Windows development machine. The generated
installer is written to `release/` and is not committed.

## What's new in 0.9.0 — rigged avatars (renderer swap)

- **Two engines, one companion.** The classic dragon (custom WebGL) now shares the stage with a **Three.js skinned-avatar engine** (`src/renderer/model3d.js`). Pick your avatar in the panel: **Dragon (classic)**, **Buddy**, or **Robo**. Switching is instant, and if a rigged avatar ever fails to load, the dragon comes back automatically — never a blank window.
- **Real animation clips.** Rigged avatars play actual skeletal clips matched by keyword (idle / walk / celebrate / wave / sad), so walking, celebrating and waving are real motion, not transform tricks. Double-click celebration uses the character's own celebrate clip (Buddy: "agree", Robo: "Dance"); Robo even waves back on a click.
- **Held props.** During a water reminder, the rigged avatar **holds a water glass** — a procedural glass (with water in it) attached to the right-hand bone (Buddy) or presented beside the body (Robo has no finger bones). More props can be added the same way.
- **Sample avatars, honestly labelled.** `assets/buddy.glb` (2.9 MB) and `assets/robo.glb` (0.5 MB) are the sample characters from the three.js examples (Mixamo-sourced) — great for testing the engine. **Before a commercial release, replace them with characters you have the rights to.** Any Mixamo-style GLB works: name its clips with the keywords above (idle/walk/agree/wave/dance/sad) and drop it in as `assets/buddy.glb` or `assets/robo.glb`.
- Three.js r128 is vendored under `src/renderer/vendor/` (MIT) so the app stays fully offline with no build step.

## What's new in 0.8.0 — the "feels alive" release (PixelFriend gap-closers)

- **Drag me.** Drag the companion along the bottom of the screen to its new home spot; it is remembered between launches. A plain click still opens the panel (now with a little wave-hop), and a **double-click makes it celebrate**.
- **Fullscreen & call quiet.** On Windows the companion now detects fullscreen apps, presentation mode and Direct3D fullscreen (via `SHQueryUserNotificationState`, polled every 30s) and stays completely out of the way until it ends — no walk-ins, no toasts. Toggle: *Stay quiet during fullscreen apps, presentations and calls*.
- **Sound.** A soft two-note chime when the companion arrives (toggle + volume in the panel), and **procedural ambient focus sounds** — rain, thunderstorm (with distant thunder), garden birds, sea shore, forest, café — synthesized live with WebAudio, no audio files. Pick one under *Focus*; it plays while a focus session runs, and *Test sound* previews it any time.
- **Scheduled reminders.** Custom reminders can now fire **at a set time on chosen days** (per-reminder mode: *Every N min* or *At a time*, with day chips), in addition to interval reminders.
- **Birthday & special days.** Set your birthday (MM-DD) in the panel and the morning briefing becomes a birthday greeting that day — it fires even if briefings are off. New Year and Christmas get a greeting line too.
- **Calm animations.** *Animations: Calm* turns off the idle winks for a quieter companion.

## What's new in 0.7.1

- **UI refresh.** CerebraQ brand theme (navy #091D3D / orange #FA7F25) across the panel and speech bubble: gradient orange primary buttons, toggle switches instead of plain checkboxes, rounded cards for reminders and custom items, a highlighted water stat, a teal gradient 7-day chart, styled scrollbar, keyboard focus rings, a bubble tail, a panel entrance animation, and reduced-motion support. Purely visual - no behaviour, layout geometry or settings changed.

## What's new in 0.7.0

- **Performance:** the window is only ~280px tall while the panel is closed (full height when open) so Windows composites far less transparent surface; screen time is accumulated in memory and written to disk at most every 5 minutes instead of every 15 seconds; mouse hit-testing is throttled to animation frames; the 3D model drops to ~10fps in deep idle and caps pixel ratio at 1.5; calendar parsing runs in a worker thread.
- **Focus mode (Pomodoro).** Panel > *Focus*, or tray > *Start focus* (25/50/90 min or custom). While a session runs, reminders are held but meeting alerts still arrive. Finishing a session is celebrated and logged. Sessions survive an app restart.
- **History, streaks and a 7-day view.** The panel now shows your water-goal streak, breaks taken and focus sessions today, and a 7-day water chart. Only per-day totals are kept, for 90 days, on this PC.
- **Morning briefing.** Once a day, on first activity: today's meetings (count + first one) and your water goal. Toggle: *Morning briefing*.
- **Post-meeting break.** After 60+ minutes of back-to-back meetings, the companion suggests a short guided posture break when the block ends.
- **Battery + welcome-back.** A low-battery nudge (once per 4 hours) when the laptop hits 20% unplugged, and a "welcome back" after 30+ minutes away.
- **Multiple calendars.** Connecting another ICS link *adds* a calendar (up to 4) instead of replacing the first. *Disconnect* removes all. Existing single-link setups migrate automatically.
- **New guided presets:** *+ Breathing* (4-4-4, 60s) and *+ Posture* (60s) in Custom reminders.
- **First-run setup.** A short welcome panel on first launch (existing users see it once after upgrading).
- **Companion colours.** *Companion colour* in the panel: Original, Sunset or Ocean.
- **Developer alerts.** Optional loopback webhook: enable *Developer alerts*, then `POST http://127.0.0.1:17341/notify` with JSON `{"title": "...", "message": "..."}` from build/CI scripts. Localhost only.
- **Under the hood:** settings/history logic extracted into tested modules (`npm test` — 15 tests covering calendar parsing, settings sanitizing, quiet hours and streaks); a rotating log at `%APPDATA%/cerebraq-companion/logs/companion.log`; local-only crash dumps for support; tray *Check for updates*; auto-update channel configured for GitHub Releases — see `SIGNING-AND-RELEASE.md` (signing steps included).

## What's new in 0.6.0

- **Meeting alerts (Teams, Google Meet, Zoom, Webex).** Open the panel > *Meetings*, paste your calendar's private ICS link and press **Connect**. The companion walks in 5 minutes before a meeting (configurable, 1-60) and again when it starts (optional), with a **Join** button that opens the Meet/Teams link, or **In 1 min** to be nudged again. Meeting alerts jump ahead of other reminders and ignore pause and quiet hours.
  - Google Calendar: Settings > your calendar > *Secret address in iCal format*.
  - Outlook / Teams: Settings > Calendar > Shared calendars > Publish a calendar > the *ICS* link.
  - Recurring meetings, moved/cancelled occurrences and time zones are handled. All-day events are skipped. The calendar is re-read every 5 minutes and after sleep or unlock.
  - **New invites:** when a new event appears on your calendar the companion tells you once ("New on your calendar: ..."). The first sync only records what is already there. Switch off with *Tell me about new invites*.
  - **Privacy:** the link is stored encrypted on this PC (Windows DPAPI via Electron safeStorage; if the OS has no key store it is only obfuscated), is never shown again or sent to the app window, and is only used to download your calendar. Only https links to Meet, Teams, Zoom and Webex are ever opened, and only when you press Join. *Disconnect* deletes it. Treat the link like a password: anyone who has it can read your calendar.
- **Custom reminders.** Panel > *Custom reminders*: add your own (name, message, every N minutes of screen time). **+ Code break** adds a ready-made one (every 50 min) that runs a 60-second guided break: save/commit, stand up, stretch, breathe.
- Tray > **Test meeting alert** shows what a meeting alert looks like.
- New dependency: `ical.js` 1.5.0 (pure JavaScript, no sub-dependencies, fine on Node 20.11). Run `npm install` again.

## What's new in 0.5.0

- **Guided breaks.** Say Yes to an eye break (20 s) or a stretch break (60 s) and the companion stays and counts it down in its bubble, with a progress bar and a **Skip** button: "Look at something far away... (14s)", "Now blink slowly...", then a wink and a cheer. Other reminders are held back while it runs. Turn it off with **Guided breaks** in the panel. Tray > Test reminder shows a 6-second demo.
- **Global shortcut: Ctrl+Alt+C** calls the companion from anywhere (it walks in) and opens the panel. Press it again to close the panel and send it off. If another app already owns the shortcut, it is skipped and a warning is logged.

## What's new in 0.4.3

- Fixed: after "Remind me later" (or any exit) an invisible area at the bottom-left of the screen could block clicks. The companion's window spans the bottom of the screen and relies on click-through, which on Windows can get stuck. Now the window hides completely whenever the companion is off screen (it is never hidden while a reminder is waiting) and comes back for the next reminder or from the tray. The companion's outer box is also no longer clickable; only the character, bubble and panel are.

## What's new in 0.4.2

- **Reminders now count screen time**, not mouse/keyboard activity. Previously 5 minutes without input restarted every clock, so watching a video, reading or sitting in a call meant reminders never came. Now the clock runs whenever the screen is on and unlocked. Sleep and lock pause it; being away 5+ minutes counts as a break and restarts the clocks. "Remind me later" snoozes in screen time too.
- **Screen time today** is shown in the panel and the tray tooltip.
- Fixed: the companion stood there after "Hi! I am here." It now greets (with a wink), then walks off after ~4 s unless you click it. Closing the panel by clicking it again also lets it leave.
- Fixed: the settings panel was clipped on the right and the footer covered the Quit row on scaled displays. Reminder cards are one row each now.
- Windows note: Electron is not told when the monitor merely switches off after the display timeout (without lock or sleep). If that matters, turn on "require sign-in" so it locks.

## What's new in 0.4.1

- Fixed: the companion cut out and vanished partway through walking off. Leftover CSS transitions on the exit classes made the drawn character lag behind its real position, then snap away when the walk ended. Transitions are now off for the character, so it walks fully off screen. Also stopped Electron from throttling the window while another app has focus.

## What's new in 0.4.0

- **Expressions.** The dragon was painted with one eye permanently winking. It can now open both eyes, blink, and wink on either side:
  - random natural blinks (sometimes a double blink)
  - a cheeky idle wink every 15-45 s while it stands facing you
  - **Yes** = the signature wink + happy hops; the goodbye after **Save** / **x** winks too
  - **Remind me later** = heavy, drooping lids
  - a wink when you click it or when it walks in to say hi
- How: the mesh is still one un-rigged texture, so the eyes are done in the shader. At load, every vertex around one eye gets the UV of the mirrored point on the other eye, which lets the shader show either painting on either eye, with a lid line that sweeps up and down (see the header of `src/renderer/model.js`).
- Use from code: `CompanionModel.wink('right' | 'left' | 'both', holdMs)`, `CompanionModel.blink()`, and `CompanionModel.set({ autoBlink: false, autoWink: false })`.
- Debug: open `index.html?debugEyes` to tint the two eye zones.

## What's new in 0.3.2

- **Save** closes the panel and the companion says goodbye and walks off
- **x** closes the panel only (and the companion walks off); it no longer hides the whole window. Reminders always run, and the companion walks back in when one fires
- Clicking the companion while it is leaving makes it stay and opens the panel
- Tray icon click always brings the companion back; "Hide until next reminder" is in the tray menu

## What's new in 0.3.1

- Fixed: the installer (and updater) could hang on "app cannot be closed" because the running companion ignored the close request and only hid itself. Closing now really quits. Added a Quit button to the panel.

## What's new in 0.3.0

- **Real walking.** The dragon turns side-on, hops and waddles at a pace matched to the distance it covers (feet alternate, head nods, tail whips), then turns to face you. Yes = happy hops and a bouncy run off to the right; Remind me later = a slow, drooping trudge off to the left. Tray > Show Companion walks it back in.
  The model is a single un-rigged mesh, so this is procedural (see the header of `src/renderer/model.js`). For true leg-by-leg animation, supply a rigged GLB with idle/walk clips.
- Quiet hours (overnight ranges supported) and a daily water counter/goal (Yes on a hydration reminder counts a glass)
- Render loop pauses when hidden and drops to ~30fps at rest; model file 1.7 MB -> 0.67 MB
- Auto-update scaffold (see below)
- Fixed: Yes / Remind me later buttons stayed visible after answering

### Enabling auto-update

1. Put the project on GitHub and add to `build` in `package.json`:
   ```json
   "publish": [{ "provider": "github", "owner": "YOUR_USER", "repo": "YOUR_REPO" }]
   ```
2. Set `GH_TOKEN`, bump `version`, then run `npx electron-builder --win nsis --x64 --publish always`.
3. Installed copies check on launch and every 6 hours, download in the background, and install on quit.
4. Sign the installer (certificate or Azure Trusted Signing) to avoid SmartScreen warnings; see electron-builder's `win.certificateFile` / `azureSignOptions`.

## What's new in 0.2.0

- Click-through window: the transparent window no longer blocks clicks on apps beneath it
- Real snooze ("Remind me later" waits N minutes, configurable)
- Reminder scheduler moved to the main process: pauses on sleep/lock, restarts timers when you were away, queues reminders one at a time
- Single-instance lock, Windows AppUserModelID, real tray/app icons
- Launch at startup option, tray: Test reminder / Pause reminders
- Settings validated in the main process; sandboxed renderer with a CSP

## Current Features

- Transparent always-on-top floating companion window
- Original mischievous cartoon-kid companion
- Companion walks in from the left when a reminder fires
- Reminder question bubble with Yes and Remind me later actions
- Reliable clickable reminder buttons inside the transparent desktop window
- Happy reaction and right-side exit after Yes
- Sad reaction and left-side exit after Remind me later
- Click companion to open/close the control panel
- Hydration, break, and eye-break reminders
- Enable/disable each reminder
- "Done" and "Remind me later" actions
- Native desktop notifications
- System tray menu
- Local settings storage
- Basic event-to-reaction structure for future companion skills
