# 05: Build and autosave editable local decks

**What to build:** Create, name, reopen, and edit local decks from the downloaded catalog, with live legality feedback and reliable autosave of drafts.

**Blocked by:** 03 - Download and browse the official card catalog locally.

**Status:** complete

**Spec stories:** 22, 23, 24, 25, 26, 27, 28, 73.

- [x] Adapt the existing hosted editor/workspace and its legality, copy-limit, section, mainframe-replacement, preview, draft recovery, description, and layout behavior; replace only hosted/browser persistence with the local service.
- [x] Preserve the hosted deckbuilder's existing statistics, cost tools, and opening-hand tester with their current semantics and regression fixtures.

- [x] My decks lists local drafts and opens a named deck; players can add and remove cards and change quantities in the required game sections.
- [x] Persist edits through the local application contract and SQLite, preserving official IDs and checking expected deck revisions.
- [x] Reopening the app restores committed deck content; incomplete and currently illegal decks remain editable drafts.
- [x] Display legality feedback separately from storage errors and later solo-support admission decisions.
- [x] A failed save preserves visible unsaved edits and offers an actionable recovery path; stale writes do not overwrite newer committed content.
- [x] Application-contract and UI checks cover create/edit/reopen, valid and incomplete drafts, stale revisions, and injected storage failure.


## Comments

2026-11-15: Completed local decks by porting the hosted editor/workspace, deck list/row, drawer, recovery, statistics, cost curve, opening-hand tester, legality, placement and quantity modules. Canonical deck persistence now uses the typed local application contract and real SQLite schema 5 with expected revision checks. The hosted recovery buffer remains separate from canonical saves. Local routing flushes pending changes before navigation; deletion retains confirmation and revision checks. Account/publication, collections and hosted history controls are omitted under the adopted scope; local solo entry connects in tickets 07-08. The existing interchange components are dependencies of the editor, with their full qualification still owned by 06.

Preserved 13 original legality/layout/statistics/hand regression checks with import-path-only changes. The new application-contract checks cover create/edit/reopen, incomplete drafts, stable official IDs, stale revisions, a real SQLite trigger write fault, unchanged committed data and successful retry. The complete TypeScript/test validation passed all 47 checks.

Packaged Windows UI passed naming/descriptions, mainframe replacement, RAM and cyberdeck quantities, sideboard copy-limit feedback, original cost/statistics and one ordered mulligan/draw, visible failed edits, retry, blocked navigation on save failure, drawer, valid-deck feedback, source-stopped restart and decoded local artwork. Draft recovery was exercised after terminating the exact app process group, after an explicit browser-storage flush; this proves that recovery path, not physical power-loss durability. An initial harness race between recovery autosave and independent fixture seeding was corrected by waiting for the public read to observe the saved recovery.

Standards review reproduced a P1 native-Quit bug: before-quit closed the service before a dirty editor could veto closing. A new regression failed with SERVICE_UNAVAILABLE, then passed after service cleanup moved to guarded will-quit. The final packaged test proves canceled Quit leaves reads/saves usable, retry succeeds, and subsequent normal Quit/reopen preserves the deck. Both review axes now have zero remaining findings; the original finding and resolution remain recorded here.

A separate rehearsal used the existing 256-card official catalog with HTTP/HTTPS denied in the shared application network session. Main and utility positive controls were denied; the hosted editor displayed a valid deck, autosaved, reopened and decoded real local artwork. Its temporary deck was removed. All 57 copied/adapted artifact hashes match their read-only source and local records. Full bot/backup/platform qualification remains upcoming. Changes remain uncommitted and the source checkout remains unchanged.