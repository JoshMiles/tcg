---
title: The Stream Deck plugin
summary: Installing the plugin from TCG Bridge and what each of its keys does.
order: 43
covers: streamdeck/**, bridge/src/deck*.ts
---

The plugin puts the stream controls on Elgato Stream Deck keys. It does not talk to the site itself. It talks to [TCG Bridge](/admin/wiki/tcg-bridge) on the same PC, and TCG Bridge does the work, so every key runs the same code as the Home page and the Stream page, and the site's activity log names TCG Bridge.

## Install

You need the Stream Deck app, version 7.1 or newer, installed on the stream PC.

1. In TCG Bridge open Setup, Connections, **Stream Deck plugin**, and press **Install Stream Deck plugin**. It switches the link on and hands the plugin to the Stream Deck app, which installs it.
2. The connection shows "connected" once the plugin starts. Drag keys from the **TCG Bridge** group onto your deck.

If it says "Stream Deck app not found", install the Stream Deck app first. After a TCG Bridge update the same connection may offer **Update the Stream Deck plugin**; press it so the plugin matches the app.

If the plugin is installed but not talking to the app, the status pill reads "Stream Deck plugin installed but not linked" and the connection says why (the link switch is off, or the plugin has not connected). The plugin's version is always TCG Bridge's version.

## The keys

There are seventeen. A key that your account may not use shows "Staff only" (not a staff PC) or "Admins only" (a mod PC).

| Key | What it does |
| --- | --- |
| **Buff** | Pick any Stream Deck buff or quick action in its settings and fire it. |
| **Last buff again** | Fires the last buff again. |
| **Pause pulls** | Pauses or resumes pulls. It shows paused, including a pause made by an OBS scene. |
| **Happy hour** | Starts a happy hour (three presets, or custom in its settings). While one runs the key counts down; hold it for 1 second to end it. |
| **Test pull** | Plays a test pull on the overlay. Admin staff PC only. While OBS is live it reads "Test pull LIVE" and needs a 1 second hold. |
| **Show a card** | Shows a card of the viewer named in its settings on the overlay. Leave the card empty and the site picks one. Admin staff PC only; the same live hold applies. |
| **Show last pull** | Shows the card pulled most recently this stream on the overlay, as the copy its viewer pulled. Nothing to set. Admin staff PC only; the same live hold applies. |
| **Show last big pull** | The same, for the most recent pull of 4 stars or more (the same rule as the Last big pull stat). |
| **Stat** | A display. Pick in its settings: queue length, packs this stream, pack goal progress, last big pull, top puller or happy hour time left. A queue Stat key skips the next pull if pressed twice within 3 seconds. |
| **Skip next pull** | Skips the next pull in the queue. A paid pull is refunded. |
| **Clear queue** | Hold for 1 second to clear the whole queue. Paid pulls are refunded. A short press shows "Hold 1 second to clear". |
| **Pulls waiting** | Shows how many pulls are queued ("Waiting 3"). Does nothing when pressed. |
| **Pause trading** | Staff PC only. Shows whether trading is open or paused. Press to open it; hold for 1 second to pause it. |
| **Switch scene** | Staff PC only. Switches OBS to the scene picked in its settings, and lights while that scene is on air. |
| **Preview overlay** | Admin staff PC only. Opens TCG Bridge's Preview overlay window. |
| **Refresh overlay** | Refreshes the overlay browser source in OBS, the same as the overlay refresh button on the Stream page. |
| **Run checklist** | Runs the go-live checklist and then shows the result until the next run: "Checklist 8/8 OK" in green, or "Checklist 2 failing" in red. |

The hold keeps a key from firing by accident: ending a happy hour, clearing the queue, pausing trading and anything that plays on the live overlay all need a 1 second hold. A refused press shows the alert on the key, and the reason is in TCG Bridge's log. Buff keys show only the buff name; they do not show whether a buff is active.

## Buttons without the plugin

TCG Bridge's **Buttons and hotkeys** page has a second way to use a Stream Deck: a list of web addresses with **Copy**, which you paste into a "Website" action with "GET request in background". They keep working next to the plugin. The Stream page's Stream Deck buffs card is the separate list of Mix It Up commands for buffs.
