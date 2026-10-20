# The Cheesy TCG, roadmap

**Last updated 2026-10-20**

Open work only. Owned by the planning model (Opus, see "Model workflow" in `CLAUDE.md`). Execution picks up items marked Ready; Needs design or Needs a decision goes back to planning (or to the user) first. When an item ships, delete it here and make sure its area doc in `docs/` describes the result. Finished items and their original designs are archived in `docs/archive/roadmap-history.md`; read it only when you need the reasoning behind a done item.

**Status legend:** Ready (the design here is enough to build) · Needs design · Needs a decision (the user chooses) · Blocked (waiting on something outside the repo).

## Rules in force

- **Twitch panel freeze (from 2026-10-15).** The extension is under Twitch review. Do not touch `public/twitch-panel/*`, `scripts/lib/twitch-package.mjs`, the behaviour or response shape of `/api/twitch/*`, or the CORS rules in `middleware.ts` until the user lifts it. Panel-worthy ideas go under "Next extension version".
- One feature per PR, branched from up-to-date `origin/main`; every push gets a PR (see "Git and PRs" in `CLAUDE.md`).
- No em dashes, no emoji in the UI, FAQ / Privacy / Terms kept in step (`scripts/check-words.mts`), `npm run verify` before every PR.

## Open items

| # | Item | Status | Size |
|---|------|--------|------|
| 32.2 | Variant glow and rock CSS regressions | Ready | S |
| 32.4 | Discord link: relink and one-account claim | Ready | S |
| 32.5 | New pack flow leftovers | Ready | S |
| 32.6 | Variant scripts and the Shiny label leftovers (after 32.2) | Ready | S |
| Ext | Next extension version | Blocked (panel freeze) | L |
| 29.5 | Let Golden be pulled, including the Twitch panel | Blocked (panel freeze) | M |
| 30.4 | Use a trainer card from the Twitch panel | Blocked (panel freeze) | S |
| 25.2p | The panel still says print for a copy (edition / print words) | Blocked (panel freeze) | XS |

Tracks 25 to 31 and 33 are done and archived in `docs/archive/roadmap-history.md`, including the edition / print glossary (25.2) and the 29.3 decision.

## Track 32: review of PRs #297 to #310 (2026-10-20)

Those PRs were merged without a review. Findings were checked against `main`. One PR per item, each from up-to-date `origin/main`. Each fix adds a regression case to the matching `scripts/check-*.mts`. 32.2 to 32.6 touch different files and can run in parallel, except that 32.2 and 32.6 both touch variant labels: run 32.6 after 32.2.

