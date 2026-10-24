---
title: Same-page ?param links hang when the page has loading.tsx (Next 15 prod)
author: Joshua
date: 2026-10-24
branch: main
cost: { minutes: 125, tokens: 843744 }
touches:
  - app/(site)/(home)/loading.tsx
  - app/(site)/(home)/page.tsx
  - app/(site)/cards/loading.tsx
  - app/(site)/loading.tsx
  - app/(site)/stats/loading.tsx
  - app/components/site/MobileTabBar.tsx
  - app/u/loading.tsx
  - docs/public-site/basics.md
  - next.config.ts
---

## Decided
- No `loading.tsx` on a page that links to itself with different search params (profile `?tab=`, Card Dex, Season Stats, Trade, My stats `?season=`, Feedback `?kind=`), nor on a parent folder or route group above one. Skeletons stay only on home (`app/(site)/(home)/`, a route group so it covers `/` only), `collection` and `leaderboard/[seasonId]`. `admin/loading.tsx` stays: admin `?tab=` links were checked working.
- `(entity)` has no `loading.tsx` so `notFound()` gives a real 404 (a skeleton there makes the status 200).
- The phone tab bar's Collection link is `profileHref(username, 'collection')`; its active state compares the path only.

## Tried and ruled out
- Middleware request-header override (`x-tcg-path`), `experimental.clientSegmentCache`, `htmlLimitedBots` (streaming metadata), SiteShell contents, stylesheets, the service worker, network: none of them is the cause.
- Moving skeletons from parent folders to the page's own folder: still hangs. What matters is any loading boundary in the prefetched page's tree.

## Watch out
- Production only (`next build && next start`); `next dev` never aliases prefetches. Repro: open `/x`, `router.prefetch('/x')`, then `router.push('/x?a=1')`. The URL never changes and links look dead.
- Mechanism: Next 15.5 reuses the param-less AUTO prefetch (`handleAliasedPrefetchEntry`, only when the seed data has a loading component), lazy-fetches the page, the server patch applies, but React keeps exiting RootSuspendedWithDelay and never commits. The reason is not pinned down: Card Dex worked with its skeleton while Stats did not.
- Cross-page links to `/x?a=1` work; only same-page param changes hang.
- The Claude browser pane can't run this test (no rAF); use headless Chrome over CDP.
