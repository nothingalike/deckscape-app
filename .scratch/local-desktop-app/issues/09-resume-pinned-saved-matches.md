# 09: Resume an unfinished match with its original content

**What to build:** Close and reopen the desktop app, select an unfinished saved match, and resume its committed game state with the original rules and content.

**Blocked by:** 08 - Play one supported bot matchup to completion.

**Status:** complete

**Spec stories:** 45, 49.

- [x] Expose unfinished matches and a Resume action that restores the actual committed setup or game state through the local service.
- [x] Resolve pinned decks, definitions, artwork, engine/rules versions, and bot playbook rather than reading current catalog or strategy heads.
- [x] Preserve pending player decisions, turn ownership, and the next bot work across a normal close and restart.
- [x] When a required runtime is unavailable, report the incompatibility, retain the original save, and avoid reinterpreting it under another runtime.
- [x] UI and real-storage tests cover resume during setup, a player decision, and a bot turn, plus an unavailable-runtime fixture.

## Comments

Reused the hosted unfinished-game list, stylesheet, strict metadata parser and original directory tests. The local directory adapter reads the owned SQLite profile and excludes completed outcomes. Schema 8 records save times in the same transaction as state and receipts. Match views resolve saved decks, definitions, artwork references and the saved playbook; they do not reread current catalog, player-deck or opponent heads. Engine/rules or reviewed-definition mismatches return MATCH_INCOMPATIBLE, preserve the save and leave compatible saves accessible.

TypeScript and 130 current regression checks passed, including the original engine/client/service tests and the real-storage health-outcome/receipt-fault test. The unchanged heavy source bot matrix retains its completed ticket 08 full-suite evidence rather than being rerun. After the review fix, all seven focused resume/directory checks passed again. The pagination regression preserves six-digit fractional timestamps, equivalent time-zone cursors and uppercase UUID ordering across 20+1 saves. Review reproduced uppercase IDs repeating a page; consistent UUID comparison and ordering fixed it. Standards: zero remaining findings. Spec: zero findings.

The packaged Windows app passed normal close/restart for setup and a pending player decision, then continued the next action. A pending bot turn remained unchanged while closed from the match list and advanced after Resume. A fixture requiring an unavailable executable version stayed listed with an explanation, had no Resume link, rejected direct navigation and retained its original summary. HTTP/HTTPS was denied with a positive control. Cached artwork and the original setup/game UI rendered without page errors. Packaged admission and the exact desktop capability/profile boundary also passed.

Evidence: `.local/resume-verification.log`, `.local/resume-focused.log`, `.local/resume-ui.json`, `.local/resume-{setup,player,bot,incompatible}.png`, `.local/solo-ui.json`, `.local/desktop-proof.json`. All 600 source/local provenance records match; the reference checkout is unchanged. This slice qualifies the unpacked Windows artifact; installed crash recovery and other operating systems remain their owning tickets. All work remains uncommitted.

