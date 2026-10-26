---
title: Functions pinned to lhr1 next to the KV store
author: Joshua
date: 2026-10-26
branch: functions-in-london
cost: { minutes: 1, tokens: 14083 }
touches:
  - docs/hosting.md
  - vercel.json
---

## Decided
- vercel.json `"regions": ["lhr1"]`. The Upstash store `tcg-kv` is in London (eu-west-2) but functions ran in the default iad1, so every KV round trip crossed the Atlantic (~75 ms each, several per page). Functions and KV must stay in the same region; move both or neither.

## Tried and ruled out
- Moving to a Cloudflare database for speed: Cloudflare has no Postgres (D1 is SQLite for Workers, Workers KV is eventually consistent and breaks the locks and get-then-del claims). The distance between function and store was the problem, not the store.

## Watch out
- The KV region is only visible on the Upstash console (Vercel Storage tab), not through the Vercel MCP project or integration listing.
- tcg-kv is on Upstash Free tier (500K commands a month) and was at 733K on 2026-10-26; the every-minute cron is a steady share of that.
