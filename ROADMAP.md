# The Cheesy TCG, roadmap

**Last updated 2026-10-21**

Open work only. Owned by the planning model (Opus, see "Model workflow" in `CLAUDE.md`). Execution picks up items marked Ready; Needs design or Needs a decision goes back to planning (or to the user) first. When an item ships, delete it here and make sure its area doc in `docs/` describes the result. Finished items and their original designs are archived in `docs/archive/roadmap-history.md`; read it only when you need the reasoning behind a done item.

**Status legend:** Ready (the design here is enough to build) · Needs design · Needs a decision (the user chooses) · Blocked (waiting on something outside the repo).

## Rules in force

- **Twitch panel freeze (from 2026-10-15).** The extension is under Twitch review. Do not touch `public/twitch-panel/*`, `scripts/lib/twitch-package.mjs`, the behaviour or response shape of `/api/twitch/*`, or the CORS rules in `middleware.ts` until the user lifts it. Panel-worthy ideas go under "Next extension version".
- One feature per PR, branched from up-to-date `origin/main`; every push gets a PR (see "Git and PRs" in `CLAUDE.md`).
- No em dashes, no emoji in the UI, FAQ / Privacy / Terms kept in step (`scripts/check-words.mts`), `npm run verify` before every PR.

## Open items

