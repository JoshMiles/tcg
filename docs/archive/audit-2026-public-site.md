# Audit 2026: public site (ROADMAP 44.1)

> History. Read it when you pick up a finding or proposal from the 44.1 audit.

## Intro

- **Commit audited:** `e909170` (main, 2026-10-26).
- **Method:** read the code only. Pages, route handlers, server actions and the `lib/` code they call, found with `trail ask`, `trail grep`, `trail skeleton` and `trail callers`, then read by line range. KV read counts are **static counts** from reading the code path (one KV call = one round trip), not measurements.
- **Not checked:** nothing was run. No dev server, browser, mock KV or production data, so there is no rendering check at 375px, no screen reader pass, no bundle size measurement and no timing. Twitch and Discord OAuth, Turnstile, Vercel Blob, web push delivery and Discord delivery were read, not exercised. Pages covered lightly (read for structure, not line by line): changelog, FAQ, terms, privacy, install, offline, notifications, settings and account. The Twitch panel (44.4), admin (44.2) and mod panel (44.3) are out of scope.
- **Security:** no critical or high security finding was found in this area, so nothing is held back.

## CODE_REVIEW.md status (this area)

From `docs/CODE_REVIEW.md` (2026-10-18, `e79eb1d`).

| # | Finding | Status | Evidence |
|---|---------|--------|----------|
| 1 | `GET /api/collection` dumps every collection | Fixed | Needs `isOverlayRequest`, sends `no-store` (`app/api/collection/route.ts:18-23`) |
| 4 | Password login rate limit trusts the left-most `X-Forwarded-For` | Still open | `app/api/auth/login/route.ts:15` (see L-2) |
| 7 | Trade escrow could lose editions | Fixed | `sweepInLock` persists, `returnToCollection` returns false when the season is gone, `closeTrade` keeps `escrowed` on a failed refund, `createInLock` writes only the open list (`lib/trades.ts`) |
| 9 | A season's collection is one JSON blob | Still open (by design) | `getCollection` / `saveCollection` in `lib/kv.ts:284-296`; see proposal C-5 |
| 13 | One secret signs the viewer session and the staff cookie | Still open | `lib/staff-token.ts:25` (see L-3) |
| 16 | Holdings API ignored private profiles | Fixed | `mayReadHoldings` checks `privateProfile`, staff and the viewer (`app/api/trades/holdings/route.ts`) |
| 18 | Lock released by GET then DEL | Still open | `lib/kv.ts:322` (see M-1) |
| 19 | Sandbox exit open redirect via `/\` | Still open | `app/api/sandbox/exit/route.ts:9` (see L-1) |
| 23 | Watch index marked ready after a failed scan | Still open | `lib/watch-index.ts:28-30` (see M-2) |
| 24 | Paid pull saved before the charge | Still open | `app/api/collection/route.ts:59-75` (see L-4) |
| 25 | Email send cap never expires | No longer relevant | There is no email code left in `app/` or `lib/` (no `lib/email.ts`, no Resend or mailer import) |

## Findings

Counts: critical 0, high 0, medium 6, low 15.

### Medium

**M-1. Collection lock can delete someone else's lock** (bug)
- File: `lib/kv.ts:322` (`withCollectionLock` release: `if ((await kv.get(key)) === token) await kv.del(key);`).
- Evidence: the check and the delete are two round trips. If the lock expires between them and another request takes it, the first request deletes the second one's lock, and a third writer can then interleave with the second. Every pull, trade, upgrade and trainer card goes through this lock.
- Fix: release with one compare-and-delete Lua script (`kv.eval`). Size S.

**M-2. Listing alerts go silent after one failed index build** (bug)
- File: `lib/watch-index.ts:28-30` (`ensureIndex`).
- Evidence: `getAllCollectionUsers().catch(() => [])` turns a read failure into "no users", `syncWatchIndex` swallows its own errors, and `kv.set(READY, ...)` runs regardless. One KV hiccup during the first build marks the index ready with nobody in it, so wanted and watch alerts stop for every viewer who has not saved their settings since.
- Fix: set `READY` only when the scan read its users and every sync succeeded. Size S.

**M-3. No per-request memoisation of the KV readers** (efficiency)
- Files: `lib/kv.ts` (`listSeasons`, `getActiveSeason`, `getActiveSeasonWithPacks`, `getPacksForSeason`), `lib/user-settings-store.ts` (`getUserSettings`), `getHiddenUsers`.
- Evidence (static counts): `listSeasons` is 1 + N reads (N seasons) and runs two to three times on the home page (`getActive` plus `getActiveSeason` inside it, then again for the season picker). The profile page reads `getUserSettings` for the same viewer three times (metadata, page, `loadProfileBase`). `getHiddenUsers` (2 reads) runs twice on the home page. Only `getSiteLabel`, `getStaffBadges`, `getStaff` and `staffPanelLink` use React `cache()`.
- Fix: wrap these readers in `cache()` (request scoped, safe with the sandbox prefix because it is per request). Size S.

**M-4. Home page is one long sequential waterfall** (efficiency)
- File: `app/(site)/page.tsx`.
- Evidence (static count, warm board cache): about 10 + 3N KV round trips, nearly all awaited one after another: `getActive`, `getSeasonOverview`, `listOpenTrades` (signed in), recent pulls (`lrange` of 500 + 2), `listSeasons` again, `getSnapshot`, `getAvatars`, `getCollectionCached`, `getHiddenUsers` again. There is no `<Suspense>` split, so nothing paints until the last read returns.
- Fix: start independent reads together with `Promise.all`, and put recent pulls and the live strip in their own `<Suspense>`. Size M.

**M-5. Profile share image recomputes the whole leaderboard on every crawl** (efficiency)
- File: `app/u/[username]/opengraph-image.tsx:26-27`.
- Evidence: calls `getSeasonLeaderboard` (uncached: packs, every pack's cards, the collection blob, scoring settings, serial index, bonuses, hidden list), then `getCollection` and every pack's cards again. A link pasted in Discord or a crawler sweep costs a full board per profile.
- Fix: use `getSeasonLeaderboardCached(season)` and take collection and packs from its result. Size S.

**M-6. Avatars read the whole avatar hash on every call** (efficiency)
- File: `lib/avatars.ts:31` (`kv.hgetall`).
- Evidence: the hash holds every viewer ever seen and grows forever; home, leaderboard, stats and profile pages download all of it to show a handful of faces.
- Fix: `kv.hmget` only the names on the page. Size S.

### Low

**L-1. Sandbox exit redirect accepts `/\host`** (security)
- File: `app/api/sandbox/exit/route.ts:9`.
- Evidence: the check rejects `//` but not `/\`, which the URL parser treats as `//`. Already listed in CODE_REVIEW 19. POST only, which limits use. `safeReturnTo` in `lib/twitch-oauth.ts` already has the right check.
- Fix: reuse `safeReturnTo`. Size S.

