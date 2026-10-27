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
| 55 | Mix It Up integration: bridge, setup wizard, Stream Deck buffs, clearer messages, more settings, command downloads, TCG Bridge app (55.0 to 55.6) | Ready (55.4 needs a decision, 55.6 needs design) | L |

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

**Where it stands (2026-10-27).** Mix It Up calls the site on seven incoming webhooks (`/api/webhooks/pull`, `command`, `show-card`, `grant-card`, `collection`, `stream`, `queue` for the overlay), all on the one incoming secret. The site calls Mix It Up on up to four outgoing addresses (balance, deduct, add, chat viewers; public https only, so Mix It Up on the streamer's PC needs a tunnel). Setup is spread over Admin Settings > Webhooks (the incoming secret), the Mix It Up page's Paid pulls form and the Copy setup cards; nothing shows whether Mix It Up has ever reached the site. Buffs reach players only through trainer cards and achievements; the one live lever is "Extra pulls this stream" on the Mix It Up page. The Stream Deck runs Mix It Up commands through Mix It Up's Developer API (the Mix It Up plugin from the Elgato store, Developer API service switched on in Mix It Up), so a Stream Deck button is a Mix It Up command that calls one of our webhooks. Order: 55.1 (health merged as #579, then the wizard), 55.0, 55.2, 55.3, 55.5, 55.6, and 55.4 once Josh picks. One PR per item unless it says otherwise.

**From Mix It Up's source (github.com/MixItUpBot/Desktop, read 2026-10-27).**
- Mix It Up has no action that sends a custom answer back to an HTTP request. The site's paid-pull calls (balance, deduct, add, viewers) expect a Mix It Up command to answer with JSON, which stock Mix It Up cannot do, so those addresses can only work through something in between. See 55.0.
- Mix It Up's own hosted Webhooks (a Webhook command with JSON parameters mapped to special identifiers) are one-way: the cloud pushes the call to the desktop app over a websocket and nothing is sent back.
- The Developer API listens on `http://localhost:8911` (or `http://*:8911` in its advanced mode) with no authentication. V1 has `GET /api/users/twitch/{name}` (the viewer's currency amounts), `PUT /api/users/{name}/currency/{currencyID}/adjust`, `POST /api/currency/{currencyID}/give` (bulk give), `GET /api/currency` (currency ids) and `POST /api/commands/{id}` (runs a command, with an arguments array, as the streamer, requirements ignored). The Stream Deck plugin runs commands through it, so a Stream Deck button has no viewer of its own: `$username` is the streamer.
- Command types for 55.5 are all in the source: `ChatCommandModel`, `EventCommandModel` (stream start and end), `ActionGroupCommandModel` (Stream Deck buttons) and `WebhookCommandModel`. Special identifiers are `$name`; there is no `{{...}}` syntax.

### 55.0 The Mix It Up bridge: the site queries and acts (Ready, L)
Josh (2026-10-27): the site does the checks and the currency changes itself; Mix It Up only supplies the data. Mix It Up's Developer API on the stream PC (`http://localhost:8911`, no authentication, CORS `*`) has everything needed: `GET /api/users/twitch/{name}` (the viewer's currency amounts), `PUT /api/users/{name}/currency/{currencyID}/adjust` (add or take), `GET /api/currency` (currency names and ids), `GET /api/chat/users` (who is in chat), `POST /api/chat/message` (say something in chat), `GET /api/status/version` (is it there). The cloud site cannot reach localhost, so a **bridge** on the stream PC carries the calls. The site never exposes 8911 to the internet.

**PR 1: the bridge protocol and the browser bridge.**
1. **Transport swap, not a rewrite.** Paid pulls, the Brie Bucks buff and community buffs already go through `callMixItUp` (balance, deduct, add, viewers) and keep their logic (reservations, refunds, grant records, logs, health). Add a bridge mode: `callMixItUp` puts a job `{ id, action, username?, amount?, currency }` on a KV list `bridge:jobs` and waits up to 8 seconds for `bridge:result:<id>` (short TTL). No answer in time is the same as Mix It Up not answering today (refused, logged, the health chip says "no bridge connected").
2. **Bridge API** (`/api/bridge/*`): `poll` (long-poll, up to 25 s, returns the next jobs and claims them atomically so two bridges never run one job; the long-poll reads KV at most once a second, about 60 commands a minute per open bridge, so keep an eye on it against Track 48), `result` (posts the outcome), `hello` (the bridge reports the Mix It Up version and the currencies it sees). Auth: a staff session (the browser bridge) or a bridge token (the desktop app, PR 2). Record the last poll in `mixitup:bridge` so the health row shows "Bridge connected (admin page, 4s ago)".
3. **Browser bridge:** a small client component in the admin shell (`AdminShell`) that runs on every admin page. It first calls `GET http://localhost:8911/api/status/version`; only when that answers does it start long-polling, so a mod's browser on another PC never becomes a bridge. It maps jobs to Developer API calls (balance from the user's currency amounts for the chosen currency id; deduct and add through `adjust`; viewers from `/api/chat/users`), never `setInterval` (Chrome slows timers in background tabs; a long-poll loop driven by fetch is not throttled the same way). It shows a small "Mix It Up bridge on" indicator in the sidebar footer. Chrome asks once to allow access to apps on this device; the wizard (55.1) explains the prompt.
4. **Settings:** a connection choice on the Paid pulls form: "Bridge (Mix It Up on this PC)" (new default) or "Addresses" (the current four addresses, kept for a relay of the streamer's own). The currency becomes a pick from the bridge's `hello` list (stored as id and name). The site can also post to chat through the bridge (`say` job), used for paid-pull refusals when the reply to Mix It Up has already gone.
5. Checks: a fake bridge in `scripts/check-mixitup.mts` (job claimed once, result delivered, timeout refuses and releases the reservation). Josh tests on stream: background tab, OBS running, a paid pull, a Brie Bucks buff. Update `docs/admin/mixitup.md`.

**PR 2 (55.6): TCG Bridge, a small desktop app.** See 55.6.

### 55.1 Connection health and a setup wizard (Ready, M)
1. **Health first.** Store when each incoming route last got a request with the right secret, and whether the last call to each outgoing address worked: when, the status, and the error in words. `secret:lastused` already keeps the incoming secret's last route; add a per-route hash `mixitup:seen` (route to `{at, ok}`) and set an `ok` and `at` on each outgoing log line. Show them as a status row at the top of the Mix It Up page: "Mix It Up reached the site 3 minutes ago (!pack)", "Balance address: working", "Add address: not set".
2. **Wizard** at `/admin/mixitup/setup`, full page like `SeasonFlow`, one step per screen, Back and Next, resumable (the saved settings are the state). The Mix It Up page shows "Set up Mix It Up" while nothing has connected, and "Run setup again" after.
   - *What you need:* Mix It Up running on the stream PC; for paid pulls and Brie Bucks, a public https address for Mix It Up (what a tunnel is and why localhost cannot work, in two sentences); for the Stream Deck, the Mix It Up plugin and the Developer API service.
   - *Mix It Up to the site:* the incoming secret (make one if it is empty), then "Make the !pack command", with a Copy setup card (or the download from 55.5). The step waits and turns green when `mixitup:seen` shows a request with the right secret ("Type !pack in chat now"). The wrong secret shows up as its own message ("Mix It Up reached the site but the secret did not match").
   - *The site to Mix It Up (optional, paid pulls):* find Mix It Up on this PC (`GET http://localhost:8911/api/status/version` from the page), say how to switch on the Developer API when it does not answer and what Chrome's "access apps on this device" prompt is, pick the currency from the bridge's list, then a Test button that runs a balance check for the streamer through the bridge. If 55.0 is not built yet, show the current address fields and their Test buttons instead.
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

### 55.6 TCG Bridge desktop app (Needs design, M to L)
Josh (2026-10-27): a small app the streamer opens when streaming, so the link to Mix It Up does not depend on a browser tab. It speaks the same bridge API as the browser bridge (55.0), so the site needs no changes beyond the bridge token.
- **Why:** never throttled like a background tab, no Chrome permission prompt, can start with Windows and sit in the tray with a clear connected / not connected state.
- **Pairing:** the admin page shows a one-time code; the app trades it for a bridge token (stored hashed in KV, listed on the Mix It Up page with Revoke, never shown again).
- **To decide before building:** Electron (familiar, about 100 MB) or something smaller (a Node single-executable or Tauri); code signing (an unsigned Windows app gets a SmartScreen warning every update); updates (GitHub Releases from this public repo); where the code lives (`bridge/` in this repo or its own repo). Also whether it should replace the browser bridge or sit beside it (both can run; jobs are claimed once).
- Build after 55.0 has run on a few streams, so the protocol is settled.

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
