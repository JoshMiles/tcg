---
title: TCG Bridge for mods
summary: What TCG Bridge does on a mod's PC when you sign in with your own Twitch account, and what it will not do.
order: 63
covers: bridge/src/staff.ts, bridge/src/staffpages.ts, bridge/src/signin.ts, lib/bridge-core.ts, lib/bridge-staff.ts, lib/bridge-link.ts
audience: mods
---

TCG Bridge is the Windows app the streamer runs on the stream PC. You can run it on your own Windows PC too, signed in with your own Twitch account, to get a few mod tools in a window and in the tray. You do not need it to moderate. Everything here can also be done from the mod panel, apart from switching the streamer's OBS scene.

## Signing in

1. Get the installer from the newest `bridge-v` release at [github.com/JoshMiles/tcg/releases](https://github.com/JoshMiles/tcg/releases?q=bridge-v&expanded=true). Run `TCG-Bridge-Setup-<version>.exe`. It is not code-signed, so Windows SmartScreen warns you: press **More info**, then **Run anyway**.
2. Press **Sign in with Twitch**. The app shows a code and opens the site in your browser.
3. Sign in with Twitch, check the code matches the one in the app, and press **Allow**.

If your account has no staff role the site refuses with "This account has no staff role on the TCG site". The site checks your role about once a minute. If you lose it, the app shows "This PC was signed out on the site" and you must be given the role back before you can sign in again. **Sign out** (in the app, Setup, Connections, TCG account) makes the PC forget the sign-in.

## What a mod PC can do

The app hides what your role cannot do instead of greying it out. With a mod role you see:

- **Find a viewer** (Staff, Viewers and cards). Type a name, pick the viewer, and the card shows their facts: whether they may pull, cards owned and different, rank, Brie Bucks, last pulls and refusals.
- **Block from pulls**, for this stream or until lifted, and **Lift block**. This stops a viewer using `!pack` and paid pulls. It is not the same as a restriction on the site, which is on the viewer's page in the mod panel.
- **Trading** (Staff, This stream): **Pause trading** and **Resume trading**. Pausing stops trading for everyone and asks you to confirm first.
- **Switch scene**: switches OBS on the PC where the app runs. It only makes sense on the stream PC.
- **Feed and history**: the live feed of pulls, event rewards and jobs, and recent pulls, grants and trades.

Every action is recorded in the site's activity log with your login and "via TCG Bridge".

## What it will not do

The site turns these away for a mod, and the app does not show them:

- gifting packs, granting a card, showing a collection or a card on stream;
- extra pulls for the stream;
- Search the admin, Back up now and the Preview overlay window;
- the card search and Test pull.

If you try one anyway the app says "Your account (Mod) cannot do that on the TCG site: it needs an admin." Ask an admin or the streamer.

The app on your PC also does not listen to the channel's Twitch events (channel points, bits, gifted subs, raids and chat commands). Only an admin's PC does that, so nothing is awarded or run twice by having it open.

## The Home controls

The Home page has Pause pulls, Pause channel point awards, the happy hour presets and the pull queue (Skip next and Clear queue). The site does not check your role for these, so they work on a mod PC as well. They change what everyone sees on stream, and Clear queue refunds viewers. Use them only when the streamer or an admin has asked you to.

## Stream Deck and OBS

If you also use the Stream Deck plugin, a mod PC gets Pause trading and Switch scene. The Test pull, Show a card and Preview overlay keys show "Admins only" on a mod PC. The OBS plugin's buttons (Pulls, Awards, happy hour, Skip and Clear) are the same Home controls, so the note above applies to them.

## When to ask an admin

Anything that needs a card to move, a gift, a grant or a restore. See the escalation guide.
