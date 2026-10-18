---
title: Card back editor back invisible under reduced motion
author: Joshua
date: 2026-10-18
branch: fix/card-back-editor-reduced-motion
cost: { minutes: 2, tokens: 57538 }
touches:
  - app/components/FlipCard.tsx
  - app/globals.css
---

## Decided
The editor renders FlipCard with `bare`. Bare mode must carry `data-flipped="true"` on `.flip-card`, because the reduced-motion CSS (`@media (prefers-reduced-motion)` and `[data-motion="reduce"]` in app/globals.css) fades `.flip-back` to opacity 0 unless the card is flipped.

## Tried and ruled out
It looked like a Safari/WebKit 3D bug (backface-visibility, preserve-3d). It is not: Mac users just have macOS Reduce Motion on more often.

## Watch out
Any new FlipCard mode that shows the back without the flip must set data-flipped="true", or it disappears for reduced-motion users.
