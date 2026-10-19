# Signing & Release — CerebraQ Companion

## Repository and current build

The configured GitHub publisher is `https://github.com/pratapgaokar/CrazyBuddy`. The app is currently `0.9.0`, the supported runtime is Node `20.11.0` / npm `10.2.4`, and the Windows target is an x64 NSIS installer. Build output is written to `release/` and should not be committed.

From the repository root:

```powershell
npm ci
npm run check
npm test
npm run release:win
```

`npm run release:win` runs the checks (19 tests) and then creates the installer. `npm run release:publish` adds `--publish always`; use it only when `GH_TOKEN` is set in the environment. Never put tokens or certificate files in the repository.

## GitHub Actions

`.github/workflows/ci.yml` runs `npm ci`, `npm run check`, and `npm test` for pull requests and pushes to `main`. For tags matching `v*`, it runs the same checks on Ubuntu, builds the installer on `windows-latest`, and uploads the `.exe` from `release/` as an artifact. The workflow does not contain signing credentials or publish automatically; a maintainer must review and publish the release.

## Auto-update publishing

1. Create and push the public repository `pratapgaokar/CrazyBuddy` (or update `build.publish` if the ownership changes).
2. Bump `version` in `package.json`, commit that version change, and create a tag such as `v0.9.1`.
3. For a GitHub Release, provide a GitHub token with the required repository release permission:

   ```powershell
   $env:GH_TOKEN = "<token supplied through your secret manager>"
   npm run release:publish
   ```

4. Install the new version over an older build and verify that **Check for updates**, the background update check, download, and install-on-quit behavior work as expected.

## Code signing

The current installer is unsigned, so Windows SmartScreen may show “Windows protected your PC”. Public distribution requires one of these external paths:

1. **Azure Trusted Signing:** create the Azure account/profile and configure electron-builder `azureSignOptions` through protected CI configuration.
2. **OV/EV certificate:** provide the certificate only through a protected secret or secure build machine, for example:

   ```powershell
   $env:CSC_LINK = "path\to\cert.pfx"
   $env:CSC_KEY_PASSWORD = "<password supplied through your secret manager>"
   npm run release:win
   ```

3. **Microsoft Store/MSIX:** use a separate Store packaging and review flow where Microsoft handles signing and updates.

Signing credentials, private keys, tokens, and passwords must never be committed.

## Release checklist

- [ ] `npm ci` succeeds from a clean checkout.
- [ ] `npm run check` passes.
- [ ] `npm test` passes all 19 tests.
- [ ] A clean Windows x64 build produces `release/CerebraQ-Companion-Setup-<version>.exe`.
- [ ] Install, launch, tray, `Ctrl+Alt+C`, reminders, calendar connect/disconnect, and quit behavior are verified.
- [ ] Privacy copy and external calendar-link handling are reviewed.
- [ ] Owned/licensed avatar assets are present for a commercial build.
- [ ] Installer is signed, or the unsigned beta warning is explicitly accepted.
- [ ] Previous-version → current-version update is tested when publishing.
- [ ] GitHub Release notes identify the version, known limitations, and support contact.
