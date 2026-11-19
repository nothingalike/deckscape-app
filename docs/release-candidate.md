# Internal candidate and remaining distribution gates

The assembled candidate contains the exact qualified Windows x64 installer and
Linux x64 AppImage, checksums, dependency/runtime notices and evidence links.
Mac artifacts remain absent until the user runs the prepared native procedures.
This is an internal development candidate. Public-release readiness remains false.

Run `node tools/assemble-internal-candidate.mjs` after the platform records and
package-content audits are current. It creates a new folder under
`release/internal-candidates/`, verifies copied artifact hashes, and records the
folder in `.local/internal-candidate.json`. Each invocation preserves earlier
builds. Keep the source/fixture qualification bundle private; it includes cached
artwork and synthetic saved games and is separate from player installers.

## Evidence currently available

- Windows 11 x64, kernel 10.0.26200: full installed journey with 30 steps, 214 passing tests
  and one expected Linux-only skip, both real installed predecessor upgrades,
  secure native restore/relaunch, and Linux-origin backup input/reopen.
- Ubuntu 22.04.3 x64 under WSLg 1.0.79: X11 and Wayland each pass 30 steps and 215
  tests, both supported upgrade fixtures, secure actual AppImage restart and
  Windows-origin backup input/reopen. Linux-origin backup passes in installed
  Windows. Native chooser completion, real Linux browser and physical desktop
  configurations remain unqualified.
- Both application archives have 8,299 inspected files, retained notices and no
  detected private operational paths or named credential patterns. The scan is
  bounded; source/artwork permission is a separate prerequisite.
- All 600 reused source/local hashes match the provenance manifest; the pinned
  read-only reference checkout remains unchanged. Production notices cover 21
  packages with no missing declarations/license files in this tree.

The manifest links the exact review evidence and records missing Mac targets,
source/provider/artwork grants, signing/notarization, native Linux integration
and release delivery. The original hosted service remains separate.

## Prepared signing configuration

`electron-builder.distribution.cjs` is a separate, explicit profile. It retains
the internal app contents, requires code signing, enables signed Windows output,
and configures macOS Hardened Runtime, signing, notarization, JIT entitlements
and signed DMGs. It writes to `release/signed-candidates` and has no publish
provider. Commands also force `--publish never`. Current internal commands keep
their existing unsigned/ad-hoc behavior.

The profile follows the pinned [builder v26 signing configuration](https://www.electron.build/v26/docs/features/code-signing/)
and [notarization requirements](https://www.electron.build/v26/docs/notarization/).
The two JIT entitlement keys follow its documented Electron template. This
configuration passed the installed builder schema; signed builds, native Mac
execution, notarization and Gatekeeper acceptance remain unverified.

After source/integration/artwork permissions and target qualification are
recorded, use an explicitly authorized existing signing identity. Supply secrets
through the build host's secret environment; store no certificate, private key
or password in this repository. No identity was acquired or provider contacted.

For Windows, configure `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` for the selected
certificate, then run on the qualified Windows host:

```powershell
npm run build
node node_modules/electron-builder/cli.js --config electron-builder.distribution.cjs --win nsis --x64 --publish never
```

For Mac, configure the authorized Developer ID Application certificate through
`CSC_LINK`, `CSC_KEY_PASSWORD` and the selected `CSC_NAME`. Use an existing
notarization credential set: either `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and
`APPLE_TEAM_ID`, or the API-key variables documented by builder v26. Build each
architecture on the native Mac qualification host:

```sh
npm run build
node node_modules/electron-builder/cli.js --config electron-builder.distribution.cjs --mac dmg --arm64 --publish never
node node_modules/electron-builder/cli.js --config electron-builder.distribution.cjs --mac dmg --x64 --publish never
```

## Verify the signed outputs before accepting them

Windows: check both the installer and its installed application. Require
`Status` to equal `Valid` and confirm the signer is the selected authorized
publisher. A successful build alone is insufficient.

```powershell
Get-AuthenticodeSignature -LiteralPath 'INSTALLER_PATH' | Format-List Status,SignerCertificate
Get-AuthenticodeSignature -LiteralPath 'INSTALLED_APP_PATH' | Format-List Status,SignerCertificate
```

Mac: substitute actual paths, verify the selected Developer ID/Team ID, and keep
command output separately for each architecture:

```sh
codesign --verify --deep --strict --verbose=2 'APP_PATH'
codesign -dv --verbose=4 'APP_PATH'
spctl --assess --type execute --verbose=4 'APP_PATH'
xcrun stapler validate 'APP_PATH'
codesign --verify --verbose=2 'DMG_PATH'
```

Then rerun the installed journey on those exact signed artifacts. Preserve the
SHA256, signature/notarization output, architecture/translation and OS/GPU
evidence. The current unsigned Windows installer reports `NotSigned`; no signed
or notarized readiness is claimed.

The app's normal release metadata/download configuration remains null in
`src/data/app-releases.json`. Select approved delivery locations and update that
configuration only after the release record is reconciled. Artifact publication,
provider contact, credential purchase, commits and pushes remain outside this
internal-candidate procedure.

## GitHub download builds

The separate [GitHub release workflow](github-releases.md) builds native player
installers and collects them on a draft release. It preserves this internal
candidate procedure and its sealed artifacts. A hosted packaging run is recorded
separately from installed qualification, signing and the existing distribution
prerequisites. The maintainer reviews the completed draft before publishing it.