**L-2. Password login rate limit keys on the left-most `X-Forwarded-For`** (security)
- File: `app/api/auth/login/route.ts:15`.
- Evidence: CODE_REVIEW 4. On Vercel the platform sets this header, so the practical risk is low, but the code trusts a client-shaped value.
- Fix: key on `x-real-ip` (set by Vercel) first. Size S.

**L-3. One secret signs sessions and staff cookies** (security)
- File: `lib/staff-token.ts:25`.
- Evidence: CODE_REVIEW 13. The payload shapes differ, so a session cannot be passed off as a staff cookie today; a leak of one secret still forges both.
- Fix: a separate `STAFF_COOKIE_SECRET` with a fallback during rollout. Size S.

**L-4. A paid pull is added before Mix It Up confirms the charge** (bug)
- File: `app/api/collection/route.ts:59-75`.
- Evidence: CODE_REVIEW 24. If the charge fails, `revokePrint` takes the edition back, but returns null (and leaves it) if the edition moved or went into escrow in between. The window is the length of one Mix It Up call, so this is unlikely.
- Fix: charge first, then append (and refund on a failed append), or log when `revokePrint` returns null. Size M.

**L-5. The access cookie is not tied to the signed-in viewer** (security)
- Files: `app/auth/twitch/callback/route.ts:58`, `lib/access-gate.ts`.
- Evidence: a new Twitch sign-in clears the staff cookie but not `tcg_access`, and `gateDecision` never compares the token's `login` with the session. A different viewer signing in on the same browser passes the middleware for up to an hour. The authoritative `requireSiteAccess()` re-check still applies, so the exposure is the streamed page data before the redirect described in `docs/public-site/closed-beta.md`.
- Fix: delete `ACCESS_COOKIE` in the callback (a one-line fix, not applied in this audit). Size S.

