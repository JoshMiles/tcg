# Code review

Reviewed 2026-10-18 against `main` at `e79eb1d` (static reading of the auth, API, trading, collection, and hosting paths, plus the area docs and `ROADMAP.md`). A second pass the same day re-read the trade, backup, restore, Twitch, and sandbox paths and kept only the findings those lines support. This file reports issues. It does not change how the game behaves.

One critical issue: the legacy import puts `ADMIN_SECRET` in a URL, and that same secret is the key for a super-admin cookie that never expires. Other high findings are public collection dumps (including private profiles) and trade or restore paths that can desync prints from the escrow flag. Staff controls around server actions, draw tickets, cron, and the preview database fence are in good shape. Those are summarised at the end so the gaps are read against what already holds.

Shipped behaviour is what this review talks about. Open roadmap items (a single pack-create flow, daisyUI, Discord account linking, the next Twitch panel zip) are not treated as bugs for being absent.

## Critical

### 2. Legacy import is a GET that takes `ADMIN_SECRET` in the URL, and that secret mints the super-admin cookie

`app/api/admin/import-legacy/route.ts` lines 8-16: the handler is `GET`, and the secret is `searchParams.get('secret')`, compared with `sameString` against `process.env.ADMIN_SECRET`.

With `?overwrite=1` it replaces existing users' cards and writes the collection (`route.ts` lines 19 and 38-40). `/api/admin` is exempt from the closed-site gate (`lib/access-core.ts` line 77). The staff-guard check explicitly allows this route to skip `requireAdmin` (`scripts/check-staff-guards.mts` lines 88-89).

`adminCookieValue` (`lib/admin-token.ts` lines 23-29) is an HMAC of the fixed label `admin-auth:v1` under that same `ADMIN_SECRET`. `isValidAdminToken` (lines 33-36) accepts the result with no expiry. A valid cookie is the super admin (`lib/staff-guard.ts` lines 33-35). Anyone who can read the import URL can recompute the cookie. They do not need `ADMIN_PASSWORD`.

**Why it matters.** The master secret lands in access logs, browser history, and any `Referer` if the response is ever followed. A GET that writes data can be replayed from a log line or a link. Overwrite replaces live collection rows for every legacy login. The same leaked secret is a permanent super-admin session until `ADMIN_SECRET` is rotated (finding 3). The staff cookie, which the rest of `/api/admin/*` uses, is not consulted.

**Fix.** Remove the route if the one-time import has already run. If it must stay, make it `POST`, require `requireAdmin()`, and never read the secret from the query string. Drop the special case in `check-staff-guards.mts`. Rotate `ADMIN_SECRET` if this URL has ever been requested on production. Give the cookie an expiry (finding 3) so a copied value dies on its own.

## High

### 1. Anyone can download a whole season's collection, including private profiles

`GET /api/collection?name=<collectionName>` has no auth check and returns the raw map of login to pulls.

```12:16:app/api/collection/route.ts
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400 });
  return NextResponse.json(await getCollection(name));
}
```

The collection name is not a secret. `GET /api/seasons/active` returns the active season object, and a season includes `collectionName` (`lib/types.ts` line 18, `app/api/seasons/active/route.ts` lines 13-23). Both routes are on the closed-alpha allow list (`EXEMPT_API` in `lib/access-core.ts` line 77), so the dump stays available while the public site is locked.

A private profile is supposed to hide that person. `app/u/[username]/page.tsx` (around line 54) and the leaderboard, owner lists, and recent pulls all honour `UserSettings.privateProfile` (`lib/user-settings.ts` line 36) or the staff "hide from leaderboard" flag. This route does not. The response is every login and every encoded pull (card number and version), with no `Cache-Control`.

The overlay already sends `x-overlay-key` on same-origin fetches when the OBS URL has `?key=` (`public/widget.js` lines 30-41) and calls this GET to fill the on-stream collection (`public/widget.js` lines 478-481). The route ignores the header.

**Why it matters.** A viewer who turned on Private profile is still fully enumerable. During a closed alpha the same URL is a public copy of the game's ownership data. It is also a large unauthenticated read of the blob that every pull rewrites.

**Fix.** Require `isOverlayRequest` (key or staff) for this GET, which the overlay already satisfies once the key is in the OBS URL. If some response must stay public, strip logins that are private or staff-hidden, and send `Cache-Control: no-store`. Add a check that a private profile does not appear in the JSON.

