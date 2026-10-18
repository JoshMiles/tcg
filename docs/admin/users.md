# Users admin

> Read this when you touch tags and moderation, restore points, the audit trail, the user detail page, avatars.

## Users admin: tags, moderation, restore points, audit
- **Tags / flags** live on `UserProfile` (`tags`, `flags: { noTrading, hideFromBoard, reason, at }`); helpers in `lib/user-admin.ts`. `hideFromBoard` also maintains the KV set `users:hidden` (`getHiddenUsers()`), which the leaderboard, `ownersByCard` and `getRecentPulls` filter on; their own collection page still works. `noTrading` is enforced in the trade engine (`createInLock`, `acceptTrade`): a blocked viewer can't offer/accept and can't be offered to; cancelling still works.
- **Restore points**: `takeUserSnapshot` runs before reset season / reset all / delete / merge / restore (keys `user:<u>:snap:<id>`, 14-day TTL, newest 6). `restoreUserSnapshot` replaces each saved season collection and takes a point of what it overwrites. **Merge** (`mergeUsers`) moves all cards into another account, unions tags, deletes the old profile; refused while either has open trades.
- **Audit trail** (`lib/audit.ts`): `recordAudit` on every admin action on a viewer (`audit:user:<u>` 100, `audit:all` 500); best-effort. Add a call to any new admin user action. All user actions call `requireAdmin()` themselves (`app/admin/users-actions.ts`, `actions.ts`).
- `lib/stats.ts` keeps `stats:last` (last counted action per viewer) for "last seen". `scripts/check-users.mts` (mock KV) covers tags, restrictions, restore, merge.

## Admin user detail page (`/admin/users/[username]`)
- Fetches profile + all seasons + collections in parallel
- Shows per-season card grid: owned cards with image + rarity border, unowned as `?`
- ×N badge on cards pulled more than once
- Hover × button on owned cards to remove one instance (calls `removeUserCard` server action)
- Grant card select form per season
- Danger zone: Reset All Seasons (wipes all collection entries) + Delete User (wipes collections + profile, redirects to `/admin/users`)
- 404 if no cards and no profile found

## User avatars
Admin pages (dashboard Top Collectors, users list, user detail) show each user's Twitch profile picture. `getAvatars(usernames)` in `lib/avatars.ts` batches Helix `users?login=…` lookups (`fetchTwitchAvatars` in `lib/twitch-helix.ts`, up to 100 per request) and caches results in the KV hash `twitch:avatars` (login → `{ url, at }`; 7 days for found, 1 day for "no avatar"). It never throws, without `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET`, or if Twitch is down, users just get the initial-letter fallback, and a failed lookup is not cached. Logins that can't be Twitch names (e.g. `mrbeast#`) are skipped. Use `sizeTwitchAvatar(url, px)` to request the right size and the `Avatar` client component (`app/components/Avatar.tsx`) to render it; it falls back to the initial if the image fails to load.
