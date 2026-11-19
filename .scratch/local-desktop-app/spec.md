# Neuroscape local desktop app

Status: ready-for-agent

## Problem Statement

Neuroscape players need a dependable way to build decks and play solo bot matches on their own computers. The existing hosted Deckscape application ties those activities to hosted services, while its maintainer wants to reduce hosting costs and continue maintaining the software.

Players also need current official card records and artwork, including future sets and corrections. A downloaded app becomes less useful if its catalog goes stale, loses access to artwork, or cannot distinguish new cards from cards whose mechanics it can simulate. Players must be able to keep their decks and saved matches when they disconnect, restart, update the app, or move to another computer.

## Solution

Deliver a separate open-source desktop app for Windows, macOS, and Linux. Players install the app, download the official card catalog and artwork, then build decks and play supported bot matches offline. Ordinary use requires no account, hosted database, command-line setup, or player-supplied API key.

The primary path is My decks -> Build -> Fight a bot -> Resume. Include starter-deck import, compatible Deckscape deck JSON import and export, explicit catalog sync, autosave, and portable backup and restore. Supply curated bot opponents and validated bot playbooks with app releases.

Catalog sync refreshes official card records and artwork independently of app releases. New cards can enter deck drafts before their mechanics have solo support. The app explains that distinction and checks both decks before starting a match. Existing saved matches retain their original rules and content.

## User Stories

