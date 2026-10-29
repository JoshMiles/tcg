---
title: Live tools
summary: The Stream page, paid pulls, happy hour, pauses, event rewards, channel points, the overlay and the Twitch panel.
order: 40
covers: app/admin/stream/**, lib/stream-page.ts, lib/stream-connections.ts, lib/viewers-cards.ts, lib/pull-pause.ts, app/admin/settings/OverlayPanels.tsx, app/admin/settings/WebhookConfig.tsx, lib/mixitup.ts
---

Everything you run during a stream is on [Stream](/admin/stream) (press `g` then `m`). Older addresses such as `/admin/mixitup` and the old setup pages now send you there. TCG Bridge, the Stream Deck plugin and the OBS plugin are separate programs that run on the stream PC. They work with the same settings and are named below where they matter.

## The Stream page

Five sections, picked with `?section=` in the address: **Live**, **What viewers get**, **Connections**, **Test** and **History**. There are no sub-tabs inside them. A status strip sits at the top of every section and says "All good" or "N things need you". Each item in it links to the place that fixes it.

### Live

The panels you use while on air:

- **Pulls.** Pause pulls, with a "say it in chat" switch. Pause channel point awards (see below). Extra pulls this stream, which gives everyone more pulls until the stream ends.
- **Happy hour.** Set Minutes, then Kind (Free packs or Discount) and, for a discount, Percent off. The button reads Start happy hour, or Replace happy hour if one is running. End now stops it.
- **Community pack goal.** Set Packs (how many must be opened), a Label, and a Reward: None, Community buff, or Extra pulls this stream. The button is Set goal, or Replace goal if one is running. Clear goal removes it. A community buff comes from the [Buff Editor](/admin/buffs).
- **Queue.** The pulls waiting to play. Clear queue empties it and refunds anyone who paid. There is no Skip on the website: skipping the pull on screen is done in TCG Bridge or the OBS plugin.
- **Blocked from pulls.** Viewers staff stopped from pulling, each with a Lift button.
- **Overlay.** A refresh button for the overlay. It only appears while TCG Bridge is paired.
- **This stream.** Paid pulls, Currency taken, Added back, Commands run and Refused.
- **Live feed.** Every pull, request and event, with filters All, Pulls, Requests, Events and Problems.

### What viewers get

A "Mix It Up commands" helper sits on top (it lists the commands to create in Mix It Up). Below it are nine cards, each with an On or Off pill and its own Save, Discard and an unsaved marker. A card saves on its own, so saving one never touches the others. `?card=` opens a specific card.

1. **Paid pulls.** Charge for pulls, Price per pack, a fallback limit with per-role limits (regular, subscriber, VIP, moderator, broadcaster), a per-role price for subscribers and VIPs, Cooldown between paid pulls (seconds), Queue cap, the message sent to Mix It Up with the payment, and the chat replies.
2. **`!pack` packs.** Viewers type `!pack` and a pack name to pick what they open.
3. **Event rewards.** Gifted subs (one pack per sub), Bits (bits per pack, default 500), Raid (raid viewers needed per pack, default 1) and Channel point redeem. The reward is Free packs or A buff, up to 10 packs per event.
4. **Raid shout-out.** Shows the raider's best card (see below).
5. **Channel points.** Which award each Twitch channel reward gives.
6. **Stream start and end.** The chat lines TCG Bridge posts when the stream starts and ends.
7. **Big pull rules.** What happens on stream when a viewer pulls a rare card: a Mix It Up command (a sound, lights, a chat line) and OBS actions (a clip, a scene, a source) per rule.
8. **Chat commands.** Commands viewers can type in chat, such as `!showoff` and `!stats`.
9. **Stream Deck buffs.** Read-only. Buttons that apply a buff, give extra pulls or a free pack, each one a Mix It Up command you download from the helper. A buff is switched on in the Buff Editor.

### Connections

Six connections, each with a status and what to do next: TCG Bridge, Mix It Up, OBS, Twitch channel, Command check and Error reports. Two safety panels sit here too: **Overlay watchdog** (off until you switch it on) and **Brie Bucks safety**.

### Test

A pre-stream checklist, then **Test pulls** (they use test viewers; the edition is kept apart and counts nowhere), **Quick tests** (Check balance for any viewer, where blank means the streamer, and Send test message) and **Test viewers**.

### History

The Mix It Up log with filters All, Incoming, Outgoing and Refusals only, the last Brie Bucks check, Uptime, and a note that Brie Bucks backups are kept by TCG Bridge on the stream PC. The site records no backup runs of its own.

## Paid pulls and prices

Charging stays off until the Mix It Up connection is filled in, a balance check works, a test message goes through and you switch it on. While it is on, a refused payment queues nothing. If the charge is not confirmed after the pull is saved, the edition is taken back and nothing is recorded as a pull.

The price a viewer pays is chosen in this order:

1. The pack's own price: open the pack, Pack settings, Details, **Price per paid pull**.
2. Otherwise the role price (subscriber or VIP).
3. Otherwise the base Price per pack.

A happy hour then adjusts that price. A free price is 0. A plain `!pack` opens a random pack and charges that pack's price. A pull can also be refused for the cooldown, a per-role limit, a full queue, a block or a pause. The refusal and its reason show in the Live feed and in History.

Paid pulls do not run in a sandbox. Use the Test section there, and try a real charge on production only when you mean to.

## Pauses and blocks

A pause shows its reason. A manual pause shows "Paused now". A pause set by TCG Bridge for an OBS scene shows "Paused by scene: (name)". A hand pause is never lifted by a scene change. While paused, `!pack` and paid pulls answer "Packs are paused, back soon", queue nothing and charge nothing. Pulls already waiting still play. If "say it in chat" is on, resuming posts "Packs are open again: type !pack".

"Pause channel point awards" is separate: redemptions are still recorded but no award runs.

Event rewards are free packs. They ignore the charge, the limits, the cooldown, pauses and blocks.

## Raids and channel points

**Raid shout-out.** When a raider arrives, the overlay shows their best card as "Raid from (name)" and chat gets one line. Nothing shows for a private profile or a raider with no cards. It happens once per raider per stream, and it is off until you switch it on.

**Channel points.** Each channel reward that already exists on Twitch can be given an award: None, Open a pack, Show the viewer's best card, A buff, or Start a happy hour. The list is read from Twitch. If an award fails, the Live feed shows it and a staff notice asks a mod to refund the redemption by hand in Twitch's reward queue. The site never fulfils or refunds a redemption on Twitch. While the Twitch channel is connected and any reward has an award, the Mix It Up Redeem event is ignored, so nothing runs twice.

## Chat commands through TCG Bridge

The Twitch channel connection lives under Connections: Connect Twitch channel, Disconnect, and "Reconnect to allow chat" if chat permission is missing. Chat replies go out as the channel account, or as an optional bot account (Connect bot account, Disconnect bot). Recent Twitch events are listed on the same card. It needs the Twitch and backup secrets listed in [Environments](/admin/wiki/environments).

While that connection is live and allowed to chat:

- The pull (without an event), show-a-card and chat-command webhooks answer "ignored" with the reason `from_twitch`.
- Bits, gifted subs and raids from Twitch replace the Mix It Up event commands.
- Roles for limits and prices come from Twitch badges.

Mix It Up commands stay as a fallback for when that connection is down.

## TCG Bridge on the stream PC

TCG Bridge is the Windows app that sits between OBS, Twitch and this site. Each paired PC is listed under Connections with an Unlink button. When it is signed in with Twitch, its permissions come from the account's role:

- A mod PC can pause trading, block and unblock viewers and switch scenes, and read state, users, activity and a viewer.
- Admin-only: gift, show a collection, show a card, preview URL, test pull, grant, extra pulls for the stream, back up now, and the cards and search reads.
- The Connections card shows "Signed in as (login) (role)" and "Staff tools on this PC: from (role)".
- Preview overlay window is a read-only preview that lasts 2 hours and never saves.
- Staff notices arrive as Windows notifications. One sent while the app is offline is lost.
- Back up now and Search the admin are in the app.

The Stream Deck plugin and the OBS plugin are described in their own readme files in the repository. They drive actions from the Live section, such as pause, happy hour and extra pulls.

## The overlay

The OBS browser source is the address under [Settings, OBS Overlay](/admin/settings?tab=overlay), in the "Browser source" panel, or the copy button in the sidebar. It ends in `?key=...`. That key lets the overlay take the pull queue, report a collection and check in. A signed-in staff member can preview without the key. Everyone else needs it.

"Make a new overlay key?" replaces the key. Every OBS source then needs the new address and a cache refresh (right-click the browser source, refresh the cache). Old addresses stop working on purpose.

Other panels on that tab: **Connection** (the overlay checks in every 10 seconds), **Only when live** (switches that limit pulls or "show collection" to when OBS says the stream is live) and **Bot / channel points** (custom JavaScript for advanced setups). If OBS was not given permission to read stream status, the switches see "not live" and drop events, and the connection pill only says connected.

The [Overlay Editor](/admin/overlay) sets the layout and look: stage size, where the pack opening and the collection sit, scenes (one URL per OBS scene) and animation. Its preview does not touch the queue, save pulls or play sound.

The dashboard can gift a pack, show a collection or grant a card into the queue. If no overlay is connected it asks first, so events do not pile up unseen. The on-stream test panel can reset a collection. Those buttons write real data and only work from a browser signed in as an admin.

## Webhooks and Discord

Incoming webhooks (pull, show a card, show a collection, grant a card, chat commands) share one secret under [Settings, Webhooks](/admin/settings?tab=webhooks). The bot (Mix It Up or similar) sends it in the JSON body with the viewer's login. A pull webhook asks the server to roll a card and queue it. A grant webhook picks a card number and version and adds that edition, so treat the grant URL like a password. The section above says when the pull, show-card and chat webhooks answer "ignored".

Outgoing webhooks and Discord channels are on the same tab: card pulled, collection shown, trade listings, admin log, system, recap and feedback. Use Test on each. Sandboxes never call out. A Discord post that never arrives is almost always a missing channel, a failed test or a sandbox.

## The Twitch panel

The panel viewers see inside Twitch is served by Twitch from a packaged zip pointed at this site's `/api/twitch` routes. Login uses Twitch's own identity, with no username box. It shows what the released zip can do, not every website page. Website trades can name exact editions and the panel cannot, so a trade can look slightly different there until a later release. Panel changes only reach people after a production deploy, and Twitch can keep the old file for a while. The build stamp in the panel's corner (`/api/version`) shows which deploy they have.
