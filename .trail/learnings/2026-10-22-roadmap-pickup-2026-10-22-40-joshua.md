---
title: "Roadmap pickup 2026-10-22: 40.1, 38.19, 38.21"
author: Joshua
date: 2026-10-22
branch: main
cost: { minutes: 2, tokens: 55777 }
touches:
  - ROADMAP.md
---

## Decided
- Picked 40.1 (site speed measure, no code) plus two S Overlay Editor items, 38.19 (Alt measure + status bar) and 38.21 (swatches + eyedropper), each to its own Sonnet agent in a separate worktree.
- Agents commit locally only; the user pushes and opens PRs on request.
- 40.1's findings become 40.2 sub-items in ROADMAP.md (Opus edits the roadmap, not the executor).

## Tried and ruled out
- M items (38.17, 38.18, 38.27, 38.28) left for later to keep the batch small.

## Watch out
- 38.19 and 38.21 both touch OverlayEditor.tsx; the second to merge may need a rebase.
- Local branch roadmap-site-speed is already merged (#413); start new work from origin/main.
