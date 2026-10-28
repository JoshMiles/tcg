# The Cheesy TCG, roadmap

**Last updated 2026-10-28**

Open work only. Owned by the planning model (Opus, see "Model workflow" in `CLAUDE.md`). Execution picks up items marked Ready; Needs design or Needs a decision goes back to planning (or to the user) first. When an item ships, delete it here and make sure its area doc in `docs/` describes the result. Finished items and their original designs are archived in `docs/archive/roadmap-history.md`; read it only when you need the reasoning behind a done item.

**Status legend:** Ready (the design here is enough to build) · Needs design · Needs a decision (the user chooses) · Blocked (waiting on something outside the repo).

## Rules in force

- **Twitch panel freeze (2026-10-26).** It was lifted so version 0.0.2 could be built; a light freeze starts when Josh submits 0.0.2 and lasts until Twitch answers: `public/twitch-panel/*` and the CORS rules in `middleware.ts` stay as submitted, and `/api/twitch/*` may only gain JSON keys (Track 53 waits for the review). Always: never rename or remove a JSON key on `/api/twitch/*` that the released panel reads.
- One feature per PR, branched from up-to-date `origin/main`; every push gets a PR (see "Git and PRs" in `CLAUDE.md`).
- No em dashes, no emoji in the UI, FAQ / Privacy / Terms kept in step (`scripts/check-words.mts`), `npm run verify` before every PR.

## Open items

| # | Item | Status | Size |
|---|------|--------|------|
| 35.1 | iPhone icon still a "C", and no launch screen (Safari and Chrome both) | Blocked (user) | S |
| 40.2f | Site speed: re-measure, then cache shared data if needed | Blocked (field data from 2026-11-09) | S to M |
| 43.3 | Rename `middleware.ts` to `proxy.ts` | Blocked (panel freeze: the CORS rules stay as submitted) | S |
| 47 | Access hardening (47.11) | Blocked (Josh, from 2026-11-02) | S |
| 50 | Swap finder trial (50.3) | Blocked (trial readout from 2026-11-24) | S |
| 53 | Next panel version, 0.0.3 (34.6b; 47.4, 50.1, 50.2, 50.4, the panel half of 49.6, 52.16 ride along) | Ready (waits for 0.0.2 review) | M |
| 57 | TCG Bridge features still to build: command check, errors on the dashboard, overlay preview, what's new, Stream Deck plugin (57.8 to 57.11, 57.13; 57.1 to 57.7 done, 57.12 dropped) | Ready | L |
| 58 | Twitch through TCG Bridge: sign in to the app with Twitch, connect the channel, EventSub in the app, awards for existing channel points rewards, bits / subs / raids, chat commands replacing the Mix It Up ones (58.0 to 58.6) | Ready | L |
| 59 | TCG Bridge redesign: bigger window, less clutter, layout by job (59.1 design pass, then build items) | After Track 58 | L |

Tracks 25 to 33, 36, 38, 41 to 43 (except 43.3) and 46 to 52 and 54 to 56 (except the items above) are done and archived in `docs/archive/roadmap-history.md`, including the edition / print glossary (25.2) and the 29.3 decision.

## Track 35: home-screen app (2026-10-20)

Read `docs/public-site.md` (install topic) first. #330 gave the icon a new URL (`apple-touch-icon-v3.png`), added the 180 px manifest entry and removed `app/apple-icon.png`. Production checked again on 2026-10-23: signed-out visitors land on `/closed`, whose head links `/apple-touch-icon-v3.png` (180x180); that file, the root `apple-touch-icon.png`, `-precomposed.png` and the manifest all serve 200. The icon is a plain 8-bit RGB 180 px PNG (no alpha, not interlaced), served `image/png` with ordinary headers; every tag is in `<head>`. The user re-added the app from Safari and from Chrome on 2026-10-23: the "C" both times, and the launch screen (the mascot on black) doesn't show either. One server-side lead: Next 15.5 turns `appleWebApp.capable` into `mobile-web-app-capable` only, with no `apple-mobile-web-app-capable`, which iOS has needed before it uses `apple-touch-startup-image`. Fixed in #439 (live); it likely explains the launch screen, and may or may not explain the icon.

