# 06: Import starters and exchange compatible deck JSON

**What to build:** Create a local deck from a supplied starter or compatible Deckscape JSON, preview problems, and export portable deck content without replacing existing drafts.

**Blocked by:** 05 - Build and autosave editable local decks.

**Status:** complete

**Spec stories:** 29, 30, 31, 32, 33, 69, 70, 71.

- [x] Reuse the existing hosted starter handling, exact JSON backup parser, sectioned name-list import, text export, click-time export snapshot, and promotional PNG implementation, adapting local artwork and desktop file/clipboard operations.
- [x] Preserve name normalization, ambiguous alternate-printing errors, explicit/implicit Basic RAM handling, existing section headings, and JSON identity-discard behavior using the hosted import/export regression fixtures.
- [x] Offer the existing JSON, copyable card-list, and promotional PNG export choices with their established meanings; promotional images remain previews rather than importable or complete deck lists.

- [x] A player selects a supplied starter and receives an editable local copy with fresh identity.
- [x] A native file-import flow previews compatible deck JSON and identifies malformed, unsupported, oversized, and invalid content before save.
- [x] Unresolved card references remain visible and repairable; imported content does not become eligible for play merely because it parsed.
- [x] Import creates a fresh local copy by default and leaves existing deck identity, revisions, and hosted publication metadata out of the replacement decision.
- [x] Export through a native save flow produces portable deck content that round-trips into another new local copy.
- [x] UI and application-contract checks cover starter import, compatible legacy fixtures, round trips, malformed inputs, and preservation of existing drafts.



## Work History

2026-11-15 14:15: Paused at the user's request. Partial import/starter contract and original import UI are present; two new contract checks passed. Latest copied text-import regressions need their missing frozen catalog fixture and CommonJS path adaptation; that pending command was rejected after the pause. Native export adapters, full validation and review remain unfinished. Status stays in-progress; preserve all uncommitted work.

Resumed on the user's explicit instruction to pick up the implementation goal. Continue from the saved fixture/export work; ticket status remains in-progress.

## Comments

2026-11-15: Completed hosted deck interchange after the user resumed development. The original JSON backup parser, sectioned text parser, starter resolver/manifest, text export, promotional model/rendering and click-time snapshot remain the implementations. New imports use one SQLite insert with a fresh identity and revision, preserve unresolved IDs for repair, and leave existing decks untouched. JSON and text both have a review step before save. The original Chromium file input supplies file selection; the desktop wraps native save dialogs and clipboard operations in specific trusted-frame IPC capabilities.

Native JSON and PNG saves validate their payloads, stage a sibling file, sync it and rename it over the chosen destination. Canceling preserves the prior file and working draft. Partial-write fault injection proved that the old file remains complete, owned temporary files are cleaned, and retry succeeds. Clipboard failure preserves selected manual-copy text. Conflict recovery waits for a successful native backup before allowing that exported snapshot through the unload guard; canceling stays on the unsaved draft. The window allows reloading only the same bundled document. The promotional renderer can fetch validated local artwork through the restricted app protocol; it retains the original renderer and fallback behavior.

Validation: TypeScript and all 65 checks passed, including 15 preserved hosted backup/text/export/starter assertions and three public application-contract import checks with real SQLite. The previously paused fixture setup was finished as a test-only frozen catalog and CommonJS fixture-path adaptation; every hosted assertion was retained. A valid-checksum PNG fixture exercises actual bitmap decoding rather than accepting only an image signature.

Packaged Windows tests passed JSON round trips/new-copy identity, malformed/unsupported/oversized/duplicate rejection, unresolved-reference preview and repair, format changes requiring a new preview, native JSON/PNG file output, cancellation, conflict backup/reload, partial-write preservation/retry/cleanup, and manual clipboard fallback. A separate full controlled catalog exercised all four supplied starter choices, text import and implicit Basic RAM, original click-time image naming, decoded artwork in the generated PNG, and reopening after source shutdown. Native save selections and clipboard writes were controlled at the OS boundary; files, bitmap rendering and SQLite were real. Physical selector/clipboard interaction and other operating systems remain later qualification.

A separate existing 256-card profile passed with main and utility HTTP/HTTPS positive controls denied. The hosted editor saved/reopened a valid official-card deck and exported a 1200x630 PNG containing real local official artwork. The temporary proof deck was removed. No fresh official bulk download was needed.

Standards and Spec reviews each found the same stale-preview P2: format switches retained another format's counts/issues and could skip reviewing the new input. A regression failed before the handler cleared preview and unresolved IDs, then passed in both directions. Both axes now have zero remaining findings. All 69 source/local provenance hashes match. The reference source checkout remains unchanged, and no commits, pushes or publication occurred. Ticket07 is next.