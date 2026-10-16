# The Cheesy TCG, roadmap

Owned by the planning model (Opus, see "Model Workflow Guidelines" in `CLAUDE.md`). Execution picks up items marked **Ready**; anything marked **Needs design** or **Needs a decision** goes back to planning (or to the user) first. Last updated 2026-10-16.

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
| 1.1 | iOS home-screen icon | Ready | S |
| 1.2 | Rarest cards animate on hover (home) | Ready | S |
| 2.1 | Pull events carry the copy (unique number) | Ready | S |
| 2.2 | Recent pulls open the copy | Ready (after 2.1) | S |
| 2.3 | Profile "Recent pulls" with serials | Ready (after 2.1) | S |
| 2.4 | Overlay shows the unique copy number | Ready (after 2.1) | S |
| 2.5 | Card dialog: copies first, then one copy's details | Ready | M |
| 2.6 | A card copy is called a "print" | Ready (do before 2.2 to 2.5) | M |
| 3.1 | Discord: several channels, each with its own events | Ready | M |
| 3.2 | Discord: new event kinds (upgrades, trades, admin log, system) | Ready (after 3.1) | M |
| 3.3 | Trade page per offer (`/trade/<id>`) | Ready | M |
| 3.4 | Discord: "listed for trade" channel | Ready (after 3.1, 3.3) | S |
| 3.5 | GitHub and Vercel changes in Discord | Ready (user setup, no code) | S |
| 3.6 | Discord delivery log | Ready (after 3.1) | S |
| 4.1 | Notices arrive fast and are hard to miss | Ready | M |
| 4.2 | Notifications page (full history) | Ready | S |
| 4.3 | Push notifications to phones and browsers | Ready (after 4.1) | L |
| 4.4 | Link a Discord account for DMs | Later (after 4.3) | L |
| 5.1 | Stream recap posted to Discord | Ready (after 3.1) | M |

Suggested order: Track 1 (quick wins, same day), 2.6 (the print wording, so later items are written with it), 2.1 to 2.4, 3.1 to 3.6, 4.1 and 4.2, 4.3, 2.5, 5.1. 4.4 waits until push has been live for a while.

---

## Track 1: Quick fixes

### 1.1 iOS home-screen icon (Ready)

