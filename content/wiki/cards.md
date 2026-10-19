---
title: Cards, packs and seasons
summary: How the set is built, how a pull is chosen, and what a print is.
order: 20
---

Three levels: a **season** contains **packs**, and a pack contains **cards**. Packs are global. The same pack can sit in more than one season. Cards for a pack live with that pack, not with the season.

## Seasons

[Seasons](/admin/seasons) lists them, drafts first. One season is active. The overlay, the leaderboard default, and new pulls all use that one.

A new season still goes through the season wizard (`/admin/seasons/new`). A draft can be resumed. The season page assigns packs and holds the season's own settings.

A season has a collection name. That name is the key for every viewer's pulls in that season. Renaming it is not a cosmetic change: it points at a different blob.

Wrapping a season up and turning another one on is done from the season list. Pulls stop landing in the old collection once it is no longer active.

## Packs and cards

[Packs](/admin/packs) is the library. A tile shows which seasons use it, whether upgrades are on, and a health badge (no cards, a card with 0 odds, missing art or a name, duplicate numbers, full art with no full-art image, no cover, not in any season). A published pack in no season can never be drawn.

**New pack** still opens the pack wizard (`/admin/packs/new`). The pack page after that is where you edit settings, the card table, odds, and the danger zone (move to drafts, or delete).

On a pack you can:

- Switch it active or inactive. Inactive is never drawn. Archive hides it and keeps the cards, so old collections still resolve.
- Duplicate it into a draft named with "(copy)". Card numbers are copied, so renumber before both packs share a season.
- Edit every card's weight in the odds panel, normalise to 100, or balance by star rating. The simulator draws from the numbers on screen, saved or not. Saving is a separate action.
- Open a card for its name, number, art, sound, stars, and which versions it allows. The preview uses the overlay's holo look.

Card art and pack covers are uploaded to Vercel Blob. Locally, with no Blob token, the Assets page says storage is not connected. Uploads need a real deployment.

[Assets](/admin/assets) is the media library: card art, covers, sounds, files nothing references, and a few checks. Replacing a file in place keeps the URL.

## What a pull rolls

The server rolls the pull when it is queued, not the viewer's browser. It picks a pack by weight, a card by its odds, then a version by the pack's version weights when upgrades are on for that pack and that card. The overlay plays that result and saves it with a one-use ticket. A request that invents its own card is rejected.

Versions are Regular, Reverse Holo, Full Art, and Shiny. A pack can turn upgrades off (the starter set does). A card can turn individual versions off.

## Prints and score

Once a season is numbering prints, every new pull gets an edition number (how early that version of the card was pulled) and a print number (the id on the print page, `/copy/...`). Older pulls can be backfilled from [Prints](/admin/serials); those edition numbers are estimates, because the original order was not stored. Run that when nobody is opening packs.

An early edition can add a score bonus. The numbers live in [Settings, Scoring](/admin/settings?tab=scoring). The form previews the active season with the typed numbers before anything is saved: set value, top scores, bonuses, and who would move. Out-of-range values show what they will clamp to.

The leaderboard and a profile's score read those rules. Escrowed cards (open trades) do not count until the offer ends.

Favourites are prints a viewer marked so they cannot be traded or spent on an upgrade. Staff do not mark those. If someone cannot trade a print, check favourites on the print page before assuming a bug.
