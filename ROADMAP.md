# The Cheesy TCG, roadmap

**Last updated 2026-10-26**

Open work only. Owned by the planning model (Opus, see "Model workflow" in `CLAUDE.md`). Execution picks up items marked Ready; Needs design or Needs a decision goes back to planning (or to the user) first. When an item ships, delete it here and make sure its area doc in `docs/` describes the result. Finished items and their original designs are archived in `docs/archive/roadmap-history.md`; read it only when you need the reasoning behind a done item.

**Status legend:** Ready (the design here is enough to build) · Needs design · Needs a decision (the user chooses) · Blocked (waiting on something outside the repo).

## Rules in force

- **Twitch panel freeze (2026-10-26).** It was lifted so version 0.0.2 could be built; a light freeze starts when Josh submits 0.0.2 and lasts until Twitch answers: `public/twitch-panel/*` and the CORS rules in `middleware.ts` stay as submitted, and `/api/twitch/*` may only gain JSON keys (Track 53 waits for the review). Always: never rename or remove a JSON key on `/api/twitch/*` that the released panel reads.
- One feature per PR, branched from up-to-date `origin/main`; every push gets a PR (see "Git and PRs" in `CLAUDE.md`).
- No em dashes, no emoji in the UI, FAQ / Privacy / Terms kept in step (`scripts/check-words.mts`), `npm run verify` before every PR.

## Open items

| # | Item | Status | Size |
|---|------|--------|------|
| 35.1 | iPhone icon still a "C", and no launch screen (Safari and Chrome both) | Blocked (user) | S |
| 40.2f | Site speed: re-measure, then cache shared data if needed | Blocked (field data from 2026-11-09) | S to M |
| 43.1 | Upgrade Next.js 15.5 to 16.4 | Done | M |
| 43.2 | Bring back the page skeletons if 16 fixed the `?param` hang | Done | S |
| 43.4 | Bring the other packages up to date | Done | S |
| 43.5 | Move to TypeScript 7 | Done | S |
| 43.3 | Rename `middleware.ts` to `proxy.ts` | Ready | S |
| 46 | Data correctness (46.1 to 46.7) | Ready | S to M |
| 47 | Access hardening (47.1 to 47.9) | Ready (47.8 needs a decision) | M |
| 48 | KV efficiency (48.1 to 48.7) | Ready (48.7 needs design) | M to L |
| 49 | Mod panel UI, cleanup and polish (49.1 to 49.6) | Ready | S |
| 50 | Player features and trials (50.1 to 50.12) | Ready (50.3 needs design) | M |
| 51 | Staff and admin tools (51.1 to 51.14) | Ready | M |
| 52 | UI and UX from the page walk (52.1 to 52.16) | Ready | S each |
| 53 | Next panel version, 0.0.3 (34.6b; 47.4, 50.1, 50.2, 50.4, 49.6, 52.16 ride along) | Ready (waits for 0.0.2 review) | M |

Tracks 25 to 33, 36, 38, 41 and 42 are done and archived in `docs/archive/roadmap-history.md`, including the edition / print glossary (25.2) and the 29.3 decision.

## Track 35: home-screen app (2026-10-20)

Read `docs/public-site.md` (install topic) first. #330 gave the icon a new URL (`apple-touch-icon-v3.png`), added the 180 px manifest entry and removed `app/apple-icon.png`. Production checked again on 2026-10-23: signed-out visitors land on `/closed`, whose head links `/apple-touch-icon-v3.png` (180x180); that file, the root `apple-touch-icon.png`, `-precomposed.png` and the manifest all serve 200. The icon is a plain 8-bit RGB 180 px PNG (no alpha, not interlaced), served `image/png` with ordinary headers; every tag is in `<head>`. The user re-added the app from Safari and from Chrome on 2026-10-23: the "C" both times, and the launch screen (the mascot on black) doesn't show either. One server-side lead: Next 15.5 turns `appleWebApp.capable` into `mobile-web-app-capable` only, with no `apple-mobile-web-app-capable`, which iOS has needed before it uses `apple-touch-startup-image`. Fixed in #439 (live); it likely explains the launch screen, and may or may not explain the icon.

