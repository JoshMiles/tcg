---
title: "Track 38 plan: Overlay Editor Photoshop pass"
author: Joshua
date: 2026-10-21
branch: docs/roadmap-track-38
cost: { minutes: 3, tokens: 78099 }
touches:
  - ROADMAP.md
  - lib/card-back-edit.ts
---

## Decided
- Planned as ROADMAP Track 38 (2026-10-21): 38.1 tool strip (V/H/Z, Space pan, Ctrl+wheel zoom, shortcuts sheet), 38.2 History panel (labelled undo snapshots), 38.3 rulers + drag-out guides (localStorage, not saved), 38.4 Layer Properties + per-element opacity, 38.5 multi-select/lock (lock in localStorage)/align/distribute, 38.6 moment banner gets element id `banner`.
- Reuse app/admin/components/card-back/* and lib/card-back-edit.ts (already has lock, reorder, Add text, alignElements/distributeElements) instead of rewriting.
- Align needs the widget to report on-stage boxes via postMessage, since element offsets are relative to each part's CSS spot.
## Tried and ruled out
- Not planned: floating/re-dockable panels, blend modes, masks, rotating the card (tilt/rock animate `rotate`).
## Watch out
- Open user decisions: 38.7 custom text/image layers (scope, shapes, which views) and 38.8 layer styles (per-layer settings vs one shared Text effects section).
- Reveal keyframes animate opacity and filter too, so per-layer opacity needs a per-reveal check or a wrapper.
- ROADMAP on main still listed 35.2 as Ready after it shipped in #346.
