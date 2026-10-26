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
| 45 | Held security fixes and asset deletion (45.1 to 45.4) | Ready, first | S to M |
| 34 | Next extension version 0.0.2 (34.8; 34.6b after) | Ready after 45 | S |
| 43.1 | Upgrade Next.js 15.5 to 16.4 | Done | M |
| 43.2 | Bring back the page skeletons if 16 fixed the `?param` hang | Done | S |
| 43.4 | Bring the other packages up to date | Done | S |
| 43.5 | Move to TypeScript 7 | Done | S |
| 43.3 | Rename `middleware.ts` to `proxy.ts` | Ready | S |
| 46 | Data correctness (46.1 to 46.7) | Ready | S to M |
| 47 | Access hardening (47.1 to 47.8) | Ready (47.8 needs a decision) | M |
| 48 | KV efficiency (48.1 to 48.5) | Ready | M |
| 49 | Mod panel UI and cleanup (49.1 to 49.5) | Ready | S |
| 50 | Features and trials (50.1 to 50.7) | Ready (50.4 needs design) | M |

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

**34.8 Release (Ready after Track 45, S).** From the 44.4 audit (`docs/archive/audit-2026-twitch-panel.md`): M-5 (a visible off-site marker on every `target=_blank` link, one CSS rule, and twitch-panel Changes 4 so the zip check enforces it), M-6 (rewrite `twitch-extension/SUBMISSION.md` for 0.0.2: details, change log, source note, size), M-7 (Allowlist for Panel URLs: `https://cheesytcg.app/`), L-1 (one walkthrough paragraph on how trade notes are moderated), and M-1 (a JWT refresh swaps the token only, so a viewer writing an offer is not sent back to Collection). Then rebuild the zip (`node scripts/build-twitch-package.mjs`, gives `cheesy-tcg-panel-v0.0.2.zip`), refresh screenshots, move 34.6b to the next panel version's track, and remove Track 34. Check Twitch's CSP against the `data:` SVG masks in Hosted Test. A new freeze starts at submission (ask Josh).


## Audit follow-up (2026-10-26)

Tracks 45 to 50 come from the Track 44 audits (44.6 triage, Josh picked on 2026-10-26). Each item names its findings by audit and id; the evidence, file:line and the fix sketch are in `docs/archive/audit-2026-<area>.md` (`public-site`, `admin`, `mod-panel`, `twitch-panel`, `security`). Read the finding before starting. Order: 45, 34.8, then 46, 47, 48; 49 and 50 fit in between. One item per PR unless it says otherwise.

