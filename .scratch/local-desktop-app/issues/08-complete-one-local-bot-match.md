# 08: Play one supported bot matchup to completion

**What to build:** Take the admitted starter matchup through normal setup and a complete bot game in the desktop UI, using the actual existing rules and local bot executor.

**Blocked by:** 07 - Show solo support and admit a supported bot matchup.

**Status:** complete

**Spec stories:** 40, 42, 43, 44, 62.

- [x] Reuse the hosted game engine, command/quote/decision flow, participant projections, bot policy/executor, and React/Pixi gameplay surface, adapting only local persistence, routing, and transport; preserve existing mechanics regressions.

- [x] A player enters the prepared matchup, completes normal setup, and sees the projected battlefield in the adapted React/Pixi presentation.
- [x] The initial supported matchup exposes the legal actions and required choices needed to reach a real match outcome; do not claim unsupported card coverage.
- [x] Run the existing rules and bot execution locally with a reviewed strategy; use no live model calls, player keys, hosted bot ticks, or production data.
- [x] Commit accepted commands, receipts, and resulting state atomically through the existing match-storage interface; enforce command identity and expected revision.
- [x] Bound bot advancement and expose errors without freezing the app; preserve the distinction between participant views and authoritative game state.
- [x] Use a reproducible local content manifest for this matchup and demonstrate the player-visible result with the entire application denied network access.
- [x] Deterministic engine/service regressions and an installed-app scenario reach completion using actual game behavior rather than a mocked victory screen.

## Comments

2026-11-15, in progress: Reused the original expanded-v6 runtime, setup/mulligan, commands, quotes, participant projections, bot policy/executor, MatchClientSession, MatchClient and React/Pixi presentation. The new local adapter implements the hosted MatchStore interface with SQLite state/receipt transactions and a per-match command queue. The original setup promotion sequence decodes, settles and decodes gameFromSetup; it does not skip normal opening decisions. The original bot chooses itself to start when it wins the chooser and keeps its opening hand. Bot game advancement uses the unchanged executor with a 24-action budget. Shutdown drains owned command queues.

The renderer receives only allowlisted participant setup/battlefield projections. Fixed local player/bot identities stay in the service. Local quote and command transports preserve original validation and uncertain-delivery behavior. Committed IPC revision notices replace the hosted account broadcast channel and retain the original client coordinator and fallback polling. Failed or duplicate commands do not emit a new revision. Account sharing/reporting and cosmetic account lookups remain outside the adopted local scope; the original presentation type is retained.

Local artwork adapts the existing URL validators to exact content-addressed neuroscape://art UUID/hash image paths. The main process resolves them to the downloaded hash file. Original board texture and illustrative token assets are bundled and served through exact whitelisted paths; official card artwork remains a catalog download. Pixi uses its CSP-compatible implementation, preserving the strict script policy. The expanded-v6 composition accepts optional trusted admission data for local fixtures while keeping its original production defaults and feature flags.

The real-storage contract checks passed normal setup, hidden-state protection, a full health-based outcome, atomic rollback when receipt insertion fails, retry identity, simultaneous duplicate delivery, stale/reused command rejection, and notifications only after a committed change. Portable fixtures use synthetic artwork under explicitly injected test content. The installed app uses the original reviewed content and a disposable copy of the previously downloaded official catalog.

Development UI proof completed a real Dustrunner-versus-Corpo game with 56 native player actions, zero service-submitted player decisions, and a health win for the bot at turn 11, with HTTP/HTTPS denied and zero page/console errors. The original texture and cached artwork rendered. The internal unsigned NSIS artifact was then installed into an owned temporary directory: sandbox/capability/profile checks passed, followed by a full offline game with 46 native actions and zero service-submitted player decisions. The proof installation was uninstalled with exit code 0. This is bounded Windows evidence for the initial matchup, not cross-platform or every-card tactical qualification.

Both review axes identified hosted plain-anchor navigation left on the result and Leave match view actions. A before-fix click on the real ended match failed to navigate; both now use local hash routes. The installed full-game proof actually clicks and verifies both links. Final source regression suites, provenance and review report remain pending; keep this ticket in progress until those checks finish.

Completed: TypeScript and the complete current test suite passed all 222 checks, with zero failures, cancellations or skips. The original bot, engine-runtime, match-service and match-client suites retain every assertion with import-path changes only. All four deterministic starter duels completed. The traced full suite took approximately 18.8 minutes on this host; the four long duels took about 319, 105, 163 and 490 seconds. An initial untraced preliminary run was stopped by verified owned process IDs, then the authoritative complete suite was run directly through the installed Node runtime with the original BOT_TRACE enabled. No assertions or timeouts were changed to obtain a pass.

Read-only review confirmed that the slow duels use the unchanged hosted default runtime and their own in-memory store; local IPC, SQLite and revision notifications do not participate. Core bot policy/executor/combat evaluation, match service, commands, setup and starter runtime remain byte-identical to the source. Repeated snapshot and combat-forecast evaluation is a plausible inherited cost, not a measured profiler attribution. This validates execution, not a tactical-strength or performance promise. Broader roster qualification remains 12.

Standards and Spec each have zero remaining findings after the routing fix. All 596 source/local provenance hashes match; the source checkout is unchanged. The final installed proof records a health outcome, 46 native player actions, zero service-submitted player decisions, both return-link checks, decoded original texture and cached artwork, and zero page/console errors under application-session HTTP/HTTPS denial. The internal proof uninstaller returned 0. All changes remain uncommitted; nothing was pushed or published.
