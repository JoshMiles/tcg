---
title: ROADMAP 32.2 holo shimmer flag and variant CSS
author: Joshua
date: 2026-10-20
branch: fix/32-2-holo
cost: { minutes: 1, tokens: 795 }
---

## Decided
HoloSpec has `on` (any of shimmer/glow/rock, gates holoVars) and `shimmer` (gates holoClass). CSS restored to pre-#308 rules minus .vfx-reverse; Full Art rocks only via .vfx-full[style*="--rock-amt"].
## Tried and ruled out
Making `on` mean shimmer only: holoVars would drop glow and rock vars.
## Watch out
Stale .next types break `npm run verify` after a branch switch; rm -rf .next first. verify takes over 2 minutes, run it in the background.