### 7. A refunded offer can stay marked escrowed, and a missing season drops the prints

`lib/trades.ts` lines 121-126: when a refund is due, `persist` runs while `escrowed` is still true, then `returnToCollection` moves the prints, then `escrowed` is cleared.

The order is deliberate and documented (`docs/trading.md`, `lib/data-health.ts`). It avoids a double refund if the process dies between the two writes. The leftover of that crash is a closed offer whose cards are in neither collection until someone returns them by hand.

The flag is only cleared in memory. The caller's later `persist` (`lib/trades.ts` lines 140-143, two separate `kv.set` calls) is what writes `escrowed: false`. Several callers never get there:

- `createTrade` (lines 314-322) sweeps inside the lock, then `createInLock` returns on validation failure (lines 210-260) without another `persist`.
- `acceptTrade` (lines 340-358) uses `findOpen`, which persists only when the offer is already gone (lines 332-334). The early failures after that (own offer, wrong recipient, blocked, too new, missing season, frozen, bad prints) return without `persist`.

`sweepTrades` itself does persist (lines 153-159). A failed create or accept after a sweep does not. History then still says `escrowed: true` after the prints were returned. A later repair that refunds again would duplicate them.

`returnToCollection` (lines 97-99) returns immediately when `getSeason` is null, and `closeTrade` still sets `escrowed` false in memory. `deleteSeason` (`lib/kv.ts` lines 122-126) removes the season record and does not cancel offers (`app/admin/actions/seasons.ts` lines 66-68). The next sweep refunds nothing and clears the flag. The prints stay out of the collection.

`createInLock` (lines 302-307) refunds if `persist` throws. `persist` writes the open list first and history second. If the open-list write succeeded and the history write threw, the catch still refunds, so the new offer can sit on the open list with its prints already back in the collection.

**Why it matters.** A viewer reports missing cards, or Data health shows escrow that was already refunded. Granting replacements, or refunding a flag that lies, duplicates the prints. Deleting a season with an open offer drops the prints out of the collection on the next trade touch.

**Fix.** Keep the crash-safe order. After every sweep, persist before returning, including the failure paths in `createInLock` and `acceptTrade`. If the season is gone, leave `escrowed` true and do not pretend the refund happened. Cancel or refuse season delete while offers for that season are open. Add a staff action that returns the prints for one stuck offer idempotently (the same move the refund would have done, then clears `escrowed`), and alert when the count is non-zero rather than only painting a red row.

### 15. The panel collection route returns any viewer's cards, including draft seasons

`GET /api/twitch/collection` (`app/api/twitch/collection/route.ts` lines 8-31) takes a `username` query and no session, no extension JWT, and no overlay key. It loads `listSeasons()` (every season, drafts included: `lib/kv.ts` lines 69-72) and returns that viewer's `ownedNumbers` for each season they have cards in, plus the active season.

The released panel calls it that way (`public/twitch-panel/panel.js` around line 1041). Private profile is not consulted. `GET /api/collection` (finding 1) is the full map. This route is one viewer at a time, still with no check.

**Why it matters.** Anyone who can guess a login can read that viewer's card numbers across seasons the public site does not list (drafts) and across a private profile. The current panel zip cannot send a JWT until the next panel release, so a fix has to keep a response the released panel can still parse.

**Fix.** Drop draft seasons from this response. For a private profile, return the active season only when the caller is that viewer (extension JWT or site session). Keep the JSON shape the released panel already reads.

### 16. Trade holdings skip private profiles and return exact prints

`GET /api/trades/holdings` (`app/api/trades/holdings/route.ts` lines 15-36) checks the closed-site gate and then, with no session, returns `holdings`, the Looking for list, the serial pool, and print ids for any username in a non-draft season. The comment says this matches the public collection page. A private profile hides that page (`app/u/[username]/page.tsx` around line 54, and the setting text in `app/(site)/settings/SettingsForm.tsx`). This route does not read `privateProfile`.

**Why it matters.** While the site is open, a private profile's cards, wanted list, and print identities are still downloadable. Print ids are more specific than the public grid.

**Fix.** Require a viewer session, or apply the same private-profile rule as the profile page (the owner, and staff, may still load it). The trade composer can keep working for public profiles.