1. As a Windows player, I want an installable desktop app, so that I can build decks and play bots on my computer.
2. As a macOS player, I want an installable desktop app, so that I can use the same core features as Windows players.
3. As a Linux player, I want an installable desktop app, so that I can use the same core features as Windows players.
4. As a player, I want the installer to include the required application runtime, so that I can start without installing development tools or a database server.
5. As a player, I want local use without registration or an API key, so that I can begin without a hosted account or paid model service.
6. As a first-time player, I want setup to explain the initial catalog download, so that I know when an internet connection is required.
7. As a first-time player without internet access, I want an actionable setup message, so that I understand why the catalog is not yet available.
8. As a returning player, I want browsing, deckbuilding, and supported bot play to work offline, so that network availability does not interrupt local use.
9. As a player, I want a visible Update cards action, so that I can refresh the official card catalog when I choose.
10. As a player, I want sync progress and cancellation, so that I can understand and control a long download.
11. As a player, I want the last successful sync time and a result summary, so that I can judge whether my local catalog is current.
12. As a player, I want added and corrected official cards to appear after a successful catalog sync, so that deckbuilding reflects the available official information.
13. As a player, I want downloaded artwork to remain available locally, so that viewing my cards does not depend on an expiring image link.
14. As a player, I want artwork corrections to be detected even when source timestamps stay unchanged, so that stale pictures do not persist unnoticed.
15. As a player, I want a failed, canceled, or interrupted sync to leave my working catalog usable, so that an update cannot remove my ability to play.
16. As a player, I want a useful error when the source or artwork download fails, so that I know whether I can retry and what remains available.
17. As a player, I want disk-space failures to be visible, so that I can free space without mistaking an incomplete download for a successful update.
18. As a player, I want cards missing from a later source response to remain readable in existing decks, so that source changes do not destroy my saved work.
19. As a player, I want missing-source cards to be identified, so that I can distinguish retained records from the current source catalog.
20. As a player, I want to browse, search, and filter the local card catalog, so that I can find cards for a deck without network access.
21. As a player, I want to inspect card details and artwork, so that I can understand a card before adding it to a deck.
22. As a player, I want a local list of my decks, so that I can return to work I have already saved.
23. As a player, I want to create and name a deck, so that I can organize a new build.
24. As a player, I want to edit card quantities and deck sections, so that I can assemble a deck under the game rules.
25. As a player, I want deck edits to autosave locally, so that closing and reopening the app preserves committed changes.
26. As a player, I want failed saves to keep my unsaved edits visible, so that a storage problem does not silently discard my work.
27. As a player, I want deck-legality feedback while editing, so that I can identify problems before starting a match.
28. As a player, I want incomplete or currently invalid decks to remain editable drafts, so that I can finish or repair them later.
29. As a player, I want to create an editable deck from a supplied starter, so that I can begin without building from an empty draft.
30. As a Deckscape player, I want to import a compatible deck JSON file, so that I can carry my existing deck work into the local app.
31. As a player, I want an import preview that identifies malformed content and unresolved card references, so that I can understand the result before saving it.
32. As a player, I want imported decks to become new local copies by default, so that importing a file does not overwrite an existing deck.
33. As a player, I want to export a deck as JSON, so that I can retain a portable copy and exchange it through files.
34. As a player, I want confirmation before deleting a deck, so that an accidental action does not remove it immediately.
35. As a player with a saved match, I want later deck edits or deletion to leave that match intact, so that I can resume the game I actually started.
36. As a player, I want solo support shown separately from deck legality, so that a legal deck does not misleadingly promise supported simulation.
37. As a player, I want newly synchronized cards available for browsing and drafts even before solo support ships, so that deckbuilding can keep pace with new sets.
38. As a player, I want changed card text or artwork to trigger a support review when required, so that solo support does not silently assume outdated mechanics.
39. As a player, I want a list of cards preventing match admission, so that I can adjust my deck or wait for the required app release.
40. As a player, I want to choose a curated bot opponent, so that I can start a solo game without downloading community content or generating a strategy.
41. As a player, I want both my deck and the bot opponent's deck checked before a match starts, so that unsupported content is caught before play.
42. As a player, I want normal game setup and legal-action feedback, so that I can play through the rules rather than manage a manual board.
43. As a player, I want the bot to take its legal turns locally, so that solo play requires no live model calls.
44. As a player, I want to complete a match and see its result, so that solo play has a clear outcome.
45. As a player, I want to close the app and resume an unfinished match, so that a game does not require one uninterrupted session.
46. As a player, I want recovery to the last committed match state after a crash, so that an interrupted process does not corrupt the game.
47. As a player, I want retried human and bot actions to apply at most once, so that a lost response or restart cannot duplicate a move.
48. As a player, I want a saved match to keep its original decks, rules, card definitions, artwork, and bot playbook, so that later updates do not alter an ongoing game.
49. As a player, I want an actionable error if the required match runtime is unavailable, so that the app preserves the save instead of guessing how to interpret it.
50. As a player, I want opening the app again to use the existing local profile safely, so that competing app instances cannot overwrite each other's work.
51. As a player, I want a complete local backup, so that I can protect decks and saved matches independently of the computer's application installation.
52. As a player, I want backup creation to capture consistent committed data, so that restoring it produces a usable profile.
53. As a player, I want to restore a backup on another supported desktop operating system, so that changing computers does not strand my local work.
54. As a player, I want invalid or unsupported backups rejected before replacing my profile, so that a damaged archive cannot destroy working data.
55. As a player, I want a recovery backup before restoring over my profile, so that I can recover if I chose the wrong backup.
56. As a player, I want a failed restore to preserve my previous profile, so that an interrupted operation remains recoverable.
57. As a player, I want application installation files separate from my local data, so that an app upgrade can preserve my profile.
58. As a player, I want app release information separate from catalog-sync status, so that I understand which update supplies new executable mechanics.
59. As a player, I want to choose when to install a downloaded app release, so that an update does not replace the app during play.
60. As a player, I want a qualified app upgrade to retain compatible saved matches, so that installing a release does not silently reinterpret or discard them.
61. As a player, I want a documented supported-OS matrix, so that I can tell whether an installer is intended for my system.
62. As a maintainer, I want reproducible local bot content assembled from reviewed inputs, so that player installations do not depend on production database records.
63. As a maintainer, I want installed-artifact checks on every supported desktop platform, so that a successful build is not mistaken for a usable release.
64. As a maintainer, I want evidence for offline play, recovery, backup, and upgrade compatibility, so that release readiness rests on player-visible behavior.
65. As a maintainer, I want source and dependency permissions checked before public distribution, so that the published code has an established licensing basis.
66. As a maintainer, I want the official-source integration and artwork-use expectations established before release, so that catalog sync follows the provider's permitted use.
67. As a maintainer, I want source attribution preserved and private operational inputs excluded, so that public distribution contains only intended material.
68. As a maintainer, I want Windows signing and macOS signing and notarization prepared for general distribution, so that players receive the intended installer experience.
69. As a player, I want the hosted site's sectioned name-list import and its existing Basic RAM and ambiguity handling, so that my established deck-list workflow works locally.
70. As a player, I want the hosted site's copyable sectioned card-list export, so that I can exchange decks using the same text format.
71. As a player, I want the hosted site's promotional PNG export, so that I can create the same shareable preview using local artwork.
72. As a player, I want the hosted catalog's existing sorting, filtering, grid/list layouts, and card previews, so that local browsing retains the controls I already use.
73. As a player, I want the hosted deckbuilder's existing deck statistics, cost tools, and opening-hand tester, so that local deckbuilding retains those established tools.

