# Code review

Reviewed 2026-10-18 against `main` at `e79eb1d` (static reading of the auth, API, trading, collection, and hosting paths, plus the area docs and `ROADMAP.md`). This file reports issues. It does not change how the game behaves.

No critical issue was verified. The two high findings are a public dump of every viewer's collection (including people who set a private profile) and a state-changing admin import that puts `ADMIN_SECRET` in the query string. Staff controls around server actions, draw tickets, cron, and the preview database fence are in good shape. Those are summarised at the end so the gaps are read against what already holds.

Shipped behaviour is what this review talks about. Open roadmap items (a single pack-create flow, daisyUI, Discord account linking, the next Twitch panel zip) are not treated as bugs for being absent.

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

### 2. Legacy import is a GET that takes `ADMIN_SECRET` in the URL and can overwrite a collection

`app/api/admin/import-legacy/route.ts` lines 8-16: the handler is `GET`, and the secret is `searchParams.get('secret')`, compared with `sameString` against `process.env.ADMIN_SECRET`.

With `?overwrite=1` it replaces existing users' cards and writes the collection (`route.ts` lines 19 and 38-40). `/api/admin` is exempt from the closed-site gate (`lib/access-core.ts` line 77). The staff-guard check explicitly allows this route to skip `requireAdmin` (`scripts/check-staff-guards.mts` lines 88-89).

**Why it matters.** The master secret lands in access logs, browser history, and any `Referer` if the response is ever followed. A GET that writes data can be replayed from a log line or a link. Overwrite replaces live collection rows for every legacy login. The staff cookie, which the rest of `/api/admin/*` uses, is not consulted.

**Fix.** Remove the route if the one-time import has already run. If it must stay, make it `POST`, require `requireAdmin()`, and never read the secret from the query string. Drop the special case in `check-staff-guards.mts`.

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

### 7. A crash between saving a trade and moving its cards leaves prints in escrow

`lib/trades.ts` lines 121-126: when a refund is due, `persist` runs while `escrowed` is still true, then `returnToCollection` moves the prints, then `escrowed` is cleared.

The order is deliberate and documented (`docs/trading.md`, `lib/data-health.ts`). It avoids a double refund. The leftover is a closed offer whose cards are in neither collection until someone returns them by hand. Accept has the same window.

**Why it matters.** A viewer reports missing cards. Granting replacements on top of a stuck refund duplicates the prints. Data health shows the offer. Nothing repairs it.

**Fix.** Keep the order. Add a staff action that returns the prints for one stuck offer idempotently (the same move the refund would have done, then clears `escrowed`), and alert when the count is non-zero rather than only painting a red row.

### 8. Every request inside a sandbox is treated as the overlay

`lib/overlay-key.ts` lines 38-46: `isOverlayRequest` returns true when the overlay key matches, when `inSandbox()` is true, or when the caller is an admin. The sandbox branch does not look at the key.

`inSandbox()` is true for the whole preview deployment (`lib/db.ts` lines 16-19 and 67-68), not only for a staff member who entered a sandbox. Preview URLs are documented as Vercel-SSO protected (`docs/hosting.md`). The code itself does not check that.

**Why it matters.** Queue dequeue (`app/api/webhooks/queue/route.ts`), heartbeats, and anything else behind `isOverlayRequest` succeed with no key on a preview. If SSO is ever off, that preview's queue and sandbox data are open. Production is unaffected.

**Fix.** On preview, still require the overlay key or a staff session. Keep the sandbox shortcut only for the explicit sandbox cookie a staff member set.

### 9. A season collection is one JSON value, rewritten in full

`getCollection` / `saveCollection` (`lib/kv.ts` lines 277-289) store `tcg_<name>` as a single value. `withCollectionLock` (lines 292-298) exists because two serverless calls would otherwise clobber each other. `getAllCollectionUsers` (lines 236-241) loads every season's blob to build the user list. Data health warns around 512 KB and 2 MB (`docs/hosting.md`). A per-viewer layout is not built. It is still an open capacity question, not a finished redesign.