### 17. Restoring a viewer replaces cards without their print ids, and does not look at open trades

`restoreUserSnapshot` (`lib/user-admin.ts` lines 128-141) writes `data[name] = [...c.entries]` and `saveCollection` with no `moves` and no copy ids. `mergeUsers` just below refuses while either account has an open offer. Restore does not.

`saveCollection` then calls `syncAfterSave` (`lib/serials.ts` lines 230-257). Once the collection is numbered, `reconcileUser` (lines 216-224) mints and retires by count, not by copy id. A restore that changes counts mints new prints. Cards sitting in escrow are owned by `escrow:<tradeId>` (`lib/serials-core.ts` lines 42-43), so they are not in the viewer's ledger bucket. Putting the pre-trade entries back adds a second set while the offer still holds the first.

**Why it matters.** An admin restore can duplicate prints that are in an open offer, and the new prints get new edition numbers. The old identity is not put back.

**Fix.** Refuse the restore while that viewer has an open offer, the same check merge already uses. When the ledger is tracking, restore by copy id (move the saved prints back) instead of reconciling counts.

## Medium

### 3. The emergency admin cookie never expires on the server

`adminCookieValue` (`lib/admin-token.ts` lines 23-29) is an HMAC of the fixed label `admin-auth:v1` under `ADMIN_SECRET`. `isValidAdminToken` (lines 33-36) accepts that string forever. The 7-day `maxAge` in `lib/auth.ts` lines 10-18 is only a browser instruction. Password login is on unless `ADMIN_PASSWORD_LOGIN` is `off` (`lib/admin-token.ts` lines 9-12), and a valid cookie is treated as the super admin (`lib/staff-guard.ts` lines 33-35).

**Why it matters.** Anyone who copies the cookie value (a shared computer, a log, an XSS) can mint a new cookie and keep super-admin access until `ADMIN_SECRET` is rotated. There is no session id to revoke.

**Fix.** Put an expiry and a random id inside the signed payload, reject expired tokens in `isValidAdminToken`, and keep a server-side generation counter so rotating a "sign out everywhere" value kills old cookies. Prefer leaving `ADMIN_PASSWORD_LOGIN=off` once Twitch staff login is confirmed.

### 4. Password-login rate limit trusts the left-most `X-Forwarded-For`

```13:17:app/api/auth/login/route.ts
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  const failKey = `auth:login-fails:${ip}`;
  if ((Number(await kv.get(failKey)) || 0) >= MAX_FAILS) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }
```

On Vercel the platform appends the real client address. The first entry is whatever the caller sent. Ten failures per forged address (`MAX_FAILS` is 10, window 15 minutes, lines 7-8 and 21-23) does not bind to the real client. `sameString` is constant time, which is good. The cap is not.

**Why it matters.** The emergency password can be guessed without the cap holding, and finding 3 combines with that into a non-expiring super-admin cookie.

**Fix.** Rate-limit on the right-most forwarded address Vercel appends, or on `x-real-ip` only, and keep a global failure budget as well as a per-address one.

### 5. Outgoing webhooks do not resolve DNS before the server calls them

`checkWebhookUrl` / `isPrivateHost` (`lib/webhook-clean.ts` lines 8-28) reject localhost, link-local, and private literals, and the comment says DNS names are not resolved. `fireOutgoing` (`lib/webhooks.ts` lines 83-99) then `fetch`es that URL. `http://` is allowed. Only an admin can save the URL.

**Why it matters.** A hostname that looks public can resolve to a cloud metadata address or an internal service. An admin session that is already compromised, or a webhook URL an admin pasted from a bad source, becomes a server-side request. Metadata credentials are the usual target.

**Fix.** Resolve the host and re-check every answer (and refuse redirects that change host). Prefer `https` only. This is defence in depth: an admin can already do a lot, but they should not be able to make the server call the metadata IP.

### 6. Incoming webhooks accept any username and are not rate limited

`parseIncomingWebhook` (`lib/webhooks.ts` lines 115-126) checks the shared secret and then keeps any non-empty string as the username. `POST /api/webhooks/pull` (`app/api/webhooks/pull/route.ts` lines 9-39) rolls a real pull for that string. `POST /api/webhooks/grant-card` (`app/api/webhooks/grant-card/route.ts` lines 10-31) adds a chosen card. Nothing checks the Twitch login shape used everywhere else (`/^[a-z0-9_]{3,25}$/` in `lib/staff-core.ts`).