### Track 45: held security fixes and asset deletion (Ready, do first)
The details of 45.1 to 45.3 are in the gitignored `SECRETS.md` at the main checkout (Opus hands them to the agent in its brief). The repo is public: the PR title, body, commit messages and changelog line describe the fix, never how it could be abused, and the finding stays out of every public file until it is merged.
- **45.1 Sandbox entry and the overlay key (S to M).** SECRETS 44.2 S-1 and 44.5 S-1 (also CODE_REVIEW #8, security C-4). Add a check-file case that fails before the fix.
- **45.2 Staff sign-in bookkeeping writes (S).** SECRETS 44.3 S-1. Add a `scripts/check-staff.mts` case that fails before the fix.
- **45.3 Emergency password login limit (S).** SECRETS 44.5 S-2 (with public-site L-2).
- **45.4 Assets "Delete all unused" deletes files in use (S to M).** admin A-1 with U-1: `collectReferenced` learns every kind of stored file (backups, Full Art art, card backs, overlay layer images), the confirm lists files by folder and kind, and nothing under `backups/` is ever bulk deleted. Until it ships, don't use the button.

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
- **47.7 Small hardening (S, one PR).** public-site L-1 (sandbox exit, one line: `safeReturnTo`), L-5, L-6, L-7 (with public-site U-1, friendly error toasts), L-8; security L-2, L-6, L-10.
- **47.8 Profiles tied to the Twitch account ID (Needs a decision, M).** security M-1 and X-3. Josh decides what happens when a new account signs in with a name an old profile holds (refuse, or move the old profile aside). Start with the trial: record the ID on every sign-in for a month and count conflicts.

### Track 48: KV efficiency (Ready)
Measure before and after with static counts or the mock KV; fold anything 40.2f covers into it rather than doing it twice.
- **48.1 Per-request `cache()` on the hot readers (S).** public-site M-3, C-1.
- **48.2 Home page reads in parallel, slow parts streamed (M).** public-site M-4, E-1, L-13; admin A-5 for the dashboard.
- **48.3 Cached boards everywhere (S).** public-site M-5, C-3; twitch-panel M-8.
- **48.4 Batch profile and avatar reads (S).** public-site M-6, C-4; admin A-4, C-2, A-9; mod-panel M-7, C3, L-14, L-15.
- **48.5 Cheaper polling and sweeps (S to M).** admin A-6, A-7, C-1, E-1, U-3; public-site L-10, L-11, L-12; twitch-panel L-6, L-7.

### Track 49: mod panel UI and cleanup (Ready)
- **49.1 Honest trade log (S).** mod-panel M-6, L-3, U1.
- **49.2 Act on both sides of a trade, season on every row (S).** mod-panel M-5, L-4, L-5, U2, U3.
- **49.3 Accessible drawer, mod bar on phones, overview tiles (S).** mod-panel L-13, U4, L-12, U5, L-2, U6.
- **49.4 Delete dead routes and code (S).** admin A-11, A-12, C-5 (import-legacy, seed); security L-12; public-site L-14, C-6 (shared buttons out of `app/admin`); admin A-10, U-2 (dashboard `btn`).
- **49.5 Docs and copy that drift (S).** mod-panel L-11; public-site L-15, U-4 (Discord copy from `CHANNEL_NAME`); twitch-panel L-9 after 47.4.

### Track 50: features and trials (Ready unless marked)
Trials run for the time given, then Josh keeps, changes or drops them.
- **50.1 Staff actions in the Discord admin log (S).** mod-panel F1, security F-1: restrictions, cancels, blocks, reversals and every emergency password login post one line with who and why.
- **50.2 Panel quick wins (S, next panel version).** twitch-panel Feature improvements 1 to 3 (new since last visit, your own row on the Board, offers waiting badge).
- **50.3 Trial: browse before linking (S, next panel version, 4 weeks).** twitch-panel Experimental 1: Board and a read-only dex before the identity share prompt. Success: more identity shares per panel open.
- **50.4 Swap finder on the trade board (Needs design, M).** public-site E-3: viewers who hold a card you want and want one you hold. Trial as a read-only list for the signed-in viewer; success: trades started from it.
- **50.5 Ownership history on the copy page (M).** public-site F-2: every collector who held this edition, from the copy ledger; private profiles show as a private collector.
- **50.6 Trial: mod stream desk (S to M, 4 weeks).** mod-panel E1: read-only overlay status, pulls paused and queue length on `/mod`. Success: mods use it during streams (ask them).
- **50.7 Trial: timed restrictions (S, one season).** mod-panel E2: an optional `until` on trade restrictions that lifts itself. Success: fewer manual lifts.

## Standing decisions

- Paid-pull limits default to no limit and stay editable. Staff can add extra pulls for everyone for the current stream.
- Stars keep setting the card value (29.3); `copyPoints` does not change.
- Trainer cards can be traded until used.
- Collection words (Track 37): collected = different cards of a set, pulls = every pull, edition = one numbered copy.
- No offline caching of pages or data: `public/sw.js` caches only the offline page so nobody sees stale cards or scores (Track 35).
- Not planned for the Overlay Editor: real-time co-editing, plugin / script actions, filters on card art (the card art is the pack's job), uploading font files.
