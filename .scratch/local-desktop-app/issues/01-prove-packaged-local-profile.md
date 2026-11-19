# 01: Prove a packaged local profile on Windows

**What to build:** Install and launch a minimal Windows app that displays a persisted deck name and a Pixi-rendered local scene, then restores them after reopening. This is the narrow packaging and persistence proof, not the finished deckbuilder.

**Blocked by:** None (can start immediately).

**Status:** complete

**Spec stories:** 4, 5, 50, 57.

- [x] A fresh Windows profile launches a packaged Electron artifact without Node, Supabase configuration, accounts, or API keys supplied by the player.
- [x] A visible deck-name control round-trips through specific preload operations, the Node utility service, and real SQLite storage; reopening restores the committed value.
- [x] The bundled renderer displays a small Pixi scene through the selected rendering path; this proof uses controlled local content and does not claim card-artwork or rules support.
- [x] The renderer is sandboxed with context isolation, Node integration disabled, and a restricted application-content protocol; malformed operations and paths are rejected at the application boundary.
- [x] Only one app instance owns the profile; application installation and per-user data are separate.
- [x] Pin a working Electron toolchain and SQLite binding, exercise a schema-version transition, and record the package size, startup, memory, and rendering observations.
- [x] A repeatable installed-app check drives the visible control and verifies persistence against a temporary real profile; keep proof-only UI distinguishable from finished features.


## Comments

2026-11-15: Implemented and locally qualified the bounded Windows proof. TypeScript and both application-boundary tests passed. The migration fixture failed before its conversion was implemented, then passed with preserved deck content. The packaged UI smoke failed on Pixi's default unsafe-eval requirement; its CSP-compatible module fixed rendering while retaining the strict policy.

The internal NSIS installer installed to a verified temporary directory, passed the same UI/SQLite/preload/reopen proof, yielded a second instance, and uninstalled with exit code 0. Latest observed artifact: version 0.1.0, Electron 45.3.2, Node 24.22.2, SQLite 3.53.4; installer 138071152 bytes, installed directory 469931589 bytes. One observed launch-to-ready sample was 589.7641 ms; aggregate observed process working set was 426244 KB. These are proof-host observations, not performance budgets or cross-platform qualification.

Verification commands: npm run verify; npm run package:win; powershell -File tools/install-smoke.ps1. The smoke script checks real Pixi rendering, exact preload capability exposure, sandbox/isolation flags, malformed operation rejection, forbidden content 404, native SQLite data, restart, and single-instance ownership. Its deliberate forbidden request produces the expected 404 console entry.

Standards review: no hard violations; cleanup/error-observation reliability findings fixed and rechecked. Spec review: artifact-size evidence gap fixed; no remaining findings. No commits were made. This completes ticket 01 only; complete deckbuilding and bot play remain later tickets.