### 35.1 iPhone icon still a "C" (Blocked on the user, S)
1. After the `apple-mobile-web-app-capable` fix is live, delete the home-screen app and add it again from Safari. Close 35.1 if the mascot and the launch screen show.
2. **Rule out the phone (user):** add another site (github.com) to the home screen; if it also gets a letter, look at content blockers (Settings > Apps > Safari > Extensions), Lockdown Mode and iCloud Private Relay rather than this site. Note the iPhone model, the iOS version, and whether the app opens full screen without Safari's bars.
3. **If only this site gets a "C", diagnose (user, with a Mac):** iPhone Settings > Apps > Safari > Advanced > Web Inspector on, plug into the Mac, Safari > Develop > the iPhone. Open `cheesytcg.app`, open the Network tab, then Share > Add to Home Screen. Note whether `/apple-touch-icon-v3.png` is requested and what comes back, the iOS version, and whether "Open as Web App" was on. Bring that back to planning.

## Track 40: site speed (2026-10-22)

The public site can feel sluggish, most of all on a phone. Measure first, then fix what the numbers point at; no speculative optimising. Read `docs/public-site.md` and `docs/hosting.md` first.

How to measure (Speed Insights through the Vercel MCP, Lighthouse flags, `npm run analyze`, why `inlineCss` was set aside) is in `docs/hosting.md`, "Measuring site speed". Field baseline on 2026-10-23, home only (the one route with enough samples): LCP p75 3.5 s, TTFB p75 838 ms. Lab: first-load JS has a 103 kB shared baseline; `/cards` is 160 kB gzipped.

### 40.2f Re-measure, then cache shared data if LCP still waits on it (Blocked on field data, S to M)
The public shell is prerendered and served from the CDN since 40.2e (Cache Components; see `docs/hosting.md`). Nothing is cached across requests yet.
1. **Measure (from about 2026-11-09, a week after 40.2e is live):** Speed Insights for home on phones and desktop, TTFB and LCP p75, against the early read (phones TTFB 1.3 s of LCP 3.9 s). Find home's LCP element with a lab trace (`chrome-devtools-mcp` against `next start` on the mock KV, see the 40.1 learning). Check Fluid compute is on. If LCP p75 is under 2.5 s, close 40.2f.
2. **If LCP is KV data (card art, podium):** wrap the shared public reads (`getSeasonOverview`, the collection behind the leaderboard, the active season, hidden users) in `'use cache: remote'` functions that take the sandbox id as an argument and run under `runInSandbox` (`cookies()` / `headers()` throw inside a cache scope). Tag by season and `catalog`, and call `updateTag` on every write that changes them (draws, trades, upgrades, admin pack / card / season / user edits, sandbox actions): a pull on stream must show within seconds. This replaces the 20 s in-memory `boardCache`. Never cache per-user data.

## Track 43: framework upgrade (2026-10-24)

We run Next.js 15.5.28 (`^15.3.3` in `package.json`); the latest is 16.4.3 (2026-10-25). Stay on the latest major so fixes and security patches keep coming. Run the items in order, each its own PR.

Checked against the code on 2026-10-25, most of the 16 breaking changes need nothing here: request APIs (`params`, `searchParams`, `cookies()`, `headers()`, the profile share image) are already awaited; no `next/image`, `revalidateTag`, `unstable_cache`, parallel routes (`@slot`), AMP, `runtimeConfig`, `next lint` / ESLint config or `scroll-behavior: smooth`. What does touch us: Turbopack becomes the build bundler, the bundle analyzer is a webpack plugin, and `middleware.ts` is renamed `proxy.ts` (Node runtime only).

**Not part of this track:** Cache Components, the React Compiler, Instant Navigations (16.3) and Partial Prefetching (16.4). The upgrade guide says not to turn them on just to upgrade; if one looks worth it after 43.2, plan it as its own item.

