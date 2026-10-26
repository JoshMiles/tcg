# Admin audit, October 2026 (ROADMAP 44.2)

> History. Read this only when you work on an item it lists, or need why one was raised.

**Commit audited:** `e909170` (main, 2026-10-26).

**Method:** read-only code review of `app/admin/**`, the admin server actions, `app/api/admin/**`, and the shared code the admin drives:
- `lib/assets.ts`, `lib/backup.ts`, `lib/sandbox.ts`, `lib/db.ts`, `lib/kv.ts`, `lib/webhooks.ts`, `lib/overlay-key.ts`, `lib/admin-token.ts`, `lib/staff-guard.ts`;
- the overlay paths the admin controls (`public/widget.js`, searched only);
- `app/api/collection`, `app/api/webhooks/queue`, `app/api/upload`.

How each part was checked:
- **Guards:** every exported server action under `app/admin` was listed with its guard and whether it calls `revalidatePath`, using a throwaway script. `scripts/check-staff-guards.mts` also passed: 123 admin actions, 3 viewer action files, 7 admin routes.
- **KV reads per request:** static counts made by reading the code path, not measured.
- **Checks run (all passed):** admin-shell, backup, locale, overlay-key, overlay, sandbox-admin, sandbox, serials-view, serials, settings, staff-guards, staff, user-settings.

**Not checked:**
- **Nothing was run.** No dev server, browser, OBS or real Blob store, so layout at 375px and runtime behaviour were not seen.
- **Skimmed only:** the Overlay Editor (searched, not read whole), the season wizard and pack workspace validation, the card back editor, Mix It Up, wiki, changelog and feedback pages, and the trades and serials admin. For these, only the guard script and spot reads were done.
- **Belongs to other audits:** the Twitch panel, the mod panel and the public site (44.1, 44.3, 44.4).

## CODE_REVIEW.md status for this area

| # | Item | Status at e909170 |
|---|------|-------------------|
| 1 | Anyone can download a season's collection | Fixed: GET needs `isOverlayRequest` and sends no-store. A sandbox gap is held as S-1 |
| 2 | Legacy import is a GET with `ADMIN_SECRET` in the URL | Fixed: POST only, guarded; GET answers 405 |
| 3 | Emergency admin cookie never expires | Fixed: `ADMIN_COOKIE_SECRET`, with expiry and generation |
| 4 | Login rate limit trusts left-most `X-Forwarded-For` | Open (medium), `app/api/auth/login/route.ts` |
| 5 | Outgoing webhooks do not resolve DNS | Open (medium), `lib/webhooks.ts:84`, `lib/webhook-clean.ts` |
| 6 | Incoming webhooks accept any username, no rate limit | Open (medium), `lib/webhooks.ts:122` |
| 7 | Refunded offer stays escrowed; missing season drops prints | Season part fixed: `deleteSeason` refuses while offers are open. The refund part belongs to the trading audit |
| 8 | Every request in a sandbox is treated as the overlay | Open (medium), `lib/overlay-key.ts:42`; see S-1 |
| 9 | A season collection is one JSON value | Open (capacity), `lib/kv.ts:243`; see A-2 |
| 10 | Upload trusts the file name and MIME type | Open (low), `app/api/upload/route.ts:30` |
| 11 | `POST /api/seed` can still change Season 1 | Open (low), admin only |
| 12 | Secret compares return early on length | Open (low), `lib/admin-token.ts` `sameString` |
| 13 | One secret signs viewer sessions and staff cookies | Open (low), `lib/staff-token.ts` |
| 14 | Replacing a collection does not check its shape | Open (low), `app/api/collection/route.ts` POST without `pull` |
| 15, 16, 19, 20, 21, 23, 25 | Panel, trades, sandbox exit, extension, email | Not in this area (44.1, 44.4, 44.5) |
| 17 | Restoring a viewer drops print ids, ignores trades | Fixed: refuses while trades are open, restores by print id |
| 18 | Collection lock can be stolen after the TTL | Open (low), `lib/kv.ts` `withLock` releases with GET then DEL |
| 22 | Same-day backup deleted before the new one is stored | Open (low), `lib/backup.ts:137-138` |
| 24 | Paid print saved before Mix It Up confirms | Open (medium), `app/api/collection/route.ts:64` |
| 26 | Wiping a collection leaves escrow ledger hashes | Open (low), `lib/kv.ts` `deleteCollection`; `resetAllUsers` (`app/admin/actions/users.ts:100`) does not refuse while offers are open |

