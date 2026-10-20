---
title: "Track 36 plan: Overlay Editor element layers"
author: Joshua
date: 2026-10-20
branch: docs/roadmap-track-34
cost: { minutes: 2, tokens: 81305 }
touches:
  - ROADMAP.md
  - app/(site)/account/page.tsx
  - app/components/site/DiscordPrompt.tsx
---

## Decided
- Planned as ROADMAP Track 36 (36.1 select+drag in one mode, 36.2 per-element placement, 36.3 Layers panel, 36.4 handles/polish).
- Element offsets live in OverlayLayout per view (`elements?: Partial<Record<ElementId, Placement>>`), relative to the CSS spot, so empty = today's look and no migration. Applied via standalone translate/scale CSS vars so they stack with reveal keyframes.
- ElementIds match the widget's existing `data-edit` tags.
## Tried and ruled out
- Layer reordering / z-index: stacking is fixed by the animation; not planned.
## Watch out
- Open decision for the user: element positions per scene only (proposed) vs per pack too; show-off reuse pack positions (proposed).
- The Layout category's full-canvas drag surface blocks click-to-select; 36.1 removes it.
- Switching branches was blocked by modified .trail/cache files; stash of them failed.
