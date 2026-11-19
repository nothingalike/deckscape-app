# Repository instructions

## Headquarters

Shared project and story memory lives in `~/.headquarters`. Use the `hq` skill to recall or record what was learned; its `GUIDE.md` defines where knowledge belongs. Read `~/.headquarters/me.md` at the start of every session for the user's working preferences.

## Project scope

This repository holds the separate open-source Neuroscape app for local deckbuilding and solo bot play, with official-source card and artwork sync. Use the existing Deckscape checkout as read-only reference. Keep setup and implementation changes in this repository.

Read `docs/design/local-app.md` for the adopted product boundaries and architecture before proposing implementation work.

For card import, deckbuilding, deck import/export, and game implementation, read `docs/hosted-parity.md` and reuse the hosted site's working source and tests. Keep local storage and transport adaptations distinct from functionality changes.

## Agent skills

### Issue tracker

Specs and tickets live in local Markdown under `.scratch/<feature-slug>/`. Read `docs/agents/issue-tracker.md` before creating, fetching, or updating work items.

### Triage labels

Use the five default triage roles. Read `docs/agents/triage-labels.md` when triaging work.

### Domain docs

Use one root `GLOSSARY.md` and `docs/adr/`. Read `docs/agents/domain.md` before exploring or changing the domain model.
