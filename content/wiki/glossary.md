---
title: Glossary
summary: The words the panel uses, and the thing they point at.
order: 80
covers: lib/glossary.ts
---

Short names for the things staff run into in the panel. The topic pages say how to use them.

| Word | Meaning |
| --- | --- |
| Season | A run of the game with its own collection, leaderboard, and list of packs. One is active. |
| Pack | A global deck of cards. Seasons point at packs. Inactive and archived packs are not drawn. |
| Card | One design in a pack: number, name, stars, art, odds. Not a viewer's copy. |
| Print | One pull of a card, held by a viewer. Duplicates are extra prints. |
| Print number | The id on the print page (`/copy/...`), shown as Print followed by the number. |
| Edition number | How early that version of the card was pulled. Early ones can score a bonus. Backfilled ones are estimates. |
| Version | Regular, Reverse Holo (RH), Full Art (FA), or Shiny (SH). Rolled only when that pack and card allow upgrades. |
| Collection | The blob of every viewer's prints for one season. The source of truth for who owns what. |
| Binder | A viewer's own layout of their cards on their profile. Cosmetic. It does not move ownership. |
| Dex | The public list of cards in the set, and who has pulled them. |
| Score | Points from the cards they hold, plus edition bonuses and set bonuses, using the saved scoring settings. Escrowed prints are left out. |
| Progress bonus and full set bonus | The two set bonuses. Older text called the first one a completion bonus. The settings page uses the current names. |
| Escrow | Prints locked on an open offer. They are not in the offerer's collection until the offer ends. |
| Listing | An offer on the public board. Anyone may take it. |
| Direct offer | An offer to one login. Only those two people can open it. |
| Overlay | The OBS browser source that plays pulls. It is not the admin preview, and it is not the Twitch panel. |
| Overlay key | The secret in the OBS URL. Without it, a stranger cannot drain the pull queue. |
| Ticket | The one-use id the server stores when it rolls a pull. The overlay must send it back to save. |
| Scene | A named overlay setup with its own URL, for a second OBS scene (a vertical camera, for example). The queue is still shared. |
| Staff | Someone on the staff list: super admin, admin, or mod. |
| Sandbox | A fenced copy of the data for a test. Preview deployments are always inside one. |
| Tester | A login allowed in while Access is closed alpha or beta. Not the same as staff. |
| Grant | Staff, or the grant webhook, adding a print that was not pulled. It is a new print. |
| Restore point | A 14-day snapshot of a viewer's collections, taken before a destructive admin action. |
| Achievement | A badge the site stores for a viewer (for example the tester badges). Not a card. |
