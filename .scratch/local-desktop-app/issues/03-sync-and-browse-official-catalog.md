# 03: Download and browse the official card catalog locally

**What to build:** From first-run setup, download a complete official card catalog and its artwork, then browse, search, filter, and inspect cards using local storage while offline.

**Blocked by:** 01 - Prove a packaged local profile on Windows.

**Status:** complete

**Spec stories:** 6, 7, 9, 11, 12, 13, 20, 21, 72.

- [x] Reuse the hosted import schemas, pagination, normalization, Basic RAM correction, and stable change comparison with their existing tests; record the source revision and local storage adaptations.
- [x] Adapt the hosted catalog's existing filters, sorting, grid/list layouts, hover and detail previews instead of replacing those controls with a reduced custom browser. Only explicitly deferred collection/account controls are excluded.

- [x] First-run UI explains the download requirement; an offline fresh profile shows an actionable message without pretending a catalog is installed.
- [x] The Update cards action obtains all pages, validates stable and unique IDs, counts and source shapes, and stages required artwork before activating the complete snapshot.
- [x] Artwork downloads enforce approved HTTPS origin and path, MIME and size bounds, and content hashes; source URL query secrets are redacted from output.
- [x] Catalog records, artwork references, active snapshot identity, and last successful sync time persist through the local application contract and real SQLite profile.
- [x] Browsing, search, filters, details, and artwork reads use the active local catalog after network access is denied to the entire app.
- [x] UI shows the successful sync time and basic added/changed results; an unsuccessful initial download leaves setup retryable.
- [x] Application-contract and UI checks use complete and invalid controlled source pages; record a separate read-only official-source integration rehearsal without claiming it proves long-term API stability.


## Comments

2026-11-15: Completed the local catalog slice using the existing hosted importer, types, Basic RAM correction, and catalog/preview controls. The source revision and 26 copied/adapted artifacts are recorded in the reuse manifest and parity map; all recorded source/local hashes were checked. Original importer regression assertions were retained with only an import-path change. Replaced the prototype's duplicate pagination, normalization, comparison, and browser UI after the user's explicit hosted-functionality clarification.

TypeScript and all 10 current service/importer tests passed. The nonstandard artwork-port regression failed before the exact-origin fix, then passed. Canonical source key ordering is handled by the original importer and its preserved regression. The packaged controlled-source UI exercised first setup, multi-page sync, local search, sorting/list/filter controls, previews, hash-route details, malformed-update preservation, and restart with the source stopped.

The final live rehearsal, using the reused importer and Electron utility network transport, synchronized 256 cards and artwork in about 40.3 seconds, decoded local artwork, and recorded zero page errors. A separate proof denied HTTP/HTTPS in the explicitly shared Electron network session, demonstrated rejected main and utility requests, and kept the 256-card library, search, artwork and enlargement usable. This is current-transport catalog-level offline evidence; ticket 19 retains the complete deckbuilding/bot/upgrade installed-app journey.

Standards and Spec reviews: zero remaining findings. The reference checkout's tracked diff remains empty. No commit, public release, or provider contact occurred. The user is locating existing provider permission while independent implementation continues.
