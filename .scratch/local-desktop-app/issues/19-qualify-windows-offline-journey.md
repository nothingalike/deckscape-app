# 19: Qualify the full Windows offline player journey

**What to build:** Run the integrated player journey in an installed Windows artifact and turn it into the reusable installed-app qualification suite for the remaining desktop targets.

**Blocked by:** 06 - Import starters and exchange compatible deck JSON; 10 - Keep saved games intact through catalog and deck changes; 11 - Recover interrupted player and bot actions exactly once; 12 - Choose from a reproducible curated bot roster; 15 - Upgrade the app while preserving supported saved games; 16 - Show app releases separately from catalog updates.

**Status:** complete

**Spec stories:** 1, 8, 63, 64.

- [x] From a fresh profile with no Supabase configuration, perform complete catalog/artwork sync, create or import a legal supported deck, and select a shipped bot opponent.
- [x] Deny network access to the entire application, including main and utility processes, then browse, edit, complete a bot game, and restart to resume a separate unfinished match.
- [x] Exercise native deck import/export, backup and restore, a supported app upgrade, and separate app-release information without losing player data.
- [x] Include the already delivered sync rollback, changed/missing card retention, pinned saves, crash recovery, and duplicate-action cases in the integrated regression selection.
- [x] Verify final desktop controls, Pixi rendering/input, error states, profile ownership, and application-boundary privilege restrictions on the actual installed Windows artifact.
- [x] Publish a repeatable qualification procedure and evidence with precise platform/toolchain versions; distinguish controlled-source regressions, real official-source rehearsal, and real network denial.
- [x] The procedure and fixtures are usable by the subsequent macOS and Linux qualification tickets; report failures without marking platform acceptance passed.




## Comments

The first full installed run is preserved in `.local/qualification-win32-5ef1d71d-5b1e-4490-a115-dafa848bc189/qualification.json` (success false). Fresh 256-card sync and preceding editor/interchange/roster checks passed; full gameplay stopped with Submitting decision at revision201. The owned proof installation uninstalled with exit0.

Diagnosis reproduced a command-coordinator race in a deterministic focused test: a distinct next command arriving during acknowledged-snapshot publication was left pending behind the preceding delivery until a fallback poll. The new test failed with only one of two commands sent. The small finally-path drain sends that distinct command while preserving the same-object uncertain command and its immutable ID/input. All seven original/new client regressions passed. Source/local hashes and the deliberate adaptation are recorded in `docs/reuse-manifest.json` and `docs/hosted-parity.md`; engine mechanics are unchanged. Standards and Spec reviews found zero remaining issues. The rebuilt full installed rerun is in progress; acceptance remains open until it and both installed upgrades pass.

Final acceptance: `.local/qualification-win32-0c8645be-a2a3-4b6d-8f0a-8374adbf3d9b/qualification.json` has success=true and all30 sequential steps passed against the installed current artifact. Both real installed0.1.0-to-0.2.0 schema8/schema7 cases passed afterward; every owned uninstaller returned0. The installed run passed197 current regressions; a separate fresh composed-engine run passed17, totaling214 with zero failures. The shared runner now includes the17 composed tests in its normal selection. Two unchanged heavy bot-matrix files retain preceding full qualification.

The second failed run (`61a486e5-e003-41cd-8e08-0713a892612e`) passed the complete game, then caught test-fixture contamination: resume intentionally advanced the same checkpoint recovery expected unchanged. The final runner prepares independent fixtures before resume, recovery and retention. Both failed runs remain success=false; only the final all-green run qualifies.

Repeatable commands and evidence boundaries are in `docs/installed-qualification.md`. Real fresh official sync downloaded256 cards/artwork. Actual main and utility HTTP/HTTPS requests were denied in the shared Electron session while the original deck/editor/import/export/game/reopen paths worked. This is application-network denial, not an OS firewall claim. Native dialog/clipboard/browser responses are controlled at their OS boundaries; actual files, SQLite, ZIPs, generation activation and OS relaunch run for real. Full platform/toolchain/process evidence is in the per-step files. All600 source/local hashes match the updated provenance manifest and the pinned read-only reference is unchanged.

Standards and Spec have zero remaining findings. All work stays uncommitted. Mac17/20 remain user execution; continue Linux21.
