---
title: Track 39 mobile roadmap and Git Bash path gotcha
author: Joshua
date: 2026-10-22
branch: roadmap/mobile-track
cost: { minutes: 3, tokens: 76280 }
touches:
  - ROADMAP.md
  - app/manifest.ts
---

## Decided
- Track 39 (phone): bottom tab bar replaces the burger below `xl` (where SiteNav already hides its top links). Proposed tabs Home, Card Dex, Trade, Leaderboard, More; tab set is the user's call before building. Build order 39.3 safe areas first, then 39.1 tab bar, 39.2 More sheet.
- Roadmap edits that only record progress use a "**Progress:**" line under the item plus the table row, not a shipped log.

## Tried and ruled out
- Assuming 35.3 shipped: app/manifest.ts has no `screenshots` yet.

## Watch out
- In Git Bash, `git show origin/main:path` gets mangled by MSYS path conversion; set `MSYS_NO_PATHCONV=1` first.
- Switching branches can fail on an untracked .trail/learnings file that also exists on origin/main; diff it (--strip-trailing-cr) and remove if identical.
