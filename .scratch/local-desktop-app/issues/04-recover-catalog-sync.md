# 04: Keep the working catalog through failed and changed syncs

**What to build:** Let a player monitor and cancel catalog updates, recover from failed or interrupted downloads, and retain readable records when official content changes or disappears.

**Blocked by:** 03 - Download and browse the official card catalog locally.

**Status:** complete

**Spec stories:** 10, 14, 15, 16, 17, 18, 19.

- [x] Sync progress, cancellation, bounded retries and concurrency, failure details, and added/changed/missing results are visible through the app.
- [x] Controlled partial, duplicate, drifting, malformed, interrupted, and incompatible pages cannot replace a working catalog.
- [x] Cancellation, image validation failure, retry exhaustion, disk-space failure, and termination at activation boundaries preserve the last complete catalog after reopening.
- [x] Expired image links are refreshed from the official source when needed; corrected artwork bytes are detected even when source timestamps stay unchanged.
- [x] Retain missing-source card records and needed artwork, mark their source status, and preserve unresolved references for later deck repair.
- [x] Recover or discard incomplete staging safely on relaunch, recording failure separately from successful activation; cleanup preserves all referenced objects.
- [x] Regression checks exercise the public sync operations and actual local storage, asserting visible availability and artwork content rather than helper call order.

## Comments

2026-11-15: Completed catalog recovery while preserving the hosted importer and UI. Extracted the hosted importer's four-attempt request policy with cancelable 30-second request deadlines and backoff, conservative sequential downloads, capped Retry-After, sanitized errors, and injected Electron transport. Expired artwork links trigger one complete, drift-checked source refresh. Every update downloads artwork bytes, so unchanged timestamps cannot hide corrections.

Schema 4 journals update outcomes independently from the active catalog. Successful activation and its completed outcome commit in one SQLite transaction; canceled, failed and interrupted runs leave the prior snapshot active. Missing-source records and artwork remain available with an explicit status in the original catalog and preview. Relaunch discards only owned UUID staging directories, preserves unrelated files, and retains artwork objects for current and future pinned references.

Validation: npm run verify passed all 32 checks, including the original hosted importer tests. The recovery file contains 22 checks covering cancellation/reopen, retained cards, real HTTP retries/exhaustion/backoff cancellation, expired links and drift, corrected bytes, bad pages and images, ENOSPC injection at the filesystem boundary with real SQLite, and actual owned-worker termination during artwork and immediately before/after SQLite COMMIT. Reopening observed a complete old or complete new catalog with truthful status and readable artwork. These process-crash checks do not establish physical power-loss behavior.

Packaged Windows UI passed visible progress/cancel, cancellation after restart, missing-source status and retained artwork, bad-update preservation, and source-stopped restart. Desktop isolation/Pixi/profile smoke passed. The existing 256-card profile migrated and remained usable under shared-session HTTP/HTTPS denial; this is catalog-level current-transport evidence, with the complete installed-game journey still owned by ticket 19. All 27 reuse-manifest source/local hashes matched and the reference tracked diff remained empty. Standards: zero findings. Spec: zero findings. No commits, pushes, source changes or publication occurred.

