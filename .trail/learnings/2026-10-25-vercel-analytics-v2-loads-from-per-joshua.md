---
title: "Vercel Analytics v2 loads from per-deployment paths, not /_vercel/insights"
author: Joshua
date: 2026-10-25
branch: main
cost: { minutes: 29, tokens: 192359 }
touches:
  - HANDOFF.md
  - ROADMAP.md
  - package-lock.json
  - package.json
  - app/(site)/cards/loading.tsx
  - app/(site)/loading.tsx
  - app/(site)/page.tsx
  - app/(site)/stats/loading.tsx
  - app/components/site/MobileTabBar.tsx
  - app/components/site/PendingPage.tsx
---

## Decided
@vercel/analytics 2 and @vercel/speed-insights 2 (ROADMAP 43.4, PR #456) work unchanged with `<Analytics />` and `<SpeedInsights />` from the `/next` entry points in app/layout.tsx.

## Tried and ruled out
Checking a preview for `/_vercel/insights/script.js` and `/_vercel/speed-insights/script.js` finds nothing on v2 and looks like a break. v1 (production before #456) used those paths; v2 serves the scripts from per-deployment hashed paths like `/0c955e481c05f28d/script.js`, and the pageview goes to `/<hash>/view`.

## Watch out
To check them on a deployment, look for `typeof window.va === 'function'` and `typeof window.si === 'function'`, and resource entries ending in `/script.js` and `/view` outside `/_next/static`. A preview redirects to /closed (empty sandbox), which still renders the root layout, so the check works there.
