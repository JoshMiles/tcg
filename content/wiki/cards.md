---
title: Cards, packs and seasons
summary: How the set is built, how a pull is chosen, trainer cards and buffs, and what an edition is.
order: 20
covers: app/admin/packs/**, app/admin/seasons/**, app/admin/assets/**, app/admin/serials/**, app/admin/buffs/**, lib/draw.ts, lib/scoring.ts, lib/variants.ts
---

Three levels: a **season** contains **packs**, and a pack contains **cards**. Packs are global. The same pack can sit in more than one season. Cards for a pack live with that pack, not with the season.

## Seasons

[Seasons](/admin/seasons) lists them, drafts first. One season is active. The overlay, the leaderboard default, and new pulls all use that one.

A new season still goes through the season wizard (`/admin/seasons/new`). A draft can be resumed. The season page assigns packs and holds the season's own settings, including an optional start and end time with auto start. There is no background job for the schedule: it is applied the first time anything reads the season after the time passes.

A season has a collection name. That name is the key for every viewer's pulls in that season. Renaming it is not a cosmetic change: it points at a different blob.

### Season lifecycle

- **Activate.** Turning another season on takes a wrap-up snapshot of the one that was active, with awards. Pulls stop landing in the old collection once it is no longer active.
- **End season** and **Reopen.** Ending a season freezes trading in it. Reopen undoes that.
- **Reactivate.** Brings an ended season back as the active one.
- The wrap-up panel is on the season's own page, not on the season list.

## Packs and cards

[Packs](/admin/packs) is the library. A tile shows which seasons use it, whether upgrades are on, and a health badge (no cards, a card with 0 odds, missing art or a name, duplicate numbers, full art with no full-art image, no cover, not in any season). A published pack in no season can never be drawn.

**New pack** asks for a name, creates a draft, and opens the pack workspace (`/admin/packs/<id>`). Drafts have a publish checklist, and a published pack can be moved back to drafts from the danger zone. The workspace has these views: the card list, Grid, Odds and simulator, Overview, Pack settings and Card back.

On a pack you can:

- Switch it active or inactive. Inactive is never drawn. Archive hides it and keeps the cards, so old collections still resolve.
- Duplicate it into a draft named with "(copy)". Card numbers are copied, so renumber before both packs share a season.
- Edit every card's weight in the Odds and simulator view, **Normalize to 100**, or **Balance by rarity**. The simulator draws from the numbers on screen, saved or not. Saving is a separate action.
- Set **Price per paid pull** under Pack settings, Details. It overrides the role and base prices for paid pulls, see [Live tools](/admin/wiki/live-tools).
- Open a card for its name, number, art, sound, stars, and which versions it allows. The preview uses the overlay's holo look.

Card art and pack covers are uploaded to Vercel Blob. Locally, with no Blob token, the Assets page says storage is not connected. Uploads need a real deployment.

[Assets](/admin/assets) is the media library: card art, covers, sounds, files nothing references, and a few checks. Replacing a file in place keeps the URL.

## Trainer cards and buffs

A card has a kind: collector or trainer. A trainer card carries a buff, set in the [Buff Editor](/admin/buffs). Buff types are extra pulls, extra pack and rarity boost, plus two one-shot types: score bonus and currency grant. A buff with community scope can be the reward of a community pack goal on the Stream page.

## What a pull rolls

The server rolls the pull when it is queued, not the viewer's browser. It picks a pack by weight, a card by its odds, then a version by the pack's version weights when upgrades are on for that pack and that card. The overlay plays that result and saves it with a one-use ticket. A request that invents its own card is rejected.

Versions are Regular, Reverse Holo, Full Art, Full Art Holo and Golden. The short labels are RH, FA, FH and GD. Golden has a weight of 0 unless a pack sets one. A pack can turn upgrades off (the starter set does). A card can turn individual versions off.

## Editions and score

A copy of a card that a viewer holds is an **edition**. Once a season is numbering editions, every new pull gets an **edition number** (how early that version of the card was pulled) and a **serial number** (the game-wide id, shown as Serial #1023381 on the edition page, `/copy/...`). Older pulls can be numbered with **Number existing editions**, on [Editions](/admin/serials) or in Settings, Twitch & viewers, under "Card editions". Those edition numbers are estimates, because the original order was not stored. Run that when nobody is opening packs.

An early edition can add the **edition bonus** to score. The numbers live in [Settings, Scoring](/admin/settings?tab=scoring), along with the **progress bonus** and the **full set bonus**. The form previews the active season with the typed numbers before anything is saved: set value, top scores, bonuses, and who would move. Out-of-range values show what they will clamp to.

The leaderboard and a profile's score read those rules. Escrowed cards (open trades) do not count until the offer ends.

A weekly job picks the edition of the week. It shows on the home page, and the Edition of the week panel on Editions can pick it again.

Favourites are editions a viewer marked so they cannot be traded or spent on an upgrade. Staff do not mark those. If someone cannot trade an edition, check favourites on its page before assuming a bug.
