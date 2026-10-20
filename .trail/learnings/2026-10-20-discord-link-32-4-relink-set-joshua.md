---
title: "Discord link 32.4: relink, SET NX claim, test DM cooldown"
author: Joshua
date: 2026-10-20
branch: claude/discord-link-fixes
cost: { minutes: 11, tokens: 105875 }
touches:
  - ROADMAP.md
  - app/api/account/discord/route.ts
  - app/auth/discord/callback/route.ts
  - docs/trading.md
  - lib/discord-user.ts
  - scripts/check-discord.mts
---

## Decided
saveDiscordLink claims discord:user:<id> with SET NX first, returns boolean (false = held by another collector, callback answers in_use), deletes previous index on relink. Test DM cooldown is a SET NX EX 30 key, route maps it to 429. Token exchange errors log status only.
## Tried and ruled out
Keeping the callback's separate pre-check via getTwitchUserByDiscordId: racy, replaced by the save result.
## Watch out
Fresh worktrees have empty node_modules: run npm ci before npm run verify (every check fails with a tsx MODULE_NOT_FOUND otherwise). Claim and link write are not atomic; a crash between leaves the id claimed with no link, a retry fixes it.
