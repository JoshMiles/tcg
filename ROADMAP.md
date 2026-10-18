# The Cheesy TCG, roadmap

Open work only. Owned by the planning model (Opus, see "Model workflow" in `CLAUDE.md`). Execution picks up items marked **Ready**; **Needs design** or **Needs a decision** goes back to planning (or to the user) first. When an item ships, delete it here and make sure its area doc in `docs/` describes the result. Finished items and their original designs are archived in `docs/roadmap-history.md`; read it only when you need the reasoning behind a done item. Last updated 2026-10-18 (after #238).

**Status legend:** Ready (the design here is enough to build) · Needs design · Needs a decision (the user chooses) · Blocked (waiting on something outside the repo).

## Rules in force

- **Twitch panel freeze (from 2026-10-15).** The extension is under Twitch review. Do not touch `public/twitch-panel/*`, `scripts/lib/twitch-package.mjs`, the behaviour or response shape of `/api/twitch/*`, or the CORS rules in `middleware.ts` until the user lifts it. Panel-worthy ideas go under "Next extension version".
- One feature per PR, branched from up-to-date `origin/main`; every push gets a PR.
- No em dashes, no emoji in the UI, FAQ / Privacy / Terms kept in step (`scripts/check-words.mts`), `npm run verify` before every PR.

## Open items

| # | Item | Status | Size |
|---|------|--------|------|
| 20.2f | One flow for new packs; the pack wizard goes | Ready | M |
| 4.4 | Link a Discord account for DMs | Needs a decision | L |
| Ext | Next extension version | Blocked (panel freeze) | L |

### 20.2f One flow for new packs; the wizard goes (Ready, M)

Last part of the pack workspace (20.2a to 20.2e are done; the workspace is described in `docs/admin.md`, "The pack workspace").
- **New pack** (the library's button and the command palette) asks only for a name, creates the draft (`createDraftPack`) and opens the workspace on it.
- A draft shows a **Publish checklist** in the top bar (replacing the wizard's Review step, from `validatePack` and `packHealth`): has a name and cover, at least one card, every card has art, a name and odds above 0, stars set on imported cards, Full Art cards have full art where the versions need it, in at least one season (or "publish without a season" with the warning). **Publish** stays disabled until the blocking items pass; warnings can be accepted.
- `PackFlow` and the wizard routes are removed; `/admin/packs/new?draft=<id>` redirects to `/admin/packs/<id>`. The season wizard (`SeasonFlow`) is unchanged.
- Update `docs/admin.md` ("Drafts & wizards", the pack routes, the admin UX widths: the pack workspace is the second full-width workspace after the Overlay Editor) and `CLAUDE.md`'s wizards convention (packs use the workspace; seasons keep the wizard).
- **Not changed:** card and pack data shapes, KV keys, the public site, the overlay, the Twitch panel.
- **Checks:** `npm run verify`, `scripts/check-pack-editor.mts` grown for the draft and publish path, and a hand pass against the mock KV at 1280px and 390px. Blob uploads can't be checked locally; say so in the PR.

### 4.4 Link a Discord account for DMs (Needs a decision)

DMs need a **Discord bot**, not a webhook. The open question for the user: is a bot in the server acceptable (it shows in the member list, and its token is one more secret)? Revisit once push notifications (4.3) have been live for a while.

Sketch, if yes:
- User setup: a Discord application with a bot, invited to the Cheesygidds server (it can only DM people who share a server and allow DMs). Env: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`.
- Linking: Settings → Notifications → **Link Discord** runs Discord OAuth with `identify` only (code → token → read the id → revoke, never stored). Saved as `user:<u>:discord` `{ id, username, linkedAt }` plus `discord:user:<discordId>` → login (one Discord account per viewer). Unlink button; the export and Privacy Policy include it.
- Sending: `notify()` → for kinds ticked for Discord, "create DM channel" then "create message" with the bot token, in `after()`. On 50007 (DMs closed) record it and show "We couldn't DM you, check your privacy settings for the server" in Settings. One retry after `retry_after` on rate limits.

### Next extension version (Blocked until the freeze lifts)

Ship as one reviewed panel version: the pack card back on the panel's flip backs (20.3), choosing prints when trading (6.4: composer and accept picker, exact serial preview), favourite prints (9.1: hearts and disabled picks), "Reversed by staff" on reversed trades (9.2), staff and tester badges, achievements, Looking for / listing alerts, the binder, share images, the copies-first dialog (2.5), unique numbers on tiles (2.1), a link to `/trade/<id>` from the Trades tab, anything Twitch reviewers asked for. Bump `version` in `package.json`, rebuild the zip, refresh screenshots, update the change log in `twitch-extension/SUBMISSION.md`.

## User steps still open

Outside the repo; tick off or delete when done (listed as of 2026-10-16).
- [ ] **Overlay key (13.2):** copy the browser-source address (ends `?key=...`) from Settings → OBS Overlay into every OBS browser source, and each scene's address from the Overlay Editor, then refresh the sources. Clear the pull queue first.
- [ ] **Mix It Up paid pulls (Track 12), when wanted:** a Mix It Up webhook command answering `{ "balance": n }` for `action: "balance"` and taking the currency for `action: "deduct"`; then fill in the Mix It Up admin page, press **Check balance** and **Send test message**, and switch it on.
- [ ] **Web Push keys:** set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` the legal contact) in Vercel Production, redeploy, then try a real iPhone (app installed), Android and a desktop browser.
- [ ] **GitHub webhook (3.5):** repo Settings → Webhooks, Payload URL `<discord webhook URL>/github`, events: pushes, pull requests, releases, deployment statuses.
- [ ] **Discord channels:** add the channels you want in Admin → Settings → Webhooks (Trade listings, Admin log, System, Recap, Feedback) and press Test on each.
- [ ] **iPhone icon (1.1, 7.1):** remove the home-screen app, delete `cheesytcg.app` under Settings > Apps > Safari > Advanced > Website Data, add it again from Safari; confirm the cheese logo shows.
- [ ] **Email (22.1):** if not done yet, set `RESEND_API_KEY`, `EMAIL_FROM` and `RESEND_WEBHOOK_SECRET` in Vercel (see `docs/hosting.md`) to switch email notifications on.
- [ ] **Dependabot `braces` alert** (dev-only, via Tailwind 3): no patched release; dismiss as "no fix available" until upstream ships one.
