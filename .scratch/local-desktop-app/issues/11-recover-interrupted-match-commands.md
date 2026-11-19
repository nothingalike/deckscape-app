# 11: Recover interrupted player and bot actions exactly once

**What to build:** Recover a saved game after a crash or lost response without duplicating player or bot actions or accepting competing profile writers.

**Blocked by:** 09 - Resume an unfinished match with its original content.

**Status:** complete

**Spec stories:** 46, 47, 50.

- [x] Terminate or disconnect owned test processes at pre-commit, commit, and post-commit response boundaries, then reopen the same profile.
- [x] A repeated command identity returns the committed receipt and outcome; stale or conflicting commands cannot advance the game twice.
- [x] Restarting an interrupted bot turn continues from committed state without replaying applied actions, losing the player's decision, or leaving an unrecoverable running task.
- [x] A second app instance safely yields to the profile owner, including after recovery from a terminated owner.
- [x] Visible recovery errors preserve the last usable committed save and explain what can be retried.
- [x] Exercise the existing match-storage supporting seam with actual SQLite durability, then verify the observable restart behavior through the installed app.

## Comments

Kept the original engine, bot executor and local transactional MatchStore unchanged. The new process fixtures intercept real SQLite exec calls after application initialization, pause before BEGIN, inside the transaction immediately before COMMIT, or after COMMIT before response delivery, then the parent terminates only that owned worker without application shutdown. All nine setup/player/bot combinations pass. Reopening returns the appropriate committed state; retrying the immutable command returns the control receipt/view, repeated delivery does not advance twice, stale/conflicting commands fail, and SQLite quick_check remains okay. Interrupted bot work converges to exactly the control projection without a persisted running flag.

Visual inspection showed the hosted board's small connection status was insufficient as the primary local recovery explanation. Added a readable 14px failure banner driven by the existing service-exit notification. It preserves the board and instructs close/reopen. Development UI then passed the service/main termination path. On this Windows runner, the Playwright launcher PID differs from Electron's actual main PID; the proof observes process.pid in the connected app before termination and records it. All termination targets are owned and verified.

`powershell -File tools/install-smoke.ps1 -Recovery` passed against a newly built internal unsigned NSIS artifact. It installed into an owned temporary directory, checked the exact isolated preload/profile boundary, terminated the observed local utility, verified the readable error and unchanged board revision, reopened and advanced the player action, terminated the actual main owner, reopened the original bot turn, verified second-instance yielding, resumed the bot and uninstalled with exit code 0. HTTP/HTTPS denied with a positive control; zero page errors. TypeScript passed. Standards: zero findings. Spec: zero findings.

Evidence: `.local/match-recovery-verification.log` (9 passing cases), `.local/match-recovery-installed-ui.json`, `.local/installed-recovery-{service-error,player,bot}.png`. The precise SQLite boundaries are exercised by real Node processes; installed UI verifies observable service/app failure and recovery rather than claiming a power-loss interrupt inside SQLite's native COMMIT. The unchanged gameplay suite retains earlier qualification. All work remains uncommitted.

