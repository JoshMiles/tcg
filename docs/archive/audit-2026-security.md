# Security review, 2026 (ROADMAP 44.5)

> Archive. Read it when you pick up a security fix or need to know why one was asked for. The live list of open work is `ROADMAP.md`.

## Intro

- **Commit audited:** `e909170` on `main` (2026-10-26).
- **Method:** read-only code review. Every `app/**/route.ts` and every `'use server'` file was read for its guard; the sign-in, cookie, extension JWT, sandbox, webhook, draw ticket, trade lock and upload paths were read end to end. `npm audit --omit=dev` and `npm audit` were run (both: 0 vulnerabilities). Git history (all refs, about 960 commits) was searched for committed `.env` files, key files and common token shapes (GitHub, Anthropic, Slack, AWS, Stripe, Vercel Blob, Discord webhook URLs, `*_SECRET=` and `*_PASSWORD=` assignments): only documented test placeholders were found. `.env.local` and `SECRETS.md` are ignored by `.gitignore` and neither is tracked.
- **Not checked:** nothing was run (no dev server, mock KV, browser or Playwright sweep), so the runtime half of the mod access test (`npm run review:mod`) was not run; its static half (`scripts/check-staff-guards.mts`) was read. Not checked at all: Vercel, KV and Twitch console settings (listed under "Settings for Josh"), real response headers on production, Discord and push delivery, and Blob store contents.
- **Held findings:** two (S-1, S-2), raised to high in Opus review and held privately in SECRETS.md until fixed.

## docs/CODE_REVIEW.md security status