## Implementation Decisions

- Reuse the hosted site's working source and preserved tests for card import, deckbuilding, deck import/export, and solo gameplay. Keep one local implementation of each format or rule. Record the source revision and explicit adaptations, replacing duplicate prototype logic with the hosted implementation. Storage, transport, routing, and desktop integration are the necessary local seams.
- Implement this as a separate application. The existing Deckscape checkout remains read-only reference, and the hosted service remains unchanged.
- Use Electron with a bundled React/Pixi renderer, an Electron main process, and a local Node utility service. Reuse suitable TypeScript rules, bot, catalog-validation, and presentation modules deliberately. Adapt routing and transport to the local application rather than copying hosted infrastructure wholesale.
- Keep the renderer sandboxed with context isolation and Node integration disabled. The main process owns lifecycle, windows, file dialogs, and the restricted protocol for bundled UI and artwork. The utility service owns engine work, catalog downloads, and persistence. External links open in the system browser.
- Expose one local application contract through specific validated preload operations. It covers catalog reads and sync, deck operations, match admission and commands, resume, and backup and restore. Results include user-actionable failures and progress where appropriate. Rendering does not receive arbitrary filesystem, SQL, process, or network authority.
- Use one active profile per operating-system user and enforce single-instance ownership. Store application data outside installation files. Serialize writes in the local service and retain optimistic revision checks where callers can hold stale state.
- Use SQLite for deck records, match state, command receipts, catalog metadata, sync history, version references, and profile schema metadata. Select a compatible SQLite binding during the packaging proof against the bundled Node runtime. Use versioned migrations and verify preservation of existing supported data during upgrades.
- Store validated artwork bytes at content-addressed local locations. Stage and flush required objects before a transaction references them. Garbage collection preserves objects referenced by the active catalog, retained records, or saved matches.
- Adapt the existing match-storage interface rather than introducing a second rules or command pipeline. Persist accepted commands, their receipts, and resulting state atomically. Repeating the same command identity returns its recorded outcome, and stale revisions are rejected without altering the game.
- Obtain complete official-source pages and validate counts, stable IDs, unique IDs, recognized shapes, and pagination consistency before activation. Preserve official IDs across sync, decks, imports, and saved content. Reject an incomplete or incompatible snapshot with an actionable result.
- Download artwork through the local service with validated HTTPS origin and path, MIME type, size, and content hash. Bound retries and concurrency. Refresh expiring links through the official source as needed. Redact signed URL parameters from logs. Check image content rather than assuming an unchanged timestamp means unchanged artwork.
- Stage catalog records and all required artwork before switching the active snapshot in a transaction. Failure, cancellation, disk exhaustion, or termination leaves the last working catalog available. Recover or discard incomplete staging safely on the next launch, and record the sync outcome separately from activation.
- Use explicit initial download and manual Update cards for the first release. Display progress, cancellation, last successful sync time, and added, changed, missing, and failure results. Silent periodic full-artwork refresh is deferred.
- Retain records that disappear upstream when needed by existing decks or saves, and mark their missing-source status. Preserve unresolved deck references so drafts remain readable and repairable. Missing or unresolved references do not bypass match admission.
- Preserve ordinary deckbuilding operations and validation for game sections, quantities, and legality. Autosave reports failures and preserves unsaved edits. Compatible deck JSON imports are previewed and create fresh local identity by default. Deck exports preserve portable content rather than hosted publication metadata.
- Keep catalog availability, deck legality, and solo support distinct. Bind solo support to reviewed source mechanics and artwork fingerprints under the selected runtime. Changed fingerprints require review before admission using the changed content. A catalog download supplies data, never executable mechanics or plugins.
- Validate both player and bot decks before creating a match. Pin the match's decks, card definitions, artwork, engine version, rules version, and bot playbook. Match reads and commands use those pins rather than current catalog heads. Deck editing, deletion, and later catalog sync leave the pinned match unchanged.
- Package a curated collection of bot opponents, starter decks, and validated playbooks with app releases. Assemble them from reviewed source or reproducible maintainer outputs. Live AI analysis, player API keys, hosted bot ticks, production database access, and community downloads are outside normal play.
- Preserve participant projections and the existing legal-action engine during adaptation. Local persistence replaces hosted orchestration without treating the renderer as the authority on legal moves. Bound bot advancement and expose recoverable failures rather than allowing a stuck task to freeze the app.
- Produce versioned backups containing player decks, saved matches, catalog records, pinned artwork, and runtime-requirement manifests. Use a consistent SQLite backup operation. Installed executable runtimes remain app-release content rather than executable payloads accepted from a backup.
- Restore validates archive paths, resource limits, schema versions, hashes, and references in staging. Verify required runtime compatibility before activating a restored profile. Create a recovery backup before replacement, and make profile activation recoverable across failure or interruption.
- Target x64 Windows and Linux, plus Apple Silicon and Intel macOS, in the initial qualification matrix. Windows is the first proof host, not the sole release target. Resolve exact supported OS versions, Linux distributions, and display-server coverage from the pinned packaging toolchain and installed-artifact results.
- Use direct installer downloads first. Provide release information and a player-controlled download-and-install update path. Carry the runtimes needed by supported saved matches and verify upgrade compatibility before offering a release as an upgrade. Long-term runtime retirement requires a separate documented compatibility policy.
- Keep signing, publication, and permission evidence as release prerequisites. The intended license direction is MIT for code authorized for that license. Verify reused source rights and dependency notices before adding it. Preserve Neuroscape attribution and download official artwork during sync rather than embedding it in installers.

