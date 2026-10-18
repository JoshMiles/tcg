---
title: "Trade close ordering: never refund twice"
author: Joshua
date: 2026-10-18
branch: fix/accept-trade-ordering
cost: { minutes: 9, tokens: 100215 }
touches:
  - app/admin/settings/DataHealthPanel.tsx
  - docs/hosting.md
  - docs/trading.md
  - lib/data-health.ts
  - lib/trades.ts
  - scripts/check-data-health.mts
  - scripts/check-trades.mts
---

## Decided
- KV has no multi-key transaction, so trade close paths now save the offer as closed (escrowed: true) BEFORE moving copies, then clear the flag. A split leaves a stuck escrow (lost, listed by Data health stuckEscrow), never a double refund. User chose this over leaving the window open.

## Tried and ruled out
- Monkeypatching prodKv.set in checks does nothing: @vercel/kv's kv is a Proxy over a lazy client. To force a refund failure, hold lock:tcg_<coll> with db.kv.set so withCollectionLock times out.

## Watch out
- closeTrade now persists mid-call when it refunds; every caller still must persist after (they all do).
- A failed accept leaves the trade in history as accepted+escrowed and its 'accepted' notice still goes out.