**Why it matters.** The secret is the real control, and it has to live in the chat bot. If it leaks, the caller can mint unlimited pulls and grants, and can create collection keys that are not Twitch logins (including awkward keys such as `__proto__`). Paid pulls are capped when Mix It Up is on. Free pulls are not.

**Fix.** Reject usernames that fail the Twitch login pattern before any write. Add a per-username and per-secret budget on pull and grant. Rotate the incoming secret from Settings if it has ever been pasted into a log.

### 8. Every request inside a sandbox is treated as the overlay

`lib/overlay-key.ts` lines 38-46: `isOverlayRequest` returns true when the overlay key matches, when `inSandbox()` is true, or when the caller is an admin. The sandbox branch does not look at the key.

`inSandbox()` is true for any non-null sandbox id, including the dead namespace (`lib/db.ts` lines 50-68). On production, `currentSandboxId` also trusts the `x-tcg-sandbox` header when the id matches a real sandbox. Keys are prefixed `sbx:<id>:`, so that header does not write production data. It does make `isOverlayRequest` true with no overlay key. Preview deployments are forced into `sbx:preview:` (`lib/db.ts` lines 16-19 and 51-52) and are documented as Vercel-SSO protected (`docs/hosting.md`). The code itself does not check that.

**Why it matters.** Queue dequeue (`app/api/webhooks/queue/route.ts`), heartbeats, and anything else behind `isOverlayRequest` succeed with no key on a preview, and on production for anyone who knows a live sandbox id. If SSO is ever off, that preview's queue and sandbox data are open. Production keys stay prefixed.

**Fix.** On preview, still require the overlay key or a staff session. Keep the sandbox shortcut only for the explicit sandbox cookie a staff member set.

**Status.** Fixed (ROADMAP 45.1): `isOverlayRequest` has no sandbox branch, so the overlay always needs its key (each sandbox has its own) or a staff session, and sandbox entry is a signed token.

### 9. A season collection is one JSON value, rewritten in full

`getCollection` / `saveCollection` (`lib/kv.ts` lines 277-289) store `tcg_<name>` as a single value. `withCollectionLock` (lines 292-298) exists because two serverless calls would otherwise clobber each other. `getAllCollectionUsers` (lines 236-241) loads every season's blob to build the user list. Data health warns around 512 KB and 2 MB (`docs/hosting.md`). A per-viewer layout is not built. It is still an open capacity question, not a finished redesign.

**Why it matters.** Latency and clash risk grow with the number of prints, and a hot pull locks the whole season. This is the scaling limit to watch, not a logic bug.

**Fix.** Keep the lock. When Data health stays amber, plan the split from measured sizes. Do not do it as a drive-by.

### 18. A collection lock can be stolen when the 10 second TTL expires

`withLock` (`lib/kv.ts` lines 306-320) is `SET NX EX 10`. Release is a `GET`, then a `DEL` only if the token matches. The comment says locks are never held across slow work. The check and the delete are still two commands. If the TTL expires after the `GET` sees this holder's token, another invocation can take the lock, and the first holder's `DEL` removes the new token.

**Why it matters.** Two pulls or two trades can then both believe they hold the lock and overwrite the same JSON value (finding 9) or the trade lists. The window is short. It is real if a save or a refund runs past 10 seconds.

**Fix.** Release with a compare-and-delete (a Lua script or `GETDEL` plus a check that the value was still this token). Refresh the TTL only if the work can legitimately run long, and keep the "never hold a lock across slow I/O" rule.

**Status.** Fixed (ROADMAP 46.1): `withLock` releases with one `EVAL` that deletes the key only if it still holds this holder's token (`lib/kv.ts`), `lib/db.ts` namespaces the script's key list in a sandbox, and `scripts/check-lock-release.mts` reproduces the takeover in the middle of a release.

### 19. Leaving a sandbox follows `/\` off the site

