# Installed player qualification

The shared suite runs the existing source and desktop proofs against one selected
installed executable. It preserves the hosted import, deck editor, interchange
and React/Pixi game implementation. Separate disposable profiles isolate
destructive regressions such as catalog changes, crashes and profile replacement.

## Windows

Build the internal installer with `npm run package:win`, then run:

```powershell
powershell -NoProfile -File tools/qualify-windows.ps1
```

The wrapper preserves any existing registered installation by stopping before
installation. On a clean qualification host it installs into a new temporary
folder, selects the installed executable, runs the shared journey and uninstalls
only its own installation. It then runs the existing real 0.1.0-to-0.2.0 installed
upgrade checks for both supported schema fixtures. Preserve the predecessor
artifacts and hashes described in [profile upgrades](profile-upgrades.md).

## Other installed targets

On a prepared native host, set `NEUROSCAPE_EXE` to the copied DMG application
executable or executable AppImage. Set `NEUROSCAPE_INSTALLER` to the DMG/AppImage
to include compressed package size. Linux runs also set `NEUROSCAPE_DISPLAY` to
`x11` or `wayland`. Then run:

```sh
node tools/qualify-installed.mjs
```

The maintainer host needs the pinned Node toolchain and `npm ci`. Players do not.
This command does not install, publish or modify OS registration. Native
installation, upgrade and cross-OS backup checks are additional platform-ticket
steps. Run one suite at a time in each checkout because preparatory proofs share
their explicitly named fixture records under `.local`.

## Evidence and failure rules

Every invocation creates `.local/qualification-<platform>-<UUID>/qualification.json`.
It records the selected executable/hash, host architecture, display, start and
completion state. Each sequential step gets a numbered directory with its full
process log and current-run evidence. A nonzero child exit or missing/stale output
fails the run; `success` stays false. Preserve failed run folders as evidence.

The suite performs:

1. Native visible-window, renderer privilege, SQLite persistence/reopen and
   single-instance checks against the selected artifact.
2. Fresh complete official catalog/artwork sync, then real denied main/utility
   requests, local browse, artwork, legal deck editing and reopen.
3. Controlled-source catalog rollback/cancel/missing-card checks; original editor
   controls, autosave failure/retry/recovery and deck JSON/text/PNG interchange.
4. Shipped bot selection, supported setup, a complete health-based original game,
   and saved setup/player/bot restart.
5. Owned service/application termination, retained committed state, catalog/deck
   change retention and original saved-game action after reopening.
6. Complete backup, rejection/cancel/retry, restore and automatic recovery copy,
   original match resume and actual OS relaunch.
7. Separate app-release states, bounded errors/timeout/retry and retained player
   data, followed by application regressions including duplicate-action handling.

The two unchanged heavy deterministic bot matrix files remain a
separate `npm run verify` qualification; the shared run states this selection
explicitly. No successful platform result is inferred from a successful build.

## What the boundaries prove

Fresh official sync uses the real approved read-only source path with no Supabase
configuration. Catalog fault/rollback cases use a bounded local fixture source.
Offline phases reject actual HTTP/HTTPS requests through the shared Electron
network session used by renderer, main and the local utility process. Main and
utility denied requests are explicitly exercised. This is application-network
denial, not an OS firewall or disconnected-hardware claim.

Native dialog selections, confirmation responses, clipboard and external browser
handoff are controlled at the OS boundary. The actual installed application,
SQLite, files, export bytes, ZIP validation, profile activation and relaunch run
for real. Record real native-dialog/browser acceptance separately for each host.
Release fixtures use loopback metadata and a reserved browser target; the normal
internal build has no configured release-delivery endpoint.

Keep exact platform versions, package hashes, original-source provenance,
screenshots and exclusions with the owning platform ticket. A Windows pass does
not qualify Mac or Linux; WSLg coverage does not imply physical Linux coverage.
