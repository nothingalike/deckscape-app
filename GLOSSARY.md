# Neuroscape local app

A local deckbuilding and solo-play app using Neuroscape's official card information.

## Language

**Card catalog**:
The card records and associated artwork obtained from the official Neuroscape source.
_Avoid_: Engine pack, opponent pack

**Catalog sync**:
A refresh of the local card catalog from the official source.
_Avoid_: App update

**Missing-source card**:
A previously cataloged card absent from the latest complete official snapshot, retained so existing decks and saved matches remain readable.

**Deck**:
A player's named selection of cards, including the sections required by the game rules.

**Bot opponent**:
A computer-controlled opponent with a deck and a strategy for solo play.

**Bot playbook**:
The strategy data used by a bot opponent to choose among legal actions.

**Solo support**:
The app's ability to simulate a card's mechanics under its available rules and engine versions.
_Avoid_: Catalog availability, deck legality

**Saved match**:
A solo game preserved for later resumption with its original decks, rules, and card presentations.

**App release**:
A maintainer-published version of the application, including its executable rules and engine support.
_Avoid_: Catalog sync
