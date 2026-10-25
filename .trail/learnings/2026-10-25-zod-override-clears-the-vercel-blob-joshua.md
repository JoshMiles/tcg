---
title: zod override clears the vercel blob npm audit findings
author: Joshua
date: 2026-10-25
branch: deps-43-4
cost: { minutes: 23, tokens: 157644 }
touches:
  - HANDOFF.md
  - ROADMAP.md
  - package-lock.json
  - package.json
  - app/(site)/cards/loading.tsx
  - app/(site)/loading.tsx
  - app/(site)/page.tsx
  - app/(site)/stats/loading.tsx
  - app/components/site/MobileTabBar.tsx
  - app/components/site/PendingPage.tsx
---

## Decided
package.json `overrides` has `"zod": "^4.6.6"`. npm audit flagged 4 high findings (zod < 4.6.6, memory exhaustion on oversized collections) reached only through @vercel/blob > @vercel/oidc > @vercel/cli-config, which pins zod 4.1.11 exactly. Overriding to 4.6.7 (same major) leaves 0 findings; cli-config still loads and parses configs, verify and build pass. Remove the override once cli-config ships a fixed zod.

## Tried and ruled out
@vercel/blob 2.8.2 is already the latest, so updating it does not help. `npm audit fix --force` would downgrade @vercel/blob to 2.4.0, a breaking change.

## Watch out
The override applies to every zod in the tree; if the app ever adds its own zod 3 dependency, it will be forced to 4.
