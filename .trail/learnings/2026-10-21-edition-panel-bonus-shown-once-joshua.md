---
title: Edition panel bonus shown once
author: Joshua
date: 2026-10-21
branch: docs/roadmap-track-34
cost: { minutes: 1, tokens: 55733 }
touches:
  - ROADMAP.md
  - app/(site)/account/page.tsx
  - "app/u/[username]/CardDetail.tsx"
  - app/components/site/DiscordPrompt.tsx
---

## Decided
On the edition panel (app/u/[username]/CardDetail.tsx) the SerialChip already shows the bonus multiplier, so the text beside it only names the bonus and does not repeat the number.

## Tried and ruled out
Nothing.

## Watch out
The edition page is CardDetail.tsx, not app/(entity)/copy. SerialChip with bonus= renders the multiplier itself.
