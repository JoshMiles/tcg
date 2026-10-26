---
title: Review of the 43.4 package bumps
author: Joshua
date: 2026-10-26
branch: main
cost: { minutes: 2, tokens: 65113 }
touches:
  - lib/qr.ts
  - app/layout.tsx
  - docs/hosting.md
  - ROADMAP.md
---

## Decided
The 43.4 bumps (PR #456) need no code changes. qrcode-generator 2 keeps the default `qrcode(type, level)` export that `lib/qr.ts` uses, and `qrPath` still returns a valid code. Analytics and Speed Insights 2 still export from the `/next` subpaths, used with no props in `app/layout.tsx`. `@types/node` 24 matches the Vercel runtime (Node 24.x, docs/hosting.md).

## Tried and ruled out
On Windows, `npx tsx` fails with ERR_UNSUPPORTED_ESM_URL_SCHEME on an absolute `c:` path import. Use a relative one instead: `npx tsx -e "import('./lib/qr').then(...)"`.

## Watch out
Step 3 of 43.4 said to check whether Next 16.4 supports TypeScript 7 and plan it as its own item. 43.4 is marked Done, but no TS 7 item or note was added to ROADMAP.md.
