# CerebraQ Companion — Launch Plan

Status reviewed against the current `0.9.0` tree. The repository root is the folder containing `package.json`; application code is in `src/`, tests are in `test/`, generated installers go to `release/`, and GitHub Actions is defined in `.github/workflows/ci.yml`.

## Current release state

- Windows x64 Electron desktop app with an NSIS target, asar packaging, tray integration, auto-update scaffolding, reminders, guided breaks, calendars, history, focus mode, sounds, and selectable avatars.
- Reproducible Node `20.11.0` / npm `10.2.4` setup pinned by `.nvmrc`, `package.json` engines, and `package-lock.json`.
- `npm ci` installs dependencies; `npm run check` validates the JavaScript files used by the app; `npm test` runs **19 passing tests** covering calendar parsing, settings sanitization, schedules, quiet hours, and history/streak behavior.
- `Dockerfile` provides the Linux dependency install and an Xvfb-based smoke launch. Windows installer creation remains a Windows-only build because the configured target is NSIS.
- `package.json` publishes to GitHub owner `pratapgaokar`, repository `CrazyBuddy`. `npm run release:win` checks and builds; `npm run release:publish` also invokes electron-builder publishing.

## CI and release flow

1. Work from the repository root and run `npm ci`, `npm run check`, and `npm test`.
2. Pull requests and pushes to `main` run those three commands on Ubuntu in `.github/workflows/ci.yml`.
3. Create a version tag such as `v0.9.1`. The tag workflow repeats the checks, builds the Windows NSIS installer on `windows-latest`, and uploads `release/*.exe` as an artifact.
4. For a GitHub Release, set `GH_TOKEN` in the maintainer environment and run `npm run release:publish`, or publish the generated installer manually. Bump `version` before building.
5. Test installation and update behavior on a clean Windows machine before announcing the release.

## Privacy and support position

User settings, history, logs, and crash data are local to the PC. Calendar links use Electron `safeStorage`/Windows DPAPI when available, are not exposed to the renderer, and are removed by **Disconnect**. Calendar contents are fetched from the configured ICS URL; meeting URLs are opened only after the user presses **Join** and only for the supported host allowlist. Developer alerts are loopback-only. This local-data statement should remain in release notes and support material.

## Current desktop-companion shell milestone

The renderer now includes a deterministic interaction layer (`src/renderer/interaction.js`)
and a compact shell for everyday use:

- radial quick actions for controls, focus, water, mood, celebration, and sleep
- compact dashboard cards for focus, water, next meeting, and mood
- cursor-aware facing, long-press petting, and drag-to-place behavior
- main-process Sleep mode that pauses screen-time/reminder scheduling until the global shortcut wakes the companion
- pure interaction tests that keep the gesture/action rules regression-safe

The next validation step is a real Windows smoke test of the click-through window,
right-click menu, long-press gesture, Sleep mode, and global shortcut.

## Remaining external requirements

- **GitHub repository and release credentials:** create `pratapgaokar/CrazyBuddy`, configure repository permissions, and store a suitable `GH_TOKEN` outside the repository. No token belongs in source, workflow files, or `.env` committed to git.
- **Code signing:** the installer is unsigned. Obtain Azure Trusted Signing or an OV/EV certificate and configure the required CI secrets/environment variables before public distribution; otherwise SmartScreen will warn users.
- **Clean-machine validation:** verify install, first launch, tray/shortcut behavior, calendar connection/disconnect, updater, and uninstall on a supported Windows x64 machine.
- **Asset rights:** replace or verify redistribution rights for the sample Mixamo-style `buddy.glb` and `robo.glb` assets before a commercial release.
- **Product support:** choose a public support contact and feedback channel, and document the supported Windows version and x64-only scope.
- **Optional external services:** calendar providers must expose a usable private ICS URL; the app does not proxy or host calendar data.

## Post-release roadmap

- Add a first-run onboarding flow and a clear in-app privacy/support surface.
- Add an ARM64 Windows target and evaluate macOS only after the Windows release is stable.
- Replace sample characters with owned/licensed production assets.
- Run a small beta, collect installer/update results, and only then broaden distribution.