CODE_REVIEW.md was written at `e79eb1d` (2026-10-18). Only its security findings are judged here; the data integrity ones (#7, #9, #17, #18, #22, #23, #25, #26) belong to the data audits and were not re-checked.

| # | Was | Title (short) | Now | Notes |
|---|-----|---------------|-----|-------|
| 2 | critical | Legacy import GET with the admin secret in the URL | Fixed | GET answers 405; POST needs `isAuthenticated()`. |
| 1 | high | Anyone can download a whole season's collection | Fixed | `/api/collection` GET needs `isOverlayRequest`; see S-1 for the sandbox gap in that check. |
| 15 | high | Panel collection returns any viewer's cards and drafts | Fixed | Private profiles and draft seasons are refused. |
| 16 | high | Trade holdings skip private profiles | Fixed | `mayReadHoldings` plus the closed-site gate. |
| 3 | medium | Emergency admin cookie never expires | Fixed | Cookie carries `exp`, `iat` and a KV generation that sign-out bumps. |
| 4 | medium | Login rate limit trusts left-most `X-Forwarded-For` | Still open, narrower | Vercel overwrites the header, so the spoof is gone; what remains is held as S-2. |
| 5 | medium | Outgoing webhooks do not resolve DNS | Still open | Rated low now (L-2): only admins set the URL. |
| 6 | medium | Incoming webhooks accept any username, no rate limit | Still open | M-6. |
| 8 | medium | Every sandbox request is treated as the overlay | Still open, wider | Wider than first reported; held as S-1. |
| 19 | medium | Leaving a sandbox follows `/\` off the site | Still open | Rated low (L-1). One-line fix available. |
| 20 | medium | Extension auth accepts any bearer when the secret is unset | Still open | M-3. |
| 21 | medium | Opaque-id and Helix lookups are unauthenticated | Still open | M-7. `resolve-username` has no caller left. |
| 24 | medium | A paid print is saved before the charge is confirmed | Still open | M-8. |
| 10 | low | Admin upload trusts the browser's file name and type | Still open | L-10. |
| 11 | low | `POST /api/seed` can still change Season 1 | Still open | L-12, admin only. |
| 12 | low | Secret compares return early on length | Still open | L-8. |
| 13 | low | One signing secret for sessions and staff cookies | Still open | L-9. Token shapes stop cross-use today. |
| 14 | low | Replacing a collection does not check the body | Still open | L-11, admin only. |

## Access-control inventory

Guards, in the words the code uses: `requireAdmin` = staff with the admin capability (Twitch staff cookie or emergency cookie); `requireStaff('mod')` = mod or above; `isAuthenticated` = `hasStaffCapability('admin')`; `requireViewer` = same-origin check plus viewer session; `getSession` = viewer session; `extensionViewer` / `verifyExtensionAuth` = Twitch extension JWT; `isOverlayRequest` = overlay key header, or any sandbox, or admin; `parseIncomingWebhook` / `incomingSecretValid` = shared webhook secret in the body; `cronAuthorised` = `Bearer CRON_SECRET`.

### Route handlers

| Route | Guard | Verdict |
|-------|-------|---------|
| `api/account/deletion` | `requireViewer` + captcha + typed confirm | OK |
| `api/account/discord`, `export`, `push`, `settings`, `share`, `upgrade` | `getSession` | OK (export is `no-store`) |
| `api/admin/activity`, `card-frames` | `hasStaffCapability` | OK (activity is the one admin route a mod may read) |
| `api/admin/import-legacy`, `overlay-status`, `palette`, `swatches` | `isAuthenticated` | OK |
| `api/admin/sandbox/ext-token` | `requireAdmin`, refused on previews | OK |
| `api/auth/login` | password + per-IP fail counter | See S-2 |
| `api/auth/logout` | none (clears cookies, bumps the admin generation) | OK, harmless |
| `api/cards/[number]/owners`, `recent-pulls`, `search`, `seasons/active`, `live`, `version`, `overlay/config` | none (public read) | OK, admin-hidden users left out |
| `api/collection` GET | `isOverlayRequest` | See S-1 |
| `api/collection` POST (save) / DELETE | `isAuthenticated` | OK (L-11) |
| `api/collection` POST (pull) | single-use draw ticket bound to the viewer | OK, ticket claim is atomic |
| `api/cron/*` | `cronAuthorised` | OK |
| `api/feedback`, `feedback/report` | `requireViewer` + daily caps | OK |
| `api/notifications` | `getSession` | OK |
| `api/overlay/heartbeat`, `webhooks/notify`, `webhooks/queue` | `isOverlayRequest` | See S-1 |
| `api/sandbox/exit` | none | See L-1 |
| `api/seed` | `isAuthenticated` | OK (L-12) |
| `api/trades`, `trades/[id]` | `requireViewer` | OK, trades lock before collections |
| `api/trades/holdings` | session or staff + `mayReadHoldings` | OK |
| `api/twitch/collection` | optional extension JWT or session; private check | See L-6 |
| `api/twitch/favourite`, `trades`, `trainer`, `want` | `extensionViewer` | See M-3 |
| `api/twitch/login` | `verifyExtensionAuth`, needs `user_id` | See M-1 |
| `api/twitch/me`, `unlink`, `upgrade` | `verifyExtensionAuth` with a dev fallback | See M-3 |
| `api/twitch/leaderboard`, `season` | none (public read, drafts refused) | OK |
| `api/twitch/user`, `resolve-username` | none | See M-7 |
| `api/upload`, `upload/optimize`, `upload/token` | `isAuthenticated` | OK (L-10) |
| `api/webhooks/collection`, `command`, `grant-card`, `pull`, `show-card` | `parseIncomingWebhook` | See M-6 |
| `api/webhooks/stream` | `incomingSecretValid` | OK |
| `auth/twitch`, `auth/twitch/callback` | OAuth `state` cookie, constant-time compare | See M-1 |
| `auth/discord`, `auth/discord/callback` | `getSession` + OAuth `state` | OK, one Discord account per profile |
| `auth/staff` | `getSession` + live staff record bound to Twitch ID | OK, sandbox sessions refused |
| `auth/access` | `getSession` + tester/staff list | OK, `returnTo` through `safeReturnTo` |
| `auth/logout` | POST + same-origin | OK |

### Server actions

| Actions | Guard | Verdict |
|---------|-------|---------|
| Every export under `app/admin/**` | `requireAdmin` (sandbox actions through `admin()` / `guarded()`, staff actions through `actor`) | OK |
| The documented mod set: `saveTagsAction`, `saveFlagsAction`, `cancelUserTradeAction`, `blockViewerTradingAction`, `cancelOneTradeAction`, `reverseTradeAction`, `updateFeedbackAction` | `requireStaff('mod')` (deletion requests need admin) | OK, `check-staff-guards` pins the set |
| `app/(entity)/copy/actions.ts`, `app/(site)/cards/actions.ts`, `app/u/[username]/actions.ts` | `getSession` | OK |
| Inline actions in `app/(site)/page.tsx` and `NotFoundBody.tsx` | none (redirect to a slugged path) | OK |

**Mod access test:** the static half (`scripts/check-staff-guards.mts`) fails on any admin action, viewer action or `/api/admin` route without a caller check and pins the mod set. It does not cover routes outside `/api/admin` (see proposal C-1). The runtime half was not run.

## Findings

Two high findings are held privately (S-1, S-2). No critical findings.

### Medium

**M-1. Viewer profiles are not tied to a Twitch account ID**
- Category: Sign-in and sessions.
- Where: `app/auth/twitch/callback/route.ts:45-51`, `lib/kv.ts:227-235`, `app/api/twitch/login/route.ts:25,39`.
- Evidence: sign-in keys the profile on the Twitch login. `ensureUserProfile` only fills a missing `twitchId` and never compares it, and the session is signed for the login. Twitch frees renamed logins after a while, so whoever later registers a former player's old login signs in to that player's old profile, collection and trades. Staff records already refuse this (`resolveRole` checks the bound ID).
- Fix: on sign-in, if the stored `twitchId` differs from the one Twitch returned, refuse the sign-in (or move the old profile aside) instead of signing a session.
- Size: M.

**S-1 (high, access control): held privately, see SECRETS.md** (sandboxes and the overlay key; same issue as the 44.2 held finding).

**M-3. Extension routes act as a shared dev viewer when `TWITCH_EXTENSION_SECRET` is unset**
- Category: Twitch extension.
- Where: `lib/twitch-viewer.ts:15-17`, `app/api/twitch/me/route.ts:27-29`, `app/api/twitch/upgrade/route.ts:17-20`, `app/api/twitch/unlink/route.ts:11-17`.
- Evidence: with no secret every token fails, `devMode` turns on, and the request runs as `dev_mock_opaque` with no token at all. Safe only while the production secret is set.
- Fix: also require a non-production build (`process.env.VERCEL_ENV !== 'production'`) before `devMode` can be true, and answer 503 in production when the secret is missing.
- Size: S.

**M-4. No security headers**
- Category: Platform.
- Where: `next.config.ts:48-64`, `middleware.ts`.
- Evidence: the only headers set are cache rules. There is no `Content-Security-Policy` or `frame-ancestors`, no `X-Frame-Options`, no `X-Content-Type-Options` and no `Referrer-Policy`, so admin, mod and account pages can be framed by any site.
- Fix: add a `/:path*` header rule with `X-Frame-Options: DENY` (or `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`, and start a CSP in report-only mode (proposal X-1).
- Size: S.

**S-2 (high, abuse): held privately, see SECRETS.md** (emergency password login).

**M-6. Incoming webhooks accept any username and any card number, with no rate limit**
- Category: Input and output.
- Where: `lib/webhooks.ts:121-131`, `app/api/webhooks/grant-card/route.ts`.
- Evidence: any non-empty username is accepted, and `grant-card` writes any positive card number in any variant without checking the card exists. The shared secret is the only gate, so a leaked secret lets anyone grant cards to anyone at any rate.
- Fix: check the username shape (Twitch login rules) and that the card exists in the active season, and cap grants per viewer per minute.
- Size: S.

**M-7. Unauthenticated opaque-ID lookup and Helix proxy**
- Category: Twitch extension.
- Where: `app/api/twitch/user/route.ts`, `app/api/twitch/resolve-username/route.ts`, `lib/twitch-helix.ts:43`.
- Evidence: `/api/twitch/user` maps any opaque ID to the linked login for anyone who asks. `/api/twitch/resolve-username` calls Helix with the app token for any caller, with no cache, and nothing in the repo calls it any more.
- Fix: delete `resolve-username`; make `/api/twitch/user` require an extension JWT and answer only for the token's own opaque ID.
- Size: S.

**M-8. A paid print is saved before the charge is confirmed**
- Category: Abuse.
- Where: `app/api/collection/route.ts:40-73`.
- Evidence: the paid flow claims the ticket, writes the print, then charges, and revokes the print if the charge is not applied. Between those steps the print exists and can be seen or offered.
- Fix: charge first (the reserve is already taken), then write the print; release the reserve if the write fails.
- Size: M.

### Low

**L-1. Leaving a sandbox follows `/\` off the site**
- Category: Input and output (open redirect).
- Where: `app/api/sandbox/exit/route.ts:9`.
- Evidence: the check refuses `//` but not `/\`, which browsers treat as `//`.
- Fix: `const target = safeReturnTo(to, '/');` (one line, the helper already exists in `lib/twitch-oauth.ts`). Not applied, this is a read-only review.
- Size: S.

**L-2. Outgoing webhooks check the host by its text only**
- Category: Abuse (SSRF).
- Where: `lib/webhook-clean.ts:9-27`, `lib/webhooks.ts:84-101`.
- Evidence: `isPrivateHost` looks at the written host name, so a public name that resolves to a private address passes, and `http:` is allowed. Only admins can set the URL.
- Fix: allow `https:` only and resolve the name at fire time, refusing private and link-local ranges.
- Size: M.

**L-3. Viewer sessions cannot be revoked**
- Category: Sign-in and sessions.
- Where: `lib/session.ts` (30-day signed cookie, no server state).
- Evidence: sign-out clears the cookie in that browser only; a copied cookie stays valid for 30 days, and there is no way to sign a viewer out everywhere.
- Fix: add a per-viewer generation in KV (as the admin cookie has) and check it in `getSession`.
- Size: M.

**L-4. CORS allows every Twitch extension origin**
- Category: Twitch extension.
- Where: `middleware.ts:23`.
- Evidence: the pattern accepts any `*.ext-twitch.tv` origin, not only this extension's.
- Fix: pin it to the extension client ID's own subdomain from an env var.
- Size: S.

**L-5. Extension JWT checks are loose**
- Category: Twitch extension.
- Where: `lib/twitch-jwt.ts:17-44`.
- Evidence: a token without `exp` passes, `alg` is not checked, and `channel_id` is not compared with the Cheesygidds channel. Forging still needs the secret.
- Fix: require `exp`, require `alg: HS256`, and require `channel_id` to match the configured channel.
- Size: S.

**L-6. The panel's private check ignores admin-hidden viewers**
- Category: Privacy.
- Where: `app/api/twitch/collection/route.ts:17`.
- Evidence: it reads only the viewer's own `privateProfile` setting; the site uses `getHiddenUsers()`, which also covers viewers an admin hid.
- Fix: use `getHiddenUsers()` there.
- Size: S.

**L-7. `/api/twitch/*` skips the closed-site gate**
- Category: Access control.
- Where: `middleware.ts:77`.
- Evidence: the panel routes get CORS and return before the closed alpha or beta gate, so the panel works for everyone while the site is closed.
- Fix: decide whether that is intended; if not, apply `siteClosedResponse` on the viewer routes.
- Size: S.

**L-8. Secret compares return early when the lengths differ**
- Category: Sign-in and sessions.
- Where: `lib/admin-token.ts:33-39`.
- Evidence: leaks the password length by timing. Minor.
- Fix: hash both sides (SHA-256) and compare the digests with `timingSafeEqual`.
- Size: S.

**L-9. One secret signs sessions, staff cookies, access cookies and mock tokens**
- Category: Secrets.
- Where: `lib/session.ts`, `lib/staff-token.ts`, `lib/access-token.ts`, `lib/twitch-jwt.ts`.
- Evidence: all use `SESSION_SECRET`; only token shapes and a prefix keep them apart.
- Fix: derive one key per purpose from `SESSION_SECRET` (HKDF with a label).
- Size: S.

**L-10. Admin upload trusts the browser's file name and type**
- Category: Input and output (Blob uploads).
- Where: `app/api/upload/route.ts:30`.
- Evidence: the stored name is the browser's file name and the MIME check uses the browser's type. Admin only.
- Fix: name the blob from a random ID plus an extension chosen from the checked type, and sniff the first bytes.
- Size: S.

**L-11. Replacing a collection does not check the body**
- Category: Input and output.
- Where: `app/api/collection/route.ts:35`.
- Evidence: any JSON object is saved as the collection. Admin only.
- Fix: validate the shape (usernames to arrays of entries) before saving.
- Size: S.

**L-12. `POST /api/seed` can still change Season 1**
- Category: Access control.
- Where: `app/api/seed/route.ts`, `lib/kv.ts:375`.
- Evidence: admin only, but it rewrites Season 1 pack cards when sounds are missing.
- Fix: delete the route or limit it to sandboxes.
- Size: S.

## Settings for Josh

Check by hand; nothing here was changed.

**Vercel (project settings and env)**
- `TWITCH_EXTENSION_SECRET` is set for Production (M-3 depends on it).
- `ADMIN_PASSWORD_LOGIN=off` once Twitch staff sign-in is trusted; until then `ADMIN_PASSWORD` is long and random.
- `SESSION_SECRET`, `ADMIN_COOKIE_SECRET` and `CRON_SECRET` are each at least 32 random characters, all different, and marked Sensitive.
- Preview deployments have Deployment Protection on (Vercel Authentication), so previews are not public.
- Firewall: add a rate-limit rule for `/api/auth/login`, `/api/webhooks/*` and `/api/twitch/*`; know where Attack Challenge Mode is.
- Production responses carry `Strict-Transport-Security` (open the network tab on cheesytcg.app).
- No secret env var is exposed with a `NEXT_PUBLIC_` prefix.

**KV (Upstash) and Blob**
- The KV REST token used by the app is the only read-write token, and it has never been pasted anywhere public; rotate it if unsure.
- Backups are on and a restore has been tried once.
- The Blob store holds only public art and sounds (every upload is public by design).

**Twitch developer console**
- The website app's OAuth redirect URIs list only `https://cheesytcg.app/auth/twitch/callback` (plus localhost for the dev app, if it is the same app).
- The extension's allowlisted URLs list only `https://cheesytcg.app`.
- The extension secret is rotated if it was ever shared or pasted into a chat.

**Discord developer portal**
- The OAuth redirect URI is only the production callback.
- The admin log channel is private.

**GitHub (the repo is public)**
- Secret scanning and push protection are on.
- Dependabot alerts are on.

## Proposals

No severity; size and value only.

### Changes

- **C-1. Route guard check for every route.** Extend `scripts/check-staff-guards.mts` to every `app/**/route.ts` with an explicit allow-list of public routes, so a new unguarded route fails `verify`. Touches: `scripts/`. Size S, value high.
- **C-2. One shared rate limiter in `prodKv`.** A `rateLimit(name, key, max, windowS)` helper used by login, incoming webhooks and the panel routes. Touches: `lib/`, those routes. Size S, value high.
- **C-3. Per-purpose signing keys.** HKDF from `SESSION_SECRET` per token kind (L-9). Touches: `lib/session.ts`, `lib/staff-token.ts`, `lib/access-token.ts`, `lib/twitch-jwt.ts`. Size S, value medium.
- **C-4. Signed sandbox entry.** Replace raw sandbox IDs in the overlay URL and cookie with a signed token (fixes S-1 for good). Touches: `lib/db.ts`, `lib/sandbox.ts`, overlay URL builder. Size M, value medium.

### Feature improvements

- **F-1. Discord alert on emergency login.** Post to the admin log whenever the password login succeeds or locks. Touches: `app/api/auth/login`, `lib/discord.ts`. Size S, value high.
- **F-2. Sign out everywhere.** A button on Account settings backed by the session generation (L-3). Touches: account settings, `lib/session.ts`. Size M, value medium.
- **F-3. Webhook secret last-used time.** Show when each incoming secret was last used and from which route, next to Regenerate. Touches: admin Webhooks page, `lib/webhooks.ts`. Size S, value medium.

### Experimental features

- **X-1. CSP in report-only mode.** Trial: send `Content-Security-Policy-Report-Only` for a week with a tiny report route that counts violations in KV. Success signal: no violations from the site's own pages, so the policy can be enforced. Size S, value medium.
- **X-2. Vercel Firewall rate limits.** Trial: add rules for login and webhook paths in log-only mode for a week. Success signal: no real overlay, panel or webhook traffic is flagged. Size S, value medium.
- **X-3. Twitch-ID-first profiles.** Trial: record the Twitch ID on every sign-in for a month and count profiles whose ID would conflict. Success signal: the count shows how many renamed players M-1 affects before choosing a migration. Size S, value medium.

### UI and UX improvements

- **U-1. Security health card on Admin Settings.** Next to the env health list: password login on or off, extension secret set, secret lengths, last emergency login. Touches: `app/admin/settings`. Size S, value high.
- **U-2. Private profile explainer.** The settings toggle says plainly where a name still shows (on stream, the Discord feed, trades they join). Touches: account settings, FAQ. Size S, value medium.
- **U-3. Clear "not allowed" page for staff.** A mod who opens an admin page sees which role it needs (check what the middleware shows today first). Touches: `middleware.ts`, `/mod`. Size S, value low.
