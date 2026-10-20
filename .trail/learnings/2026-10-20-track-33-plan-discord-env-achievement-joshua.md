---
title: "Track 33 plan: Discord env, Achievement Editor, FAQ templates"
author: Joshua
date: 2026-10-20
branch: docs/roadmap-track-33
cost: { minutes: 8, tokens: 135572 }
touches:
  - ROADMAP.md
  - scripts/check-words.mts
---

## Decided
- Joshua (2026-10-20): Achievement Editor gets its own /admin/achievements page on the sidebar, built-ins prefilled with real wording plus placeholders ({season} {need} {rarity} {version} {cutoff}), "Buff given when earned" wording, earn stats (achievements:earned hash, achievements:recent list, Recount button), and custom goals from 5 per-season rules (unique, editions, rarity, version, firsts).
- Joshua: FAQ built-in questions become prefilled editable templates (lib/faq-builtins.ts), not blank overrides. Store keeps only overrides so code copy fixes still reach unedited questions. Data tables become {{block}} lines.
- 32.3 FAQ hardening folded into 33.3 (same files). Discord env vars: DISCORD_CLIENT_ID/SECRET/BOT_TOKEN only; DISCORD_API_BASE is a test hook, channel webhooks live in KV.
## Tried and ruled out
- Blank FAQ overrides keeping JSX sections: rejected by Joshua in favour of prefilled templates.
- Custom achievements on trade counts: out of scope, AchSeason has no trade data.
## Watch out
- scripts/check-words.mts must read FAQ wording from lib/faq-builtins.ts once section .tsx files go.
- Achievement stats must count only when the claim-then-apply (set-if-absent from 32.1) won, or concurrent syncs double count.
