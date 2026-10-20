---
title: ROADMAP cleanup
author: Joshua
date: 2026-10-20
branch: docs/roadmap-cleanup
cost: { minutes: 2, tokens: 75248 }
touches:
  - ROADMAP.md
  - docs/archive/roadmap-history.md
---

## Decided
ROADMAP.md keeps only open items; shipped tracks (25 to 30, 33) and decisions like 29.3 move to docs/archive/roadmap-history.md. Panel freeze is stated once, under Rules in force.

## Tried and ruled out
Trusting local main: it lagged origin/main, which already had 33.1 to 33.3 merged.

## Watch out
Fetch origin and check git log since the last ROADMAP commit before cleaning; items marked Ready may already be merged.
