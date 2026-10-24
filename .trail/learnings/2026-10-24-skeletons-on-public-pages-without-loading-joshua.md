---
title: Skeletons on public pages without loading.tsx
author: Joshua
date: 2026-10-24
branch: feat/nav-skeleton
cost: { minutes: 10, tokens: 101082 }
touches:
  - ROADMAP.md
  - app/components/site/SiteShell.tsx
  - docs/public-site/basics.md
  - app/components/site/PendingPage.tsx
  - package.json
---

## Decided
- Skeletons came back as a client component, `PendingPage` in `SiteShell`'s `<main>`: a document click listener on internal links to another path hides the page and shows `SiteSkeleton` until `usePathname()` changes (10 s fallback). No `loading.tsx`, so the Next 15.5 same-page `?param` hang can't return.
- Same-path `?param` / `#hash` links get no skeleton (in-page tabs keep the page). Children stay mounted under `hidden`, so a failed navigation keeps their state.
- Next 16 upgrade is ROADMAP 43.1; if it fixes the hang, restore `loading.tsx` and drop `PendingPage`.

## Tried and ruled out
- Restoring the removed `loading.tsx` files: brings back the dead same-page `?tab=` links fixed in #449.

## Watch out
- `e.defaultPrevented` can't filter clicks: Next `<Link>` prevents default itself before the document listener runs.
- The skeleton is keyed on the path the click left (`from === pathname`), not a boolean, so the new page shows in the same render as the path change and Back to that path shows no stale skeleton.
- Playwright isn't installed on this machine; drive system Chrome over CDP with the project's `ws` package (createRequire from the repo's package.json).
