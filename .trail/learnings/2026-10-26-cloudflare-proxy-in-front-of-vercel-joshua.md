---
title: "Cloudflare proxy in front of Vercel: no speed gain"
author: Joshua
date: 2026-10-26
branch: main
cost: { minutes: 4, tokens: 76997 }
touches:
  - app/api/auth/login/route.ts
  - lib/captcha-server.ts
---

## Decided
- Recommended Cloudflare DNS records for cheesytcg.app be "DNS only" (grey cloud). Cloudflare as nameserver is fine; its proxy is not.
- The site's slowness is server render, not the network: every public page is force-dynamic/no-store, functions run in iad1 (see x-vercel-id `lhr1::iad1::`), so a trivial page like /closed takes ~300 ms TTFB from London. The fix is ROADMAP 40.2e (cache public pages for signed-out visitors), not a CDN.

## Tried and ruled out
- Cloudflare proxy for speed: HTML comes back `cf-cache-status: DYNAMIC`, so it caches nothing and adds ~30-40 ms per request. Vercel already caches /_next/static.
- Comparing via tcg-khaki.vercel.app: it 307s to cheesytcg.app. To bypass Cloudflare use `curl --resolve cheesytcg.app:443:76.76.21.21`.

## Watch out
- Behind an orange-cloud proxy, Vercel likely sees Cloudflare's IP as x-forwarded-for, which breaks the emergency login lockout key (app/api/auth/login/route.ts) and the IP passed to Turnstile (lib/captcha-server.ts). Not live-verified.
- While the access gate is in a closed mode, signed-out curl requests all 307 to /closed, so only /closed and redirects can be timed without a session.
- KV region unknown (not visible via the Vercel MCP project or integrations). If KV is in Europe, the iad1 function region costs a transatlantic trip per read.
