---
title: 32.5 New pack flow leftovers
author: Joshua
date: 2026-10-20
branch: fix/32-5-new-pack
cost: { minutes: 11, tokens: 82531 }
touches:
  - ROADMAP.md
  - app/admin/components/NewPackButton.tsx
  - app/admin/dashboard/widgets.tsx
  - app/admin/draft-actions.ts
  - "app/admin/packs/[packId]/workspace/PackWorkspace.tsx"
  - app/admin/seasons/new/SeasonFlow.tsx
  - docs/admin/packs-and-seasons.md
---

## Decided
NewPackButton/NewPackDialog got a `newTab` prop; SeasonFlow uses it so unsaved season edits survive. The tab is opened synchronously on submit (window.open before the await) to dodge popup blockers.

## Tried and ruled out
Flushing the SeasonFlow autosave before navigating: more code than opening a new tab.

## Watch out
Many repo files are CRLF: multi-line string replaces from scripts silently miss; use \r?\n regexes. Fresh worktrees have no node_modules, so run `npm ci` before `npm run verify` (all 81 checks fail otherwise).
