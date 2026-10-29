---
title: Glossary
summary: The words the panel uses, and the thing they point at.
order: 80
covers: lib/glossary.ts
---

Short names for the things staff run into in the panel. The topic pages say how to use them.

## The set

| Word | Meaning |
| --- | --- |
| Season | A run of the game with its own collection, leaderboard, and list of packs. One is active. |
| Pack | A global deck of cards. Seasons point at packs. Inactive and archived packs are not drawn. |
| Card | One design in a pack: number, name, stars, art, odds. Not a viewer's copy. |
| Trainer card | A card whose kind is trainer. It carries a buff. A collector card does not. |
| Buff | An effect from a trainer card or an event: extra pulls, an extra pack, a rarity boost, or a one-shot score bonus or currency grant. Edited in the Buff Editor. |
| Community buff | A buff with community scope. It can be the reward of a pack goal. |
| Version | Regular, Reverse Holo (RH), Full Art (FA), Full Art Holo (FH) or Golden (GD). Rolled only when that pack and card allow upgrades. |
| Collection | The blob of every viewer's editions for one season. The source of truth for who owns what. |
| Binder | A viewer's own layout of their cards on their profile. Cosmetic. It does not move ownership. |
| Dex | The public list of cards in the set, and who has pulled them. |

## Editions and score

| Word | Meaning |
| --- | --- |
| Edition | One copy of a card, held by a viewer. Duplicates are extra editions. |
| Edition number | Its place among editions of that card and version. Early ones can score a bonus. Numbers added afterwards are estimates. |
| Serial number | The game-wide id of one edition, shown as Serial #1023381 on its page (`/copy/...`). |
| Edition of the week | The edition a weekly job picks and shows on the home page. |
| Edition bonus | Extra score for an early edition number. |
| Score | Points from the cards they hold, plus the edition bonus and set bonuses, using the saved scoring settings. Escrowed editions are left out. |
| Progress bonus and full set bonus | The two set bonuses. Older text called the first one a completion bonus. |
| Grant | Staff, or the grant webhook, adding an edition that was not pulled. It gets a new serial number. |
| Restore point | A 14-day snapshot of a viewer's collections, taken before a destructive admin action. |
| Achievement | A badge the site stores for a viewer (for example the tester badges). Not a card. |

## Trading

| Word | Meaning |
| --- | --- |
| Escrow | Editions locked on an open offer. They are not in the offerer's collection until the offer ends. |
| Listing | An offer on the public board. Anyone may take it. |
| Direct offer | An offer to one login. Only those two people can open it. |
| Block trading | The moderation switch that stops a viewer offering or accepting trades. Shown to mods as "No trading". |
| Hide from public boards | The moderation switch that removes a viewer from the leaderboard, owner lists and recent pulls. |
| Reverse trade | Staff undoing a completed trade, when the editions can still move. |

## Stream

| Word | Meaning |
| --- | --- |
| Overlay | The OBS browser source that plays pulls. It is not the admin preview, and it is not the Twitch panel. |
| Overlay key | The secret in the OBS URL. Without it, a stranger cannot drain the pull queue. |
| Ticket | The one-use id the server stores when it rolls a pull. The overlay must send it back to save. |
| Scene | A named overlay setup with its own URL, for a second OBS scene (a vertical camera, for example). The queue is still shared. |
| Mix It Up | The chat bot and currency tool the stream uses. It sends commands and payments to the site. |
| Brie Bucks | The channel currency viewers spend on paid pulls. |
| TCG Bridge | The Windows app on the stream PC that links OBS, Twitch chat and the site. |
| Stream Deck plugin, OBS plugin | Controls for the stream PC with their own readme files. They drive actions such as pause and happy hour. |
| Queue | The pulls waiting to play on the overlay. Clear queue refunds paid ones. |
| Pause | Stops new pulls and charges. It shows a reason: "Paused now" by hand, or "Paused by scene". |
| Happy hour | A timed offer of free packs or a percent discount. |
| Pack goal | A target number of packs opened by everyone, with an optional reward. |
| Event reward | Free packs or a buff given for gifted subs, bits, a raid or a channel point redeem. |
| Channel point award | What a Twitch channel reward gives the viewer who redeems it. |

## Staff and environments

| Word | Meaning |
| --- | --- |
| Staff | Someone on the staff list: super admin, admin, or mod. |
| Sandbox | A fenced copy of the data for a test. Preview deployments are always inside one. |
| Tester | A login allowed in while Access is closed alpha or beta. Not the same as staff. |
