---
title: Track 44 audits launched as parallel read-only agents
author: Joshua
date: 2026-10-26
branch: main
cost: { minutes: 6, tokens: 74725 }
touches:
  - HANDOFF.md
---

## Decided
- 44.1 to 44.5 run in parallel, one Opus agent per area in its own worktree, branch `audit-44-<n>-<area>` cut from origin/main (local main may be behind).
- Agents read code only: no dev servers or long-running processes; KV read counts are static counts from the code path.
- Unfixed critical/high security findings come back only in the agent's final report; Opus copies them into gitignored SECRETS.md. Public docs carry a placeholder line ("S-1 ... held privately") with no how-to.
- Agents commit locally and write an uncommitted PR_BODY.md; Opus pushes and opens the PR.

## Tried and ruled out
- Letting audit agents start dev servers / run the review seed sweeps: the first 44.4 agent was stopped for this.
- Agents writing SECRETS.md themselves: parallel writes to one file in the main checkout would clash.

## Watch out
- Every audit PR bumps the same ROADMAP "Last updated" line, so later ones need a rebase.
