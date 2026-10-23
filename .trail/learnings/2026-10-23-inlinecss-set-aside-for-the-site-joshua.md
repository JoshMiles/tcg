---
title: inlineCss set aside for the site stylesheet (40.1)
author: Joshua
date: 2026-10-23
branch: perf/site-speed-lab
cost: { minutes: 43, tokens: 116387 }
touches:
  - ROADMAP.md
  - app/globals.css
  - next.config.ts
  - app/(site)/cards/CardDex.tsx
  - app/admin/components/BrandMark.tsx
  - app/components/CardTile.tsx
  - app/components/ShareImageLazy.tsx
  - app/components/site/ClosedShell.tsx
  - app/components/site/SiteNav.tsx
  - app/components/site/SiteShell.tsx
---

## Decided
- Keep the main stylesheet external. `experimental.inlineCss` cut local lab first paint from about 2.4 s to 1.2 s, but the sheet is 300 kB raw / 47 kB gzipped and Next 15.5 puts it in the HTML twice (a style tag plus the RSC payload), so every full page load grows about 96 kB gzipped and loses the cached CSS file. It is also experimental.
- Tailwind scans only `app/` and `lib/` (`@import 'tailwindcss' source(none)` plus `@source` in app/globals.css). Auto-detection also read .trail/, docs/, scripts/ and public/, which added 20 unused classes (11 kB raw); public/widget.js and the Twitch panel use their own CSS files.

## Tried and ruled out
- `optimizeCss` with beasties/critters: in Next 15.5 it only runs in the pages runtime, not the App Router.
- Trimming daisyUI: Tailwind v4 already drops unused daisyUI components; nearly all of the 120 kB is used.

## Watch out
- `next start` serves HTTP/1.1, so localhost Lighthouse overstates how long CSS waits behind JS; Vercel's HTTP/2 sends CSS first. Judge CSS changes with Speed Insights field data, not only the local lab.
