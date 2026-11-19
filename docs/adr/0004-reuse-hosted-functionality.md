# Preserve the hosted site's working functionality

The user clarified that the local app must copy the hosted site's card import, deckbuilding, deck import/export, and game behavior. Reuse those existing implementations and tests as the baseline, adapting only their storage, transport, routing, artwork resolution, and desktop integration where necessary.

Keep one implementation of each rule or format in the local app. Copy suitable source modules deliberately, record their source commit and hashes, and document justified local adaptations. Replace duplicate prototype logic with the reused implementation before completing its consuming ticket. The existing hosted checkout remains read-only.

Preserve the hosted formats and meaningful player controls within the selected local deckbuilding and solo-play scope. Existing deck statistics and opening-hand tools belong to deckbuilding; the earlier deferral of advanced statistics refers to additional match analytics. Accounts, cloud publishing, collections, multiplayer, gauntlets, and unrelated hosted features retain their separately recorded scope boundaries.

Technical reachability and reuse of existing behavior do not establish new provider or artwork permissions. The user will locate any existing agreement while independent implementation continues; distribution gates remain recorded separately.
