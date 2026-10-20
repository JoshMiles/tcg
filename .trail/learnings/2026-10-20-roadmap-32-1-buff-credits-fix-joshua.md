---
title: ROADMAP 32.1 buff credits fix
author: Joshua
date: 2026-10-20
branch: claude/vigilant-proskuriakova-bb7d6b
cost: { minutes: 17, tokens: 201504 }
touches:
  - PR_BODY.md
  - app/admin/buffs/BuffEditorClient.tsx
  - app/api/collection/route.ts
  - docs/admin/packs-and-seasons.md
  - lib/achievements-store.ts
  - lib/buffs-core.ts
  - lib/buffs.ts
  - lib/commands.ts
  - lib/mixitup.ts
  - scripts/check-buffs.mts
---

## Decided
- Extra-pack credits are held per queued pull: atomic counter `buffs:credit-hold:<u>` checked against credits left (`extraPackCreditsLeft`). Reserved in reservePaidPull, spent in consumePullOnSave, returned in releasePaidPull.
- Buffs store season.id, not the collection name; the collection route maps ticket collection name to season id via listSeasons.
- Buff list writes go through editBuffs (withLock per list). useTrainerCard: dry-run check, save collection, then apply buff.
- Achievement bonus claimed with `set nx` marker `user:<u>:ach:paid:<id>`; open question left to Joshua: whether unsynced pre-27.5 achievements should pay out (currently yes).

## Tried and ruled out
- hsetnx for the claim: not in the sandbox KEY_FIRST whitelist or scripts/mock-kv.cjs.
- Restoring buffs on a failed collection save: refresh keeps the old id, so a rollback cannot restore it cleanly.

## Watch out
- scripts/check-buffs.mts leaves a community +2 pulls buff in KV; clear it before limit tests.
- One verify run showed an unidentified failure that did not reproduce in three later runs.
- GateGuard hook blocks the first edit per file until facts are stated; parallel edit batches partly apply.
