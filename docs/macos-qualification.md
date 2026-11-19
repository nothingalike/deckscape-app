# Run the prepared Mac qualification

The user will run this procedure later. Mac acceptance remains open until results are returned for Apple Silicon and Intel. The shared driver and original Pixi/input procedure pass on Windows; the Mac command's native-host guard is verified. No Mac artifact or runtime result has been claimed.

Use macOS 13 or later. This is the platform floor of pinned Electron 45.3.2, whose [platform support](https://github.com/electron/electron/blob/v45.3.2/README.md#platform-support) includes Ventura and newer. Keep actual tested versions separate from this intended floor. The build uses an internal ad-hoc signature and disables Hardened Runtime, following the [pinned builder generation's Mac options](https://www.electron.build/v26/docs/mac/). Public Developer ID signing and notarization remain release prerequisites.

## Prepare the private source bundle on Windows

From this repository run:

```powershell
npm run qualification:bundle
```

Copy `release/mac-qualification-source.zip` to each Mac through your normal private transfer method. `.local/mac-qualification-bundle.json` records its SHA256. The ZIP includes the source, locked dependencies, scripts and a Windows-origin profile fixture with cached artwork and a private saved match. It excludes installed dependencies, credentials, `.git`, general `.local` data and generated application artifacts. Keep this qualification bundle private. Extract it into a new folder on the Mac and open a terminal in its `neuroscape-app` directory.

## Build on the Mac

The maintainer host needs Node.js 24.5 or later and npm. Players of the packaged app do not need these tools. Run:

```sh
node --version
npm ci
npm run typecheck
npm run package:mac
```

The default target is the build Node process's architecture. Use `npm run package:mac -- --arch=arm64` on Apple Silicon or `--arch=x64` on Intel. `--arch=both` can produce both candidate artifacts, but each target still needs execution evidence. Record any x64 run through Rosetta as translated execution; keep native Intel coverage open if only translation was tested.

The command records `.local/mac-build.json`, produces internal DMG artifacts under `release/`, uses no distribution credentials and forces publication off. It stops before packaging on Windows or Linux. The application build and its runtime dependencies stay pinned by `package-lock.json`.

## Install and run the shared proof

Open the DMG in Finder and copy its app into a new empty folder you own. Keep each architecture separate and preserve any existing Neuroscape installation. Use the locally built app for this internal test. Leave system-wide Gatekeeper settings intact; if macOS requires approval for this specific development build, record the prompt and the approval used.

Set the paths to the copied app's executable and the actual DMG:

```sh
export NEUROSCAPE_EXE="/full/path/Neuroscape Local.app/Contents/MacOS/Neuroscape Local"
export NEUROSCAPE_INSTALLER="/full/path/to/the-built.dmg"
npm run test:desktop
npm run test:platform-render
```

The first proof checks isolated SQLite deck-name persistence, reopen, second-instance yielding, the named preload boundary and sandbox preferences. The second validates the supplied Windows-origin archive, prepares an isolated profile from it and resumes the original Pixi game offline. It checks native artwork decoding, canvas dimensions, original player input and committed-state reopening. It records GPU features and the actual app process architecture. This narrow fixture preparation is separate from the full native restore/upgrade journey required by ticket 20.

Keep these generated files:

- `.local/mac-build.json`, `.local/desktop-proof.json` and `.local/desktop-proof.png`.
- `.local/platform-render-proof.json`, `.local/platform-render-before.png` and `.local/platform-render-after.png`.
- The build/command output, DMG checksum and any failure screenshot.

The automated proof preserves the Chromium sandbox. The shared driver explicitly enables it because Playwright's Electron launcher otherwise disables it on Linux. Temporary inspector flags belong to the qualification driver; ordinary app startup uses its normal boundary.

## Check native integration manually

Record the Mac model, `sw_vers` output, actual installed-app architecture and whether the run was native or translated. Inspect the captured GPU information and screenshots. Resize/minimize/restore the app and exercise the original game controls.

Use the isolated profile from the render proof for manual checks:

```sh
export NEUROSCAPE_PROFILE_DIR="$(node -p 'require("./.local/platform-render-proof.json").profileDirectory')"
"$NEUROSCAPE_EXE"
```

In Backups, open the native save dialog and cancel it, then create a complete backup outside the profile folder. Confirm the dialog and resulting file work on this host. Open an existing external card/rules link and confirm that the system browser opens while the app keeps its game. Close and reopen the app with the same profile and check the latest committed action. Record the per-user app-data root from the proof, the exact isolated profile path and any path/dialog/font/input failures.

Return the evidence separately for Apple Silicon and Intel. Include exact macOS version, architecture/translation, DMG size/SHA256, measured startup and memory from the JSON, GPU/rendering observations, native-dialog/browser results and any errors. A package build alone does not pass this ticket. Full catalog/offline-game/restore/upgrade qualification remains ticket 20.

## Full player journey after the narrow proof

On each architecture, run [the shared installed qualification](installed-qualification.md)
against the copied DMG application, with `NEUROSCAPE_EXE` and
`NEUROSCAPE_INSTALLER` still set. Preserve the unique qualification folder even
when a step fails. This performs fresh official sync and the full offline
deck/editor/interchange/game/resume/recovery/backup/restore/release checks.

Run `npm run test:platform-render` with the supplied Windows-origin fixture to
qualify portable decks and the pinned original game. After the full backup
proof, run `node --import tsx tools/prepare-portability-fixture.ts` and return the
private `.local/portability-export` folder for a Windows/Linux return check.

Qualify native save/open/confirmation dialogs and the actual system browser
separately. The automated suite controls their response boundaries. Record native
architecture versus Rosetta, exact OS/GPU, app/DMG hashes, startup/memory and each
failed or excluded case for Apple Silicon and Intel independently.

Native upgrade checks require a separate matching-architecture internal 0.1.0
predecessor. With that artifact available, set `NEUROSCAPE_PREDECESSOR_EXE` and run
`node tools/qualify-platform-upgrade.mjs`. Record its source/build identity. If no
native predecessor is available, leave that upgrade combination unqualified and
return the remaining results. Windows executable evidence does not qualify a
Mac upgrade. All ticket-20 acceptance remains open until native evidence exists.