### 43.1 Upgrade Next.js 15.5 to 16.4 (Done, M)
1. Read the official upgrade guide (`nextjs.org/docs/app/guides/upgrading/version-16`) and the 16.1 to 16.4 release posts; add to this item anything they list that the note above missed. Done 2026-10-25; besides the note above they list:
   - `ImageResponse` (16.2) defaults to Geist Sans instead of Noto Sans. `lib/og.tsx` sets no font, so the share images change typeface: look at them, keep the new font unless it breaks the layout.
   - `next build` no longer prints route `size` / `First Load JS`. Bundle sizes come from `npm run analyze` or Lighthouse now; say so wherever the docs read them off the build output.
   - `next dev` writes to `.next/dev`, and a lockfile stops a second `next dev` or `next build` in the same checkout. Check the local-dev scripts and doc steps that run both.
   - 16.1 adds a Turbopack analyzer (`next experimental-analyze`). Not in this item; keep the webpack analyzer (step 3).
2. Bump `next` and `@next/bundle-analyzer` to `^16.4.3`, `react` / `react-dom` to the latest 19 and `@types/react` / `@types/react-dom` with them. Check that the Vercel project's Node.js version is 20.9 or newer.
3. `npm run analyze` becomes `next build --webpack` (the analyzer only adds a webpack config when that script runs; a Turbopack build with a webpack config fails). `npm run build` stays on Turbopack.
4. **Panel freeze:** leave `middleware.ts` (name, `middleware` export, edge runtime, CORS rules) as it is; the old name still works in 16. The rename is 43.3.
5. `rm -rf .next`, then `npm run verify` and `npm run build`. Check the build stamp (`BUILD_*` in `next.config.ts`), the wiki pages (`outputFileTracingIncludes`), Tailwind / daisyUI styles and the share images under the Turbopack build. Run the public-site and admin sweeps and the overlay on the mock KV (`docs/local-dev.md`, `docs/review.md`). Check a preview deployment before merging.
6. Update the docs: `docs/hosting.md` (Build line says "Next 15"; add that the build is Turbopack and analyze is webpack) and the `npm run analyze` line in `docs/local-dev.md`.

### 43.2 Bring back the page skeletons if 16 fixed the `?param` hang (Done, S)
1. **Re-test the same-page `?param` hang** on 16 (`docs/public-site/basics.md`, "Frames and states"; repro in the trail learning of 2026-10-24: production build, headless Chrome; `next dev` never shows it).
2. If it is gone: give Trade, profile, Card Dex, Stats, My stats and Feedback their `loading.tsx` skeletons back, delete `PendingPage` (and its `SiteShell` wrapper; this also retires the scroll-restore timing bug found in review on 2026-10-25), soften the `TabFace` comment in `MobileTabBar.tsx` and rewrite "Frames and states".
3. If it is not: keep `PendingPage`, fix its scroll restore (`flushSync(() => setFrom(null))` then `scrollTo`, no `requestAnimationFrame`) and note the 16.4 result in the doc.

### 43.4 Bring the other packages up to date (Done, S)
`npm outdated` on 2026-10-25, besides Next: `lucide-react` and `postcss` (minor), `@vercel/analytics` 1 to 2 and `@vercel/speed-insights` 1 to 2 (both used only in `app/layout.tsx`), `qrcode-generator` 1 to 2 (only `lib/qr.ts`), `@types/node` 22 to 26, `typescript` 5.9 to 7.
1. `npm update` for the minors, then the three majors one at a time: read each changelog, bump, `npm run verify` and `npm run build`. Check Analytics and Speed Insights on a preview deployment (their requests reach Vercel) and a QR code (`lib/qr.ts` callers) by hand.
2. `@types/node` follows the Node.js major the Vercel project runs, not npm's latest; bump it only to that major.
3. **Not TypeScript 7** in this item: it is the new native compiler, a bigger change than a version bump. Check whether Next 16.4 supports it and plan it as its own item if so.
4. The npm CLI itself (11 locally, 12 is out) is a local tool, not a project dependency; update it with `npm i -g npm` whenever, nothing in the repo changes.

### 43.5 Move to TypeScript 7 (Done, S)
TypeScript 7 is the native (Go) compiler, GA since July 2026, and has no compiler API. Next 16.4 type-checks by running `tsc` (`experimental.useTypeScriptCli` is on by default in 16.4, so `next.config.ts` needs nothing), nothing in the repo imports the `typescript` API, and `tsx` strips types without it. So the move is the version bump alone. If a type error ever shows only on 5.9, or a tool needs the API, pin `typescript` back to 5.9.

