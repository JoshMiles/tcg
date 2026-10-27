---
title: New buff types and achievement tiles plan
author: Joshua
date: 2026-10-20
branch: docs/roadmap-cleanup
cost: { minutes: 3, tokens: 67547 }
---

## Decided
Joshua (2026-10-20): new buff types rarity-boost (magnitude = +10% per point on 3-star+ draw weights), score-bonus (flat points, default 100, once on apply), currency-grant (Brie Bucks via a new Mix It Up addUrl webhook). Free pack to self and community extra pull already exist as extra-pack / extra-pulls. Achievement Editor becomes icon+name tiles that expand; every achievement icon is selectable, built-ins via a per-kind override in achievement settings.
## Tried and ruled out
Pull discount instead of adding Brie Bucks: rejected, Joshua wants a real grant via Mix It Up.
## Watch out
Mix It Up had only balanceUrl/deductUrl; granting needs a Mix It Up command on the streamer's side and can't be tested locally.
