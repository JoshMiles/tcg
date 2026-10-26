# Audit 2026: Twitch panel (ROADMAP 44.4)

Read this only when working on the findings below or on 34.8 (the panel 0.0.2 release).

## Intro

- **Commit audited:** `e909170` on `main` (panel version `0.0.2`, everything from 34.6 and 34.7 merged).
- **Scope:** every tab and view in `public/twitch-panel/*` (Collection with card details, editions, favourites and Looking for; Stats; Trades; Board; the login screen; the three views), every route under `app/api/twitch/*`, the extension CORS rules in `middleware.ts`, `scripts/lib/twitch-package.mjs`, `scripts/build-twitch-package.mjs` and the submission pack in `twitch-extension/SUBMISSION.md`, checked against Twitch's current Extension Guidelines and review checklist on dev.twitch.tv.
- **Method:** code reading only. Every route was checked for where the viewer comes from (always the verified JWT for anything that changes data), and the panel's DOM building for user text reaching `innerHTML`. The hosted zip was built once with `node scripts/build-twitch-package.mjs` to check its contents (46.4 KB, 8 files, helper script first in all three views, no inline scripts, absolute Terms and Privacy links), then deleted.
- **Not checked:** the panel inside real Twitch (Hosted Test), the identity share prompt, JWT refresh timing, the Twitch CSP as Twitch applies it (the CSS uses `data:` SVG masks), mobile load size with card art (the zip is small, but the first grid loads thumbnails from Blob), screen readers, and anything in production KV.

**Good news first.** No route takes the viewer from the body or the query for anything that changes data: favourite, want, trainer, trades, upgrade, me and unlink all resolve the viewer from the signed JWT. The panel builds its DOM with `textContent` only (`el()` and `detailLine()`); `innerHTML` is only ever cleared, so trade notes and usernames cannot inject markup. The CORS rule (`middleware.ts`) allows only `*.ext-twitch.tv` (and the local rig outside production) and sends no credentials header. The zip validator already blocks inline scripts, remote scripts, `eval` and site-relative paths.

## CODE_REVIEW.md status for this area

| # | Finding | Status |
|---|---------|--------|
| 15 (High) | Panel collection route leaked private profiles and drafts | **Fixed.** `app/api/twitch/collection/route.ts:17-23` checks private profiles via the JWT or the session and drops drafts; covered by `scripts/check-panel-collection.mts`. |
| 20 (Medium) | Any bearer accepted when `TWITCH_EXTENSION_SECRET` is unset | **Still open.** `lib/twitch-viewer.ts:15-17`, and inline copies in `app/api/twitch/me/route.ts:26-29`, `upgrade/route.ts:16-20`, `unlink/route.ts:11-17`. See M-2. |
| 21 (Medium) | `/api/twitch/user` and `/api/twitch/resolve-username` have no auth | **Still open.** See M-3 and M-4. |
| 13 (Low) | One signing secret for several purposes | **Still relevant.** The mock extension key is also derived from `SESSION_SECRET` (`lib/twitch-jwt.ts`). See L-8. |
| 9 (Medium) | One JSON value per season | **Still relevant** to the panel: the collection route reads every non-draft season's blob per call. See L-7. |
| Test gap (line 284) | No checks for the panel routes | **Partly closed.** `check-panel-collection`, `check-panel-favourites`, `check-panel-want` exist; `me`, `upgrade`, `login`, `unlink`, `user` and `leaderboard` have none. |

## Findings

Severity counts: **critical 0, high 0, medium 8, low 9.** No security finding is held privately.

### Critical

None.

### High

None.

### Medium

**M-1. Every JWT refresh re-runs the whole start-up and throws the viewer back to Collection**
- Severity: medium. Category: bug.
- Where: `public/twitch-panel/panel.js:1635` (`onAuthorized(authObj => init(authObj))`), `init()` at 1500-1538, `login()` at 1344-1359.
- Evidence: Twitch calls `onAuthorized` again each time it refreshes the token. `init()` then shows the loading state, refetches the season, logs in again, and `login()` calls `resetTrades()`, `closeDetail()` (through `setView('collection')`) and reloads the collection. A viewer who is halfway through composing a trade offer, or looking at a card, loses it with no warning.
- Fix: when a viewer is already logged in, a later `onAuthorized` only swaps `auth` (the new token) and returns.
- Size: S. 34.8? next version (cheap; worth folding into 34.8 if it is touched anyway).

