---
title: "Roadmap review 2026-10-23: unblocking the Needs design items"
author: Joshua
date: 2026-10-23
branch: main
cost: { minutes: 2, tokens: 66152 }
touches:
  - app/admin/overlay/ArtboardStrip.tsx
  - app/api/twitch/collection/route.ts
---

## Decided
- Proposed (not yet applied, awaiting the user): 38.27 thumbnails can reuse `StillFrame` in app/admin/overlay/ArtboardStrip.tsx (live same-origin iframe still, already used by CompareDialog), so no rasteriser or Blob upload is needed; size M to S.
- Proposed: 40.2f keeps `collectors` in the /cards page and loads the top owners + avatars (`ownersByCard(..., 10)`, `getAvatars` in app/(site)/cards/page.tsx:46-76) when a card dialog opens.
- Proposed: hold 40.2e until about 2026-11-06. Home LCP p75 is 3.5 s but TTFB p75 is only 838 ms, so page caching can save at most the TTFB part.

## Tried and ruled out
- The 38.27 note's "html-to-image across the iframe" premise: the preview iframe is same-origin (/overlay.html), so crossing it is not the problem.

## Watch out
- 40.2g (the only Ready item) was missing from the Open items table.
- Confirmed app/api/twitch/collection/route.ts still returns any user's cards by username (34.1). Low severity, and frozen until the panel freeze lifts.
- Not checked: whether presets/versions store a full layout (the StillFrame idea needs that).
