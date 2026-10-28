---
title: Overview
summary: What the site is, where to click, and how this wiki stays honest.
order: 0
covers: app/admin/wiki/**, lib/wiki.ts, lib/admin-nav.ts
---

The Cheesy TCG is a trading card game played live on the Cheesygidds Twitch channel. Viewers pull cards from an OBS overlay, keep them on the public site, and trade with each other. This wiki is for admins running that site. It describes what the code does today.

Press `g` then `k` from anywhere in the admin panel to come back here. The same page is in the sidebar under System, and on the dashboard header.

## Who can open it

Only an admin or the super admin. The admin layout checks the live staff list on every request, same as the rest of `/admin`. Mods stay on the mod panel (`/mod`) and do not get this nav item. A removed admin loses it as soon as their role is gone.

Signing in is the normal Twitch login. After that, a staff member with an admin role is sent through `/auth/staff` and lands in the panel. The emergency password login, if it is still switched on, counts as the super admin.

## The surfaces

- **OBS overlay.** The browser source on stream. It plays pack openings, shows a collection, and saves a pull only when the server issued a ticket for it.
- **Public site.** Home, profiles, binder, card dex, leaderboard, stats, trading, account, settings, feedback. Production is `https://cheesytcg.app`.
- **Twitch Extension panel.** The panel on the channel. It can show the season, a collection, trades and upgrades. It is a separate front end from the website.
- **Admin panel (`/admin`).** Seasons, packs, cards, assets, the Overlay Editor, Mix It Up, users, trades, feedback, prints, staff, sandboxes, settings.
- **Mod panel (`/mod`).** A smaller set: activity, viewers, trades, feedback, the tester list (read only), and the staff What's new page.

## What a viewer's data actually is

A season has one collection, stored as one blob: each Twitch login maps to a list of pulls. A repeated card is another entry in that list, on purpose. The public site shows that as a `×N` badge. Each of those entries can also be a numbered print (an edition number and a print number) once the season is tracking prints.

Packs are not owned by a season. A pack is a global deck of cards, and a season points at the packs it uses. One season is active at a time. That is the season the overlay draws from.

## How to change these pages

Each topic is a markdown file in `content/wiki/` in the repo. The title, the one-line summary and the order in the topic list are the three lines at the top of the file. Edit the file, open a pull request, and the next production deploy shows it. There is no editor inside the panel.

These pages do not list work that is only planned. If something is still an open item, it is not written up here as if viewers can already use it.

## Where to go next

- [Viewers](/admin/wiki/viewers) when someone writes in about their account, a missing card, or a restriction.
- [Cards, packs and seasons](/admin/wiki/cards) when the set itself is wrong.
- [Trading](/admin/wiki/trading) when an offer, a listing or escrow looks stuck.
- [Live tools](/admin/wiki/live-tools) for the overlay, chat webhooks, Mix It Up and the Twitch panel.
- [Moderation](/admin/wiki/moderation) for roles, feedback and the activity feed.
- [Support answers](/admin/wiki/support) for the questions that come up most.
- [Environments](/admin/wiki/environments) before you change a secret, a backup, or a deploy.
- [Glossary](/admin/wiki/glossary) when a word in the panel is unclear.