## Findings

### High

**S-1 (high, security): held privately, see SECRETS.md** (area: sandboxes and the overlay key, `lib/overlay-key.ts`, `lib/sandbox.ts`).

**A-1. Assets "Unused" lists files that are in use or must be kept, and "Delete all unused" deletes them**

**Severity and category:** high, bug (data loss).

**Where:**
- `lib/assets.ts:66-89` (`collectReferenced`)
- `lib/assets.ts:118` (`list` with no prefix)
- `lib/assets.ts:185` (anything unreferenced and older than 10 minutes is "unused")
- `app/admin/assets/UnusedPanel.tsx:70-79` (Delete all unused)

**Evidence:** the referenced set only covers:
- pack covers;
- card art, with its thumbnail;
- card sounds;
- still frames.

It does not include:
- `fullArtImageUrl` (the Full Art art, uploaded from `AddCardDialog.tsx:82`);
- card back images and logos (`card-back/Properties.tsx:108,122`);
- Overlay Editor custom layer images (`CustomLayerPanel.tsx:54`);
- the encrypted backups (`backups/<date>.json.gz.enc`, `lib/backup.ts:138`), which sit in the same store.

The blob list has no prefix, so all of these show as Unused. `deleteUnusedBlobs` re-checks against the same incomplete set, so the server check does not save them. One "Delete all unused" removes every backup and every Full Art image.

**Fix:**
- Add `fullArtImageUrl` (and its thumbnail), the card back and overlay layer URLs to `collectReferenced`.
- Never list or delete anything under `BACKUP_PREFIX`.

**Size:** M.

### Medium

**A-2. The overlay uploads the whole collection on every pull**

**Severity and category:** medium, bug and efficiency.

**Where:** `public/widget.js:1487`

**Evidence:**
- `saveCollection(pull)` always sends `{ data: revealedCardsByUser, pull }`.
- Both callers (`widget.js:2072`, `2224`) pass `pull`.
- The server ignores `data` when `pull` is present.

The request body grows with the season. Once it passes Vercel's 4.5 MB request limit, every pull save fails with 413 and editions stop being saved on stream.

**Fix:** `const body = { pull };` (one line, not applied in this read-only audit).

**Size:** S.

**A-3. The card-pulled outgoing webhook may never be sent**

**Severity and category:** medium, bug.

**Where:** `app/api/collection/route.ts:105-109`

**Evidence:** `getWebhookSettings().then(fireOutgoing...)` is not awaited and not wrapped in `after()`, and the response returns straight away. On serverless the function can be frozen before the fetch runs.

**Fix:** wrap it in `after(() => ...)`, as `recordActivity` does.

**Size:** S.

**A-4. The Users list does one profile read per collector**

**Severity and category:** medium, efficiency.

**Where:** `app/admin/users/page.tsx:33`

**Evidence:** `Promise.all(users.map(u => getUserProfile(...)))` makes N KV GETs. They are pipelined, but each still counts as a command. The same request also reads every season's collection blob and the latest 500 activity events.

**Static count:** about N + seasons + 3 reads per page view.

**Fix:** one `mget` of the profile keys in chunks of 100.

**Size:** S.

### Low

**A-5. The dashboard reads in a waterfall and lists seasons twice**

**Category:** efficiency.

**Where:** `app/admin/page.tsx:26-73`

**Evidence:**
- `getActiveSeasonWithPacks`, `listSeasons`, `getStaff`, the layout, the presets and `loadDashboardData` run one after another.
- `listSeasons` repeats a read that `getActiveSeasonWithPacks` already made.
- `loadDashboardData` reads the whole season collection (`lib/dashboard-data.ts:149`).