`POST /api/sandbox/exit` (`app/api/sandbox/exit/route.ts` lines 9-14) is public. It keeps any `to` that starts with `/` and does not start with `//`, then `NextResponse.redirect(new URL(target, req.url))`. `safeReturnTo` (`lib/twitch-oauth.ts` line 94) also rejects `/\`. This route does not.

In Node, `new URL('/\\evil.com', 'https://cheesytcg.app/api/sandbox/exit')` is `https://evil.com/`. The handler also deletes the sandbox cookie and the viewer session cookie.

**Why it matters.** A page on another site can POST the viewer here and send the browser to an address the site does not own, after clearing the session. `//evil.com` is already rejected.

**Fix.** Use `safeReturnTo` (or the same `/\` check) before building the redirect.

### 20. Extension auth accepts any bearer when the extension secret is unset

`extensionViewer` (`lib/twitch-viewer.ts` lines 11-18): if `verifyExtensionAuth` fails and `TWITCH_EXTENSION_SECRET` is unset, any bearer token is treated as the dev opaque id `dev_mock_opaque`. The comment says that is dev mode. There is no check that the deployment is local.

**Why it matters.** A production deploy that forgot the secret maps every extension caller who sends some bearer onto one shared dev user, or onto whoever that opaque id was linked to. Routes that use `extensionViewer` then act as that user.

**Fix.** Treat a missing secret as "not configured": return 401 in production. Keep the dev opaque id only when a local or sandbox flag is set.

### 21. Opaque-id and Helix lookups are unauthenticated

`GET /api/twitch/user` (`app/api/twitch/user/route.ts` lines 6-13) returns the username linked to any `opaqueId`. The released panel calls it with the viewer's own id (`public/twitch-panel/panel.js` around line 1183) and sends no proof.

`GET /api/twitch/resolve-username` (`app/api/twitch/resolve-username/route.ts` lines 6-20) takes a numeric Twitch user id and calls Helix `resolveTwitchLogin`. No session.

**Why it matters.** The first route turns an opaque id into a login. The second spends the site's Helix quota and reveals a login for any numeric id. Neither is on a staff check.

**Fix.** Require the extension JWT (or a staff session) before either lookup. Cache Helix answers so a loop cannot burn the quota.

### 22. A same-day backup is deleted before the new file is stored

`runBackup` (`lib/backup.ts` lines 135-138) deletes the existing blob for that day's name, then `put`s the new one. The comment says a second run the same day replaces the first.

**Why it matters.** If `put` throws, that day's backup is already gone. The older days are still there until the retention delete, which runs only after a successful `put`.

**Fix.** `put` the new bytes first (a temp name, or overwrite in one call), and delete the previous object only after the new one is stored.

### 23. A failed watch-index rebuild is marked ready

`ensureIndex` (`lib/watch-index.ts` lines 26-30) returns early when `watch:idx:ready` is set. Otherwise it loads every collection user, and a failed load becomes `[]` (`.catch(() => [])`). It then `kv.set(READY, Date.now())` even when that list was empty because the read failed. `syncWatchIndex` swallows its own errors (lines 17-23).

**Why it matters.** Listing alerts and wanted counts then stay empty until someone deletes the ready key. Viewers who asked to hear about a card do not.

**Fix.** Set the ready key only after a scan that did not throw. If the scan throws, leave the key unset so the next lookup tries again.

**Status.** Fixed (ROADMAP 46.2): `ensureIndex` lets a failed viewer-list read, settings read or index write throw (using the throwing `loadUserSettings`), so `watch:idx:ready` stays unset and the next lookup rebuilds; `syncWatchIndex` still never throws for saves.

### 24. A paid print is saved before Mix It Up confirms the charge

`POST /api/collection` (`app/api/collection/route.ts` lines 47-66) claims the paid ticket, appends the print, then `chargePaidPull`. On a failed charge it calls `revokePrint`. `claimDraw` (`lib/draw.ts` lines 76-79) is get-then-delete and the second delete returns 0, so two saves cannot both claim one ticket.

`revokePrint` (`lib/mixitup.ts` lines 175-188) returns null, and does not remove the collection entry, when the ledger copy is not owned by that viewer. A crash after the append and before the revoke leaves the print in place with no charge.

**Why it matters.** A paid pull can become a free print when the charge call fails halfway, or when the revoke bails out. The ticket itself cannot be replayed.

**Fix.** Charge first, or write the print only after `charge.applied`. If revoke cannot see the copy, still remove one matching entry under the collection lock.

**Status.** Fixed (ROADMAP 46.3): the route charges Mix It Up before the print is written, so an unconfirmed charge saves nothing, and a print that cannot be saved after a confirmed charge is refunded (`refundPaidPull`). `revokePrint` is gone. The deduct message no longer carries the edition number, which does not exist yet.

## Low

### 10. Admin upload trusts the browser's file name and MIME type

`app/api/upload/route.ts` lines 11-30: `isAuthenticated()` is required, then `file.type` is checked against an allow list and `put(file.name, file, { access: 'public' })` uses the client-supplied name. GIFs go through the optimiser. Other types do not get a magic-byte check.

**Why it matters.** An admin (or a stolen admin session) can store a public blob under a misleading name and content type. The file is on the blob host, not as HTML on `cheesytcg.app`, so this is not a site XSS by itself. It is still a messy public bucket.

**Fix.** Ignore `file.name`. Write a generated pathname and sniff the bytes.

### 11. `POST /api/seed` can still mutate Season 1

`app/api/seed/route.ts` lines 5-10 require an admin, then `seedSeason1` (`lib/kv.ts` lines 368-392) creates the starter season and pack when missing, backfills sounds, and reattaches `pack1` to `season1` if the pack id fell off the list. It is idempotent for existing cards. It is still a live admin URL with no confirmation screen.

**Fix.** Remove it from production routing, or hide it behind the same explicit confirm the danger-zone buttons use.

### 12. Secret compares return early when the lengths differ

`sameString` (`lib/admin-token.ts` lines 15-20) and `sameSecret` (`lib/webhooks.ts` lines 109-112) bail out when the byte lengths differ, then use a constant-time compare. Length is a small leak. The contents are not.

**Fix.** Hash both sides, or compare against a MAC of a fixed label, so the lengths that hit `timingSafeEqual` always match.

### 13. One signing secret covers viewer sessions and staff cookies

`SESSION_SECRET` signs `tcg_session` (`lib/session.ts`) and `tcg_staff` (`lib/staff-token.ts` lines 6-7 and 24-27). A leaked secret forges a viewer session for any login whose Twitch id you know. A forged staff cookie is still re-checked against the live staff list (`lib/staff-guard.ts` lines 26-31), so it only works for someone who really is staff.

**Fix.** Use a separate key for the staff cookie. Rotating the viewer secret would then not be tied to staff sessions, and the other way around.

**Status.** Fixed (ROADMAP 47.6): `lib/signing.ts` derives one HMAC key per purpose from `SESSION_SECRET` with a label (viewer session, staff cookie, access cookie, sandbox entry, fake Twitch token), so a value signed for one purpose, or with the bare secret, is refused by the others. The emergency password and the signature compares in `lib/staff-token.ts`, `lib/access-token.ts` and `lib/admin-token.ts` go through one `safeEqual` that hashes both sides first, so length does not leak either. `scripts/check-signing-keys.mts` covers it. Everyone signs in again once.

### 14. Replacing a collection does not check the body's shape

`POST /api/collection` without `pull` (`app/api/collection/route.ts` lines 24-29) requires an admin and then `saveCollection(target, data)` for any object. A mistaken client can write a value the ledger sync does not understand. This is admin-only.

**Fix.** Accept only `Record<string, number[]>` with logins that match the Twitch pattern, and reject anything else before the lock.

### 25. A failed email-cap expiry can lock confirmation for good

`startEmail` (`lib/email.ts` lines 119-122) increments `email:cfm:<user>:day` and, on the first hit, sets a one-day TTL. The `expire` error is swallowed (`.catch(() => 0)`). The next lines still refuse once the counter is over 5.

**Why it matters.** If `expire` fails, the counter never resets. That viewer cannot ask for another confirmation email until someone deletes the key.

**Fix.** If `expire` fails, delete the counter (or do not count that attempt) and return the same "try again later" error. Do not leave a counter with no TTL.

### 26. Wiping a collection leaves escrow ledger hashes behind

`deleteCollection` (`lib/kv.ts` lines 345-350) lists the usernames in the collection blob and passes those to `dropLedger` (`lib/serials.ts` lines 328-332). Escrow owners are `escrow:<tradeId>` (`lib/serials-core.ts` lines 42-43), not collection usernames, so those hashes are not in the delete list. `resetAllUsers` (`app/admin/actions/users.ts` lines 100-103) and `DELETE /api/collection` without a username (`app/api/collection/route.ts` lines 115-117) both call this.

**Why it matters.** After an everyone-reset, print records for cards that were in an open offer can remain. They are orphan ledger rows, not a public dump.

**Fix.** Include escrow owner keys (or every owner hash for that collection) in `dropLedger` before the collection blob is removed. Refuse the reset while offers in that season are still open.

## Dependency health

Production dependencies are few and current for this stack: Next 15.3, React 19, `@vercel/kv`, `@vercel/blob` 2.x, `sharp`, `web-push`. `docs/hosting.md` records the Blob 2.x move as the thing that cleared the earlier `undici` / `@fastify/busboy` advisories.

At review time, `ROADMAP.md` tracked a dev-only Dependabot advisory in `braces`, pulled in by Tailwind 3. There was no patched release on that line. Roadmap 24.0 (this branch) is the Tailwind 4 move that drops it. Do not treat a green `npm audit` as optional, and do not `npm audit fix --force`.

`npm audit` on the review branch (after `npm ci`, still on Tailwind 3.4) reported 5 high advisories and nothing critical, moderate, or low. All five were the same `braces` stack-exhaustion issue, reached only through the dev dependency `tailwindcss` 3.4 (`chokidar`, `fast-glob`, `micromatch`, `braces`). It did not ship in the production server bundle. After 24.0, `@tailwindcss/cli` stays out of the lockfile for the same reason, and `npm audit` is clean.

`@vercel/kv@3.0.0` prints a deprecation notice on install (Vercel KV stores now show up as Upstash). The app still imports it. That is a maintenance note, not an advisory. Do not swap the client in a drive-by.

## Tests

Coverage of game rules is strong for a Next app. `npm run check` runs every `scripts/check-*.mts` against a fresh mock KV: trades (including races and reversal), serials, staff roles, a source audit that every admin action calls `requireAdmin` or `requireStaff`, webhooks, email, backups, access gate, and others. `npm run verify` is typecheck plus those checks plus a syntax check of `public/widget.js`.

What those checks do not cover, and where the findings above live:

- No check asserts that `GET /api/collection`, `GET /api/twitch/collection`, or `GET /api/trades/holdings` hides a private profile.
- `check-staff-guards.mts` blesses the legacy import's query-string secret instead of failing it.
- Trade checks cover races and reversal. They do not cover a sweep followed by a failed accept, or a refund after the season record is gone.
- There is no browser suite. `docs/review.md` sweeps are manual. Overlay frame rate and the panel inside Twitch cannot be checked here.

A useful next check is a small mock-KV script for findings 1, 2, 7, and 16, once those paths change. This review does not add that behaviour.

## Maintainability

Worth knowing, not worth a rewrite in this pass:

- The staff-guard source audit is the right idea and is why a missing `requireAdmin()` does not slip in quietly. The import-legacy exception is the hole in that net.
- `public/widget.js` and `OverlayEditor.tsx` are still very large. Roadmap 23.2 says the editor split needs a design before more files are torn apart. Leave it until that design exists.
- Admin pages, server actions, and `/api/admin/*` generally fail closed. Viewer mutations go through the session (`requireViewer`), not a username in the body. Draw tickets mean a caller cannot choose the card a pull saves (`lib/draw.ts` `claimDraw`: a second delete returns 0, so the ticket is single use). The paid path still grants before the charge is confirmed (finding 24). Cron routes refuse a missing or short `CRON_SECRET` (`app/api/cron/backup/route.ts` lines 12-17). `safeReturnTo` and `staffReturnTo` reject protocol-relative redirects, including `/\` (`lib/twitch-oauth.ts` lines 92-96, `lib/staff-core.ts` lines 82-86). Sandbox exit does not use that helper (finding 19). Preview deployments cannot write outside `sbx:preview:` (`lib/db.ts`).

## What this review did not do

No production KV, no live secrets, no exploit scripts. Line numbers refer to `main` at the commit above, plus this branch where a line was re-read. If a later change moves a function, search the symbol rather than trusting the line.

Checked and left out: `claimDraw` is not a double-claim (the second delete loses). A dead sandbox id does not fall through to production keys. `syncAfterSave` swallows ledger errors on purpose so a pull still saves. Those are not extra findings.
