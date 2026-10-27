---
title: "Answering what's outstanding: read origin/main, not the local checkout"
author: Joshua
date: 2026-10-27
branch: main
cost: { minutes: 1, tokens: 69128 }
touches:
  - HANDOFF.md
  - mockkv.log
  - ROADMAP.md
---

## Decided
- For "what's outstanding", run `git fetch` and read `git show origin/main:ROADMAP.md` and `origin/main:HANDOFF.md`. Most work merges through worktree agents, so the local main checkout often lags behind by dozens of commits.

## Tried and ruled out
- Reading ROADMAP.md and HANDOFF.md from the working tree: it showed Tracks 48 to 52 as open when they had been merged and archived on origin.

## Watch out
- The working tree carries many modified .trail/cache files, so `git status` is noisy. Compare against origin/main instead.
