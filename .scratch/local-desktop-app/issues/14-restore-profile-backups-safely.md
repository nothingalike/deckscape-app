# 14: Restore a validated backup without risking the current profile

**What to build:** Select a profile backup, validate it in staging, and activate it with a recovery backup, leaving the previous profile usable if restore fails.

**Blocked by:** 13 - Export a consistent complete profile backup.

**Status:** complete

**Spec stories:** 53, 54, 55, 56.

- [x] The native restore flow explains that the current profile will be replaced and validates schema, hashes, references, archive paths, resource limits, and required runtime compatibility before activation.
- [x] Create a consistent recovery backup before replacing a valid existing profile.
- [x] Reject corrupt, oversized, unsupported, traversal-containing, missing-reference, and incompatible-runtime archives with actionable results.
- [x] Interruption or failure during staging, replacement, or reopening preserves a recoverable old or new complete profile; never activate a mixture.
- [x] A successful restore exposes the imported decks and resumes an unfinished match through ordinary app operations.
- [x] Use OS-neutral archive identifiers and paths, prove the flow on the current host, and produce backup fixtures for later cross-OS qualification.

## Comments

Implementation plan prepared while ticket 13's dependency-patch regression runs. Keep the existing Electron user-data root and single-instance ownership stable. Restore into a new UUID data generation containing only validated SQLite and artwork, then atomically publish a small active-generation pointer. Preserve the old complete generation and an automatic recovery ZIP. This avoids renaming browser caches or a live SQLite database and makes interruption resolve to an old or new complete profile.

Validate the ZIP in staging before quiescing current writes: entry allowlist, duplicate/path/symlink/encryption checks, bounded streamed sizes, exact file inventory and SHA256 hashes, supported schema and expected SQLite structure, integrity/foreign-key checks, retained artwork references and all pinned runtime/definition/playbook requirements. Treat runtimes as installed application content. An unsupported runtime or malformed archive preserves the current profile and reports the reason.

After validation, drain match/catalog/backup work, capture the recovery backup, publish the new generation only after its files are complete, and restart the app through its ordinary main/service lifecycle. Persist the activation journal and result so interruption and post-quiesce failure can reopen the appropriate complete profile with useful recovery status. Keep user-selected export destinations outside the profile root; the automatic recovery destination is a separate trusted internal operation.

Implemented the complete-generation flow in `src/profile-location.ts`, `profile-archive.ts` and `profile-restore.ts`; base SQLite bootstrap is shared in `profile-database.ts`. Native restore defaults to Cancel and explains replacement and recovery. Validation checks CRC, streamed/expanded limits, hashes, exact inventory, trusted SQLite structure, references, original catalog normalization and the original runtime/definition/setup/strategy contracts before current writes drain. Existing hosted mechanics remain unchanged. Browser recovery keys preserve prior unsaved drafts in their original generation.

TypeScript and 32 focused checks passed: 21 archive cases, four location/journal cases, two application restore cases and five actual-worker interruption/failure cases. The application case also restores its recovery ZIP from an already active generation and confirms both complete datasets remain available. Review reproduced a malformed normalized catalog field that could break search; full comparison with the hosted normalizer now rejects it and malformed saved-card fields before activation. Standards and Spec have zero remaining findings.

The packaged Windows journey passed file and confirmation cancellation, damaged-archive rejection, recovery ZIP inspection, cold reopen, restored decks and exact pending game, preserved/isolated browser recovery copies, active-generation artwork and an original player action with HTTP/HTTPS denied. Native dialogs, folder opening and relaunch are controlled in that full journey. A separate `tools/restore-native-relaunch.mjs` check leaves `app.relaunch` intact and passed actual OS spawning into a different main PID with the selected complete generation and unchanged match. Its loopback inspector endpoints verify executable, profile and a unique inherited run identity before control; cleanup uses the live spawn handle and authenticated app shutdown. No owned debug app remained running.

Prepared the Windows-origin ZIP and OS-neutral expected records in ignored `.local/portability-fixtures/` with `tools/prepare-portability-fixture.ts`. The archive includes downloaded artwork/private match data, remains outside source/release artifacts, and is ready for later host qualification. Windows evidence does not imply Mac/Linux restore qualification. The full 286-check regression snapshot passed with zero failures/cancellations in 1,050,556 ms, including the original deterministic bot matrix. It started before the final two malformed-record cases and expanded second-generation recovery assertion; the 32 focused checks passed against the current implementation. The interactive review is http://localhost:4321/f/neuroscape-app/general/reviews/2026-11-15-1940-safe-profile-restoration . All work remains uncommitted.

