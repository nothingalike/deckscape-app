# Hosted functionality reuse

The source baseline is Deckscape at commit `032a0ec6d4d644f0d37b3b586b8d33b5089e2f9d`, remote `github.com/nothingalike/deckscape`. The user explicitly directed reuse of the working hosted-site functionality on November 15, 2026. The source checkout is read-only; local adaptations belong here.

## Reuse boundaries

| Capability | Existing implementation to preserve | Local adaptation |
| --- | --- | --- |
| Official card import | Catalog schemas, complete-page validation, Basic RAM correction, normalization, stable change comparison, and import regressions | Staged local artwork and transactional SQLite activation replace Supabase storage and database writes. Preserve bounded downloads and source validation. |
| Card browsing | Existing catalog controls, set/card-number, name and RAM sorting, grid/list layouts, filters, hover and detail previews | Resolve downloaded artwork locally and adapt route links. Exclude only controls tied to explicitly deferred collection/account features. |
| Desktop presentation | Existing card, editor, import/export and game interactions | The November 16 user request adopts shadcn components and a dark cyan/magenta theme with layouts sized to the desktop window. Marketplace and eBay purchase controls are omitted at the user's explicit request. |
| Deckbuilding | Existing editor/workspace, section and quantity handling, mainframe replacement, legality and copy-limit rules, descriptions, preview, recovery, cost/statistics and opening-hand tools | Save through the local service and SQLite while preserving revision conflicts and unsaved-draft recovery. |
| Deck import | Existing starter handling, JSON-backup parser and sectioned name-list parser, including Basic RAM handling and ambiguous-name validation | Use native file dialogs or local paste entry, with the same validation and new-copy behavior. |
| Deck export | Exact JSON backup, copyable sectioned card list, and promotional PNG export | Preserve format and click-time snapshot behavior; use local artwork and desktop-safe clipboard/file operations. A promotional PNG remains a preview, not an importable deck. |
| Solo game | Existing engine, setup/mulligan, commands, participant projections, rules/card definitions, admission, quotes/choices, bot policy/executor/playbooks, and React/Pixi gameplay surface | Implement local persistence at the existing match-store seam and local IPC transport at existing UI/service contracts. Reuse mechanics and presentation logic. |
| Saved match resume | Existing unfinished-game list, strict directory metadata, precise cursor pagination, and participant match views | Read the owned SQLite profile through the same directory contract. Resolve the saved pins, label frozen deck names, and retain unavailable-runtime saves with an explanation. |

## Evidence and verification

`reuse-manifest.json` records each copied source artifact, original commit, source hash, local hash, and adaptation. Unmodified copies must continue to match their recorded source hash. Adapted copies retain the original hash and explain the change.

The first reused modules are the source card types, catalog import functions, Basic RAM corrections, and importer tests. The tests retain their assertions with only the local import path changed. These replace the prototype's duplicate catalog schemas, normalization, pagination, and change comparison.

As each later ticket consumes hosted functionality, add its modules and preserved tests to the manifest. Demonstrate behavior with those existing fixtures and the local application boundary. Keep desktop changes distinct from genuine functionality changes, and record every deliberate deviation in the owning ticket.

Public distribution still requires the source/provider/artwork/signing evidence in the distribution prerequisite record. The user is locating the existing provider agreement; no new provider contact is authorized by that request.

Installed qualification exposed a command-coordinator race: a distinct next
command submitted while an acknowledged snapshot appeared could wait for the
fallback poll. The local copied coordinator drains that queued command after
the preceding delivery unwinds. The original coordinator regressions and the
new red/green `tests/match-client-delivery.test.ts` cover the change. Its source
and adapted hashes remain distinct in the manifest. Game rules and mechanics
remain the hosted implementation.