**L-6. Push subscriptions accept any https endpoint** (security)
- File: `lib/push-core.ts:18-24` (`validEndpoint`).
- Evidence: the server later POSTs encrypted payloads to whatever https URL the browser sent, so a viewer can point their notifications at any host. The body is ciphertext, so the impact is a small outbound request on someone else's behalf.
- Fix: allow only the known push service hosts (FCM, Mozilla, Apple, Windows). Size S.

**L-7. Raw error messages are returned on 503** (security)
- Files: `app/api/trades/route.ts:34`, `app/api/trades/[id]/route.ts`, `app/api/account/upgrade/route.ts:37`.
- Evidence: `e.message` from KV or internal code reaches the browser and the toast.
- Fix: log the error, send a fixed sentence. Size S.

**L-8. Some signed-in writes skip the closed-site re-check** (security)
- Files: `app/api/account/discord/route.ts` (GET, POST, DELETE), `app/u/[username]/actions.ts` (seven server actions).
- Evidence: the other account and trade APIs call `siteClosedResponse()`; these rely on the middleware's cookie layer only.
- Fix: add `siteClosedResponse()` / a `hasSiteAccess` check to match. Size S.

**L-9. Trainer cards accept any season id** (bug)
- File: `lib/buffs.ts:363-365`.
- Evidence: a client-supplied `seasonId` falls back to `getSeason(seasonId)`, so a draft or ended season is accepted; with no id it falls back to `seasons[0]`, which may be a draft. Ownership is still checked, so the effect is using an edition from an ended season.
- Fix: accept only published seasons that have not ended. Size S.

**L-10. Copy page loads everything twice, one pack at a time** (efficiency)
- File: `app/(entity)/copy/[seasonId]/[copyId]/page.tsx`.
- Evidence: `load()` runs in `generateMetadata` and in the page with no `cache()`; it reads pack cards one pack after another, then up to 12 `getCopy` calls in sequence.
- Fix: `cache(load)` and `Promise.all` for packs and refs. Size S.

**L-11. Trade page sweeps trades twice** (efficiency)
- File: `app/(entity)/trade/[id]/page.tsx`.
- Evidence: `sweepTrades` is called directly, then again inside `getTrade` through `listOpenTrades`.
- Fix: drop the direct call. Size S.

**L-12. Every profile view sweeps expired trades** (efficiency)
- File: `app/u/[username]/page.tsx`.
- Evidence: `sweepTrades` (open list read, and a locked write when anything expired) runs on each view, including crawlers.
- Fix: leave sweeping to the trade APIs and the cron. Size S.

**L-13. Recent pulls read 500 activity entries per render** (efficiency)
- File: `lib/site-data.ts:47`.
- Evidence: the API route is CDN cached for 15 s, but the home page calls `getRecentCardArrivals` directly, so each home render reads the 500-entry log and filters it.
- Fix: share the API's cache (a `'use cache'` with the sandbox id as an argument, or the TTL cache). Size S.

**L-14. Public pages import admin components** (delete/merge)
- Files: `app/(site)/page.tsx:3` (`PendingButton`), `app/(entity)/trade/[id]/page.tsx:20` (`ReverseTrade`).
- Evidence: public code reaches into `app/admin/`, so admin changes can break the public site.
- Fix: move `PendingButton` to `app/components/`; render `ReverseTrade` through a staff-only slot. Size S.

