---
title: Running roadmap items through subagents
author: Joshua
date: 2026-10-23
branch: main
cost: { minutes: 6, tokens: 83652 }
touches:
  - HANDOFF.md
  - ROADMAP.md
---

## Decided
- Run Ready roadmap items as fresh Sonnet agents in their own worktrees, in parallel only when their files don't overlap (40.2g, 40.2f and 41.2 share Card Dex / site shell files, so they run in sequence).
- Agents don't edit ROADMAP.md; Opus removes the shipped sections in one roadmap PR, so parallel PRs don't conflict on the table.
- Each brief demands raw output (`git log origin/main..HEAD`, `git diff --stat`, `gh pr view --json number,url`, the tail of verify) in the hand-back.

## Tried and ruled out
- Trusting an agent's prose report: one agent reported PR #441 with a diff and Lighthouse numbers, but had made no commits and opened no PR.

## Watch out
- Before reviewing, check the PR exists (`gh pr view N`) and the branch has commits.
- Check for open planning PRs (`gh pr list`) before picking items: the up-to-date roadmap may be in an unmerged PR (#438 was).
- The auto-mode classifier can block launching a fourth parallel agent; retry once one finishes.
