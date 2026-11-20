# Neuroscape Local

A desktop app for local Neuroscape deckbuilding and solo bot play, in development for Windows, macOS, and Linux.

**[Download the latest version](https://github.com/nothingalike/deckscape-app/releases)** | [Contribute](#contributing)

## Download and install

Open the [latest downloads](https://github.com/nothingalike/deckscape-app/releases) and choose the installer for your computer under **Assets**. Preview releases appear there too.

- **Windows:** download the file ending in `Windows-x64-Setup.exe`. Open it and follow the installer.
- **Mac:** choose `macOS-arm64.dmg` for Apple silicon or `macOS-x64.dmg` for Intel. Open the DMG and drag Neuroscape Local into Applications. Requires macOS 13 or later.
- **Linux:** download `Linux-x64.AppImage`. In its file Properties, allow running it as a program, then open it. AppImage support depends on your distribution.

You do not need Node.js, Git, a terminal, or the **Source code** downloads. On first launch, choose **Update cards** with an internet connection. After the download finishes, you can build decks and play supported bot matches offline. If an installer is blocked or its developer cannot be verified, ask the maintainer for help and keep your normal security settings enabled. Unsigned releases are clearly labeled as previews.

If the official card feed is unavailable, **Update cards** automatically tries [Deckscape's cached catalog](https://www.deckscape.run/cards) and labels the download as a backup. See [catalog sources](docs/catalog-sources.md) for details.

The Windows app synchronizes the official catalog and artwork, preserves the working catalog through failed updates, and reuses Deckscape's catalog and deck editor. Local decks autosave to SQLite with revision checks and draft recovery. The original legality, quantities, sections, mainframe replacement, statistics, cost curve and opening-hand tester are preserved. Supplied starters and JSON/text imports create new local copies. JSON backup, copyable card-list and promotional PNG export retain the hosted formats. Solo admission uses the hosted reviewed definitions and rules; a supported matchup saves its decks, definitions, artwork, rules and initial strategy together. The original setup, React/Pixi battlefield, choices, rules and bot executor run locally, with atomic command receipts in SQLite.

## Contributing

Code, documentation, bug reports, and feedback are welcome. [Report a bug or suggest a feature](https://github.com/nothingalike/deckscape-app/issues). Include your operating system, app version, and steps to reproduce a bug.

To contribute a change:

1. [Fork this repository](https://github.com/nothingalike/deckscape-app/fork), then clone your fork. Replace `YOUR-USERNAME` with your GitHub username:

   ```sh
   git clone https://github.com/YOUR-USERNAME/deckscape-app.git
   cd deckscape-app
   ```

2. Install Node.js 24.5 or later, then install dependencies and open the app:

   ```sh
   npm ci
   npm start
   ```

3. Create a branch for your change. Read the [local app design](docs/design/local-app.md) and existing [specs and tickets](.scratch/). For card import, deckbuilding, import/export, or game changes, follow the [hosted functionality baseline](docs/hosted-parity.md).
4. Check code changes with `npm run verify`. It runs TypeScript checks and the full test suite, including bot matches that can take tens of minutes. Use the commands below for relevant desktop checks.
5. Push your branch and [open a pull request](https://github.com/nothingalike/deckscape-app/compare) against `main`. Explain what changed and how you checked it. Include screenshots for UI changes.

## Development

Maintainers: [build a GitHub release](docs/github-releases.md). The workflow builds all four player downloads and prepares a draft release with installation instructions and checksums.

Use Node.js 24.5 or later. Install the exact locked dependencies with `npm ci`.

- `npm start` builds and opens the development app.
- `npm run verify` checks TypeScript and the application-boundary tests.
- `npm run package:dir` creates an unpacked platform artifact.
- `npm run package:win` creates the internal unsigned Windows installer.
- `npm run package:mac` runs only on a supported Mac and creates an internal ad-hoc DMG without notarization/publication. See [the prepared Mac procedure](docs/macos-qualification.md); native acceptance remains open for the user's later run.
- `npm run package:linux` creates the internal Linux x64 AppImage on a Linux build host.
- `npm run qualification:bundle` creates the private source/fixture transfer bundle for the Mac procedure.
- `npm run test:desktop` checks the packaged Windows artifact, or the executable selected by `NEUROSCAPE_EXE`.
- `npm run test:platform-render` checks the selected platform artifact against the supplied original game fixture, native artwork decoding, Pixi/input, sandbox and committed offline reopen.
- `npm run test:catalog-ui` checks the reused catalog controls against a controlled local source and then with that source stopped.
- `npm run test:decks-ui` checks the packaged hosted editor, autosave/reopen, failed-save retry, native Quit cancellation, draft recovery, and original deck tools.
- `npm run test:interchange-ui` checks original starter/text/JSON behavior and native JSON/PNG export, new-copy round trips, preview reset, unresolved-card repair, failure/cancel/retry and locally decoded artwork. Native save selections and clipboard writes are controlled at the OS boundary; files and SQLite are real.
- `npm run test:solo-ui` prepares a disposable copy of the existing full official-catalog rehearsal and checks the packaged matchup UI with HTTP/HTTPS denied. It covers separate legality/support, invalid decks, new unsupported cards, changed mechanics/artwork, setup persistence and restart. Run the catalog rehearsal first if `.local/catalog-live.json` is absent; this proof reuses its artwork rather than downloading it again.
- `npm run test:game-ui` uses the same catalog rehearsal to play the original setup and game controls to a real health outcome against the local bot with HTTP/HTTPS denied. It also checks cached artwork, the original board texture, and both return links.
- `npm run test:resume-ui` checks the original unfinished-match list and normal close/reopen during setup, a player decision and a pending bot turn. It also checks a retained unavailable-runtime save. The packaged app uses real SQLite and cached artwork with HTTP/HTTPS denied.
- `npm run test:retention-ui` checks canceled/confirmed deck deletion, changed-catalog activation, retained card labels, unresolved-card repair, new-match support checks and an unchanged saved game with its original artwork after offline restart.
- `npm run test:recovery-ui` terminates only the owned application or its observed local service, checks the visible failure, then reopens the same profile and resumes player/bot work with HTTP/HTTPS denied. It also checks that a second instance yields after recovery.
- `npm run test:roster-ui` selects and admits every shipped starter opponent offline, verifies its pinned strategy and all required cached artwork. `npm run roster:assemble` regenerates the reproducible roster described in [bot roster provenance](docs/bot-roster.md).
- `npm run test:backup-ui` checks native backup selection/cancel, failed promotion and retry, unchanged match state, complete archive hashes and normal Quit draining. Native save selections are controlled at the OS boundary; the packaged app, files, SQLite and artwork are real. See [the backup format](docs/profile-backup.md).
- `npm run test:restore-ui` checks restore selection/confirmation cancellation, rejected archives, automatic recovery backup, complete profile activation and cold reopen, preserved browser drafts, original decks and saved-game resume offline. Native dialogs, folder opening and the OS relaunch boundary are controlled; files, profiles and the packaged app are real. See [restore and recovery](docs/profile-backup.md#restore-and-recovery).
- `npm run test:restore-native-relaunch` separately checks the real OS relaunch, a different main-process PID and the exact original match after activation. Dialog selections use controlled responses; temporary loopback debug endpoints belong only to this verification launch.
- `npm run test:release-ui` checks separate app/catalog update information, validated release fixtures, failure/timeout/retry, plain-text notes and the approved system-browser boundary while retaining the same game and catalog. See [app-release configuration](docs/app-releases.md).
- `node tools/catalog-live.mjs` performs a full read-only official-source rehearsal in a fresh profile.
- `node tools/catalog-offline-check.mjs` reopens that rehearsal profile with HTTP/HTTPS denied in the shared application network session, checking local catalog/artwork behavior and blocked main/utility requests.
- `node tools/decks-offline-check.mjs` uses that existing catalog to check a valid deck, autosave, restart and artwork with HTTP/HTTPS denied, then removes its temporary deck.
- `powershell -File tools/install-smoke.ps1` installs the internal Windows artifact in a temporary directory, checks it, and uninstalls that proof installation.
- Add `-Game` to the install proof to run the full offline matchup through the installed artifact before uninstalling it.
- Add `-Recovery` to the install proof to verify service/app termination and offline resume through the installed artifact before uninstalling it.
- `powershell -File tools/upgrade-install-smoke.ps1` installs the pinned internal 0.1.0 predecessor, upgrades that owned installation to 0.2.0 and resumes the original game offline. Add `-PredecessorSchema7` for the explicitly versioned migration fixture. See [supported upgrades and recovery](docs/profile-upgrades.md).

`NEUROSCAPE_PROFILE_DIR` selects an isolated profile for development and verification. Ordinary launches use the operating system's per-user application data location. Generated artifacts and local evidence are ignored by Git.

The complete test suite includes the preserved deterministic bot-versus-bot duels. These can take several minutes. In PowerShell, set `$env:BOT_TRACE = '1'` before `npm run verify` to show their progress.

## Current qualification

The Windows proof uses Electron 45.3.2, its bundled Node 24.22.2 and SQLite 3.53.4. SQLite is the bundled `node:sqlite` implementation; no separate native binding is installed. Pixi 8.23.0 uses its CSP-compatible implementation. The installed internal unsigned artifact completed a Dustrunner-versus-Corpo game through the original React/Pixi controls with the entire application denied HTTP/HTTPS. Unfinished matches resume their original committed setup or game; unavailable runtimes remain listed with an explanation and keep their saves. Installed recovery checks also passed service/app termination, retained player and bot state, and second-instance yielding. All four starter opponents reached deterministic health outcomes through the original executor and passed packaged offline selection; they use the hosted general tactics described in the roster provenance. Complete-profile export is qualified on Windows, including failed writes, retry, Quit draining and interrupted temporary-file cleanup. Validated restore, automatic recovery backup, complete-generation interruption recovery and actual native relaunch are qualified in the unpacked Windows artifact. Installed internal 0.1.0-to-0.2.0 upgrades and an explicit schema-7 predecessor retain the original pending game, records and pins with recovery backups. Human tactical assessment remains open.

The Linux x64 AppImage passes the narrow persistence/Pixi/input/reopen proof on X11 and Wayland under Ubuntu 22.04.3 WSLg, with sandboxing preserved. Native chooser completion and browser handoff remain host limits; see [Linux qualification](docs/linux-qualification.md). macOS execution is prepared for the user in [Mac qualification](docs/macos-qualification.md). Full Mac/Linux player journeys remain required. Internal unsigned packages are development evidence; public distribution requires the source, provider, attribution, and signing checks recorded in the tickets. The existing hosted Deckscape service remains separate.

Reuse and desktop adaptations are documented in [the hosted parity map](docs/hosted-parity.md) and its source-hash manifest. Existing deck text/JSON/PNG interchange, editor tools, and game behavior are the implementation baseline.


The reusable installed-player qualification is documented in [installed qualification](docs/installed-qualification.md). On a clean Windows host, run powershell -NoProfile -File tools/qualify-windows.ps1 after building the installer. It preserves existing registered installations and records each step in a unique evidence folder.


The final AppImage passes the full30-step offline journey and215 current tests on both X11 and Wayland under the documented WSLg host, including actual restore/relaunch, supported upgrade fixtures and Windows/Linux backup input/reopen. Native chooser/browser completion and physical Linux remain unqualified. The exact tested artifacts are identified by checksums in the platform reviews; multiple internal0.2.0 build snapshots are preserved separately.


An internal candidate with exact artifact hashes and remaining distribution gates is recorded in .local/internal-candidate.json. See [candidate and signing preparation](docs/release-candidate.md). Mac artifacts and public-release readiness remain pending; no source license, signing credential or public delivery location has been assumed.

