---
title: Next 16.4 fixed the same-page param hang; skeletons are back
author: Joshua
date: 2026-10-25
branch: skeletons-next16
cost: { minutes: 9, tokens: 83251 }
touches:
  - app/(site)/loading.tsx
  - app/u/loading.tsx
  - app/(site)/cards/loading.tsx
  - app/(site)/stats/loading.tsx
  - docs/public-site/basics.md
---

## Decided
- Next 16.4.3 no longer hangs on same-page `?param` links with a `loading.tsx` on the page: the four skeletons removed in #449 are back (`(site)`, `cards`, `stats`, `u`), `PendingPage` is deleted and the `(home)` route group is folded back into `(site)`. `(entity)` stays without one so `notFound()` is a real 404.

## Tried and ruled out
- The hang does not reproduce through `window.next.router.push` after `router.prefetch` (not even on Next 15.5.28). It only showed with a real click on the link, so test with a click (Playwright, `channel: 'chrome'`). On 15.5.28 with skeletons: Stats `?season` and profile `?tab` clicks left the URL unchanged for 6 s; the same clicks on 16.4.3 changed the URL in 56 ms and 215 ms.
- Card Dex, Trade and My stats links never hung on 15 either, so only Stats and the profile tabs prove the fix.

## Watch out
- A production build ignores the fake-Twitch URL overrides, so login by `/auth/twitch` fails against `next start`. Forge a `tcg_session` cookie with the local `SESSION_SECRET` (see `signSession` in `lib/session.ts`) instead.
- `git worktree add` of the old code into the scratchpad leaves a directory whose `node_modules` paths exceed Windows limits for `git worktree remove`; delete it with node `fs.rmSync`.
