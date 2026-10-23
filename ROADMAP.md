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
| 42.1 | Version from the PR number, and a "New version available" prompt | Ready | M |
| 35.1 | iPhone icon still a "C" (server side checked again 2026-10-23; test Safari against Chrome) | Blocked (user) | S |
| 40.2e | Site speed: cache public pages for signed-out visitors | Blocked (field data, re-check 2026-11-06) | M |
| 34 | Next extension version (34.1 to 34.8) | Blocked (panel freeze, check review 2026-10-30) | L |

Tracks 25 to 33 and 36 are done and archived in `docs/archive/roadmap-history.md`, including the edition / print glossary (25.2) and the 29.3 decision.

## Track 35: home-screen app (2026-10-20)

Read `docs/public-site.md` (install topic) first. #330 gave the icon a new URL (`apple-touch-icon-v3.png`), added the 180 px manifest entry and removed `app/apple-icon.png`. Production checked again on 2026-10-23: signed-out visitors land on `/closed`, whose head links `/apple-touch-icon-v3.png` (180x180); that file, the root `apple-touch-icon.png`, `-precomposed.png` and the manifest all serve 200. The "C" is iOS's letter fallback, so the fault is on the device. The user re-added the app and still got the "C"; their default browser is Chrome.

### 35.1 iPhone icon still a "C" (Blocked on the user, S)
1. **Safari against Chrome (user):** delete the home-screen app. Open `cheesytcg.app` in **Safari** (it works whatever the default browser is), Share > Add to Home Screen. Then try the same from Chrome's share button.
2. **If Safari shows the mascot and Chrome the "C":** Chrome on iPhone is the cause and nothing on the server can fix it. Change the iPhone step in `app/components/site/InstallGuide.tsx` (it says "Chrome and Edge on iPhone can do it too"): tell iPhone users to use Safari, and update the install topic in `docs/public-site.md`. Close 35.1.
3. **If Safari shows the "C" too, diagnose (user, with a Mac):** iPhone Settings > Apps > Safari > Advanced > Web Inspector on, plug into the Mac, Safari > Develop > the iPhone. Open `cheesytcg.app`, open the Network tab, then Share > Add to Home Screen. Note whether `/apple-touch-icon-v3.png` is requested and what comes back, the iOS version, and whether "Open as Web App" was on. Bring that back to planning.

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

## Track 42: versions and the update prompt (2026-10-23)

### 42.1 Version from the PR number, and a refresh prompt (Ready, M)
Read `docs/hosting.md` ("Build version") first, and update it. Today `BUILD_VERSION` is the hand-bumped `package.json` semver (`v1.1.0 · 75fdb70`), so it rarely moves.

1. **Version.** In `next.config.ts`, build the version as `<major>.<PR number>`: the major from `package.json`, the PR number from the `(#N)` at the end of the commit subject (every merge to `main` is a squash merge). On Vercel the subject is `VERCEL_GIT_COMMIT_MESSAGE`; locally `git log -1 --format=%s`. On a preview build use `VERCEL_GIT_PULL_REQUEST_ID` with a `-pr` suffix (`1.438-pr`); with neither, fall back to the `package.json` version. No GitHub API call, so it can't fail a build. It is the PR number, not a count of merged PRs (closed PRs leave gaps), but it only goes up. Shows as `v1.437 · 179a138` everywhere the badge does now.
2. **Prompt.** A small client component in the site shell and the admin shell compares the commit baked into the page (`getBuildInfo()`) with `GET /api/version`. It checks when the tab becomes visible again and every 10 minutes while visible (never while hidden). When the commit differs, show a toast: "A new version is available" with **Refresh** (a normal reload, so pages with unsaved changes still ask first through their own guard) and a close button that hides it until the next new commit. Never reload by itself. Skip it in dev (`BUILD_ENV` development).
3. `/api/version` keeps its fields (the released Twitch panel reads `version`); only the value's format changes. Not the overlay (OBS has nobody to click it; it stays refreshed by hand) and not the panel (frozen; an idea for Track 34).

Check: a local build shows `v1.<n>` from the latest commit subject; with the page open, a second build with another commit makes the toast appear on refocus; Refresh loads the new build; close keeps it hidden for that commit. Player-facing changelog line for the prompt.

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
- No offline caching of pages or data: `public/sw.js` caches only the offline page so nobody sees stale cards or scores (Track 35).
