---
title: Slow-feeling phone tab bar after skeletons were removed
author: Joshua
date: 2026-10-24
branch: fix/tab-bar-pending
cost: { minutes: 12, tokens: 97723 }
touches:
  - app/components/site/MobileTabBar.tsx
  - docs/public-site/basics.md
---

## Decided
- Taps on the phone tab bar felt dead/slow because #449 removed loading.tsx from Trade, profile, Card Dex and Stats: with no loading boundary nothing renders until the full server page arrives. Fix: `TabFace` in MobileTabBar.tsx uses `useLinkStatus` (Next 15.3+) to light up and pulse the tapped tab at once.
- Did not add `prefetch={true}` to the tabs: extra server renders on every page view and a risk of bringing back the same-page ?param prefetch hang.

## Tried and ruled out
- Testing on cheesytcg.app with headless Chrome: the closed-alpha gate redirects to /closed. Use a local prod build on the mock KV.

## Watch out
- In Git Bash, a CLI arg like `/trade` is mangled into a Windows path; run node with `MSYS_NO_PATHCONV=1`.
- Two `nav[aria-label=Main]` exist (desktop top nav and the phone bar); select the bar with `nav[aria-label=Main].fixed`.
- CDP `Network.emulateNetworkConditions` latency makes the pending state visible locally, where the server answers in ~100 ms.
- On a fresh visit the cookie notice's accept button sits over the Home tab until dismissed.