### 32.2 Variant glow and rock CSS (Ready, S)
- `buildHoloSpecs` (`lib/holo-core.ts`) sets `on: true` when only glow or rock is on, so `holoClass()` adds the default shimmer to a variant whose shimmer is off. Add a separate shimmer flag, used by `holoClass`, while `holoVars` keeps the glow and rock variables.
- `app/globals.css` (#308) added `.vfx-reverse` to the `!important` glow rule, the rock animation and the `.ug-art` / `.tr-art` rules. That overrides the rarity box shadow on the copy page, Card Dex, `CardDetail` and `PrintOfWeek`. Take `.vfx-reverse` out, restore the old blue and amber glow fallbacks and the 1.6deg Full Art Holo rock, and only animate when `--rock-amt` is set.
- Add a check: shimmer off with glow on gives `holoClass() === ''`.

### 32.4 Discord link (Ready, S)
- `saveDiscordLink` (`lib/discord-user.ts`) leaves the old `discord:user:<id>` index when a collector links a different Discord account, so that account can never be linked again. Delete the old index.
- Claim the index with `set nx` before writing the link, so two collectors cannot link one Discord account. Add a 30 second cooldown on the test DM. Log only the status code of Discord errors.

### 32.5 New pack flow leftovers (Ready, S)
- The dashboard "New pack" shortcut (`app/admin/dashboard/widgets.tsx`) still links `/admin/packs/new`, which only redirects. Use `NewPackButton`.
- `SeasonFlow` "Create a pack" now leaves the wizard in the same tab and can drop unsaved season edits. Open the new pack in a new tab, or flush the autosave first.
- `createDraftPack` has no `revalidatePath`. `PackWorkspace` reloads the page after publish: use `router.refresh()`. Fix `docs/admin/packs-and-seasons.md` ("the wizard's").

### 32.6 Variant scripts and labels (Ready, S, after 32.2)
- `scripts/migrate-variant-rarity.mts` and `scripts/audit-variant-rarity.mts` cannot run. They import functions that are not exported, read `cardId` instead of `cardNumber`, compare string ids with numbers, and use a 100000 offset instead of `VARIANT_OFFSET`. Delete them unless someone needs the remap. If it is kept, rewrite it against the real APIs with a mock-KV check.
- Rename the leftover user-visible "Shiny" labels to Full Art Holo or FH: `app/admin/seasons/[id]/page.tsx`, `app/admin/dashboard/widgets-extra.tsx`, `lib/dashboard.ts`, `lib/activity-view.ts`, `app/admin/activity/SummaryStrip.tsx`, `app/admin/users/UsersList.tsx`, `app/admin/components/AddCardDialog.tsx`, and docs. The internal id stays `shiny`.
- Small: drop the unused `GuidesMenu` import in `app/admin/overlay/EditorTopBar.tsx`.

## Blocked by the Twitch panel freeze

Nothing in a Ready item edits the frozen paths listed under "Rules in force".

### Ext: next extension version

**Security, panel collection (ship with the next panel version, not before the freeze lifts).** `GET /api/twitch/collection` takes `username` and returns that viewer's card numbers for every season they have cards in, including drafts, with no session, extension JWT or private-profile check. The released panel calls it that way (`public/twitch-panel/panel.js`, no `Authorization` header). When the freeze lifts: drop draft seasons; for a private profile return cards only when the caller is that viewer (a Twitch extension JWT checked with `verifyExtensionAuth`, or a website session); keep the JSON shape `{ username, collections: [{ seasonId, seasonName, active, ownedNumbers }] }`. Public profiles can keep answering without a token so the panel already under review still loads. Do not change this route, `public/twitch-panel/*`, the package builder or the extension CORS while the freeze is on.

Ship as one reviewed panel version: the pack card back on the panel's flip backs (20.3), choosing prints when trading (6.4: composer and accept picker, exact serial preview), favourite prints (9.1: hearts and disabled picks), "Reversed by staff" on reversed trades (9.2), staff and tester badges, achievements, Looking for / listing alerts, the binder, share images, the copies-first dialog (2.5), unique numbers on tiles (2.1), a link to `/trade/<id>` from the Trades tab, anything Twitch reviewers asked for. Bump `version` in `package.json`, rebuild the zip, refresh screenshots, update the change log in `twitch-extension/SUBMISSION.md`. When the freeze lifts, also take 29.5 and 30.4 from the blocked list below.

### 29.5 Let Golden be pulled, including the Twitch panel (Blocked, panel freeze)

When the freeze lifts, in the same panel version as Ext:
- Turn `GOLDEN_PULLS` on. Packs opt in by setting a Golden weight (default stays 0, so nothing changes until a pack is edited).
- Teach `public/twitch-panel/panel.js` (and its CSS) the five-id list and index 4, or Golden entries render as a bad card number. Collection, season and upgrade responses may gain the new variant in existing arrays; do not change the JSON keys. `/api/twitch/upgrade` must understand a step up to Golden once the ladder includes it.
- Overlay already learned Golden in 29.1 and 29.4.
- Rebuild the extension zip (`scripts/lib/twitch-package.mjs` is in the freeze too). Bump `version`, screenshots, `twitch-extension/SUBMISSION.md`.

### 30.4 Use a trainer card from the Twitch panel (Blocked, panel freeze)

The panel can already show the card as a normal collection entry (Regular encoding). It has no Use button, and it must not grow one during the freeze. When the freeze lifts, add Use next to Upgrade on that card only, calling a new field on an existing authenticated route or a new `/api/twitch` route in that panel version (not before). Same two-tap, same consume rules as 30.2.


## Standing decisions

- Paid-pull limits default to no limit and stay editable. Staff can add extra pulls for everyone for the current stream.
- Stars keep setting the card value (29.3); `copyPoints` does not change.
- Trainer cards can be traded until used.

## User steps still open

Outside the repo; tick off or delete when done (listed as of 2026-10-16).
- [ ] **Overlay key (13.2):** copy the browser-source address (ends `?key=...`) from Settings → OBS Overlay into every OBS browser source, and each scene's address from the Overlay Editor, then refresh the sources. Clear the pull queue first.
- [ ] **Mix It Up paid pulls (Track 12), when wanted:** a Mix It Up webhook command answering `{ "balance": n }` for `action: "balance"` and taking the currency for `action: "deduct"`; then fill in the Mix It Up admin page, press **Check balance** and **Send test message**, and switch it on.
- [ ] **Web Push keys:** set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` the legal contact) in Vercel Production, redeploy, then try a real iPhone (app installed), Android and a desktop browser.
- [ ] **GitHub webhook (3.5):** repo Settings → Webhooks, Payload URL `<discord webhook URL>/github`, events: pushes, pull requests, releases, deployment statuses.
- [ ] **Discord channels:** add the channels you want in Admin → Settings → Webhooks (Trade listings, Admin log, System, Recap, Feedback) and press Test on each.
- [ ] **Share-image channel (26.6):** create the Discord channel, paste its webhook under Admin → Settings → Webhooks, tick Shares, and press Test. The button on the share tab does nothing until this exists.
- [ ] **Card name (25.3):** in the pack workspace, rename the live card Bottomygidds to Bottomgidds. The seed fix does not rewrite production.
- [ ] **Print bonus cutoff (27.4):** after that PR is deployed, open Admin → Settings → Scoring and set the cutoff to 40 if the saved value is still 20, then save. The new default does not overwrite a saved value, and scores move when you save.
- [ ] **iPhone icon (1.1, 7.1):** remove the home-screen app, delete `cheesytcg.app` under Settings > Apps > Safari > Advanced > Website Data, add it again from Safari; confirm the cheese logo shows.
- [ ] **Discord DM alerts (4.4):** create a Discord application and bot, invite the bot to the Cheesygidds server, add the redirect `https://cheesytcg.app/auth/discord/callback` in the Discord developer portal, and set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` and `DISCORD_BOT_TOKEN` in Vercel. The option stays hidden until then.
- [ ] **Email (22.1):** if not done yet, set `RESEND_API_KEY`, `EMAIL_FROM` and `RESEND_WEBHOOK_SECRET` in Vercel (see `docs/hosting.md`) to switch email notifications on.
