---
title: Support answers
summary: The questions viewers actually hit, and the first place to look.
order: 60
---

Work down the list. Granting a card is the last step, not the first, because a grant mints a new print and does not repair escrow or a failed payment.

## The pull never arrived

1. [Live Activity](/admin/activity): is the pull there?
2. If it is not, the overlay may have ignored it. Check the overlay key, and whether "only when live" is on while OBS is not reporting the stream. See [Live tools](/admin/wiki/live-tools).
3. If Mix It Up is on, a refused or unconfirmed charge takes the print back and records no pull. The Mix It Up log says why.
4. The in-editor preview and "Don't save" do not write. A reset from the test panel does. If a stray test user appeared, it was a real write.

## They have two of the same card

That is normal. Every pull is its own print. `×N` is the count. Send them the print page if they want a specific one.

## Cards vanished after a trade

Open [Trades](/admin/trades) and search their login. An open offer is holding the cards in escrow. A closed offer that still says escrowed is the stuck case in [Trading](/admin/wiki/trading): Data health lists it. Cancelling an open offer refunds. Do not grant a replacement on top of escrowed cards.

## They cannot trade, or cannot accept

Use the checklist on [Trading](/admin/wiki/trading): pause switch, no-trading flag, account age, favourites, too many open offers, or a closed alpha/beta. A direct offer they were not part of will also say it is private. That is correct.

## They are missing from the leaderboard

Either they set Private profile, or staff hid them from the leaderboard. Private profile also hides the public profile from other people. Hiding from the leaderboard does not. Their cards are still in the admin either way.

## They want the account deleted

They have to request it themselves (Account, Request deletion, type their login). An admin then deletes or declines from [Feedback](/admin/feedback). Taking the request back is the viewer's button, until an admin acts. Mods cannot press delete.

## Alerts never arrive

Bell notices on the site do not need extra setup. Email needs the Resend variables. Phone alerts need the Web Push variables. Until those are set, the section is hidden in the viewer's Settings. [Settings, Environment](/admin/settings?tab=environment) shows which names are set, never the values.

An iPhone only gets push after they install the site as an app. A desktop browser can subscribe directly. Three "not now" taps hide the prompt.

## They cannot open the site

If Access is closed alpha or beta, they need to be on the tester list. Staff do not need to be on that list. Mods can look (`/mod/testers`). Admins add people under [Settings, Access](/admin/settings?tab=access).

## Discord did not post the listing

[Settings, Webhooks](/admin/settings?tab=webhooks): Trade listings channel, then Test. The post only happens for a new board listing, not for a direct offer, and never from a sandbox. The post is not updated when the trade ends.

## A staff member should no longer have access

[Staff](/admin/staff), remove them. You cannot remove the super admin. If they used the emergency password, turning password login off is a separate switch (`ADMIN_PASSWORD_LOGIN=off` in the host's environment). Removing a Twitch role does not delete that password.
