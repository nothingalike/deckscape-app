# 12: Choose from a reproducible curated bot roster

**What to build:** Select any shipped curated bot opponent and play it using locally packaged decks and validated playbooks that can be reproduced without production access.

**Blocked by:** 08 - Play one supported bot matchup to completion.

**Status:** complete

**Spec stories:** 40, 41, 43, 62.

- [x] Assemble the intended small starter-based roster from reviewed source or reproducible maintainer outputs, documenting provenance for every shipped entry.
- [x] The opponent picker displays the shipped choices and validates each opponent against its pinned engine/rules and reviewed card support.
- [x] Every packaged deck, artwork requirement, playbook, and manifest resolves locally; no production database contents or live model response is a player dependency.
- [x] Invalid or incompatible bot content fails validation and is unavailable for selection with a useful explanation.
- [x] Run deterministic smoke matches for every shipped opponent and verify offline opponent selection in the UI; keep tactical-quality observations separate from execution correctness.

## Comments

Adopted the four original reviewed Genesis starters (Corpo, Dustrunner, Cybernetic, Hacker) with the unchanged hosted general-tactics fallback. `npm run roster:assemble` produces byte-identical `src/data/bot-roster.json` from copied source inputs after verifying original hashes. The manifest records source commit/files, resolved decks, engine/rules, definition versions, artwork paths/hashes and validated strategy hashes. See `docs/bot-roster.md` for provenance and the original schema's legacy ai-analysis literal; outer provenance and UI explicitly say hosted general tactics. No model-generated deck analysis is claimed or required, and no production database input was used.

The loader validates each strategy/deck/release/artwork requirement. Invalid entries stay visible as unavailable with an explanation; a malformed roster leaves opponents unavailable without preventing saved-game or catalog use. The public service rechecks packaged availability and current player/bot support before admission. Existing match pins remain independent. Validation/service fixtures cover malformed strategies/rosters, mismatched artwork and unavailable versions, with healthy opponents still usable.

TypeScript, byte-identical reassembly, all 144 current regressions and all four deterministic full-match tests passed. With fixed seed 1, the original executor reached health outcomes: Corpo revision 162/turn 12, Dustrunner 190/14, Cybernetic 124/10, Hacker 224/14. These use a deterministic passive test player and qualify execution, not tactical strength. The unchanged heavy source bot matrix retains ticket 08 evidence. The passive test driver was extracted unchanged from the paired retention regression; that regression passed again.

The packaged Windows UI passed all four offline choices and setup admissions with exact strategy/runtime pins, original mainframe bitmap decoding, and SHA256 checks for all 100 required cached artwork objects. HTTP/HTTPS denied with a positive control; zero page errors. Packaged admission regression also passed. Standards: zero findings. Spec: zero findings. All 600 copied source/local hashes match and the reference checkout remains unchanged.

Evidence: `.local/bot-roster-games.log`, `.local/bot-roster-regressions.log`, `.local/bot-roster-ui.json`, `.local/roster-picker.png` and per-opponent setup screenshots. Official artwork remains downloaded rather than bundled in the installer. Human tactical assessment and installed other-platform qualification remain separate. All work remains uncommitted.

