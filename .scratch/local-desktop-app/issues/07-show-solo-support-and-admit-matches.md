# 07: Show solo support and admit a supported bot matchup

**What to build:** Choose a player deck and one curated bot deck, see legality and solo support separately, and create a validated, persisted match setup only when both decks are supported.

**Blocked by:** 05 - Build and autosave editable local decks.

**Status:** complete

**Spec stories:** 36, 37, 38, 39, 41.

- [x] Reuse the hosted engine admission, reviewed card definitions, setup contracts, and existing regression tests; implement local storage and transport adapters without replacing established rules.

- [x] Adapt the existing engine admission and match-storage boundaries for one reviewed starter matchup, using controlled reviewed local content rather than production database extraction.
- [x] Show solo-support indicators separately from catalog availability and deck legality in relevant card/deck and match-entry views.
- [x] New catalog cards remain browsable and draftable while unsupported; admission lists specific unsupported or unresolved cards in either deck.
- [x] Source mechanics or artwork fingerprint changes invalidate support for changed content until reviewed; a stable card ID alone cannot preserve support.
- [x] A valid selection creates one persisted match-setup identity with original decks, definitions, artwork, engine/rules versions, and the initial validated bot playbook pinned.
- [x] Application-contract and UI checks cover supported selection, invalid player and bot decks, new unsupported cards, and changed fingerprints; this slice stops at a ready setup rather than claiming a playable board.

## Comments

2026-11-15: Completed after the user's explicit instruction to resume the goal. The default bundled content uses the unchanged hosted expanded-v6 definitions, rules 1.1, source mechanics fingerprint function, admission and setup implementation. The source starter resolver selects the transcribed Corpo starter as the initial curated opponent. Its initial strategy is the hosted schema-validated general fallback; no generated strategy, live model, player key, hosted runtime or production database extraction is used. The UI describes this as a general strategy stored with the matchup.

The frozen hosted catalog baseline reconstructs the reviewed source mechanics inputs. A read-only comparison of all 256 existing cached source records against the original sourceMechanicsHash and definition artwork SHA values found 256 matches and no mismatch. Baseline inventory alone is not executable support: support additionally requires the versioned expanded-v6 definition and engine manifest. Catalog data can never install executable definitions or strategies. Missing-source records remain independently labelled; matching reviewed cached content can still be admitted offline.

New desktop adapters expose specific typed solo operations. Card, editor and deck-list views distinguish solo support from source availability and existing legality. Match entry checks both decks, names unresolved/unsupported/changed cards, and keeps legality, content support and aggregate admission readiness separate. Mechanics or artwork changes block new admission despite stable card IDs. Unknown cards remain available to browse and save in drafts. Admission also hashes the actual bounded artwork file and rejects missing, damaged or symbolic-link artwork.

Schema 6 stores each setup in one atomic SQLite insert with original decks, versioned definitions, complete card records, content-addressed artwork mappings, the initial validated playbook and the original engine setup state. Definitions, engine/rules versions and playbook are pinned. Expected deck revisions reject stale selections. Retrying the same request ID and selection returns the original identity, even after deck edits or restart; reusing that ID for another selection is rejected. The renderer receives summary metadata without the private random seed or bot hand. This slice saves an admitted setup with its original opening decision; gameplay and command receipts belong to 08.

Validation: TypeScript and all 85 checks passed, up from 65. Sixteen original hosted admission, readiness, definition-version and setup assertions remain unchanged apart from import paths. Four public application-contract checks use real SQLite and deterministic, explicitly injected test content with synthetic artwork; the production content has no such override through IPC. They cover valid setup, retry/restart/original-content retention, invalid player and bot decks, mechanics/artwork invalidation, unknown cards, corruption, stale revision, failed SQLite insert and retry.

The packaged Windows solo UI proof uses a disposable SQLite backup and artwork copy of the previously downloaded full official catalog. Its original profile stays read-only, and no new bulk download is needed. HTTP/HTTPS is denied in the shared application session with a blocked request as positive control. The UI covered a supported Dustrunner-versus-Corpo setup, incomplete player, invalid/unresolved bot, new unsupported card in preview and editable legal draft, changed player mechanics and bot artwork, disabled admission, saved setup and restart. Zero page errors. Packaged desktop sandbox/capability, hosted catalog and editor regressions passed. This is unpacked Windows evidence; installed-artifact gameplay and other operating systems remain upcoming qualification.

Code review: Spec found that match-entry support initially used aggregate readiness and thus mislabelled an incomplete but supported deck. An independent supported flag now drives the support label; aggregate ready continues to gate setup creation. Contract and packaged UI checks preserve the distinction. Standards and Spec each have zero remaining findings. All 510 source/local provenance hashes match; the source closure includes unchanged runtime dependencies used by the preserved readiness regressions and the upcoming gameplay port. The read-only reference checkout is unchanged. No commits, pushes or publication occurred.
