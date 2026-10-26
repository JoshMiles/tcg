# Audit 44.3: mod panel and staff roles (2026-10-26)

Audited `origin/main` at `e909170`. Scope is ROADMAP 44.3: every mod page and action (overview, activity, viewers, trades, feedback, testers, what's new), the role model in docs/staff.md, who-did-it attribution, and what a mod sees of the stream tools.

**Method.** Read-only code review. The mod access test from docs/review.md was done by tracing code, not by running the sweep: for each role, the middleware (`middleware.ts`), the panel layouts, each page's own check, every server action a mod can call, and the `/api/admin/*` guards. The static guard audit (`scripts/check-staff-guards.mts`) and the runtime sweep (`scripts/sweep-mod-access.mjs`) were read to see what they cover.

**Not checked.** No dev server, mock KV, browser or OBS was run, so nothing here is confirmed at runtime. `node scripts/run-checks.mjs staff` could not run in the audit worktree (no installed packages). Race findings are from reading the code, not reproduced. Discord delivery and the Twitch panel are out of scope.

## Who can reach what

"yes" and "no" are what the code does now. Where that differs from what it should do, the cell says so. Pages are gated by `middleware.ts` (cookie role only) and then by the panel layout (live staff list); actions and API routes re-check the live list themselves.

| Page or action | Stranger | Signed-in viewer | Mod | Admin | Super / emergency password | Removed or demoted, cookie still live |
|---|---|---|---|---|---|---|
| `/mod` pages (overview, activity, viewers, trades, feedback, testers, what's new) | no (to /login) | no (/auth/staff turns them away) | yes | yes | yes | yes for up to an hour on in-panel navigation (should: no), see M-1 |
| `/admin` pages | no | no | no (sent to /mod) | yes | yes | yes for up to an hour on in-panel navigation (should: no), see M-1 |
| `/admin/wiki` | no | no | no (should: a mod slice, see F2) | yes | yes | as above |
| Mod actions: tags, restrictions, cancel an offer (two actions), block trading, reverse a trade, feedback status | no | no | yes; also on their own account, other staff and admin-set restrictions (should: no), see M-2 and M-3 | yes | yes | no (live list re-read) |
| Feedback deletion requests (delete, decline, close) | no | no | no | yes | yes | no |
| Admin actions (grants, gifts, restore, merge, buffs, bulk, packs, seasons, settings) | no | no | no | yes | yes | no |
| Staff page: add, change or remove mods | no | no | no | yes | yes | no |
| Staff page: add or remove admins | no | no | no | no | yes | no |
| `GET /api/admin/activity` | no | no | yes | yes | yes | no |
| Other `/api/admin/*` routes | no | no | no | yes | yes | no |
| Reverse button on `/trade/[id]` | no | no | yes (should: not on their own trades) | yes | yes | no |
| Stream tools: overlay, test panel, queue, live switches | no (overlay key only) | no | no (should: read-only status, see E1) | yes | yes | no |

The emergency password counts as the super admin unless `ADMIN_PASSWORD_LOGIN=off`.

**Attribution.** Every mod action names the staff member: tags and restrictions go through `recordAudit` (with `by`) and `flags.by`, offer cancels set `Trade.staff`, reversals record the staff login and reason, and feedback stores `repliedBy`. Nothing found that a mod can do without a name attached. The gap is visibility, not recording: nothing outside the panel tells anyone a mod acted (see F1).

**Stream tools.** A mod has no overlay, test panel, queue or live switch access (`isOverlayRequest` uses the admin check). On stream a mod sees only the read-only activity feed. That is safe, but it means a mod cannot tell whether the overlay is up or pulls are paused (see E1).

## CODE_REVIEW.md findings in this area

| # | Finding | Status |
|---|---|---|
| 2 | Legacy import is a GET with the secret in the URL | Fixed: `app/api/admin/import-legacy/route.ts` is POST behind `isAuthenticated()`, and the guard check no longer special-cases it |
| 3 | Emergency admin cookie never expires on the server | Fixed: `lib/admin-token.ts` v2 claims carry an expiry, an id and a KV generation |
| 4 | Password-login rate limit trusts the left-most `X-Forwarded-For` | Still open: `app/api/auth/login/route.ts:15` |
| 7 | Refunded offer can stay marked escrowed | Fixed for the cancel paths mods use: `sweepInLock` persists (`lib/trades.ts:169`), a missing season leaves `escrowed` set, and staff can return stuck editions (`lib/trades.ts:507`). Season delete with open offers was not re-checked |
| 12 | Secret compares return early when the lengths differ | Still open: `sameString` in `lib/admin-token.ts:33-35` |
| 13 | One signing secret covers viewer sessions and staff cookies | Still open: `lib/staff-token.ts:24-25` uses `SESSION_SECRET` |
| 17 | Restore ignores open trades and print ids | Fixed: `lib/user-admin.ts:154-159` refuses with open offers and restores by print id |
| 1, 5, 6, 8 to 11, 14 to 16, 18 to 26 | Collections, webhooks, sandbox, panel and backups | Not in this area |

## Findings

Counts: 0 critical, 1 high, 7 medium, 15 low.

### High

**S-1 (high, security): held privately, see SECRETS.md** (staff list, `lib/staff.ts` / `app/auth/staff/route.ts`).

### Medium

**M-1. Removed or demoted staff keep page views for up to an hour, and most panel pages rely on a layout check that in-panel navigation skips**
- Severity: medium. Category: security.
- Where: `app/admin/layout.tsx:29-32`, `app/mod/layout.tsx`, `middleware.ts:80-95`; 28 of 39 `/admin` and `/mod` pages have no check of their own (among them `/mod`, achievements, activity, assets, buffs, packs, seasons, serials, settings, trades, users, wiki).
- Evidence: the middleware trusts the role inside the one-hour cookie. The layouts re-read the live list, but App Router layouts do not re-render on client-side navigation, so a page without its own `requireStaff` renders for anyone the middleware let through. The layout comment says removed people "stop here", which is only true on a full page load. Actions and API routes are not affected (they re-check).
- Fix: call `requireStaff(cap)` at the top of every panel page (a one-line helper), and have `check-staff-guards` require it.
- Size: M.

**M-2. Mods can moderate themselves, other staff, and restrictions an admin set**
- Severity: medium. Category: security.
- Where: `app/admin/users-actions.ts:24-38` and `:91-100`, `app/admin/trade-actions.ts:83-110`, `lib/user-admin.ts:71-80`.
- Evidence: `saveTagsAction`, `saveFlagsAction`, `cancelUserTradeAction`, `blockViewerTradingAction` and `cancelOneTradeAction` take any username or offer. Nothing compares the target with the acting staff member or the staff list, and `saveFlags` replaces `flags` wholesale, so a mod can clear an admin's restriction (or lift their own). The audit trail records it, but nothing stops it.
- Fix: one `canModerate(actor, target)` check in these actions: refuse self, refuse staff targets for mods, refuse a mod changing flags whose `by` is an admin.
- Size: S.

**M-3. A mod can reverse a trade they were part of**
- Severity: medium. Category: security.
- Where: `lib/trades.ts:700-712`, `app/admin/trade-actions.ts:105-110`.
- Evidence: `reverseTrade` checks the status, `reversedAt` and the season, but not whether `staff` is `trade.from` or `trade.resolvedBy`. A mod who regrets a trade can undo it with a reason of their choosing.
- Fix: `if (staff === trade.from || staff === trade.resolvedBy) return fail(403, 'Ask another staff member to reverse your own trade.')`.
- Size: S.

**M-4. Panel "Log out" is undone by the next panel visit**
- Severity: medium. Category: security / UI-UX.
- Where: `app/api/auth/logout/route.ts:9-14`, `middleware.ts:85-90`.
- Evidence: logout clears the staff cookies but keeps the viewer session (on purpose, per its comment). The next visit to `/mod` or `/admin` sees the session, goes to `/auth/staff`, and gets a fresh staff cookie with no prompt. On a shared computer the button looks like it worked and does not.
- Fix: after a panel logout, offer "Also sign out of the site" on the landing page, or set a short-lived marker that sends the next panel visit to `/login` instead of `/auth/staff`.
- Size: S.

**M-5. The mod viewer page labels every trade with the active season**
- Severity: medium. Category: bug.
- Where: `app/mod/users/[username]/page.tsx:49` and `:56`.
- Evidence: card names are loaded from the active season only, and each trade row gets `season: active?.season.name`. A trade from an older season shows the wrong season and wrong or missing card names, which is what a mod reads before cancelling or reversing.
- Fix: group trades by `seasonId` and load names per season (the admin trade data loader already does this).
- Size: S.

**M-6. The trade log shows failures in green**
- Severity: medium. Category: UI-UX.
- Where: `app/admin/trades/TradeLog.tsx:93`.
- Evidence: the result message always uses the success tone, so "Can't reverse: ..." or a refused cancel reads like it worked.
- Fix: keep the `ok` flag with the message and use the error tone when it is false.
- Size: S.

**M-7. The mod Viewers list reads every collector's profile on each visit**
- Severity: medium. Category: efficiency.
- Where: `app/mod/users/page.tsx:26-30`.
- Evidence: it loads every collection viewer, then `getUserProfile` for the whole pool, and only then filters by name and restriction and shows 80. Cost grows with the player count on every page view and every search.
- Fix: filter names first, read profiles only for the rows shown; for "Restricted only", start from `users:hidden` plus a small index of `noTrading` viewers.
- Size: M.

### Low

**L-1. Logout bumps the emergency generation for any cookie value** (security). `app/api/auth/logout/route.ts:10` bumps when an `admin-auth` cookie is present at all, so anyone can sign every emergency session out by posting with a junk cookie. Fix: bump only when `isValidAdminToken` passes. Size: S.

**L-2. "Hidden from boards" on the overview counts private profiles, but the link lists only staff restrictions** (bug). `app/mod/page.tsx:32` and `:45` use `getHiddenUsers()` (admin-hidden plus self-hidden), while `app/mod/users/page.tsx:30` filters on flags. The number and the list disagree. Fix: count admin-hidden only, or show two tiles. Size: S.

**L-3. The trade drawer shows a reversed trade as accepted** (UI-UX). `app/admin/trades/TradeLog.tsx:119` ignores `reversedAt`. Fix: show a "Reversed" status with who and why. Size: S.

**L-4. Block in the trade drawer applies only to the offerer** (UI-UX). `TradeLog.tsx` passes `selected.from`. A mod cannot block the other party from the same place. Fix: a block button per party. Size: S.

**L-5. The viewer page can cancel only offers the viewer made, and has a dead ternary** (UI-UX, delete-merge). `app/admin/users/[username]/UserPanels.tsx:203` (`l.mine ? l.give : l.give`) and `:206`. Offers sent to the viewer have no cancel button. Fix: allow cancel on both directions, drop the ternary. Size: S.

**L-6. "Total pulls" counts editions held now** (bug). `app/mod/users/[username]/page.tsx` counts current collection entries, so trades and removals change it. Fix: rename to "Editions held" or count pull events. Size: S.

**L-7. Mod actions accept any username** (bug). `app/admin/users-actions.ts:24-38` pass the raw name to `saveTags` / `saveFlags`, and `ensureProfile` (`lib/user-admin.ts:58-60`) creates a profile for a login that never existed; `hideFromBoard` adds it to `users:hidden`. Fix: clean the login and refuse unknown viewers. Size: S.

**L-8. The hidden list and staff profile edits are read-modify-write** (bug). `lib/user-admin.ts:52-56` (`setHidden`) and `:62-80` (`saveTags`, `saveFlags` rewrite the whole profile). Two staff saving at once, or a staff save racing a profile update, can drop a change. Fix: store hidden viewers in a KV set (`sadd` / `srem`) and patch only the changed profile fields. Size: M.

**L-9. The guard check does not count a bare `requireStaff()` as a mod action** (security). `scripts/check-staff-guards.mts` (`DOCUMENTED_MOD_ACTIONS`, line 67, and the matcher below it) looks for `requireStaff('mod')` only, but `requireStaff()` defaults to mod, so a new action written that way is reachable by mods without tripping the documented-list comparison. Fix: treat a call with no argument as mod. Size: S.

**L-10. The runtime sweep covers half the mod panel and no actions** (security). `scripts/sweep-mod-access.mjs:55` loads 4 of the 7 mod pages, calls no server action, and has no removed or demoted case. Fix: add the missing pages, one refused admin action as a mod, and a "removed during the session" probe. Size: S.

**L-11. Docs and copy say less than the code does** (bug). `docs/staff.md:8` leaves out `reverseTradeAction` (line 15 has it), `docs/staff.md:13` lists four mod pages where the nav has seven, `app/mod/layout.tsx:16` says mods get only activity, viewers and trades, `UserPanels.tsx:25` and `:52` call tags and reasons "admin-only", and `lib/user-admin.ts:31` says the same. Fix: update the text. Size: S.

**L-12. The admin link in the mod bar is hidden on phones** (UI-UX). `app/mod/layout.tsx` uses `hidden sm:inline-flex`. Fix: put it in an overflow menu. Size: S.

**L-13. The trade drawer is a dialog without focus handling** (UI-UX). `TradeLog.tsx` sets `role="dialog"` but does not trap or return focus. Fix: reuse the shared `Dialog` component. Size: S.

**L-14. Trade data loads seasons one after another and one profile per name** (efficiency). `lib/trade-admin-data.ts` runs `getTradeCards` / `getTradePools` per season in sequence, then a profile read per trader. Fix: `Promise.all` the seasons and batch the profile reads. Size: S.

**L-15. The feedback page lists the inbox three times** (efficiency). `app/mod/feedback/page.tsx:19` makes three `listFeedback` calls. Fix: one call, split in memory. Size: S.

## Proposals

### Changes

- **C1. A page guard for every panel page.** One helper, `await staffPage('mod' | 'admin')`, at the top of each page, enforced by `check-staff-guards`. Touches: every `app/admin/**/page.tsx` and `app/mod/**/page.tsx`, the guard check. Size: M. Value: high.
- **C2. One moderation rule.** `canModerate(actor, target, action)` in `lib/staff-core.ts`, used by every mod action and by `reverseTrade` (self, staff targets, trade parties, admin-set flags). Touches: `users-actions.ts`, `trade-actions.ts`, `lib/trades.ts`, `check-staff.mts`. Size: S. Value: high.
- **C3. Search before reading profiles.** The mod Viewers list reads profiles only for the rows it shows, and "Restricted only" reads from an index. Touches: `app/mod/users/page.tsx`, `lib/user-admin.ts`. Size: M. Value: medium.
- **C4. Panel logout that means it.** After logout, a choice: stay signed in to the site, or sign out of everything. Touches: `app/api/auth/logout/route.ts`, `middleware.ts`, `/login`. Size: S. Value: medium.

### Feature improvements

- **F1. Mod actions in the Discord admin log.** Restrictions, cancels, blocks and reversals post one line with the staff name and reason. Touches: the mod actions, the Discord feed. Size: S. Value: high.
- **F2. A mod guide.** Wiki topics marked for mods render at `/mod/guide` (how to restrict, when to reverse, what to escalate). Touches: `content/wiki`, a new mod page, `ModNav`. Size: M. Value: medium.
- **F3. Look up any viewer.** The mod search also finds viewers with a profile but no pulls, from a search box in the mod bar. Touches: `app/mod/users/page.tsx`, `app/mod/layout.tsx`. Size: S. Value: medium.
- **F4. Per-mod activity on the Staff page.** Actions per staff member over the last 7 days, read from the audit `by`. Touches: `/admin/staff`, `lib/audit`. Size: M. Value: medium.
- **F5. Reports about staff go to admins.** Feedback that names a staff member is hidden from that person and flagged for admins. Touches: feedback store and inbox. Size: S. Value: medium.

### Experimental features

- **E1. Mod stream desk.** A read-only live panel on `/mod` showing overlay status, whether pulls are paused and the queue length. Cheap trial: render the existing `OverlayStatus` read-only on the mod overview for two streams. Success signal: mods flag overlay problems in chat before the streamer notices. Touches: `app/mod/page.tsx`, overlay status route guard. Size: M. Value: high.
- **E2. Timed restrictions.** A "no trading for 24 hours / 7 days" option that lifts itself. Cheap trial: an optional `until` on flags, read in `isTradeBlocked`. Success signal: fewer manual "Restrictions cleared" entries in the audit log. Touches: `lib/user-admin.ts`, `ModerationPanel`. Size: S. Value: medium.
- **E3. Second approval for big reversals.** Reversals above a value need a second staff member. Cheap trial: log "would need a second approval" for two weeks without blocking. Success signal: how many logged reversals a second person would have questioned. Touches: `reverseTrade`, `ReverseTrade.tsx`. Size: M. Value: low.

### UI and UX improvements

- **U1. Honest results in the trade log.** Error tone for failures and a "Reversed" chip with who and why (M-6, L-3). Touches: `TradeLog.tsx`. Size: S. Value: medium.
- **U2. Act on both sides of a trade.** Block either party from the drawer and cancel offers in both directions from the viewer page (L-4, L-5). Touches: `TradeLog.tsx`, `UserPanels.tsx`. Size: S. Value: medium.
- **U3. Season on every trade row.** The viewer page shows each trade's own season and a season filter (M-5). Touches: `app/mod/users/[username]/page.tsx`. Size: S. Value: medium.
- **U4. Accessible drawer.** Reuse the shared `Dialog` for the trade drawer (focus trap, Escape, focus return). Touches: `TradeLog.tsx`. Size: S. Value: medium.
- **U5. Mod bar on phones.** The admin link and the nav fit a phone through an overflow menu (L-12). Touches: `app/mod/layout.tsx`, `ModNav.tsx`. Size: S. Value: low.
- **U6. Two overview tiles.** "Restricted by staff" and "Private profiles" instead of one mixed count (L-2). Touches: `app/mod/page.tsx`. Size: S. Value: low.
