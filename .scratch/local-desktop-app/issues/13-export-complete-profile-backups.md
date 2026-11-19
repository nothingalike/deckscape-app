# 13: Export a consistent complete profile backup

**What to build:** Save a portable backup containing the player's decks, saved matches, catalog records, pinned artwork, and runtime-requirement manifests from a native file dialog.

**Blocked by:** 09 - Resume an unfinished match with its original content.

**Status:** complete

**Spec stories:** 51, 52.

- [x] A visible backup action chooses a destination and reports progress, completion, or actionable storage errors.
- [x] Capture a consistent committed SQLite snapshot using a supported backup operation, including when the profile has pending or recent activity.
- [x] Include the records, pinned artwork, schema version, integrity hashes, and runtime-requirement manifests needed to identify and restore the saved profile.
- [x] Treat executable runtimes as app-release content; the archive does not install code supplied by a backup.
- [x] Creation failure leaves the active profile usable and does not present an incomplete output as a successful backup.
- [x] Contract and UI checks verify archive completeness, consistency, content hashes, and failure reporting with a profile containing an unfinished real match.

## Comments

Added the Backups screen and named native-save/status capabilities. The main process owns destination selection; the renderer supplies no filesystem path. The service uses supported SQLite backup, collects all catalog-history and saved-match artwork references from that snapshot, stages and hashes each required object, then streams a standard ZIP into an exclusive sibling temporary file. It closes and flushes the output before atomic publication. The manifest records schema/app versions, exact sizes/hashes and each saved match's engine/rules/definition/strategy requirements. Archives contain data, with executable rules supplied by installed releases. See `docs/profile-backup.md` for format and bounds.

Review independently confirmed that the prior two-second Quit kill could interrupt a long backup. Normal Quit now drains the utility service. A flushed UUID ownership journal supports startup cleanup of the exactly derived external temporary ZIP and owned staging. Every external deletion failure retains the journal, including an unavailable removable destination. Malformed journals never authorize external deletion. Real-process and filesystem-boundary regressions cover termination before publication, a deliberately delayed write exceeding 2.5 seconds, sharing errors, disconnected/reconnected destinations, previous-backup preservation and unrelated files. Standards: zero remaining findings. Spec: zero findings.

Pinned standard ZIP libraries (yazl 3.3.1, yauzl 3.4.0) and declarations. Dependency checking found the existing Zod 4.5.4 high-severity memory-exhaustion advisory; primary advisory evidence confirmed affected versions and the patch. Updated to 4.6.7. Runtime audit now reports zero advisories and all 21 runtime package notices resolve. No general audit-force upgrade was applied to development tools.

TypeScript passed. The complete 250-check snapshot passed after the Zod patch with zero failures/cancellations/skips, including all preserved source bot regressions and the four roster outcomes (1,010 seconds). Six staging cases were added after that run's file list was captured; all nine focused backup/staging cases then passed with the reviewed implementation. The snapshot/receipt consistency test captures a real pending game alongside a recent command and reopens the captured database through ordinary app operations. Corrupt artwork, failed publication and retry preserve the current profile and previous destination.

The packaged Windows proof passed native save selection/cancel, failed promotion, retry, every archive hash, unchanged real match and normal Quit during another active backup. It verified SQLite plus 256 original downloaded artwork objects and a separate manifest, with HTTP/HTTPS denied and zero page errors. The exact expanded preload/profile boundary also passed. Native dialog selections are controlled at the OS boundary; SQLite, files, archive streams and artwork are real. All 600 source/local hashes match; the reference checkout is unchanged.

Evidence: `.local/backup-full-verification.log`, `.local/backup-focused-verification.log`, `.local/profile-backup-ui.json`, `.local/backup-{complete,failed}.png`, `.local/runtime-audit.json`, `.local/dependency-inventory.json`. Restore and cross-OS qualification remain the next tickets. All work remains uncommitted.

