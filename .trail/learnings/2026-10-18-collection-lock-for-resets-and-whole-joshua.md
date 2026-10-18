---
title: Collection lock for resets and whole-collection writes
author: Joshua
date: 2026-10-18
branch: fix/collection-write-locks
cost: { minutes: 6, tokens: 54212 }
touches:
  - app/api/collection/route.ts
  - lib/kv.ts
  - scripts/check-users.mts
---

## Decided
- removeUserFromCollection and deleteCollection (lib/kv.ts) now take withCollectionLock themselves; DELETE /api/collection?username reuses removeUserFromCollection, and the POST `data` replace wraps saveCollection in the lock.
- No caller runs these inside another lock (withLock is not reentrant: nesting would spin ~4.5s then throw "That is busy").

## Tried and ruled out
- A Promise.all race test (reset vs pull) passes even without the fix on the mock KV; it proves nothing. check-users.mts instead holds the lock and asserts the reset waits for it.

## Watch out
- Any new whole-blob write to tcg_{collection} must go through withCollectionLock, and must not be called from inside one.
