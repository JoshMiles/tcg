---
title: Live tools
summary: The overlay, chat webhooks, Mix It Up, and the Twitch panel.
order: 40
---

## The overlay

The OBS browser source is the address under [Settings, OBS Overlay](/admin/settings?tab=overlay), or the copy button in the sidebar. It ends in `?key=...`. That key is how the overlay is allowed to take the pull queue, report a collection, and check in. A staff member who is signed in can preview without the key. Everyone else needs it.

After you make a new key, every OBS source needs the new address, then a cache refresh (right-click the browser source, refresh the cache). Old addresses stop working on purpose.

The Overlay Editor (`/admin/overlay`) is the layout and the look: stage size, where the pack opening and the collection sit, scenes (one URL per OBS scene), and the animation properties. A preview inside the editor does not touch the queue, does not save pulls, and does not play sound.

Two switches, on the same settings tab, limit pulls or "show collection" to when OBS says the stream is live. If OBS was not given permission to read stream status, those switches see "not live" and will drop events. The connection pill then only says connected, not streaming.

The dashboard can gift a pack, show a collection, or grant a card into the queue. If no overlay is connected it asks before queueing, so events do not pile up unseen. Clear the queue from there when a test stuck.

The on-stream test panel can reset a collection. Those buttons write real data, and they only work from a browser that is signed in as an admin. "Don't save" and the editor preview do not write. A normal pull on the production overlay does write, once, against its ticket.

## Chat webhooks

Incoming webhooks (pull, show a card, show a collection, grant a card, chat commands) share one secret. It is generated the first time the settings are opened and shown under [Settings, Webhooks](/admin/settings?tab=webhooks). The bot (Mix It Up or similar) sends it in the JSON body with the viewer's login.

A pull webhook asks the server to roll a card and queue it. It does not pick the card. A grant webhook does pick a card number and a version, and adds that print. Treat the grant URL like a password: anyone with the secret can mint cards.

Outgoing webhooks and Discord channels are on the same tab: card pulled, collection shown, trade listings, admin log, system, recap, feedback. Use Test on each channel. Sandboxes never call out. A Discord post that never arrives is almost always a missing channel, a failed test, or a sandbox, not a silent viewer.

There is no "link your Discord account" step for viewers. Direct messages are not a feature of the site.

## Mix It Up paid pulls

[Mix It Up](/admin/mixitup) can charge a channel currency before a pull counts. It stays off until you fill in the webhook, check the balance, send a test, and switch it on. While it is on, a refused payment queues nothing. If the charge is not confirmed after the pull is saved, the print is taken back and nothing is recorded as a pull.

Paid pulls do not run inside a sandbox. Try the form's buttons there, and try a real charge on production only when you mean to.

## The Twitch panel

The panel viewers see inside Twitch is served by Twitch from a packaged zip, pointed at this site's `/api/twitch` routes. Login uses Twitch's own identity. There is no username box.

What that installed panel can do is the released zip, not every page of the website. Website trades can name exact prints. The current panel cannot. A trade made on the website can look slightly different in the panel until a later panel release. Do not promise panel features that are not in the live zip.

Panel changes only reach people after a production deploy, and Twitch can keep the old file for a while. The build stamp in the corner of the panel (`/api/version`) is how you tell which deploy they have.