**Static count:** about 15 to 30 reads, plus about 4 from the admin layout.

**Fix:** `Promise.all` the independent reads and pass the season list through.

**Size:** S.

**A-6. The overlay queue poll costs KV commands all day**

**Category:** efficiency.

**Where:** `app/api/webhooks/queue/route.ts`, `lib/overlay-key.ts`

**Evidence:** the overlay polls every 2 seconds. Each poll reads the overlay key, then dequeues, so about 2 to 3 commands each. That is roughly 86,000 to 130,000 commands a day per open overlay, before the heartbeat every 10 seconds.

**Fix:** cache the overlay key in module memory for about 30 seconds.

**Size:** S.

**A-7. The admin overlay-status poll runs every 5 seconds per open tab**

**Category:** efficiency.

**Where:** `app/admin/components/OverlayStatusContext.tsx:5`, `app/api/admin/overlay-status/route.ts`

**Evidence:** each poll is a staff check plus the status read, about 3 to 4 commands. That is about 60,000 a day per visible admin tab.

**Fix:** poll every 15 seconds, or skip the staff re-read with a short in-memory cache.

**Size:** S.

**A-8. Mutations that do not call `revalidatePath`**

**Category:** bug (stale client router cache only; admin pages are dynamic).

**Where:**
- `app/admin/dashboard/actions.ts:18,24,32`
- `app/admin/draft-actions.ts:88,95`
- `app/admin/overlay-actions.ts:56` (`saveOverlayZonesAction`)
- `app/admin/settings/actions.ts:29,41,49,57`: these redirect only.
- `app/admin/sandbox/actions.ts`: the `guarded()` tools redirect only.

Every other admin action is guarded and revalidates, directly or through a helper.

**Fix:** add `revalidatePath` for the page each one changes.

**Size:** S.

**A-9. The user page compare path reads the same collection twice**

**Category:** efficiency.

**Where:** `app/admin/users/[username]/page.tsx:153,156`

**Fix:** reuse the first read.

**Size:** S.

**A-10. Dashboard buttons and links use raw colour classes, not daisyUI `btn`**

**Category:** UI and UX.

**Where:** `app/admin/page.tsx:48,52,86,87,105`

**Fix:** `btn btn-sm` / `btn btn-ghost`.

**Size:** S.

**A-11. The legacy import route can still overwrite the legacy collection**

**Category:** delete-merge.

**Where:** `app/api/admin/import-legacy/route.ts`

**Evidence:**
- It is admin only.
- With `?overwrite=1` it replaces the collection with no lock and no ledger handling.
- The import has already run.

**Fix:** delete the route and its docs.

**Size:** S.

**A-12. `POST /api/seed` is still present**

