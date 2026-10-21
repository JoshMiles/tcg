---
title: ROADMAP 37.1 collection words shipped
author: Joshua
date: 2026-10-21
branch: copy/collection-words
cost: { minutes: 4, tokens: 84382 }
touches:
  - app/(site)/account/page.tsx
  - app/(site)/cards/CardDex.tsx
  - app/(site)/faq/blocks.tsx
  - app/(site)/page.tsx
  - app/(site)/stats/CardTable.tsx
  - app/(site)/stats/page.tsx
  - app/admin/dashboard/widgets.tsx
  - "app/admin/sandbox/[id]/SandboxUsers.tsx"
  - "app/admin/seasons/[id]/page.tsx"
  - "app/admin/users/[username]/page.tsx"
---

## Decided
- Public totals say "Pulls" (account tile, Card Dex stat, stats card table, FAQ card-values table, leaderboard metric, share figures); set progress says "N/M collected". "Edition" stays only where it names one numbered copy (favourites, trade pickers, "Most valuable editions", upgrade copy).
- Card Dex top-collectors note: "how many of this card they own", avoiding "editions" as a count.
## Tried and ruled out
- Renaming admin/mod counts ("No editions yet.", sandbox "editions"): out of 37.1 scope (public site only).
## Watch out
- Twitch panel keeps old words until the freeze lifts (34.2).
- Code names (copies, totalCopies, BoardMetric 'copies') deliberately unchanged.
