---
title: Twitch connection
summary: Connecting the channel, channel point awards and pausing them, refunding by hand, chat commands and the bot account.
order: 42
covers: app/admin/stream/TwitchChannelCard.tsx, app/admin/stream/ChannelPoints.tsx, app/admin/stream/twitch/**, app/admin/stream/twitch-bot/**, lib/twitch-*.ts, lib/bridge-chat*.ts, app/api/bridge/twitch-*/**, app/api/bridge/chat-commands/**
---

The site can listen to the Cheesygidds channel through [TCG Bridge](/admin/wiki/tcg-bridge): channel point redemptions, bits, gifted subs, raids and chat commands. This is separate from how staff and viewers sign in to the site. It needs one admin to connect the channel once.

## Connect the channel

1. Open [Stream](/admin/stream), Connections, and pick **Twitch channel**.
2. Press **Connect Twitch channel** (admins only). Twitch asks the account to allow reading redemptions, bits, subscriptions and chat. Allow it.
3. The card then says "Connected as (login) since (date), by (admin)", and lists what was allowed.

Any Twitch account works, so a spare account can be used to test. When it is not the live channel the card says "Testing on (login), not the live channel". A test account's redemptions run awards too, but it never takes over from Mix It Up for bits, gifted subs and raids.

If the button is missing, the card says which secrets the site lacks. They are listed in [Environments](/admin/wiki/environments).

Under the connection the card shows whether TCG Bridge is listening ("Listening as ..."), a list of recent Twitch events, and **Disconnect** (it takes two presses). If Twitch ever rejects the stored sign-in, the site disconnects by itself and sends a staff notice "Twitch channel disconnected"; connect it again.

TCG Bridge on an admin's PC must be running for any of this to work. Only an admin PC listens to the channel.

## Channel point awards

On the Stream page, What viewers get, the **Channel points** card lists the channel's rewards as they exist on Twitch. The site creates no rewards of its own. Give each reward an award:

- **None** (the default),
- **Open a pack** (a free pack for the viewer who redeemed it),
- **Show the viewer's best card** on the overlay,
- **A buff**,
- **Start a happy hour** (minutes, and free packs or a percent off).

Press Save. The award follows the reward even if you rename it on Twitch. A reward with no award is ignored. Each award writes a line in the Mix It Up log, and the result appears in the Live feed and in the recent events list. The "only when live" overlay switches still apply.

### Pausing awards

Use **Pause channel point awards** when you do not want awards to run, for example during a giveaway. It is on the Live section of the Stream page (Pulls panel), on TCG Bridge's Home page (**Pause channel point awards**, also in the tray menu), and as the **Awards** button in the OBS plugin. While paused, redemptions are still recorded and say "awards paused", but nothing runs. It changes nothing on Twitch. Viewers' points are still spent, so refund them by hand if needed (below).

### Refunds by hand

The site never fulfils or refunds a redemption on Twitch, because Twitch only lets the app that created a reward do that. When an award fails (no packs, a buff already active, a happy hour already running, a viewer with no cards) the Live feed shows it and a staff notice says "Refund (viewer)'s (reward) by hand". It is sent at most once a minute. A mod or the streamer then opens the reward queue on Twitch and refunds the redemption there.

## Bits, gifted subs and raids

While the live channel is connected and TCG Bridge is listening, bits, gifted subs and raids come from Twitch, not from Mix It Up. The Event rewards card settings (packs per sub, bits per pack, raid size, the cap of 10 packs) apply to both, and the raid shout-out runs once. Mix It Up's own event commands answer "ignored" while Twitch delivers, so nothing counts twice. If TCG Bridge is off, or the connection drops, they work as a fallback. See [Live tools](/admin/wiki/live-tools) for the rewards themselves.

## Chat commands

With chat allowed, commands such as `!pack` and `!showoff` and the switched-on commands from the Chat commands card run from Twitch chat through TCG Bridge. TCG Bridge looks only at the first word of each message; every other message is dropped on the PC and never stored. The site runs the command, checks the viewer's role from their Twitch badges and posts the reply. While this works the Chat commands card says commands now come through TCG Bridge and the Mix It Up copies are only a fallback.

A channel connected without chat permission shows "Reconnect to allow chat". Press it and allow again. Everything else keeps working in the meantime.

TCG Bridge shows "Chat commands: N commands, through TCG Bridge" on its Twitch connection when it is working.

## The bot account

Replies go out as the channel account by default. To use another account:

1. On the same card, under Chat replies, press **Connect bot account** and sign in with the bot's Twitch account.
2. Set **Reply as** to **Bot**. The option stays greyed out until a bot is connected.

**Connect another bot account** replaces it, and **Disconnect bot** removes it (two presses). Messages the bot posts itself are never treated as commands.

## If it stops working

| Where you see it | What to do |
| --- | --- |
| "Not connected" on the card | Press **Connect Twitch channel**. |
| "Twitch channel disconnected" notice | Connect again; Twitch rejected the old sign-in. |
| "Reconnect to allow chat" | Press it; chat commands are off until you do. |
| Awards do nothing | Check awards are not paused and the reward has an award. See the Live feed. |
| TCG Bridge says "Twitch events need attention" | Open the Twitch channel connection in the app for the reason. |
