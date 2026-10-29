---
title: Moderation
summary: Who is staff, what a mod may touch, and where reports go.
order: 50
covers: app/admin/staff/**, lib/staff.ts, app/admin/settings/AccessConfig.tsx, app/mod/**
---

## Roles

Staff sign in with Twitch, the same button as a viewer. The role comes from [Staff](/admin/staff), matched by Twitch id once they have signed in, so a renamed login does not keep access.

| Role | What they open |
| --- | --- |
| Super admin | Both panels. The owner, by Twitch id. Cannot be removed or edited. Can add and remove admins. |
| Admin | Both panels. Can add, change, and remove mods. Cannot change other admins. |
| Mod | The mod panel only. An admin URL sends them to `/mod`. |

The emergency password, if `ADMIN_PASSWORD_LOGIN` is not `off`, signs in as the super admin and shows as "(password)". Leave it off once Twitch staff login is working, unless you still want a break-glass door.

Removing someone stops their changes immediately, because every change re-reads the staff list. The staff record is cached for 15 seconds per server, so a page on another server can show the old role for up to that long. The staff cookie itself lasts an hour and is only renewed while the role is still valid. Logging out of the panel also sets a 12-hour marker that stops the cookie being renewed.

A [TCG Bridge](/admin/wiki/tcg-bridge) PC signed in with Twitch gets its tools from the same role: a mod PC can pause trading, block and unblock viewers and switch scenes, and read state, users, activity and a viewer. Gifts, grants and test pulls are admin-only. See [Live tools](/admin/wiki/live-tools).

The public site shows a purple Admin panel or Mod panel button only to people on this list. It is a shortcut. The panel checks again.

## What mods may do

The mod panel has Overview, Activity, Viewers, Trades, Feedback, Guide, Testers and What's new. The Overview has a read-only stream desk strip (Overlay, Stream, Pulls and Pull queue). The Guide shows the wiki pages written for mods.

Mods can look up viewers, set tags and the two restrictions (Block trading and Hide from public boards), cancel and refund a trade, and reverse a completed trade when the editions can still move. They can read the live activity feed, the feedback inbox, and the tester list.

They cannot grant cards, delete a viewer, merge, take or restore a snapshot, change packs or seasons, run the Stream page, open settings, manage staff, or finish a deletion request. Those actions check for an admin even if someone builds a request by hand.

## Feedback and reports

[Feedback](/admin/feedback) holds suggestions, problem reports, user reports, and deletion requests. Mods have the same inbox at `/mod/feedback`. Changing a status can notify the sender. Resolved items are deleted after the retention shown on that page.

A user report is filed from a profile. It names that login. Open the viewer from the report before you restrict them, and say why in the restriction reason so the next person on shift can see it.

Deletion requests are the exception: answering them is admin-only. See [Viewers](/admin/wiki/viewers).

## Activity

[Live Activity](/admin/activity) is the stream of pulls, upgrades, trades, grants, and staff actions. Mods get a read-only copy. A staff action names the staff login. A viewer's own pull does not, even when that viewer is also staff.

Use it to answer "did the pull happen?" before you grant anything. A pull that was rolled and saved is here, with the card, the version, and whether it was new for them.

## Closed alpha and beta

[Settings, Access](/admin/settings?tab=access) can leave the site open, or lock it to alpha testers, or to alpha and beta testers. Staff always get in. The legal pages and the login page stay open either way. The FAQ is not exempt: it locks with the site.

Adding a tester can also grant the matching achievement, and it sticks after you remove them from the list. Mods can read who is on the list (`/mod/testers`) and cannot edit it. The cap is 500 testers.

A banner label (none, alpha, beta) is separate from the lock. You can show a beta banner while the site is open, or lock the site without leaning on the banner.
