# 10: Keep saved games intact through catalog and deck changes

**What to build:** Delete or edit a deck and update the catalog without changing an existing saved game's original cards, artwork, rules, or strategy.

**Blocked by:** 04 - Keep the working catalog through failed and changed syncs; 09 - Resume an unfinished match with its original content.

**Status:** complete

**Spec stories:** 18, 19, 34, 35, 38, 48.

- [x] Deleting a local deck requires confirmation and removes the draft without removing the content needed by an existing saved match.
- [x] After deck edits, deletion, new catalog activation, changed fingerprints, or a missing-source card, the saved match resumes with its original pins.
- [x] New match admission uses current reviewed support while existing games retain their original content, with the distinction visible when needed.
- [x] Retained deck records and unresolved references remain readable and repairable when official content disappears.
- [x] Artwork cleanup preserves saved-match and retained-record references; unreferenced staging can be removed without breaking a valid save.
- [x] End-to-end regression fixtures sync a changed catalog, alter or delete the originating deck, reopen the app, and verify unchanged match content and subsequent outcomes.

## Comments

The existing catalog retention, content-addressed artwork, independent pinned match record, hosted editor confirmation and unknown-reference repair already provide the required behavior. This slice preserves those implementations and adds an explanation to the original resume list: saved matches keep original cards and rules while catalog updates apply to new matchups. No rules, strategy or cleanup algorithm was replaced.

`tests/match-content-retention.test.ts` creates one original save and a control through supported SQLite backup. The changed branch activates changed mechanics/artwork and a missing-source card, edits and deletes the originating deck, retains and repairs an unknown draft reference, removes the current opponent head, and reopens after abandoned staging cleanup. Original match projection, summary and artwork hash stay unchanged. Both branches then run original public commands and the hosted bot to exactly equal final health-outcome projections. Passed in 57 seconds.

The packaged Windows proof (`npm run test:retention-ui`) passed actual confirmation dismiss/accept, catalog activation through a controlled loopback source, retained card labeling, unresolved-card repair, current support blocking new admission, normal restart, original cached bitmap decoding and the next original player action with HTTP/HTTPS denied. Zero page errors. TypeScript passed. Standards: zero findings. Spec: zero findings. All 600 source/local hashes match; source checkout unchanged.

Evidence: `.local/content-retention-verification.log`, `.local/content-retention-ui.json`, `.local/retention-{missing-card,new-admission,resumed}.png`. Ticket 09 holds the broader current 130-check regression run and ticket 08 the unchanged heavy bot matrix. Cleanup conservatively retains artwork objects and removes only owned abandoned staging; reclaiming unused cached artwork is deferred. Installed crash recovery, other platforms and distribution permissions remain their owning tickets. All work remains uncommitted.

