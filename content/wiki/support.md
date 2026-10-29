---
title: Support answers
summary: The questions viewers actually hit, and the first place to look.
order: 60
covers: app/admin/settings/AccessConfig.tsx, app/admin/staff/**, app/admin/trades/**, app/admin/stream/**, lib/pull-pause.ts
---

Work down the list. Granting a card is the last step, not the first, because a grant mints a new edition and does not repair escrow or a failed payment.

## The pull never arrived

1. [Live Activity](/admin/activity): is the pull there?
2. If it is not, check the Stream page's status strip. Packs may be paused ("Paused now" or "Paused by scene"), the viewer may be blocked from pulls, or the overlay may be offline. See [Live tools](/admin/wiki/live-tools).
3. The overlay may have ignored it. Check the overlay key, and whether "only when live" is on while OBS is not reporting the stream.
4. If paid pulls are on, a refused or unconfirmed charge takes the edition back and records no pull. The Mix It Up log, under Stream, History, says why.
5. The in-editor preview and "Don't save" do not write. A reset from the test panel does. If a stray test user appeared, it was a real write.

## They were told "Packs are paused, back soon"

Pull pausing is on, either by hand or by a scene change in TCG Bridge. Nothing was charged and nothing queued. Pulls already waiting still play. Resume from the Pulls panel on the Live section of [Stream](/admin/stream), or from [TCG Bridge](/admin/wiki/tcg-bridge), [the Stream Deck plugin](/admin/wiki/stream-deck) or [the OBS plugin](/admin/wiki/obs-plugin).

## A paid pull was refused

Open the Live feed (filter Problems) or Stream, History, Refusals only. The usual reasons are the cooldown between paid pulls, a per-role limit, a full queue, a pause, being blocked from pulls, or not enough Brie Bucks. A pull limit set on the viewer's own page (Admin tab) also counts.

## The price is not what they expected

The pack's own Price per paid pull wins, then the role price for subscribers and VIPs, then the base price. A happy hour discount applies after that, and a free happy hour makes the price 0. A plain `!pack` is charged at the price of the random pack it opens.

## A channel point reward gave nothing

Check the Channel points card under What viewers get: the reward needs an award other than None. If "Pause channel point awards" is on, redemptions are recorded but no award runs. A failed award shows in the Live feed, and a mod has to refund it by hand in Twitch's reward queue, because the site never refunds on Twitch.

## The raid shout-out did not show

It is off until switched on, and it shows once per raider per stream. Nothing shows for a raider with a private profile or no cards.

## TCG Bridge is offline

Connections on the Stream page shows it, and [TCG Bridge for the streamer](/admin/wiki/tcg-bridge) lists the fixes. Chat commands then fall back to Mix It Up if that is set up. Staff notices sent to the app while it is offline are lost, so check the Live feed for what happened.

## They have two of the same card

That is normal. Every pull is its own edition. `×N` is the count. Send them the edition page if they want a specific one.

## Cards vanished after a trade

Open [Trades](/admin/trades) and search their login. An open offer is holding the cards in escrow. A closed offer that still says escrowed is the stuck case in [Trading](/admin/wiki/trading): Data health lists it, and Return editions puts those cards back once. Cancelling an open offer refunds. Do not grant a replacement on top of escrowed cards.

## They cannot trade, or cannot accept

Use the checklist on [Trading](/admin/wiki/trading): pause switch, Block trading flag, account age, favourites, too many open offers, or a closed alpha/beta. A direct offer they were not part of will also say it is private. That is correct.

## They are missing from the leaderboard

Either they set Private profile, or staff set Hide from public boards. Private profile also hides the public profile from other people. Hiding from public boards does not. Their cards are still in the admin either way.

## They want the account deleted

They have to request it themselves (Account, Request deletion, type their login). An admin then deletes or declines from [Feedback](/admin/feedback). Taking the request back is the viewer's button, until an admin acts. Mods cannot press delete.

## Alerts never arrive

Bell notices on the site do not need extra setup. Phone alerts need the Web Push variables. Until those are set, the section is hidden in the viewer's Settings. [Settings, Environment](/admin/settings?tab=environment) shows which names are set, never the values.

A viewer can also link Discord in their Settings for direct message alerts, which needs the three Discord variables in [Environments](/admin/wiki/environments). An iPhone only gets push after they install the site as an app. A desktop browser can subscribe directly. Three "not now" taps hide the prompt.

## They cannot open the site

If Access is closed alpha or beta, they need to be on the tester list. Staff do not need to be on that list. Mods can look (`/mod/testers`). Admins add people under [Settings, Access](/admin/settings?tab=access).

## Discord did not post the listing

[Settings, Webhooks](/admin/settings?tab=webhooks): Trade listings channel, then Test. The post only happens for a new board listing, not for a direct offer, and never from a sandbox. The post is not updated when the trade ends.

## A staff member should no longer have access

[Staff](/admin/staff), remove them. You cannot remove the super admin. If they used the emergency password, turning password login off is a separate switch (`ADMIN_PASSWORD_LOGIN=off` in the host's environment). Removing a Twitch role does not delete that password.
