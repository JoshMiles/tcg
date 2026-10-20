---
title: Minute cron and Mix It Up stream webhook
author: Joshua
date: 2026-10-20
branch: feat/minute-cron-stream-webhook
cost: { minutes: 5, tokens: 101687 }
touches:
  - app/api/cron/backup/route.ts
  - app/api/cron/minute/route.ts
  - app/api/cron/weekly/route.ts
  - app/api/webhooks/stream/route.ts
  - docs/admin/discord.md
  - docs/admin/mixitup.md
  - docs/hosting.md
  - docs/trading.md
  - lib/cron-auth.ts
  - lib/email.ts
---

## Decided
- /api/cron/minute (every minute, production only) runs getLiveStatus, sweepTrades and flushDueEmails; flushDueEmails moved out of the daily backup cron.
- POST /api/webhooks/stream {secret, event: live|offline} calls setLiveFromHint; it stores twitch:live:hint, which overrides a disagreeing Helix answer for 5 minutes.
- CRON_SECRET check shared in lib/cron-auth.ts (cronAuthorised).
## Tried and ruled out
- Letting Helix overwrite the hint at once: Helix lags start/end, which would flip status and post the recap early or twice.
## Watch out
- parseIncomingWebhook requires a username; use incomingSecretValid for webhooks without one.
