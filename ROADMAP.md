# The Cheesy TCG, roadmap

Owned by the planning model (Opus, see "Model Workflow Guidelines" in `CLAUDE.md`). Execution picks up items marked **Ready**; anything marked **Needs design** or **Needs a decision** goes back to planning (or to the user) first. Last updated 2026-10-16 (after #169; Tracks 7 to 11 added from the second Discord list).

**Status legend:** Ready (design below is enough to build) · Needs design (planning pass first) · Needs a decision (the user chooses) · Blocked (waiting on something outside the repo) · Done.

## Rules in force

- **Twitch panel freeze (from 2026-10-15).** The extension is under Twitch review. Do not touch `public/twitch-panel/*`, `scripts/lib/twitch-package.mjs`, the behaviour or response shape of `/api/twitch/*`, or the CORS rules in `middleware.ts` until the user lifts it. Anything below that would also suit the panel is listed under "Later: next extension version".
- One feature per PR, branched from up-to-date `origin/main`. Commit locally; push / open a PR only when the user asks.
- No em dashes, no emoji in the UI, FAQ / Privacy / Terms kept in step (`scripts/check-words.mts`), `npm run verify` before every PR.

## Where things stand

The previous roadmap (safety net, CI, preview isolation, nightly backups, data health, the `CLAUDE.md` split, dependency upkeep, the page-by-page review batches) is complete as of 2026-10-15. What is left of it is the panel work, which waits for the freeze.

This roadmap is the request list from the Cheesygidds Discord (2026-10-16) plus a few additions, grouped into tracks. Each numbered item is one PR unless it says otherwise.

| # | Item | Status | Size |
|---|------|--------|------|
| 1.1 | iOS home-screen icon | Done (#144) | S |
| 1.2 | Rarest cards animate on hover (home) | Done (#144) | S |
| 2.1 | Pull events carry the copy (unique number) | Done (#147) | S |
| 2.2 | Recent pulls open the copy | Done (#151) | S |
| 2.3 | Profile "Recent pulls" with serials | Done (#154) | S |
| 2.4 | Overlay shows the unique copy number | Done (#157) | S |
| 2.5 | Card dialog: prints first, then one print's details | Done (#161) | M |
| 2.6 | A card copy is called a "print" | Done (#146) | M |
| 3.1 | Discord: several channels, each with its own events | Done (#149) | M |
| 3.2 | Discord: new event kinds (upgrades, trades, admin log, system) | Done (#152) | M |
| 3.3 | Trade page per offer (`/trade/<id>`) | Done (#150) | M |
| 3.4 | Discord: "listed for trade" channel | Done (#155) | S |
| 3.5 | GitHub and Vercel changes in Discord | Done (#149) | S |
| 3.6 | Discord delivery log | Done (#156) | S |
| 4.1 | Notices arrive fast and are hard to miss | Done (#153) | M |
| 4.2 | Notifications page (full history) | Done (#158) | S |
| 4.3 | Push notifications to phones and browsers | Done (#162) | L |
| 4.4 | Link a Discord account for DMs | Later (after 4.3) | L |
| 5.1 | Stream recap posted to Discord | Done (#160) | M |
| 6.1 to 6.4 | Track 6: community extras | Done (#166 to #169) | |
| 7.1 to 11.3 | Tracks 7 to 11: the second Discord list (30 items) | Done (#171 to #198, and #199) | |

**Tracks 1 to 11 are done** (#144 to #199; the only open item is 4.4, which waits for a decision). The user steps below are still open.

**User steps still open:**
- [ ] **Web Push keys:** set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (`mailto:` the legal contact address) in Vercel Production, then redeploy. The Stream E session saved a generated pair to a file outside the repo; the push option stays hidden until they are set. Then try it on a real iPhone (app installed), Android and a desktop browser.
- [ ] **GitHub webhook (3.5):** repo Settings -> Webhooks, Payload URL `<discord webhook URL>/github`, events: pushes, pull requests, releases, deployment statuses.
- [ ] **Discord channels:** add the channels you want in Admin -> Settings -> Webhooks (Trade listings, Admin log, System, Recap) and press Test on each.
- [ ] **iPhone icon (1.1, 7.1):** the code is fixed (opaque icons, plain apple-touch link), but iOS keeps the icon from install time. Remove the home-screen app, delete `cheesytcg.app` under Settings > Apps > Safari > Advanced > Website Data, then add it again from Safari (not Discord's in-app browser); confirm the cheese logo shows.
- [ ] **Dependabot `braces` alert** (high, dev-only, through Tailwind 3's chokidar / micromatch): no patched release exists. Dismiss it as "no fix available" until upstream ships one; build-time only, not reachable at runtime.


**Streams A to K are done** (2026-10-16, #144 to #199). Next: 4.4 (needs a decision) or the next extension version.

---

## Track 1: Quick fixes

### 1.1 iOS home-screen icon (Done, #144; real iPhone check left to the user)

**Problem:** installed on iPhone, the icon is a plain capital "C" (iOS's fallback: first letter of the app title) instead of the cheese logo.

**What we know:** production serves `<link rel="apple-touch-icon" href="/apple-icon.png?...">` (180x180, 200 OK), but the PNG is **RGBA with transparency**, and `/apple-touch-icon.png` at the root is a **404**. iOS falls back to the letter when it can't use the linked icon; some iOS paths (and some in-app browsers, e.g. opening the site from Discord then "Add to Home Screen") only try the root conventional names.

**Do:**
- Make an opaque 180x180 version of the icon (the brand icon on the app's background colour `#0a0f1e`, no alpha channel, ~12% padding so iOS's rounded mask doesn't clip it). Replace `app/apple-icon.png` with it and also commit it as `public/apple-touch-icon.png` and `public/apple-touch-icon-precomposed.png` (same file), so the root names answer 200.
- The `maskable-*` icons in `public/icons/` should also be opaque (check; regenerate the same way if not).
- Add a check line to `scripts/check-public-meta.mts` (or a new tiny check): the three apple icon files exist and are PNGs whose colour type has no alpha (byte 25 of the PNG header is 2, not 6).
- **User step after deploy:** delete the old home-screen icon and add it again (iOS caches the icon at install time; nothing we do updates an existing one). Say this in the PR and in the `/install` iPhone steps ("If you see a letter instead of the logo, remove it and add it again").
- Not checkable locally: confirm on a real iPhone.

### 1.2 Rarest cards animate on hover (Done, #144)

**Problem:** the home page "The rarest cards" tiles render a plain `<img>` of the static thumbnail (`app/(site)/page.tsx`, the `rarest.map`), so the animated art never plays; everywhere else uses `CardTile`, which swaps in the animated file on hover.

**Do:** render the art with `CardTile` (client component; the page stays a server component, it just renders it), keep the rarity border / glow and the `holo-hover` shine, keep the whole tile one `Link`. No `onClick` in the page file. Check the same pattern anywhere else a card image is a bare `<img>` on the public site (`grep -rn "cardThumbUrl(" app --include=*.tsx`) and fix those in the same PR if they are meant to animate. Touch devices: no change (no hover); fine.

---

## Track 2: Copies everywhere

Background: `docs/serials.md`. A copy's id is `<card>.<variant index>.<n>` (so it can be **derived** from card + variant + edition), and its unique number `uid` (`#1023381`) resolves through `/c/<uid>`.

**Wording:** user-facing text in 2.1 to 2.5 follows 2.6 (a copy is a **print**, the 7-digit number is the **print number**, `#7` is the **edition**). Below, "copy" and "unique number" are the code-level names (`Copy`, `uid`), not UI text.

### 2.1 Pull events carry the copy (Done, #147)

- `addCollectionEntryWithSerial` (`lib/kv.ts`) returns `{ owned, serial, copyId, uid }` (read from the copy `mint()` just made, under the same lock). `null`s when the collection is not tracked yet.
- The `pull` `ActivityDetail` gains optional `copyId?: string; uid?: number`. `POST /api/collection` sets them on the event and returns `uid` beside `serial` / `serialMult` (additive, old overlay builds ignore it). Grants: `addCollectionEntry` with origin `'grant'` does the same for the `grant` event.
- Helper `copyHrefFor(e: ActivityEvent, seasonId)` in a client-safe module (`lib/copy-link.ts`): `/c/<uid>` when `uid` is set; otherwise, for older events that have `serial`, the derived `/copy/<season>/<card>.<variantIndex>.<serial>`; otherwise `null` (caller falls back to the card dex link). The season id comes from the collection name the same way `recentPullItems` already resolves it.
- Check: extend `scripts/check-serials.mts` (the returned uid / copyId match the ledger) and add pure cases for `copyHrefFor`.

### 2.2 Recent pulls open the copy (Done, #151)

- Home **Recent pulls** (`RecentPulls`, `recentPullItems` in `lib/home-pulls.ts`): the card name links to `copyHrefFor(...)` (fallback `/cards?card=`). Show the unique number small after the edition chip (`Edition #7 · Print #1023381`) when known.
- Same link in the admin / mod activity feed rows and event detail (admin links to `/admin/serials/<season>/<copyId>`), and in the Discord pull embed (the embed's title links to the copy page; the author line still links to the profile).
- A copy that has since been traded or upgraded still opens: the copy page shows its whole journey. Private / hidden holders are masked by the copy page as today.

### 2.3 Profile "Recent pulls" with serials (Done, #154)

The `recent` profile widget today lists the newest copies the person **holds** (any origin, including ones traded in). Change it to what was asked:
- Rename it **Recent pulls** and list the owner's latest copies whose `origin` is `pull` (from the ledger, live and retired, so a pull later traded away still shows, marked "traded" / "forged" with the current state from `provenance`), 8 rows: card name + version, edition chip (`SerialChip`), unique number, when; each row opens the copy page.
- Add it to `DEFAULT_PROFILE_LAYOUT` (span 6, after `rarest`). Existing saved layouts are untouched (the widget id stays `recent`).
- Before tracking (collection not backfilled): the widget falls back to the viewer's `pull` events from the activity log (no serials), or hides for visitors.

### 2.4 Overlay shows the unique copy number (Done, #157)

- `widget.js` `showSerial()` reads `uid` from the `POST /api/collection` response. New Overlay Editor property `reveal.serialFormat`: `edition` (today: `#7`, default so nothing changes on stream until chosen), `uid` (`#1023381`), `both` (`#7` pill plus a small `Print #1023381` line under it). Registry entry in the same section as `reveal.showSerial`; preview / dry runs use a sample uid.
- Show-off (`!card` chat command): `prepareShowOff` sends the lowest copy's `uid` too, so the same format applies.
- `node --check public/widget.js`, then load `/overlay.html?dev` against the mock KV and draw with "Don't save" off (mock only) to see a real uid. Not checkable locally: real OBS.

### 2.5 Card dialog: copies first, then one copy's details (Done, #161)

Asked: "profile collection cards should expand to all owned serials of the card when clicked, then information given when a copy is clicked (same in binder)".

Today a collected card opens one dialog (`CollectionGrid.tsx`) with art, per-version rows, value and a `SerialList`. New flow, in the same dialog (no new route), shared by the grid and the binder (both already call the same `onOpen`):

1. **Copies view (first):** header with the card name, rarity and "N copies"; then a grid of small tiles, **one per owned copy**, grouped by version (Regular, RH, FA, SH), newest edition last; each tile is the card art with that version's holo, the `SerialChip` edition, the unique number, and a gold mark when it earns a serial bonus. A card with exactly one copy skips straight to step 2. Untracked season: one tile per version with `xN` and no numbers.
2. **Copy view:** the `FlipCard` of that copy (back already exists, `lib/flip-back.ts`), edition "#7 of 31 made", unique number, points it is worth (with bonus), origin + date, a 3-line journey summary, and buttons: **Open copy page**, **Share this copy**, **Pin to my profile** (owner only, existing `PinCopyButton`), **Offer a trade** (visitor; pre-selects this card + version) and, for the owner, **Upgrade** where the existing rules allow it. A **Back to all copies** button returns to step 1; Esc closes the dialog as now; arrow keys still step to the next collected card.
3. The card-level info that lives in the dialog today (pull chance, per-version odds / points, share of score) moves under a "Card details" disclosure in step 1, so nothing is lost.

Data: `GridCard.copies` already carries id, n, variant, `at`, `origin`, `made`, `m`, `p`; add `uid` there in `buildGridCards`. Large holders: cap the tile grid at 60 with "Show all N" (no fetch needed, the data is already on the page; check the page payload size for the top collector in the seeded data and say the number in the PR).

Checks: pure grouping / ordering in `lib/collection-view.ts` (`copiesForDialog`), added to `scripts/check-collection-view.mts`. Run `scripts/sweep-public.mjs` (dialog open at 390px: no overflow, buttons named).

Panel parity is a "next extension version" item.

### 2.6 A card copy is called a "print" (Done, #146)

Asked: "different naming for a card copy". Today the site mixes **copy** (the thing), **serial** / **edition #7** (its number per card and version) and **unique copy number** / **ID #1023381** (game-wide). Decided: the thing is a **print**, its game-wide number is the **print number**, and `#7` stays the **edition**.

**Wording rules** (user-facing text only):
- One owned card = a **print**. "3 prints of Gouda", "Your prints", "Browse every print", "Pin this print", "Share this print", "Print page".
- The 7-digit number = the **print number**, written `Print #1023381`. Replaces "unique copy number", "unique number" and "ID #...".
- `#7` = the **edition**: "Edition #7 of 31". "Serial" stays only where it names the points bonus ("serial bonus" becomes "edition bonus"; check the FAQ and the scoring settings labels together).
- "Copies" as a count becomes "prints" (leaderboard "Copies" ranking, dex "copies out there", stats tables). "Pulls" stays "pulls": a pull is the event, a print is the result.
- A print is never "printed for" someone either (the existing "made for" rule): the journey's first step still reads Pulled by / Given to / Forged by.

**Scope:** pages, FAQ (`#serials` question titles and text; keep the anchor `#serials` and add `#prints` via `OpenOnHash` so old links work), Privacy / Terms where they describe it (bump `LEGAL_UPDATED`), share image plate, flip-card back (`lib/flip-back.ts`), Discord embeds, overlay labels and the Overlay Editor property names shown to the user (the property keys stay), bell notices, admin and mod labels, `aria-label`s and page titles. **Not changed:** code identifiers, KV keys, type names, URLs (`/copy/...`, `/c/<uid>`, `/cards/<card>/copies`). Optionally add `/p/<uid>` as an alias of `/c/<uid>` for share links ("p for print"); `/c/` keeps working forever.

**Guard:** `scripts/check-words.mts` fails if user-facing source (`app/**/*.tsx` string literals and JSX text, `public/widget.js` labels, `lib/discord.ts`, `lib/flip-back.ts`, `lib/share-image.ts`) contains "unique copy number", "unique number", "copy page" or "ID #". Keep the list narrow so code comments and identifiers don't trip it.

**Order:** land 2.6 **before** 2.2 to 2.5, or write those items' new strings with the print wording from the start, so nothing is renamed twice.

---

## Track 3: Discord

Background: `docs/admin.md` "Discord activity feed". Today there is **one** webhook URL (`DiscordSettings.url`) with four category toggles, fed by `recordActivity()` through `after()`.

### 3.1 Several channels, each with its own events (Done, #149)

- `DiscordSettings` becomes `{ enabled: boolean; channels: DiscordChannel[] }` with `DiscordChannel = { id: string; name: string; url: string; enabled: boolean; categories: Record<DiscordCategory, boolean>; minStars: number; newOnly: boolean }` (max 8 channels). The normalizer in `lib/discord.ts` turns the old shape into one channel called "Activity" with the same settings, so nothing changes until an admin edits it (no migration script).
- `notifyDiscord(e)` sends to **every** enabled channel whose filters pass (`shouldSend(e, channel)`), in parallel, each failure isolated. `buildMessage` is built once per event.
- Settings → Webhooks: `DiscordConfig` lists channels as cards (name, URL, toggles, Test / Send last activity per channel, Remove behind `ArmedButton`), plus **Add channel** with presets that pre-tick categories: *Activity*, *Pulls*, *Upgrades*, *Trades*, *Trade listings*, *Admin log*, *System*, *Deploys & code* (the last one just shows the 3.5 instructions, no categories).
- Same rules as today: only real discord.com webhook URLs, empty `allowed_mentions`, Markdown-escaped names, nothing sent from sandboxes / previews. Check: extend the existing Discord check with the old-shape normalizer, multi-channel fan-out and per-channel filters.

### 3.2 New event kinds (Done, #152)

New `DiscordCategory` values (old ones kept):
- Today `categoryOf` files `upgrade` and `trade` under `cards` (with grants and removals). Split them out; the normalizer ticks the new `upgrades` / `trades` boxes wherever `cards` was ticked, so existing channels keep posting the same things.
- `upgrades`: every `upgrade` event (card, from, to, cost, the new copy's edition / unique number, which 2.1's helper also adds to the upgrade event; link to the new copy).
- `trades`: completed trades, counters and admin cancels (as today: not declines, withdrawals or expiries).
- `listings`: new **board listings** only (3.4).
- `admin`: staff actions with who did it (`ActivityEvent.staff` and the audit trail: grants, removals, resets, deletes, staff changes, season activation / end, pack publish, scoring changes, trading paused / resumed). Some of these are audit entries, not activity events: add one call `notifyAdminLog(entry)` inside `recordAudit` and the staff log writers, sending to channels with `admin` on. **The admin category is the one place staff names appear in Discord**; the channel is meant to be private, and the setting says so.
- `system`: nightly backup result (success with size, or failure), the data-health threshold being crossed, a sandbox created / deleted, the Twitch live gate flipping. Sent from the places that already detect them.
- Embeds stay compact: title, one or two fields, a link, the rarity colour where there is a card.

### 3.3 Trade page per offer (Done, #150)

The Discord listing post needs a "direct link to the trade". There is no per-trade page today (`/trade` has tabs only).
- `/trade/[id]` in the `(entity)` route group (real 404, no `loading.tsx`), `noindex`. Reads the open trade, or the history entry if it is closed.
- Open listing: both stacks (`TradeStacks`, with serials), lister, expiry countdown, fairness label for the signed-in viewer, and **Take this trade** (`TradeActions`, the same second-tap flow and API). Signed out: "Log in with Twitch to take this trade" with `returnTo` back here. Direct offer: only the two people in it see the stacks; others get "This is a private offer". Closed: "This trade was completed / cancelled / expired" with the outcome, no actions.
- `sweepTrades()` on load (like the other trade pages). Board listing cards and bell notices link here instead of `/trade?tab=board`.
- Add to `NOINDEX_PATHS`, `PUBLIC_PAGES` not needed (not searchable). Check: `scripts/check-trades.mts` gains a small case for the page's visibility rule (pure helper `tradeVisibleTo(trade, viewer)` in `lib/trade-core.ts`).

### 3.4 "Listed for trade" channel (Done, #155)

When a **board listing** is created (`announceTrade`, the same hook that drives listing alerts): post to channels with `listings` on. Embed: "<lister> listed a trade", **Gives** / **Wants** fields (card names, versions, edition numbers), points each side, expiry, the first given card's thumbnail, and the title linking to `${SITE_URL}/trade/<id>`. Optional per-channel role mention? **No**: `allowed_mentions` stays empty (anyone could trigger it); the channel's own notification settings do the job. When the listing is taken, cancelled or expires, the post is **not** edited (webhook edits need the message id; keep it simple). The trade page shows the outcome.

### 3.5 GitHub and Vercel changes in Discord (Done, #149)

Neither needs our server:
- **GitHub**: Discord webhooks accept GitHub's format if `/github` is added to the URL. In the repo: Settings → Webhooks → Add webhook, Payload URL `<discord webhook URL>/github`, content type `application/json`, events: pushes, pull requests, releases, **deployment statuses**.
- **Vercel**: Vercel reports every deployment to GitHub as a deployment status, so the GitHub webhook above already posts "deployed to Production / Preview" with the link. (If more is wanted later, Vercel's own webhooks could feed a small `/api/vercel-hook` route; not needed now.)
- Put these steps in the Settings → Webhooks "Deploys & code" preset card and in `docs/hosting.md`.

### 3.6 Discord delivery log (Done, #156)

Each channel keeps its last 20 send results (time, event kind, HTTP status, Discord's error text) in KV `discord:log:<channelId>` (list, capped). Shown under each channel card with a red dot when the last send failed (a deleted webhook answers 404). A channel failing 20 times in a row is switched off automatically and the dashboard's Needs attention panel says so.

---

## Track 4: Notifications

Background: `docs/trading.md` "Notifications". Notices live in `notif:<user>` (30 newest); the bell polls `GET /api/notifications` every 45 s and on tab focus. That is why they feel late, and a new notice only changes a small badge.

### 4.1 Arrive fast, hard to miss (Done, #153)

- **Cheap version check.** Every `notify()` also `INCR`s `notif:<user>:v`. New `GET /api/notifications?since=<v>` answers `204` (no body) when nothing changed, so polling is cheap.
- **Poll faster while visible**: every 10 s while the tab is visible, back off to 60 s after 5 minutes without input, stop while hidden (resume and check at once on focus). Also check right after the viewer does something that may cause a reply (sending an offer).
- **Toast**: a new notice slides in at the top right (bottom on phones) for 6 s with its icon, text and action button ("See the offer"), stacking up to 3; `aria-live="polite"`; reduced motion = fade. Clicking marks it read.
- **Louder badge**: the bell shakes once and the badge pulses on arrival; the page title gets a `(2)` prefix while unread; installed apps set the app icon badge (`navigator.setAppBadge`, where supported).
- **Optional sound**: a short chime, off by default, `UserSettings.noticeSound` in Settings → Notifications.
- Checks: the version / 204 logic in a pure helper + the existing notification check.

### 4.2 Notifications page (Done, #158)

`/notifications` (signed in, noindex): the full list of the 30 kept notices grouped by day, filter by kind (offers, results, listing alerts, admin), Mark all read. The bell's footer links to it. Consider raising the cap to 100 (check `scripts/check-words.mts` and the Privacy Policy number if so).

### 4.3 Push notifications (Done, #162)

Real "arrives when it happens", even with the site closed: **Web Push** to the installed app (iPhone / iPad from iOS 16.4 when added to the home screen, Android, desktop Chrome / Edge / Firefox / Safari). No third-party push service account is needed: browsers bring their own push service, we only sign messages.

**Setup (user step, once):** generate a VAPID key pair (`npx web-push generate-vapid-keys`) and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` the legal contact address) in Vercel Production. Add the three to `ENV_SPECS` (recommended, not required: without them the push option is simply hidden).

**Server:**
- `web-push` package, used only from `lib/push.ts` (Node runtime; never imported by client code or the edge middleware).
- Subscriptions: KV hash `push:<user>` (endpoint hash -> `{ endpoint, keys, ua, addedAt, lastOkAt }`), at most 5 devices per viewer (adding a 6th drops the oldest). `POST /api/account/push` (subscribe), `DELETE /api/account/push` (this device), viewer from the session, `isSameOrigin()`, body validated (https endpoint only, key lengths).
- Sending: `notify()` in `lib/trade-notify.ts` (and the other notice writers) calls `sendPush(user, notice)` through `after()` once the KV write is done, only when the viewer's per-kind switch allows the notice (`wantsNotice`) **and** `UserSettings.pushKinds` allows it (default: offers, results, listing alerts, admin notices all on). Payload: `{ title, body, url, tag }`, no card art (keeps it small), `tag` per trade so a counter replaces the earlier offer notice. TTL 1 day, urgency `high` for offers, `normal` otherwise.
- A 404 / 410 from the push service removes that subscription; other failures are logged and the next notice tries again. Nothing is sent from sandboxes or previews (`inSandbox()`), like Discord.

**Browser:**
- `public/sw.js`: `push` (show the notification, icon `/icons/icon-192.png`, badge, `data.url`; also `setAppBadge`) and `notificationclick` (focus an open tab on that URL or open one). Bump the cache name so every device picks up the new worker.
- Settings → Notifications: **Turn on alerts for this device** (needs a tap, browsers refuse to ask otherwise), the per-kind push ticks, **Send me a test alert**, and the list of devices with Remove. On an iPhone that is not running the installed app, the button is replaced by "Install the app first" linking to `/install`. Denied permission: say how to re-enable it in the browser settings.
- After the first trade offer a viewer sends or receives, the toast from 4.1 offers "Get alerts on this device" once (dismissal remembered in `localStorage`).

**Words:** FAQ question "How do I get alerts on my phone?"; Privacy Policy: what is stored (the push address the browser gives us and which device type), that it is deleted when you turn alerts off, remove a device, or the browser says it is gone, and that it is in the data export. Bump `LEGAL_UPDATED`.

**Checks:** `scripts/check-push.mts` (mock KV): subscription validation, the 5-device cap, kind gating, removal on 410, sandbox silence, using a tiny local fake push endpoint (like `mock-twitch.cjs`) that records what it received. Not checkable locally: delivery on a real iPhone / Android; the PR says so and lists what to try (install, turn on, send a test, receive an offer with the app closed).

### 4.4 Link a Discord account for DMs (Later, after 4.3; Needs a decision when picked up)

Possible, but it is more than a webhook: DMs need a **Discord bot**.
- One-off user setup: create a Discord application, add a bot, invite it to the Cheesygidds server (it can only DM people who share a server with it and allow DMs from server members). Env: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`.
- Linking: Settings → Notifications → **Link Discord** runs Discord OAuth with the `identify` scope only (same shape as our Twitch login: code → token → read the user id → revoke, never stored). Saved as `user:<u>:discord` `{ id, username, linkedAt }` plus `discord:user:<discordId>` → login, so one Discord account links to one viewer. Unlink button; the export and Privacy Policy include it.
- Sending: `notify()` → for kinds the viewer ticked for Discord, the REST calls "create DM channel" then "create message" with the bot token, in `after()`. Discord answers 50007 when DMs are closed: record it and show "We couldn't DM you, check your privacy settings for the server" in Settings. Respect Discord rate limits (one retry after `retry_after`).
- **Decided 2026-10-16:** push notifications (4.3) come first. Revisit this once 4.3 has been live for a while; the remaining question then is whether a bot in the server is acceptable (it shows in the member list, and its token is one more secret).

---

## Track 5: Additions (suggested)

### 5.1 Stream recap posted to Discord (Done, #160)

When the channel goes offline (the live check in `lib/twitch-live.ts` already sees the transition; record `twitch:live:since` on the way up and post on the way down, once, under a short KV lock so two instances don't both post), post a recap embed to channels with a new `recap` category: packs opened, cards pulled, new collectors, first-ever pulls, the rarest pull of the stream (with a link to the copy), top puller, trades completed, biggest rank climb. Built from the activity log between the two times (pure `buildStreamRecap(events, from, to)` + a check). If the transition is missed (nobody visited while live), skip; never post a recap for a stream with no pulls. Also show the latest recap on the admin dashboard as a widget.

## Track 6: Community extras (picked 2026-10-16)

**Done:** 6.1 (#166), 6.2 (#167), 6.4 (#168), 6.3 (#169). The user picked all three "other ideas", then added 6.4. Order: **6.1 and 6.2 in parallel**, then **6.3** (uses both) and **6.4** (shares the trade page and board cards with 6.1) in parallel.

| # | Item | Status | Size |
|---|------|--------|------|
| 6.1 | "Wanted" counts on trade listings | Done (#166) | S |
| 6.2 | Print of the week (home page) | Done (#167) | M |
| 6.3 | Weekly digest in Discord | Done (#169) | M |
| 6.4 | Choose which print to trade | Done (#168) | M |

### 6.1 "Wanted" counts on trade listings (Done, #166)

When a board listing gives a card that collectors are looking for, say so.
- Count: `watchersOf([card])` (`lib/watch-index.ts`, covers both the Looking for list and saved alerts), minus the lister and minus the people already notified as the trade's own recipient. Per given card, not summed (one person wanting two cards counts in both).
- **Discord** (the Trade listings embed from 3.4): a line under Gives, "3 collectors are looking for Gouda (Shiny)". Only when the count is at least 1. Still no mentions.
- **`/trade/<id>`** and the board listing card: a small purple chip "3 want this" on each given card that has watchers (the board reads counts in one batch for the visible listings; cache per request, never per viewer).
- Names are never shown, only the count (people's lists are not public data beyond their own profile).
- Check: a pure `wantedCounts(given, watchersByCard, exclude)` in `lib/watch-core.ts` + cases in `scripts/check-watch.mts`.
- Owns: `lib/watch-core.ts`, the listing embed in `lib/discord.ts`, the trade page and board listing card. Not the weekly cron.

### 6.2 Print of the week (Done, #167)

A print with an interesting journey, featured on the home page for a week.
- **Scoring** (pure `lib/print-of-week.ts`, `scorePrint(copy, now)` + `pickPrintOfWeek(candidates, recentUids)`): distinct holders x3, completed trades it went through x2, edition #1 +5, Shiny / Full Art +2, age in weeks (cap 8) x1, a print forged from others +2. Ties: older print wins. Skip prints picked in the last 8 weeks (`potw:history`, newest 20 uids) and prints currently in a trade offer. Candidates: live prints of the active season only. Uses `buildProvenance` for holders and trades, so the numbers match the print page.
- **When**: a new weekly Vercel Cron `GET /api/cron/weekly` (`vercel.json`, Sunday 20:00 UTC, `Bearer CRON_SECRET` like the backup route, refuses in a sandbox or outside production). It scans the season's ledger owners (from the collection blob's viewer list; `HGETALL copies:<c>:o:<owner>` each, fine at today's sizes: say the measured time for the seeded data in the PR) and stores `potw:current` `{ uid, seasonId, copyId, score, reason, chosenAt, by: 'auto' }`. Idempotent per ISO week (`potw:week:<yyyy-ww>` NX). 6.3 will add the digest to this same route.
- **Admin**: on `/admin/serials/<season>/<copy>` a **Feature as print of the week** button (`requireAdmin`, sets `by` to the staff login, logs an audit entry) and on the Serials page a "Print of the week" line with **Pick again now** and **Clear**.
- **Home**: a "Print of the week" section after the live grid: the `FlipCard` of that print, card name + version, `Print #1023381`, "Edition #7 of 31", a reason line built from the score parts ("Held by 5 collectors, traded 4 times, 9 weeks old"), holder (masked if hidden or private, like the print page) and a **See its journey** link. Hidden when there is no pick or the print was spent since (an upgrade or removal): then it shows nothing until the next pick, never a broken card.
- **Words**: FAQ line under prints ("How is the print of the week chosen?").
- Check: `scripts/check-print-of-week.mts` (pure scoring and the skip rules; mock KV for the cron's once-a-week rule and sandbox refusal).
- Owns: `lib/print-of-week.ts`, `app/api/cron/weekly/`, `vercel.json`, the home section, the admin buttons, FAQ.

### 6.3 Weekly digest in Discord (Done, #169)

A Sunday-evening summary post for the community channel.
- New Discord category `digest` (off by default on existing channels, the normaliser rule from 3.1) and a preset "Weekly digest". Sent from `/api/cron/weekly` after the print of the week is picked, once per ISO week (`digest:week:<yyyy-ww>` NX), nothing from sandboxes or previews.
- **Contents** (pure `lib/weekly-digest.ts`, `buildWeeklyDigest(...)` + `sampleDigest()` for the Test button):
  - this week's pulls, new collectors, upgrades, trades completed: from the `stats:h:` counters (the activity log is capped at 500 events, too short for a week)
  - the top 3 on the board right now
  - **movers**: the biggest rank climbs and points gained since last week, from a snapshot `digest:ranks:<seasonId>` `{ user: [rank, points] }` saved by each run. The first run has no previous snapshot and says "Movers start next week". Admin-hidden and private collectors are left out
  - **most traded cards**: card numbers counted across completed trades in `trades:history` during the week (it keeps 400; if the oldest kept trade is newer than the week start, say "at least")
  - **most wanted card**: the card with the most watchers (`watch:idx:*` sizes for the season's cards)
  - **print of the week** (from 6.2), linking to its print page
  - a link to the leaderboard
- Skip the post entirely when the week had no pulls and no trades (off-season).
- The latest digest is kept in KV and shown on the admin dashboard as a widget, like the stream recap (5.1).
- Check: `scripts/check-weekly-digest.mts` (builder, first-run movers, the "at least" rule, the skip rule, once per week).
- Owns: `lib/weekly-digest.ts`, the `digest` bits of `lib/discord*.ts`, the digest step in `/api/cron/weekly`, the dashboard widget.

### 6.4 Choose which print to trade (Done, #168)

Asked (2026-10-16): "should be able to select which print of a card when trading". Today a trade stack is `{ cardNumber, variant, count }` and the engine moves the **newest** prints of that entry (escrow, settle, refund). The ledger already supports moving exact prints (`SyncContext.moves[].ids`, used by the admin Give action).

**Data:** `TradeItem` gains `ids?: string[]` (print ids `<card>.<v>.<n>`). When set, `ids.length === count`, all distinct, all of that entry. Absent = "any print" = today's newest-first. Old trades have no `ids` and behave exactly as before.

**Engine (`lib/trades.ts`, `lib/trade-core.ts`):**
- **Give side** (the offerer's own prints): `createInLock` checks each id is held by the offerer right now (`copies:<c>:idx`), not already in another offer's escrow, and matches the entry; escrow then moves exactly those (`moves[].ids`). Refunds and settlement move the same ids out of `escrow:<tradeId>`, so identity is exact end to end.
- **Get side, direct offers**: the offerer may pick exact prints of the recipient (e.g. "your #1 Gouda"). Checked when offered (held by the recipient) and again at accept; if one has moved since, accept fails with "That offer asks for Print #1023381, which you no longer hold" and the offer stays open for a counter.
- **Get side, listings and unpicked direct asks**: the **taker** chooses at accept time. `POST /api/trades/[id]` `accept` takes an optional `getIds: Record<entry, string[]>`; absent = newest-first as today (so the Twitch panel, which can't pick yet, keeps working unchanged).
- **Counters** carry `ids` across like any other field.
- Seasons whose prints are not numbered yet refuse `ids` (the composer hides the picker there).
- Points and the fairness label use the chosen prints' real worth (their edition bonus), falling back to today's values when unpicked.

**Website UI:**
- `GET /api/trades/holdings` returns, per entry, the prints (id, edition, print number, bonus multiplier) for both sides; the composer (`TradeComposer`) gets a **Choose prints** toggle on a stack with more than `count` prints: a row of small chips (`SerialChip` + `Print #...`) to tick exactly `count`, default the newest (today's behaviour), with a warning badge on a print that earns an edition bonus or is an edition #1 ("You are giving away Edition #1").
- The take / accept flow: when the taker holds more prints of an asked-for entry than needed, **Take this trade** / **Accept** first opens the same chip picker (default newest), then the existing second-tap confirm.
- `TradeStacks` shows exact prints when `ids` are set ("Print #1023381 · Edition #7") and "any print" otherwise; `/trade/<id>` and the board listing card do the same. The print page's journey already records the trade.

**Twitch panel (freeze):** no edits to `public/twitch-panel/*` or `/api/twitch/*`. The panel keeps sending trades without `ids` and accepting with newest-first, which stays valid. Known limitation until the next extension version: for a trade with chosen prints, the panel's serial preview may show different numbers than the ones that will move. Listed below.

**Checks:** extend `scripts/check-trades.mts`: exact ids through escrow / settle / refund / counter, a picked print moved away before accept, ids on an untracked season refused, a print in another offer refused, unpicked accept still newest-first, conservation unchanged. Then `scripts/check-serials.mts` for identity, and a hand test of the composer and the taker picker against the mock KV.

**Owns:** `lib/trade-core.ts` (`TradeItem`), `lib/trades.ts`, `app/api/trades/*`, `TradeComposer`, `TradeActions` (the picker step), `TradeStacks`, `lib/trade-view.ts` (pools honour `ids`), FAQ trading answer. Starts after 6.1 merges (6.1 edits the trade page and board cards).

---

## Tracks 7 to 11: the second Discord list (2026-10-16)

32 requests from the Cheesygidds Discord (12:40 to 14:52), grouped by area into 30 items (some requests share an item). Each numbered item is one PR unless it says otherwise. Items marked **Ready** can be built from the text below. The **Needs a decision** items carry a recommended default; if the user doesn't change it, build the default.

| # | Item | Status | Size |
|---|------|--------|------|
| 7.1 | iPhone home-screen icon still shows "C" | Done (#171) | S |
| 7.2 | Home: Top collectors and Recent pulls the same height | Done (#172, #199) | S |
| 7.3 | Card dex dialog: "First prints" goes; buttons move | Done (#175) | S |
| 7.4 | Trade board shows your own listings (Take greyed out) | Done (#179) | S |
| 7.5 | More than 8 Discord channels | Done (#180) | S |
| 7.6 | Admin dashboard opens on "Season" | Done (#181) | S |
| 7.7 | Admin Settings tabs on phones (overflow, alignment, empty space) | Done (#184) | S |
| 7.8 | New names for the two set bonuses | Done (#189) | S |
| 7.9 | Info tooltips (bonuses and other terms) | Done (#198) | M |
| 8.1 | Rarest finds widget shows rarest **prints** | Done (#176) | S |
| 8.2 | Showcase widget links to the print | Done (#176) | S |
| 8.3 | Recent pulls widget includes webhook grants | Done (#176) | S |
| 8.4 | Edit bio and accent on the profile itself | Done (#182) | M |
| 8.5 | Accent: more colours and a colour picker | Done (#182) | S |
| 8.6 | Pronouns (own pick, or from pr.alejo.io) | Done (#196) | M |
| 8.7 | Profile layout presets | Done (#183) | S |
| 8.8 | Closed binder shows only its front cover | Done (#187) | S |
| 8.9 | Owner picks binder or grid as the visitors' default | Done (#187) | S |
| 8.10 | "Share my stats" image shows stats | Done (#192) | M |
| 8.11 | More obvious "turn on alerts" prompt on phones | Done (#194) | S |
| 9.1 | Favourite prints can't be traded | Done (#174) | M |
| 9.2 | Staff can reverse a completed trade | Done (#188) | M |
| 10.1 | Staff stay signed in while the activity feed is open | Done (#173) | S |
| 10.2 | Dashboard layout per staff member | Done (#178) | S |
| 10.3 | Built-in dashboard layout presets | Done (#191) | S |
| 10.4 | Pick the still frame of an animated card | Done (#185) | M |
| 10.5 | Redesign the admin Prints screen | Done (#190) | M |
| 11.1 | Changelog page | Done (#177) | S |
| 11.2 | Suggestions and feedback, report a problem (one inbox) | Done (#186) | M |
| 11.3 | Request account deletion button | Done (#193) | S |
| 12.1 | Mix It Up settings tab (connection, price, message) | Ready | M |
| 12.2 | Paid pulls: balance check, deduct, revoke | Ready (with 12.1) | L |
| 12.3 | Limits per stream per viewer | Ready (with 12.2) | S |

### Tracks 7 to 11: order

Parallel streams, chosen so no two running PRs edit the same files:
- **Stream G (quick fixes):** 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, one PR each, any order. 7.8 then 7.9.
- **Stream H (profile):** 8.1 + 8.2 + 8.3 (one PR, all in `widgets.tsx`), then 8.4 + 8.5 (one PR), 8.6, 8.7, 8.8 + 8.9 (one PR, binder), 8.10, 8.11.
- **Stream I (trading):** 9.1, then 9.2 (both edit `lib/trades.ts`; one at a time).
- **Stream J (staff and admin):** 10.1, 10.2 then 10.3, 10.4, 10.5 once its design is agreed.
- **Stream K (help):** 11.1, then 11.2, then 11.3.

Overlaps to watch: 7.9 adds tooltips to pages that 8.x and 7.3 also edit, so start 7.9 after 7.3 and 8.1 to 8.4 have merged. 8.6 and 8.4 both edit `ProfileHeader.tsx`: 8.4 first. 11.2 and 7.5 both touch the Discord categories: 7.5 first.

**Twitch panel freeze:** nothing here edits `public/twitch-panel/*` or `/api/twitch/*`. **9.1 is the one edge case:** favourites are a rule in `lib/trades.ts`, so a panel trade that would have moved a favourite print now picks a different print, or fails with the existing error shape (`{ ok: false, error }`, which the panel already shows). No response shape changes. Panel UI for favourites waits for the next extension version.

---

## Track 7: Quick fixes and wording

### 7.1 iPhone home-screen icon still shows "C" (Done, #171)

1.1 (#144) made `app/apple-icon.png`, `public/apple-touch-icon.png` and the maskable icons opaque, and production serves them (checked 2026-10-16: the `<link rel="apple-touch-icon">` answers 200, `image/png`, colour type 2). The iPhone still shows a letter, so something else is going on. Likely causes, in order:
1. **iOS cached the old icon.** It keeps the icon from install time, and Safari's website data can hold an old one too. User step: remove the home-screen app, then Settings > Apps > Safari > Advanced > Website Data, delete `cheesytcg.app`, then add it to the home screen again from Safari (not from Discord's in-app browser).
2. **The manifest's `purpose: "any"` icons are transparent** (`public/icons/icon-192.png`, `icon-512.png`: colour type 6). Recent iOS versions can take the manifest icon over the apple-touch link. Make both opaque the same way 1.1 did (brand icon on `#0a0f1e`, about 12% padding), and extend the 1.1 check in `scripts/check-public-meta.mts` to cover them.
3. **The `?<hash>` query on the apple-touch link.** Next adds it. Also emit a plain `<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">` from the root layout's metadata `icons.apple`.

Do 2 and 3 in one PR, then list step 1 for the user. Not checkable locally: a real iPhone.

### 7.2 Home: Top collectors and Recent pulls the same height (Done, #172, #199)

On the home page the two cards sit side by side at different heights. Make both grid items stretch (`items-stretch`, each card `h-full flex flex-col`). The longer list scrolls inside its card (`overflow-y-auto min-h-0` on the list), or the shorter one pads with its "see all" footer pinned to the bottom. Pick whichever looks right at 1280px. At phone width they stack and keep their natural height. Run `scripts/sweep-public.mjs`.

### 7.3 Card dex dialog: "First prints" goes, buttons move (Done, #175)

In `app/(site)/cards/CardDex.tsx`:
- Remove the **First prints** block (the per-version #1 rows and the "~" note). The print pages and `/cards/<n>/copies` already show the same information.
- Put **Browse every print** directly below `CardMathsPanel` (Advanced information), as the same full-width link row. Show it whenever the card has any prints, not only when first prints exist.
- Move **Add to Looking for** into the art column, directly under **Share this card**, and give it the same width and button style as Share.
- Remove the `firsts` data from the dex payload if nothing else reads it (check `lib/dex-view.ts` and `/api/dex-card`).

### 7.4 Trade board shows your own listings (Done, #179)

`app/(site)/trade/page.tsx` filters out the viewer's own listings (`t.from !== me`). Keep them on the board, in their usual place in the order, with:
- a "Your listing" chip next to the title;
- **Take this trade** rendered disabled ("This is your listing" as its title / `aria-disabled`), plus a small **Withdraw** link to the existing cancel action;
- the board count, the filters and the search all including them. Matches (`bestMatches`) and the wanted counts still leave them out.
Same treatment on `/trade/<id>` when the lister views their own listing (it may already do this; check). Extend `scripts/sweep-public.mjs` coverage if the board has no signed-in own-listing case in the seed.

### 7.5 More than 8 Discord channels (Done, #180)

`MAX_DISCORD_CHANNELS` (`lib/discord-config.ts`) goes from 8 to **25**. Fan-out is already parallel with each failure kept separate, and every webhook has its own Discord rate limit, so the only cost is the settings JSON size (about 1 KB per channel, fine). In `DiscordConfig.tsx`, show more than 8 channel cards as a collapsed list (name, enabled dot, category summary, last-send status) that expands one card at a time. Extend the Discord check for the new cap.

### 7.6 Admin dashboard opens on "Season" (Done, #181)

`app/admin/page.tsx`: when no `range` is in the URL, the default range is `season` instead of `7d`. `DashboardControls` marks it as selected. Check that every range-aware widget copes with a long season (the pulls chart already buckets by day; check the viewers widget, which is hard-wired to `7d` today, and label it "last 7 days" if it stays that way).

### 7.7 Admin Settings tabs on phones (Done, #184)

On `/admin/settings` at 390px, panels overflow, panel edges don't line up, and some tabs leave empty space (the Environment tab is the example given). Pass over every tab:
- `PageTabs` scroll sideways inside their own row instead of widening the page;
- every grid child that holds a table or a long value gets `min-w-0`; long env names / URLs `break-all`;
- the Environment table becomes stacked rows (name, status, hint) below `sm`, and empty spacer columns go;
- panels share one width and gap (`space-y-6`, full width), with no half-empty two-column rows at phone width.
Add an admin pass to the sweep: either `scripts/sweep-admin.mjs` (password login against the mock KV, every Settings tab and the dashboard at 390px and 1280px, the same overflow / h1 / name rules as the public sweep), or a flag on `sweep-public.mjs`. Prefer the new script. Mention it in `docs/admin.md` and `docs/review.md`.

### 7.8 New names for the two set bonuses (Done, #189)

"Completion bonus" and "Complete set bonus" sound alike. **Default:**
- **Progress bonus**: grows with the share of the set you own (today's completion bonus).
- **Full set bonus**: paid once you own every card (today's complete set bonus).
Labels only: code identifiers, settings keys (`completionBonusPct`, `completeSetBonusPct`) and stored data stay the same. Change every user-facing place: account page, profile Score breakdown widget and ProfileTabs, leaderboard detail, `CardMathsPanel`, the FAQ (keep the old wording findable: "Progress bonus (it used to be called the completion bonus)" for a month), admin Scoring labels and help, share image text, Discord digest / recap if they name them. Add both old names to `scripts/check-words.mts` so they don't come back.

### 7.9 Info tooltips (Done, #198)

A shared `InfoTip` client component in `app/components/InfoTip.tsx`: a small `info` icon button next to a term. It opens a short popover on hover, on keyboard focus and on tap (touch has no hover), closes on Esc / outside tap, uses `aria-describedby`, and stays inside the viewport at 390px. Text is plain strings from one map, `lib/glossary.ts` (`GLOSSARY: Record<TermId, { title, body, faq?: string }>`), with a "More in the FAQ" link when `faq` is set. That way the FAQ and the tooltips can't drift apart, and `check-words` can scan the file.
First terms: progress bonus, full set bonus, edition bonus, edition, print number, points / worth, pull chance, score, rank, fairness label (trade), escrow ("held for this offer"), Reverse Holo / Full Art / Shiny, upgrade. Place them where each term is shown: score breakdowns (account, profile, leaderboard), card dex stats, print page, trade composer and stacks. Not in the Twitch panel (freeze).

---

## Track 8: Profiles

### 8.1 Rarest finds shows rarest prints (Done, #176)

The `rarest` widget (`app/u/[username]/widgets.tsx`) lists cards by pull chance. Make it list **prints**, and rename the widget **Rarest prints** (the id stays `rarest`; update `PROFILE_WIDGETS` title and description):
- Rarity of a print = the pull chance of that card **in that version** (card pull rate x version odds, from the board values the widget already has). Ties go to the lower edition number, then the edition bonus.
- One row per card + version (their best print of it), 5 rows: art thumb with the version's holo, name + version, `SerialChip` edition, `Print #...`, "1 in N". Each row opens the print (`/c/<uid>`, or the derived `/copy/...` link when there is no uid).
- Untracked season (no ledger): keep today's card-level list.
Pure ordering helper in `lib/collection-view.ts` (`rarestPrints`) with cases in `scripts/check-collection-view.mts`.

### 8.2 Showcase links to the print (Done, #176)

The `showcase` widget links each of its 3 tiles to `/cards?card=`. Link each tile to the actual print that earned its place (`topCopies` picks card + version; take the holder's most valuable print of it from the ledger, i.e. the best edition bonus, then the lowest edition), via `/c/<uid>`. Show `Print #...` under the points. Untracked season: keep the dex link.

### 8.3 Recent pulls includes webhook grants (Done, #176)

Cards granted through `/api/webhooks/grant-card` (channel points and the like) get `origin: 'grant'` and are left out by `pickRecentPulls` (`lib/recent-pulls-core.ts`), which keeps only `origin === 'pull'`. Change:
- Accept `origin === 'grant'` as well. Show those rows with a small "Granted" label in place of the fate text when still held.
- Admin gifts also use `origin: 'grant'`. Include them too, with the same label. They are cards the viewer received, and telling the two apart would need a new ledger field for little gain.
- The activity-log fallback (untracked seasons) reads `grant` events as well as `pull`.
- Update the widget description ("pulled or granted") and the FAQ if it describes the widget. Extend `scripts/check-recent-pulls*` (or the serials check) with a grant case.

### 8.4 Edit bio and accent on the profile itself (Done, #182)

The owner sees an **Edit profile** button in `ProfileHeader` (owner only, which the page already knows). It turns the header into an inline editor: bio textarea (same `BIO_MAX`, live count), the accent picker (8.5), pronouns (8.6, when built), **Save** / **Cancel**. A client component `ProfileHeaderEditor` posts to a server action `saveProfileBasics({ bio, accent })` in `app/u/[username]/actions.ts`. The viewer comes from the session, never from the form. It writes through `sanitizeUserSettings`, then `revalidatePath` for the profile. Settings keeps the same fields with a note "You can also edit these on your profile".
- The accent no longer needs the `accent` experiment: move it out of `EXPERIMENTS` (keep reading the stored `experiments` value harmlessly). It was experimental only because there were 6 colours; with 8.5 it is a normal setting. If the user would rather keep it experimental, the editor shows the accent control only when the experiment is on.

### 8.5 Accent: more colours and a colour picker (Done, #182)

- `ACCENTS` grows to 12 named swatches (add e.g. Lime, Teal, Sky, Indigo, Magenta, Slate).
- **Custom colour:** `<input type="color">` plus a hex field. Stored as `accent: '#rrggbb'` (the sanitizer accepts a named id or a 7-char hex). `accentHex()` returns the hex for either.
- **Readability guard:** the header text sits on the accent, so a custom colour is clamped in lightness on save (in `lib/palette.ts`, pure, e.g. HSL lightness 35% to 70%), and the editor previews the clamped result. Add cases to an existing palette check.

### 8.6 Pronouns (Done, #196)

`UserSettings.pronouns: { mode: 'none' | 'set' | 'alejo'; value?: string }`, shown after the display name on the profile header and the leaderboard detail (small, gray). **Default (recommended): mode `none` for everyone until they choose.** The alternative is `alejo` for everyone, which shows pronouns people set for Twitch chat without asking them; that is why it isn't the default.
- **Pick:** a fixed list matching pr.alejo.io's set (he/him, she/her, they/them, he/they, she/they, they/he, they/she, any, it/its, ask me, other / none). No free text, so no moderation is needed.
- **From pr.alejo.io:** server-side fetch of `https://api.pronouns.alejo.io/v1/users/<login>` (gives `pronoun_id` / `alt_pronoun_id`; map ids through `/v1/pronouns`, cache that list for a day). Cache each user's answer in KV `pronouns:<login>` for 24 h (misses too), 2 s timeout, never on the critical path (a slow or missing answer shows nothing). Executor: confirm the current API shape before building and say in the PR what it returned.
- Editable in Settings and in the 8.4 editor. Privacy Policy: the login is sent to pr.alejo.io only when the viewer picks that mode, and the answer is cached for a day. Bump `LEGAL_UPDATED`; add an FAQ line. Data export includes the setting.
- Not in the Twitch panel (freeze).

### 8.7 Profile layout presets (Done, #183)

In the profile layout editor (`ProfileGrid.tsx`), a **Start from a preset** menu with 4 built-in layouts defined in `lib/profile-widgets.ts` (`PROFILE_PRESETS`, each a `ProfilePlacement[]` that passes `sanitizeProfileLayout`):
- **Collector** (today's default),
- **Showcase** (pinned print, showcase, rarest prints, achievements),
- **Trader** (looking for, trading, recent pulls, collection preview),
- **Minimal** (score breakdown, showcase).
Applying a preset replaces the draft layout (the owner still presses Save, and Cancel restores it). Add a pure check that every preset sanitizes to itself.

### 8.8 Closed binder shows only its front cover (Done, #187)

`Binder.tsx`: in two-page mode the closed binder (the `cover` spread) draws a blank left page next to the cover. When the cover is showing, render only the right-hand cover page, centred, at single-page width, like a closed book. Opening animates it to the full spread (the cover swings left as the first turn does today); closing (going back to the cover) reverses it. Phone / single-page mode doesn't change. Check the share-image path (`Share this page` on the cover renders the cover alone) and `prefers-reduced-motion`.

### 8.9 Owner picks binder or grid as the visitors' default (Done, #187)

`UserSettings.collectionView: 'grid' | 'binder'` (default `grid`, today's behaviour). The collection tab opens in that view for visitors who haven't picked one. A visitor's own toggle still wins for that visit (URL `?view=`). Set it in the binder editor ("Show visitors the binder first") and in Settings. Sanitizer, settings check and export include it.

### 8.10 "Share my stats" shows stats (Done, #192)

The account page's **Share my stats** image (`shareSpec` in `app/(site)/account/page.tsx`) is mostly 6 card thumbnails. Make it a stats card. New `stats` layout in `lib/share-image.ts` (alongside the existing card layouts):
- name, `@login`, season; big rank and score;
- a 2 x 3 grid of figures: different cards (n / total, with a progress bar), prints, progress bonus %, best edition (lowest edition number held), rarest print (name + version + "1 in N"), trades completed;
- a strip of their 3 most valuable prints at the bottom, small;
- the rarity colour of their rarest print as the accent, and the site footer as today.
Keep the profile Share menu's own images unchanged. The ShareStudio preview shows the new layout. Add a share-image spec check case if one exists.

### 8.11 More obvious "turn on alerts" prompt on phones (Done, #194)

Today the only prompt is a one-off toast after the first trade offer (`NotificationBell.tsx`, `tcg_push_offered`). Add a banner component `PushPrompt` shown to a signed-in viewer on a phone or installed app when push is supported, the permission is `default`, and this device has no subscription:
- where: the top of `/account` and `/trade`, and the notifications page;
- text: "Get trade offers on your phone" + **Turn on alerts** (runs the existing `PushAlerts` subscribe flow) + **Not now**;
- **Not now** hides it for 14 days (`localStorage`, wrapped in try/catch); after 3 dismissals it stops;
- iPhone in Safari (not installed): the banner says "Install the app to get alerts" and links to `/install` instead;
- `permission === 'denied'`: no banner. Settings already explains how to re-enable.
Pure "should show" helper in `lib/push-client.ts` (or a new `push-prompt-core.ts`) with cases.

---

## Track 9: Trading rules

### 9.1 Favourite prints can't be traded (Done, #174)

- **Data:** `UserSettings.favourites: number[]`, print numbers (`Copy.uid`), at most 50. Prints without a uid can't be favourited (button hidden, "Number existing copies" fixes it). A favourite is checked against the live owner whenever it is used, like `pinned`: a favourite that has left them (an admin move) simply stops counting.
- **Marking:** a heart toggle **Favourite** on the print page (owner only), in the 2.5 print view of the card dialog, and on the profile Showcase print. Server action, viewer from the session. The pinned print is **not** automatically a favourite.
- **Trading engine (`lib/trades.ts`, `lib/trade-core.ts`):**
  - Give side with chosen ids (6.4): a favourite id is refused ("Print #1023381 is one of your favourites. Unfavourite it first to trade it").
  - Give side unpicked (newest-first): skip favourites. If not enough non-favourite prints remain, refuse with "You only have favourites of that card left".
  - Get side at accept (the taker's prints, picked or newest-first): the same rules for the taker's favourites. A direct offer that asks for a print that has since become a favourite fails at accept with the favourite message, and the offer stays open for a counter.
  - Favouriting a print that is already in an open offer's escrow is refused ("It is in an open offer").
- **Upgrades** also skip favourites when spending prints, with the same "only favourites left" refusal. Upgrades are the other thing that takes a print away from the owner.
- **UI:** the composer's print picker (6.4) shows favourites with a heart and disabled; holdings counts on the composer exclude them ("3 prints, 1 favourite"). Profile collection tiles show a small heart on favourite prints.
- **Twitch panel:** see the freeze note above. Panel trades follow the same rule with the existing error shape.
- Words: FAQ under trading ("Can I protect a print from being traded?"), and the export includes favourites.
- Checks: extend `scripts/check-trades.mts` (picked favourite refused, newest-first skips favourites, only-favourites refusal, taker side, favourite set after offering) and the upgrade check.

### 9.2 Staff can reverse a completed trade (Done, #188)

For mistakes and abuse: a staff action that puts every print in a completed trade back where it started.
- **Who:** admins and mods (`roleCan(role, 'mod')`). A reason is required. It is logged with the staff name (audit + `ActivityEvent.staff`) and sent to the Discord **admin** category.
- **Record what moved:** from now on, settlement stores `Trade.moved: { give: string[]; get: string[] }` (exact print ids, which 6.4's engine already knows). For older trades, rebuild the ids from the ledger: prints with a `traded` event at the trade's `resolvedAt` between the two parties. If the ids can't be rebuilt with certainty, the action is unavailable with "This trade is too old to reverse automatically" (use Give / Remove by hand).
- **Rule: all or nothing.** Under the same locks as settlement, every moved print must still be held by the person who received it and not be in escrow. Otherwise refuse and list the prints that have moved on ("Print #1023381 has since been traded to @x"). No partial reversals.
- **Effect:** each print moves back with a new copy event type `reversed` (`who` = staff, `note` = reason), so the print page journey shows it. The trade keeps `status: 'accepted'` and gains `reversedAt`, `reversedBy`, `reverseReason`. Trade page, history and the panel's existing list show "Reversed by staff" where they show the outcome (the website only; the panel shows it as completed, freeze). Both people get a bell / push notice ("A trade between you and @x was reversed by staff: <reason>"). Scores follow from the ledger automatically.
- **Where:** a **Reverse trade** button (`ArmedButton`, reason field) on `/admin/trades` history rows and the mod panel's trades view, and on `/trade/<id>` for staff.
- Checks: `scripts/check-trades.mts`: happy path (conservation, both ledgers back to before), refused when a print moved on, refused twice, an old trade rebuilt from the ledger, escrow untouched; serials check for the `reversed` event.

---

## Track 10: Staff and admin

### 10.1 Staff stay signed in while the activity feed is open (Done, #173)

The staff cookie (`lib/staff-token.ts`) lasts a fixed hour. Page loads get a fresh one through `/auth/staff` (the viewer session lasts 30 days), but the activity feed only polls `/api/admin/activity`, so after an hour the polls fail and the feed stops.
- **Sliding renewal:** `requireStaff` in `lib/staff-guard.ts`, which already re-checks the live staff list on every call, re-issues the staff cookie when it has less than 30 minutes left, with the current role from the staff list. That means any API call or action renews it, and a removed staff member is never renewed. Add `iat` (first issue) to the token and stop renewing after 12 hours, so a session can't run forever without a real sign-in through `/auth/staff`. No change to `middleware.ts` (its CORS rules are frozen; the coarse gate works as before).
- **Feed recovery:** on a 401, `ActivityFeed.tsx` calls `fetch('/auth/staff?silent=1')`, which re-issues from the viewer session without a redirect page (a small JSON answer), and retries once. If that fails, it shows "Signed out. Sign in again" with a button, instead of failing silently.
- Same 401 handling for the dashboard's polling widgets, if any poll.
- Check: token renewal window and the 12-hour cap as pure cases in the staff check.

### 10.2 Dashboard layout per staff member (Done, #178)

`lib/dashboard-data.ts` stores one layout (`admin:dashboard`). Make it per person: `admin:dashboard:<login>`. On read, fall back to the shared `admin:dashboard` (today's saved layout, so nobody loses theirs), then `DEFAULT_LAYOUT`. On save, write the person's key. The emergency password login (no Twitch login) keeps using the shared key. Saved presets (`admin:dashboard:presets`) stay shared, labelled **Team layouts** with who saved each. Notes (`admin:dashboard:notes`) stay shared on purpose (a team scratchpad); the widget says "Shared with all staff".

### 10.3 Built-in dashboard layout presets (Done, #191)

Four built-in layouts in `lib/dashboard.ts` (`BUILTIN_PRESETS`, each passing `sanitizeLayout`), listed above the team layouts in the preset menu:
- **Stream night**: live status, overlay controls, activity, pulls chart (24h), quick actions, stream recap.
- **Season overview**: overview, pulls chart (season), top collectors, rarity, packs, card ownership, weekly digest.
- **Trading desk**: trades, attention, activity, leaderboard.
- **Minimal**: overview, attention, quick actions.
Applying one replaces the person's own layout (with the existing undo / cancel, if the editor has one; otherwise a confirm). A pure check that each sanitizes to itself.

### 10.4 Pick the still frame of an animated card (Done, #185)

The static thumbnail of an animated upload is always the first frame (`toThumb` in the upload path), and that frame is sometimes blank or mid-transition.
- **Data:** `Card.stillUrl?: string`, a chosen still. A helper `cardStill(card)` returns `stillUrl ?? cardThumbUrl(card.imageUrl)` (and the same for `fullArtImageUrl` with `fullArtStillUrl?`). Replace the direct `cardThumbUrl(card.imageUrl)` calls that render a card's static art (grep; share images, OG images, the dex, the profile, Discord embeds), so the choice shows everywhere. The normalizer leaves old cards unchanged.
- **Frame source:** `GET /api/admin/card-frames?url=<card art>&n=<k>` (`requireAdmin`, Blob or `/assets/cards` URLs only) uses `sharp` with `{ page: k }` to render frame k as a small webp, and without `n` returns `{ frames, delayMs }`. It works for the Season 1 bundled cards and Blob uploads alike.
- **UI:** in the card edit dialog / pack flow card editor, for animated art: **Choose still frame** shows a scrubber (slider over the frame count with a live preview, plus 8 evenly spaced suggestions as clickable thumbnails). **Use this frame** calls a server action that renders that frame at thumbnail size, stores it in Blob at `cards/<uuid>.still-<k>.webp` (a new name each time, so CDN caching never serves an old still), sets `stillUrl`, records an audit entry and `revalidatePath`s. **Reset to first frame** clears it.
- Draft packs (wizard) store it on the draft card too.
- Check: a small check for the URL guard and `cardStill` fallback. Not checkable locally: Blob writes (mock the put in the check, test the UI against the mock KV with a bundled card, whose still upload will fail without Blob; say so in the PR).

### 10.5 Redesign the admin Prints screen (Done, #190)

The request only says "redesign". **Proposed** (the user confirms or says what bothers them today):
- **Top:** summary tiles (prints made this season, held / in offers / retired, last numbered, numbering status with the "Number existing copies" action) and one search box that takes a print number (`#1023381` or `1023381`), a login or a card name.
- **Main:** a card list (art, name, rarity) with per-version made counts. Expanding a card shows its editions as a compact grid of chips (edition, print number, holder, bonus mark), filterable by version, holder and origin, sorted by edition. Clicking a chip opens the print in a side panel (journey, Give, Remove, Feature as print of the week) without leaving the list. The full `/admin/serials/<season>/<copy>` page stays for deep links.
- **Filters in the URL** (`?card=&v=&holder=&origin=&q=`) so a view can be shared between staff.
- Phone width: the side panel becomes a full-screen sheet.
Status changes to Ready once the user agrees (or adjusts).

---

## Track 11: Help and feedback

### 11.1 Changelog page (Done, #177)

`/changelog` (public, indexable, in `PUBLIC_PAGES` and the sitemap): "What's new", newest first. Entries are hand-written in `lib/changelog.ts` (`{ date: 'YYYY-MM-DD', title, items: string[], tags?: ('new' | 'improved' | 'fixed')[] }`), written for players, not developers. Seed it with the player-facing work from #144 to #169 grouped into a handful of entries.
- Link from the footer and the site menu. A small dot on the menu link when the newest entry is newer than the viewer's last visit to `/changelog` (`localStorage`, try/catch).
- **Rule for later PRs** (add to `CLAUDE.md` Conventions and the PR checklist in `docs/review.md`): a player-facing change adds or extends a changelog entry in the same PR.
- `check-words` scans the file (no em dashes, print wording).

### 11.2 Suggestions, feedback and problem reports (Done, #186)

One inbox for both, since they share everything but the form:
- **Page:** `/feedback` (noindex) with two tabs: **Suggest something** (title, details) and **Report a problem** (what happened, what you expected, page URL prefilled from `?from=`, and a tickbox, on by default, "include my device and app version": user agent, build stamp, screen size). Signed in only ("Log in with Twitch to send feedback"), Turnstile like trades, 5 sends per viewer per day, length caps.
- **Store:** `feedback:<id>` hash + `feedback:list` (newest first, capped at 1000), `{ id, kind: 'idea' | 'bug', user, title, body, meta?, at, status: 'new' | 'planned' | 'done' | 'wontfix' | 'duplicate', reply?, repliedBy? }`.
- **Staff:** `/admin/feedback` (admins and mods): list with kind / status filters and a "new" count in the nav and the dashboard Needs attention panel. Setting a status or writing a reply sends the sender a bell / push notice (a new notice kind `feedback`, on by default, with its own Settings switch).
- **Discord:** a new category `feedback` (off on existing channels, preset "Feedback") posts each new item. The text is Markdown-escaped and cut to 500 characters, mentions stay empty. Staff names never appear (only the sender's login, as public posts already show).
- **Entry points:** footer links "Suggest something" and "Report a problem", the FAQ "Something not working?" section, the site error page (`error.tsx`: "Report this", with the page prefilled), and the bell menu.
- **Words:** FAQ entry; Privacy Policy (what is stored, how long: kept until resolved plus 90 days, then deleted by a sweep on the admin page load, and the device details only when ticked). Bump `LEGAL_UPDATED`. The data export includes the viewer's own feedback.
- Check: `scripts/check-feedback.mts` (validation, rate limit, status change notice, Discord gating, sandbox silence).

### 11.3 Request account deletion (Done, #193)

Today the FAQ says to email. Add a self-serve **request**; an admin still does the deleting, because a deletion retires prints other people's journeys point to.
- **Settings** → bottom, "Delete my account": explains what happens (collection, prints, trades, settings and notices removed; prints they hold are retired and show "a removed collector" in journeys; open offers cancelled; it can't be undone), then a typed confirmation of their login and **Request deletion**. Turnstile. The request goes into the 11.2 inbox as kind `deletion` (its own filter and its own red count), and the viewer sees "Requested on <date>. Cancel request" until it's handled.
- **Admin:** on a deletion request, **Delete this viewer** runs the existing `deleteUser` (check what it covers today and extend it: cancel open trades with `cancelOpenTrades`, remove push subscriptions, watch index entries, favourites / pinned, notices, the feedback items of that user apart from the deletion record, the twitch opaque mapping), takes a `takeUserSnapshot` first (kept 30 days for mistakes, which the Privacy Policy says), audits it, and marks the request done. **Decline** with a reason notifies them.
- If staff haven't handled it in 30 days, the Needs attention panel turns it red (legal expectation: about a month).
- **Words:** FAQ "How do I get my data deleted?" points to the button (the email stays as a fallback); Privacy Policy and Terms describe the request and the 30-day snapshot. Bump `LEGAL_UPDATED`.
- Check: extend the user-admin check (deletion removes every listed key, snapshot taken, trades cancelled, escrowed prints returned before the user's own prints are retired).

## Track 12: Mix It Up paid pulls (added 2026-10-16, planned and built in one session at the owner's request)

Request: viewers pay Brie Bucks (the Mix It Up currency) for a pack; a limit per viewer per stream; a Settings tab just for Mix It Up; the message sent to Mix It Up can be customised. 12.1 to 12.3 ship as **one PR** because they are one flow and share the pull webhook and `/api/collection`.

**Decisions (defaults, change them here if wrong):**
- Mix It Up answers **in the HTTP response** of its webhook command (a "Webhook Response" action), so each step is one request and one reply. We never wait for a call back. Two requests per pull: `balance` before, `deduct` after.
- Off by default. While off, the pull webhook behaves exactly as today. Admin quick actions (gift packs) and the Twitch panel never charge and are never limited.
- Fail closed before the pull (no balance answer in 5 s = no pack), fail open nowhere. The streamer can switch the whole thing off in one click.
- One pull costs one price (`cost`, default 100). The price, currency label, limit and message are settings, not code.

### 12.1 The Mix It Up tab (Ready)

Settings gets a tab **Mix It Up** (id `mixitup`, icon `coins`) with its own KV key `mixitup:settings` (`lib/mixitup-core.ts`: `MixItUpSettings`, `cleanMixItUpInput`, pure). Fields: **enabled**, **balance URL**, **deduct URL** (empty = reuse the balance URL, Mix It Up tells them apart by the `action` field), **shared secret** (sent as `secret` in every request so the command can check it), **currency name** (default "Brie Bucks"), **price per pack**, **limit per viewer per stream** (0 = none), **message** (the template below) and **balance field** (which JSON key holds the number, default `balance`). Both URLs must pass `checkWebhookUrl` (public http(s) only). Buttons: **Check a balance** (asks Mix It Up for a viewer's balance, nothing else) and **Send a test message** (a `test` request that deducts nothing). A short **recent requests** log (last 20, `mixitup:log`: when, viewer, what, result) sits under the form for debugging.

**Message template.** Placeholders: `{username}`, `{amount}`, `{currency}`, `{cardName}`, `{variant}`, `{stars}`, `{packName}`, `{cardNumber}`, `{serial}`. Default: `{username} opened a pack and pulled {cardName} ({variant}, {stars} stars). {amount} {currency} spent.` Unknown placeholders are left out (`interpolate` from `lib/webhooks.ts`), the result is capped at 400 characters, and the form shows a live preview with sample values.

### 12.2 The paid pull flow (Ready)

1. `POST /api/webhooks/pull` (existing; secret and live gate unchanged). If Mix It Up is on: check the viewer's limit (12.3), then `POST balanceUrl` `{ action: 'balance', secret, username, currency }`. The reply must be 2xx JSON with a number at `balanceField`. Count what the viewer already has in flight (`mixitup:pending:<user>`) so ten fast requests cannot spend one balance ten times: the balance must cover `price x (pending + 1)`.
2. Not enough, over the limit, or no answer: nothing is queued; the webhook answers `{ ok: true, ignored: true, reason, message }` where `reason` is `insufficient_balance | limit_reached | mixitup_unavailable | bad_balance` and `message` is a sentence Mix It Up can post to chat.
3. Enough: reserve (`mixitup:pay:<eventId>` = viewer, price, stream key, 1 h TTL; pending and stream count go up) and queue the pull with `paid: true` and the event id as before. The overlay passes that id (`payId`) back when it saves the pull.
4. `POST /api/collection` (pull with a `payId`): adds the print, then `POST deductUrl` `{ action: 'deduct', secret, username, amount, currency, message, pullId }` and waits (5 s). Mix It Up's reply counts as applied when it is 2xx and has no `ok`, `success` or `applied` set to `false`.
5. Applied: carry on as today (activity, outgoing Card Pulled webhook). Not applied: **revoke**: the print is removed and retired in the copy ledger (the same change as the admin "remove this print", reason "payment failed"), the stream count goes back down, no pull is recorded, and the reply is `{ ok: true, revoked: true, owned }` so the overlay resyncs. The log records it, and the system Discord channel gets a notice (`notifySystem`, tone `warn`).
6. The reservation is single-use (`del` decides who owns it), so a repeated save cannot charge twice.

### 12.3 Limits per stream per viewer (Ready)

`limit` paid pulls per viewer per stream. "Per stream" = the current Twitch stream (`getLiveStatus().startedAt`, the same marker the recap uses). While offline or when Twitch is not configured, the window is the UTC day, so test pulls off-stream are still bounded. Counter `mixitup:cnt:<streamKey>:<user>` (3 day TTL), raised when a pull is reserved and lowered when it is revoked. A viewer at the limit gets `limit_reached` and the message "X has used all N pulls for this stream." The dashboard is not changed.

**Files:** `lib/mixitup-core.ts` (settings, cleaning, template, reply parsing, stream key, decisions; pure), `lib/mixitup.ts` (KV, calls, reserve / settle / revoke, log), `app/admin/settings/MixItUpConfig.tsx` + actions in `app/admin/settings/mixitup-actions.ts`, hooks in `app/api/webhooks/pull/route.ts`, `app/api/collection/route.ts`, `public/widget.js` (pass `payId`), `scripts/check-mixitup.mts` (fake Mix It Up, mock KV: price, limit, pending, revoke, double settle), `docs/admin.md` + `docs/overlay.md` notes, changelog: none (staff-only).

**Known limits:** `/api/collection` is open today (the overlay saves through it), so someone who finds the URL could already add prints; paid pulls do not make that worse but do not fix it. Closing it needs a signed save token from the queue (a separate item). A reply that is lost after Mix It Up applied the deduction would revoke a paid pull; the viewer can be refunded by hand from the log.

---

## Later: next extension version (after the freeze lifts)

Ship as one reviewed panel version: choosing prints when trading (6.4: composer and accept picker, exact serial preview), favourite prints (9.1: hearts and disabled picks), "Reversed by staff" on reversed trades (9.2), achievements, Looking for / listing alerts, the binder, share images, the 2.5 copies-first dialog, unique numbers on tiles (2.1), a link to `/trade/<id>` from the Trades tab, anything Twitch reviewers asked for. Bump `version` in `package.json`, rebuild the zip, refresh screenshots, update the change log in `twitch-extension/SUBMISSION.md`.

## Done (recent)

- Tracks 7 to 11 (the second Discord list), all merged 2026-10-16:
  - Track 7: iPhone icon (#171), equal-height home widgets (#172, finished in #199), card dex dialog (#175), own listings on the trade board (#179), up to 25 Discord channels (#180), dashboard opens on Season (#181), admin Settings on phones (#184), new bonus names (#189), info tooltips with `lib/glossary.ts` (#198).
  - Track 8: rarest prints, showcase links and granted cards (#176), inline profile editor with more accents and a picker (#182), layout presets (#183), binder cover and visitors' default view (#187), share-my-stats image (#192), turn-on-alerts banner (#194), pronouns (#196).
  - Track 9: favourite prints (#174), staff reverse a completed trade (#188).
  - Track 10: staff stay signed in on the feed (#173), dashboard layout per staff member (#178) and presets (#191), still frame of animated cards (#185), Prints screen redesign (#190).
  - Track 11: changelog page (#177), feedback inbox (#186), account deletion request (#193).
  - Also: Discord "Send last activity" now respects the channel's filters (#197), footer link columns (#195).

- Track 6: wanted counts on listings (#166), print of the week (#167), choose which print to trade (#168), weekly digest in Discord (#169).

- Streams D to F: prints-first card dialog (#161), Web Push alerts (#162), stream recap to Discord (#160). Dependency alerts: postcss / postcss-selector-parser cleared with npm overrides (#163).

- Stream A, prints: pull / grant / upgrade events carry the print (#147), Recent pulls open the print (#151), profile Recent pulls widget (#154), overlay print number (#157).
- Stream B, Discord: several channels (#149, with the GitHub / Vercel setup for 3.5), new event kinds (#152), `/trade/<id>` (#150), Trade listings channel (#155), delivery log with auto switch-off (#156).
- Stream C, notices: fast polling with toasts, title count and app badge (#153), `/notifications` page (#158).

- 2.6 print wording: a copy is a print, `Print #1023381`, edition bonus (#146, 2026-10-16).

- Track 1 quick fixes: opaque apple icons plus the root apple-touch names, rarest cards animate on hover (#144, 2026-10-16).

- Previous roadmap complete (2026-10-15): `npm run verify` and CI, preview isolation, nightly backups, data health, `CLAUDE.md` split into `docs/`, `@vercel/blob` 2.x, review batches P1 to P7, M1, A1 to A8.