### 35.1 iPhone icon still a "C" (Blocked on the user, S)
1. After the `apple-mobile-web-app-capable` fix is live, delete the home-screen app and add it again from Safari. Close 35.1 if the mascot and the launch screen show.
2. **Rule out the phone (user):** add another site (github.com) to the home screen; if it also gets a letter, look at content blockers (Settings > Apps > Safari > Extensions), Lockdown Mode and iCloud Private Relay rather than this site. Note the iPhone model, the iOS version, and whether the app opens full screen without Safari's bars.
3. **If only this site gets a "C", diagnose (user, with a Mac):** iPhone Settings > Apps > Safari > Advanced > Web Inspector on, plug into the Mac, Safari > Develop > the iPhone. Open `cheesytcg.app`, open the Network tab, then Share > Add to Home Screen. Note whether `/apple-touch-icon-v3.png` is requested and what comes back, the iOS version, and whether "Open as Web App" was on. Bring that back to planning.

## Track 40: site speed (2026-10-22)

The public site can feel sluggish, most of all on a phone. Measure first, then fix what the numbers point at; no speculative optimising. Read `docs/public-site.md` and `docs/hosting.md` first.

How to measure (Speed Insights through the Vercel MCP, Lighthouse flags, `npm run analyze`, why `inlineCss` was set aside) is in `docs/hosting.md`, "Measuring site speed". Field baseline on 2026-10-23, home only (the one route with enough samples): LCP p75 3.5 s, TTFB p75 838 ms. Lab: first-load JS has a 103 kB shared baseline; `/cards` is 160 kB gzipped.

### 40.2f Re-measure, then cache shared data if LCP still waits on it (Blocked on field data, S to M)
The public shell is prerendered and served from the CDN since 40.2e (Cache Components; see `docs/hosting.md`). Nothing is cached across requests yet.
1. **Measure (from about 2026-11-09, a week after 40.2e is live):** Speed Insights for home on phones and desktop, TTFB and LCP p75, against the early read (phones TTFB 1.3 s of LCP 3.9 s). Find home's LCP element with a lab trace (`chrome-devtools-mcp` against `next start` on the mock KV, see the 40.1 learning). Check Fluid compute is on. If LCP p75 is under 2.5 s, close 40.2f.
2. **If LCP is KV data (card art, podium):** wrap the shared public reads (`getSeasonOverview`, the collection behind the leaderboard, the active season, hidden users) in `'use cache: remote'` functions that take the sandbox id as an argument and run under `runInSandbox` (`cookies()` / `headers()` throw inside a cache scope). Tag by season and `catalog`, and call `updateTag` on every write that changes them (draws, trades, upgrades, admin pack / card / season / user edits, sandbox actions): a pull on stream must show within seconds. This replaces the 20 s in-memory `boardCache`. Never cache per-user data.

## Track 43: framework upgrade (2026-10-24)

We are on Next.js 16.4. 43.1, 43.2, 43.4 and 43.5 are done (archived); 43.3 waits for the panel review.

Checked against the code on 2026-10-25, most of the 16 breaking changes need nothing here: request APIs (`params`, `searchParams`, `cookies()`, `headers()`, the profile share image) are already awaited; no `next/image`, `revalidateTag`, `unstable_cache`, parallel routes (`@slot`), AMP, `runtimeConfig`, `next lint` / ESLint config or `scroll-behavior: smooth`. What does touch us: Turbopack becomes the build bundler, the bundle analyzer is a webpack plugin, and `middleware.ts` is renamed `proxy.ts` (Node runtime only).

**Not part of this track:** Cache Components, the React Compiler, Instant Navigations (16.3) and Partial Prefetching (16.4). The upgrade guide says not to turn them on just to upgrade; if one looks worth it after 43.2, plan it as its own item.

### 43.3 Rename `middleware.ts` to `proxy.ts` (Blocked: panel freeze, S)
The file holds the extension's CORS rules, which stay as submitted while panel 0.0.2 is under review (Rules in force). Pick this up when the review is back. `proxy.ts` runs on Node only; today the file runs on edge and reads through `lib/admin-auth-edge` and `lib/access-edge`. Rename the file and its export (the codemod does both), then test the admin and mod gates, the access gate and the `/api/twitch/*` CORS answers (the panel's requests from the Twitch origin) on a preview deployment. Drop the `-edge` variants only if nothing else uses them.

