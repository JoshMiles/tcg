---
title: Discord link banner on /account
author: Joshua
date: 2026-10-20
branch: docs/roadmap-track-34
cost: { minutes: 3, tokens: 73146 }
touches:
  - ROADMAP.md
  - app/(site)/account/page.tsx
  - app/components/site/DiscordPrompt.tsx
  - lib/push-prompt-core.ts
---

## Decided
- The prompt to link Discord is a banner (app/components/site/DiscordPrompt.tsx) at the top of /account, right below PushPrompt. It shows only when /api/account/discord says enabled and not linked.
- Its snooze reuses parsePromptState/dismissed/MAX_DISMISSALS from lib/push-prompt-core.ts under its own localStorage key, tcg_discord_prompt (14 days, gone after 3 "Not now" taps).
## Tried and ruled out
- Making a new snooze helper: the push one already fits.
## Watch out
- The full link controls stay in Settings (DiscordAlerts.tsx). The banner only links to /auth/discord.
