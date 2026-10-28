---
title: Viewers
summary: Look someone up, restrict them, give a card back, and handle a deletion request.
order: 10
covers: app/admin/users/**, app/admin/feedback/**, lib/user-admin.ts
---

Viewers are Twitch logins. The admin list is [Users](/admin/users). The same person, with fewer buttons, is on the mod panel at `/mod/users`.

## Find them

Search matches the login. Filters cover tags, a completed set, a shiny, a restriction, and notes. The row opens their page. "Last active" comes from the latest activity, not from Twitch being online.

A viewer with no cards and no profile has no page. Pulling a card creates the collection entry. Logging in on the website creates the profile.

## Their page

`/admin/users/<login>` shows:

- Overview counts, tags, and a note only staff can see.
- A timeline of their activity.
- Their trades, with cancel and refund.
- One grid per season. Owned cards show the art and a `×N` when they hold more than one. A hover remove takes a single print, not the whole stack.
- Grant a card into a season, including more than one at a time.
- Compare with another viewer (`?compare=`).
- Moderation flags, restore points, merge, the audit trail, and a danger zone.

The mod page reuses the restriction, tag and trade parts. It does not grant cards, merge, restore, or delete.

## Restrictions

Two flags, set from the moderation panel:

- **No trading.** They cannot offer, accept, or be offered to. Cancelling an existing offer still works. Use this for a bad actor, not for a paused season (that switch is on [Trades](/admin/trades)).
- **Hide from leaderboard.** They drop off the leaderboard, card owner lists, and recent pulls. Their own collection page still loads.

Both record who set them. The public profile does not show the staff login.

A viewer can also set **Private profile** in their own Settings. That hides their profile page from everyone else and leaves them off the public leaderboard, owner lists and recent pulls. Staff still see them in the admin. Private profile is their choice. Hide from leaderboard is yours.

## Restore, merge, reset, delete

Before a reset, a delete, a merge, or a restore, the panel takes a restore point: the newest six are kept, for 14 days. Restoring puts those season collections back and takes a point of whatever it overwrites, so you can undo the undo.

**Merge** moves one viewer's cards onto another login, unions the tags, and deletes the old profile. It refuses while either person has an open trade. Settle or cancel those first.

**Reset all seasons** wipes their collection entries and leaves the profile. **Delete user** wipes the collections and the profile. Both are in the danger zone and are admin-only.

Prefer a restore point over re-granting cards by hand. A grant mints new prints. A restore puts the old ones back.

## Deletion requests

A viewer asks from their account page (Request deletion) and must type their login. The request lands in [Feedback](/admin/feedback) as a deletion, and they can take it back while it is still waiting.

Only an admin can delete the account or decline the request. Mods can open feedback, but the delete and decline actions check for an admin. Do not delete someone from the user page and also leave the request open: use the buttons on the request so the viewer is told what happened.

## What staff did

Actions on a viewer write an audit line (who, on their page) and, when it is something staff caused, an activity line with the staff login. Viewers never see that login on their public profile, in Discord, or on a trade page.
