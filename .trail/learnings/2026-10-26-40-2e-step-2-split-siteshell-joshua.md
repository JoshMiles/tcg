---
title: "40.2e step 2: split SiteShell into a prerendered frame and streamed holes"
author: Joshua
date: 2026-10-26
branch: cache-public-shell
cost: { minutes: 16, tokens: 190979 }
touches:
  - CLAUDE.md
  - ROADMAP.md
  - "app/(entity)/c/[uid]/page.tsx"
  - "app/(entity)/cards/[card]/copies/page.tsx"
  - "app/(entity)/copy/[seasonId]/[copyId]/page.tsx"
  - app/(entity)/layout.tsx
  - "app/(entity)/p/[uid]/page.tsx"
  - "app/(entity)/trade/[id]/page.tsx"
  - app/(site)/account/page.tsx
  - app/(site)/cards/page.tsx
---

## Decided
- SiteShell is synchronous and holds no cookie/session/KV read. SiteHeader (nav account area, banner, LiveSeed, MotionPref, PublicKeyboard), SandboxPill and Gate (requireSiteAccess, then children) stream behind Suspense.
- Privacy, terms and root not-found use OpenPageShell (per request) so no-access viewers still get ClosedShell.
- data-motion moved to <html> via a client effect (MotionPref); the binder listens for the tcg:motion event because it reads the attribute once.
- /trade keeps instant = false: TradePage reads seasons outside Suspense and dev validation rejects it.

## Tried and ruled out
- Making Gate block the page: Next renders the page segment in parallel with the layout, so a redirect from a layout after streaming starts can't stop the page's flight rows. Per-page checks or a dynamic shell were the only fixes; accepted the window instead (only a viewer whose access cookie still passes middleware, e.g. a tester removed under an hour ago, which the admin UI already says).

## Watch out
- The testing banner (alpha/beta label) is now in the streamed header, so it can push the page skeleton down by one strip when it lands. Check CLS in Speed Insights with 40.2f.
- The fallback nav is SiteNav with user null and loginEnabled false; keep it the same height as the real one.
