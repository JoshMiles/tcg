---
title: "Track 45 held security fixes: how they were shipped"
author: Joshua
date: 2026-10-26
branch: main
cost: { minutes: 43, tokens: 277046 }
touches:
  - HANDOFF.md
  - ROADMAP.md
  - "app/admin/sandbox/[id]/page.tsx"
  - "app/admin/sandbox/[id]/twitch/FakeTwitch.tsx"
  - "app/admin/sandbox/[id]/twitch/page.tsx"
  - app/admin/sandbox/actions.ts
  - app/admin/sandbox/page.tsx
  - docs/CODE_REVIEW.md
  - docs/local-dev.md
  - docs/overlay.md
---

## Decided
- Held (unfixed high) findings go to agents only in their private briefs; public PR text, commits, comments and docs describe the fix, never the exploit. Opus reviews each diff for wording before pushing.
- Sandbox entry is a signed token `<id>.<hmac>` (lib/sandbox-token.ts, key derived from SESSION_SECRET); bare ids map to the dead namespace. Each sandbox has its own overlay key; the overlay URL carries `?sandbox=<token>&key=<key>`.
- Staff sign-in bookkeeping lives in `staff:seen` and `staff:ids` (hsetnx), never in the `staff:members` record.
- Password login failures are counted in prodKv with a site-wide hourly cap (lib/login-limit.ts); client IP is x-real-ip or the right-most X-Forwarded-For.
## Tried and ruled out
- Editing ROADMAP lines in parallel PRs: adjacent removed lines conflict. Let the last PR of a track remove the whole track.
## Watch out
- Agents in worktrees make a `node_modules` symlink to the main checkout. Remove the link with plain `rm <link>` before `git worktree remove --force`, or the force remove can follow it.
- `lib/captcha-server.ts` still uses the left-most X-Forwarded-For (ROADMAP 47.7).