| # | Item | Status | Size |
|---|------|--------|------|
| 35.1 | iPhone icon still a "C" (code shipped in #330; waits on the user step) | Blocked (user) | S |
| 35.2 | Launch screen on iPhone | Ready | S |
| 35.3 | Richer Android install | Ready | S |
| 34 | Next extension version (34.1 to 34.8) | Blocked (panel freeze) | L |

Tracks 25 to 33 and 36 are done and archived in `docs/archive/roadmap-history.md`, including the edition / print glossary (25.2) and the 29.3 decision.

## Track 35: home-screen app (2026-10-20)

Production checked on 2026-10-20: `/apple-touch-icon.png` serves the opaque 180 px cheese mascot (200, `image/png`), the head has one plain `apple-touch-icon` link, the manifest icons serve, and the middleware matcher skips dotted paths, so the closed gate never touches icons. The "C" is iOS's letter fallback, meaning the phone didn't take the icon when the app was added, or kept an old failure. The server side is already right, so 35.1 starts on the device. Read `docs/public-site.md` (install topic) first. One PR per item.

### 35.1 iPhone icon still a "C" (Blocked on the user step, S)
Steps 2 to 4 shipped in #330 (`apple-touch-icon-v3.png`, the 180 px manifest entry, `app/apple-icon.png` removed). Left: step 1 on the phone and the user step at the bottom; close this once the mascot shows.

1. **Diagnose on the phone first (user, with a Mac):** iPhone Settings > Apps > Safari > Advanced > Web Inspector on, plug into the Mac, Safari > Develop > the iPhone. Open `cheesytcg.app`, open the Network tab, then Share > Add to Home Screen. Note whether `/apple-touch-icon.png` is requested and what comes back. Also note the iOS version, and whether "Open as Web App" was on.
2. **Give the icon a new URL.** Copy the PNG to `public/apple-touch-icon-v3.png` and point `metadata.icons.apple` (`app/layout.tsx`) at it. iOS caches per URL and clearing Website Data doesn't always clear it, but a new filename forces a fresh fetch. Keep the root `apple-touch-icon.png` and `-precomposed.png` (iOS probes those by name). Don't use a `?v=` query (see the layout comment).
3. **Cover iOS 26 using the manifest.** Add a 180 px `purpose: 'any'` entry (the same PNG) to `app/manifest.ts`, so a web app added from the manifest gets the mascot too.
4. Delete `app/apple-icon.png`. `metadata.icons` switches it off (the head has no link to it), so it is a dead third copy. Update the layout comment that names it.
5. Verify: `npm run verify`, then check the head and each URL on the preview deploy. The user then removes the app, clears Website Data and adds it again (see the user step below). Close this item once the mascot shows.

### 35.2 Launch screen on iPhone (Ready, S)
- iOS shows a white flash on launch with no `apple-touch-startup-image`. Add startup images for the common iPhone sizes: the mascot centred on `#0a0f1e`, made once with a script into `public/splash/` and listed in `metadata.appleWebApp.startupImage` with media queries. No runtime generation.
- Leave `statusBarStyle: 'black'` as it is. `black-translucent` would need safe-area padding on every page.

### 35.3 Richer Android install (Ready, S)
- Add 2 or 3 `screenshots` (phone size, `form_factor: 'narrow'`) to the manifest so Chrome shows the bigger install sheet. Take them from the seeded local site (`docs/local-dev.md`), never production data with real usernames.

Not planned: offline caching of pages or data. `public/sw.js` deliberately caches only the offline page so nobody sees stale cards or scores.

## Blocked by the Twitch panel freeze

Nothing in a Ready item edits the frozen paths listed under "Rules in force".

### Track 34: next extension version (Blocked until the freeze lifts)

All of it ships as one reviewed panel version. Every item edits `public/twitch-panel/panel.js`, so run them **one at a time** in the order below, each its own PR from `origin/main`; the version is submitted only after 34.8. Read `docs/twitch-extension.md` first. Rules for the whole track: never rename or remove a JSON key on `/api/twitch/*` (the released panel keeps working against new responses until viewers update); new data goes in new fields; reuse the website's existing APIs and `lib/` helpers rather than copying logic into the panel.

**34.1 Collection security (Ready once lifted, S).** `GET /api/twitch/collection` takes `username` and returns that viewer's card numbers for every season, drafts included, with no session, extension JWT or private-profile check. Drop draft seasons; for a private profile return cards only when the caller is that viewer (extension JWT via `verifyExtensionAuth`, or a website session); keep `{ username, collections: [{ seasonId, seasonName, active, ownedNumbers }] }`. Public profiles answer without a token so old panels still load. Make the new panel send its `Authorization` header. Check: private profile without a token gets no cards; drafts never appear.

**34.2 Edition words (Ready once lifted, XS).** Panel copy says "print" for a card copy; switch to "edition" and "serial number" (glossary 25.2), and "collected" / "pulls" for counts (Track 37).

**34.3 Golden (Ready once lifted, M).** Was 29.5. Turn `GOLDEN_PULLS` on; packs opt in with a Golden weight (default 0). Teach the panel and its CSS the five-id list and index 4. `/api/twitch/upgrade` understands a step up to Golden. Overlay already knows Golden (29.1, 29.4).

**34.4 Trainer card Use (Ready once lifted, S).** Was 30.4. A Use button next to Upgrade on trainer cards only, through a new field on an existing authenticated route or a new `/api/twitch` route. Same two-tap and consume rules as 30.2.

**34.5 Trades tab (Ready once lifted, M).** Choosing editions when trading (6.4: composer and accept picker, exact serial preview), "Reversed by staff" on reversed trades (9.2), a link to `/trade/<id>`.

**34.6 Collection view (Ready once lifted, M).** Pack card back on flip backs (20.3), favourite editions (9.1: hearts, disabled picks), serial numbers on tiles (2.1), the copies-first dialog (2.5), staff and tester badges.

**34.7 New panel sections (Needs design, L).** Achievements, the binder, Looking for / listing alerts, share images. Planning pass first: which fit a 318px panel, which are a link out to the site instead, and whether this splits into its own panel version.

**34.8 Release (Ready once lifted, S).** Anything Twitch reviewers asked for; bump `version` in `package.json`, rebuild the zip (`scripts/lib/twitch-package.mjs`), refresh screenshots, update the change log in `twitch-extension/SUBMISSION.md`. A new freeze starts at submission.


## Standing decisions

- Paid-pull limits default to no limit and stay editable. Staff can add extra pulls for everyone for the current stream.
- Stars keep setting the card value (29.3); `copyPoints` does not change.
- Trainer cards can be traded until used.
- Collection words (Track 37): collected = different cards of a set, pulls = every pull, edition = one numbered copy.

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
- [ ] **iPhone icon (1.1, 7.1, 35.1):** after 35.1 deploys, remove the home-screen app, delete `cheesytcg.app` under Settings > Apps > Safari > Advanced > Website Data, add it again from Safari; confirm the cheese logo shows.
- [ ] **Discord DM alerts (4.4):** create a Discord application and bot, invite the bot to the Cheesygidds server, add the redirect `https://cheesytcg.app/auth/discord/callback` in the Discord developer portal, and set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` and `DISCORD_BOT_TOKEN` in Vercel. The option stays hidden until then.
