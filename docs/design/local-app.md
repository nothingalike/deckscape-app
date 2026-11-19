# Local app design decisions

Design baseline adopted on November 15, 2026. The user set the product intent and desktop platform scope, then delegated the remaining recommendations. These decisions define the application; implementation and qualification evidence live in the owning tickets.

The user subsequently clarified that the existing hosted card importer, deckbuilder, deck import/export, and game are the functionality baseline. Apply [the reuse decision](../adr/0004-reuse-hosted-functionality.md) and [the parity map](../hosted-parity.md). Existing deck statistics and opening-hand tools are included; the statistics deferral below concerns additional match analytics.

## Player experience

The first release serves deckbuilding and solo bot matches on Windows, macOS, and Linux. Phones are outside this product scope. A player installs the app, downloads the official catalog and artwork, then builds decks and plays offline. Players use the packaged runtime without installing Node, a database server, or command-line tools.

The primary path is **My decks -> Build -> Fight a bot -> Resume**. Include starter-deck import, existing deck JSON import and export where compatible, manual catalog sync, and backup and restore. Bundle a curated set of bot opponents and validated playbooks with app releases. Creating new AI-generated strategies is maintainer tooling, not a player prerequisite.

Keep the first release focused on that path. Collection tracking, guided learning, gauntlets, advanced statistics, community opponent downloads, accounts, cloud synchronization, and multiplayer are deferred. The hosted Deckscape service and existing checkout remain separate.

## Desktop architecture

Use [Electron and the existing React/Pixi direction](../adr/0001-desktop-platforms-and-runtime.md). Extract reusable UI and rules modules into this repository; adapt routing and transport around the local service. Carry over source deliberately rather than importing the hosted Next.js server, authentication, or operational settings wholesale.

```text
Bundled React/Pixi UI
    -> specific preload operations
    -> Electron main process
    -> local Node utility process
         -> rules engine and bot executor
         -> SQLite store
         -> catalog sync and artwork directory
```

The utility process owns match-command serialization and persistence. The main process owns windows, lifecycle, and file dialogs. The renderer receives projected game state through validated operations. Downloads are data inputs, never executable plugins. External links open in the system browser; the privileged application window loads bundled content.

Use one active local profile per operating-system user for the first release. Single-instance handling prevents competing writers. Reopening after a crash uses committed state and command receipts, including when a bot action was interrupted.

## Data and portability

Use [SQLite and local artwork storage](../adr/0002-local-data-ownership.md). Deck autosave reports failures visibly and keeps unsaved edits available. Deleting a deck requires confirmation and leaves any existing saved match self-contained.

Deck JSON import previews validation errors and creates a new local copy by default. Import never silently replaces an existing deck. Preserve official card IDs and unresolved references so a deck remains readable when a source card disappears.

A versioned backup contains player decks, saved matches, catalog records, pinned artwork, and the manifests needed to identify their runtime requirements. Produce a consistent database snapshot through a supported SQLite backup operation rather than copying a live database file. Restore validates schema, hashes, references, size limits, and archive paths in staging. It preserves the current profile until replacement is complete and creates a recovery backup before replacing it.

## Catalog updates and offline operation

Use [separate catalog and executable update streams](../adr/0003-catalog-and-executable-updates.md). First-run setup explains that the catalog requires an internet connection. After a successful download, ordinary browsing, deckbuilding, and supported bot play use local data.

Provide **Update cards** with progress, cancellation, last successful sync time, and a result summary. Use bounded retries and conservative request concurrency. Obtain fresh source links when needed, validate image origin, MIME type, size, and content hash, and redact signed URL parameters from logs. Reuse the reference importer's pagination and unique-ID validation principles. Do not depend on source timestamps to detect artwork corrections.

Use explicit sync for the first release rather than silent periodic full-artwork downloads. A canceled or failed update keeps the prior catalog active. Disk-space failures report what remains usable. Temporary staging data is recoverable or removable on the next launch; cleanup retains every object referenced by an active snapshot or saved match.

For example, a new set may appear in the catalog today while its mechanics ship in a later app release. The deckbuilder shows those cards immediately and labels their solo support. Starting a bot game lists the unsupported cards that prevent admission. Existing saved matches keep their original content.

## Release and support boundaries

Target all three desktop operating systems. Start the proof on Windows because that is the available development host, then require installed-artifact qualification on macOS and Linux before claiming the three-platform release is ready. Include Apple Silicon and Intel Mac coverage, and x64 Windows and Linux coverage in the initial build matrix. Additional ARM targets remain a later compatibility expansion.

Select exact minimum OS and Linux distribution versions against the pinned Electron toolchain during the packaging proof. Document that matrix rather than promising every OS release. Test Linux display-server compatibility and Pixi rendering, not just package creation.

Use direct installer downloads as the first distribution path, with Windows signing and macOS signing/notarization prepared before general release. The initial app-update flow opens release information and lets the player install the downloaded release. Background self-updating and app-store distribution can follow after backup and upgrade compatibility are qualified. Publication and signing purchases are separate actions.

The intended code-license direction is MIT for code whose owners authorize that license. Verify rights to reused source and dependency notices before adding the license or publishing. Preserve Neuroscape attribution. Download official artwork at sync time rather than embedding it in installers; provider integration terms, caching limits, and permission for intended use remain release prerequisites. The official feed is an external dependency, not a contract established by the earlier one-card probe.

## Evidence and remaining qualification

The read-only Deckscape inspection found Node imports in `lib/simulator/match-service.ts` and `bot-executor.ts`, a `MatchStore` seam, browser-local deck persistence, and a Supabase-backed bot catalog. Its playbooks are validated strategy data. Actual releasable bot packs still need to be assembled from reviewed source or reproducible maintainer outputs; production database contents are not migration inputs.

The first implementation proof must use a fresh local profile with no Supabase configuration. It must download a complete catalog and artwork, import or build a legal deck, disconnect the network, complete a bot match, and resume a separate interrupted match after restarting the app. Repeat against installed artifacts on each target platform.

Also qualify interrupted-sync rollback, expired-link recovery, missing-card retention, changed-card support invalidation, bot retry idempotency, crash recovery, backup restoration on another OS, and save compatibility across an app upgrade. Packaging size, memory use, startup time, and GPU behavior need measurements from the proof. Implementation evidence now lives in [the ticket records](../../.scratch/local-desktop-app/issues/) and [the current qualification](../../README.md#current-qualification); the initial design preceded those checks.

The remaining unknowns are verification work: cross-platform packaging and SQLite binding compatibility, complete offline content assembly, distribution prerequisites, and source/provider permissions. No additional product answer is needed to write the implementation spec for this baseline. These unknowns must remain explicit in that spec rather than being treated as completed checks.

## Documentation sources

- [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model).
- [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation).
- [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing).
- [SQLite atomic commit](https://www.sqlite.org/atomiccommit.html).
- [Canonical terms](../../GLOSSARY.md).
