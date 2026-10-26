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
| 34 | Next extension version 0.0.2 (34.6 to 34.8) | Ready | L |
| 43.1 | Upgrade Next.js 15.5 to 16.4 | Done | M |
| 43.2 | Bring back the page skeletons if 16 fixed the `?param` hang | Done | S |
| 43.4 | Bring the other packages up to date | Done | S |
| 43.5 | Move to TypeScript 7 | Done | S |
| 43.3 | Rename `middleware.ts` to `proxy.ts` | Ready | S |

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

The 2026-10-15 panel was never approved, and the freeze lifted on 2026-10-26. 34.1 to 34.5 are merged. All of it ships as extension version 0.0.2, one reviewed panel version. Every item edits `public/twitch-panel/panel.js`, so run them **one at a time** in the order below, each its own PR from `origin/main`; the version is submitted only after 34.8. Read `docs/twitch-extension.md` first. Rules for the whole track: never rename or remove a JSON key on `/api/twitch/*` (the released panel keeps working against new responses until viewers update); new data goes in new fields; reuse the website's existing APIs and `lib/` helpers rather than copying logic into the panel.

**34.6 Collection view (Ready, M).** Pack card back on flip backs (20.3), favourite editions (9.1: hearts, disabled picks), serial numbers on tiles (2.1), the copies-first dialog (2.5), staff and tester badges.

**34.7 New panel sections, cut down (Ready, M).** Planned 2026-10-26 to fit the 318px panel. Achievements: a summary on the Stats tab ("N of M", the latest few with icons) from a new field on `/api/twitch/me` that reuses the site's achievement helper, plus a link to the profile. Binder: a link to the `/u/<name>` binder tab only. Looking for: a want toggle in card details, using the same store as the site's `WantToggle`, through an authenticated `/api/twitch` route; saved alerts stay on the site (link out). Share images: a link to the site's share page, no in-panel downloads.

**34.8 Release (Ready, S).** Anything Twitch reviewers asked for; give the extension its own version, 0.0.2 (`packageVersion()` in `scripts/lib/twitch-package.mjs` reads `package.json` today; the site stays 1.1.0), rebuild the zip as `cheesy-tcg-panel-v0.0.2.zip`, refresh screenshots, update the change log in `twitch-extension/SUBMISSION.md`. A new freeze starts at submission.


## Standing decisions

- Paid-pull limits default to no limit and stay editable. Staff can add extra pulls for everyone for the current stream.
- Stars keep setting the card value (29.3); `copyPoints` does not change.
- Trainer cards can be traded until used.
- Collection words (Track 37): collected = different cards of a set, pulls = every pull, edition = one numbered copy.
- No offline caching of pages or data: `public/sw.js` caches only the offline page so nobody sees stale cards or scores (Track 35).
- Not planned for the Overlay Editor: real-time co-editing, plugin / script actions, filters on card art (the card art is the pack's job), uploading font files.
