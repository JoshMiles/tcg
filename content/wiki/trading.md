---
title: Trading
summary: Offers, the board, escrow, and what to do when cards look stuck.
order: 30
covers: app/admin/trades/**, lib/trades.ts, lib/trade-core.ts
---

Trading is on the public site (`/trade`) and in the Twitch panel's Trades tab. A viewer can offer a direct trade to one person, or list on the board for anyone. Staff tools are on [Trades](/admin/trades). Mods see the same log at `/mod/trades`, without Extend.

## Escrow

Offering takes the cards off the offerer's collection and holds them on the trade. Accepting swaps. Decline, cancel, expiry, and counter give the offered cards back.

The database cannot move the trade and the collection in one step. The offer is saved as closed, still marked escrowed, before the cards move, and the flag is cleared after. If the server dies in between, the cards are not given back twice. They sit there. [Settings, Environment](/admin/settings?tab=environment) has a Data health panel that lists closed offers still marked escrowed, in a red alert. **Return prints** puts back only what that offer still holds, then clears the flag. Running it again does not add them a second time. If the season was deleted, it refuses and the flag stays set. On a season whose prints are not numbered, use it only when the offerer is actually missing the cards. Do not grant replacements until you have looked. A season cannot be deleted while it still has an open offer. A read-only audit (`scripts/audit-trade-ledger.mts`, commands in the trading doc) lists offers already left in that state, open offers whose season is gone, and viewers who may have a second set of prints after a restore. It changes nothing. The repair script stays a dry run until someone opts in, and it does not delete prints.

There is no timer job. Expired offers are refunded the next time someone opens a trade page, an account, a collection, or the admin trades page. If a viewer says an old offer is still holding cards, open [Trades](/admin/trades) once.

## What staff can do

On an open offer: cancel and refund, extend the clock, or block that viewer from trading. Blocking uses the same no-trading flag as the user page, and cancels their open offers.

Bulk tools: a per-season trading switch (cancelling still works while trading is paused), extend all, cancel and refund by scope.

The log can be filtered and exported. A row opens both sides, the points, and any flags. Flags are advice, not automatic bans:

- Lopsided: one side is at least twice the other and at least 50 points apart, at today's values.
- Repeat pair: three or more completed trades between the same two people in seven days.
- Rapid offers: five or more in ten minutes.
- New account: the profile was under 24 hours old when they offered.

A minimum account age can be required in trade settings (0 means off). Other limits: offer length (default 48 hours), how many open offers one person may have (5), a short cooldown (20 seconds), and how many stacks a side may have (8).

## After a trade completes

**Reverse** (admins and mods) needs a reason. It only works when the prints that moved are still with the people who received them, and not sitting in a new offer. Otherwise nothing moves, and the message names the first print that cannot go back. A very old trade with no record of which prints moved may say it is too old to reverse automatically.

Reversed trades stay in history as accepted, with a "Reversed by staff" line. Both people get a notice. The Twitch panel still shows the trade as completed.

Direct offers are private: only the two people can open the page. Board listings are public, and a new listing can post to Discord when a Trade listings channel is set. That post is not edited when the listing ends. The trade page shows the outcome.

## When a viewer says they cannot trade

Check, in this order:

1. Trading paused, or that season's switch off ([Trades](/admin/trades)).
2. Their moderation flag, or the other person's.
3. Account younger than the minimum.
4. The print is a favourite, or every print they could send is a favourite.
5. They already have the maximum open offers.
6. The site is in closed alpha or beta and they are not on the tester list ([Settings, Access](/admin/settings?tab=access)).

A lopsided offer also asks the sender to tick a box before it goes. That is the viewer, not a staff block.
