---
title: Fixes for review of 38.7e custom layers (c7b4c6c)
author: Joshua
date: 2026-10-22
branch: main
cost: { minutes: 3, tokens: 60173 }
touches:
  - lib/overlay-diff.ts
---

## Decided
- Review findings on c7b4c6c split into 3 PRs by file to avoid conflicts: widget.js runtime (layers linger after pull, behind-layer pick in editor, fade replay on re-render, stale CUSTOM_SETS comment), lib/overlay-diff.ts (layer order changes now produce a diff line), LayersPanel drag (custom MIME, no-op drops skip undo) + sanitizeCustom drops `show` on collection-view layers.
- Behind-the-card layers in editor preview: pick via elementsFromPoint fallback, live stacking unchanged.
- Dropping a layer onto one in the other band moving it into that band is intended.
## Tried and ruled out
- Finding 6 (setCustomPhase transition timing) was vague; only fix if it falls out of the fade-replay fix.
## Watch out
- Local main was ~30 commits behind origin/main when the review ran; re-check findings against origin/main before fixing.
