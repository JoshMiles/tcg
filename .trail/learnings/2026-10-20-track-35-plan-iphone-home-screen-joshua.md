---
title: "Track 35 plan: iPhone home-screen icon shows a C"
author: Joshua
date: 2026-10-20
branch: docs/roadmap-track-34
cost: { minutes: 4, tokens: 83868 }
touches:
  - ROADMAP.md
  - app/apple-icon.png
  - app/layout.tsx
---

## Decided
- 2026-10-20: planned as ROADMAP Track 35 (35.1 icon, 35.2 iOS launch screen, 35.3 Android manifest screenshots). Offline page/data caching stays out on purpose.
- 35.1: diagnose on the device first (Safari Web Inspector during Add to Home Screen), then serve the icon under a new filename (apple-touch-icon-v3.png), add a 180px manifest icon, delete the dead app/apple-icon.png.

## Tried and ruled out
- Server-side cause: production serves /apple-touch-icon.png as an opaque 180px PNG (200, image/png), the head has one plain apple-touch-icon link, and the middleware matcher skips dotted paths, so the closed gate doesn't touch icons.
- ?v= query cache-busting: iOS has been seen to keep a stale icon behind a query (see the app/layout.tsx comment).

## Watch out
- The "C" is iOS's letter fallback, cached per icon URL; clearing Safari Website Data doesn't reliably reset it. Two earlier fixes (7.1, opaque icons) kept the same URL.
- Fetching production pages unauthenticated gets a 307 to /closed; check the head on /closed.
