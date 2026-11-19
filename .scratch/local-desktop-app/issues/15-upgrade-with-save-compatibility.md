# 15: Upgrade the app while preserving supported saved games

**What to build:** Install a newer app artifact over a prior supported version, migrate local records safely, and resume compatible pinned matches without silently changing their mechanics.

**Blocked by:** 14 - Restore a validated backup without risking the current profile.

**Status:** complete

**Spec stories:** 49, 57, 60.

- [x] Keep installed application files separate from the profile and create the required pre-upgrade recovery backup.
- [x] Exercise a real versioned schema migration with prior-release or explicitly versioned predecessor fixtures, preserving decks, catalog references, receipts, and artwork pins.
- [x] Carry or resolve the runtimes required by supported saved matches; match resume uses the original rules and engine content after upgrade.
- [x] Unavailable runtimes or unsupported schemas fail with a clear preserved-data path rather than loading different mechanics or discarding a save.
- [x] A failed migration or interrupted upgrade leaves a documented, tested recovery route through the backup/restore flow.
- [x] Demonstrate the upgrade with packaged artifacts and a real unfinished game; document the supported compatibility boundary without implementing long-term runtime retirement.

## Comments

Plan prepared during ticket 14's long regression run. Preserve the existing expanded-v6 engine, rules, definitions, artwork and playbook pins. Qualify an explicitly versioned predecessor fixture with a real unfinished game, catalog and receipts; use the existing directory timestamp migration as a meaningful schema transition. Create a supported SQLite recovery snapshot before changing a predecessor profile, then reuse complete-generation activation so failed or interrupted migration keeps the original data and a restore route. Keep application files and player data separate. Unsupported schemas or runtimes remain preserved with actionable compatibility guidance. The packaged proof must identify its predecessor fixture honestly rather than imply an earlier public release existed.

Implemented the asynchronous desktop startup gate in `src/startup.ts`. It reads schema/release metadata without modifying the original database, creates a consistent recovery ZIP, validates and migrates a complete staged copy, and publishes an upgrade-purpose generation journal. The existing schema-7-to-8 match-directory timestamp migration has one shared implementation. Both supported profile constraint shapes are qualified. The trusted synchronous storage constructor remains the application-boundary fixture seam; production desktop startup enters through the asynchronous gate. See ADR 0006 and `docs/profile-upgrades.md`.

Unavailable-runtime and unavailable-definition saves remain preserved and listed with compatibility guidance, and their bot/player actions stay blocked. The upgrade-only preservation policy is Node-owned; public ZIP restore retains strict installed-runtime checks. Failed activation reopening rolls the pointer back without implicitly migrating the original database. Unsupported schemas and newer release metadata preserve data with a compatible-release/recovery-ZIP path.

Seven actual-worker cases passed staging interruption, migration failure after real partial SQL, interruption after migration, before/after pointer publication, publication failure and failed reopening. Every case retains the byte-identical original database and a recovery ZIP that reopens the exact pending game. Retry recovers a complete profile. Review found that a same-thread heartbeat could miss the old 15-second startup deadline during synchronous validation. Main now bounds initial responsiveness and then waits for acknowledged work to complete/fail/exit; validation yields between records. A real worker blocked for 16.25 seconds and then completed with the exact game and unchanged predecessor. Standards and Spec have zero remaining findings.

TypeScript and 198 current regressions passed with zero failures/cancellations. The 44 focused upgrade/restore checks and separate long-block startup check passed. The unchanged heavy bot matrix and four roster games are carried from ticket 14's just-passed full 286-check snapshot; all 600 copied source/local hashes are unchanged and the reference checkout remains read-only.

The final rebuilt internal 0.2.0 installer passed two real installed Windows journeys: install the pinned internal 0.1.0 artifact into an owned temporary directory, open its original deck/game offline, install 0.2.0 over that same path, compare all persisted records and pins, inspect the recovery ZIP, take an original player action, and reopen again without a repeated upgrade. The second journey deliberately converts the closed predecessor copy to schema 7. Both uninstaller exit codes were zero. HTTP/HTTPS was denied in the shared application session during player checks; page errors were empty. Existing installations are preserved by the proof's registry guard.

These are internal development artifacts, not published historical releases. The preserved 0.1.0 installer came from the earlier installed recovery slice and the preserved unpacked artifact came from completed ticket 14; exact hashes distinguish builds sharing a development version. App files and player data stay separate. Other-platform and public-distribution qualification remain open. All work is uncommitted. Review: http://localhost:4321/f/neuroscape-app/general/reviews/2026-11-15-2015-supported-profile-upgrades .

