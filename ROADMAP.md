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
| 63 | Admin Mix It Up page redesign: too messy; reorganise by job (63.1 design pass, then build items) | 63.1 to 63.5 done | M to L |
| 58 | Twitch through TCG Bridge: sign in to the app with Twitch, connect the channel, EventSub in the app, awards for existing channel points rewards, bits / subs / raids, chat commands replacing the Mix It Up ones (58.0 to 58.6) | Done except 58.0 item 3 (removing pairing codes), which waits for Josh's first real sign-in | L |
| 62 | Native OBS plugin for TCG Bridge (62.1 design pass, then build items) | After Track 58 | L |
| 60 | Staff wiki refresh: every page brought up to date, new pages for TCG Bridge, Twitch, the Stream Deck plugin and the OBS plugin (60.1) | Last, after Tracks 61 and 62 | M |

Tracks 25 to 33, 36, 38, 41 to 43 (except 43.3) and 46 to 52 and 54 to 57 and 59 and 61 (except the items above) are done and archived in `docs/archive/roadmap-history.md`, including the edition / print glossary (25.2) and the 29.3 decision.

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

58.1 to 58.6 are done (#662, #666, #668, #669, #671 to #673; bridge 0.38.0 to 0.42.0) and archived.

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

### 63.1 Design pass (Done, 2026-10-28: Josh signed off the mockup, version 5)
Every panel today and where it goes. No change to what any setting does, except the one new action marked **new**.

**Josh's answers to the audit (2026-10-28):** the site gets its own Pause channel point awards button in Live (**new**: same effect and audit line as TCG Bridge's `pause-awards` action, `twitch:awards-paused`); Overlay watchdog goes to Connections under OBS; the Brie Bucks backup and charge-check switches go to Connections under Mix It Up, the last check's result to History; the stream start and end chat posts get their own card, **Stream start and end**, in What viewers get.

- **Status strip** (top of every section): replaces the health chip row (`page.tsx` `healthChips`) and the Overview's three status cards (`statusCards`); the pre-stream checklist (`readChecklist`) feeds its "N things need you" items.
- **Live:** Pulls card (Pause pulls with the "say it in chat" switch, `setPausedAction`; Pause channel point awards, **new**; Happy hour, `HappyHourBox`; Community pack goal, `PackGoalBox`; Extra pulls this stream, `setStreamExtraAction`); pull queue; Blocked from pulls (`listPullBlocks`, Lift; today inside `BridgeCard`); overlay controls (Refresh overlay `refreshOverlayInObsAction`, test pull, show a card, scene); This stream numbers (`streamNumbers`); one live feed with filters replacing Overview's Latest requests and the Log tab's list.
- **What viewers get** (one card each, save per card): Paid pulls (Charge for pulls, Price and limits, Messages: today one `saveMixItUpAction` form; `saveSettings`' `tab` switch decides which fields a form owns, so splitting it needs that logic changed with it); `!pack` packs (the read-only pack table with its Edit pack links); Event rewards (`saveEventRewardsAction`, the Redeem row's note that channel points override it); Raid shout-out (same action today, own card); Channel points (`ChannelPoints.tsx`, `saveRewardAwardsAction`, plus the awards-paused line); Stream start and end (start and end lines from `saveChatAction`); Big pull rules (`PullRules.tsx`, with its per-rule Test kept inside the editor); Chat commands (`CommandsPanel`, its Try it kept inside the editor); Stream Deck buffs (today only copy cards on the Stream Deck tab).
- **Mix It Up commands helper** (one, shared by every card): the incoming webhook address and secret once with Copy, and every download preset; replaces the copy cards on Commands (`!pack` and per command), Stream Deck, Events and the wizard. Regenerating the secret stays on Settings (`WebhookConfig`), linked.
- **Connections:** TCG Bridge PCs (`BridgeCard` without the block list: download, version line, sign-in accounts and roles, staff switch, Unlink; Pair a new PC until 58.0 item 3); Mix It Up (currency `saveConnectionAction`, Brie Bucks safety switches from `saveChatAction`, Advanced: connect without TCG Bridge with the direct addresses and the direct-address copy setup); OBS (status, fix steps, Overlay watchdog `saveWatchdogAction`); Twitch channel (`TwitchChannelCard` with Chat replies, bot and Reply as); command check (`CommandCheckCard`); error reports (`BridgeErrorsCard`, keeps the `#bridge-errors` anchor). The Setup wizard becomes the first-run state; its steps reuse these panels.
- **Test:** Simulate a paid pull (`TestPulls`: steps, Undo, last tests); Test viewers (from Connection); Check a balance and Send a test message (one copy, replacing Overview's Quick actions and Connection's Try it); who is in chat; overlay tests; chat test.
- **History:** the full log with filters (`MixItUpLog`); Brie Bucks ledger check result (`readLedgerCheck`); Uptime (`readUptime`); backups; the Twitch card's recent events stay on the card.
- **Links to move or redirect:** `?tab=` ids overview, connection, paid, bigpulls, chat, commands, streamdeck, events, log map to the new sections; `/admin/mixitup/setup`; the twitch and twitch-bot routes' `returnTo` and the OAuth callback; `lib/admin-nav.ts`, `lib/mixitup-page.ts` fix links, `lib/bridge-notice.ts`, `lib/twitch-channel.ts`, `lib/twitch-chat.ts`, `app/admin/BridgeRelease.tsx`, `app/admin/settings/DataHealthPanel.tsx` and `page.tsx`, `app/admin/buffs/BuffEditorClient.tsx`, `revalidatePath` calls (`app/bridge/link/actions.ts`, `lib/bridge-staff.ts`), TCG Bridge's menu and pair-page links (`bridge/src/main.ts`; old links keep working through the redirect, so the app can follow later), `scripts/check-route-guards.mts`, `scripts/sweep-mod-access.mjs`, the check fixtures, and the docs (`docs/admin/mixitup.md`, `content/wiki/live-tools.md` `covers:`, `docs/doc-map.json`).

