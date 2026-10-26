---
title: What caching public pages (40.2e) needs
author: Joshua
date: 2026-10-26
branch: main
cost: { minutes: 1, tokens: 52489 }
touches:
  - app/components/site/SiteShell.tsx
---

## Decided
- 40.2e stays blocked until the 2026-11-06 Speed Insights read; only plan it if TTFB is still a large share of home's LCP.
- What blocks caching: SiteShell (app/components/site/SiteShell.tsx) awaits requireSiteAccess (cookies), getSession, live status and per-user nav data on every request, and 10 (site) pages are force-dynamic. Needs a shell split (static frame; user/rank/staff link via Suspense or client fetch; live badge client-side via LiveProvider).
- Cacheable candidates: home, /cards, /faq, /stats, /trade board. Per-user pages (account, settings, notifications, trade/new, feedback) stay dynamic.

## Tried and ruled out
- Nothing built yet; ISR vs Next 16 Cache Components not chosen (Track 43 says plan Cache Components as its own item).

## Watch out
- While the alpha gate is on, middleware sends signed-out visitors without an access cookie to /closed, so a "signed-out cache" serves almost nobody. Decide whether it waits for the site opening up.
- Biggest risk is caching a signed-in shell for everyone; test signed-in vs signed-out HTML.
