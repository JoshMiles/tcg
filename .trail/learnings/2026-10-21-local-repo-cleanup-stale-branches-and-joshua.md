---
title: "Local repo cleanup: stale branches and worktrees"
author: Joshua
date: 2026-10-21
branch: docs/roadmap-track-34
cost: { minutes: 3, tokens: 58210 }
touches:
  - ROADMAP.md
  - app/(site)/account/page.tsx
  - app/components/site/DiscordPrompt.tsx
---

## Decided
- A branch counts as safe to delete when it is an ancestor of origin/main, or every PR with that head branch is MERGED (gh pr list --state all --json headRefName,state). PRs are squash-merged, so most finished branches are not ancestors.
- Kept: feat/staff-changelog (ahead 38, one PR closed), claude/tailwind-v4-bbc2cf (WIP, no PR; Tailwind 4 shipped separately in #267), and any branch with uncommitted work.

## Tried and ruled out
- `git branch -d` only checks against HEAD, not origin/main, so merged branches survive when HEAD is an old branch. Squash-merged ones need -D.
- The Claude Code auto-mode classifier blocks `git worktree remove --force`, `git branch -D` and `git stash drop`. Hand the user a script to run with `!`.

## Watch out
- Worktrees under .claude/worktrees often hold only a stray PR_BODY.md or .claude/ folder, which makes the non-force remove fail.
- Sibling folders ../tcg-discord and ../tcg-legal were worktrees of this repo.
- A worktree in Claude's temp scratchpad failed to remove ("Filename too long"); `git worktree prune` cleared it.
