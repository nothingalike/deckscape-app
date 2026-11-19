# Supported app upgrades

The internal 0.2.0 build qualifies upgrades from complete 0.1.0 profiles at schema 8 and an explicitly versioned schema-7 predecessor fixture. The schema transition adds the existing saved-match directory timestamp and backfills it from creation time. It preserves original decks, catalog records, receipts, artwork and the expanded-v6 engine, rules, definitions and strategy pins. Older prototype schemas require the matching 0.1.0 development build to migrate them first. Future schemas require their matching release.

These are internal build fixtures. No earlier public release is implied. The preserved installer came from the installed Windows recovery slice; the preserved unpacked predecessor came from the completed restore slice. Both identify themselves as 0.1.0. Their distinct SHA256 hashes identify the exact artifacts used during development.

## Startup and recovery

The desktop service enters through asynchronous `startApplication`. It reads compatibility metadata without modifying the source database and creates a complete recovery ZIP before an upgrade. It validates a staged copy, applies the shared schema migration there, records the current app version and activates a complete generation. Installation files stay in the application directory; player data remains under the separate per-user profile root. See [the generation decision](adr/0005-activate-complete-profile-generations.md).

The synchronous `openApplication` constructor is the trusted storage seam for application-boundary tests and maintainer fixtures. It opens and initializes a selected database. Desktop startup uses `startApplication` to place backup and upgrade checks before that constructor.

An interrupted upgrade selects a complete old or new generation. A failed new-profile open restores the previous pointer and reports the recovery path while leaving the original database intact. A retry stages another complete copy. The recovery ZIP can also be selected through **Backups → Choose backup to restore** in a compatible release; schema-7 ZIPs are validated before their staged timestamp migration. The source archive stays unchanged.

The Backups screen shows a successful upgrade and its recovery ZIP. Save or export current edits before installing another release. Recovery snapshots contain committed data. Browser recovery copies remain in their original generation. Restoring the pre-upgrade ZIP returns to the committed state captured before the upgrade.

Initial startup has a 15-second responsiveness deadline. Once the service acknowledges backup or validation work, the desktop waits for completion or an explicit service failure/exit. Validation yields between records. A controlled real-worker check blocks the service thread for more than 16 seconds and verifies that it completes with the original match and a byte-identical predecessor database.

## Saved-game compatibility

Supported saved games continue under their original installed runtime and reviewed definitions. An upgrade retains unavailable-runtime or unavailable-definition saves as opaque local records and lists their compatibility explanation. It does not execute them under replacement mechanics. Public backup restore remains strict about installed runtime compatibility; a ZIP containing an unavailable runtime requires a compatible release.

Unsupported schemas, newer profile-release metadata and malformed compatibility metadata produce an actionable preserved-data error. Keep the profile folder and any recovery ZIP. Use the matching application release or restore a supported ZIP. This boundary does not establish a long-term runtime retirement policy.

## Repeat the Windows proof

Build the internal 0.2.0 installer with `npm run package:win`. Keep the pinned 0.1.0 installer under `release/predecessor-0.1.0/`. Run:

```powershell
powershell -File tools/upgrade-install-smoke.ps1
powershell -File tools/upgrade-install-smoke.ps1 -PredecessorSchema7
```

Each proof checks for an existing Neuroscape installation first and preserves it. With no existing installation, it installs 0.1.0 into a new owned temporary directory, opens the original deck and real unfinished match, closes it, installs 0.2.0 over that same directory, then verifies all persisted records and pins. It checks the recovery ZIP, performs an original player action offline, reopens again and confirms that startup does not repeat the upgrade. It uninstalls only its proof installation.

The schema-7 option deliberately converts the closed copy into a documented predecessor fixture before launching 0.2.0. It provides real migration coverage; it is separate from the actual schema-8 artifact upgrade. HTTP/HTTPS is denied in the shared application session during the player checks. The proof reuses the existing official-catalog rehearsal and downloads no additional artwork. Unsigned Windows evidence does not qualify other operating systems or general distribution.
