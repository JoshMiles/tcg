# The Cheesy TCG, roadmap

**Last updated 2026-10-23**

Open work only. Owned by the planning model (Opus, see "Model workflow" in `CLAUDE.md`). Execution picks up items marked Ready; Needs design or Needs a decision goes back to planning (or to the user) first. When an item ships, delete it here and make sure its area doc in `docs/` describes the result. Finished items and their original designs are archived in `docs/archive/roadmap-history.md`; read it only when you need the reasoning behind a done item.

**Status legend:** Ready (the design here is enough to build) · Needs design · Needs a decision (the user chooses) · Blocked (waiting on something outside the repo).

## Rules in force

- **Twitch panel freeze (from 2026-10-15).** The extension is under Twitch review. Do not touch `public/twitch-panel/*`, `scripts/lib/twitch-package.mjs`, the behaviour or response shape of `/api/twitch/*`, or the CORS rules in `middleware.ts` until the user lifts it. Panel-worthy ideas go under "Next extension version".
- One feature per PR, branched from up-to-date `origin/main`; every push gets a PR (see "Git and PRs" in `CLAUDE.md`).
- No em dashes, no emoji in the UI, FAQ / Privacy / Terms kept in step (`scripts/check-words.mts`), `npm run verify` before every PR.

## Open items

