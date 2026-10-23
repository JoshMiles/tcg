---
title: "CLAUDE.md layout: canary, HANDOFF.md, details in docs"
author: Joshua
date: 2026-10-23
branch: main
cost: { minutes: 3, tokens: 9704 }
touches:
  - CLAUDE.md
  - README.md
  - docs/data-architecture.md
  - docs/git-and-prs.md
  - docs/model-workflow.md
  - ROADMAP.md
---

## Decided
- CLAUDE.md opens with a Canary section: every reply starts with "Josh," (Josh is the only developer, so his name in the checked-in file is fine). The same rule is in his global ~/.claude/CLAUDE.md.
- Session state lives in HANDOFF.md at the repo root and is committed with the work: Goal, Done, Left, Key files, Open questions, append-only dated Decisions. Kept current during multi-step work, updated before /clear or /compact, read first in a new session, deleted when the task ships. ROADMAP.md keeps planned work; trail learnings keep lasting lessons.
- CLAUDE.md stays short so the canary isn't buried: the full model workflow, git/PR rules and KV data architecture moved verbatim to docs/model-workflow.md, docs/git-and-prs.md and docs/data-architecture.md, with short summaries and Area docs rows left in CLAUDE.md.

## Tried and ruled out
- STATUS.md alongside HANDOFF.md: two state files drift; HANDOFF.md covers both.

## Watch out
- The repo is public: nothing secret in HANDOFF.md.
- ROADMAP.md and README.md point at CLAUDE.md sections ("Model workflow", "Git and PRs"); those headings still exist as summaries. README's data link now goes to docs/data-architecture.md.
