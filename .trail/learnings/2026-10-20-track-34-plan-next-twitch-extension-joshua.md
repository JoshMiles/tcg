---
title: "Track 34 plan: next Twitch extension version"
author: Joshua
date: 2026-10-20
branch: feat/minute-cron-stream-webhook
cost: { minutes: 1, tokens: 1525 }
touches:
  - ROADMAP.md
  - public/twitch-panel/panel.js
---

## Decided
- Joshua (2026-10-20): panel freeze stays; next extension version planned as Track 34 (34.1 to 34.8) in ROADMAP.md, replacing the old Ext, 29.5, 30.4 and 25.2p rows. Track 32 (32.2, 32.4, 32.5) started in parallel sessions instead.
- Every Track 34 item edits public/twitch-panel/panel.js, so they run one at a time, one PR each; submit only after 34.8.
- Never rename or remove a JSON key on /api/twitch/*; the released panel must keep working.

## Tried and ruled out
- Building Track 34 now: rejected, the extension is still under Twitch review.

## Watch out
- 34.7 (achievements, binder, listing alerts, share images) needs a design pass first (318px panel, link out vs in-panel).
- 32.6 waits for 32.2 (both touch variant labels).
