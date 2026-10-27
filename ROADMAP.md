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
| 55 | Mix It Up: command downloads (55.5), more settings (55.4) | 55.5 in review (#603); 55.4 needs a decision | M |

Tracks 25 to 33, 36, 38, 41 to 43 (except 43.3) and 46 to 52, 54 and 55 (except the items above) are done and archived in `docs/archive/roadmap-history.md`, including the edition / print glossary (25.2) and the 29.3 decision.

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

Josh: connecting Mix It Up is confusing, there are too few settings, and Cheesygidds rewards viewers from the Stream Deck a lot. Read `docs/admin/mixitup.md` first; it describes the bridge, the TCG Bridge app, the page, the wizard, buffs, test pulls and every reply shape as built.

**Where it stands (2026-10-27).** 55.0 to 55.3 and 55.6 to 55.14 are done (#579 to #602, archived). Left: 55.5 (PR #603 open, waits for Josh to test-import a file) and 55.4 (Josh picks).

**From Mix It Up's source (github.com/MixItUpBot/Desktop, read 2026-10-27).**
- Mix It Up has no action that sends a custom answer back to an HTTP request. The site's paid-pull calls (balance, deduct, add, viewers) expect a Mix It Up command to answer with JSON, which stock Mix It Up cannot do, so those addresses can only work through something in between. See 55.0.
- Mix It Up's own hosted Webhooks (a Webhook command with JSON parameters mapped to special identifiers) are one-way: the cloud pushes the call to the desktop app over a websocket and nothing is sent back.
- The Developer API listens on `http://localhost:8911` (or `http://*:8911` in its advanced mode) with no authentication. V1 has `GET /api/users/twitch/{name}` (the viewer's currency amounts), `PUT /api/users/{name}/currency/{currencyID}/adjust`, `POST /api/currency/{currencyID}/give` (bulk give), `GET /api/currency` (currency ids) and `POST /api/commands/{id}` (runs a command, with an arguments array, as the streamer, requirements ignored). The Stream Deck plugin runs commands through it, so a Stream Deck button has no viewer of its own: `$username` is the streamer.
- Command types for 55.5 are all in the source: `ChatCommandModel`, `EventCommandModel` (stream start and end), `ActionGroupCommandModel` (Stream Deck buttons) and `WebhookCommandModel`. Special identifiers are `$name`; there is no `{{...}}` syntax.

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

### 55.5 Download command presets for Mix It Up (In review: #603, M)
Josh exported a sample on 2026-10-27: `scripts/fixtures/mixitup-chat-command.miucommand` (the secret replaced with `YOUR_INCOMING_SECRET`). A `.miucommand` file is one JSON object written by Json.NET with `$type` on every object, so it must be written with those exact `$type` strings and key order kept as in the sample. What the sample shows:
- The command: `ChatCommandModel` (`Type: 1`), `Name`, `Triggers` (without the `!`; `IncludeExclamation: true` adds it), `IsEnabled`, a fresh `ID` (a UUID) and the `Requirements` set (role, arguments, threshold, settings; copy the sample's values: `UserRole: 100` is everyone).
- `WebRequestActionModel` (`Type: 11`): `Url`, `HttpMethod: 1` (POST), `RequestBody` (a JSON string), `CustomHeaders` (an empty dictionary with its own `$type`), `ResponseType: 1` (JSON) and `JSONToSpecialIdentifiers`, a dictionary from a reply key to a special identifier name (key `message` to `reply` makes `$reply`).
- `ChatActionModel` (`Type: 1`): `ChatText` using Mix It Up's `$` identifiers (`$username`, `$reply`), `SendAsStreamer: false`.
- Each action has its own fresh `ID`, `Name`, `Type` and `Enabled: true`.

1. **Generator** `lib/mixitup-presets.ts` (pure): `chatCommandFile({ name, aliases, url, body, replyKeys, chatText })` returns the file text, with new UUIDs each call. The body uses Mix It Up's identifiers (`$username`, `$allargs`), never `{{...}}`. Every reply key the route answers (`message` and the command's `vars`) is mapped to a special identifier so the Chat Message can use them.
2. **Downloads:** each chat-command setup card (`!pack`, every switched-on command from the Commands tab, `!showoff`, and the Stream Deck buttons from 55.2 once they exist) gets "Download for Mix It Up", served by a staff-only route (`requireAdmin`) as `<name>.miucommand` with the real incoming secret and site URL filled in. One file per command (Mix It Up imports one at a time); no zip. The button says the file holds the secret and must not be shared; the page offers to rotate the secret.
3. **Also in this item, from the source** (no more samples needed): stream start and end as `EventCommandModel` files and Stream Deck buttons as `ActionGroupCommandModel` files, each with a Web Request action; read the model classes and the `EventTypeEnum` values in github.com/MixItUpBot/Desktop. Josh test-imports one of each before merge. No files for balance, deduct, add or viewers (see 55.0).
4. `scripts/check-mixitup-presets.mts`: the generated file parses, has the same `$type`s and keys as the fixture, fresh IDs each call, and the secret and URL in the body. Josh imports one generated file into Mix It Up before merge (that can't be checked locally).

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
