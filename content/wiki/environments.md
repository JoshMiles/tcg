---
title: Environments
summary: Production, previews, local mock data, backups, and which secrets matter.
order: 70
covers: lib/sandbox.ts, lib/db.ts, lib/backup.ts, app/admin/settings/PreviewDataPanel.tsx, app/admin/settings/BackupsPanel.tsx
---

## Three places data can live

**Production** is `https://cheesytcg.app`, the `main` branch. This is the live game. A merge to `main` deploys it.

**Preview** is any other branch's deployment. It uses the production database credentials but is fenced into one sandbox (`sbx:preview`). It starts empty. Settings, Environment can copy the live setup in, or wipe that copy. Uploads still go to the real Blob store, so a preview upload is a real file and shows under Unused. Preview URLs ask for a Vercel login, so they do not work as an OBS browser source or inside Twitch. Test those on production, or locally.

**Local** is your machine against a fake database (the mock KV described in `docs/local-dev.md`). It must not be pointed at production. A saved pull writes a real card for a real viewer. The overlay test panel's Reset buttons write too.

Sandboxes inside production (Admin, Sandbox) are named copies for trying a trade or an upgrade. They do not call Discord, and paid pulls do not run in them. Leaving a sandbox returns you to live data. Check the sandbox pill before you grant or delete.

## Deploys

Pushing a branch builds a preview. Merging to `main` builds production. Environment variable changes apply on the next deploy, not when you click save in Vercel.

The admin sidebar shows the build (`v…` and a short commit). The Twitch panel reads the same stamp from `/api/version`. If a viewer has an old panel, that corner is the check.

OBS caches the overlay. After a deploy that changes it, refresh the browser source cache.

The game's public name and channel links come from the site config. Do not hard-code a different channel into a page.

## Backups

A nightly job writes one encrypted file to Blob and keeps 14 days. It refuses to run outside production, and inside a sandbox. It will not write at all without `BACKUP_ENCRYPTION_KEY`. Keep a copy of that key somewhere that is not the database: a backup cannot be read without it.

Settings, Environment shows the newest backup and turns red when it is older than 36 hours. **Back up now** runs one immediately, on production only.

Restoring is a script in the repo. By default it restores into a sandbox you then open from Admin, Sandbox. Putting keys straight back onto production is a separate, explicit flag. Do not run that because a viewer is missing one card.

Brie Bucks (the Mix It Up currency) has its own backups. [TCG Bridge](/admin/wiki/tcg-bridge) keeps them on the stream PC, and the site records no backup runs for them.

## Scheduled jobs

All of them use the cron secret and do nothing outside production. They are set in `vercel.json`:

- Backup, daily at 04:00.
- Accounts, daily at 04:30.
- A job every minute.
- Weekly, Sundays at 20:00 UTC: it picks the edition of the week and sends the community digest and the admin digest. On the first Sunday of the month it also runs a restore drill and posts PASSED, a warning or FAILED to the Discord admin log.

## Secrets, by what they unlock

The Environment tab lists every variable as set or not set. It never shows the value. The names that matter day to day:

| Name | What stays off without it |
| --- | --- |
| `ADMIN_PASSWORD` and `ADMIN_COOKIE_SECRET` | The emergency password login. The cookie secret signs the cookie and needs 16 or more characters. `ADMIN_SECRET` no longer signs anything and can be removed. |
| `SITE_URL` | Nothing breaks. It sets the public address used in login redirects and links, and defaults to the production domain. |
| `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` | The Cloudflare Turnstile check before trades and upgrades on the website. Without both, those skip the check. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` and `DISCORD_BOT_TOKEN` | Linking a Discord account (viewer Settings, Notifications) and Discord direct message alerts. All three must be set or the option stays hidden. |
| `GITHUB_CHANGELOG_TOKEN` | The What's new pages. Without it only the hand-written history shows. |
| `LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_EMAIL` and `LEGAL_GOVERNING_LAW` | The legal pages. |
| `ADMIN_PASSWORD_LOGIN=off` | Switches that password door off. |
| `SESSION_SECRET` | Website login, and the staff cookie. |
| `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` | Twitch login and profile pictures. The [Twitch connection](/admin/wiki/twitch) on the Stream page also needs these, plus `BACKUP_ENCRYPTION_KEY`. |
| `TWITCH_EXTENSION_SECRET` | The panel's signed requests. |
| `KV_REST_API_URL` and `KV_REST_API_TOKEN` | The database. Preview has these too, and is fenced in code. |
| `BLOB_READ_WRITE_TOKEN` | Uploads and the Assets page. |
| `BACKUP_ENCRYPTION_KEY` and `CRON_SECRET` | Nightly backups and the weekly job. Both refuse a short or missing secret. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Phone and browser push. Hidden until the pair is set. |
| `SUPER_ADMIN_TWITCH_IDS` | Extra super admins, by numeric Twitch id, besides the owner baked into the code. |

Never paste a value into chat, a pull request, or this wiki. If one leaks, rotate it in Vercel and redeploy. Rotating `SESSION_SECRET` signs everyone out. Rotating `ADMIN_COOKIE_SECRET` ends any emergency password session. Rotating the overlay key is done from Settings, OBS Overlay, and then every OBS source must be updated.

## Data health

The same Environment tab (sections Security, Backups, Data health and the variable list) measures how big each season's collection blob is. The whole collection is rewritten on every pull, trade, and upgrade. The panel warns as it grows (from about 512 KB, and louder from about 2 MB). That is a capacity warning, not a button that splits the data. Stuck escrow is listed there too.