**L-15. Discord copy hard-codes "Cheesygidds"** (UI/UX)
- Files: `app/components/site/DiscordPrompt.tsx:44`, `app/components/site/DiscordAlerts.tsx:136,177`.
- Evidence: CLAUDE.md asks for `CHANNEL_NAME` from `lib/site.ts`. The text names the Discord server, which shares the name.
- Fix: use `CHANNEL_NAME` (or add a `DISCORD_SERVER_NAME` beside it). Size S.

Checked and fine: Twitch OAuth state and `safeReturnTo`; session signing and expiry; draft seasons kept out of public pages, the sitemap and the card owners API; private profiles and admin-hidden viewers on copy pages, owners, home, stats, leaderboard, search and recent pulls; holdings privacy; escrow names hidden on copy pages; share image size and per-viewer rate limit in `postShareImage`; no em dashes in `app/`; clickable overlays have keyboard paths (the flip card has its own button).

## Proposals

### Changes

| # | Pitch | Touches | Size | Value |
|---|-------|---------|------|-------|
| C-1 | Wrap the hot KV readers in React `cache()` (fixes M-3) | `lib/kv.ts`, `lib/user-settings-store.ts`, every public page | S | high |
| C-2 | Compare-and-delete lock release in one Lua call (fixes M-1) | `lib/kv.ts` | S | high |
| C-3 | Profile share image from the cached board (fixes M-5) | `app/u/[username]/opengraph-image.tsx` | S | medium |
| C-4 | `hmget` avatars for the names on screen (fixes M-6) | `lib/avatars.ts` and its callers | S | medium |
| C-5 | Store each viewer's editions under their own key instead of one season blob | `lib/kv.ts`, trades, draws, leaderboard | L | medium |
| C-6 | Move shared buttons out of `app/admin/` (fixes L-14) | home, trade page | S | low |

### Feature improvements

| # | Pitch | Touches | Size | Value |
|---|-------|---------|------|-------|
| F-1 | Show alert health on /settings: how many cards you watch and when an alert last fired, so a broken index (M-2) is visible | `/settings`, `lib/watch-index.ts` | S | medium |
| F-2 | Ownership history on the copy page: every collector who held this edition, from the copy ledger | copy page, `lib/serials.ts` | M | medium |
| F-3 | "View as public" on your own profile, so a private or hidden viewer sees what others see | profile page | S | low |

### Experimental features

| # | Pitch | Cheap trial | Success signal | Touches | Size | Value |
|---|-------|-------------|----------------|---------|------|-------|
| E-1 | Stream the home page: shell first, data in `<Suspense>` | One boundary around recent pulls and the live strip | Lower LCP and TTFB for `/` in Vercel Speed Insights | home | S | high |
| E-2 | CDN-cache the public leaderboard JSON (s-maxage 20) instead of the per-instance TTL cache | Only `/leaderboard` for a week | KV commands per minute fall in the Upstash dashboard | leaderboard, `lib/leaderboard.ts` | M | medium |
| E-3 | Swap finder on the trade board: viewers who hold a card you want and want one you hold | A read-only "possible swaps" list for the signed-in viewer | Share of new trades opened from the list | trade board, wanted list | M | medium |

### UI and UX improvements

| # | Pitch | Touches | Size | Value |
|---|-------|---------|------|-------|
| U-1 | Friendly fixed messages for server errors in trade and upgrade toasts (pairs with L-7) | trade and upgrade APIs, toasts | S | medium |
| U-2 | `loading.tsx` skeletons for profile, dex and copy pages, which are dynamic and slow on a cold board | those routes | S | medium |
| U-3 | Run the 375px sweep in `docs/review.md` on trade/new, the binder and copy pages (not checked in this audit) | those pages | S | medium |
| U-4 | Discord copy from site constants (fixes L-15) | Discord prompts | S | low |
