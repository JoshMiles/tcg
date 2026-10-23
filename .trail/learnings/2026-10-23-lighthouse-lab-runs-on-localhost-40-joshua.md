---
title: Lighthouse lab runs on localhost (40.2)
author: Joshua
date: 2026-10-23
branch: main
cost: { minutes: 17, tokens: 67829 }
touches:
  - app/admin/components/BrandMark.tsx
  - app/components/site/ClosedShell.tsx
  - app/components/site/SiteNav.tsx
  - app/components/site/SiteShell.tsx
  - lib/og.tsx
---

## Decided
- Lab tool is plain `npx -y lighthouse@12.8.2 <url> --throttling-method=devtools --only-categories=performance --output=json --chrome-flags="--headless=new"` against `next build` + `node node_modules/next/dist/bin/next start --port 3111` on the seeded mock KV, with AdGuard off. No dependency added.
- Results with real throttling (slow 4G, 4x CPU): every public page's first paint is 2.2 to 2.9 s even with 20 ms TTFB. The 47 KB main stylesheet blocks rendering and shares the link with the JS chunks; the two next/font woff2 files only start after the CSS (about 2.3 s) and end about 3.5 s.
- `/cards`: the LCP is the first card thumbnail, which has `loading="lazy"` (3.4 s load delay); CLS 0.13. `/leaderboard`: the LCP is the client-rendered cookie banner text (3.9 s).
- Swapping the 34 px / 28 px logos (SiteNav, SiteShell footer, ClosedShell, admin BrandMark) from `/brand/icon.png` (126 KB) to `/brand/icon-small.png` (17 KB, same 224 px image) saves 109 KB per page and about 0.3 s of first paint in one run each. Keep `lib/og.tsx` on the full PNG.

## Tried and ruled out
- Lighthouse's default simulated throttling on localhost: it reported a 3.4 s "render delay" on home, but the trace shows the text painting at first paint. Everything loads before the first paint locally, so the simulation counts all the JS as blocking. Always use `--throttling-method=devtools` locally.
- Removing `app/(site)/loading.tsx` changed home LCP by only about 0.3 s (simulated); it is not the cause.
- No hydration mismatch on home (the console shows only the missing Vercel scripts locally).

## Watch out
- `npx next start -p` fails in this shell ("unknown option '-p'"); call `node node_modules/next/dist/bin/next start --port 3111`.
- The context-mode hook blocks curl in Bash.
- Git Bash rewrites "/path" arguments; set `MSYS_NO_PATHCONV=1`.
- devtools throttling runs vary by a few hundred ms (TBT jumped between runs); compare two runs per page.
