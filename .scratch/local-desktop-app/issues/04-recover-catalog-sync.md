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

2026-11-20: Investigated the downloaded Windows app's generic sync error. A read-only query of the active profile found two failed runs at zero cards and an unchanged 256-card snapshot from November 16. An isolated application probe reproduced the exact error: the official search endpoint returned HTTP 200 with `cards: []`, `total: 0`, `has_more: false`, `offset: 0`. The official public card gallery's own browser request to `api.admin.carde.io` returned the same empty response and displayed "No cards found". Both source hosts agree; changing the endpoint does not restore the catalog. No provider was contacted and the user's profile was not changed.

The local catalog adapter now identifies this exact empty first-page response before the unchanged hosted importer and reports that the card source returned an empty catalog. Existing snapshots remain protected. Two regression cases failed on the old generic message, then passed with the change; they cover fresh/cached profiles and persistent failure status across restart. TypeScript and all 27 targeted catalog checks pass. A live-source recheck confirms the clearer message, while synchronization still fails because the upstream feed remains empty. This diagnostic improvement is uncommitted and has not been packaged or released. Probe scripts, downloaded public frontend code and the official gallery screenshot are kept under ignored `.local/` diagnostic paths.

The user adopted the public Deckscape card page as a backup. The app now retries a failed official download from one complete Deckscape snapshot, including validated cached artwork. It retries the official source on the next sync, displays backup provenance, and preserves the active snapshot if both sources fail. Cancellation and local storage failures do not start a backup attempt. The hosted checkout and service were unchanged.

The backup discovers the artwork origin from the public page and authorizes only exact image URLs belonging to the validated card-ID/hash snapshot. Production source and documentation contain no deployment-specific project reference; tests use fictional origins. A public-source cleanup removed local-only review URLs from 12 ticket files and made one personal filesystem path relative, preserving the qualification evidence. A bounded source scan found no matching access-key, JWT or private-key patterns. This scan does not establish database authorization policy or erase previously published history.

Validation: all 48 targeted catalog checks and TypeScript pass, including malformed/truncated backups, hash mismatches, artwork-host migration and origin spoofing, empty/network/partial/artwork failures, next-sync recovery, cancellation, disk failure, and both-source failure. All 600 reuse hashes remain unchanged. The rebuilt Windows preview completed a fresh live backup sync of 256 cards in approximately 40 seconds, displayed its source, decoded artwork with zero page errors, and retained browsing, search and enlarged artwork with HTTP/HTTPS blocked. A separate offline application proof verified all 256 artwork hashes and admitted all four bundled starter matchups against the backup catalog. Current changes are uncommitted and not included in the published v0.2.1 installers.

