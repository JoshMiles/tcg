---
title: Review of PRs 297-310 (non-Claude agents)
author: Joshua
date: 2026-10-20
branch: main
cost: { minutes: 13, tokens: 130230 }
touches:
  - app/api/collection/route.ts
  - GEMINI.md
  - CLAUDE.md
---

## Decided
- Buffs (30.x, 27.5) have real bugs: app/api/collection/route.ts passes the collection name as seasonId while buffs store season.id, so season-scoped extra-pack credits are never consumed (free pulls). totalExtraPullsFromBuffs is never called, so extra-pulls buffs do nothing. reservePaidPull checks the credit without reserving it.
- FAQ editor (31.1): icons are cast, not validated (an unknown icon crashes /faq), and editing a question resets its order to 0.
- Discord link (4.4): relinking leaves a stale discord:user:<id> index, and the one-account claim is not atomic (use set nx).
- PR bodies for 301, 302 and 306 have no parseable Changelog bullets, so they are missing from What's new.

## Tried and ruled out
- FAQ answer parser XSS: none (no dangerouslySetInnerHTML, javascript: rejected). Only //host links slip through.

## Watch out
- GEMINI.md is a hand-kept copy of CLAUDE.md and has already drifted.
- check-buffs uses the same id for season and collection, which hides the seasonId bug.
