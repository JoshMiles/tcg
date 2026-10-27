# The Cheesy TCG, roadmap

**Last updated 2026-10-27**

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
| 55 | Mix It Up integration: bridge, setup wizard, Stream Deck buffs, clearer messages, more settings, command downloads, TCG Bridge app and its features, a better Mix It Up page (55.0 to 55.13) | Ready (55.4 needs a decision) | L |

Tracks 25 to 33, 36, 38, 41 to 43 (except 43.3) and 46 to 52 and 54 (except the items above) are done and archived in `docs/archive/roadmap-history.md`, including the edition / print glossary (25.2) and the 29.3 decision.

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

## Track 55: Mix It Up integration (2026-10-27)

Josh: connecting Mix It Up is confusing, there are too few settings, and Cheesygidds rewards viewers from the Stream Deck a lot, which the site cannot take today. Read `docs/admin/mixitup.md` first.

**Where it stands (2026-10-27).** Mix It Up calls the site on seven incoming webhooks (`/api/webhooks/pull`, `command`, `show-card`, `grant-card`, `collection`, `stream`, `queue` for the overlay), all on the one incoming secret. The site calls Mix It Up on up to four outgoing addresses (balance, deduct, add, chat viewers; public https only, so Mix It Up on the streamer's PC needs a tunnel). Setup is spread over Admin Settings > Webhooks (the incoming secret), the Mix It Up page's Paid pulls form and the Copy setup cards; nothing shows whether Mix It Up has ever reached the site. Buffs reach players only through trainer cards and achievements; the one live lever is "Extra pulls this stream" on the Mix It Up page. The Stream Deck runs Mix It Up commands through Mix It Up's Developer API (the Mix It Up plugin from the Elgato store, Developer API service switched on in Mix It Up), so a Stream Deck button is a Mix It Up command that calls one of our webhooks. Order: 55.0 (site side, #581), 55.6a (#582), 55.6b (#584), 55.6c, 55.6d, 55.7 (the page), the 55.1 wizard (health merged as #579; it opens from 55.7's Connection tab), 55.2, 55.8 to 55.11 (the app features Josh picked), 55.12 and 55.13 (staff tools in the app), 55.3, 55.5, and 55.4 once Josh picks. One PR per item unless it says otherwise.

**From Mix It Up's source (github.com/MixItUpBot/Desktop, read 2026-10-27).**
- Mix It Up has no action that sends a custom answer back to an HTTP request. The site's paid-pull calls (balance, deduct, add, viewers) expect a Mix It Up command to answer with JSON, which stock Mix It Up cannot do, so those addresses can only work through something in between. See 55.0.
- Mix It Up's own hosted Webhooks (a Webhook command with JSON parameters mapped to special identifiers) are one-way: the cloud pushes the call to the desktop app over a websocket and nothing is sent back.
- The Developer API listens on `http://localhost:8911` (or `http://*:8911` in its advanced mode) with no authentication. V1 has `GET /api/users/twitch/{name}` (the viewer's currency amounts), `PUT /api/users/{name}/currency/{currencyID}/adjust`, `POST /api/currency/{currencyID}/give` (bulk give), `GET /api/currency` (currency ids) and `POST /api/commands/{id}` (runs a command, with an arguments array, as the streamer, requirements ignored). The Stream Deck plugin runs commands through it, so a Stream Deck button has no viewer of its own: `$username` is the streamer.
- Command types for 55.5 are all in the source: `ChatCommandModel`, `EventCommandModel` (stream start and end), `ActionGroupCommandModel` (Stream Deck buttons) and `WebhookCommandModel`. Special identifiers are `$name`; there is no `{{...}}` syntax.

### 55.0 The Mix It Up bridge: the site queries and acts (Ready, L)
Josh (2026-10-27): the site does the checks and the currency changes itself; Mix It Up only supplies the data. Mix It Up's Developer API on the stream PC (`http://localhost:8911`, no authentication, CORS `*`) has everything needed: `GET /api/users/twitch/{name}` (the viewer's currency amounts), `PUT /api/users/{name}/currency/{currencyID}/adjust` (add or take), `GET /api/currency` (currency names and ids), `GET /api/chat/users` (who is in chat), `POST /api/chat/message` (say something in chat), `GET /api/status/version` (is it there). The cloud site cannot reach localhost, so a **bridge** on the stream PC carries the calls. The site never exposes 8911 to the internet.