**Why it matters.** Latency and clash risk grow with the number of prints, and a hot pull locks the whole season. This is the scaling limit to watch, not a logic bug.

**Fix.** Keep the lock. When Data health stays amber, plan the split from measured sizes. Do not do it as a drive-by.

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

### 14. Replacing a collection does not check the body's shape

`POST /api/collection` without `pull` (`app/api/collection/route.ts` lines 24-29) requires an admin and then `saveCollection(target, data)` for any object. A mistaken client can write a value the ledger sync does not understand. This is admin-only.

**Fix.** Accept only `Record<string, number[]>` with logins that match the Twitch pattern, and reject anything else before the lock.

## Dependency health

Production dependencies are few and current for this stack: Next 15.3, React 19, `@vercel/kv`, `@vercel/blob` 2.x, `sharp`, `web-push`. `docs/hosting.md` records the Blob 2.x move as the thing that cleared the earlier `undici` / `@fastify/busboy` advisories.

`ROADMAP.md` already tracks a dev-only Dependabot advisory in `braces`, pulled in by Tailwind 3. There is no patched release on that line. The planned Tailwind 4 move (roadmap 24.0, not done) is what drops it. Do not treat a green `npm audit` as optional after that move, but do not bump Tailwind to clear it in a drive-by: the roadmap says the v4 bump fails the build until 24.0 is done on purpose.

`npm audit` on this branch (after `npm ci`) reported 5 high advisories and nothing critical, moderate, or low. All five are the same `braces` stack-exhaustion issue, reached only through the dev dependency `tailwindcss` 3.4 (`chokidar`, `fast-glob`, `micromatch`, `braces`). It does not ship in the production server bundle. `npm audit fix` cannot bump those ranges to a patched release. Roadmap 24.0 (Tailwind 4, not started) is the planned way off that line. Do not `npm audit fix --force`.

`@vercel/kv@3.0.0` prints a deprecation notice on install (Vercel KV stores now show up as Upstash). The app still imports it. That is a maintenance note, not an advisory. Do not swap the client in a drive-by.

## Tests

Coverage of game rules is strong for a Next app. `npm run check` runs every `scripts/check-*.mts` against a fresh mock KV: trades (including races and reversal), serials, staff roles, a source audit that every admin action calls `requireAdmin` or `requireStaff`, webhooks, email, backups, access gate, and others. `npm run verify` is typecheck plus those checks plus a syntax check of `public/widget.js`.

What those checks do not cover, and where the findings above live:

- No check asserts that `GET /api/collection` hides a private profile or demands the overlay key.
- `check-staff-guards.mts` blesses the legacy import's query-string secret instead of failing it.
- There is no browser suite. `docs/review.md` sweeps are manual. Overlay frame rate and the panel inside Twitch cannot be checked here.

A useful next check is a small mock-KV script for findings 1 and 2's replacements, once those routes change. This review does not add that behaviour.

## Maintainability

Worth knowing, not worth a rewrite in this pass:

- The staff-guard source audit is the right idea and is why a missing `requireAdmin()` does not slip in quietly. The import-legacy exception is the hole in that net.
- `public/widget.js` and `OverlayEditor.tsx` are still very large. Roadmap 23.2 says the editor split needs a design before more files are torn apart. Leave it until that design exists.
- Admin pages, server actions, and `/api/admin/*` generally fail closed. Viewer mutations go through the session (`requireViewer`), not a username in the body. Draw tickets mean a caller cannot choose the card a pull saves (`lib/draw.ts` `claimDraw`, `app/api/collection/route.ts` lines 21-34). Cron routes refuse a missing or short `CRON_SECRET` (`app/api/cron/backup/route.ts` lines 12-17). `safeReturnTo` and `staffReturnTo` reject protocol-relative redirects (`lib/twitch-oauth.ts` lines 92-96, `lib/staff-core.ts` lines 82-86). Preview deployments cannot write outside `sbx:preview:` (`lib/db.ts`).

## What this review did not do

No production KV, no live secrets, no exploit scripts. Line numbers refer to `main` at the commit above. If a later change moves a function, search the symbol rather than trusting the line.
