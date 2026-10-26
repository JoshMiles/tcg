---
title: "47.8 PR 2: account move scope"
author: Joshua
date: 2026-10-26
branch: 47-8-account-move
cost: { minutes: 2, tokens: 75442 }
touches:
  - HANDOFF.md
  - PLAN-47-8.md
  - lib/user-admin.ts
  - lib/trades.ts
---

## Decided
- `moveAccount(from, to)` lives in lib/account-move.ts. The only caller in PR 2 is an admin "Move aside" button; sign-in starts using it in PR 3.
- Unfinished moves are journalled in the hash `acct:moves` (from -> { to, id, reason, startedAt, done[] }), so Data health can list them without a key scan. Every step is "copy if target absent, then delete source", so a rerun resumes.
- Collections are re-keyed by writing the blob directly. `saveCollection` is not used, because its retire/mint logic would re-mint every print. The copy ledger `o:` hashes and `idx` are repointed by hand.
- A moved-aside key (`<login>~<n>`) always goes on the admin hidden list until PR 3 adds proper `~` handling.
- The `access:testers` record is dropped, not moved. Staff records are never moved: an unbound staff entry gets the old ID bound first (hsetnx).

## Tried and ruled out
- `mergeUsers` (lib/user-admin.ts) as the move: it goes through saveCollection and refuses when there are open trades, so it does not fit.

## Watch out
- Until PR 3, an old owner's session cookie for the moved login still signs them in, and they see an empty profile.
- Lock order: take the trades lock before any collection lock (rule in lib/trades.ts).
