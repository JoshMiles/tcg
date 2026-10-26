# The Cheesy TCG, roadmap

**Last updated 2026-10-26**

Open work only. Owned by the planning model (Opus, see "Model workflow" in `CLAUDE.md`). Execution picks up items marked Ready; Needs design or Needs a decision goes back to planning (or to the user) first. When an item ships, delete it here and make sure its area doc in `docs/` describes the result. Finished items and their original designs are archived in `docs/archive/roadmap-history.md`; read it only when you need the reasoning behind a done item.

**Status legend:** Ready (the design here is enough to build) · Needs design · Needs a decision (the user chooses) · Blocked (waiting on something outside the repo).

## Rules in force

- **Twitch panel freeze lifted (2026-10-26).** The 2026-10-15 version was never approved; the user will submit a new version, so the panel, `/api/twitch/*` and the CORS rules in `middleware.ts` can change again. Keep the Track 34 rule: never rename or remove a JSON key on `/api/twitch/*`.
- One feature per PR, branched from up-to-date `origin/main`; every push gets a PR (see "Git and PRs" in `CLAUDE.md`).
- No em dashes, no emoji in the UI, FAQ / Privacy / Terms kept in step (`scripts/check-words.mts`), `npm run verify` before every PR.

## Open items

| # | Item | Status | Size |
|---|------|--------|------|
| 35.1 | iPhone icon still a "C", and no launch screen (Safari and Chrome both) | Blocked (user) | S |
| 40.2f | Site speed: re-measure, then cache shared data if needed | Blocked (field data from 2026-11-09) | S to M |
| 34 | Next extension version 0.0.2 (34.8; 34.6b after) | Ready after 44.4 | S |
| 43.1 | Upgrade Next.js 15.5 to 16.4 | Done | M |
| 43.2 | Bring back the page skeletons if 16 fixed the `?param` hang | Done | S |
| 43.4 | Bring the other packages up to date | Done | S |
| 43.5 | Move to TypeScript 7 | Done | S |
| 43.3 | Rename `middleware.ts` to `proxy.ts` | Ready | S |
| 44 | Full review and audit: public site, admin, mod panel, Twitch panel, security review (44.1 to 44.6) | Ready | L |

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

### Track 34: next extension version (Ready)

The 2026-10-15 panel was never approved, and the freeze lifted on 2026-10-26. 34.1 to 34.7 are merged (34.6 without the pack card back, now 34.6b), and the panel shows its own version, 0.0.2 (`PANEL_VERSION` in `panel.js`). All of it ships as extension version 0.0.2, one reviewed panel version. Every item edits `public/twitch-panel/panel.js`, so run them **one at a time** in the order below, each its own PR from `origin/main`; the version is submitted only after 34.8. Read `docs/twitch-extension.md` first. Rules for the whole track: never rename or remove a JSON key on `/api/twitch/*` (the released panel keeps working against new responses until viewers update); new data goes in new fields; reuse the website's existing APIs and `lib/` helpers rather than copying logic into the panel.

**34.6b Pack card back in the panel (Ready after 0.0.2, M).** Left out of 0.0.2 (Josh, 2026-10-26); when 34.8 closes the track, move this to the next panel version's track. The rest of 34.6 is merged. The panel has no flip card, and the pack card back exists only as layout nodes (`layoutBack`), the React `FlipCard` and the vanilla port in `public/widget.js`; there is no image form. Options when it is picked up: a server-rendered back image route the panel shows (also usable for share images), or port the `widget.js` renderer into the panel. Testers get no badge next to names on the site either, so the panel shows only streamer, admin and mod.

**34.8 Release (Ready after 44.4, S).** First fold in the 44.4 audit's critical and high findings and anything Twitch's review would reject, plus anything Twitch reviewers asked for; then rebuild the zip as `cheesy-tcg-panel-v0.0.2.zip`, refresh screenshots, update the change log in `twitch-extension/SUBMISSION.md`. A new freeze starts at submission.


## Track 44: full review and audit (2026-10-26)

A read-and-judge pass over every page and system, one area per PR, each ending in a ranked findings list and a set of proposals, both of which can become roadmap items. Nothing is fixed during an audit (a one-line bug fix may be, and says so). Opus runs it (Explore subagents for wide sweeps, Haiku for the sweep scripts); Josh decides which findings become work.

**How every area is audited.** Run it against the review seed and the page sweeps in `docs/review.md` (mock KV only, never production), read the code each page and route calls, and read the area docs. Start from `docs/CODE_REVIEW.md` (2026-10-18): mark each of its findings in that area fixed, still open or no longer relevant. For every page and system, report:
- **Bugs and broken flows:** what a user can do that goes wrong, with the steps.
- **Security and privacy:** who can read or change what (private profiles, staff roles, the extension JWT, rate limits, inputs at every trust boundary).
- **Efficiency:** KV reads per request, waterfalls, uncached shared data, bundle and client-component weight, work done on every request that could be done once; with the numbers the sweep or a quick measure gives.
- **UI and UX fixes:** confusing flows, copy that breaks the conventions (glossary words, no em dashes, `CHANNEL_NAME`), accessibility, mobile at 375px, missing empty and error states.
- **Code to delete or merge:** dead code, duplicate helpers, docs that no longer match the code.

