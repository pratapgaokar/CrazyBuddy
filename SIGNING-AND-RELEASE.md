# Signing & Release — CerebraQ Companion

## Auto-update (configured in 0.7.0)
`package.json > build.publish` now points at GitHub Releases:
`github.com/pratapgaokar/cerebraq-companion`

Before the first published release:
1. Create that repo (public, so the updater can read releases without a token) and push this source.
2. Installed copies check on launch and every 6 hours, download in the background, and install on quit. The tray also has **Check for updates**.
3. To publish a release: bump `version` in package.json, then run with a token:
   ```powershell
   $env:GH_TOKEN = "<github token with repo scope>"
   npx electron-builder --win nsis --x64 --publish always
   ```
4. Test the path once before announcing anything: install 0.7.0, publish 0.7.1, confirm a running 0.7.0 copy offers/installs it.

If the repo name differs, change the two `publish` fields in package.json — nothing else references it.

## Code signing (removes the SmartScreen warning)
Unsigned installers trigger "Windows protected your PC" for every new user. Options, in order of effort:

1. **Azure Trusted Signing** (cheapest, no USB token): create a Trusted Signing account + certificate profile in Azure, then in package.json `build.win` add:
   ```json
   "azureSignOptions": {
     "endpoint": "https://eus.codesigning.azure.net/",
     "certificateProfileName": "<your profile>",
     "codeSigningAccountName": "<your account>"
   }
   ```
2. **OV/EV certificate file**: set environment variables (never commit the cert or password):
   ```powershell
   $env:CSC_LINK = "path\to\cert.pfx"
   $env:CSC_KEY_PASSWORD = "<password>"
   npm run dist
   ```
   electron-builder picks these up automatically.
3. **Microsoft Store (MSIX)**: signing and updates are handled by the Store; use the `appx` target in electron-builder. Different review process; best if you want Store discovery too.

Until one of these is done, expect beta testers to need "More info → Run anyway".

## Release checklist
- [ ] `npm run check` and `npm test` pass (15 tests)
- [ ] `npm run dist` on a clean Windows VM; install, first-run wizard appears
- [ ] Walk-in, panel height (small closed / full open), shortcut Ctrl+Alt+C
- [ ] Calendar: connect, meeting alert with Join, add a second calendar, Disconnect
- [ ] Focus 25 min from tray and panel; meeting alert still fires during focus
- [ ] Quit from tray really quits (installer can replace files while closed)
- [ ] Update test (previous version → this version) if publishing