## Testing Decisions

- Use one primary feature seam: the local application contract used by the renderer. Exercise player workflows through that public contract with the actual engine, SQLite adapter, and temporary on-disk profile. Assert observable outcomes and persisted behavior rather than internal call order, helper names, or table layout.
- Use installed-app UI tests above the same contract for the complete player journey. Do not create a separate test-only command surface. Keep UI assertions focused on usable controls, projected state, visible errors, and saved outcomes.
- Reuse the existing match-storage interface as a supporting seam for command receipts, revision conflicts, crash boundaries, and bot retry behavior. Existing bot regressions with an in-memory store are prior art for controlled scenarios; they do not establish durability of the new SQLite implementation.
- Test catalog sync through the public application operations with a controlled official-source substitute. Supply complete, partial, duplicate, drifting, malformed, interrupted, and incompatible pages. Verify the externally visible catalog and last successful activation after each result.
- Cover expired artwork links, invalid origins, invalid MIME or size, corrected bytes with unchanged timestamps, cancellation, retry exhaustion, and disk-space failure. Observe catalog availability, progress results, and retained images rather than mocking successful activation.
- Cover player-visible deck operations, autosave failure, stale revisions, legal and incomplete drafts, starter import, compatible JSON round trips, malformed or oversized imports, new-copy identity, and unresolved references.
- Cover match admission for both decks, unsupported and changed cards, normal setup, legal play, bot advancement, completion, close and resume, crash recovery, and duplicate command retries. Use fixed seeds and reviewed playbooks for reproducibility; separate tactical bot quality from deterministic execution correctness.
- Verify that a catalog update or deck deletion leaves an already saved match's original content and outcomes unchanged. Include an unavailable-runtime case that preserves the save and reports an actionable incompatibility.
- Test consistent backup creation, cross-platform restore, invalid paths, oversized or corrupt archives, missing references, unsupported schemas, unavailable runtimes, interrupted restore, and recovery-backup creation. Assert that failed restore leaves the prior profile usable.
- Verify the installed application from a fresh profile without Supabase configuration: download a complete catalog and artwork, import or build a legal deck, disconnect the network, complete a bot match, and restart to resume a separate unfinished match.
- Offline qualification must deny network access to the entire application, including the main and utility processes. A renderer-only network toggle is insufficient evidence. Controlled source fixtures support repeatable regression checks; a real official-source rehearsal is separate integration evidence.
- Repeat installed-artifact qualification on Windows, both initial macOS architectures, and the documented Linux matrix. Include Pixi rendering, native file dialogs, data-directory behavior, single-instance handling, restart, and Linux display-server compatibility.
- Test an upgrade from a prior supported release using pinned saved-match fixtures and a profile backup. Verify deck retention, catalog references, runtime resolution, and resume behavior after migrations. Mark compatibility unsupported rather than silently loading a save under different mechanics.
- Exercise the actual preload boundary and restricted local-content protocol for malformed operations and paths. Verify that external content cannot obtain generic privileged operations and that source URL secrets are absent from player-facing errors and logs.
- Prefer the reference application's existing Node test runner and Playwright conventions when adapting useful tests. Prior art includes catalog pagination and diff tests, validated deck-backup parsing, bot execution with an in-memory match store, and browser bot setup and resume tests. These were inspected as examples, not executed as proof of this app.
- Record package size, startup time, memory use, and GPU behavior during the packaging proof. Establish release expectations from those measurements rather than inventing numerical budgets in this spec. Keep unit, service, installed-app, platform, live-source, and permission evidence distinct.