Then, for each area, **propose** (ideas, not defects, so no severity):
- **Changes:** behaviour that works but should work differently, with the reason.
- **Feature improvements:** ways to make existing features better for players, staff or the stream (what it adds, who it helps, rough size).
- **Experimental features:** new ideas worth a trial, each with how to try it cheaply (behind a setting, staff-only, one season) and what would show it worked.
- **UI and UX improvements:** layout, navigation, feedback and polish beyond the fixes above, with a sketch or a page reference where it helps.

Each proposal gets a one-line pitch, the pages or systems it touches, a size, and a rough value (high, medium, low). Proposals never block a finding and are never built during the audit.

Each finding gets a severity (critical, high, medium, low), the file:line, a one-line fix and a size. Output per area: `docs/archive/audit-2026-<area>.md` (findings and proposals), the ranked findings and the top proposals in the PR description, and the items Josh accepts added here as numbered items. 44.1 to 44.3 and 44.5 only read code and add docs, so they can run alongside Track 34; 44.4 runs on the 0.0.2 code before 34.8.

### 44.1 Public site (Ready, L)
Every public page and its API routes: home, closed page, login, install, profile and binder, dex and card pages, copy pages, leaderboard, stats, search, trade board, new trade and trade pages, notifications, account, settings, feedback, changelog, FAQ, Terms, Privacy, SEO (metadata, sitemap, share images). Systems: sign-in and sessions, draws as players see them, collections and the copy ledger, scoring and achievements, trading and escrow, notifications and push, Discord linking, caching (Cache Components, the 40.2 work).

### 44.2 Admin (Ready, L)
Every admin page: dashboard, seasons and the season wizard, the pack workspace, cards, card back editor, assets, serials, buffs, achievements, scoring and settings, users, staff, trades, feedback, FAQ, wiki, MixItUp, webhooks and the Discord feed, activity, changelog, backups and data health, sandboxes. Systems: `requireAdmin` on every action, `revalidatePath` after every mutation, the emergency password login, the overlay (`public/widget.js`, the Overlay Editor, the test panel and live switches), backups and restore.

### 44.3 Mod panel (Ready, M)
Every mod page and action (users, trades, testers, feedback, activity, changelog), and the role model in `docs/staff.md`: what each role can reach versus what it should (run the mod access test in `docs/review.md`), who-did-it attribution, and what a mod sees on the stream tools.

### 44.4 Twitch panel (Ready, M)
Every panel tab and view (`public/twitch-panel/*`), every `/api/twitch/*` route and the CORS rules in `middleware.ts`, on the 0.0.2 code. Also checks the submission pack against Twitch's review rules. Critical and high findings, and anything Twitch's review would reject, go into 34.8 before submission; the rest go to the next panel version.

### 44.5 Security review (Ready, L)
A dedicated pass over the whole app, deeper than the security bullet in 44.1 to 44.4. Start from `docs/CODE_REVIEW.md` and say which of its security findings are fixed. Cover:
- **Sign-in and sessions:** Twitch OAuth (state, redirect URIs), session cookies (flags, expiry, rotation), the emergency password login and `ADMIN_COOKIE_SECRET`, sign-out, the fake Twitch and sandbox paths (never reachable in production).
- **Access control:** list every API route and every server action with the guard it uses (`requireAdmin`, staff role, `requireViewer`, `extensionViewer`, overlay key, none), and flag any that is missing or weaker than its siblings. The mod access test in `docs/review.md` is part of this.
- **Twitch extension:** JWT verification, `TWITCH_EXTENSION_SECRET` handling, CORS in `middleware.ts`, that the viewer always comes from the token and never from the body.
- **Input and output:** validation at every trust boundary, KV key building from user input, XSS in user text (notes, names, markup, the panel's DOM building), uploads to Blob (type, size, who can), open redirects.
- **Abuse:** rate limits and replay on draws (the save ticket), trades and escrow races, push and Discord DM spam, webhook signing, and server-side requests to user-given URLs (outgoing webhooks).
- **Secrets and the public repo:** nothing secret in the repo or its git history, `.env.local` and `SECRETS.md` stay ignored, no secret in a URL or a log line.
- **Privacy:** private profiles everywhere they show up, the account export and deletion, personal data in logs and Discord messages.
- **Platform:** security headers and CSP, `npm audit`, the Vercel and KV access settings Josh controls (listed for him, not changed).

The repo is public: unfixed critical and high findings go in the gitignored `SECRETS.md` and straight to Josh, never in a public doc or PR body until they are fixed. Fix PRs describe the fix, not the exploit. Panel findings that Twitch's review would catch go into 34.8.

### 44.6 Triage (Ready after 44.1 to 44.5, S)
Merge the five lists, drop duplicates, and group the proposals across areas (one feature idea often spans the site, the panel and admin). Josh picks; order the accepted findings and proposals into tracks (experimental features as trials with an end date), and delete Track 44.

## Standing decisions

- Paid-pull limits default to no limit and stay editable. Staff can add extra pulls for everyone for the current stream.
- Stars keep setting the card value (29.3); `copyPoints` does not change.
- Trainer cards can be traded until used.
- Collection words (Track 37): collected = different cards of a set, pulls = every pull, edition = one numbered copy.
- No offline caching of pages or data: `public/sw.js` caches only the offline page so nobody sees stale cards or scores (Track 35).
- Not planned for the Overlay Editor: real-time co-editing, plugin / script actions, filters on card art (the card art is the pack's job), uploading font files.
