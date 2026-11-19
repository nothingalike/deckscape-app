# Separate catalog sync from executable app releases

Catalog sync obtains official card records and artwork. App releases supply executable mechanics, compatible rules runtimes, and validated bot content. A newly synchronized card can be browsed and used in deck drafts before the app supports its mechanics in solo play.

Show solo support separately from deck legality, and explain unsupported cards before starting a game. Validate both player and bot decks against the selected runtime. Official text or artwork changes invalidate the affected support fingerprint until reviewed; a card identifier alone does not prove current mechanics support.

Activate a complete validated catalog snapshot only after its required artwork is staged locally. Preserve the previous working snapshot on interruption or failure. Retain missing-card records and artwork referenced by saved content, marking their source status explicitly. Saved matches retain their original runtime, card definitions, artwork, decks, and bot strategy rather than adopting the latest catalog mid-game.

App releases carry the runtimes required by supported saved matches. Verify that compatibility with fixtures before offering a release as an upgrade; never silently reinterpret a save under a different engine. Long-term runtime retirement needs a documented compatibility policy before implementation of that transition.

## Sources

- Reference checkout: `scripts/import-cards.ts` and `lib/catalog-import.ts` validate source identity and artwork before activation and retain missing cards.
- Reference checkout: `README.md` documents expiring artwork URLs and hash-based artwork checks.
- Reference checkout: `lib/simulator/deployed-runtimes.ts` resolves multiple engine/rules versions.
