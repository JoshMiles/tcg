---
title: Overview
summary: What the site is, where to click, and how this wiki stays honest.
order: 0
covers: app/admin/wiki/**, lib/wiki.ts, lib/admin-nav.ts, app/mod/ModNav.tsx
---

The Cheesy TCG is a trading card game played live on the Cheesygidds Twitch channel. Viewers pull cards from an OBS overlay, keep them on the public site, and trade with each other. This wiki is for staff running that site. It describes what the code does today.

Press `g` then `k` from anywhere in the admin panel to come back here. The same page is in the sidebar under System, and on the dashboard header. Mods read the pages meant for them at `/mod/guide`.

## Who can open it

Only an admin or the super admin. The admin layout checks the live staff list on every request, same as the rest of `/admin`. Mods stay on the mod panel (`/mod`) and do not get this nav item. A removed admin loses it within about 15 seconds.

Signing in is the normal Twitch login. After that, a staff member with an admin role is sent through `/auth/staff` and lands in the panel. The emergency password login, if it is still switched on, counts as the super admin.

## The surfaces

- **OBS overlay.** The browser source on stream. It plays pack openings, shows a collection, and saves a pull only when the server issued a ticket for it.
- **Public site.** Home, profiles, binder, card dex, leaderboard, stats, trading, account, settings, feedback. Production is `https://cheesytcg.app`.
- **Twitch Extension panel.** The panel on the channel. It can show the season, a collection, trades and upgrades. It is a separate front end from the website.
- **TCG Bridge.** A Windows app on the stream PC that links OBS, Twitch chat and this site. It has its own staff notices and a few staff tools, and it is paired from the Stream page.
- **Stream Deck plugin and OBS plugin.** Extra controls for the stream PC. They have their own readme files in the repository and drive the same actions as the Stream page.
- **Admin panel (`/admin`).** The sidebar groups are below.
- **Mod panel (`/mod`).** A smaller set, below.

### Admin panel

| Group | Pages (key after `g`) |
| --- | --- |
| Overview | Dashboard (`d`), Live Activity (`a`), What's new (`w`) |
| Game | Seasons (`s`), Packs (`p`), Buff Editor (`r`), Achievement Editor (`l`), Assets (`e`), Overlay Editor (`o`), Stream (`m`) |
| Community | Users (`u`), Trades (`t`), Feedback (`i`), FAQ Editor (`q`), Editions (`n`) |
| System | Staff (`f`), Staff wiki (`k`), Sandbox (`b`), Settings (`c`) |

Settings has tabs in this order: OBS Overlay, Scoring, Webhooks, Access, Twitch & viewers, Environment, About.

### Mod panel

Overview, Activity, Viewers, Trades, Feedback, Guide, Testers and What's new. The Overview carries a read-only stream desk strip (Overlay, Stream, Pulls and Pull queue). Its "Pulls: Paused" reflects only the "only when live" switch, not the Pause pulls button on the Stream page.

## What a viewer's data actually is

A season has one collection, stored as one blob: each Twitch login maps to a list of pulls. A repeated card is another entry in that list, on purpose. The public site shows that as a `×N` badge. Each entry is an edition of that card. Once the season is tracking them, an edition has an edition number (its place among editions of that card and version) and a serial number (its unique id across the whole game).

Packs are not owned by a season. A pack is a global deck of cards, and a season points at the packs it uses. One season is active at a time. That is the season the overlay draws from.

## How to change these pages

Each topic is a markdown file in `content/wiki/` in the repo. The title, the one-line summary, the order and the code it covers are the lines at the top of the file. Edit the file, open a pull request, and the next production deploy shows it. There is no editor inside the panel.

These pages do not list work that is only planned. If something is still an open item, it is not written up here as if viewers can already use it.

## Where to go next

- [Viewers](/admin/wiki/viewers) when someone writes in about their account, a missing card, or a restriction.
- [Cards, packs and seasons](/admin/wiki/cards) when the set itself is wrong.
- [Trading](/admin/wiki/trading) when an offer, a listing or escrow looks stuck.
- [Live tools](/admin/wiki/live-tools) for the Stream page, paid pulls, the overlay, chat commands and the Twitch panel.
- [Moderation](/admin/wiki/moderation) for roles, feedback and the activity feed.
- [Support answers](/admin/wiki/support) for the questions that come up most.
- [Environments](/admin/wiki/environments) before you change a secret, a backup, or a deploy.
- [Glossary](/admin/wiki/glossary) when a word in the panel is unclear.