**The site side (one PR, before the app).** Josh (2026-10-27): the TCG Bridge desktop app (55.6) is the bridge, built first; no browser bridge for now.
1. **Transport swap, not a rewrite.** Paid pulls, the Brie Bucks buff and community buffs already go through `callMixItUp` (balance, deduct, add, viewers) and keep their logic (reservations, refunds, grant records, logs, health). Add a bridge mode: `callMixItUp` puts a job `{ id, action, username?, amount?, currency }` on a KV list `bridge:jobs` and waits up to 8 seconds for `bridge:result:<id>` (short TTL). No answer in time is the same as Mix It Up not answering today (refused, logged, the health chip says "no bridge connected").
2. **Bridge API** (`/api/bridge/*`): `poll` (long-poll, up to 25 s, returns the next jobs and claims them atomically so two bridges never run one job; the long-poll reads KV at most once a second, about 60 commands a minute per open bridge, so keep an eye on it against Track 48), `result` (posts the outcome), `hello` (the bridge reports the Mix It Up version and the currencies it sees). Auth: the bridge token. Record the last poll in `mixitup:bridge` so the health row shows "TCG Bridge connected (4s ago)". Also `report`: the app pushes OBS facts (55.6b).
3. **Pairing:** a "Pair TCG Bridge" button on the Mix It Up page shows a one-time code (10 minutes). The app trades it at `/api/bridge/pair` for a bridge token, stored hashed in KV (`bridge:tokens`, with name, created, last seen) and listed on the page with Revoke; the token itself is shown to nobody. Every bridge call sends it as a bearer token.
4. **Settings:** a connection choice on the Paid pulls form: "Bridge (Mix It Up on this PC)" (new default) or "Addresses" (the current four addresses, kept for a relay of the streamer's own). The currency becomes a pick from the bridge's `hello` list (stored as id and name). The site can also post to chat through the bridge (`say` job), used for paid-pull refusals when the reply to Mix It Up has already gone.
5. Checks: a fake bridge in `scripts/check-mixitup.mts` (job claimed once, result delivered, timeout refuses and releases the reservation). Josh tests with the app (55.6a): a paid pull, a Brie Bucks buff. Update `docs/admin/mixitup.md`.

The app itself is 55.6. Order: this PR, then 55.6a, then 55.6b.

### 55.1 Connection health and a setup wizard (Ready, M)
1. **Health first.** Store when each incoming route last got a request with the right secret, and whether the last call to each outgoing address worked: when, the status, and the error in words. `secret:lastused` already keeps the incoming secret's last route; add a per-route hash `mixitup:seen` (route to `{at, ok}`) and set an `ok` and `at` on each outgoing log line. Show them as a status row at the top of the Mix It Up page: "Mix It Up reached the site 3 minutes ago (!pack)", "Balance address: working", "Add address: not set".
2. **Wizard** at `/admin/mixitup/setup`, full page like `SeasonFlow`, one step per screen, Back and Next, resumable (the saved settings are the state). The Mix It Up page shows "Set up Mix It Up" while nothing has connected, and "Run setup again" after.
   - *What you need:* Mix It Up running on the stream PC; for paid pulls and Brie Bucks, a public https address for Mix It Up (what a tunnel is and why localhost cannot work, in two sentences); for the Stream Deck, the Mix It Up plugin and the Developer API service.
   - *Mix It Up to the site:* the incoming secret (make one if it is empty), then "Make the !pack command", with a Copy setup card (or the download from 55.5). The step waits and turns green when `mixitup:seen` shows a request with the right secret ("Type !pack in chat now"). The wrong secret shows up as its own message ("Mix It Up reached the site but the secret did not match").
   - *The site to Mix It Up (paid pulls, Brie Bucks buffs):* download TCG Bridge (55.6), pair it with the code shown here, and wait until it reports Mix It Up found (turns green), with how to switch on Mix It Up's Developer API when it is not; pick the currency from the bridge's list; a Test button runs a balance check for the streamer through the bridge. Then OBS: the app's OBS password and the overlay check (55.6b).
   - *Pull rules:* price, currency name, limits per role, the deduct message (the Paid pulls form's fields, moved here and kept on the page too).
   - *Stream events and the Stream Deck:* the stream start and end commands, then the Stream Deck buttons from 55.2, each with its Copy setup card.
   - *Done:* a checklist of what is connected, from the health data.
3. `scripts/check-mixitup.mts` covers the health record (right secret, wrong secret, outgoing failure). Update `docs/admin/mixitup.md`.

### 55.2 Buffs and rewards from the Stream Deck (Ready, M)
1. New incoming webhook `POST /api/webhooks/buff`: `{ secret, buff, target?, username? }`. `buff` is a buff definition's id; the Buff Editor gets a "Stream Deck" switch per buff and only switched-on buffs answer (the rest are `{ ok: false, message: '' }`, like an unknown chat command). `target` is `everyone` (community scope), `viewer` (needs `username`; for a mod's chat command like `!reward @name`) or `last-pull` (the viewer of the newest pull this stream, so the streamer can reward whoever just opened a pack without typing a name; refused with a message when no one has pulled this stream). The default is the buff's own scope: community buffs go to everyone, self buffs need a target.
2. It runs through `applyBuff` with `source: 'streamdeck'`, answers `{ ok, message }` with a chat-ready line ("Everyone gets +1 pull this stream", or the refusal in words: already active, Mix It Up off, no one has pulled), and records it in the audit log, the live activity feed and the Discord admin log ("Stream Deck: everyone +1 pull").
3. Quick actions that are not buff definitions, on the same webhook with `action` instead of `buff`: `stream-pulls` with `amount` (add to "Extra pulls this stream", or `0` to clear; `pulls:stream-buff`), and `free-pack` with a target (queues one pull that never charges, like a dashboard gift).
4. A cooldown per buff for this webhook (default 10 seconds) so a double press does not apply twice.
5. The Mix It Up page gets a Stream Deck tab listing the switched-on buffs and quick actions, each with its Copy setup card (and a download once 55.5 lands). Optional overlay toast for community buffs, off by default (a new overlay event type; read `docs/overlay.md`).
6. `scripts/check-buffs.mts` (or a new `check-streamdeck.mts`) covers each target, the switch, the cooldown and the refusals.

### 55.3 Clearer two-way messages (Ready, S to M)
1. Every incoming reply carries a chat-ready `message`. Today `/api/webhooks/pull` answers a queued pull with only `{ ok: true }`; add "Opening a pack for <name>" plus `left` (paid pulls left this stream) and `balance` when known, so the `!pack` command can say them.
2. An optional `requestId` on `/api/webhooks/pull`, `grant-card` and `buff` (Mix It Up's unique id special identifier, if it has one, else any value the command makes): a repeat within 10 minutes answers the first result and does nothing again, so a retried request never queues a second pack.
3. The Log tab shows incoming requests too (route, viewer, result, the refusal reason), not only the site's calls out. Keep the last 50, never Discord.
4. Outgoing calls: a 5 second timeout with the reason in words on the Log tab ("Mix It Up did not answer in 5 seconds"). If the balance address fails 3 times in a row while live, post once to the Discord System channel.
5. Update `docs/admin/mixitup.md` with every reply shape.

### 55.4 More settings (Needs a decision: Josh picks, S to M each)
Suggested; Josh picks which to build, then each is its own PR.
- **Editable chat replies:** the refusal messages (not enough Brie Bucks, limit reached, Mix It Up unavailable, no packs) and the new "pack queued" reply, with `{balance}`, `{cost}`, `{left}`, `{username}`.
- **Price per role:** subscribers and VIPs pay a different price; blank uses the base price.
- **Happy hour:** a price discount or a free pack for N minutes, started from the page or a Stream Deck button (55.2 quick action).
- **Cooldown between paid pulls** per viewer, in seconds.
- **Queue cap:** refuse new pulls with a message while N are waiting on the overlay.
- **Pick a pack:** `!pack <name>` opens that pack when the season has several, with an optional price per pack.
- **Event rewards:** Mix It Up events (gifted subs, bits, raids, channel point redeems) give free packs or a buff, each switch and amount on the page, sent to `/api/webhooks/pull` or `buff` with a `reason` so the log and feed say why.
- **First pack free:** a viewer's first ever pull costs nothing.

### 55.5 Download command presets for Mix It Up (Ready, M)
Josh exported a sample on 2026-10-27: `scripts/fixtures/mixitup-chat-command.miucommand` (the secret replaced with `YOUR_INCOMING_SECRET`). A `.miucommand` file is one JSON object written by Json.NET with `$type` on every object, so it must be written with those exact `$type` strings and key order kept as in the sample. What the sample shows:
- The command: `ChatCommandModel` (`Type: 1`), `Name`, `Triggers` (without the `!`; `IncludeExclamation: true` adds it), `IsEnabled`, a fresh `ID` (a UUID) and the `Requirements` set (role, arguments, threshold, settings; copy the sample's values: `UserRole: 100` is everyone).
- `WebRequestActionModel` (`Type: 11`): `Url`, `HttpMethod: 1` (POST), `RequestBody` (a JSON string), `CustomHeaders` (an empty dictionary with its own `$type`), `ResponseType: 1` (JSON) and `JSONToSpecialIdentifiers`, a dictionary from a reply key to a special identifier name (key `message` to `reply` makes `$reply`).
- `ChatActionModel` (`Type: 1`): `ChatText` using Mix It Up's `$` identifiers (`$username`, `$reply`), `SendAsStreamer: false`.
- Each action has its own fresh `ID`, `Name`, `Type` and `Enabled: true`.

1. **Generator** `lib/mixitup-presets.ts` (pure): `chatCommandFile({ name, aliases, url, body, replyKeys, chatText })` returns the file text, with new UUIDs each call. The body uses Mix It Up's identifiers (`$username`, `$allargs`), never `{{...}}`. Every reply key the route answers (`message` and the command's `vars`) is mapped to a special identifier so the Chat Message can use them.
2. **Downloads:** each chat-command setup card (`!pack`, every switched-on command from the Commands tab, `!showoff`, and the Stream Deck buttons from 55.2 once they exist) gets "Download for Mix It Up", served by a staff-only route (`requireAdmin`) as `<name>.miucommand` with the real incoming secret and site URL filled in. One file per command (Mix It Up imports one at a time); no zip. The button says the file holds the secret and must not be shared; the page offers to rotate the secret.
3. **Also in this item, from the source** (no more samples needed): stream start and end as `EventCommandModel` files and Stream Deck buttons as `ActionGroupCommandModel` files, each with a Web Request action; read the model classes and the `EventTypeEnum` values in github.com/MixItUpBot/Desktop. Josh test-imports one of each before merge. No files for balance, deduct, add or viewers (see 55.0).
4. `scripts/check-mixitup-presets.mts`: the generated file parses, has the same `$type`s and keys as the fixture, fresh IDs each call, and the secret and URL in the body. Josh imports one generated file into Mix It Up before merge (that can't be checked locally).

### 55.6 TCG Bridge desktop app (Ready, after 55.0's site side)
Josh (2026-10-27): a small app the streamer opens when streaming, built first, so the link to Mix It Up never depends on a browser tab; it talks to OBS too. It speaks the bridge API from 55.0.

**Decisions (Opus, 2026-10-27):** Electron with TypeScript (Josh named it), in `bridge/` in this repo with its own `package.json` (kept out of the Next build and the root `tsconfig`; `npm run verify` gains a typecheck of `bridge/`). Windows only (Mix It Up is Windows only). `electron-builder` makes an NSIS installer; a GitHub Action on `windows-latest` builds it on a `bridge-v*` tag and attaches it to a GitHub Release; `electron-updater` updates from those releases. Unsigned at first: Windows SmartScreen shows "More info, Run anyway" on install; buying a code-signing certificate is Josh's call later. The token and the OBS password are stored with Electron `safeStorage`, never sent anywhere else. The app only runs the fixed job types below against fixed local addresses; it never fetches an address the site sends.

**55.6a The app and Mix It Up (M to L).**
- Tray icon (connected, partly connected, not connected) and a small window: Site (paired as, last poll), Mix It Up (found, version, Developer API on or off, the chosen currency), OBS (55.6b), and the last 50 jobs with their results. Start with Windows (switch, on by default) and start minimised.
- First run: paste the pairing code from the Mix It Up page; the app calls `/api/bridge/hello` with the Mix It Up version and currencies.
- Jobs: `balance`, `deduct`, `add` (Developer API user currency endpoints for the chosen currency id), `viewers` (`/api/chat/users`), `say` (`/api/chat/message`). The long-poll loop reconnects with backoff; Mix It Up not running answers each job "Mix It Up not running" at once instead of timing out.
- A check script under `bridge/` with a fake Developer API and a fake site: each job type, Mix It Up missing, a revoked token (the app shows "Pair again").
- Docs: `docs/admin/mixitup.md` gets a TCG Bridge section (install, pair, what each status means); the Mix It Up page links the latest release.

**55.6b OBS (M).** obs-websocket v5, built into OBS 28 and later (`ws://localhost:4455`, the password from OBS > Tools > WebSocket Server Settings, entered in the app).
- **Stream live and offline at once:** on OBS's `StreamStateChanged` the app reports live or offline through `/api/bridge/report`, which calls `setLiveFromHint` like the Mix It Up stream webhook does, so the stream marker, recap and live gates no longer wait on Twitch's lag.
- **Overlay check:** the app finds the browser source whose URL is the TCG overlay (`/widget`), and reports whether it exists, whether it is in the current program scene and visible, and the scene name. The Mix It Up page's health row (and the dashboard's overlay status, docs/overlay.md) shows "Overlay in OBS: visible in Gameplay".
- **Refresh the overlay from the site:** a "Refresh overlay in OBS" button (Admin Settings > OBS Overlay) sends an `obs-refresh` job; the app presses the source's "Refresh cache of current page" button.
- Not in this item (ideas for later, Josh picks): switch to a scene on a big pull, mute or show sources during pack openings.
- Check: a fake obs-websocket server in the bridge check script.

**55.6c Reliability and self-help in the app (M).** Josh (2026-10-27): more useful features in the app. All app side; bump the version.
- **Alerts:** a Windows notification when the site, Mix It Up or OBS link drops while OBS says the stream is live, and one when it comes back (no repeat within 2 minutes). A switch in the window, on by default.
- **Self-tests in the window:** "Test Mix It Up" (finds the chosen currency and reads the streamer's own balance), "Send test chat message", "Check OBS" (runs the overlay check now). Each shows the result in words.
- **Start Mix It Up:** when Mix It Up is not found, a "Start Mix It Up" button (the default install path, or a path picked once and saved); a "Start Mix It Up with TCG Bridge" switch, off by default. Only the saved local path is ever launched.
- **Diagnostics:** a log file in the app's data folder (kept 7 days; never the token, the OBS password, the incoming secret or the overlay key), "Open log folder", and "Copy diagnostics" (versions, statuses, the last 20 jobs, no secrets).
- **Updates:** "Check for updates" and the version in the window; after an update, "Updated to 0.x" with a link to the release.
- Checks: alerts fire once per drop and only while live; diagnostics hold no secret (grep the output in the check).

**55.6d Mix It Up commands on big pulls (M).** The site sends a new `run-command` job when a pull matches a rule; the app runs that Mix It Up command (`POST /api/commands/{id}` with the viewer and card name as arguments) so Mix It Up can play a sound, run lights or post its own message.
- The app reports Mix It Up's commands (`GET /api/commands`, name and id; check the controller in github.com/MixItUpBot/Desktop) in `hello` and every 5 minutes; the site keeps the list in `mixitup:bridge`.
- Rules on the Mix It Up page: rarity, variant or "new to the dex" picks a command from that list (up to 10 rules; the first match wins). The app runs only an id it reported itself. Fire and forget: a pull never waits on it.
- Checks: a rule matches once per pull, an unknown id is refused by the app, no job when no bridge is paired.

### 55.7 A better Mix It Up page (Ready, M to L)
Josh (2026-10-27): the Mix It Up page should look better and be more useful. Today it is three tabs (Paid pulls, which also holds TCG Bridge pairing and the connection switch; Commands; Log) under a row of health chips. Read `docs/admin.md` (admin UX conventions) and `docs/admin/mixitup.md` first. After 55.6b (it touches the same chips).
1. **Overview tab, the new default.** Three status cards in plain words, each with what to do when it is not green and a link to the fix: *Mix It Up to the site* (last request per webhook, a wrong secret), *the site to Mix It Up* (TCG Bridge paired and last poll, Mix It Up found and its version, the currency), *OBS* (the overlay check from 55.6b). Then "This stream": paid pulls, Brie Bucks taken and refunded, commands run, refusals and the top reason, from the existing logs (read what they hold first; add a counter only if a number cannot come from them). Then quick actions: test a balance check, send a test chat message, refresh the overlay in OBS, extra pulls this stream. Then the last 5 log rows with "See all".
2. **Connection tab:** TCG Bridge download and pairing, the paired apps, the connection switch, and the direct outgoing addresses folded under "Advanced". A "Set up Mix It Up" button here (and on Overview while anything is red) opens the 55.1 wizard once it exists.
3. **Paid pulls tab:** only prices, limits and messages, grouped in cards, with a preview of each chat message filled with sample values.
4. **Log tab:** filters (incoming, outgoing, refusals only) and the time on each row.
5. The health chips stay as a one-line summary on the other tabs. Check it at phone width. Update `docs/admin/mixitup.md` and the screenshots in it, if any.

### 55.8 to 55.11 TCG Bridge features Josh picked (2026-10-27)
Josh picked all sixteen from a list. Each item is one PR and bumps the app version. Rules for all of them:
- The app still runs only fixed action types.
- OBS scene and source names come from lists the app reports, never free text from the site.
- Anything that writes on the site goes through a bearer-token bridge route with `bridgeGuard`.
- Every new rule or switch is off by default.

**55.8 Big pulls in OBS (M to L).** Builds on 55.6d's pull rules (rarity, variant, new to the dex). Each rule can also do any of these:
- **Save a clip:** OBS `SaveReplayBuffer` a few seconds after the reveal, so the reaction is in it. The app says plainly when the replay buffer is off, and has a "Start the replay buffer when the stream starts" switch.
- **Switch scene:** go to a chosen scene for N seconds, then back to the scene that was on.
- **Show a source:** show a chosen source while the pack opens, then hide it.

How it works:
- **Timing:** these follow the overlay's reveal, not the moment the pull is queued, because the queue can hold several pulls.
  - The overlay already reports to the site. It adds a reveal report with the event id.
  - The site turns that into a fire-and-forget `pull-event` job, so it lands within about a second through the long poll.
  - Check what `widget.js` already sends (`/api/overlay/heartbeat`, `/api/webhooks/notify`) before adding a route.
- **The app** reports its scene list and source list (names only) with each OBS snapshot.
- **Overlay watchdog (also here):**
  - While live, if the overlay's heartbeat (`/api/overlay/heartbeat`) is older than 30 s and OBS shows the overlay source, the site sends `obs-refresh` by itself.
  - At most once every 5 minutes, logged, and the health row says so.
  - A switch on the Mix It Up page.
- **Check:** the fake OBS in the bridge checks gets `SaveReplayBuffer`, `SetCurrentProgramScene` and `SetSceneItemEnabled`.

**55.9 Control from the PC (M to L). After 55.2.**
- **Direct Stream Deck buttons:**
  - The app listens on `127.0.0.1` only, on a fixed port (pick one that is free and say why). A random key per install sits in the path, so another page in a browser cannot trigger it.
  - Each button is a URL for a Stream Deck "Website" action with "GET request in background" ticked.
  - Actions: a 55.2 buff by id, pause or resume pulls, refresh the overlay, and the last buff again.
  - The app forwards each one to a new `/api/bridge/action`. The window lists every button with Copy.
  - These sit beside the 55.2 Mix It Up commands; they don't replace them.
- **Pause pulls:**
  - The setting is `pulls:paused` on the site. Paid pulls and `!pack` answer "Packs are paused, back soon" while it is on.
  - Switches: in the tray menu, the app window, the Mix It Up page and a Stream Deck button.
  - Optional chat lines on pause and resume.
- **Global hotkeys:** Electron `globalShortcut` for refresh overlay, pause or resume pulls and the last buff. Each is set in the window and starts empty. A clash with another app says so.
- **Queue control:**
  - The app shows the overlay queue: who, which pack, and how long it has waited. It reads a new `/api/bridge/queue`.
  - Skip the next pull, or clear the queue (`clearQueueAction` already exists on the dashboard; reuse its code).
  - A skipped pull is refunded like a refused paid pull. Read docs/overlay.md and the ticket rules first.

**55.10 Chat and Brie Bucks (M).**
- **Stream start and end posts:**
  - When the site marks the stream live, it sends a `say` job: "Packs are open: type !pack".
  - When the stream ends, the top pull and the top three pullers, from the stream recap (`buildStreamRecap`, `stream:recap:latest`; docs/admin/discord.md).
  - The wording is editable on the Mix It Up page, with variables.
- **Big pull shout:** a 55.6d rule can also send a chat line with variables (viewer, card, rarity, edition). The line goes on the reveal (55.8 timing), never before the overlay shows the card.
- **Brie Bucks backup:**
  - At stream start and end the app saves every viewer's Brie Bucks to a CSV in `Documents\TCG Bridge\backups`, keeping 30.
  - Check the Developer API source for a user list endpoint. If there is none, back up the viewers the site knows, a few at a time.
  - The window has "Open backups".
- **Brie Bucks check:**
  - The app keeps its own ledger of every adjust it made (job id, viewer, amount, Mix It Up's answer).
  - At stream end the site compares it with its own record of charges and refunds for that stream. It lists any job one side has and the other lacks, or with a different amount, on the Mix It Up page and in the admin log.
  - Balances themselves are not compared: viewers earn and spend Brie Bucks in Mix It Up outside the game.

**55.11 Streamer tools (M).**
- **Live pull feed window:**
  - A second, resizable app window that can stay on top. It shows each pull on its reveal: the viewer, the card image, rarity and edition.
  - It plays a sound on a chosen rarity or above, with volume and mute.
  - It is fed by the 55.8 `pull-event` job, so it needs no extra KV reads.
- **End of stream summary:** when the recap is built, the app shows a notification and a summary window: packs, big pulls, top pullers, Brie Bucks taken and refunded. "Copy for Discord" copies plain Markdown. Reuse the recap, don't recount.
- **Start OBS with the app:** like Start Mix It Up (55.6c): the default `C:\Program Files\obs-studio\bin\64bit\obs64.exe` (started with that folder as its working directory, or OBS cannot find its files), a path chosen once, and a switch, off by default.
- **Uptime history:**
  - The site keeps the up and down changes of the bridge, Mix It Up and OBS (from the reports it already gets) per stream, in a capped KV list (last 10 streams).
  - The 55.7 Overview shows them as a timeline strip per stream.

### 55.12 and 55.13 Staff tools in TCG Bridge (Josh picked, 2026-10-27)
Josh asked for admin features in the app for quick use, and picked all sixteen from a list. Notices must each be switchable in the app's settings.

**Decisions (Opus), for both items:**
- **Off by default, per PC.**
  - A paired PC has no staff powers until an admin switches on "Staff tools on this PC" for it on the Mix It Up page (`bridge:tokens` records the switch and the admin who paired it).
  - Every staff route checks the switch with a new `bridgeStaffGuard`: `bridgeGuard` plus the flag.
  - Revoking the PC ends it.
- **Same rules as the dashboard.**
  - Each action calls the same server function the admin page uses (read `quickAction`, `clearQueueAction`, the grant action, `docs/admin.md`), never a copy.
  - `recordAudit` names the PC and the admin who paired it ("via TCG Bridge on Stream PC, paired by X").
  - The admin log on Discord sees it like any staff action (docs/admin/discord.md).
- **No new long-lived reads:**
  - Panels read only while their tab is open (every 5 s at most).
  - Notices ride the existing job long poll as fire-and-forget `notice` jobs. A notice sent while the app is offline is dropped, and the notice tab says so.
- Each item is one PR, bumps the app version, and has checks:
  - a PC without the switch gets 403 on every staff route;
  - every action writes an audit line;
  - nothing runs in a sandbox.

**55.12 Viewer and stream actions (L).** A Staff tab in the app's window. Viewer names autocomplete from the site's users.
- **Gift packs:** viewer, number, pack (the active packs list), "Send". It is refused with "queue anyway" when no overlay is connected, exactly like the dashboard.
- **Grant a card:** search cards by name (active season first), pick a variant, then grant, with the grant's own rules and audit.
- **Show a collection:** a viewer's collection, or one of their cards as a show-off, on the overlay.
- **Look up a viewer:**
  - From the site: cards owned, rank, last 5 pulls, recent refusals.
  - From Mix It Up, read locally: their Brie Bucks.
  - "Open in admin" opens their admin page in the browser.
- **Extra pulls this stream:** set or clear the stream buff (`getStreamBuff`, the Mix It Up page's control).
- **Switch overlay scene:** the Overlay Editor's scenes as a list (read docs/overlay.md for how a scene is made active). Also in the tray menu.
- **Pause trading:** pause or resume from the tab and the tray, with the trading pause that already exists (docs/trading.md). It asks to confirm.
- **Block a viewer from pulls:** for the rest of this stream (keyed to the stream marker) or until lifted.
  - Paid pulls, `!pack` and gifts are refused with a plain message.
  - Listed on the Mix It Up page with "Lift".
  - Read how refusals are recorded and reuse that.

**55.13 Staff notices and shortcuts (M).**
- **Notices:** each kind has its own switch in the app's settings. All are on once staff tools are on, and none of them is sent to a PC without them.
  - **Needs attention:** the dashboard's items, sent when one appears (`autoDisabledChannels`, backup and data-health crossings, `lib/system-notices.ts`).
  - **New reports and feedback:** with a link to the item.
  - **Paid pull refusals:** every refusal except "not enough Brie Bucks", at most one per reason per minute.
  - **Deploys:** when a new build goes live (the build stamp, docs/hosting.md), with its changelog lines if any.

  Clicking a notice opens its page in the browser.
- **Admin links in the tray:** Dashboard, Mix It Up, Overlay Editor, Users, opened in the default browser.
- **Back up now:** runs the same backup as Admin Settings (docs/hosting.md), and says when it is done or why it failed.
- **Recent activity panel:** an Activity tab with the dashboard's recent activity (pulls, grants, trades), read while the tab is open.
- **Quick search:** one box that finds a viewer, card or pack (reuse the admin palette's search, `/api/admin/palette`) and opens its admin page in the browser.

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
