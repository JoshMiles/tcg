---
title: "Closing a ROADMAP track: archive done items, keep loose ends"
author: Joshua
date: 2026-10-26
branch: roadmap-47-cleanup
cost: { minutes: 5, tokens: 97819 }
touches:
  - HANDOFF.md
  - PLAN-47-8.md
  - ROADMAP.md
  - docs/archive/roadmap-history.md
  - app/api/auth/logout/route.ts
  - app/auth/staff/route.ts
  - app/auth/twitch/route.ts
  - app/login/page.tsx
  - docs/staff.md
  - lib/staff-token.ts
---

## Decided
- When a track's last PR is the ROADMAP cleanup: done items go to docs/archive/roadmap-history.md under a "## Track N" section (one bullet per item with "(Done, #PR)" and its audit ids, same shape as Track 46); ROADMAP keeps only open items plus a one-line note of what was archived or moved.
- Loose ends a PR left out (a finding skipped, a trial readout due later) become their own numbered ROADMAP items (e.g. 47.10, 47.11) instead of living only in HANDOFF.md.
- Items tagged "next panel version" move into Track 53 in full, not as a cross-reference.

## Tried and ruled out
- Staging the .trail/cache churn with docs PRs: it is the indexer's output, not the change; stage only the files the PR touches.

## Watch out
- After the cleanup, grep ROADMAP for other references to the archived ids (dependency notes like "after 47.6") and the Open items table row.
- `gh pr merge --delete-branch` fails to delete a local branch whose worktree is locked by a running agent; the merge itself still succeeds.
