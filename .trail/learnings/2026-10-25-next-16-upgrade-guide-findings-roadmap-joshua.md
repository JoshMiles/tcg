---
title: Next 16 upgrade guide findings (ROADMAP 43.1)
author: Joshua
date: 2026-10-25
branch: next-16-upgrade
cost: { minutes: 3, tokens: 82207 }
touches:
  - ROADMAP.md
  - middleware.ts
  - lib/og.tsx
---

## Decided
- Upgrade guide and 16.1 to 16.4 posts read on 2026-10-25; the extra items are in ROADMAP 43.1 step 1.
- Keep the webpack `@next/bundle-analyzer` behind `next build --webpack` for `npm run analyze`; the Turbopack analyzer (`next experimental-analyze`, 16.1) is not adopted yet.
- `middleware.ts` stays as is (edge runtime, panel freeze); `proxy.ts` is Node-only, so the rename is 43.3.

## Tried and ruled out
- Nothing ruled out yet; the codemod (`@next/codemod upgrade`) was not needed since request APIs are already async.

## Watch out
- 16.2 changed the `ImageResponse` default font to Geist Sans; `lib/og.tsx` sets none, so share images change typeface.
- `next build` no longer prints route size / First Load JS; read bundle sizes from analyze or Lighthouse.
- `next dev` writes to `.next/dev` and a lockfile blocks a concurrent `next build` in the same checkout.
- A stale cherry-pick sequencer on `main` blocks `git switch`; `git cherry-pick --quit` clears it without touching files (check nothing is staged first).