## Track 57: TCG Bridge features (2026-10-28)

Josh picked all thirteen (2026-10-28); 57.1 to 57.7 are done and archived, 57.12 was dropped (Josh, not needed). Every item that changes bridge/ bumps the bridge minor and releases itself on merge (56.1). Read `bridge/README.md` and `docs/admin/mixitup.md` ("TCG Bridge") first. One PR per item, in this order unless an item says otherwise. Everything new is off by default and switched on in the app's Settings tab or on the site's Mix It Up page, like the 0.9.0 streamer tools. The app only acts on scene, source and command names it reported itself (the 0.6.0 rule).

### 57.8 Mix It Up command check (Ready, S)
The site already gets the app's enabled Mix It Up commands (0.4.0). Compare them with what the site expects (the `!pack` command, the switched-on chat commands, the Stream Deck buttons and event commands the setup cards describe, matched by the Web Request address the downloads put in, else by name): a missing or switched-off one shows on the Connection tab and in the app's Status tab with the name to fix. Never changes Mix It Up.

### 57.9 Bridge errors on the dashboard (Ready, S)
The app sends a short error report (time, part, message, app version and commit, redacted like Copy diagnostics) when something fails: a job, a reconnect giving up, an OBS or Mix It Up call. The site keeps the last 50 in KV and counts them per day; the admin data health card warns when there were any in the last 24 hours, linking to the list on the Connection tab. A burst (10 in 10 minutes) posts once to the System Discord channel; single errors never do.

### 57.10 Overlay preview window (Ready, M)
A **Preview overlay** window in the app shows the paired site's overlay page at the OBS canvas size (from OBS when connected, else 1920x1080), scaled to fit, with **Test pull** (the 55.14 test pull, never a real one) and **Show a card**. The site gives the app a preview address with its own short-lived key (staff only, read-only, never the OBS overlay key), so the window can never trigger real pulls.

### 57.11 What's new screen (Ready, S)
After an update the app opens a What's new tab once: the release notes of every version since the last one seen (from the GitHub releases 56.1 publishes, cached), newest first. The About tab keeps a link to all releases.

