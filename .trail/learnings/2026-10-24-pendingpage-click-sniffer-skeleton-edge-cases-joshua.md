---
title: "PendingPage click-sniffer skeleton: edge cases"
author: Joshua
date: 2026-10-24
branch: feat/nav-skeleton
cost: { minutes: 8, tokens: 72563 }
touches:
  - app/components/site/MobileTabBar.tsx
  - app/components/site/PendingPage.tsx
  - docs/public-site/basics.md
---

## Decided
- PendingPage (public-site skeleton on cross-path link clicks) skips /api/ and /auth/ links: /auth/* are route handlers that redirect, often off-site.
- Clear the skeleton on popstate (router handles scroll) and on pageshow with persisted (bfcache return); on the 10 s fallback or bfcache return, restore the scroll position saved at click time.
- It is a temporary layer (shortcut: comment) until the Next 16 upgrade allows loading.tsx (ROADMAP 43.1).

## Tried and ruled out
- Checking e.defaultPrevented to skip links with their own cancelling onClick: Next's <Link> also calls preventDefault, so both look the same. No site link cancels today; no opt-out attribute added.

## Watch out
- A link whose onClick cancels navigation will blank the page for up to 10 s.
- /auth/error is a real page but gets no skeleton because of the /auth/ skip.