**M-2. Dev fallback accepts any bearer when the extension secret is unset (CODE_REVIEW #20)**
- Severity: medium. Category: security.
- Where: `lib/twitch-viewer.ts:15-17`; inline copies in `app/api/twitch/me/route.ts:26-29`, `app/api/twitch/upgrade/route.ts:16-20`, `app/api/twitch/unlink/route.ts:11-17`.
- Evidence: `devMode` is true whenever `TWITCH_EXTENSION_SECRET` is missing, in any environment. Production has the secret set, so this is a configuration risk (a deployment without it would accept any token as the dev viewer). Three routes copy the check instead of calling `extensionViewer()`.
- Fix: allow dev mode only outside production (`VERCEL_ENV !== 'production'`), and make `me`, `upgrade` and `unlink` call `extensionViewer()`.
- Size: S. 34.8? next version.

**M-3. `/api/twitch/user` maps any opaque id to a username with no auth (CODE_REVIEW #21)**
- Severity: medium. Category: security.
- Where: `app/api/twitch/user/route.ts:4-12`; called by `tryAutoLogin()` at `public/twitch-panel/panel.js:1370-1383`.
- Evidence: the route reads `opaqueId` from the query and returns the linked username. The panel has a signed token at that point but does not send it.
- Fix: drop the route and `tryAutoLogin()`; `loginFromJwt()` (already the next step in `init()`) or a JWT-checked lookup returns the linked name.
- Size: S. 34.8? next version.

**M-4. `/api/twitch/resolve-username` is unused and lets anyone spend the app's Helix quota (CODE_REVIEW #21)**
- Severity: medium. Category: security / delete-merge.
- Where: `app/api/twitch/resolve-username/route.ts`; no caller in `app/`, `lib/` or `public/`.
- Evidence: unauthenticated route that calls Helix with the app token on every request. The panel's login (`/api/twitch/login`) shares the same Helix credentials, so heavy use could slow or block real sign-ins.
- Fix: delete the route (and its line in `docs/twitch-extension.md:67`).
- Size: S. 34.8? next version.

**M-5. Links that open the website have no visible off-site indicator**
- Severity: medium. Category: twitch-review.
- Where: `statLink()` `public/twitch-panel/panel.js:1045-1051` (My profile, My binder, Share my cards, Open page, Share image, Alerts on the site), board rows `panel.js:952-956`, "See full board" `panel.js:1008-1010`, `panel.js:1168-1170`, trade links `public/twitch-panel/trades.js:134-136`, Terms and Privacy in the three HTML views. Only `.footer-username` shows a `↗` (and only on hover, `panel.css:517-518`).
- Evidence: Twitch's guidelines ask that a link leaving the extension is clearly marked as such. Reviewers check this.
- Fix: one CSS rule giving every `a[target="_blank"]` in the panel a visible `↗` (always, not only on hover).
- Size: S. 34.8? **yes**.

**M-6. The submission text no longer describes the panel**
- Severity: medium. Category: twitch-review.
- Where: `twitch-extension/SUBMISSION.md:72-86` (details), 117-121 (change log), 123-129 (source note), 36 (size), 131-141 (testing steps).
- Evidence: the details list versions without Golden and leave out trainer cards, favourites, Looking for and achievements. The change log says "Initial release" for 0.0.2. The source note says the panel is served from `https://cheesytcg.app/twitch-panel/` and that every request carries the JWT; the hosted zip is served by Twitch, and season, leaderboard and collection reads are public. The size says about 40 KB (the zip is 46 KB). Twitch requires the description to be accurate and complete.
- Fix: rewrite those blocks for 0.0.2 (what changed since 0.0.1, the hosted zip, which calls are public and which carry the JWT, the new testing steps).
- Size: S. 34.8? **yes**.

**M-7. The pack does not list the Allowlist for Panel URLs**
- Severity: medium. Category: twitch-review.
- Where: `twitch-extension/SUBMISSION.md:107-113` (allowlists table).
- Evidence: the panel opens `https://cheesytcg.app/...` pages (profile, binder, copy pages, trades, Terms, Privacy). Twitch only lets a panel link to URLs in that allowlist, so without it the links may be blocked in the hosted version or flagged in review.
- Fix: add a row: Allowlist for Panel URLs, `https://cheesytcg.app/`.
- Size: S. 34.8? **yes**.

**M-8. The Board tab recomputes the whole leaderboard on every open**
- Severity: medium. Category: efficiency.
- Where: `app/api/twitch/leaderboard/route.ts:16` (`getSeasonLeaderboard(season)`).
- Evidence: `/api/twitch/me` already uses the shared 20-second cache (`getSeasonLeaderboardCached`); the leaderboard route does not, so each viewer who opens Board during a stream rebuilds the board from the collection blob. That is the moment most viewers open it.
- Fix: use `getSeasonLeaderboardCached(season)`.
- Size: S. 34.8? next version.

### Low

**L-1. Trade notes are viewer-written text shown to other viewers; the pack does not say how they are moderated**
- Severity: low. Category: twitch-review.
- Where: notes shown at `public/twitch-panel/trades.js:188`, trimmed to `TRADE_LIMITS.noteLength` at `lib/trades.ts:309`; staff removal via `cancelOneTradeAction` (`app/admin/trade-actions.ts:95-99`, mods included).
- Evidence: Twitch's rules on user content ask for an identity share (done: trading needs a linked account) and a way for the broadcaster to remove content (done: mods and admins cancel the offer). Nothing in the submission text says so, and there is no word filter.
- Fix: one paragraph in the walkthrough guide naming the moderation path (mod panel, Trades, cancel).
- Size: S. 34.8? **yes**.

**L-2. Dead login helper posts to a route that does not exist**
- Severity: low. Category: delete-merge.
- Where: `linkAndLogin()` `public/twitch-panel/panel.js:1324-1342` (calls `/api/twitch/link`; no such route, no callers).
- Fix: delete the function.
- Size: S. 34.8? next version (cheap with M-3).

**L-3. Console logs print the viewer's opaque id and login state**
- Severity: low. Category: twitch-review.
- Where: `public/twitch-panel/panel.js:1502, 1508, 1574, 1594`.
- Fix: remove the `console.log` lines (keep `console.warn` / `console.error` on failures).
- Size: S. 34.8? next version.

**L-4. Arrow keys and Esc are bound at document level while card details are open**
- Severity: low. Category: twitch-review.
- Where: `public/twitch-panel/panel.js:766-771` (Escape, ArrowLeft, ArrowRight), `panel.js:857-861` (upgrade ceremony Esc and Enter).
- Evidence: Twitch's guidelines limit keyboard shortcuts. These only fire while the panel iframe has focus and a dialog is open, which is standard dialog behaviour, so a rejection is unlikely, but a reviewer may ask.
- Fix: none needed now; if asked, scope the listener to the detail dialog element.
- Size: S. 34.8? next version.

**L-5. The zip validator does not check that the helper script comes first**
- Severity: low. Category: twitch-review.
- Where: `validatePackage()` `scripts/lib/twitch-package.mjs:50`.
- Evidence: Twitch requires the Extension Helper to be the first script. Today's views get it right (checked in the built zip), but nothing stops a later edit from breaking it.
- Fix: assert the first `<script src>` in each view is the helper URL.
- Size: S. 34.8? next version.

**L-6. `/api/twitch/me` records achievements on every call**
- Severity: low. Category: efficiency.
- Where: `app/api/twitch/me/route.ts:51` (`syncAchievements(username)`).
- Evidence: the panel calls `/me` on login, on manual refresh, after each upgrade, trainer use and trade action. Each call may write achievement state and pay buffs, as a profile view does.
- Fix: keep it, but skip the sync on `fresh=1` follow-ups, or cache it per viewer for a minute.
- Size: S. 34.8? next version.

**L-7. Collection and Trades calls read whole season blobs (CODE_REVIEW #9)**
- Severity: low. Category: efficiency.
- Where: `app/api/twitch/collection/route.ts:25-37` (every non-draft season), `app/api/twitch/trades/route.ts:26-29` (`sweepTrades()` plus the season blob on each GET).
- Evidence: fine at today's size and the panel does not poll (refresh is manual or after 45 s away), but it grows with every season.
- Fix: none now; follows CODE_REVIEW #9 when per-user keys arrive.
- Size: M. 34.8? next version.

**L-8. The mock extension key shares `SESSION_SECRET` (CODE_REVIEW #13)**
- Severity: low. Category: security.
- Where: `lib/twitch-jwt.ts` (`verifyMockJwt`, key `tcg-mock-ext:` + `SESSION_SECRET`).
- Evidence: mock tokens are only honoured for a registered sandbox, so real data is not reachable; it is the same single-secret concern as #13.
- Fix: derive with HKDF per purpose when #13 is done.
- Size: S. 34.8? next version.

**L-9. `docs/twitch-extension.md` describes routes this audit proposes to remove**
- Severity: low. Category: delete-merge.
- Where: `docs/twitch-extension.md:30` (auto-login via `/api/twitch/user`), `:67` (credentials "used by `/api/twitch/resolve-username`"; the login route uses them through `lib/twitch-helix.ts`).
- Fix: update with M-3 and M-4.
- Size: S. 34.8? next version.

## Proposals

No severity; value is high, medium or low.

### Changes

1. **One viewer check for every extension route.** Make `me`, `upgrade`, `unlink` and `login` use `extensionViewer()` (or a sibling for login) so the JWT rules live in one place. Touches `lib/twitch-viewer.ts`, `app/api/twitch/*`. Size S. Value high.
2. **Remove the unauthenticated lookups.** Delete `/api/twitch/user`, `/api/twitch/resolve-username`, `tryAutoLogin()` and `linkAndLogin()`; start-up goes straight to `loginFromJwt()`. Touches `app/api/twitch/*`, `panel.js`, docs. Size S. Value high.
3. **A check file for the remaining panel routes.** `scripts/check-panel-routes.mts` on mock KV covering `me`, `upgrade`, `unlink`, `leaderboard` (the viewer from the JWT, 401 without it). Touches `scripts/`. Size M. Value medium.
4. **Guard the release rules in the zip build.** `validatePackage` also asserts helper-first and that every `target="_blank"` link gets the off-site class. Touches `scripts/lib/twitch-package.mjs`. Size S. Value low.

### Feature improvements

1. **New since last visit.** A dot on cards pulled since the viewer last opened the panel (the refresh toast already knows them; keep the last-seen set in `localStorage`). Touches `panel.js`, `panel.css`. Size S. Value medium.
2. **Around me on the Board.** Show the two rows above and below the viewer when they are outside the top list (`me` is already returned). Touches `panel.js`, `leaderboard/route.ts`. Size S. Value medium.
3. **Offers waiting badge on the Trades tab.** `/me` already counts incoming offers; show the number on the tab. Touches `panel.js`. Size S. Value medium.

### Experimental features

1. **Browse before linking.** Let viewers who have not shared their identity open Board and a read-only dex before the share prompt. Cheap trial: show the Board tab on the login screen for one stream. Success signal: more identity shares per panel open than the stream before. Touches `panel.js`, `panel.html`. Size S. Value high.
2. **Live pull moment in the video component.** When a pull is saved, broadcast it over Twitch PubSub from the server and show the card for a few seconds in `video_component.html`. Cheap trial: broadcast only rarity 4 and up for one stream. Success signal: component view opens and new links during that stream. Touches `lib/` (EBS PubSub send), `panel.js`, `views.css`. Size L. Value medium.
3. **Looking for match alert.** When an offer on the board gives a card on the viewer's Looking for list, mark the Trades tab. Cheap trial: compute it from the existing `/trades` matches only when the tab is opened. Success signal: trades accepted from the panel. Touches `panel.js`, `trades.js`. Size S. Value medium.

### UI and UX improvements

1. **Clearer login button.** "Login with Twitch" suggests a Twitch OAuth login; say "Link my Twitch account" with one line on what is shared (the username only). Touches the three HTML views, `panel.js:1490`, `SUBMISSION.md`. Size S. Value medium.
2. **Keep focus in card details.** Move focus into the detail dialog on open, trap Tab inside, return it to the tile on close. Touches `panel.js` (`openDetail`/`closeDetail`). Size S. Value medium.
3. **"Updated N ago" next to refresh.** The panel does not poll, so show when the cards were last loaded. Touches `panel.js`, `panel.css`. Size S. Value low.
4. **Note length hint.** Show "N of 140" under the trade note field. Touches `trades.js`. Size S. Value low.
