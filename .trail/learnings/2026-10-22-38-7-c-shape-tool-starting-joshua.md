---
title: 38.7 (c) Shape tool starting point
author: Joshua
date: 2026-10-22
branch: main
cost: { minutes: 1, tokens: 45220 }
touches:
  - lib/overlay-custom.ts
  - docs/overlay.md
---

## Decided
- Before 38.7 (c), a fresh agent hand-checks what #386 left unchecked (canvas move/resize of custom layers, double-click focus, outline and Highlight tokens, save/reload, dry draw); any fix ships in its own PR first.
- 38.7 (a) already shipped shape data (lib/overlay-custom.ts: shape rect/ellipse/line/polygon/star, fill none/solid/gradient, stroke, fx) and the widget's inline SVG render, so (c) is only the Shape tool (U), click/drag placement (reuse the Text tool's toolBox flow, Shift keeps proportions) and the shape panel in CustomLayerPanel.

## Tried and ruled out
- Creating lib/shapes.ts now: it doesn't exist yet; ROADMAP plans it for sharing shape/gradient types with the card back (later item). Don't build it ahead of need unless (c) needs it.

## Watch out
- docs/overlay.md "Custom layers" paragraph is the current spec of what exists; update it when (c) lands.