### 63.2 Shell, status strip and Live (Done, #676)
The Stream page with its five sections, the status strip, the rename and redirects, and the Live section. The old tabs stay reachable from the sections not yet built.

### 63.3 What viewers get (Done, #677)
The reward cards and the save-per-card pattern, with the one "Mix It Up commands" helper (webhook address and secret once) shared by every reward.

### 63.4 Connections and first-run setup (Done, #678)
TCG Bridge PCs with their accounts, Mix It Up, OBS, the Twitch channel (from Track 58), the command check and error reports; direct addresses under Advanced; the Setup wizard as the first-run state.

### 63.5 Test and History (Done, #679)
Every test in one place (checklist, test pulls, one quick-tests panel, test viewers); History with the full log and filters, the ledger check, uptime and a line saying backups are kept by TCG Bridge on the stream PC (the site records no backup runs). Removes the sub-tabs.

## Track 62: native OBS plugin (2026-10-28)

Josh: a native OBS plugin (not a browser dock) for TCG Bridge. After Track 58, before the wiki (Track 60).

### 62.1 Design pass (Done 2026-10-29)
Josh's choices: v1 is a native dock with the live controls only (pause pulls, pause channel point awards, happy hour, queue skip and clear, the live feed); no TCG sources or scene hooks yet. It talks to TCG Bridge over the Stream Deck link (the local WebSocket on 127.0.0.1 and the token file TCG Bridge writes), ships inside TCG Bridge and is installed from it, and is built only for the OBS major version on the stream PC (31 unless Josh says otherwise). Mockup: https://claude.ai/artifact/2sfyCrnvDc284RFP5HW24P (the live dock, and the dock when TCG Bridge is not running).

### 62.2 Link additions (Done #680)
The three things the dock needs that the Stream Deck link lacks: a `pause-awards` request (the same action as the control server's), the queue list (viewer, what, seconds waiting; the first one marked showing) and the live feed (time, kind pulls / requests / events / problems, one line of text, the last 30) in the pushed state. Both copies of the protocol file stay identical and the Stream Deck plugin keeps working unchanged. Site and TCG Bridge only, no C++.

### 62.3 Plugin skeleton (Done #681)
`obs-plugin/` from obs-plugintemplate: C++, CMake, Windows x64, built in CI against OBS 31. It reads the token file, connects to TCG Bridge, and shows a dock with only "TCG Bridge connected" or the not-running state from the mockup, reconnecting by itself.

### 62.4 The dock (Done #682)
The dock as in the mockup, in Qt: header (live time, connection), the pulls and awards buttons, happy hour (time left, End, three presets), the queue with Skip and Clear, the feed with its filters, the Stream page link and the plugin version. Buttons are 44 px tall where the dock allows, readable by screen readers, and work from the keyboard.

### 62.5 Install from TCG Bridge (Ready, S; TCG Bridge release)
An "Install OBS plugin" button next to the Stream Deck one: copies the plugin from TCG Bridge into OBS's plugin folder (asks to close OBS first), and warns when the installed OBS is a newer major version than the plugin was built for. The plugin's version follows TCG Bridge's. README and the docs updated.

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