### 57.13 Stream Deck plugin (Ready, L; two PRs)
Josh (2026-10-28): installed from TCG Bridge; every action below; the Mix It Up Stream Deck commands keep working alongside; stream PC only.
1. **Where it lives.** A new `streamdeck/` folder: an Elgato Stream Deck plugin (official `@elgato/streamdeck` Node SDK, plugin id `tv.cheesygidds.tcgbridge`), built and packed with the Elgato CLI into `TCG Bridge.streamDeckPlugin` by the bridge build and shipped inside the app (`extraResources`). Its version is always the bridge's (manifest `x.y.z.0`), and any change under `streamdeck/` counts as a bridge change for the 56.1 minor rule (`check-version.ts` covers both folders), so the release workflow ships them together.
2. **Install.** Settings tab: **Install Stream Deck plugin** opens the packed file with the Stream Deck app (which installs or updates it); shows "Stream Deck app not found" when it is not installed. After a bridge update the app offers "Update the Stream Deck plugin" once when the installed plugin's version differs.
3. **Local link, no typing.** The bridge listens on a WebSocket at `127.0.0.1` only (a fixed port with a fallback range) and writes `{ port, token }` to `%APPDATA%\TCG Bridge\streamdeck.json` (current user only). The plugin reads that file, connects and sends the token; anything else is refused. Off until the plugin is installed (or a switch in Settings). Connected / not connected shows on the app's Status tab and on every key (an alert icon when the bridge is closed).
4. **Actions** (each runs through the app's existing `/api/bridge/action` calls, audited as "TCG Bridge"; a refusal shows the key's alert and the reason in the app log):
   - **Buff**: pick any Stream Deck buff or quick action (55.2) in the key's settings; **Last buff again**. The key shows active / on cooldown.
   - **Pause pulls** (toggle; the key shows paused, including a scene pause), **Happy hour** (pick a preset or custom minutes and kind; the key counts down; pressing while one runs ends it, after a long press to avoid accidents).
   - **Test pull** (a test pull through the overlay) and **Show a card** (a viewer named in the key's settings, or the last puller).
   - **Stat** keys (display only): queue length, packs this stream, pack goal progress (57.4 / 57.5 data, the same polling, only while such a key is on a deck). Pressing a queue key skips the next pull (asks for a second press within 3 seconds).
5. **Mix It Up stays.** The Mix It Up Stream Deck commands and `/api/webhooks/buff` are unchanged; the setup cards say the plugin is the simpler way.
6. **PRs.** 57.13a: the folder, packing, install button, local link and the Buff, Pause and Happy hour actions. 57.13b: Test pull, Show a card and the Stat keys. Checks: the token and 127.0.0.1-only refusal, the message shapes, the version match; the SDK is driven by a fake in `npm run check`. Not testable here without a Stream Deck: say so in each PR.

## Track 58: Twitch events through TCG Bridge (2026-10-28)

Josh: bring Twitch features into TCG Bridge and the admin portal, for example awards for specific channel points rewards, using the Twitch API. Today the site signs viewers in with no scopes and calls Helix with an app access token (`lib/twitch-helix.ts`); events come only through Mix It Up (55.4g). Read `bridge/README.md`, `docs/admin/mixitup.md` ("TCG Bridge", "Event rewards") and `docs/staff.md` (Twitch sign-in) first. One PR per item; every bridge PR bumps the minor and releases itself (56.1).

**Decisions (Josh, 2026-10-28).**
1. TCG Bridge is always open while streaming, so it receives the events: an EventSub WebSocket in the app, not webhooks on the site.
2. No custom rewards are created. Awards attach to the channel's existing channel points rewards. Twitch only lets an app fulfil or refund redemptions of rewards it created, so the site never marks a redemption done or refunds it; a failed award is shown (log, app, staff notice) for a mod to refund by hand in Twitch's reward queue.
3. When an event comes from Twitch, the matching Mix It Up event command (55.4g) is ignored, so nothing counts twice. Mix It Up stays for Brie Bucks and chat.

**How the token flows.** The site keeps the Twitch app's secret, so the broadcaster connects once on the site (an authorization-code sign-in like the staff one, with the scopes below) and the site stores the refresh token encrypted in KV. TCG Bridge asks the site for a short-lived access token over its paired link when it needs one (never the refresh token), opens the EventSub WebSocket with it and creates its subscriptions with Helix. Same client id throughout, so no second Twitch app is needed.

### 58.0 Sign in to TCG Bridge with Twitch (Ready, M; first in this track)
Josh (2026-10-28): the app is linked to a Twitch account instead of a pairing code, and the account's site role gives it its permissions. The channel connection (58.1) stays separate.
1. **Linking.** The app's pairing screen becomes **Sign in with Twitch**: the app asks the site for a one-time link request (an id and a short code shown in the app), opens the system browser on the site's `/bridge/link?id=...`, the streamer signs in with the site's existing Twitch sign-in, sees "Link TCG Bridge on <PC name>? Code <code>" and clicks Allow. The app polls the request (every 2 s, 10 minutes, then expires) and receives its bridge token, exactly what pairing gives it today. No Twitch token ever reaches the app.
2. **Permissions from the role.** The token is tied to the Twitch user id. Admin or broadcaster: everything. Mod / staff: the staff tools (55.12's staff switch is set from the role, no admin toggle). Anyone else: refused at Allow ("This account has no staff role on the TCG site"). The role is re-read on the bridge's regular `status` call; a lost role revokes the PC (the app's existing "revoked" path).
3. **Pairing codes go.** The admin "Pair a new PC" code flow is removed; bridges paired today keep working until unlinked, then sign in. The Connection tab lists each PC with the account it is signed in as, and **Unlink** stays.
4. **App.** Status / About show "Signed in as <name> (<role>)"; **Sign out** unlinks this PC.
5. **Checks:** a link request expires and is single-use; a non-staff account is refused; the role decides the staff switch; a role removed on the site revokes at the next status call; old paired tokens still work.

### 58.1 Connect the Twitch channel (Ready, M)
Admin-only **Connect Twitch channel** on the Mix It Up page's Connection tab: OAuth authorization code with `channel:read:redemptions`, `bits:read`, `channel:read:subscriptions` (and `moderator:read:followers` only if a later item needs it). Any Twitch account can be connected as the channel (Josh, 2026-10-28: so he can test on a spare account); everything in Track 58 uses the connected account's user id as the broadcaster. When it is not `CHANNEL_LOGIN`, the Connection tab, the app's Status tab and the checklist (57.1) show "Testing on <login>, not the live channel", and the 58.4 / 58.6 switch-overs that ignore Mix It Up requests stay off, so the live channel's Mix It Up setup keeps working during a test. Store `{ userId, scopes, refreshToken (encrypted with the existing secret helper), connectedAt, by }` at `twitch:channel-auth`. A pure token refresh helper; a refresh that Twitch rejects marks it disconnected and sends a staff notice. Status (connected as, scopes, since) and **Disconnect** (revokes the token at Twitch, deletes the key). Audit lines for both. A staff-only bridge route hands a paired, staff-enabled-or-not bridge an access token and its expiry (rate limited, never logged).

### 58.2 EventSub WebSocket in TCG Bridge (Ready, M to L)
When the channel is connected and the app is paired, the app opens `wss://eventsub.wss.twitch.tv/ws`, handles welcome, keepalive (reconnects when a keepalive is missed), `session_reconnect` and revocation, and on each new session creates subscriptions with Helix (`POST /helix/eventsub/subscriptions`, transport `websocket` + session id): `channel.channel_points_custom_reward_redemption.add`, `channel.cheer`, `channel.subscription.gift`, `channel.raid` (to the channel), `stream.online`, `stream.offline`. Each notification goes to the site over the paired link with its message id; the site drops a repeated message id (10 minutes, SET NX). A dropped token asks the site for a new one. State (connected, subscriptions, last event) on the app's Status tab and the site's Connection tab; an Alert when it drops while live (the 0.3.0 alert rules). Stream online / offline also feed the site's live state, like the bridge's OBS stream start. A fake EventSub server for `npm run check`.

### 58.3 Awards for existing channel points rewards (Ready, M)
Events tab, new **Channel points** section: the channel's rewards listed from Helix (`GET /helix/channel_points/custom_rewards`, read-only, all rewards, refreshed on open), each with an award: none (default), open a pack (free pull with reason "redeemed <reward title>"), show the viewer's best card (the show-off path), a self buff (from the Stream Deck buffs), or start a happy hour (minutes and kind, 55.4c). Stored by reward id in `mixitup:settings` (or its own key), so renaming a reward on Twitch keeps the award. A redemption of a reward with an award runs it for the redeeming viewer; one with none is ignored. Never fulfils or refunds on Twitch. A failed award (no packs, buff already active, happy hour already running) writes the Mix It Up log line, shows in the app's event feed (57.7) and sends a staff notice "Refund <viewer>'s <reward> by hand" (at most one a minute). The live feed says why ("redeemed Open a pack"). The Mix It Up `redeem` event (55.4g) still works for anyone not using this; when an award comes from Twitch, the Mix It Up redeem event is ignored (decision 3).

### 58.4 Bits, gifted subs and raids from Twitch (Ready, S to M)
The 55.4g rules (packs per sub, bits per pack, raid threshold, buff, the 10 cap) run on the Twitch events from 58.2, through the same pure functions. While the Twitch connection is live (58.2 connected, with that subscription active), the Mix It Up `gifted-subs`, `bits` and `raid` event requests answer `{ ok: true, ignored: true, reason: 'from_twitch', message: '' }`; when it is down they work as before, so a dropped WebSocket never loses rewards. Anonymous gifters and cheerers get nothing (as today). The raid shout-out (57.6) uses the raid event from here when connected.

### 58.5 Twitch in TCG Bridge's tools (Ready, S)
The redemptions and Twitch events in the event feed (57.7), the Twitch connection as a line in the checklist (57.1), and **Pause channel point awards** in the Control tab and tray (the site ignores redemptions while paused, and the failed-award notice says "awards paused"). No change to the rewards on Twitch.

### 58.6 Chat commands through TCG Bridge (Ready, L; after 58.2)
Josh (2026-10-28): replace the Mix It Up chat commands; reply as the channel account, with the option of a bot account.
1. **Scopes.** 58.1's channel sign-in also asks for `user:read:chat`, `user:write:chat` and `channel:bot` (lets a bot account post in this channel). A channel connected before this item shows "Reconnect to allow chat" until it is reconnected.
2. **Receiving.** 58.2's WebSocket also subscribes to `channel.chat.message` (broadcaster and user = the channel). The app forwards only messages whose first word is a command the site knows (it gets the list from the site: `!pack`, `!showoff` and every switched-on chat command from the Commands tab, aliases included), never other chat. The site runs each exactly as its webhook does today (`queuePull` with `chat: true` and `pack` from the rest of the message, the show-off route, the chat command route) with the message id for dedupe in place of `requestId`.
3. **Roles from Twitch.** The role for limits and prices (55.4b) comes from the message's badges (broadcaster, moderator, vip, subscriber, else regular), so no `role` field is needed.
4. **Replies.** The site sends the reply (`message`) to chat with Helix `POST /helix/chat/messages`, as a reply to the viewer's message, sender = the channel account by default. Empty messages are not sent. At most one reply a second and 20 in 30 seconds (Twitch's limits for a non-verified sender); extra replies are dropped with a log line, never queued.
5. **Optional bot account.** Connection tab: **Connect bot account** (a second sign-in for any account other than the channel, scopes `user:bot` and `user:write:chat`, refresh token stored like 58.1's at `twitch:bot-auth`) and a choice "Reply as: channel / bot". With the bot chosen, replies are sent with the bot as sender (needs the channel's `channel:bot`, or the bot as a moderator). If the bot's token fails, replies fall back to the channel account and staff get a notice. **Disconnect bot** like 58.1.
6. **Replacing Mix It Up.** While chat is connected through TCG Bridge (58.2 up, chat subscription active), requests on `/api/webhooks/pull` (without `event`), `/api/webhooks/show-card` and `/api/webhooks/command` answer `{ ok: true, ignored: true, reason: 'from_twitch', message: '' }`, so a leftover Mix It Up command never runs twice and says nothing. When the connection is down they work as before. Stream Deck buttons (`/api/webhooks/buff`), event commands (58.4 decides those) and the paid-pull currency calls are not affected. The Commands tab, the `!pack` setup card and the setup wizard say "Chat commands now come through TCG Bridge; the Mix It Up commands are only a fallback", and the wizard's !pack step becomes optional.
7. **Checks:** a fake EventSub chat message runs `!pack <name>` and a chat command end to end with the reply sent to a fake Helix; badges map to roles; a Mix It Up `!pack` is ignored while connected and works when not; the reply rate limit; bot fallback to the channel account.

## Track 59: TCG Bridge redesign (2026-10-28)

Josh: the app is cluttered and its UX is poor; the window is small (860 x 640, min 700 x 520) and can be much bigger. Do it after Track 58, so the Twitch parts are designed in rather than added on.

### 59.1 Redesign pass (Needs design: Opus, then Josh)
Walk every tab, card, banner, tray item and tool window as they stand after Track 58 (screenshots from `demo.ts`). Propose: a bigger default window (remembered size and position, sensible minimum), a layout that groups by job (going live, during the stream, setup, about) instead of by feature, what moves off the main screens into Settings, one status summary instead of many banners, and consistent cards, buttons and empty states. Mockups for Josh to pick from before any build; then split into build items (59.2 onward), one PR each, every one bumping the bridge minor.

## Twitch extension

### Track 53: next panel version, 0.0.3 (Ready)

Extension version 0.0.2 is built and documented (`twitch-extension/SUBMISSION.md`); Josh submits it. A new panel freeze starts at submission (ask Josh before changing `public/twitch-panel/*`, `/api/twitch/*` or the CORS rules), so everything here waits for 0.0.2 to be approved or sent back. The panel keeps its own version, `PANEL_VERSION` in `panel.js`; bump it for 0.0.3. Rules: never rename or remove a JSON key on `/api/twitch/*` the released panel reads, and put new data in new fields.

**34.6b Pack card back in the panel (Ready, M).** Left out of 0.0.2 (Josh, 2026-10-26). The panel has no flip card, and the pack card back exists only as layout nodes (`layoutBack`), the React `FlipCard` and the vanilla port in `public/widget.js`; there is no image form. Options when it is picked up: a server-rendered back image route the panel shows (also usable for share images), or port the `widget.js` renderer into the panel. Testers get no badge next to names on the site either, so the panel shows only streamer, admin and mod.

**47.4 Extension routes (Ready, S).** Moved from Track 47. twitch-panel M-2, M-3, M-4, L-2, L-3, L-9 and Changes 1 to 3; security M-3, M-7, L-5, L-7. One viewer check (`extensionViewer()`) for every route, no dev fallback in production, delete `/api/twitch/user`, `/api/twitch/resolve-username` and the dead login helpers. Never remove a JSON key the released panel reads; the deletions wait until no released panel calls them.

Other items marked "next panel version" belong to this release: 50.1 (panel quick wins), 50.2 and 50.4 (the two panel trials), the panel half of 49.6 and 52.16 (loading timeout). 50.1, 50.2 and 50.4 are listed below; the other two are:

**49.6 panel half (S).** twitch-panel UI and UX 1 to 4: a "Link my Twitch account" button, focus kept in card details, "Updated N ago", a note length hint.

**52.16 Panel loading timeout (S).** The panel shows "Loading..." forever when Twitch never authorizes; after about 10 seconds show a message with Retry.

## Audit follow-up (2026-10-26)

Tracks 46 to 52 come from the Track 44 audits (44.6 triage, Josh picked on 2026-10-26). Each item names its findings by audit and id; the evidence, file:line and the fix sketch are in `docs/archive/audit-2026-<area>.md` (`public-site`, `admin`, `mod-panel`, `twitch-panel`, `security`). Read the finding before starting. Items with no audit id were proposed in the triage and picked by Josh. Tracks 46, 48, 49 (site), 51 and 52 (site) are done and archived. One item per PR unless it says otherwise.

### Track 47: access hardening (Blocked)
47.1 to 47.3 and 47.5 to 47.10 are done (archived). 47.4 moved to Track 53.
- **47.11 Trial readouts (Blocked: Josh, from 2026-11-02).** The CSP report-only trial (47.5, `docs/hosting.md` "Security headers and the CSP trial") and the Vercel Firewall log-only rules (47.9, "Vercel Firewall trial"; Josh sets them up in the dashboard). After a week each: switch CSP to enforcing if no real page reported a violation, and the firewall rules to Deny if none flagged real overlay, panel or webhook traffic; otherwise adjust or drop them.

### Track 50: player features and trials
50.5 to 50.12 are done (archived). Trials run for the time given, then Josh keeps, changes or drops them. 50.1, 50.2 and 50.4 ride along with the next panel version (Track 53).
- **50.1 Panel quick wins (S, next panel version).** twitch-panel Feature improvements 1 to 3 (new since last visit, your own row on the Board, offers waiting badge).
- **50.2 Trial: browse before linking (S, next panel version, 4 weeks).** twitch-panel Experimental 1: Board and a read-only dex before the identity share prompt. Success: more identity shares per panel open.
- **50.3 Swap finder trial readout (Blocked: trial runs to 2026-11-24, S).** Shipped in #574 (`docs/trading.md`, "Swap finder"). From 2026-11-24, read the "From swap finder" tile on the admin Trades overview (offers made, completed); Josh keeps, changes or drops it. Dropping it: delete `app/(site)/trade/SwapFinder.tsx` and `lib/swap-finder.ts`, keep `Trade.via` so stored trades still read.
- **50.4 Trial: Looking for match alert in the panel (S, next panel version, 4 weeks).** twitch-panel Experimental 3: mark the Trades tab when a board offer gives a card on the viewer's Looking for list, worked out only when the tab opens. Success: offers accepted from those matches.
## Standing decisions

- Paid-pull limits default to no limit and stay editable. Staff can add extra pulls for everyone for the current stream.
- Stars keep setting the card value (29.3); `copyPoints` does not change.
- Trainer cards can be traded until used.
- Collection words (Track 37): collected = different cards of a set, pulls = every pull, edition = one numbered copy.
- No offline caching of pages or data: `public/sw.js` caches only the offline page so nobody sees stale cards or scores (Track 35).
- Not planned for the Overlay Editor: real-time co-editing, plugin / script actions, filters on card art (the card art is the pack's job), uploading font files.
