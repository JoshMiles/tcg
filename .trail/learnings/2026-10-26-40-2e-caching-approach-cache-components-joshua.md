---
title: "40.2e caching approach: Cache Components shell, not signed-out ISR"
author: Joshua
date: 2026-10-26
branch: main
cost: { minutes: 4, tokens: 48721 }
touches:
  - ROADMAP.md
---

## Decided
- 40.2e plan (ROADMAP, 2026-10-26): Cache Components / partial prerendering with one KV-free, cookie-free cached shell for everyone; gate, session nav, SandboxPill and live badge stream in behind Suspense. The Gate hole renders {children}, so no page content is sent before requireSiteAccess.
- Order: 0 decide from field data (split at #461 London move, Fluid compute, home LCP element), 1 flag on + remove 112 force-dynamic exports + instant=false codemod, 2 shell split, 3 optional 'use cache: remote' shared reads with updateTag on writes.

## Tried and ruled out
- "Cache for signed-out visitors": the alpha gate sends them to /closed, so almost nobody hits it.
- Whole-page ISR: the shell and every KV read (currentSandboxId reads header + cookie) are per-request.
- Plain 'use cache' for runtime data: in-memory per instance, rarely hits on serverless; use 'use cache: remote'.

## Watch out
- cacheComponents is app-wide and changes GET route handlers, including /api/twitch: blocked by the panel freeze.
- Cached functions can't call cookies()/headers(): pass the sandbox id in and use runInSandbox, or sandbox data leaks into prod cache (or vice versa).
- Pulls happen live on stream; tag invalidation on draws is required, not just a short cacheLife.