### 43.3 Rename `middleware.ts` to `proxy.ts` (Ready, S)
The file holds the extension's CORS rules, so it waited for the panel freeze (lifted 2026-10-26). `proxy.ts` runs on Node only; today the file runs on edge and reads through `lib/admin-auth-edge` and `lib/access-edge`. Rename the file and its export (the codemod does both), then test the admin and mod gates, the access gate and the `/api/twitch/*` CORS answers (the panel's requests from the Twitch origin) on a preview deployment. Drop the `-edge` variants only if nothing else uses them.

## Twitch extension

### Track 53: next panel version, 0.0.3 (Ready)

Extension version 0.0.2 is built and documented (`twitch-extension/SUBMISSION.md`); Josh submits it. A new panel freeze starts at submission (ask Josh before changing `public/twitch-panel/*`, `/api/twitch/*` or the CORS rules), so everything here waits for 0.0.2 to be approved or sent back. The panel keeps its own version, `PANEL_VERSION` in `panel.js`; bump it for 0.0.3. Rules: never rename or remove a JSON key on `/api/twitch/*` the released panel reads, and put new data in new fields.

**34.6b Pack card back in the panel (Ready, M).** Left out of 0.0.2 (Josh, 2026-10-26). The panel has no flip card, and the pack card back exists only as layout nodes (`layoutBack`), the React `FlipCard` and the vanilla port in `public/widget.js`; there is no image form. Options when it is picked up: a server-rendered back image route the panel shows (also usable for share images), or port the `widget.js` renderer into the panel. Testers get no badge next to names on the site either, so the panel shows only streamer, admin and mod.

Other items marked "next panel version" belong to this release: 47.4 (extension routes), 50.1 (panel quick wins), 50.2 and 50.4 (the two panel trials), the panel half of 49.6 and 52.16 (loading timeout). They are listed in their own tracks; do not duplicate them here.


## Audit follow-up (2026-10-26)

Tracks 46 to 52 come from the Track 44 audits (44.6 triage, Josh picked on 2026-10-26). Each item names its findings by audit and id; the evidence, file:line and the fix sketch are in `docs/archive/audit-2026-<area>.md` (`public-site`, `admin`, `mod-panel`, `twitch-panel`, `security`). Read the finding before starting. Items with no audit id were proposed in the triage and picked by Josh. Order: 46, 47, 48; 49 to 52 fit in between. One item per PR unless it says otherwise.