**Problem:** installed on iPhone, the icon is a plain capital "C" (iOS's fallback: first letter of the app title) instead of the cheese logo.

**What we know:** production serves `<link rel="apple-touch-icon" href="/apple-icon.png?...">` (180x180, 200 OK), but the PNG is **RGBA with transparency**, and `/apple-touch-icon.png` at the root is a **404**. iOS falls back to the letter when it can't use the linked icon; some iOS paths (and some in-app browsers, e.g. opening the site from Discord then "Add to Home Screen") only try the root conventional names.

**Do:**
- Make an opaque 180x180 version of the icon (the brand icon on the app's background colour `#0a0f1e`, no alpha channel, ~12% padding so iOS's rounded mask doesn't clip it). Replace `app/apple-icon.png` with it and also commit it as `public/apple-touch-icon.png` and `public/apple-touch-icon-precomposed.png` (same file), so the root names answer 200.
- The `maskable-*` icons in `public/icons/` should also be opaque (check; regenerate the same way if not).
- Add a check line to `scripts/check-public-meta.mts` (or a new tiny check): the three apple icon files exist and are PNGs whose colour type has no alpha (byte 25 of the PNG header is 2, not 6).
- **User step after deploy:** delete the old home-screen icon and add it again (iOS caches the icon at install time; nothing we do updates an existing one). Say this in the PR and in the `/install` iPhone steps ("If you see a letter instead of the logo, remove it and add it again").
- Not checkable locally: confirm on a real iPhone.

### 1.2 Rarest cards animate on hover (Ready)

**Problem:** the home page "The rarest cards" tiles render a plain `<img>` of the static thumbnail (`app/(site)/page.tsx`, the `rarest.map`), so the animated art never plays; everywhere else uses `CardTile`, which swaps in the animated file on hover.

**Do:** render the art with `CardTile` (client component; the page stays a server component, it just renders it), keep the rarity border / glow and the `holo-hover` shine, keep the whole tile one `Link`. No `onClick` in the page file. Check the same pattern anywhere else a card image is a bare `<img>` on the public site (`grep -rn "cardThumbUrl(" app --include=*.tsx`) and fix those in the same PR if they are meant to animate. Touch devices: no change (no hover); fine.

---

## Track 2: Copies everywhere

Background: `docs/serials.md`. A copy's id is `<card>.<variant index>.<n>` (so it can be **derived** from card + variant + edition), and its unique number `uid` (`#1023381`) resolves through `/c/<uid>`.

**Wording:** user-facing text in 2.1 to 2.5 follows 2.6 (a copy is a **print**, the 7-digit number is the **print number**, `#7` is the **edition**). Below, "copy" and "unique number" are the code-level names (`Copy`, `uid`), not UI text.

### 2.1 Pull events carry the copy (Ready)

- `addCollectionEntryWithSerial` (`lib/kv.ts`) returns `{ owned, serial, copyId, uid }` (read from the copy `mint()` just made, under the same lock). `null`s when the collection is not tracked yet.
- The `pull` `ActivityDetail` gains optional `copyId?: string; uid?: number`. `POST /api/collection` sets them on the event and returns `uid` beside `serial` / `serialMult` (additive, old overlay builds ignore it). Grants: `addCollectionEntry` with origin `'grant'` does the same for the `grant` event.
- Helper `copyHrefFor(e: ActivityEvent, seasonId)` in a client-safe module (`lib/copy-link.ts`): `/c/<uid>` when `uid` is set; otherwise, for older events that have `serial`, the derived `/copy/<season>/<card>.<variantIndex>.<serial>`; otherwise `null` (caller falls back to the card dex link). The season id comes from the collection name the same way `recentPullItems` already resolves it.
- Check: extend `scripts/check-serials.mts` (the returned uid / copyId match the ledger) and add pure cases for `copyHrefFor`.

### 2.2 Recent pulls open the copy (Ready, after 2.1)

- Home **Recent pulls** (`RecentPulls`, `recentPullItems` in `lib/home-pulls.ts`): the card name links to `copyHrefFor(...)` (fallback `/cards?card=`). Show the unique number small after the edition chip (`Edition #7 · Print #1023381`) when known.
- Same link in the admin / mod activity feed rows and event detail (admin links to `/admin/serials/<season>/<copyId>`), and in the Discord pull embed (the embed's title links to the copy page; the author line still links to the profile).
- A copy that has since been traded or upgraded still opens: the copy page shows its whole journey. Private / hidden holders are masked by the copy page as today.

### 2.3 Profile "Recent pulls" with serials (Ready, after 2.1)

The `recent` profile widget today lists the newest copies the person **holds** (any origin, including ones traded in). Change it to what was asked:
- Rename it **Recent pulls** and list the owner's latest copies whose `origin` is `pull` (from the ledger, live and retired, so a pull later traded away still shows, marked "traded" / "forged" with the current state from `provenance`), 8 rows: card name + version, edition chip (`SerialChip`), unique number, when; each row opens the copy page.
- Add it to `DEFAULT_PROFILE_LAYOUT` (span 6, after `rarest`). Existing saved layouts are untouched (the widget id stays `recent`).
- Before tracking (collection not backfilled): the widget falls back to the viewer's `pull` events from the activity log (no serials), or hides for visitors.

### 2.4 Overlay shows the unique copy number (Ready, after 2.1)

- `widget.js` `showSerial()` reads `uid` from the `POST /api/collection` response. New Overlay Editor property `reveal.serialFormat`: `edition` (today: `#7`, default so nothing changes on stream until chosen), `uid` (`#1023381`), `both` (`#7` pill plus a small `Print #1023381` line under it). Registry entry in the same section as `reveal.showSerial`; preview / dry runs use a sample uid.
- Show-off (`!card` chat command): `prepareShowOff` sends the lowest copy's `uid` too, so the same format applies.
- `node --check public/widget.js`, then load `/overlay.html?dev` against the mock KV and draw with "Don't save" off (mock only) to see a real uid. Not checkable locally: real OBS.

### 2.5 Card dialog: copies first, then one copy's details (Ready)

Asked: "profile collection cards should expand to all owned serials of the card when clicked, then information given when a copy is clicked (same in binder)".

Today a collected card opens one dialog (`CollectionGrid.tsx`) with art, per-version rows, value and a `SerialList`. New flow, in the same dialog (no new route), shared by the grid and the binder (both already call the same `onOpen`):

1. **Copies view (first):** header with the card name, rarity and "N copies"; then a grid of small tiles, **one per owned copy**, grouped by version (Regular, RH, FA, SH), newest edition last; each tile is the card art with that version's holo, the `SerialChip` edition, the unique number, and a gold mark when it earns a serial bonus. A card with exactly one copy skips straight to step 2. Untracked season: one tile per version with `xN` and no numbers.
2. **Copy view:** the `FlipCard` of that copy (back already exists, `lib/flip-back.ts`), edition "#7 of 31 made", unique number, points it is worth (with bonus), origin + date, a 3-line journey summary, and buttons: **Open copy page**, **Share this copy**, **Pin to my profile** (owner only, existing `PinCopyButton`), **Offer a trade** (visitor; pre-selects this card + version) and, for the owner, **Upgrade** where the existing rules allow it. A **Back to all copies** button returns to step 1; Esc closes the dialog as now; arrow keys still step to the next collected card.
3. The card-level info that lives in the dialog today (pull chance, per-version odds / points, share of score) moves under a "Card details" disclosure in step 1, so nothing is lost.

Data: `GridCard.copies` already carries id, n, variant, `at`, `origin`, `made`, `m`, `p`; add `uid` there in `buildGridCards`. Large holders: cap the tile grid at 60 with "Show all N" (no fetch needed, the data is already on the page; check the page payload size for the top collector in the seeded data and say the number in the PR).

Checks: pure grouping / ordering in `lib/collection-view.ts` (`copiesForDialog`), added to `scripts/check-collection-view.mts`. Run `scripts/sweep-public.mjs` (dialog open at 390px: no overflow, buttons named).

Panel parity is a "next extension version" item.

### 2.6 A card copy is called a "print" (Decided 2026-10-16, Ready)

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

### 3.1 Several channels, each with its own events (Ready)

- `DiscordSettings` becomes `{ enabled: boolean; channels: DiscordChannel[] }` with `DiscordChannel = { id: string; name: string; url: string; enabled: boolean; categories: Record<DiscordCategory, boolean>; minStars: number; newOnly: boolean }` (max 8 channels). The normalizer in `lib/discord.ts` turns the old shape into one channel called "Activity" with the same settings, so nothing changes until an admin edits it (no migration script).
- `notifyDiscord(e)` sends to **every** enabled channel whose filters pass (`shouldSend(e, channel)`), in parallel, each failure isolated. `buildMessage` is built once per event.
- Settings → Webhooks: `DiscordConfig` lists channels as cards (name, URL, toggles, Test / Send last activity per channel, Remove behind `ArmedButton`), plus **Add channel** with presets that pre-tick categories: *Activity*, *Pulls*, *Upgrades*, *Trades*, *Trade listings*, *Admin log*, *System*, *Deploys & code* (the last one just shows the 3.5 instructions, no categories).
- Same rules as today: only real discord.com webhook URLs, empty `allowed_mentions`, Markdown-escaped names, nothing sent from sandboxes / previews. Check: extend the existing Discord check with the old-shape normalizer, multi-channel fan-out and per-channel filters.

### 3.2 New event kinds (Ready, after 3.1)

New `DiscordCategory` values (old ones kept):
- Today `categoryOf` files `upgrade` and `trade` under `cards` (with grants and removals). Split them out; the normalizer ticks the new `upgrades` / `trades` boxes wherever `cards` was ticked, so existing channels keep posting the same things.
- `upgrades`: every `upgrade` event (card, from, to, cost, the new copy's edition / unique number, which 2.1's helper also adds to the upgrade event; link to the new copy).
- `trades`: completed trades, counters and admin cancels (as today: not declines, withdrawals or expiries).
- `listings`: new **board listings** only (3.4).
- `admin`: staff actions with who did it (`ActivityEvent.staff` and the audit trail: grants, removals, resets, deletes, staff changes, season activation / end, pack publish, scoring changes, trading paused / resumed). Some of these are audit entries, not activity events: add one call `notifyAdminLog(entry)` inside `recordAudit` and the staff log writers, sending to channels with `admin` on. **The admin category is the one place staff names appear in Discord**; the channel is meant to be private, and the setting says so.
- `system`: nightly backup result (success with size, or failure), the data-health threshold being crossed, a sandbox created / deleted, the Twitch live gate flipping. Sent from the places that already detect them.
- Embeds stay compact: title, one or two fields, a link, the rarity colour where there is a card.

### 3.3 Trade page per offer (Ready)

The Discord listing post needs a "direct link to the trade". There is no per-trade page today (`/trade` has tabs only).
- `/trade/[id]` in the `(entity)` route group (real 404, no `loading.tsx`), `noindex`. Reads the open trade, or the history entry if it is closed.
- Open listing: both stacks (`TradeStacks`, with serials), lister, expiry countdown, fairness label for the signed-in viewer, and **Take this trade** (`TradeActions`, the same second-tap flow and API). Signed out: "Log in with Twitch to take this trade" with `returnTo` back here. Direct offer: only the two people in it see the stacks; others get "This is a private offer". Closed: "This trade was completed / cancelled / expired" with the outcome, no actions.
- `sweepTrades()` on load (like the other trade pages). Board listing cards and bell notices link here instead of `/trade?tab=board`.
- Add to `NOINDEX_PATHS`, `PUBLIC_PAGES` not needed (not searchable). Check: `scripts/check-trades.mts` gains a small case for the page's visibility rule (pure helper `tradeVisibleTo(trade, viewer)` in `lib/trade-core.ts`).

### 3.4 "Listed for trade" channel (Ready, after 3.1 and 3.3)

When a **board listing** is created (`announceTrade`, the same hook that drives listing alerts): post to channels with `listings` on. Embed: "<lister> listed a trade", **Gives** / **Wants** fields (card names, versions, edition numbers), points each side, expiry, the first given card's thumbnail, and the title linking to `${SITE_URL}/trade/<id>`. Optional per-channel role mention? **No**: `allowed_mentions` stays empty (anyone could trigger it); the channel's own notification settings do the job. When the listing is taken, cancelled or expires, the post is **not** edited (webhook edits need the message id; keep it simple). The trade page shows the outcome.

### 3.5 GitHub and Vercel changes in Discord (Ready, user setup, no code)

Neither needs our server:
- **GitHub**: Discord webhooks accept GitHub's format if `/github` is added to the URL. In the repo: Settings → Webhooks → Add webhook, Payload URL `<discord webhook URL>/github`, content type `application/json`, events: pushes, pull requests, releases, **deployment statuses**.
- **Vercel**: Vercel reports every deployment to GitHub as a deployment status, so the GitHub webhook above already posts "deployed to Production / Preview" with the link. (If more is wanted later, Vercel's own webhooks could feed a small `/api/vercel-hook` route; not needed now.)
- Put these steps in the Settings → Webhooks "Deploys & code" preset card and in `docs/hosting.md`.

### 3.6 Discord delivery log (Ready, after 3.1)

Each channel keeps its last 20 send results (time, event kind, HTTP status, Discord's error text) in KV `discord:log:<channelId>` (list, capped). Shown under each channel card with a red dot when the last send failed (a deleted webhook answers 404). A channel failing 20 times in a row is switched off automatically and the dashboard's Needs attention panel says so.

---

## Track 4: Notifications

Background: `docs/trading.md` "Notifications". Notices live in `notif:<user>` (30 newest); the bell polls `GET /api/notifications` every 45 s and on tab focus. That is why they feel late, and a new notice only changes a small badge.

### 4.1 Arrive fast, hard to miss (Ready)

- **Cheap version check.** Every `notify()` also `INCR`s `notif:<user>:v`. New `GET /api/notifications?since=<v>` answers `204` (no body) when nothing changed, so polling is cheap.
- **Poll faster while visible**: every 10 s while the tab is visible, back off to 60 s after 5 minutes without input, stop while hidden (resume and check at once on focus). Also check right after the viewer does something that may cause a reply (sending an offer).
- **Toast**: a new notice slides in at the top right (bottom on phones) for 6 s with its icon, text and action button ("See the offer"), stacking up to 3; `aria-live="polite"`; reduced motion = fade. Clicking marks it read.
- **Louder badge**: the bell shakes once and the badge pulses on arrival; the page title gets a `(2)` prefix while unread; installed apps set the app icon badge (`navigator.setAppBadge`, where supported).
- **Optional sound**: a short chime, off by default, `UserSettings.noticeSound` in Settings → Notifications.
- Checks: the version / 204 logic in a pure helper + the existing notification check.

### 4.2 Notifications page (Ready)

`/notifications` (signed in, noindex): the full list of the 30 kept notices grouped by day, filter by kind (offers, results, listing alerts, admin), Mark all read. The bell's footer links to it. Consider raising the cap to 100 (check `scripts/check-words.mts` and the Privacy Policy number if so).

### 4.3 Push notifications (Decided 2026-10-16, Ready, after 4.1)

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

### 5.1 Stream recap posted to Discord (Ready, after 3.1)

When the channel goes offline (the live check in `lib/twitch-live.ts` already sees the transition; record `twitch:live:since` on the way up and post on the way down, once, under a short KV lock so two instances don't both post), post a recap embed to channels with a new `recap` category: packs opened, cards pulled, new collectors, first-ever pulls, the rarest pull of the stream (with a link to the copy), top puller, trades completed, biggest rank climb. Built from the activity log between the two times (pure `buildStreamRecap(events, from, to)` + a check). If the transition is missed (nobody visited while live), skip; never post a recap for a stream with no pulls. Also show the latest recap on the admin dashboard as a widget.

### Other ideas, not planned yet (user picks)

- **Weekly digest** in Discord: the week's leaderboard movers and most traded cards.
- **"Wanted" pings in Discord**: when a card someone is looking for gets listed, the listing post mentions how many collectors want it ("3 collectors are looking for this").
- **Copy of the week** on the home page: the copy with the most interesting journey (most holders, oldest, first edition traded the most).

## Later: next extension version (after the freeze lifts)

Ship as one reviewed panel version: achievements, Looking for / listing alerts, the binder, share images, the 2.5 copies-first dialog, unique numbers on tiles (2.1), a link to `/trade/<id>` from the Trades tab, anything Twitch reviewers asked for. Bump `version` in `package.json`, rebuild the zip, refresh screenshots, update the change log in `twitch-extension/SUBMISSION.md`.

## Done (recent)

- Previous roadmap complete (2026-10-15): `npm run verify` and CI, preview isolation, nightly backups, data health, `CLAUDE.md` split into `docs/`, `@vercel/blob` 2.x, review batches P1 to P7, M1, A1 to A8.
