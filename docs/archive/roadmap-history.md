# Roadmap history (archive)

> Read this only when you need the original plan or decision behind a finished roadmap item (cited as "ROADMAP 13.1" and similar in code and docs). The area docs describe the code as it is now; the statuses below are frozen as of 2026-10-18 and many items marked Ready here have since shipped. Open work lives in `ROADMAP.md`.

Owned by the planning model (Opus, see "Model Workflow Guidelines" in `CLAUDE.md`). Execution picks up items marked **Ready**; anything marked **Needs design** or **Needs a decision** goes back to planning (or to the user) first. Last updated 2026-10-16 (after #207; Tracks 15 to 22 added from the third Discord list).

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
| 12.1 to 14.1 | Tracks 12 to 14: Mix It Up paid pulls, collection API lock-down, webhook grants | Done (#201 to #206) | |
| 15.1 to 22.1 | Tracks 15 to 22: the third Discord list (23 items) | See their own table | |

**Tracks 1 to 14 are done** (#144 to #206; the only open item is 4.4, which waits for a decision). The user steps below are still open.

**User steps still open:**
- [ ] **Overlay key (13.2), do this right after the deploy:** copy the new browser-source address (it ends `?key=...`) from Settings -> OBS Overlay into every OBS browser source, and each scene's address from the Overlay Editor, then refresh the sources. Until then pulls will not play and the overlay shows "Overlay key missing or changed". Clear the pull queue first (the dashboard's Clear queue): pulls queued before 13.1 have no ticket and are not saved.
- [ ] **Mix It Up paid pulls (Track 12), only when you want them on:** in Mix It Up make a webhook command that answers `{ "balance": n }` for `action: "balance"` and takes the currency for `action: "deduct"` (answer with a Webhook Response; 2xx and not `ok: false`), then fill in Settings -> Mix It Up (addresses, price, default limit, message), press **Check balance** and **Send test message**, and switch it on. It is off until you do.
- [ ] **Web Push keys:** set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (`mailto:` the legal contact address) in Vercel Production, then redeploy. The Stream E session saved a generated pair to a file outside the repo; the push option stays hidden until they are set. Then try it on a real iPhone (app installed), Android and a desktop browser.
- [ ] **GitHub webhook (3.5):** repo Settings -> Webhooks, Payload URL `<discord webhook URL>/github`, events: pushes, pull requests, releases, deployment statuses.
- [ ] **Discord channels:** add the channels you want in Admin -> Settings -> Webhooks (Trade listings, Admin log, System, Recap) and press Test on each.
- [ ] **iPhone icon (1.1, 7.1):** the code is fixed (opaque icons, plain apple-touch link), but iOS keeps the icon from install time. Remove the home-screen app, delete `cheesytcg.app` under Settings > Apps > Safari > Advanced > Website Data, then add it again from Safari (not Discord's in-app browser); confirm the cheese logo shows.
- [ ] **Dependabot `braces` alert** (high, dev-only, through Tailwind 3's chokidar / micromatch): no patched release exists. Dismiss it as "no fix available" until upstream ships one; build-time only, not reachable at runtime.


**Streams A to K and Tracks 12 to 14 are done** (2026-10-16, #144 to #206). Next: Tracks 15 to 22 (the third Discord list, 2026-10-16), in the streams set out under "Tracks 15 to 22: order". After that: 4.4 or the next extension version.

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
| 12.1 | Mix It Up settings tab (connection, price, message) | Done (#201) | M |
| 12.2 | Paid pulls: balance check, deduct, revoke | Done (#201) | L |
| 12.3 | Limits per stream per viewer | Done (#201) | S |
| 12.4 | Pull limits stored per viewer, with temporary bonuses | Done (#204) | S |
| 13.1 | Lock down `/api/collection`: server-rolled pulls with one-use tickets | Done (#202) | M |
| 13.2 | Overlay key for the queue, notify and heartbeat endpoints | Done (#203) | S |
| 14.1 | Webhook grants (Mix It Up rewards) read, post and count as pulls | Done (#205, #206) | S |

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

### 12.1 The Mix It Up tab (Done, #201)

Settings gets a tab **Mix It Up** (id `mixitup`, icon `coins`) with its own KV key `mixitup:settings` (`lib/mixitup-core.ts`: `MixItUpSettings`, `cleanMixItUpInput`, pure). Fields: **enabled**, **balance URL**, **deduct URL** (empty = reuse the balance URL, Mix It Up tells them apart by the `action` field), **shared secret** (sent as `secret` in every request so the command can check it), **currency name** (default "Brie Bucks"), **price per pack**, **limit per viewer per stream** (0 = none), **message** (the template below) and **balance field** (which JSON key holds the number, default `balance`). Both URLs must pass `checkWebhookUrl` (public http(s) only). Buttons: **Check a balance** (asks Mix It Up for a viewer's balance, nothing else) and **Send a test message** (a `test` request that deducts nothing). A short **recent requests** log (last 20, `mixitup:log`: when, viewer, what, result) sits under the form for debugging.

**Message template.** Placeholders: `{username}`, `{amount}`, `{currency}`, `{cardName}`, `{variant}`, `{stars}`, `{packName}`, `{cardNumber}`, `{serial}`. Default: `{username} opened a pack and pulled {cardName} ({variant}, {stars} stars). {amount} {currency} spent.` Unknown placeholders are left out (`interpolate` from `lib/webhooks.ts`), the result is capped at 400 characters, and the form shows a live preview with sample values.

### 12.2 The paid pull flow (Done, #201)

1. `POST /api/webhooks/pull` (existing; secret and live gate unchanged). If Mix It Up is on: check the viewer's limit (12.3), then `POST balanceUrl` `{ action: 'balance', secret, username, currency }`. The reply must be 2xx JSON with a number at `balanceField`. Count what the viewer already has in flight (`mixitup:pending:<user>`) so ten fast requests cannot spend one balance ten times: the balance must cover `price x (pending + 1)`.
2. Not enough, over the limit, or no answer: nothing is queued; the webhook answers `{ ok: true, ignored: true, reason, message }` where `reason` is `insufficient_balance | limit_reached | mixitup_unavailable | bad_balance` and `message` is a sentence Mix It Up can post to chat.
3. Enough: reserve (`mixitup:pay:<eventId>` = viewer, price, stream key, 12 h TTL; pending and stream count go up) and queue the pull with `paid: true` and the event id as before. The overlay passes that id back as the ticket when it saves the pull.
4. `POST /api/collection` (pull with its ticket, see 13.1): adds the print, then `POST deductUrl` `{ action: 'deduct', secret, username, amount, currency, message, pullId }` and waits (5 s). Mix It Up's reply counts as applied when it is 2xx and has no `ok`, `success` or `applied` set to `false`.
5. Applied: carry on as today (activity, outgoing Card Pulled webhook). Not applied: **revoke**: the print is removed and retired in the copy ledger (the same change as the admin "remove this print", reason "payment failed"), the stream count goes back down, no pull is recorded, and the reply is `{ ok: true, revoked: true, owned }` so the overlay resyncs. The log records it, and the system Discord channel gets a notice (`notifySystem`, tone `warn`).
6. The reservation is single-use (`del` decides who owns it), so a repeated save cannot charge twice.

### 12.3 Limits per stream per viewer (Done, #201)

`limit` paid pulls per viewer per stream. "Per stream" = the current Twitch stream (`getLiveStatus().startedAt`, the same marker the recap uses). While offline or when Twitch is not configured, the window is the UTC day, so test pulls off-stream are still bounded. Counter `mixitup:cnt:<streamKey>:<user>` (3 day TTL), raised when a pull is reserved and lowered when it is revoked. A viewer at the limit gets `limit_reached` and the message "X has used all N pulls for this stream." The dashboard is not changed.

### 12.4 Pull limits stored with each viewer (Done)

The per-stream limit is now data on the viewer, so buff cards can raise it later. KV `user:<name>:pulllimit` = `{ limit: number | null, buffs: [{ id, amount, until, source, note? }] }` (`lib/pull-limit-core.ts` pure, `lib/pull-limit.ts` KV). The Mix It Up tab's number is only the **default**. A viewer's effective limit = their own `limit` (else the default) + every buff still running; a base of 0 means no limit and buffs cannot change that. `reservePaidPull` reads it per pull. A buff records its `source` (`admin` now, `card:<id>` for a future buff card) and an end time (null = until removed); a future card only has to call `addUserPullBuff(username, { amount, hours, source })`. Admin: user page → Admin tab → **Pull limit** (own limit, bonuses with hours and a note, used this stream); every change is in the user's audit trail. The key is deleted with the account (`account-deletion`). `scripts/check-pull-limit.mts`.

**Files:** `lib/mixitup-core.ts` (settings, cleaning, template, reply parsing, stream key, decisions; pure), `lib/mixitup.ts` (KV, calls, reserve / settle / revoke, log), `app/admin/settings/MixItUpConfig.tsx` + actions in `app/admin/settings/mixitup-actions.ts`, hooks in `app/api/webhooks/pull/route.ts`, `app/api/collection/route.ts`, `public/widget.js` (pass `payId`), `scripts/check-mixitup.mts` (fake Mix It Up, mock KV: price, limit, pending, revoke, double settle), `docs/admin.md` + `docs/overlay.md` notes, changelog: none (staff-only).

**Known limits:** `/api/collection` is open today (the overlay saves through it), so someone who finds the URL could already add prints; paid pulls do not make that worse but do not fix it. Closing it needs a signed save token from the queue (a separate item). A reply that is lost after Mix It Up applied the deduction would revoke a paid pull; the viewer can be refunded by hand from the log.

---

## Track 13: Lock down the collection API (added 2026-10-16, at the owner's request)

### 13.1 Server-rolled pulls with one-use tickets (Done)

Problem: `POST /api/collection` (and `DELETE`) had no auth because the overlay, a browser source with no login, saves through it, and the overlay chose the card itself. Anyone who found the URL could add any card for anyone, overwrite a collection or reset it.

Fix: **the server decides the pull, the overlay only plays it.** `lib/draw.ts`: when a pull is queued (the pull webhook, dashboard gifts) the server rolls pack, card and version with the same odds the overlay used (pack weight, card probability, the pack's version weights and switches), stores a one-use **ticket** `draw:<id>` (12 h; viewer, collection, card, version, names) and puts the roll on the queue event (`draw`). The overlay plays exactly that (the test panel's pinned-draw path) and saves with `ticket: <event id>`. `/api/collection`:
- a pull is saved only against an unspent ticket for the same viewer; the card, version, names and collection come **from the ticket**, never from the request (a forged or replayed save gets 401 and adds nothing);
- replacing a collection (`data`) and `DELETE` need a staff session (`isAuthenticated`); the overlay's test-panel Reset buttons therefore only work in a browser signed in to the admin;
- `GET` stays public (the same data is on the profile pages).
The Mix It Up reservation shares the ticket's id (12 h TTL, `releasePaidPull` returns it if a pull is never queued). `scripts/check-draw.mts` covers the odds, tickets and the route.

Pulls queued before this change have no ticket and are not saved when played.

### 13.2 The overlay key (Done)

`GET /api/webhooks/queue` (takes a queued pull), `POST /api/webhooks/notify` ("collection shown" activity and the outgoing webhook) and `POST /api/overlay/heartbeat` (the "overlay connected" status) were open to anyone. Now they need the **overlay key** (`lib/overlay-key.ts`, KV `overlay:key`, made on first use): the OBS address is `/overlay.html?key=<key>` (plus `&preset=...`, `&dev`), `widget.js` sends it as `x-overlay-key` on every request to the site, and the server accepts the right key, a staff session (the editor preview and test tabs need no key) or a sandbox (its own fake data). A refused overlay shows "Overlay key missing or changed" on screen.
- **Where it shows:** Settings → OBS Overlay (the browser-source address, with a **Make a new key** button that locks out the old address), the Overlay Editor's scene addresses, the sidebar's Copy URL button and the command palette's Copy overlay URL.
- **User step after deploy:** copy the new address from Settings → OBS Overlay into every OBS browser source (and each scene's address from the Overlay Editor) and refresh. Until then pulls will not play and the overlay says why.
- `scripts/check-overlay-key.mts` covers the three endpoints, a wrong key, and rotating the key.

---

---

## Track 14: Webhook grants count as pulls (added 2026-10-16, at the owner's request)

### 14.1 Mix It Up rewards look like pulls (Done, #205, #206)

A card from `POST /api/webhooks/grant-card` is recorded as `grant` with `source: 'webhook'` plus a pull's facts (name, stars, pack, new or not, copies, collected, edition). It then counts as a pull in: the Live Activity feed, filters, numbers and highlights; the dashboard's Recent activity; the Discord Pulls category (same embed as a pull plus a "Granted by webhook" line, with the star and new-only filters); the stream recap; and the stats counters behind the weekly digest and the dashboard charts (from the day it shipped; earlier grants are not back-filled). Admin grants are unchanged. See docs/admin.md, "Webhook grants look like pulls".

---

## Tracks 15 to 22: the third Discord list (2026-10-16)

17 requests from the Cheesygidds Discord (19:17 to 19:36). Checked against the code on `main` at #207:
- **Already done:** "live activity pulls should include grants from webhooks" is 14.1 (#205, #206). "Suggestions / problems / deletion request webhook to Discord" exists since 11.2 / 11.3 (#186, #193): Settings -> Webhooks -> Add channel -> preset **Feedback**. Nothing posts until a channel with that category is added (user step). 15.5 below adds a per-kind filter so each kind can go to its own channel.
- **Partly there:** the overlay already has a first-ever moment (edition #1: `reveal.firstEver*`, 3 settings) and show-off has 3 settings (`show.style` / `hold` / `text`) under Pack opening. 18.1 and 18.2 give both a real section in the Overlay Editor.
- **A regression found while checking:** there is no favicon. `app/icon.png` exists, but since #171 the root layout sets `metadata.icons` (for the plain apple-touch link), and an explicit `icons` replaces Next's file-based icon. Production serves no `<link rel="icon">`, and `/favicon.ico` is a 404 (checked 2026-10-16). See 15.1.

| # | Item | Status | Size |
|---|------|--------|------|
| 15.1 | Favicon is back | Ready | S |
| 15.2 | Install icon in the nav on phones and tablets only | Ready | S |
| 15.3 | Home: the live banner spans the full width | Ready | S |
| 15.4 | Most valuable prints open the print (or the card) | Ready | S |
| 15.5 | Feedback channel filter per kind (ideas, problems, deletions, reports) | Ready | S |
| 16.1 | Closed alpha / beta: only listed Twitch users get in | Ready (defaults confirmed 2026-10-16) | L |
| 16.2 | Testers list and the tester achievement | Ready (with 16.1) | M |
| 16.3 | Alpha / beta banner and badge | Ready (after 16.1) | S |
| 17.1 | Staff badges on profiles | Ready | S |
| 17.2 | Report a user from their profile | Ready (after 15.5) | M |
| 18.1 | Overlay Editor: special moments (first-ever print, a viewer's first pull, a new card for them) | Ready | M |
| 18.2 | Overlay Editor: a Show off section | Ready | M |
| 19.1 | Mix It Up moves to its own admin page | Ready | S |
| 19.2 | Chat commands: one webhook, a command builder, `!showoff` and `!stats` | Ready (after 19.1) | L |
| 20.1 | Card back designed per pack | Ready | M |
| 20.2a | Pack workspace: shell, card and pack panels, saving | Ready (planned 2026-10-16) | L |
| 20.2b | Pack workspace: live preview (front, back, on stream, sizes) | Ready (after 20.2a) | M |
| 20.2c | Pack workspace: grid view and bulk edits | Ready (after 20.2a) | M |
| 20.2d | Pack workspace: odds view | Ready (after 20.2a) | S |
| 20.2e | Pack workspace: import a folder of art | Ready (after 20.2c) | M |
| 20.2f | One flow for new packs; the wizard goes | Ready (last) | M |
| 20.3a | Card back v2: model, layout engine, fonts, DOM renderer | Ready (after 20.2d) | M |
| 20.3b | Card back v2: the visual editor (drag, fonts, sizes, colours, effects) | Ready (after 20.3a) | L |
| 20.3c | Card back v2: used everywhere (share images, admin, trades, overlay option) | Ready (after 20.3a) | M |
| 21.1 | Changelog built from PRs on every build | Ready (decided 2026-10-16) | M |
| 22.1 | Email notifications (Resend) | Ready (decided 2026-10-16) | L |

### Tracks 15 to 22: order

Parallel streams, chosen so no two running PRs edit the same files:
- **Stream L (quick fixes):** 15.1, 15.2, 15.3, 15.4, 15.5, one PR each, any order (15.2 and 16.3 both edit `SiteNav.tsx`: 15.2 first).
- **Stream M (access):** 16.1 + 16.2 (one PR: the gate is useless without the list), then 16.3.
- **Stream N (profiles):** 17.1, then 17.2 (both edit `ProfileHeader.tsx`; 17.2 also waits for 15.5, which changes the feedback category).
- **Stream O (overlay):** 18.1, then 18.2 (both edit `lib/overlay-props.ts`, `widget.js` and the editor).
- **Stream P (Mix It Up):** 19.1, then 19.2. 19.2 also touches the show-off code: start it after 18.2 merges, or agree that 19.2 only calls `prepareShowOff` and never edits `widget.js`.
- **Stream Q (cards):** 20.1, then 20.2a, then 20.2b / 20.2c / 20.2d, then 20.2e, then 20.2f (order set out in 20.2). 20.3a after 20.2d, then 20.3b and 20.3c (order set out in 20.3).
- **Stream R (changelog):** 21.1.
- **Stream S (email):** 22.1. It edits `notify()` and Settings -> Notifications, like 17.2's feedback notice: start it after 17.2 merges, or keep 17.2 to the existing `feedback` notice kind.

**Twitch panel freeze:** nothing here edits `public/twitch-panel/*`, `/api/twitch/*` or the CORS rules. 16.1 is the edge case: it widens the middleware matcher, so it must leave `/api/twitch/*` (and the extension's CORS answers) exactly as they are, and keep `/privacy` and `/terms` reachable for the Twitch reviewers. Staff badges, tester badges and the card back in the panel wait for the next extension version.

---

## Track 15: Quick fixes

### 15.1 Favicon is back (Ready)

`app/layout.tsx` sets `icons: { apple: [...] }` (7.1, #171), which switches off the file-based `app/icon.png`. Fix:
- In the same `icons` object add `icon: [{ url: '/icon.png', type: 'image/png', sizes: '...' }]` pointing at a real public file, or move the icon to `public/favicon.png` and link it. Also add `public/favicon.ico` (16 / 32 / 48 px, made from the brand icon) because browsers, Discord and RSS readers still request `/favicon.ico` directly.
- Keep the apple-touch link exactly as it is (7.1).
- Extend `scripts/check-public-meta.mts`: the rendered root HTML (or the metadata object) has a `rel="icon"` link, and `public/favicon.ico` exists and starts with the ICO header bytes `00 00 01 00`.
- Check after deploy: `curl -I https://cheesytcg.app/favicon.ico` is 200 and the tab shows the cheese.

### 15.2 Install icon in the nav on phones and tablets only (Ready)

`InstallButton` (in `SiteNav.tsx`) shows on desktop too. Render nothing when `detectInstallEnv(navigator.userAgent, navigator.maxTouchPoints).platform === 'desktop'` (`lib/install-detect.ts`, already used by the install guide). Decide on the client after mount, as the button already does for "installed", so the server HTML never flashes it on desktop. Desktop users still reach `/install` from the footer and the site menu. Keep the mobile menu's install entry as it is.

### 15.3 Home: the live banner spans the full width (Ready)

`<LiveBanner />` sits inside the hero's left column (`app/(site)/page.tsx`, the `md:grid-cols-[1.6fr_1fr]` grid), so it is half width. Move it above that grid, inside the same `max-w-6xl` container, full width. It still renders nothing when the channel is offline, so the hero is unchanged then. At full width the banner can carry the stream title and viewer count on one line, with the **Watch on Twitch** button at the right (stacked on phones). Run `scripts/sweep-public.mjs` with the fake Twitch live (`/__live?on=1`).

### 15.4 Most valuable prints open the print (or the card) (Ready)

The **Most valuable prints** list on My Stats (`app/(site)/account/page.tsx`) and the profile Score tab (`app/u/[username]/ProfileTabs.tsx`, `s.topCopies`) are plain rows. Make each row one link:
- a row that is one print (it has a serial): the print page (`/c/<uid>`, or the derived `/copy/...` link when there is no uid; the helpers from 2.1 / 8.2 already do this);
- a row that groups several prints of a card and version (`count > 1`, no serial): the card dex dialog `/cards?card=<n>`.
Add `uid` to the `topCopies` rows if it is not there yet (from the same ledger read). Hover / focus style like the other list links, and the whole row is the hit area.

### 15.5 Feedback channel filter per kind (Ready)

The Discord `feedback` category posts ideas, problem reports and deletion requests together. Give the category a per-channel kind filter, the same way `minStars` / `newOnly` work for pulls: `DiscordChannel.feedbackKinds?: FeedbackKind[]` (absent = all, so existing channels are unchanged). The channel card shows four ticks under the Feedback box: Suggestions, Problems, Deletion requests, Reports (the last one is used by 17.2; hide it until 17.2 ships, or ship it unticked-safe). Presets: "Feedback" (ideas + problems) and a new "Requests and reports" (deletions + reports, meant for a private channel). Extend the Discord check for the filter and the normaliser.

---

## Track 16: Closed alpha / beta

Asked: lock the website to permitted Twitch users while in alpha / beta, a way to add alpha and beta users (with an achievement for being a tester), and a banner that says the site is in alpha / beta.

**Decided 2026-10-16 (the owner confirmed these defaults):**
- Three modes, set by an admin: **Open** (today), **Beta** (alpha and beta testers plus staff get in), **Alpha** (alpha testers plus staff only). Default after deploy: **Open**, so nothing locks until the owner switches it.
- What stays reachable for everyone in every mode: the Twitch panel and its API, the OBS overlay and every webhook / cron / overlay / collection API, `/login` and `/auth/*`, `/admin` and `/mod` (they have their own staff gate), `/privacy` and `/terms` (the Twitch extension listing links them; shown without the site nav to anyone who can't enter), the closed-site page itself, and static files (icons, manifest, service worker, `/assets`, `/brand`, `/_next`, `robots.txt`).
- Everything else on the public site (pages and the public site's own APIs) needs a tester or staff sign-in.

### 16.1 The gate (Ready, with 16.2; defaults confirmed)

**Settings:** KV `access:settings` `{ mode: 'open' | 'beta' | 'alpha'; label: 'none' | 'alpha' | 'beta'; message?: string; v: number }` (`lib/access-core.ts` pure: types, cleaning, `canEnter(mode, tier, isStaff)`; `lib/access.ts` KV). `label` is separate from `mode` so a public beta can show the banner without locking anything. `v` goes up on every change. A new Settings tab **Access** (icon `lock`, admins only): mode, label, the message shown on the closed page, and the testers list (16.2). Every change is audited and posted to the Discord admin category.

**Enforcement, in two layers like the staff gate:**
- **Middleware (coarse, no database):** widen `config.matcher` to the public site with the exemptions above (a negative-lookahead matcher plus an explicit allow list in code; `/api/twitch/*` keeps going through `extensionCors` first, unchanged). The middleware needs to know the mode without KV on every request, so it reads a signed **access cookie** `tcg_access` = `{ login, tier: 'alpha' | 'beta' | 'staff', v, exp }` (HMAC with `SESSION_SECRET` through Web Crypto, verified like `lib/staff-token.ts`; lasts 1 hour) and a short in-memory copy of the mode (`GET` of `access:settings` through the Upstash REST client, cached 30 s per instance; on a KV error, fail **open** for pages and log, so a KV blip never locks the owner out of the site while live). Mode `open`: pass everything. Otherwise: a valid access cookie whose tier the mode allows passes; a viewer session with no or an old access cookie goes to `/auth/access?returnTo=...`; nobody signed in goes to `/closed` (pages) or gets `403 { ok: false, error: 'closed' }` (APIs).
- **`/auth/access`** (Node route): reads the viewer session, checks the testers list and the staff list in KV, issues `tcg_access` and redirects back; not allowed -> `/closed?why=not-listed`. This is also how a removed tester loses access (within the hour) and how a mode change reaches everyone (`v` in the cookie no longer matches: re-check).
- **Server re-check (authoritative):** `requireSiteAccess()` in `lib/access.ts`, called from the `(site)`, `(entity)` and `u` layouts and from the signed-in public APIs (trades, account, notifications, feedback), reads the live list, so a forged or stale cookie still gets nothing.
- **`/closed`** page (noindex): the site name, "The Cheesy TCG is in closed alpha / beta", the admin's message, **Log in with Twitch** (signed out) or "You're signed in as @x but not on the tester list. Ask in the Cheesygidds Discord" (signed in, not listed) with **Log out**. Links to Privacy and Terms (not the FAQ, which is closed too). Says the game runs only on the Cheesygidds channel (`CHANNEL_NAME` / `CHANNEL_URL`).
- While the mode is not `open`: `robots.ts` disallows everything except `/privacy` and `/terms`, and the sitemap lists only those.

**Checks:** `scripts/check-access.mts`: `canEnter` table, cookie sign / verify / expiry / old `v`, the matcher's allow list (every exempt path passes, every gated path is caught, `/api/twitch/*` untouched), `/auth/access` for tester / staff / stranger against the mock KV and the fake Twitch. Run the public sweep in each mode as `tester` listed and not listed.
**Words:** FAQ "Why can't I get in?" (a short answer, always present); Privacy Policy: the tester list stores the login, tier, who added them and when. Bump `LEGAL_UPDATED`. Docs: a section in `docs/public-site.md` and the matcher note in `docs/staff.md`.

### 16.2 Testers list and the tester achievement (Ready, with 16.1)

- KV hash `access:testers`: login -> `{ tier: 'alpha' | 'beta', addedBy, addedAt, note? }`. Max 500. Managed in Settings -> Access (add by Twitch login, choose the tier, note, remove behind `ArmedButton`, filter, count per tier) and from the user admin page (Admin tab: **Tester: none / beta / alpha**). Mods can see the list; admins change it. Audited.
- **Achievement:** adding someone awards a permanent achievement **Alpha tester** or **Beta tester** (icon `flask` or `bug`; add to `ICONS` if missing). Achievements are per season today (`<seasonId>:<kind>`); these use a fixed pseudo-season id `special` with `seasonName: 'Special'`, written straight into `user:<u>:ach` by `addTester` (never taken back, even when the person is removed later, and an alpha tester who later becomes beta keeps both). `syncAchievements` keeps stored `special:*` entries as they are. The profile achievements widget and My Stats show them first, with a distinct gold-purple style.
- Export and account deletion include the tester record.

### 16.3 Alpha / beta banner and badge (Ready, after 16.1)

When `label` is `alpha` or `beta`:
- a thin strip at the very top of every public page (above `SiteNav`): "Beta: things may change, and progress may be reset before launch." plus a **Report a problem** link (`/feedback?kind=bug&from=<path>`). The text is the default; the admin message from 16.1 replaces it when set. Dismissible for the session (sessionStorage, try/catch); it comes back on the next visit;
- an **ALPHA** / **BETA** pill next to the logo in `SiteNav` (always shown, not dismissible);
- the share images' footer and the OG image get a small "beta" tag (optional, only if it fits without changing the layouts);
- the admin header shows the current mode ("Site: closed beta") so staff can tell at a glance.
Run the public sweep at 390px with the strip on (no overflow, the pill doesn't push the nav).

---

## Track 17: Profiles and community

### 17.1 Staff badges on profiles (Ready)

- Profile header (`ProfileHeader.tsx`): a badge after the name for staff: **Streamer** (the channel account, `CHANNEL_LOGIN` = cheesygidds, staff or not), **Admin** (staff admins and the super admin), **Mod**, with the `shield` icon and the purple staff colour. Also a small shield on the leaderboard row and the leaderboard detail, and on `/trade/<id>` next to a staff lister (so traders know who they deal with).
- Read from the live staff list (`listStaff()`, cached per request); a removed staff member loses the badge at once.
- A staff member can hide their own badge (Settings -> Profile, "Show my staff badge", default on), for a personal account used as a normal player. `UserSettings.hideStaffBadge`, sanitizer, export.
- Not in the Twitch panel (freeze). Pure helper `staffBadgeFor(login, staff, settings)` with cases in the staff check.

### 17.2 Report a user from their profile (Ready, after 15.5)

- **Button:** a **Report** item in the profile's share / more menu (signed in, not on your own profile, not for staff viewing it; staff get their admin links instead).
- **Form (dialog):** reason (Offensive name, bio or picture / Cheating or abuse / Scam or unfair trade / Something else), details (required for "Something else", 10 to 1000 characters), optional link to a trade (`/trade/<id>`) or print. Turnstile, 5 reports per reporter per day, 1 open report per reporter per target.
- **Store:** the 11.2 inbox gets a new kind `report` with `target` (login) and `reason` (`lib/feedback-core.ts`). The reporter sees "Thanks, staff will look at it" and gets a notice when staff close it (outcome only, never what was done to the other person).
- **Staff:** `/admin/feedback` filter **Reports**, its own count in the nav and in Needs attention; each report shows links to the target's profile, admin user page and the trade. Actions are the existing ones (hide the user, edit / clear their bio, reverse a trade), not new ones.
- **Discord:** `report` posts go only to channels whose `feedbackKinds` include `report` (15.5) and never to the public digest. The embed names the target and the reason, not the details text.
- The reported person is not told who reported them, and reports are not shown publicly.
- **Words:** FAQ "How do I report someone?"; Privacy Policy (reports are kept like other feedback: until resolved plus 90 days). Bump `LEGAL_UPDATED`. Export: a viewer's own sent reports (not reports about them).
- Check: extend `scripts/check-feedback.mts` (validation, limits, one open report per target, self-report refused, Discord kind gating).

---

## Track 18: Overlay Editor

Background: `docs/overlay.md` ("Overlay properties", "Show off a card"). Everything is a property in `lib/overlay-props.ts`; group membership is metadata only, so moving a key to a new group needs no migration. Defaults must reproduce today's look exactly.

### 18.1 Special moments (Ready)

"Overlay editor also allows modification for first card pulls." The owner confirmed (2026-10-16) it means both a first-ever print and a viewer's first pull, so: the moments that happen when a pull is a "first" get a section of their own with real controls. New group **Special moments** in `PROP_GROUPS` (icon `sparkles`), three sections, in priority order (only one moment plays per pull; the highest wins):
1. **First-ever print** (edition #1 of that card and version): move `reveal.firstEver`, `reveal.firstEverText`, `reveal.firstEverHold` here, and add banner colour / text colour / text size / position (top, middle, bottom of the card), sparkle count, an optional sound (an asset URL, played over the card sound), and a reveal style override (`inherit` default).
2. **A viewer's first pull** (their very first card in this season), new keys `moment.firstPull.*`: on/off (**default off**), banner text with placeholders (`{username}`, default "Welcome, {username}!"), the same look controls, extra hold, sound, style override.
3. **A new card for them** (first time they get this card; today `isNew` already drives the "NEW" label), `moment.newCard.*`: the existing new-card label look moves here if it has settings, plus on/off for an extra effect (default off).
- **Data:** `POST /api/collection` already returns `isNew`; add `firstForViewer` (they owned nothing in this collection before this pull) to the same response (additive). The widget picks the moment and calls one shared `momentBanner(theater, P, spec)` (refactor of `firstEverMoment`).
- **Preview:** the editor canvas gets **Moment: none / first-ever / first pull / new card** next to "Show as", and the preview plays it (postMessage `moment`). The `?dev` test panel gets the same picker, so it can be seen without a real edition #1.
- Per-pack overrides and scenes apply as for every other property.
- `node --check public/widget.js`, the overlay check gains the new keys' defaults and the priority rule (pure helper in `lib/overlay-moments.ts`, mirrored in the widget). Not checkable locally: real OBS.

### 18.2 A Show off section (Ready)

"Overlay editor also allows modifications for show off card." New group **Show off** (icon `star`): move `show.style`, `show.hold`, `show.text` here, and add:
- a label line (on/off, template with `{username}`, `{cardName}`, `{variant}`, default "{username} shows off"), its colours, size and position;
- the print pill (on/off, format `edition` / `uid` / `both` like `reveal.serialFormat`);
- card size (a scale relative to the pack reveal), glow and sparkles (`inherit` from the variant, or off), the card's sound (on / off / custom asset URL) and volume;
- an entrance style list limited to the pack-less styles (as today).
- **Preview:** the canvas View menu gains **Show off** (plays a show-off with a sample viewer and print). The test panel's **Show off card [W]** uses the same settings.
- Placement stays the pack area (the Layout panel is unchanged). A separate show-off placement is possible later if asked.
- Same checks as 18.1. Docs: rewrite the show-off part of `docs/overlay.md`.

---

## Track 19: Mix It Up commands

### 19.1 Mix It Up gets its own admin page (Ready)

Move the Settings tab **Mix It Up** (12.1) to `/admin/mixitup` with a sidebar entry under the streaming group (icon `coins`, admins only; mods see it read-only if they can see Settings today). Tabs: **Paid pulls** (today's form and buttons, unchanged), **Commands** (19.2), **Log** (the recent requests list, moved out from under the form). `/admin/settings?tab=mixitup` redirects there. Same KV keys and actions (`mixitup-actions.ts` moves with it). Update the command palette and `docs/admin.md`.

### 19.2 Chat commands: one webhook and a command builder (Ready, after 19.1)

Asked: a Mix It Up webhook for `!showoff` and a `!stats` command that returns a card's stats; better, a command builder, so when the webhook receives a command, the secret and other data, it returns a reply built from variables.

**Endpoint:** `POST /api/webhooks/command`, body `{ secret, command, username, args?, ...extra }` (Mix It Up sends `$username` and `$allargs`), checked by `parseIncomingWebhook` (the existing incoming secret). Answers 200 with `{ ok, message, vars }` plus each variable flattened at the top level (so Mix It Up's "JSON to special identifiers" can read them); refusals are `{ ok: false, message }` with the command's own error text, like `show-card`. Unknown command: `{ ok: false, message: '' }` (silent). The old `/api/webhooks/show-card` keeps working unchanged.

**Commands** (KV `mixitup:commands`, `lib/commands-core.ts` pure, `lib/commands.ts` KV), each `{ id, name, aliases[], enabled, action, reply, errors: { notFound?, notOwned?, cooldown?, offline? }, cooldownS, userCooldownS, liveOnly }`. Max 30. Name and aliases are matched without the `!`, case-insensitive.

**Actions** (a fixed registry `COMMAND_ACTIONS`, each with its variables, a description and sample values for the preview):
- `showoff`: today's show-off (`prepareShowOff`, queues the overlay event, its cooldown). Vars: `{username} {cardName} {variant} {edition} {printNumber} {points} {stars}`.
- `card-stats`: `args` is a card name or number (`resolveCard` from `lib/showoff.ts`), for the active season. Vars: `{cardName} {number} {stars} {rarity} {pullChance}` ("1 in 40") `{printsMade} {collectors} {topHolder} {firstPulledBy} {points} {yourPrints} {url}` (the dex link). Hidden and private collectors are left out of `topHolder` / `firstPulledBy` (shown as "a private collector").
- `my-stats`: the caller, or `@someone` in `args`. Vars: `{rank} {score} {cards} {totalCards} {prints} {progressBonus} {bestEdition} {rarestPrint} {profileUrl}`. A private collector's stats answer "This collector keeps their stats private" unless it is them asking.
- `collection`: shows their collection on the overlay (the existing collection webhook path). Vars: `{cards} {prints}`.
- `leaderboard`: top 3. Vars: `{first} {second} {third}` (name and points each).
- `pulls-left`: with paid pulls on, what is left this stream and the price. Vars: `{left} {limit} {price} {currency}`.
- `text`: a fixed reply. Vars: `{username} {args}`.
Unknown placeholders are dropped (`interpolate`), replies capped at 400 characters, no Markdown.

**Seeded defaults** (created on first open of the Commands tab, editable): `!showoff` (action `showoff`, today's reply text) and `!stats` (action `card-stats`, "{cardName}: {stars} stars, {pullChance}, {printsMade} prints made, {collectors} collectors. {url}").

**Builder UI** (Commands tab): the list (name, action, enabled, last used); editing one shows name and aliases, the action picker, the reply textarea with clickable variable chips for that action, a live preview with the sample values, the error texts, cooldowns and "only while live". A **Try it** box runs the command for a typed username and args as a **dry run** (no overlay event, no cooldown spent) and shows the exact JSON reply. A **Set up in Mix It Up** panel shows the URL, the JSON body to paste into Mix It Up's Web Request action (with `$username`, `$allargs`), and which field to post to chat (`message`).

**Safety:** per-command and per-viewer cooldowns in KV with TTL; nothing from sandboxes reaches the real overlay queue; every command run is logged in the 19.1 Log (when, viewer, command, ok / error) and counted, not posted to Discord.
**Checks:** `scripts/check-commands.mts`: matching and aliases, each action's variables against the seeded data, private collectors masked, cooldowns, dry runs touch nothing, the show-off action still queues one event. **Words:** FAQ "Chat commands" section lists the commands (generated from the enabled ones, so it can't drift), using the channel name from `lib/site.ts`. Changelog entry.

---

## Track 20: Cards and packs

### 20.1 Card back designed per pack (Ready)

The back of a print (`FlipCard`, `lib/flip-back.ts`: print number, edition line, name, date, origin / holder, history, QR) looks the same in every pack. Make it a per-pack design:
- **Data:** `CardBackStyle` in `lib/card-back.ts` (pure, with `sanitizeCardBack` and `DEFAULT_CARD_BACK` = today's look exactly): background (one colour or a two-colour gradient and its angle), pattern (none / cheese holes / lines / the pack cover faded), edge colour (`rarity` = today, or a fixed colour), text colour, accent colour, font (display / body / mono), alignment (top / middle / bottom), a logo (none / the pack cover / an uploaded image, with size), a custom line (template with `{pack}` and `{season}`, max 60 characters), and per element (print number, edition line, name line, date, origin / holder, history, QR) on/off and size (S / M / L). Stored in its own KV key `pack:<id>:cardback`, **not** on the Pack object, because pack forms rewrite the whole pack (the same reason overlay pack overrides live apart). No key = the default.
- **Rendering:** `FlipBack` gains `style?: CardBackStyle`; the code that builds flip backs (print page, card dialog, binder, print of the week, share images that draw the back) looks up the card's pack and passes it. `FlipCard` turns the style into CSS variables and classes, so the markup stays one component.
- **Editor:** on the pack page, a **Card back** section: the controls on the left, a live `FlipCard` (shown flipped) with a sample print of that pack on the right, presets (Classic, Clean, Gold foil, Pack art), **Copy from another pack**, **Reset to default**. Server action with `requireAdmin`, audited, `revalidatePath` for the pack page and the public card pages. The pack wizard (`PackFlow`) gets the same section as an optional step.
- **Not changed:** the overlay's flip reveal (its back is the pack cover; a later option could use this design). The Twitch panel (freeze).
- Checks: `sanitizeCardBack` (unknown keys dropped, colours validated, template cap) and "no key = today's look" in a new `scripts/check-card-back.mts`; the public sweep with one pack styled.

### 20.2 The pack workspace: one editor for packs and cards (Ready, planned with the owner 2026-10-16; six PRs, 20.2a to 20.2f)

"There should also be a more comprehensive and user-friendly card and pack editor in place."

**Today** a pack is edited in five places: the wizard (`PackFlow`, drafts only), the pack page tabs (Cards table, Odds & simulator, Overview, Settings), the bulk card page (`/cards`, `BulkCards`), the single card page (`/cards/[cardId]`, `CardEditor` with `FramePicker`) and the Add card dialog. The overlay look per pack lives in the Overlay Editor and art files in Assets.

**Owner's answers (2026-10-16):**
- **One workspace.** Creating a pack opens the same editor as editing one; the wizard goes. A draft shows a short publish checklist instead of wizard steps.
- **Every pain point counts:** editing many cards, art and sounds per card, not seeing the result while editing, and balancing odds.
- **Bulk import by dropping a folder of art** (one card per image, named from the file name; stars and odds filled in afterwards in the grid).

#### The layout

`/admin/packs/[packId]` becomes the workspace (full width, like the Overlay Editor: it auto-collapses the sidebar and fits the viewport at `xl`, stacks below it).
- **Top bar:** pack name, status chip (Draft / Live / Inactive / Archived), the seasons it is in, the save state, **Undo / Redo**, **Review changes**, **Save** (or **Publish** for a draft), and a menu with Duplicate / Archive / Move to drafts / Delete (today's actions, same guards).
- **Left: the card list.** Thumb, number, name, stars, chance ("1 in 40"), small marks for missing art, no full art, no sound, 0 odds, versions switched off; search (`/`), rarity filter, sort (number, name, stars, chance, problems first). Multi-select with checkboxes, Shift-click ranges and Ctrl/Cmd-A. A **Pack** row pinned at the top selects the pack itself. **Add card** and **Import art** (20.2e) at the bottom. `j` / `k` (or arrows) move through cards.
- **Centre: the preview** (20.2b). What is selected, as players and the stream see it.
- **Right: the properties panel.** One card selected: its fields. Several selected: the bulk fields (20.2c). The Pack row: the pack's settings. Sections collapse; each shows a dot when it has unsaved changes or a problem.
- **View switch** above the centre: **Edit** (list + preview + panel, the default), **Grid** (20.2c), **Odds** (20.2d), **Overview** (today's Overview tab: usage, health, who holds what).
- URL state: `?card=<id>`, `?view=edit|grid|odds|overview`, `?sel=<ids>` is not kept (selection is local). Old URLs redirect: `/admin/packs/[id]/cards` -> `?view=grid`, `/admin/packs/[id]/cards/[cardId]` -> `?card=<cardId>`, `?tab=odds` -> `?view=odds`, `?tab=overview#health` -> `?view=overview#health`, `/admin/packs/new?draft=<id>` -> `/admin/packs/<id>`.
- **Phones:** the list is the page; tapping a card opens a full-screen sheet with the preview on top and the fields under it; the pack settings are a sheet too. Grid and Odds views scroll sideways inside their own box.

#### Card fields (right panel)

- **Basics:** number (locked once anyone holds the card, as today, with the same reason shown), name, stars (five clickable stars, not a number box), chance (weight plus live "1 in N" and its share of the pack, recomputed as you type).
- **Art:** the image drop zone (drop, paste from the clipboard, or pick; uploads through the existing `uploadImageFile` -> Blob -> `storeOptimizedCard` path), the full art drop zone, and each one's still frame (`FramePicker`, 10.4) inline under it. **Replace** keeps the old file for the Assets page's Unused list, as today.
- **Sound:** drop / pick an audio file (the existing `uploadAudioFile` path and the in-browser optimiser from the Assets page, offered as "Make it smaller" when the file is over 300 KB), a **Play** button, and "Use the default sound" (`/assets/sounds/<n>.mp3`) when there is one.
- **Versions:** the four version switches (pack switches shown as locked-off), the per-card upgrades opt-out.
- **Problems:** the card's `pack-health` / `cardProblems` issues, each with a "Fix" jump to the field.

#### Pack fields (the Pack row)

Details (name, cover with drop zone and the cover optimiser, accent and tear colours, draw weight with its share of draws in each season), Versions and odds of each version, upgrade costs, Timing and sound (card time, cooldown, volume), **Card back** (20.1's section, moved here unchanged), **Overlay look** (a link to the Overlay Editor in this pack's scope, plus a count of its overrides), Seasons (the "Used in" list with links), Danger zone. All of today's pack form fields, cleaned by `cleanPackInput` as now.

#### Saving

- **Published packs: explicit Save**, because a change goes live on stream at once. Edits build a local **change set** (cards added / changed / removed, pack fields changed). **Review changes** lists it as "old -> new" per field (like the Overlay Editor's Review), and Save sends it in one server action `savePackChanges(packId, rev, changes)`. The navigation guard warns about unsaved changes.
- **Drafts: autosave** (`useAutosave`, ~0.9 s, as the wizard does today), because nothing is live.
- **Undo / Redo** (Ctrl+Z / Ctrl+Shift+Z): snapshots of the change set, 60 deep, slider bursts coalesced (the Overlay Editor's approach). Undo covers unsaved edits only; file uploads are not deleted by undo (the old file stays referenced until Save).
- **Two staff editing one pack:** the pack gets a revision counter `pack:<id>:rev`, raised by every write to the pack or its cards (all existing writers too: `saveCards`, `updatePack`, odds saves, still frames). `savePackChanges` refuses with "Someone else saved this pack since you opened it" when `rev` doesn't match, and the workspace offers **Load their version** (your unsaved change set is kept and re-applied where it doesn't clash; clashing fields are listed).
- **Server rules don't change:** `cardProblems` / `cleanPackInput` on every card and the pack, numbers kept for existing cards and new numbers assigned by the server (returned to the client, as `saveCards` does), deleting a card that viewers hold needs the existing stronger confirmation, `requireAdmin`, audit entries per change, `revalidatePath` for the pack, the public dex and card pages.
- **Pure core:** `lib/pack-editor-core.ts` (client-safe): `applyChanges(pack, cards, changes)`, `diffChanges` for Review, `bulkApply(cards, ids, op)`, `parseArtFileName` (20.2e), `problemsFor(card, pack)`. The server runs the same `applyChanges` so the preview and the saved result can't differ.

#### 20.2a Workspace shell, card and pack panels (M to L)

The layout, list, Edit view with the right panel (card fields and pack fields), explicit save with Review, autosave for drafts, undo / redo, the `rev` check, the redirects for the single card page and the Settings tab. The centre shows a simple static preview (art, name, stars) until 20.2b. Removes `CardEditor`'s page and the Settings tab; the Cards table and Add card dialog are replaced by the list. Check: `scripts/check-pack-editor.mts` (mock KV): change sets applied the same on both sides, numbers kept, `rev` conflict, a held card's number can't change, audit entries.

#### 20.2b Live preview (M)

The centre canvas, with tabs:
- **Card:** the front exactly as the site draws it (`CardTile` with the holo for the chosen version; a version switcher Regular / RH / FA / SH; animated art plays, with a still / animated toggle that shows the chosen still frame), plus the rarity border and glow.
- **Back:** the `FlipCard` back from 20.1 with a sample print of this card.
- **On stream:** the overlay in preview mode (`/overlay.html?preview`, as the Overlay Editor embeds it) with this pack and card pinned through `postMessage` (`packId`, `cardNumber`, `variant`, the unsaved card fields so a new name or star count shows before saving), and a **Play** button for the reveal with sound.
- **Sizes:** the same card as a dex tile, a binder slot and a profile showcase tile, side by side, to catch art that crops badly.
- Several cards selected: a contact sheet of their fronts.
The preview reads the unsaved state, never only what is saved.

#### 20.2c Grid view and bulk edits (M)

- **Grid:** a spreadsheet-style table of every card: number, thumb, name, stars, weight, chance, versions (four small toggles), sound (play / missing), full art (yes / missing), problems. Click a cell to edit; Enter / Tab move like a spreadsheet; **Fill down** for the selected cells; paste a column of values from a spreadsheet into the selected cells (names, stars or weights, one per line). Edits go into the same change set as the Edit view.
- **Bulk panel** (several cards selected in either view): set stars, set weight, multiply weights (e.g. x0.5), switch a version on / off, use the default sound / clear sound, upgrades opt-out on / off, delete (only cards nobody holds; held ones are listed and skipped).
- Replaces `/admin/packs/[id]/cards` (`BulkCards`), which then redirects.

#### 20.2d Odds view (S)

Moves today's `OddsPanel` (weights table, Normalize to 100, Balance by rarity, share-by-rarity chart, draw simulator) into the workspace as the Odds view, reading and writing the same change set (so a balance done here shows in the list and is saved with everything else). The Edit view's chance field shows the live share and "1 in N" from the same maths (`lib/card-maths.ts`). The simulator runs on the unsaved weights.

#### 20.2e Import a folder of art (M)

- **Import art** button, or drop files / a folder anywhere on the list. Up to 100 images and their sounds per drop.
- **Names from file names** (`parseArtFileName`, pure, with cases): `012 Gouda Goat.webp`, `12-gouda-goat.gif` and `gouda_goat.png` all become "Gouda Goat"; a leading number becomes the card number when it is free in the pack (else the next free one); a `-fa` / `_fullart` / ` full art` suffix makes it the **full art** of the card with the same base name; an audio file (`.mp3`, `.wav`, `.ogg`) with the same base name becomes that card's sound.
- **A review table before anything is created:** each row shows the image, the parsed number and name (editable), what it matched (new card, full art for card X, sound for card X), and problems (a duplicate name, a number already used, a file too big). Untick rows to skip them. **Import** then uploads one file at a time with a progress bar (the existing upload and optimise path; GIFs become animated WebP), creates the cards in the change set with stars 1 and weight 1 (marked "set stars and odds" in the list), and switches to the Grid view filtered to the new cards so stars and odds can be filled in at once.
- A failed upload leaves that row in the table to retry; nothing half-made is saved (the change set only gets cards whose art uploaded).

#### 20.2f One flow for new packs; the wizard goes (M)

- **New pack** (the library's button and the command palette) asks only for a name, creates the draft (`createDraftPack`) and opens the workspace on it.
- A draft shows a **Publish checklist** in the top bar (replacing the wizard's Review step, from `validatePack` and `packHealth`): has a name and cover, at least one card, every card has art, a name and odds above 0, stars set on imported cards, Full Art cards have full art where the versions need it, in at least one season (or "publish without a season" with the warning). **Publish** stays disabled until the blocking items pass; warnings can be accepted.
- `PackFlow` and the wizard routes are removed; `/admin/packs/new?draft=<id>` redirects to the workspace. The season wizard (`SeasonFlow`) is unchanged.
- Update `docs/admin.md` ("Drafts & wizards", the pack routes, admin UX conventions: the pack workspace is the second full-width workspace after the Overlay Editor) and `CLAUDE.md`'s "Wizards, not modals" convention (packs now use the workspace; seasons keep the wizard).

**Order:** 20.1 first (its Card back section is built as a standalone component so 20.2a moves it unchanged). Then **20.2a**. Then 20.2b, 20.2c and 20.2d, one at a time or in parallel if each keeps to its own view component and touches the shell only to register itself. Then 20.2e (it lands in the grid from 20.2c). **20.2f last** (the wizard goes only once the workspace can do everything it did).
**Not changed:** card and pack data shapes (apart from `pack:<id>:rev`), KV keys, the public site, the overlay, the Twitch panel (freeze). **Checks for every part:** `npm run verify`, the new check script grown per PR, and a hand pass against the mock KV at 1280px and 390px (an admin sweep run as in 7.7). Not checkable locally: Blob uploads (the mock has none; say so in each PR and test uploads on a preview deployment).

### 20.3 Card back editor v2: free layout, per-element styling, used everywhere (Ready, asked 2026-10-17; three PRs, 20.3a to 20.3c)

Asked (2026-10-17): reposition elements on the back, change their fonts, sizes and colours, add effects (outline, glow, italic, bold and so on), and use the design everywhere a back is shown.

**Today (20.1, #222):** `CardBackStyle` is one design for the whole back. It has a background, a pattern, an edge colour, one text colour, one accent colour and one font (for the big number only). Placement is a single top / middle / bottom choice, sizes are S / M / L per element, and each element can be on or off. Elements sit in a fixed stack. The design reaches the print page, card dialog, binder, profile widgets, print of the week, the copy share image and the workspace preview. It does **not** reach the overlay's flip reveal (whose back is the pack cover), the admin print screens, or the Twitch panel (frozen).

#### The model (v2)

`lib/card-back.ts` keeps the background, pattern and edge, and gains a list of **elements**, each placed and styled on its own:
- **Element kinds:** `number` (print number), `edition`, `name` (name line), `date`, `origin` (origin and holder), `history`, `qr`, `logo`, `brand` (the small site name), `link` ("Full history"), and up to **8 `text` boxes**. Text boxes are templates with `{pack}`, `{season}`, `{card}`, `{version}`, `{edition}`, `{printNumber}`, `{holder}` and `{date}`; unknown placeholders are dropped, and each box is capped at 80 characters. Today's custom `line` becomes the first text box.
- **Placement**, relative to the card so one design fits every size (a 120 px tile, the print page, a 1080 px share image): `x`, `y` (the centre, 0 to 100 % of the card's width / height), `w` (box width, 10 to 100 %, so text wraps or shrinks inside it), `rotate` (-45 to 45 degrees), `z` (layer order), `locked` (the editor can't drag it), `show`.
- **Text style** (text elements): `font` from a fixed list (below), `size` in card units (% of card width, 2 to 30, so it scales), `weight` (400 / 500 / 600 / 700 / 800 / 900), `italic`, `underline`, `uppercase`, `letterSpacing` (-2 to 20, in tenths of an em), `lineHeight`, `align` (left / centre / right), `color` (hex, or `rarity`, which follows the card's rarity colour), `opacity` (0 to 1).
- **Effects** (any element, combinable): `outline` { colour, width }, `glow` { colour, blur, strength }, `shadow` { colour, x, y, blur }, `engrave` (today's pressed-into-metal look: inner light and dark shadows) and `gradientText` { from, to, angle }. For the QR code and the logo: outline, glow and shadow only, plus their own size and, for the QR code, dark / light colours.
- **Fonts:** a curated list of about 12, self-hosted in `public/fonts/back/` as woff2 so the overlay, the share-image canvas and the site all load the same files, and nothing calls Google at runtime: the site's two (Fredoka, Nunito) plus for example Bebas Neue, Oswald, Orbitron, Playfair Display, Cinzel, Permanent Marker, Press Start 2P, Space Mono, Roboto Slab and Pacifico. All must be OFL-licensed; keep their licence files beside them. A font is loaded only when a back on the page uses it (`FontFace` in the browser, `font-display: swap`).
- **Versioned and upgraded on read:** stored designs get `v: 2`. `upgradeCardBack(v1)` turns a 20.1 design into the v2 element list that renders the same (the stack positions computed from `align` and the sizes). `DEFAULT_CARD_BACK` stays today's steel plate exactly. No migration script; `sanitizeCardBack` accepts both and always returns v2. Same KV key `pack:<id>:cardback`.
- **Safety:** every number clamped, fonts and kinds from fixed lists, colours hex only, text rendered as text (never HTML), image URLs through the existing `safeUrl`, at most 24 elements, stored JSON at most 16 KB.

#### One layout engine, three renderers

A pure `layoutBack(style, print, size) -> BackNode[]` (in `lib/card-back-layout.ts`, client-safe) resolves templates, hidden elements and placeholders, and turns the percentages into pixels for a given card size. It returns positioned nodes with their final styles. Three renderers draw those nodes, so every place shows the same design:
1. **DOM** (`FlipCard`, the editor canvas): absolutely positioned elements, CSS for the effects (`-webkit-text-stroke` for outline, `text-shadow` stacks for glow / shadow / engrave, `background-clip: text` for gradient text).
2. **Canvas** (`lib/share-image.ts` / `ShareImage.tsx`): the same nodes with `strokeText`, `shadowBlur` and gradients. Fonts are awaited through `document.fonts.load` before drawing.
3. **Overlay** (`public/widget.js`): the widget can't import TS, so `GET /api/overlay/config` also returns each pack's resolved back design (the v2 JSON), and a small vanilla renderer in `widget.js` draws the same nodes as DOM. Keep it in step with the DOM renderer; the check compares both renderers' node lists on the same inputs.

#### 20.3a Model v2, layout engine, fonts, DOM renderer (M)

The v2 types, `upgradeCardBack`, `sanitizeCardBack` (v1 and v2), `layoutBack`, the curated fonts, and `FlipCard` drawing from `layoutBack`. Nothing looks different after this PR: every existing design (v1 or none) renders as it does today. The current 20.1 editor keeps working by editing through the upgrade (its controls map onto the elements) until 20.3b replaces it. Check: extend `scripts/check-card-back.mts` with: the v1 upgrade renders the same node list as before (snapshot the node lists of the default and the four presets), clamping, unknown fonts and kinds dropped, template placeholders, the 16 KB cap.

#### 20.3b The visual editor (L)

Replaces the controls in `CardBackEditor` (it lives in the pack workspace's pack panel since 20.2a; it keeps its props and server action):
- **The canvas:** a large live back with a sample print of the pack. You can drag elements to move them, drag a handle to change the box width, Shift-drag a corner to scale the text, and use the rotate handle. Snap guides cover the card centre and edges, other elements' centres and edges, and a 2 % grid (Alt = free). Arrow keys nudge by 0.5 % (Shift = 2 %). Selected elements show their box, and hovering shows an outline. Clicking empty space selects the background.
- **Layers list:** every element in z order, with show / hide, lock, rename (text boxes), drag to reorder, duplicate and delete (text boxes), and **Add text**. Multi-select (Shift-click, or a marquee on the canvas) gets **Align** (left / centre / right / top / middle / bottom) and **Distribute**.
- **Properties panel** for the selection:
  - font (each option previewed in its own face), size, weight, italic, underline, uppercase, letter spacing, line height, alignment, colour (picker, hex, `rarity`), opacity;
  - effects, each a switch with its settings: outline, glow, shadow, engrave, gradient text;
  - rotation and exact x / y / w numbers;
  - for the background: today's background, pattern and edge controls.
- **Preview sizes** under the canvas: the same back as a tile, on the print page and as a share image, side by side, to catch text that is too small at tile size. A warning badge appears when a text element renders under 9 px at tile size.
- Undo / redo (60 deep; a drag is one step), the presets from 20.1 rebuilt as v2 layouts, **Copy from another pack**, **Reset element** and **Reset to default**. It saves through the existing action (requireAdmin, audit, revalidate) into the workspace's change set rules (explicit Save with Review on published packs).
- **Phones:** the canvas fills the width, touch drag works (pointer events), and properties open in a bottom sheet.
- No changes to the public pages in this PR.

#### 20.3c Used everywhere (M)

- One constructor: `flipBackFor(print, pack, back)` (or the existing builder, renamed) is the only way to build a `FlipBack`, and every place goes through it. `check-card-back` fails if any file under `app/` or `lib/` builds a back object any other way (a grep for the fields).
- Audit and wire every place a print's back can show, with the result listed in the PR:
  - print pages (`/c/<uid>`, `/copy/...`), the card dialog, binder, profile widgets (pinned, showcase), print of the week (done in 20.1; re-check them under v2);
  - the share images of prints, through the canvas renderer, plus any OG image of a print page that draws the back;
  - trade pages and stacks where a print can be flipped;
  - the admin Prints screen side panel and `/admin/serials/<season>/<copy>`;
  - the pack workspace preview (20.2b);
  - **the overlay:** a new Overlay Editor property `reveal.flipBack` in the Flip reveal section: `cover` (today, the default, so nothing changes on stream) or `design` (the pack's back design, with data elements hidden because the print isn't known before the flip, and logo, text boxes and pattern shown). The same property applies to the show-off flip entrance.
- **Twitch panel: not changed (freeze).** Added to "Later: next extension version": the panel's flip backs use the pack design.
- Check: the overlay node lists match the DOM renderer for the same design (pure comparison), `node --check public/widget.js`, then the flip reveal played in `/overlay.html?dev` with `design` on.

**Order:** after 20.2d merges (the workspace's pack panel must be stable). 20.3a first. Then 20.3b and 20.3c can run in parallel: 20.3b only edits the editor, and 20.3c only edits the renderers' callers, the overlay and the share images. They must not both edit `lib/card-back-layout.ts`; if 20.3c needs a layout change, it waits for 20.3b. 20.2e and 20.2f stay in their order and don't touch the card back.
**Words:** a changelog line in each PR's `## Changelog` (20.3a "none"; 20.3b and 20.3c for players: "Packs can have fully designed card backs"). FAQ: no change.

---

## Track 21: Changelog

### 21.1 Changelog built from PRs on every build (Ready, decided 2026-10-16)

Asked: an auto-updating changelog generated on every build from PR / commit messages. Today `/changelog` reads hand-written entries in `lib/changelog.ts` (11.1).

**Decided (2026-10-16):**
- Source = **merged PRs into `main`**, not raw commits (commit messages are written for developers, and merge commits carry no detail). Each PR body gets a `## Changelog` section written for players (bullets; "none" or no section = left out, for staff-only and internal changes). The repo is private, so the build reads PRs through the GitHub API with a read-only token.
- The hand-written entries stay as the history before this ships.
- **Claude is never mentioned in the changelog** (the owner's rule). PR bodies end with a "Generated with Claude Code" line and commits carry a `Co-Authored-By: Claude` line, so the parser: stops the section at the next heading, a horizontal rule (`---`) or the first line starting with the robot emoji or "Generated with"; never reads commit messages; drops any line or title that matches `/claude|anthropic|co-authored-by|generated with/i`; and the check fails if a generated entry still contains "Claude". The PR template puts the Changelog section **above** everything else in the body, and `docs/review.md` says to write it for players with no tool or author credits.

**Build step:** `scripts/build-changelog.mjs`, run before `next build` (`"build": "node scripts/build-changelog.mjs && next build"`). It lists merged PRs into `main` (`GET /repos/{owner}/{repo}/pulls?state=closed&base=main`, paged, stop at the ship date), takes each PR's `## Changelog` section (until the next heading), turns it into `{ date: merged_at day, title: the first line if it starts "Title:", else the PR title without the "(ROADMAP x.y)" suffix, items, tags from PR labels new / improved / fixed, pr: number }`, and writes `.next-changelog.json` (gitignored). Owner and repo from `VERCEL_GIT_REPO_OWNER` / `VERCEL_GIT_REPO_SLUG`, token from `GITHUB_CHANGELOG_TOKEN` (fine-grained, this repo only, Pull requests: read; added to `ENV_SPECS` as recommended). No token, no network, or an API error: the script writes `[]`, prints a warning and the build continues (never fails a deploy).
- `lib/changelog.ts` merges the generated entries with the hand ones (generated first, newest first; same-day entries stay separate, one per PR). The page, the "new" dot and `check-words` work as today; `check-words` also scans the generated file in the build (a PR whose changelog has an em dash fails the build step's lint, printed, entry dropped).
- **PR template:** `.github/pull_request_template.md` with a `## Changelog` section and a one-line hint ("For players. Write none for staff-only changes."). Update the rule in `CLAUDE.md` Conventions and `docs/review.md` (from "edit `lib/changelog.ts`" to "fill the PR's Changelog section").
- **User step:** create the token and add `GITHUB_CHANGELOG_TOKEN` to Vercel (Production and Preview), then redeploy.
- Check: `scripts/check-changelog.mts` parses sample PR bodies (section found, "none", missing, labels, title override, the 500-character cap per item) without network.

---

## Track 22: Email notifications

### 22.1 Email notifications (Ready, decided 2026-10-16)

Asked: a viewer can enter their email for notifications. It adds personal data the site doesn't hold today (it only knows Twitch logins), hence the opt-in rules below.

**Decided:** **Resend** (free tier 3,000 emails a month, 100 a day; one API key; React-free plain HTML templates), sending from `alerts@cheesytcg.app`.
- **User steps:** create the Resend account, add the domain and its DNS records (SPF, DKIM, and a DMARC record) at the registrar, set `RESEND_API_KEY` and `EMAIL_FROM` in Vercel.
- **Data:** `user:<u>:email` `{ address, verifiedAt?, kinds, addedAt }`, one address per viewer, never shown publicly, in the export, deleted with the account.
- **Double opt-in:** Settings -> Notifications -> Email: enter the address, we send a confirmation link (signed token, 24 h); nothing else is sent until it is confirmed. Changing the address starts again.
- **What is sent:** the same kinds as push (offers, results, listing alerts, admin notices, feedback replies), each with its own tick, **default: offers and results only**. At most one email per 15 minutes per viewer: notices in that window are batched into one email ("3 new trade offers"). Optional weekly summary of their own week (off by default).
- **Every email** has a one-click unsubscribe link (signed, no sign-in needed) and the `List-Unsubscribe` / `List-Unsubscribe-Post` headers; bounces and complaints from Resend's webhook switch email off for that viewer.
- **Never from sandboxes or previews** (`inSandbox()`), like Discord and push.
- **Words:** Privacy Policy (what is stored, the processor, how to remove it), Terms, FAQ. Bump `LEGAL_UPDATED`.
- **Checks:** `scripts/check-email.mts` with a tiny fake Resend (like `mock-twitch.cjs`): opt-in, batching window, kind gating, unsubscribe token, bounce switch-off, sandbox silence.
- Built behind the env vars: without `RESEND_API_KEY` the Email section is hidden, like push without VAPID keys. `lib/email.ts` calls Resend's REST API with `fetch` (no SDK needed), Node runtime only.

---

## Later: next extension version (after the freeze lifts)

Ship as one reviewed panel version: the pack card back design on the panel's flip backs (20.3), choosing prints when trading (6.4: composer and accept picker, exact serial preview), favourite prints (9.1: hearts and disabled picks), "Reversed by staff" on reversed trades (9.2), achievements, Looking for / listing alerts, the binder, share images, the 2.5 copies-first dialog, unique numbers on tiles (2.1), a link to `/trade/<id>` from the Trades tab, anything Twitch reviewers asked for. Bump `version` in `package.json`, rebuild the zip, refresh screenshots, update the change log in `twitch-extension/SUBMISSION.md`.

## Done (recent)

- Tracks 12 to 14, merged 2026-10-16:
  - Track 12, Mix It Up paid pulls: settings tab, balance check, deduct and revoke, limits per stream (#201); limits and temporary bonuses stored per viewer for future buff cards (#204).
  - Track 13, security: `/api/collection` writes need a server-issued one-use ticket, the server rolls each pull (#202); the overlay key guards the queue, notify and heartbeat endpoints (#203).
  - Track 14: a card granted by webhook is recorded with a pull's facts and reads, posts and counts as a pull in the live feed, dashboard, Discord, stream recap, weekly digest and charts (#205, #206).

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

## Track 24: daisyUI

### 24.0 Tailwind 3 to 4, no visual change (Done, #267)

Original design, from the 2026-10 plan:

`npx @tailwindcss/upgrade`, then check its work: the theme moves to `@theme` in `app/globals.css` (gray, yellow and poke scales, `--font-display`/`--font-body`, the two shadows), PostCSS uses `@tailwindcss/postcss`, `tailwind.config.ts` goes. Watch the v4 renames and default changes (`shadow-sm` to `shadow-xs`, `rounded-sm` to `rounded-xs`, `ring` to `ring-3`, `outline-none` to `outline-hidden`, borders and rings default to `currentColor`, so add the gray-800 border default to the base layer). `.design-sync` has its own safelisted Tailwind config: move it to v4 too and confirm its build. Should also clear the Dependabot `braces` alert. Checks: `npm run verify`, `npm run build`, the public-site and admin sweeps from `docs/review.md` against the mock KV at 1280px and 390px; pages should look the same.

Shipped as Tailwind 4.3.3. The theme lives in `@theme`, there is no `tailwind.config.ts`, and the pages look the same. The font variables are `--font-display-family` (set by Next) and `--font-display` / `--font-sans` in the theme, so the two do not cycle.

### 24.1 Add daisyUI with a `cheesy` theme, no visual change (Done, #268)

Original design:

`@plugin "daisyui" { themes: cheesy --default; }` and a `@plugin "daisyui/theme"` block: `base-100/200/300` = gray-950/900/800, `base-content` = gray-100, `primary` = `#ffcb05` on `#1a1400`, `secondary` = poke-blue, `error` = poke-red, `success`/`warning`/`info` = the green/amber/sky in use, `--radius-field` xl, `--radius-box` 2xl, `color-scheme: dark`. Keep the gray/yellow scales. Sweep again: daisyUI's base layer touches the page background, `<dialog>` and form controls.

Shipped as daisyUI 5 with only the `cheesy` theme. Built-in light and dark themes stay off. Pages still use the hand-written utilities.

### 24.2 Shared primitives (Done, #269)

Original design:

Props unchanged so callers don't move: `.tcg-btn` to `btn btn-primary` (keep the 3D shadow as an override), `ArmedButton`/`ConfirmButton` armed state to `btn-error`, `Spinner` to `loading loading-spinner`, `StatusChip`/`DraftChip`/`StaffBadge`/`SerialChip` to `badge` (SerialChip keeps its tiers), `Dialog` to a `<dialog>`-based `modal` (native focus trap and Esc; check the thin open/close wrappers), `PageTab`/`AdminNav` to `tabs`/`menu`. Re-sync the design system.

Shipped that way. `Dialog` uses `showModal()` so Esc and the focus trap stay the browser's, and a wrapper that ignores `onClose` (a busy import) keeps the dialog open. The design-sync conventions and compiled CSS match the primitives. The remote design project was not uploaded from this environment (the resync script is not in the repo).

### 24.3 Admin forms (part 1, #270)

Admin and mod text fields, selects, textareas, on/off switches and field labels use daisyUI `input`, `select`, `textarea`, `toggle` and `fieldset`. Shared strings in `app/admin/components/ui.tsx` (`fieldClass`, `selectClass`, `areaClass`, `toggleClass`) keep the same exports. Row-selection checkboxes, variant chips and radio groups stay native. Panels and tables were the next 24.3 PR. Design-sync conventions stay for 24.4.

### 24.3 Admin panels and tables (part 2, #271)

Admin panels use daisyUI `card` and keep `.tcg-panel` for the navy surface, shadow and rim. `Panel` headings are `card-title`. Admin tables use `table` (`table-sm` or `table-xs` where the rows are dense). The public site still uses `.tcg-panel` and its own tables. `.tcg-panel` is dropped in 24.4, once nothing else uses it.

### 24.3 Public profile and binder (#272)

Profile and binder panels (`ProfileTabs`, overview widgets, the share tab, the binder settings aside, the card dialog, the report dialog and the inline profile editor) use daisyUI `card` and keep `.tcg-panel` for the navy surface. Collection filters, the binder editor, the bio and the report form use `input`, `select`, `textarea`, `toggle` and `fieldset`. The print dialog's version table is `table table-sm`. The leather binder (`.bn-*`), `holo-hover` on card tiles, the Grid / Binder switch, and the accent and pronoun pickers (shared with Settings) are unchanged. Dex, leaderboard, trading, account and settings are the remaining 24.3 slices.

### 24.3 Public dex and leaderboard (#273)

The card dex filters use daisyUI `input` and `select`. The dex dialog is a `card` (navy surface stays on `.tcg-panel`) and its version table is `table table-sm`. Leaderboard rows are the same `card`, and the collector search is an `input`. The season-stats Every card search and table use `input` and `table` too. Rarity chips, rank-by chips, `.rind` sections, `holo-hover` and `vfx-*` on dex tiles stay. Trading, account and settings are the remaining 24.3 slices.

### 24.3 Public trading (#274)

Public trade panels (`TradeCard` and each side of the composer) use daisyUI `card` and keep `.tcg-panel` for the navy surface. The board search and sort, the composer name, note and card search use `input`, `select` and `fieldset`. Cheese `.rind` sections, filter chips, the lopsided-offer tick, print chips and the second-tap actions stay. Escrow, locks and the trade engine are unchanged. The Twitch panel is untouched. Account and settings are the remaining 24.3 slice.

### 24.3 Account and settings (#275)

Settings sections, the feedback form and list, and notification day lists use daisyUI `card` and keep `.tcg-panel`. Settings switches, push kinds and email kinds are `toggle`. Bio, feedback, the delete confirmation, searches and the accent hex field use `input` and `textarea`; collection view, watch version and pronouns use `select` and `fieldset`. `/account` stays on cheese `.rind`. Filter chips, looking-for chips, accent swatches, the colour box, the sticky save bar and the red delete section stay. Saving, export and deletion are unchanged. The Twitch panel is untouched. 24.4 cleanup is what remains of item 24.

### 24.4 Clean-up (Done)

Dropped `.tcg-btn` and `.tcg-panel`. Primary page buttons are `btn btn-primary` with a radius utility (`rounded-xl`, `rounded-lg` or `rounded-full`), and the 3D yellow press stays on that combination. A dialog confirm stays a plain `btn btn-primary`. Panels are `card`; the navy surface, blue rim and card shadow live on `card`. House notes updated in `.design-sync/conventions.md`, the Tailwind line in `CLAUDE.md` and `GROK.md`, `docs/admin/ux-conventions.md` and `docs/public-site.md`. The overlay, the Twitch panel, card effects and `Icon` were not changed. Nothing in a frozen area used the two classes, so both are gone.

### 25.3 Collectors page rows, and the Bottomgidds name (Done)

`/collection` rows show `unique/total` cards (the season total) and the list header links to the card dex. The seed card is named Bottomgidds, matching its art file. Production card names live in KV, so the live card is renamed in the pack workspace, not by a script.

### 26.1 Profile: one Edit profile, and a separate Settings link (Done)

The owner's profile action row has **Edit profile** (opens the inline bio, header colour and pronouns editor under the name) and **Settings** (`/settings`). The extra Edit profile button by the name is gone. Visitors see neither. Bio still shows for visitors. Save still goes through `saveProfileBasics`.

### 26.2 Collection tiles: no name overlay, readable edition pill (Done)

Collection tiles no longer print the card name on hover, and the long tooltip is gone. The accessible name is the card name. The sequence chip on a tile, and the same chip on a binder pocket, is a solid dark plate with yellow text and a yellow border. The card dialog keeps the usual gold `SerialChip`.

### 26.8 Wordmark links home, or to the dashboard in admin (Done)

The public site wordmark still opens `/`. The admin sidebar brand (logo and "The Cheesy TCG") and the phone top-bar title open `/admin`. The accessible name is "The Cheesy TCG, dashboard". The mod bar still opens `/mod`. The logo stays at the top left.

### 26.5 Share image presets (Done)

The owner's Share tab picks cards with one row: My best 1, Top 3, Top 6, Top 9, Custom. The selected chip is yellow and the others stay grey, including on hover. Each count takes the first N candidates (best first). Top 6 is the default. Choosing Custom, or toggling a card, leaves the per-card toggles in charge. A single copy's share image has no row.

### 26.4 Profile activity: pulls, upgrades and trades link through (Done)

A pull row names the card, the version and the sequence chip. It opens `/c/<uid>` or `/copy/<season>/<id>` when the event has one, and the card dex otherwise. An upgrade links to the print it made the same way. An accepted trade links to `/trade/<id>` when the event has `tradeId`. New trade events record it. Older ones stay text. Admin grants and declined offers stay off the tab. Hidden collectors stay empty.

### 26.3 Collection holo sweeps too fast on Mac (Done)

A collection tile or binder pocket with `holo-fx` does not also take `holo-hover`, so the 0.7s wipe no longer fights the shimmer's `::after`. The grid and binder raise a saved sweep faster than 8 seconds up to 8. Overlay, ceremony and the panel keep the saved time. Reduced motion still turns the sweep off.

### 27.4 Print bonus cutoff set to 40 (Done)

`DEFAULT_SCORING.serialBonusCutoff` is 40. A saved `scoring:settings` value is left as stored, so a site that already saved 20 keeps 20 until someone saves 40 in Admin → Settings → Scoring. Scores recompute on the next page load after that save. `EVENT_CAP` (how many journey events a copy keeps) stays 40 and is a different setting.

### 27.1 FAQ pass (Done)

The FAQ jump list and the page body use the same order: Getting started, Chat commands, Cards & versions, Trading, Upgrading, Your profile, Showing off, Points & leaderboard, Seasons, Twitch extension, Privacy & data, Something not working? Getting started says follow, subscribe or gift subs, links to `#commands`, and does not name a pack count. It also says paid pulls have one default (0 means no limit), staff can set a personal limit, and staff can grant bonuses. Chat commands keeps the enabled list from `getCommands()` and adds a fixed `!pack` line (set up in Mix It Up, not the command builder). Upgrading says any edition of any version can be traded, including an upgraded one, and that a favourite or an edition already in an offer cannot. The print-bonus sentence uses the live cutoff ("the Nth print"); cutoff 0 keeps the switched-off sentence. The maths block has no space inside `round(` or `max(`. Privacy and Terms were not changed. 28.1 rewrites the limit answer when role limits exist.

### 25.1 Home: Card of the week (Done)

The home block is titled Card of the week. Under the card name it shows Edition #uid, the print line, who holds it (a private collector or a trade offer when that applies), and See its journey. The reason sits under those in smaller type. The block still hides when there is no pick or the edition was spent. The FAQ question is "How is the card of the week chosen?" (`id="card-of-the-week"`). The pick, the KV keys and the admin button "Feature as print of the week" stay.

### 25.2 A copy is an edition; "24 of 28" is a print (Done)

A person's copy is an edition. Edition #uid is the game-wide id (it was Print #uid). Print #n of N is the sequence (it was Edition #n of N), and the points bonus on that number is the print bonus. Code, KV, URLs and the card-back tokens `{printNumber}` and `{edition}` keep their names: `{printNumber}` still renders the uid and `{edition}` still renders n. Saved overlay values `edition`, `uid` and `both` still select the same number; the menu labels swapped. The admin button stays "Feature as print of the week". The home block is "Edition of the week" until 25.1 renames it. The Twitch panel still says print for a copy. Achievement titles earned before this change keep the words they were given.

### 27.3 Achievement list: on/off, rename, edit the text (Done)

Settings → Achievements lists every built-in kind (completed set, each star tier, each version, master set, and the edition-number goals). Each row is on or off, plus a title and a detail. A blank box keeps the built-in sentence. Stored at `achievements:settings`. A switched-off kind is left out of a fresh evaluation. A goal already stored on a profile stays, and clearing the words brings the built-in sentence back. No new rules, no icons, no per-season overrides.

### 28.2 Generate a Mix It Up command from the saved settings (Done)

The Commands tab lists a Copy setup block for every switched-on command (the `!` name, the webhook, the JSON, and the `message` field). Paid pulls show the balance and deduct requests from the saved settings. Mix It Up is not called to create them.

### 26.7 Editable profile showcase, and !showoff uses it (Done)

`UserSettings.showcaseUids` holds up to 3 print uids. Empty still means the three most valuable. The owner edits them on the Showcase widget. A bare `!showoff` shows the pinned print, else the first showcase pick they still hold, else the best card. A named card is unchanged. A dry run still queues nothing.

### 26.6 Post a share image straight to Discord (Done)

Category `shares` stays off until a channel is saved with it ticked. The owner's Share tab posts the PNG (multipart, 4 MB cap) and one line naming the collector, the site and the channel. No enabled channel means no request. One post per collector per minute. A sandbox refuses. The delivery log records it. The Discord channel itself is still a user step.

### 28.3 Font control on every card-back text element (Done)

The card back editor shows the same font list on every text element, stacked or free (`BACK_FONTS`: site display, site body, system mono, and the self-hosted faces). A stacked element keeps today's face (site display for the print number, site body for the other lines) until someone picks another. The print number's face goes through `--num-font`; the other lines get `font-family`. Overlay label fonts are 28.4.