### Track 46: data correctness (Ready)
- **46.1 Lock release (S).** public-site M-1 (admin C-3, CODE_REVIEW #18): compare-and-delete in one script.
- **46.2 Listing alerts after a failed index build (S).** public-site M-2 (CODE_REVIEW #23).
- **46.3 Paid pull before the charge (S to M).** public-site L-4, security M-8 (CODE_REVIEW #24).
- **46.4 Overlay pull save body (S).** admin A-2: send only the pull. Load the overlay against the mock KV to check it.
- **46.5 Card-pulled webhook delivery (S).** admin A-3: `after()` or await.
- **46.6 Read-modify-write staff edits (S).** mod-panel L-8 (hidden list, tags, flags) and L-7 (mod actions accept any username).
- **46.7 Small input checks (S, one PR).** public-site L-9 (trainer season id), security M-6 (incoming webhooks: unknown usernames and card numbers), security L-11 (collection replace body), mod-panel L-6 ("Total pulls" label).

### Track 47: access hardening (Ready unless marked)
- **47.1 A guard on every staff page, checked by verify (M).** mod-panel M-1 and C1, L-9, L-10; security C-1 (every `route.ts` against an allow-list of public routes); admin C-4 and A-8 (missing `revalidatePath`).
- **47.2 One moderation rule (S).** mod-panel M-2, M-3, C2: `canModerate(actor, target, action)` used by every mod action and by `reverseTrade`.
- **47.3 Panel Log out that sticks (S).** mod-panel M-4, C4, L-1.
- **47.4 Extension routes (S, next panel version).** twitch-panel M-2, M-3, M-4, L-2, L-3, L-9 and Changes 1 to 3; security M-3, M-7, L-5, L-7. One viewer check (`extensionViewer()`) for every route, no dev fallback in production, delete `/api/twitch/user`, `/api/twitch/resolve-username` and the dead login helpers. Never remove a JSON key the released panel reads; the deletions wait until no released panel calls them.
- **47.5 Security headers (S).** security M-4, then the CSP trial (security X-1, report-only for a week; success: no violations from real pages).
- **47.6 Signing keys and secret compares (S).** security C-3, L-8, L-9 (public-site L-3, twitch-panel L-8, CODE_REVIEW #13). Rotating keys signs everyone out once: say so in the changelog line.
- **47.7 Small hardening (S, one PR).** public-site L-1 (sandbox exit, one line: `safeReturnTo`), L-5, L-6, L-7 (with public-site U-1, friendly error toasts), L-8; security L-2, L-6, L-10; `lib/captcha-server.ts` takes the left-most `X-Forwarded-For` too (use `clientIp` from `lib/login-limit.ts`).
- **47.8 Profiles tied to the Twitch account ID (Needs a decision, M).** security M-1 and X-3. Josh decides what happens when a new account signs in with a name an old profile holds (refuse, or move the old profile aside). Start with the trial: record the ID on every sign-in for a month and count conflicts.

- **47.9 One rate limiter, and a firewall trial (S).** security C-2 (`rateLimit(name, key, max, windowS)` in `prodKv` for login, incoming webhooks and the panel routes) and X-2 (Vercel Firewall rules for login and webhook paths, log-only for a week; success: no real overlay, panel or webhook traffic flagged). After 45.3.

### Track 48: KV efficiency (Ready)
Measure before and after with static counts or the mock KV; fold anything 40.2f covers into it rather than doing it twice.
- **48.1 Per-request `cache()` on the hot readers (S).** public-site M-3, C-1.
- **48.2 Home page reads in parallel, slow parts streamed (M).** public-site M-4, E-1, L-13; admin A-5 for the dashboard.
- **48.3 Cached boards everywhere (S).** public-site M-5, C-3; twitch-panel M-8.
- **48.4 Batch profile and avatar reads (S).** public-site M-6, C-4; admin A-4, C-2, A-9; mod-panel M-7, C3, L-14, L-15.
- **48.5 Cheaper polling and sweeps (S to M).** admin A-6, A-7, C-1, E-1, U-3; public-site L-10, L-11, L-12; twitch-panel L-6, L-7.

- **48.6 Trial: CDN-cached leaderboard (M, one week).** public-site E-2: `/leaderboard` JSON with `s-maxage=20` instead of the per-instance cache. Success: KV commands per minute fall in the Upstash dashboard. Fold into 40.2f if it covers it.
- **48.7 Editions under per-viewer keys (Needs design, L).** admin E-2, public-site C-5: one key per viewer and season instead of one season blob. Touches draws, trades, the leaderboard and backups; plan the migration with Josh first.

### Track 49: mod panel UI, cleanup and polish (Ready)
- **49.1 Honest trade log (S).** mod-panel M-6, L-3, U1.
- **49.2 Act on both sides of a trade, season on every row (S).** mod-panel M-5, L-4, L-5, U2, U3.
- **49.3 Accessible drawer, mod bar on phones, overview tiles (S).** mod-panel L-13, U4, L-12, U5, L-2, U6.
- **49.4 Delete dead routes and code (S).** admin A-11, A-12, C-5 (import-legacy, seed); security L-12; public-site L-14, C-6 (shared buttons out of `app/admin`); admin A-10, U-2 (dashboard `btn`).
- **49.5 Docs and copy that drift (S).** mod-panel L-11; public-site L-15, U-4 (Discord copy from `CHANNEL_NAME`); twitch-panel L-9 after 47.4.

- **49.6 UX polish (S, one PR per area).** Site: public-site U-2 (`loading.tsx` for profile, dex and copy pages), security U-2 (private profile explainer), U-3 (a clear "not allowed" page for staff). Panel, next panel version: twitch-panel UI and UX 1 to 4 ("Link my Twitch account" button, focus kept in card details, "Updated N ago", note length hint).

### Track 50: player features and trials (Ready unless marked)
Trials run for the time given, then Josh keeps, changes or drops them.
- **50.1 Panel quick wins (S, next panel version).** twitch-panel Feature improvements 1 to 3 (new since last visit, your own row on the Board, offers waiting badge).
- **50.2 Trial: browse before linking (S, next panel version, 4 weeks).** twitch-panel Experimental 1: Board and a read-only dex before the identity share prompt. Success: more identity shares per panel open.
- **50.3 Swap finder on the trade board (Needs design, M).** public-site E-3: viewers who hold a card you want and want one you hold. Trial as a read-only list for the signed-in viewer; success: trades started from it.
- **50.4 Trial: Looking for match alert in the panel (S, next panel version, 4 weeks).** twitch-panel Experimental 3: mark the Trades tab when a board offer gives a card on the viewer's Looking for list, worked out only when the tab opens. Success: offers accepted from those matches.
- **50.5 Alert health and View as public (S).** public-site F-1 (how many cards you watch and when an alert last fired, on `/settings`) and F-3 (a "View as public" toggle on your own profile).
- **50.6 Sign out everywhere (M).** security F-2: a button in Account settings backed by the session generation (security L-3). Do it with or after 47.6.

- **50.7 Close to complete (S).** Profile and binder show "3 cards from finishing <pack>", linking to board offers that give those cards.
- **50.8 Duplicates view (S).** A viewer's repeat editions grouped on one page, each with "Offer on the board".
- **50.9 Season wrapped (M).** At season end, a personal share image (pulls, best pull, rarest edition, trades, final rank), built like the existing share images; a Discord gallery post too.
- **50.10 Trial: stream streak badge (S, one season).** A badge for pulling on N streams in a row (streams from the live check, `lib/twitch-live.ts`). Success: more returning viewers per stream.
- **50.11 Trade price guide (S to M).** Each card page shows what it went for in recent trades, from `trades:history`.
- **50.12 Wants share image (S).** A "cards I'm looking for" image to post in Discord, from the wanted list.

### Track 51: staff and admin tools (Ready unless marked)
- **51.1 Staff actions in the Discord admin log (S).** mod-panel F1, security F-1: restrictions, cancels, blocks, reversals and every emergency password login post one line with who and why.
- **51.2 Trial: mod stream desk (S to M, 4 weeks).** mod-panel E1: read-only overlay status, pulls paused and queue length on `/mod`. Success: mods use it during streams (ask them).
- **51.3 Trial: timed restrictions (S, one season).** mod-panel E2: an optional `until` on trade restrictions that lifts itself. Success: fewer manual lifts.
- **51.4 Mod guide (M).** mod-panel F2: wiki topics marked for mods render at `/mod/guide` (how to restrict, when to reverse, what to escalate).
- **51.5 Viewer lookup and per-mod activity (S to M).** mod-panel F3 (the mod search finds viewers with a profile but no pulls) and F4 (actions per staff member over the last 7 days on `/admin/staff`).
- **51.6 Reports about staff go to admins (S).** mod-panel F5: feedback that names a staff member is hidden from that person and flagged for admins.
- **51.7 Trial: second approval on big reversals (S, 2 weeks).** mod-panel E3: log "would need a second approval" without blocking. Success: how many of those a second person would have stopped.
- **51.8 Dashboard health strip and security card (S).** admin F-3; security U-1 (password login on or off, extension secret set, secret lengths, last emergency login, on Admin Settings).
- **51.9 Backup dry run (S to M).** admin F-4: a restore preview that lists what a backup would change and writes nothing.
- **51.10 Trial: weekly admin digest (S, 4 weeks).** admin E-3: a weekly staff summary from the audit log (staff actions, emergency logins, failed jobs), next to the community digest (6.3, `lib/weekly-digest.ts`, sent from `/api/cron/weekly`). Success: Josh reads it instead of opening the activity feed.
- **51.11 Users list on the server, webhook secret last used (S to M).** admin F-2 (the Users list pages and searches on the server); security F-3 (when and from which route each incoming secret was last used).
- **51.12 Season pre-flight check (S).** Before a season goes live, the season flow lists missing art or frames, empty rarity tiers, packs with no cards and odds that don't add up.
- **51.13 Error spike alert (S to M).** Server-side failures counted per hour in `stats:h:`; the minute cron posts to the Discord admin log when they jump.
- **51.14 Monthly restore drill (M).** Restore the newest backup into a sandbox each month, compare counts with production and post the result. After 51.9.

### Track 52: UI and UX from the page walk (Ready)
Found by walking every public, admin and mod page on the review seed (`docs/review.md`) on 2026-10-26; Josh picked all of them. Check each against the seed before and after.
- **52.1 Readable disabled buttons (S).** Disabled gold buttons show their label at 20% opacity, so they read as empty gold boxes (Send offer on `/trade/new`, the Settings save bar, the pack workspace Save, Add on `/admin/staff`). Make the label readable and say why the button is off.
- **52.2 Twitch ID label (S).** `/admin/users/<name>` Profile tab: the field labelled "Twitch username" (`profile-twitchId`) holds the numeric Twitch ID. Label it "Twitch ID" and make it read-only.
- **52.3 Counts that agree (S).** The FAQ editor's "Questions (0)" counts only custom questions while it lists the built-ins; the dashboard's "Top collectors" ranks by completion while the site ranks by points. Count everything shown, and rank by points (or rename the widget).
- **52.4 Mask the overlay key (S).** Admin Settings > OBS Overlay shows the overlay URL with its key in plain text; hide the key behind Reveal and Copy, since Settings can be on screen during a stream.
- **52.5 One stats page (M).** The score breakdown appears on the profile Overview, the profile Stats tab and `/account`, and "most valuable editions" twice. Fold `/account` into the owner's profile Stats tab (upgrades and "what to do next" included) and redirect `/account` there.
- **52.6 Compact profile header (S).** On a phone the header and its five buttons fill the first screen. Shrink the header on sub-tabs and move Leaderboard, Edit profile and Settings into a menu; drop the Share button, which repeats the Share tab.
- **52.7 Your offers on the profile Trades tab (S).** The owner's Trades tab says "No open listings" while they have an open direct offer; show the owner their direct offers too (others still see listings only).
- **52.8 FAQ search and Settings jump links (S).** A search box on `/faq` (about 7,500px long) and section links at the top of `/settings` (about 3,100px).
- **52.9 Offer a trade for this edition (S).** An edition page held by someone else gets "Offer a trade for this edition", opening `/trade/new` with that person and that edition filled in.
- **52.10 Labelled dex values (S).** Dex tiles show five unlabelled values ("81 · 486 · 1742 · 8067 · 29140 pts"); label them RH, FA, FH, GD or show the Regular value with the rest on hover.
- **52.11 Editions list and the Collectors link (S).** `/cards/<n>/copies` repeats "Existed before editions were numbered" on every row; say it once above the list. The "Collectors" nav item opens "Find a collector" (`/collection`) and repeats the leaderboard's top 8: rename it to match, or fold it into the header search.
- **52.12 Trade builder on phones (S).** On a phone "You give" scrolls inside the page (two scroll areas) and "You want" is an empty half until a name is entered: one scroll area, and "You want" hidden until there is a name.
- **52.13 Slimmer admin sidebar (S).** The sidebar footer (overlay status, Copy URL, Preview, Public site, Mod view, the user) takes about 200px, so the nav cuts off on an 800px-tall screen. Fold it into one row.
- **52.14 Danger placement and the No sound chip (S).** `/admin/users` puts "Reset all" next to "Collection page" in the header: move it to a danger zone. The pack workspace marks every card with a red "No sound" chip: grey it, or show it only when the pack uses sounds.
- **52.15 Mod viewer tools (S).** The restriction toggles on `/mod/users/<name>` look instant but need a separate "Save restrictions" link: save on toggle, or light up a real button when something changed. `/mod/users` lists A to Z only: show last seen and pulls and sort by them.
- **52.16 Panel loading timeout (S, next panel version).** The panel shows "Loading..." forever when Twitch never authorizes; after about 10 seconds show a message with Retry.

## Standing decisions

- Paid-pull limits default to no limit and stay editable. Staff can add extra pulls for everyone for the current stream.
- Stars keep setting the card value (29.3); `copyPoints` does not change.
- Trainer cards can be traded until used.
- Collection words (Track 37): collected = different cards of a set, pulls = every pull, edition = one numbered copy.
- No offline caching of pages or data: `public/sw.js` caches only the offline page so nobody sees stale cards or scores (Track 35).
- Not planned for the Overlay Editor: real-time co-editing, plugin / script actions, filters on card art (the card art is the pack's job), uploading font files.