| # | Item | Status | Size |
|---|------|--------|------|
| 40.2g | Site speed: leaderboard LCP and Card Dex layout shift | Ready | S |
| 40.2f | Site speed: smaller Card Dex payload (owners load with the dialog) | Ready | S |
| 38.27 | Overlay Editor: preset / version thumbnails (live stills) | Ready | S |
| 41.1 | Pack workspace: Pack settings and Card back become tabs | Ready | M |
| 41.2 | Phone tab bar: the viewer's own collection replaces Card Dex | Ready | S |
| 35.1 | iPhone icon still a "C" (code shipped in #330; waits on the user step) | Blocked (user) | S |
| 40.2e | Site speed: cache public pages for signed-out visitors | Blocked (field data, re-check 2026-11-06) | M |
| 34 | Next extension version (34.1 to 34.8) | Blocked (panel freeze, check review 2026-10-30) | L |

Tracks 25 to 33 and 36 are done and archived in `docs/archive/roadmap-history.md`, including the edition / print glossary (25.2) and the 29.3 decision.

## Track 35: home-screen app (2026-10-20)

Production checked on 2026-10-20: `/apple-touch-icon.png` serves the opaque 180 px cheese mascot (200, `image/png`), the head has one plain `apple-touch-icon` link, the manifest icons serve, and the middleware matcher skips dotted paths, so the closed gate never touches icons. The "C" is iOS's letter fallback, meaning the phone didn't take the icon when the app was added, or kept an old failure. The server side is already right, so 35.1 starts on the device. Read `docs/public-site.md` (install topic) first. One PR per item.

### 35.1 iPhone icon still a "C" (Blocked on the user step, S)
The code shipped in #330 (`apple-touch-icon-v3.png`, the 180 px manifest entry, `app/apple-icon.png` removed). Left, both on the phone:

1. Do the "iPhone icon" user step at the bottom. Close this item if the mascot shows.
2. If it is still a "C", **diagnose (user, with a Mac):** iPhone Settings > Apps > Safari > Advanced > Web Inspector on, plug into the Mac, Safari > Develop > the iPhone. Open `cheesytcg.app`, open the Network tab, then Share > Add to Home Screen. Note whether `/apple-touch-icon-v3.png` is requested and what comes back, the iOS version, and whether "Open as Web App" was on. Bring that back to planning.

Not planned: offline caching of pages or data. `public/sw.js` deliberately caches only the offline page so nobody sees stale cards or scores.

## Track 38: Overlay Editor, the Photoshop pass (2026-10-21)

Goal: the Overlay Editor works like Photoshop; the rest of the pass has shipped. Read `docs/overlay.md` (layout, properties, editor) first. Rules: preview mode never touches the queue, heartbeat or collections; every new stored field goes through `sanitizeLayout()` with an empty default that equals today's look, plus a `scripts/check-overlay.mts` case.

### 38.27 Preset and version thumbnails (Ready, S)
Presets and the versions list show a small still of each entry. No image capture, no Blob upload and no new stored field: reuse `StillFrame` from `app/admin/overlay/ArtboardStrip.tsx` (a live, settled still of a layout in a same-origin iframe, already used by `CompareDialog`). A version passes its own `layout` and `props`; a preset passes its `props` with its `layout` if it saved one, else the editor's current layout (what applying it would show). Every still is a live iframe, so render them only for entries on screen and cap them as `ArtboardStrip` does (`MAX_BOARDS`). Check: a list of 20 versions stays responsive. If live stills still prove too heavy, bring it back to planning rather than adding a rasterising dependency.

**Not planned:** real-time co-editing, plugin / script actions, filters on card art (the card art is the pack's job), uploading font files.

## Track 40: site speed (2026-10-22)

The public site can feel sluggish, most of all on a phone. Measure first, then fix what the numbers point at; no speculative optimising. Read `docs/public-site.md` and `docs/hosting.md` first.

How to measure (Speed Insights through the Vercel MCP, Lighthouse flags, `npm run analyze`, why `inlineCss` was set aside) is in `docs/hosting.md`, "Measuring site speed". Field baseline on 2026-10-23, home only (the one route with enough samples): LCP p75 3.5 s, TTFB p75 838 ms. Lab: first-load JS has a 103 kB shared baseline; `/cards` is 160 kB gzipped.

### 40.2g Leaderboard LCP and Card Dex layout shift (Ready, S)
On a first visit the leaderboard's largest paint is the cookie notice, which only renders after hydration (LCP about 4.2 s, first paint 1.8 s): render it so it is not the LCP, or render it on the server. `/cards` has CLS 0.13 from the grid moving after first paint (not the images; look at the font swap and anything above the grid).

### 40.2f Smaller Card Dex payload (Ready, S)
`/cards` sends 181 kB of HTML on seed data, growing with cards. `app/(site)/cards/page.tsx` builds the top 10 owners and their avatars for every card (`ownersByCard(..., 10)`, `getAvatars`), but they only show in a card's dialog. Keep `collectors` in the page (the grid and sorting use it); load a card's owners when its dialog opens, from a small GET route that reuses `ownersByCard` for one card and respects hidden users as the page does now. No paging yet. Check: the HTML size before and after on seed data, and the dialog still shows owners with avatars.

### 40.2e Cache public pages for signed-out visitors (Blocked on field data, M)
Every public page is `force-dynamic` and the shell reads the session cookie, so nothing is cached. Caching can only win back the TTFB part of home's 3.5 s LCP (838 ms at p75), and it is the riskiest item here (the gate, the live badge, the session in the shell, 10 dynamic pages). On 2026-11-06, read two weeks of Speed Insights after #437 and 40.2g; plan the shell split only if TTFB is still a large share of LCP.

## Track 41: navigation (2026-10-23)

One PR per item, each from `origin/main`.

### 41.1 Pack settings and Card back tabs (Ready, M)
Read `docs/admin/packs-and-seasons.md` (the pack workspace) first. Today the pack settings, the card back editor, the overlay look, seasons and the danger zone are all stacked in the right panel when the pack itself is selected (`workspace/PackPanel.tsx`, opened by `?card=pack`), with the card back editor squeezed into `layout="stacked"`. Add two views to the tab row in `PackWorkspace.tsx` (`WorkspaceView`, after Overview): **Pack settings** (everything `PackPanel` shows except the card back, full width) and **Card back** (`CardBackEditor` in its wide layout). Both go through the same unsaved-changes / save flow as now; nothing about storage changes. Old addresses keep working: `?tab=settings` and `?card=pack` open the Pack settings view (`page.tsx` already redirects old `tab` values). Whatever selected the pack before (its row or button) now switches to the Pack settings view. Update the `PreviewPane` hint ("design it under Pack settings") to name the Card back tab. Check: edit a setting and the card back, save, reload, both kept; the old addresses land on the right view; the tab row still fits on a narrow window.

### 41.2 Phone tab bar: own collection (Ready, S)
Read `docs/public-site/basics.md` (the phone tab bar) first, and update it. The phone tab bar (`app/components/site/MobileTabBar.tsx`, below `xl`) is Home, Card Dex, Trade, Leaderboard, More. For a signed-in viewer the second tab becomes **Collection**, linking to `/u/<username>` and active there; Card Dex then moves into the More sheet. Signed out it stays Card Dex (nothing to link to). `SiteNav` already has the viewer (`NavUser`): pass it to `MobileTabBar`, and work out `SHEET_LINKS` from the tabs actually shown rather than the fixed `TAB_HREFS`, so no link is lost or doubled. Check at phone width signed in and signed out: five tabs, the right one active on your own profile, Card Dex reachable from More when signed in, nothing changes at `xl` and up.

## Blocked by the Twitch panel freeze

Nothing in a Ready item edits the frozen paths listed under "Rules in force".

### Track 34: next extension version (Blocked until the freeze lifts)

The panel went to Twitch review on 2026-10-15; check its status on 2026-10-30. The freeze blocks code, not planning: 34.7's planning pass can run now, so the whole track is Ready when the freeze lifts. All of it ships as one reviewed panel version. Every item edits `public/twitch-panel/panel.js`, so run them **one at a time** in the order below, each its own PR from `origin/main`; the version is submitted only after 34.8. Read `docs/twitch-extension.md` first. Rules for the whole track: never rename or remove a JSON key on `/api/twitch/*` (the released panel keeps working against new responses until viewers update); new data goes in new fields; reuse the website's existing APIs and `lib/` helpers rather than copying logic into the panel.

**34.1 Collection security (Ready once lifted, S).** `GET /api/twitch/collection` takes `username` and returns that viewer's card numbers for every season, drafts included, with no session, extension JWT or private-profile check. Drop draft seasons; for a private profile return cards only when the caller is that viewer (extension JWT via `verifyExtensionAuth`, or a website session); keep `{ username, collections: [{ seasonId, seasonName, active, ownedNumbers }] }`. Public profiles answer without a token so old panels still load. Make the new panel send its `Authorization` header. Check: private profile without a token gets no cards; drafts never appear. Severity is low (card numbers only; a draft shows only if the viewer has pulls in it), so it waits for the freeze rather than breaking the released panel.

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
