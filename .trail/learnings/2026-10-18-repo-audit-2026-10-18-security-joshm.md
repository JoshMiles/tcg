---
title: "Repo audit 2026-10-18: security and data-write risks"
author: Joshm
date: 2026-10-18
cost: { minutes: 1, tokens: 0 }
touches:
  - lib/kv.ts
---

## Decided
- Audit only, no code changed. Top finding: POST /api/twitch/link maps the caller's Twitch opaque id to ANY username from the body, so any panel viewer can act as any player. The panel never calls it (linkAndLogin in panel.js is dead); /api/twitch/login is the real, Helix-checked link. Fix = delete the route (panel freeze: needs the user's OK).
- removeUserFromCollection (lib/kv.ts), DELETE /api/collection?username and the POST `data` branch write the whole season blob without withCollectionLock, so a pull landing mid-write is lost.

## Tried and ruled out
- claimDraw / claimPaidPull are atomic (get then del === 1). Upgrades, website trades and uploads check auth correctly.

## Watch out
- On Windows checkouts check-words.mts and check-twitch-assets.mts fail: their regexes expect \n and files come out CRLF (.gitattributes is text=auto). CI on Linux passes.
- acceptTrade saves the collection before persisting trades:open; a failure in between leaves an escrowed open offer that the expiry sweep refunds again (duplicate prints).
- webhooks:queue is trimmed to 50 with ltrim, which silently drops the oldest queued pulls.
