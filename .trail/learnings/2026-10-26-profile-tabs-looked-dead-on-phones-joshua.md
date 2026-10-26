---
title: Profile tabs looked dead on phones after the skeletons came back
author: Joshua
date: 2026-10-26
branch: fix/profile-tab-pending
cost: { minutes: 16, tokens: 97289 }
touches:
  - app/components/site/TabStrip.tsx
  - "app/u/[username]/ProfileTabBar.tsx"
  - docs/public-site/basics.md
  - ROADMAP.md
---

## Decided
- On Next 16.4 the profile `?tab=` links do not hang any more: Chrome and WebKit (iPhone, tap, signed in and out) all land in 0.2 to 0.9 s locally. They look dead because a same-page `?param` change shows no `loading.tsx` skeleton, so nothing changes (URL, tab highlight, content) until the server answers. On a slow phone that reads as "takes ages / doesn't respond".
- Fix: `TabFace` in `app/components/site/TabStrip.tsx` (useLinkStatus) wraps each `ProfileTabBar` label; the tapped tab pulses within ~60 to 150 ms.

## Tried and ruled out
- Vercel runtime logs carry no request timings for `/u/` (only console output), so production render time could not be measured.

## Watch out
- Measure the tap-to-feedback gap with lag: CDP `Network.emulateNetworkConditions` latency 1500 in Chrome. A mouse click and a touch tap behaved the same here.
- Playwright is not a project dependency: install `playwright-core` in the scratchpad and launch Chrome with `channel: 'chrome'`, or `npx playwright-core install webkit` for an iPhone-like browser.
- Trade's tab strip (`app/(site)/trade/page.tsx`) and the season switchers have the same no-feedback gap.