**Category:** delete-merge (CODE_REVIEW #11).

**Where:** `app/api/seed/route.ts`

**Fix:** delete it. The sandbox and preview seeding cover its job.

**Size:** S.

**A-13. A note on backups, not a defect**

**Category:** security (low).

**Where:** `lib/backup.ts:138`

**Evidence:** backups are stored as public Blob files. They are encrypted, and a backup is refused without a key of at least 16 characters, so a leaked URL alone is not readable. Keep encryption mandatory.

**Size:** S.

### Counts

| Severity | Count |
|----------|-------|
| High | 2 (S-1, A-1) |
| Medium | 3 (A-2, A-3, A-4) |
| Low | 9 (A-5 to A-13) |

The open CODE_REVIEW items in the table above are not counted again here.

## Proposals

### Changes

**C-1. Cache the overlay key and the staff record in memory for a short time**

**Pitch:** cuts most per-request KV reads on the overlay poll, the heartbeat and every admin page.

**Touches:** `lib/overlay-key.ts`, `lib/staff-guard.ts`.

**Size:** M. **Value:** high.

**C-2. A `getUserProfiles(names)` helper built on `mget`**

**Pitch:** use it on the Users list, the leaderboard and the dashboard.

**Touches:** `lib/kv.ts`, `app/admin/users/page.tsx`, `lib/dashboard-data.ts`.

**Size:** S. **Value:** medium.

**C-3. Release the collection lock with a compare-and-delete script**

**Pitch:** one Lua `EVAL` instead of GET then DEL (CODE_REVIEW #18).

**Touches:** `lib/kv.ts`.

**Size:** S. **Value:** medium.

**C-4. Extend `check-staff-guards` to flag missing revalidation**

**Pitch:** flag any admin action that writes but neither revalidates nor redirects, so A-8 cannot come back.

**Touches:** `scripts/check-staff-guards.mts`.

**Size:** S. **Value:** low.

**C-5. Delete the import-legacy and seed routes and their docs**

**Touches:** `app/api/admin/import-legacy`, `app/api/seed`, `docs/reference.md`.

**Size:** S. **Value:** low.

### Feature improvements

**F-1. Assets knows every kind of file**

**Pitch:** backups, card backs, overlay layers and Full Art art show as their own kinds, with a protected tab that can never be bulk deleted.

**Touches:** `lib/assets.ts`, `app/admin/assets/*`.

**Size:** M. **Value:** high.

**F-2. The Users list pages and searches on the server**

**Pitch:** stop rendering every collector at once.

**Touches:** `app/admin/users/page.tsx`, `UserSearch`.

**Size:** M. **Value:** medium.

**F-3. A dashboard health strip**

**Pitch:** shows last backup age, data health warnings and unused-asset bytes next to the overlay status.

**Touches:** `app/admin/page.tsx`, `lib/dashboard-data.ts`, `lib/backup.ts`.

**Size:** S. **Value:** medium.

**F-4. A backup dry run**

**Pitch:** per backup, show key counts and which keys a restore would change before anything is written.

**Touches:** `app/admin/settings/BackupsPanel.tsx`, `lib/backup.ts`.

**Size:** M. **Value:** medium.

### Experimental features

**E-1. Adaptive overlay polling**

**Pitch:** back off to 5 seconds after a minute with an empty queue, and return to 2 seconds on any event.

**Cheap trial:** a flag in `widget.js`, used for one stream.

**Success signal:** queue commands a day drop by more than half, with no delay noticed on stream.

**Touches:** `public/widget.js`, `app/api/webhooks/queue`.

**Size:** S. **Value:** medium.

**E-2. One ledger entry per pull instead of one season blob**

**Pitch:** pulls are saved as one ledger entry each, not by rewriting the whole season blob (CODE_REVIEW #9).

**Cheap trial:** in a sandbox, seed 300 viewers with `seedUsers` and time a pull save against the blob size.

**Success signal:** save time stays flat as the crowd grows.

**Touches:** `lib/kv.ts`, `app/api/collection`.

**Size:** L. **Value:** high.

**E-3. A weekly admin digest from the audit log**

**Pitch:** a weekly summary built from the audit log and activity.

**Cheap trial:** render it on the dashboard on demand for two weeks.

**Success signal:** it gets opened weekly and replaces checking several pages.

**Touches:** `lib/audit.ts`, `app/admin/page.tsx`.

**Size:** S. **Value:** low.

### UI and UX improvements

**U-1. "Delete all unused" breaks the files down before deleting**

**Pitch:** the confirm dialog lists the files by folder and kind, and refuses anything under `backups/`.

**Touches:** `app/admin/assets/UnusedPanel.tsx`.

**Size:** S. **Value:** high.

**U-2. Dashboard actions use `btn` like the rest of the admin**

**Touches:** `app/admin/page.tsx`.

**Size:** S. **Value:** low.

**U-3. The activity feed pauses itself when idle**

**Pitch:** after 10 minutes with no input, polling stops and a Resume chip appears, to save polling on forgotten tabs.

**Touches:** `app/admin/activity/ActivityFeed.tsx`.

**Size:** S. **Value:** low.
