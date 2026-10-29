---
title: TCG Bridge for the streamer
summary: Installing the app on the stream PC, signing in with Twitch, updates, the checklist, OBS stats and what to do when it complains.
order: 41
covers: bridge/**, app/bridge/**, lib/bridge*.ts, app/api/bridge/**, app/admin/stream/BridgeCard.tsx
---

TCG Bridge is a small Windows app for the stream PC. It sits in the tray and links four things: Mix It Up (which only listens on that PC), OBS, Twitch and this site. The site asks it to take or give Brie Bucks, post a chat line or switch a scene, and it reports back what is live. The [Live tools](/admin/wiki/live-tools) page says what the site does with it. This page is about the app itself. Mods use a smaller version, described on their own guide page.

The app has its own version number. The About page in the app shows the one that is running.

## Install

1. Open [Stream](/admin/stream), Connections, **TCG Bridge**, and press **Download TCG Bridge**. It opens the newest release on GitHub. Run `TCG-Bridge-Setup-<version>.exe`.
2. The installer is not code-signed, so Windows SmartScreen says it "protected your PC". Press **More info**, then **Run anyway**.
3. In Mix It Up switch the Developer API on: Services, Developer API, **Connect**.
4. In the app press **Sign in with Twitch** (below).

The app starts with Windows and lives in the tray. Closing the window only hides it; quit from the tray menu. The window remembers its size and place.

## Sign in with Twitch

The Connect screen is the whole window until the PC is signed in.

1. Press **Sign in with Twitch**. The app shows a code ("Check the site shows this code: ABC123") and opens the site in your browser.
2. Sign in with Twitch if the site asks, check the code matches, and press **Allow**. The app carries on by itself. It waits up to 10 minutes; **Cancel** stops it.
3. The account must have a staff role on the site. Anyone else is refused with "This account has no staff role on the TCG site".

What the PC may do comes from that account's role, and the site re-reads the role about once a minute. An admin or the super admin gets everything. A mod gets less (see the mods page). If the role is removed, the window says "This PC was signed out on the site" with a **Sign in with Twitch** button.

If the sign-in fails the app shows the reason with **Try again**. "That sign-in took too long" means nobody pressed Allow in time. A lost connection only adds a quiet note while the app keeps checking.

**Use a pairing code instead** is the older way: on the Stream page press **Pair TCG Bridge**, type the code into the app (it works once and lasts 10 minutes). A PC paired this way has a **Staff tools on this PC** switch on the Stream page. A PC signed in with Twitch has no switch: its role decides, and the card reads "Signed in as (login) (role)".

**Sign out** and **Unpair** are on the TCG account connection and take two presses. **Unlink** on the Stream page removes a PC from the site's side. Use it for a PC you no longer use.

## The window

The sidebar has these groups:

- **Live:** Home.
- **Stream tools:** Controls, Feed and history.
- **Staff:** Viewers and cards, This stream (only on a staff PC).
- **Setup:** Connections, Overlay and OBS, Buttons and hotkeys, Notifications, App.
- **About:** version, updates and What's new.

The pill in the title bar says "All good" or "N things need you". Press it for the list; each row has a button that fixes it or opens the right connection.

**Home** is what you use on air. On the left, **Pulls** (Open or Paused, with **Pause pulls** / **Resume pulls**), **Channel point awards** (**Pause channel point awards**, which stops awards but still records redemptions), **Happy hour** (three presets, **Custom...** and **End now**) and **Pull queue** (**Skip next**, **Clear queue**; a skipped or cleared paid pull is refunded). On the right, a **This stream** strip, the **Live feed** with filters All, Pulls, Events and Jobs, and **Ready to go live**.

## Updates

Every start opens a small start-up window that checks for a new version, downloads it and installs it. With no internet it starts anyway, and the pill shows "Couldn't check for updates" with **Try again**.

While the app runs it checks every 6 hours. A new version is not installed behind your back: the pill shows "Update x.y.z is ready" with **Restart**, and the About page offers **Restart to update** (also in the tray menu). The next start installs it. After an update a note says "Updated to x.y.z" with **See what changed**, and the About page lists the release notes under **What's new**. **Check for updates** on the About page checks now. Do not update in the middle of a stream.

## The checklist

**Ready to go live** on Home (and **Run checklist** on the Connections page, and Checklist in the tray) looks at everything at once. Each line is green or red with the reason in words:

- the site answers;
- Mix It Up is found, the chosen currency exists and a balance can be read;
- OBS (grey "Not used" when Talk to OBS is off);
- the TCG overlay is in the scene on air and visible;
- there is an active season and packs that can be opened;
- the pull queue is empty and pulls are not paused;
- Twitch (green when the app is listening to the channel; grey when no channel is connected);
- the happy hour (shown, never red) and the Mix It Up commands the site expects.

It changes nothing: no chat message and no charge. The site shows the last result on the Stream page. When all lines pass it reads "All N checks passed" with **Run again**.

## OBS

The app can watch OBS on the same PC. It tells the site when the stream starts and stops, which scene is on air and whether the overlay is in it, and it powers the site's Refresh overlay button.

1. In OBS (28 or newer) open Tools, WebSocket Server Settings, tick **Enable WebSocket server** and copy the Server Password.
2. In the app open Setup, Connections, **OBS**, tick **Talk to OBS**, paste the password and press Save. The address `ws://127.0.0.1:4455` is OBS's own default. The password stays on this PC.

On the **Overlay and OBS** page:

- **Pause pulls on scenes.** Tick the scenes that should stop pulls. While one is on air pulls pause with the reason "Paused by scene: (name)". A pause you made by hand is never lifted by a scene change.
- **Live stats in OBS.** For each stat pick an OBS text source and the app writes the text into it: Packs this stream, Last big pull, Top puller, Happy hour countdown, Pack goal progress and Queue length. "Not shown" leaves a source alone. It needs OBS connected.

A big pull rule that saves a clip needs the OBS replay buffer running; **Start the replay buffer when the stream starts** on the OBS connection does that for you.

## When something is wrong

The Connections page lists TCG account, Mix It Up, OBS, Stream Deck plugin and Twitch channel, each with a coloured dot and a sentence. A **To fix this** box gives the steps, with **Check again**.

| What it says | What to do |
| --- | --- |
| Not signed in to the site | Sign in with Twitch so the site can reach Mix It Up. |
| The site no longer accepts this PC | Sign out, then sign in with Twitch again. Check the account still has a staff role. |
| Cannot reach the site | Check the PC's internet. The app keeps trying. |
| Mix It Up is not connected | Open Mix It Up and switch on Services, Developer API, Connect. **Start Mix It Up** in the fix steps starts it. |
| OBS is not connected | Open OBS, switch on its WebSocket server, check the password and the address on the OBS connection, then Check again. |
| Twitch events need attention | See the Twitch channel connection; it may need connecting again on the site. See [Twitch connection](/admin/wiki/twitch). |
| Stream Deck plugin installed but not linked | See [The Stream Deck plugin](/admin/wiki/stream-deck). |
| Couldn't check for updates | Press **Try again**. |

The app sends the site a short error report when something fails. The site lists them on the Stream page under Connections, Error reports. For a bug report use **Copy diagnostics** on the About page: it copies the versions, the statuses and the last jobs as text, with passwords left out. **Open log folder** opens the daily log files, kept for 7 days.

A Windows alert appears when the site link, Mix It Up, OBS or Twitch drops while OBS says the stream is live, and again when it returns. The switch for this is in the window.

Brie Bucks backups can be saved to `Documents\TCG Bridge\backups` at the start and end of a stream. They are off until switched on from the site; **Open backups** on the App page opens the folder.

## Other things the app does

- **Live pull feed window** (off by default): a second window with one line per pull as its card is revealed, with an optional chime.
- **End of stream summary:** a Windows notice and a window with the totals; **Copy for Discord** copies it.
- **Staff notices** on a staff PC: Needs attention, New reports and feedback, Paid pull refusals and Deploys. A notice sent while the app is offline is lost.
- The extra programs the same installer carries: [The Stream Deck plugin](/admin/wiki/stream-deck) and [The OBS plugin](/admin/wiki/obs-plugin).
