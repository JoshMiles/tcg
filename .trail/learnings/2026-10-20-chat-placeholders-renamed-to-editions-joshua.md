---
title: Chat placeholders renamed to editions
author: Joshua
date: 2026-10-20
branch: chore/edition-serial-wording
cost: { minutes: 2, tokens: 12337 }
touches:
  - lib/commands-core.ts
  - lib/commands.ts
  - scripts/check-commands.mts
---

## Decided
Joshua (2026-10-20): chat reply placeholders are {editionsMade}, {yourEditions}, {editions}, {rarestEdition} (were printsMade/yourPrints/prints/rarestPrint). Safe because no streamer had used them yet. Supersedes the earlier note that kept them.
## Tried and ruled out
Keeping the old names for compatibility: not needed, nothing saved used them.
## Watch out
Placeholders live in lib/commands-core.ts (vars + default replies) and lib/commands.ts; scripts/check-commands.mts reads them.
