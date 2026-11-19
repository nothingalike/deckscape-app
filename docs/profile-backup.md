# Complete profile backup

The Backups screen saves committed decks, catalog history, saved matches, command receipts and every referenced artwork object. Save pending editor changes before starting. The native file dialog chooses the destination; the renderer does not supply arbitrary filesystem paths.

Creation uses the supported `node:sqlite` backup operation, then reads references from that consistent snapshot. Each artwork object is copied into staging and verified against its content hash. The archive is streamed to a unique sibling temporary file, flushed, closed and renamed over the selected destination only after success. A failed write or promotion retains the active profile and previous destination. The destination must be outside the complete profile root, including retained data generations and recovery folders.

Normal Quit waits for active backup work to drain. A flushed ownership journal identifies each UUID staging run and its exactly derived sibling temporary ZIP. Reopening recovers those abandoned files after termination while preserving completed destinations and unrelated files.

The ZIP contains:

- `manifest.json`: format/version, creation time, app/schema version, file sizes/SHA256 hashes and each saved match's runtime, definition and strategy requirements.
- `profile.sqlite`: the consistent database, including decks, catalog records, pinned matches and receipts.
- `artwork/<sha256>.<png|jpg|webp>`: verified content-addressed artwork, including retained catalog history and saved-match references.

Executable runtimes come from the installed app release. The archive contains data and identifies compatibility requirements.

The initial limits are 2 GiB total archive/data, a 512 MiB database, 10 MiB per artwork object, 20,002 content files and an 8 MiB manifest. Paths use forward slashes and content hashes so archives can move between supported operating systems. Other-platform qualification remains in its own tickets.

The implementation uses [yazl's streaming ZIP writer](https://github.com/thejoshwolfe/yazl) and [yauzl's bounded entry reader](https://github.com/thejoshwolfe/yauzl). Their exact versions and notices are pinned with the app. The reader supports the archive checks and restore work; backup creation does not execute imported code.

Tests capture a real pending game while a recent command commits, verify state/receipt consistency and hashes, reopen the captured database through normal app operations, and exercise failed promotion, damaged artwork and retry. The UI proof controls native save selections at the dialog boundary while using real files, SQLite, artwork and the packaged app offline.

## Restore and recovery

Choose **Backups → Choose backup to restore** and confirm replacement. The app validates the ZIP in private staging while the current profile remains usable. It checks the exact inventory and hashes, entry names, expanded sizes, SQLite structure and integrity, catalog normalization using the original hosted importer, artwork references, and the installed runtime, definitions and strategy requirements of every saved game. Unsupported or damaged backups produce an error before replacement.

After validation, the app drains current writes and creates an automatic recovery ZIP of the current committed profile. It activates a complete data generation and restarts. Decks and unfinished matches then use the ordinary editor and Resume controls. Browser draft recovery remains associated with its original generation, so previous unsaved edits are retained without appearing over the imported decks.

The stable profile root keeps the instance lock and browser data. `current-profile.json` selects a complete SQLite/artwork directory under `data-generations/<uuid>`; an absent pointer selects the original root layout. A flushed activation journal retains the previous selection until the new profile opens. An interruption selects a complete old or new generation, and a failed new-profile open recovers the previous generation. See [ADR 0005](adr/0005-activate-complete-profile-generations.md).

The Backups screen reports the result after reopening and offers **Open recovery backup folder**. To return to the previous committed data, select its ZIP through the same restore flow. Both the old generation and recovery archive are retained. Leave these folders intact until the imported profile has been checked. Recovery archives include hidden match state and should be kept private.

`npm run test:restore-ui` prepares a disposable profile from the existing backup rehearsal, cancels both native selection and confirmation, rejects a damaged archive, restores the valid archive, reopens the packaged app, verifies the recovery ZIP and resumes the original match with HTTP/HTTPS denied. Native dialogs, folder opening and the OS relaunch request are controlled at their boundaries; the old process actually quits and the harness launches the same artifact/profile. Files, SQLite, artwork and gameplay are real. Windows is qualified here; cross-OS restore remains a later platform check.

`npm run test:restore-native-relaunch` separately verifies actual OS relaunch. It starts only its owned packaged app with temporary loopback debug endpoints, controls native dialog selections, leaves `app.relaunch` intact, and verifies a different main-process PID, the selected complete generation and the exact original match after restart. These debug flags belong to the verification launch. Ordinary application startup uses its normal privilege boundary.

`node --import tsx tools/prepare-portability-fixture.ts` prepares `.local/portability-fixtures/` from the backup rehearsal. The ZIP and expected deck/game records use portable paths and identifiers; the metadata includes the archive SHA256 and originating platform. This ignored evidence contains downloaded artwork and private match data. Copy it directly between qualification hosts; keep it outside source and public release artifacts.
