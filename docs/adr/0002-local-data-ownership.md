# Keep player data in a local SQLite store

Use SQLite for decks, saved matches, catalog metadata, and active-version references. Store validated artwork bytes in a content-addressed directory inside the operating system's per-user application data location. A single local service owns writes and preserves revision checks at the application boundary.

This replaces the reference app's mix of browser storage and hosted persistence with one durable local authority. Local play requires no account, Supabase project, or player-supplied API key. SQLite transactions suit atomic catalog activation and match-command receipts; filesystem artwork is staged and flushed before a transaction references it, with recovery and disk-full behavior verified separately.

Choose the SQLite binding during the packaging proof against Electron's bundled Node runtime. Store player data separately from installed application files, and provide explicit backup and restore rather than promising account-based synchronization.

## Sources

- Reference checkout: `lib/local-decks.ts` uses browser storage; `lib/simulator/match-service.ts` defines the `MatchStore` persistence seam.
- [SQLite atomic commit](https://www.sqlite.org/atomiccommit.html).
- [Electron application paths](https://www.electronjs.org/docs/latest/api/app#appgetpathname).
