# Bundled bot opponents

The app ships the four hosted Genesis starters: Corpo, Dustrunner, Cybernetic and Hacker. Their card quantities, official IDs, reviewed definitions, artwork requirements and general bot tactics come from Deckscape commit `032a0ec6d4d644f0d37b3b586b8d33b5089e2f9d`. The source checkout remains a read-only reference.

`src/data/bot-roster.json` records the exact source-input hashes, engine/rules versions, resolved decks, definition versions, artwork hashes/paths and validated playbooks. Official artwork bytes remain a catalog download. The roster includes data; executable rules come from the installed app release.

Regenerate the roster from this repository with:

```powershell
npm run roster:assemble
```

The assembler uses the copied starter manifest, catalog review baseline, original starter resolver and original `readBotPlaybook(null, key)` general-tactics behavior. It verifies those source files against the reuse manifest before writing. Repeated assembly produces the same JSON bytes. Production database records, credentials and live model output are unnecessary.

These playbooks use the hosted general fallback with no deck-specific priority overrides. The original schema calls its provenance method `ai-analysis`; the retained source description explicitly says “General fallback; deck analysis unavailable.” The roster's outer provenance says `hosted-general-tactics`, and the player sees “Hosted general tactics.” This preserves the source schema without claiming a model-generated deck analysis.

Each entry validates its strategy identity/hash, legal deck, reviewed support, definition versions, artwork requirements, engine and rules. Invalid entries remain visible as unavailable with an explanation, and admission checks them again. A malformed roster leaves browsing and saved games available while new opponents are unavailable. Saved matches retain their original strategy and content.

`tests/bot-roster-game.test.ts` runs a deterministic full match for every shipped opponent through the original commands and bot executor. The UI proof selects all four opponents offline and saves their matchups. These checks establish execution and reproducibility. Human tactical-strength assessment remains open; general tactics are the initial strategy baseline.
