---
title: Collection words and overlay text fonts plan
author: Joshua
date: 2026-10-21
branch: docs/roadmap-track-34
cost: { minutes: 2, tokens: 32284 }
touches:
  - ROADMAP.md
  - app/(site)/account/page.tsx
  - app/components/site/DiscordPrompt.tsx
---

## Decided
- Collection words (user, 2026-10-21, ROADMAP Track 37): "collected" = different cards of a set (23/25 collected), "pulls" = every pull incl. repeats (194 pulls, leaderboard number), "edition" = one numbered copy only, never a count. Copy-only change; no KV/API renames. Panel waits for the freeze (34.2).
- Overlay text fonts (ROADMAP 36.5): global `text.font` (default `display`) plus a `<group>.font` select on every text layer with `inherit` ("Overlay font") as default. Existing `reveal.labelFont`, `show.labelFont`, `<moment>.font` defaults move to `inherit`; saved values unchanged, no migration. Reuse BACK_FONTS / FONT_OPTIONS and widget `applyTextFont()`.
## Tried and ruled out
- "copies" for the total: reads as only the repeats (23 cards + 194 copies = 217). Plain "cards" for both numbers clashes. "editions" as a total implies distinct editions.
- Weight/size controls for overlay text: not asked, left out of 36.5.
## Watch out
- `applyTextFont` treats `display` as "clear inline family" (stylesheet faces are Montserrat/Poppins/Jost); `inherit` must resolve to `text.font` first.
