---
title: Removed /api/twitch/link (account takeover)
author: Joshua
date: 2026-10-18
branch: fix/remove-twitch-link
cost: { minutes: 13, tokens: 288870 }
touches:
  - app/api/twitch/link/route.ts
  - docs/reference.md
  - public/twitch-panel/panel.js
---

## Decided
- Deleted POST /api/twitch/link (PR #254): it mapped the caller's opaque id to any username in the body. /api/twitch/login (Helix-checked) is the only link path now. User approved a panel-freeze exception for it.
- Left the unused linkAndLogin in public/twitch-panel/panel.js for the next extension version (freeze).

## Tried and ruled out
- No check script referenced the route; only docs/reference.md did.

## Watch out
- twitch_opaque:* mappings made through the old route may still point at the wrong player until that viewer signs in again via /api/twitch/login.
