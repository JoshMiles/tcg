---
title: "Review of PendingPage edge cases (#452)"
author: Joshua
date: 2026-10-25
branch: main
cost: { minutes: 2, tokens: 79597 }
touches:
  - app/auth/twitch/route.ts
---

## Decided
- #452 (PendingPage skips /auth/, clears on popstate and bfcache pageshow, restores scroll after the 10 s timeout) is safe to ship. The only follow-up: the scroll restore after the timeout.
- The shortcut comment's claim holds: no public-site link cancels its own navigation (Card Dex tiles are role=button divs or CardTile, not anchors; other preventDefault calls are on keys and forms).

## Tried and ruled out
- `/auth/error` losing the skeleton is not a problem: it's only reached by redirect (app/auth/twitch/route.ts), and no link points to it.
- Checking `e.defaultPrevented` in the click sniffer can't tell links apart: Next Link always prevents default for client navigation.

## Watch out
- In the 10 s timeout, `setFrom(null)` then `requestAnimationFrame(scrollTo)` can scroll before React commits, because an update from a timer is scheduled as a separate task. The page is still hidden and only the short skeleton is laid out, so the scroll gets cut down. Use `flushSync(() => setFrom(null))` and then scroll directly.
