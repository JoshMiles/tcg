---
title: Running roadmap items in parallel with subagents
author: Joshua
date: 2026-10-22
branch: main
cost: { minutes: 2, tokens: 66800 }
touches:
  - ROADMAP.md
---

## Decided
- Parallel roadmap work: at most one Track 38 item at a time (nearly all touch OverlayEditor.tsx / widget.js), paired with one item from another track (e.g. Track 39 site nav). Each agent gets its own worktree off origin/main.
- 38.7 (f) brief covers free transform (side + rotate handles), duplicate Ctrl+J, copy/paste, rename; the 9-point anchor stays with 38.22.
- 39.1's More tab opens the existing burger drawer until 39.2 builds the bottom sheet.
## Tried and ruled out
- Running two Track 38 items at once: they conflict in the editor files.
## Watch out
- The user wants agents to commit locally only; push and PR only when they ask.
- Sonnet agents must not edit ROADMAP.md; Opus updates it after reviewing the diffs.
