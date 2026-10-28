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
| 61 | Stream Deck plugin: fix the keys that do not work (61.1), then queue, staff, live info and OBS / overlay keys (61.2 to 61.5) | 61.1 to 61.3 done (#658, #661, #663); 61.4 and 61.5 run beside Track 58, one bridge item at a time | M |
| 63 | Admin Mix It Up page redesign: too messy; reorganise by job (63.1 design pass, then build items) | After Track 58 (Twitch first); choices made and mockup agreed, 63.1 to 63.5 below | M to L |
| 58 | Twitch through TCG Bridge: sign in to the app with Twitch, connect the channel, EventSub in the app, awards for existing channel points rewards, bits / subs / raids, chat commands replacing the Mix It Up ones (58.0 to 58.6) | 58.0 and 58.1 done (#649, #660, #662); 58.2 building | L |
| 62 | Native OBS plugin for TCG Bridge (62.1 design pass, then build items) | After Track 58 | L |
| 60 | Staff wiki refresh: every page brought up to date, new pages for TCG Bridge, Twitch, the Stream Deck plugin and the OBS plugin (60.1) | Last, after Tracks 61 and 62 | M |

Tracks 25 to 33, 36, 38, 41 to 43 (except 43.3) and 46 to 52 and 54 to 57 and 59 (except the items above) are done and archived in `docs/archive/roadmap-history.md`, including the edition / print glossary (25.2) and the 29.3 decision.

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

## Track 58: Twitch events through TCG Bridge (2026-10-28)

Josh: bring Twitch features into TCG Bridge and the admin portal, for example awards for specific channel points rewards, using the Twitch API. Today the site signs viewers in with no scopes and calls Helix with an app access token (`lib/twitch-helix.ts`); events come only through Mix It Up (55.4g). Read `bridge/README.md`, `docs/admin/mixitup.md` ("TCG Bridge", "Event rewards") and `docs/staff.md` (Twitch sign-in) first. One PR per item; every bridge PR bumps the minor and releases itself (56.1).

**Decisions (Josh, 2026-10-28).**
1. TCG Bridge is always open while streaming, so it receives the events: an EventSub WebSocket in the app, not webhooks on the site.
2. No custom rewards are created. Awards attach to the channel's existing channel points rewards. Twitch only lets an app fulfil or refund redemptions of rewards it created, so the site never marks a redemption done or refunds it; a failed award is shown (log, app, staff notice) for a mod to refund by hand in Twitch's reward queue.
3. When an event comes from Twitch, the matching Mix It Up event command (55.4g) is ignored, so nothing counts twice. Mix It Up stays for Brie Bucks and chat.

**How the token flows.** The site keeps the Twitch app's secret, so the broadcaster connects once on the site (an authorization-code sign-in like the staff one, with the scopes below) and the site stores the refresh token encrypted in KV. TCG Bridge asks the site for a short-lived access token over its paired link when it needs one (never the refresh token), opens the EventSub WebSocket with it and creates its subscriptions with Helix. Same client id throughout, so no second Twitch app is needed.

### 58.0 Sign in to TCG Bridge with Twitch (Done except item 3: site #649, app #660 (bridge 0.35.0); item 3, removing pairing codes, waits for Josh's first real sign-in)
Josh (2026-10-28): the app is linked to a Twitch account instead of a pairing code, and the account's site role gives it its permissions. The channel connection (58.1) stays separate.
Site half (58.0a, #649): `POST /api/bridge/link` `{ name }` -> `{ id, code, secret, url, expiresAt }`; `POST /api/bridge/link/poll` `{ id, secret }` -> pending / denied / expired / `{ token, login, role }` once; the `/bridge/link` Allow page; role-based staff tools (Josh 2026-10-28: a mod-linked PC gets only what mods can do on the site: trading, block, unblock, scene and the reads); role re-read at most once a minute. Done in 58.0b (#660, bridge 0.35.0): the Connect screen's Sign in with Twitch button and polling, "Signed in as" on the TCG account row and Sign out. Left: removing pairing codes (item 3), after Josh's first real sign-in.
1. **Linking.** The app's pairing screen becomes **Sign in with Twitch**: the app asks the site for a one-time link request (an id and a short code shown in the app), opens the system browser on the site's `/bridge/link?id=...`, the streamer signs in with the site's existing Twitch sign-in, sees "Link TCG Bridge on <PC name>? Code <code>" and clicks Allow. The app polls the request (every 2 s, 10 minutes, then expires) and receives its bridge token, exactly what pairing gives it today. No Twitch token ever reaches the app.
2. **Permissions from the role.** The token is tied to the Twitch user id. Admin or broadcaster: everything. Mod / staff: the staff tools (55.12's staff switch is set from the role, no admin toggle). Anyone else: refused at Allow ("This account has no staff role on the TCG site"). The role is re-read on the bridge's regular `status` call; a lost role revokes the PC (the app's existing "revoked" path).
3. **Pairing codes go.** The admin "Pair a new PC" code flow is removed; bridges paired today keep working until unlinked, then sign in. The Connection tab lists each PC with the account it is signed in as, and **Unlink** stays.
4. **App.** Status / About show "Signed in as <name> (<role>)"; **Sign out** unlinks this PC.
5. **Checks:** a link request expires and is single-use; a non-staff account is refused; the role decides the staff switch; a role removed on the site revokes at the next status call; old paired tokens still work.

### 58.1 Connect the Twitch channel (Done, #662, 2026-10-28)
Admin-only **Connect Twitch channel** on the Mix It Up page's Connection tab: OAuth authorization code with `channel:read:redemptions`, `bits:read`, `channel:read:subscriptions` (and `moderator:read:followers` only if a later item needs it). Any Twitch account can be connected as the channel (Josh, 2026-10-28: so he can test on a spare account); everything in Track 58 uses the connected account's user id as the broadcaster. When it is not `CHANNEL_LOGIN`, the Connection tab, the app's Status tab and the checklist (57.1) show "Testing on <login>, not the live channel", and the 58.4 / 58.6 switch-overs that ignore Mix It Up requests stay off, so the live channel's Mix It Up setup keeps working during a test. Store `{ userId, scopes, refreshToken (encrypted with the existing secret helper), connectedAt, by }` at `twitch:channel-auth`. A pure token refresh helper; a refresh that Twitch rejects marks it disconnected and sends a staff notice. Status (connected as, scopes, since) and **Disconnect** (revokes the token at Twitch, deletes the key). Audit lines for both. A staff-only bridge route hands a paired, staff-enabled-or-not bridge an access token and its expiry (rate limited, never logged).

### 58.2 EventSub WebSocket in TCG Bridge (Building, M to L)
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

## Track 63: admin Mix It Up page redesign (2026-10-28)

Josh: the Mix It Up page on the admin dashboard (`app/admin/mixitup/`, about 1,800 lines across 30 files) is far too messy; refresh, reorganise, reimagine it. Site only, but it runs after Track 58 (Josh, 2026-10-28: Twitch first), so the redesign includes the finished Twitch panels. Like Track 59, a design pass with mockups for Josh first, then one PR per build item.

What is wrong today (starting audit, 63.1 checks and extends it):
- **Nine tabs by feature, not by job:** Overview, Connection, Paid pulls, Big pulls, Chat and Brie Bucks, Commands, Stream Deck, Events, Log, plus a separate Setup wizard page (`/admin/mixitup/setup`). The page is called Mix It Up but now runs TCG Bridge, OBS, events, the Stream Deck and soon Twitch.
- **Live and set-once mixed:** Happy hour and the Community pack goal (used during a stream) sit on Paid pulls above prices and limits (set once); the stream's pull blocks sit on Connection inside the TCG Bridge card.
- **Connection is a junk drawer:** paired PCs and their accounts, pull blocks, the Mix It Up command check, bridge error reports, the TCG Bridge / direct addresses switch with seven address and secret fields, Try it and Test viewers.
- **Tests scattered:** Quick actions and Test pulls on Overview, Try it and Test viewers on Connection, Test it in the Setup wizard.
- **Repeated setup blocks:** the incoming webhook address and secret are shown separately on Commands, Stream Deck and Events (and Paid pulls' `!pack` setup), each with its own copy-and-paste instructions.
- **Two logs:** Latest requests on Overview and Recent requests on Log; the Brie Bucks ledger check on Chat and Brie Bucks; uptime on Overview.
- **Long hint paragraphs** under nearly every panel, and each tab's subtitle repeating the tab name.

Suggestions for 63.1 to weigh (not decisions):
1. **Group by job, mirroring TCG Bridge (Track 59):** **Live** (health strip, this stream's numbers, pause, happy hour, pack goal, queue, blocks this stream, latest requests), **What viewers get** (paid pulls prices and limits, `!pack` packs, event rewards and raid shout-out, big pull rules, chat commands, Stream Deck buffs), **Connections** (TCG Bridge PCs with their Twitch accounts and roles, Mix It Up, OBS, the Twitch channel slot for 58.1, command check, error reports; direct addresses under Advanced), **Test** (every test in one place: simulate a chat pull, try balance, test viewers, quick actions), **History** (one log with filters, the ledger check, uptime, backups).
2. **Rename the page** to reflect what it is now (for example "Stream" or "Stream tools"), keeping `/admin/mixitup` as a redirect.
3. **One status strip** at the top of every section (the same wording as the TCG Bridge status pill: "All good" or "N things need you", each with a link to the fix), replacing per-tab warnings.
4. **One "Mix It Up commands" helper:** the webhook address and secret once, with Copy buttons and the existing command downloads, used by every reward type instead of four copies.
5. **The Setup wizard becomes the page's first-run state** (shown until a connection exists), not a separate page; afterwards its steps live in Connections.
6. **Set-once settings get a clear edit pattern:** one Save per section with an unsaved-changes marker, Advanced fields folded away, hints behind "How?" like the app.
7. **Phone-friendly Live section** for mods watching on a phone during a stream.
8. **Room for Track 58:** channel point awards beside paid pulls in What viewers get, Twitch events in the Live feed, Twitch chat commands beside the Mix It Up ones.

**Josh's choices (2026-10-28):**
- **Structure:** group by job, five sections: Live, What viewers get, Connections, Test, History (suggestion 1).
- **Name:** the page becomes **Stream** at `/admin/stream`; `/admin/mixitup` and its sub-pages redirect.
- **Setup wizard:** becomes the page's first-run state until something is connected; afterwards its steps live in Connections. `/admin/mixitup/setup` redirects.
- **Devices:** desktop first; the Live section works on a phone.
- **Live:** this stream's numbers with Pause pulls, Happy hour and Pack goal; the queue and this stream's blocks; overlay controls (refresh, test pull, show a card, scene); one merged live feed (requests, pulls, events, refusals, errors) with filters, replacing Latest requests and the Log tab's recent list. Desktop layout: controls on the left, the feed on the right; stacked on a phone.
- **What viewers get:** one card per reward type (Paid pulls, `!pack` packs, Event rewards, Raid shout-out, Big pull rules, Chat commands, Stream Deck buffs; Track 58's channel points join later), each showing a one-line summary and opening its settings.
- **Saving:** one Save per card with an "Unsaved changes" marker, Discard, and a warning when leaving with changes.
- **Hints:** one short line per card, the rest behind a "How?" toggle.
- **Direct addresses:** kept, folded under "Advanced: connect without TCG Bridge" in Connections.
- **Mockup:** a clickable mockup of the whole page with demo data (https://claude.ai/artifact/MYndvn2Skt8Hx5fiabKkMZ, private to Josh); Josh likes it, so it is the direction for 63.1.
- **Build split:** section by section; old tabs stay reachable until their section lands.

### 63.1 Design pass (After Track 58; Needs design: Opus, then Josh)
Walk every tab, panel and the Setup wizard as they stand, finish the audit (every setting, test and log mapped to its new section), and build the clickable mockup from the choices above. Josh comments; adjust until he signs off. No change to what any setting does.

### 63.2 Shell, status strip and Live (After 63.1)
The Stream page with its five sections, the status strip, the rename and redirects, and the Live section. The old tabs stay reachable from the sections not yet built.

### 63.3 What viewers get (After 63.2)
The reward cards and the save-per-card pattern, with the one "Mix It Up commands" helper (webhook address and secret once) shared by every reward.

### 63.4 Connections and first-run setup (After 63.2)
TCG Bridge PCs with their accounts, Mix It Up, OBS, the Twitch channel (from Track 58), the command check and error reports; direct addresses under Advanced; the Setup wizard as the first-run state.

### 63.5 Test and History (After 63.2)
Every test in one place; History with the full log and filters, the ledger check, uptime and backups. Removes the old tabs.

## Track 61: Stream Deck plugin fix and more keys (2026-10-28)

Josh: the plugin's keys don't work; fix that, then add queue, staff, live info and OBS / overlay keys. The plugin is `streamdeck/` (Elgato SDK, UUID `tv.cheesygidds.tcgbridge`, built into `bin/plugin.js`), talking to the app's `DeckServer` (`bridge/src/deck.ts`) on 127.0.0.1 with the port and token from `%APPDATA%\TCG Bridge\streamdeck.json`; the plugin's version always equals the bridge's (`x.y.z.0`). Every item bumps the bridge minor and keeps the Mix It Up Stream Deck commands working.

### 61.1 Fix the keys (Done, #658, bridge 0.34.0: the manifest asked for Stream Deck 6.9, the SDK needs 7.1, so the plugin crashed on start)
1. **Reproduce first.** Josh reports the keys do nothing or the wrong thing. Walk the whole path on the code and with `bridge/scripts/check-deck.ts`'s real server: install from TCG Bridge (does the packed plugin contain `bin/plugin.js` and its `node_modules`, is the manifest's `CodePath` right, does Stream Deck 6.9+ load it), the link (is `DeckServer` running: it only listens while the Settings switch is on, and that switch moved in 59.4 / 59.6; is `streamdeck.json` written where the plugin reads it, port and token current after an app restart), the key press (action UUIDs in the manifest match `keys.ts`, settings from the property inspector reach the key, the request reaches `runStaffKey` / the control actions), and the answer (title / state / alert on the key).
2. Ask Josh for the Stream Deck app's plugin log (`%APPDATA%\Elgato\StreamDeck\logs\tv.cheesygidds.tcgbridge*.log`) and TCG Bridge's log if the code walk does not find it.
3. Fix every cause found; the app shows the link state plainly on the Stream Deck plugin connection (59.6) and in the status pill when the plugin is installed but not linked.
4. **Checks:** an end-to-end check in `bridge/scripts/check-deck.ts` that runs the built plugin's link and key code against the real `DeckServer` for each existing key (buff, last buff, pause pulls, happy hour); a pack check that the `.streamDeckPlugin` holds everything the manifest points at.

### 61.2 Queue keys (Done, #661, bridge 0.36.0)
Skip next pull, Clear queue (hold 1 s, like ending a happy hour), and a key that shows how many are waiting (polled from the app, not the site, at most every 5 s). Paid pulls skipped or cleared are refunded as today.

### 61.3 Staff keys (Done, #663, bridge 0.37.0)
Pause / resume trading, switch to a chosen scene, open the preview overlay. Shown only on a staff PC and refused with the 58.0 role rules (a mod-linked PC gets only mod actions).

### 61.4 Live info keys (After 61.3, S)
Keys that show a number or name: pulls this stream, last big pull, top puller, pack goal progress (`Label: 37 / 50`), happy hour time left. From the app's existing state (59.5 numbers, 57.4 / 57.5 stats); no new site calls.

### 61.5 OBS and overlay keys (After 61.4, S)
Refresh overlay, test pull, show a card (chosen in the property inspector), run the checklist (key turns green or red with the count). Test pull and show a card warn as the app does that they play on the live overlay.

## Track 62: native OBS plugin (2026-10-28)

Josh: a native OBS plugin (not a browser dock) for TCG Bridge. After Track 58, before the wiki (Track 60).

### 62.1 Design pass (Needs design: Opus, then Josh)
Decide what the plugin does that a browser dock or the app cannot: a native dock with the live controls (pause pulls, happy hour, queue, feed), TCG sources (the overlay, live stats, pack goal) added and kept in the right scene by the plugin, scene-change hooks without the WebSocket, or all of these. How it talks to TCG Bridge (the same local link as the Stream Deck plugin, a token in a file the app writes). Build: C/C++ from the obs-plugintemplate with CMake, Windows x64 only, built in CI against the OBS version range it supports, shipped inside TCG Bridge and installed from the app like the Stream Deck plugin; what happens when OBS updates. Its version follows the bridge's. Mockups and a build split (62.2 onward) for Josh before any build.

## Track 60: staff wiki refresh (2026-10-28)

Josh: a complete update to the staff wiki (`content/wiki/*.md`, shown at /admin/wiki, and at /mod/guide for pages with `audience: mods`), last on the roadmap so it describes everything above as built. The wiki was last updated 2026-10-27, before Tracks 55 to 59.

### 60.1 Wiki audit and rewrite (Ready, M; last)
1. **Audit.** Read every page against the site and TCG Bridge as they stand (the area docs in `docs/`, `bridge/README.md`, the admin pages), and list what is wrong, missing or out of date. Plain-language, for staff, not developers.
2. **Update the existing twelve pages** (Overview, Cards, Environments, Glossary, Live tools, Moderation, the three mod how-tos, Support answers, Trading, Viewers): Mix It Up paid pulls and prices (55.4), happy hour, pack goal, raid shout-out and event rewards, pause reasons, the overlay preview, and anything the redesign (Track 59) moved.
3. **New pages:** TCG Bridge for the streamer (install, Twitch sign-in 58.0, the update flow, the checklist, OBS stats, errors), TCG Bridge for mods (what a staff PC can do; `audience: mods`), Twitch connection (58.1 to 58.6: channel points awards, refunds by hand, chat commands and the bot account), the Stream Deck plugin (57.13, Track 61) and the OBS plugin (Track 62). Each linked from Overview, and new words in the Glossary.
4. **Checks:** `scripts/check-wiki.mts` passes (front matter, links); the wording rules (`scripts/check-words.mts`); one PR, or two if it grows large (existing pages, then new pages).

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