## Out of Scope

- Phone support, a browser-only edition, app-store distribution, and additional ARM desktop targets.
- Multiplayer, hosted accounts, cloud synchronization, public deck publication, and community opponent downloads.
- Collection tracking, guided learning, gauntlets, additional match analytics, and unrelated Deckscape features. The hosted deckbuilder's existing statistics, cost tools, and opening-hand tester remain in scope.
- Player-run AI strategy generation, live model calls during bot matches, and executable plugins from catalog or backup data.
- Automatic support for every future card mechanic. Catalog sync makes new data available; executable solo support requires reviewed app-release work.
- Silent periodic full-artwork sync, background app replacement, and a long-term runtime-retirement mechanism.
- Migration of hosted matches, private production data, or accounts. Deck JSON portability is the scoped bridge from Deckscape.
- Changes to the existing Deckscape checkout or hosted service, service retirement, and claims of measured hosting savings.
- Public release, repository publication, provider contact, signing purchases, commits, or pushes as part of writing this spec.

## Further Notes

This spec synthesizes the adopted local-app design and ADRs 0001 through 0003 using the project glossary. The user explicitly selected Windows, macOS, and Linux and delegated the remaining recommendations. The recommended test seams are selected under that delegation; no separate seam confirmation or new interview is needed.

At spec creation, the destination contained workflow and design documentation without application code or package configuration. The reference application supplies the working functionality baseline; copied code and adapted tests need deliberate integration and validation. Implementation progress and new evidence belong to the owning tickets. The initial source inspections and one-card feed probe alone do not prove offline behavior, complete catalog support, or cross-platform packaging.

The first implementation slice is a disposable packaging and persistence proof that validates the selected runtime, SQLite binding, app-service boundary, and rendering path. Carry the full offline player journey through installed artifacts before claiming the architecture is qualified. Expand platform qualification before claiming the three-platform release is ready.

Implementation work must retain these unresolved checks explicitly:

- Select and pin the Electron toolchain and SQLite binding, then establish the supported OS and Linux distribution matrix from real builds and runs.
- Assemble a complete locally usable catalog, starter set, engine/rules runtimes, curated bot opponents, and validated playbooks without production database extraction.
- Establish current official-source integration expectations, caching and download limits, and intended artwork-use permissions before release. Keep the external API replaceable behind its source adapter.
- Verify source ownership, reused-code licensing, dependency notices, and attribution before assigning a public code license or publishing.
- Prepare the signing identities, macOS notarization, release location, and platform qualification needed for general distribution without assuming those credentials or permissions already exist.
- Qualify backup, restore, migration, and saved-runtime compatibility before describing an app release as a safe upgrade.

The ready-for-agent status means the agreed scope is ready for implementation-ticket planning. It does not mean these checks have passed or that the application is ready for release. Keep verification results and later scope changes with the owning implementation tickets.
