---
title: 32.6 Shiny label rename and dead variant scripts
author: Joshua
date: 2026-10-20
branch: claude/roadmap-32-6
cost: { minutes: 6, tokens: 82751 }
touches:
  - ROADMAP.md
  - app/admin/activity/SummaryStrip.tsx
  - app/admin/components/AddCardDialog.tsx
  - app/admin/dashboard/widgets-extra.tsx
  - app/admin/overlay/EditorTopBar.tsx
  - "app/admin/seasons/[id]/page.tsx"
  - app/admin/users/UsersList.tsx
  - docs/admin/activity-and-dashboard.md
  - docs/admin/packs-and-seasons.md
  - docs/local-dev.md
---

## Decided
Visible "Shiny" renamed to Full Art Holo (FH where short); internal id `shiny` stays. Deleted scripts/migrate-variant-rarity.mts and audit-variant-rarity.mts (unrunnable). PR 329.

## Tried and ruled out
Renaming lowercase identifiers, code comments, shiny_hunter sandbox user and docs/archive: left alone.

## Watch out
Renaming a label can break a scripts/check-*.mts string assertion (check-activity-view expected "Shiny pull"); run npm run verify. Some lib/ comments still say "Shiny Full Art".
