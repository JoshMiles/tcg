# TCG Admin, CLAUDE.md

## What this project is

**The game runs only on the Cheesygidds Twitch channel (https://www.twitch.tv/cheesygidds) and nowhere else**. The Twitch Extension is only installed there and packs are opened live on that stream. Say so in public copy (FAQ, Terms, Privacy, home, footer); use `CHANNEL_NAME` / `CHANNEL_URL` from `lib/site.ts` rather than hard-coding it.

A Twitch stream overlay + admin panel for a trading card game. Viewers pull cards live on stream via OBS browser source. An admin panel manages seasons, packs, and cards. A public collection viewer lets viewers see their cards. A Twitch Extension Panel lets viewers see their collection inside Twitch.

**Where things stand (October 2026):** production at `https://cheesytcg.app` (Vercel, Next.js 15, KV + Blob). Shipped: the OBS overlay and Overlay Editor, the admin panel with a widget dashboard, sandboxes, the public site (profiles, binder, card dex, leaderboard, trading, share studio, install-as-app, cookie notice, Turnstile on trades / upgrades), staff roles with Twitch login (admin and mod panels), and the Twitch Extension panel plus its submission pack and hosted-version zip (`twitch-extension/`). Still outside the repo: the extension's review submission and Hosted Test on Twitch. The planned work lives in `ROADMAP.md` (owned by Opus, see below); read it before starting anything non-trivial.

## Model Workflow Guidelines

Work is split between two models. Follow your role.

- **Claude Opus: planning only.** Use Opus for high-level planning, architectural design, trade-off analysis, and writing or updating the development roadmap (`ROADMAP.md`). Opus does not write feature code.
- **Claude Sonnet: execution.** Use Sonnet for execution: writing functions, boilerplate generation, refactoring, running terminal commands, and executing tests. Sonnet does not make architectural decisions or edit the roadmap.
- **Plan gate.** Before executing any code, Sonnet must verify that an active design plan, approved or written by Opus, covers the task (in `ROADMAP.md` or the current task's approved plan). If none exists, stop and ask for an Opus planning pass first. Do not invent the design.
- **Escalate, don't improvise.** If execution uncovers a design question the plan does not answer (data model, API shape, a change to the architecture sections below), stop and hand it back to Opus instead of deciding it in code.
- **Exempt: small fixes.** Typos, copy edits, one-line bug fixes and documentation updates do not need a plan.

## Tech stack
- **Next.js 15** App Router, server components, server actions, dynamic routes
- **Vercel KV** (Redis). All data persistence
- **Vercel Blob**, image uploads
- **Vercel Analytics + Speed Insights**, `<Analytics />` + `<SpeedInsights />` in root layout; raw script tag in static panel HTML
- **Tailwind CSS**, styling (dark theme: gray-950 bg, gray-900 cards, yellow-500 accent)
- **TypeScript**, strict, no `any` unless unavoidable
- Client components only when truly required. Current uses: AdminNav (`usePathname`), modal/dialog trigger buttons, dialog components themselves

## Where to read more
The long area notes live in `docs/`. Read the one that matches what you are changing **before** you change it; each starts with a line saying when it applies.

| Doc | Read it when you touch |
|-----|------------------------|
| [docs/variants-and-scoring.md](docs/variants-and-scoring.md) | variants, upgrades, the upgrade ceremony, card values, score, leaderboard, scoring settings, holo masking |
| [docs/serials.md](docs/serials.md) | the copy ledger, serial and unique copy numbers, copy pages, flip cards, share images of copies |
| [docs/trading.md](docs/trading.md) | trades, escrow, trade pages, notifications, listing alerts, the panel's Trades tab |
| [docs/public-site.md](docs/public-site.md) | any public page: home, profile, binder, dex, leaderboard, account, settings, search, SEO, login |
| [docs/admin.md](docs/admin.md) | admin pages, wizards, the dashboard, assets, users admin, Discord feed, admin UX conventions |
| [docs/overlay.md](docs/overlay.md) | `public/widget.js` / `widget.css`, the Overlay Editor, scenes, overlay properties, show-off, live switches |
| [docs/twitch-extension.md](docs/twitch-extension.md) | `public/twitch-panel/*`, `/api/twitch/*`, the hosted zip and submission pack (panel freeze applies) |
| [docs/sandbox.md](docs/sandbox.md) | `lib/db.ts`, sandboxes, preview deployments, the fake Twitch page |
| [docs/staff.md](docs/staff.md) | staff roles, Twitch sign-in for the panels, the mod panel, who-did-it attribution |
| [docs/hosting.md](docs/hosting.md) | deploys, environment variables, build stamp, backups, data health |
| [docs/review.md](docs/review.md) | running a review batch: the seed data, the page sweeps, the mod access test |
| [docs/reference.md](docs/reference.md) | which file does what (key files), the API routes |

Planned work and the rules in force live in `ROADMAP.md`.

## Data architecture

Three-tier hierarchy: **Seasons → Packs → Cards**

- **Seasons** (`season:{id}` in KV, index at `seasons:list`): metadata + `packIds: string[]`. One season active at a time.
- **Packs** (`pack:{id}`, index at `packs:list`): globally managed, not owned by any season. Cards stored at `pack:{id}:cards`. Packs can be assigned to multiple seasons.
- **Cards** (`pack:{id}:cards`): array of Card objects stored per-pack. Each card has a `soundUrl` field pointing to `/assets/sounds/{n}.mp3` for the 25 Season 1 cards.
- **Legacy collection** (`tcg_{collectionName}`): `{ username: number[] }`, card numbers owned, **with duplicates**. Duplicates represent multiple pulls of the same card (pull count). This is what the OBS widget writes to via `/api/collection`. Powers the mini-list in the overlay and the admin dashboard stats. **This is the source of truth for user data**.
- **User profiles** (`user:{username}:profile`): display name, Twitch username mapping, notes.
- **Twitch opaque mapping** (`twitch_opaque:{opaqueId}`): maps Twitch Extension opaque user ID → lowercase username string.

### Pull count / duplicate cards
The collection array stores duplicates intentionally. To get unique card count: `new Set(array).size`. To get pull count per card: build a `Map<number, count>` by iterating the array. Everywhere that shows cards (collection page, Twitch panel, widget mini-list) uses this countMap and displays a `×N` badge when count > 1.

KV normalizers (`normalizeSeason`, `normalizePack` in `lib/kv.ts`) handle legacy data shapes on read. Never need manual KV migrations.

## Conventions
- **No em dashes (the long dash character) anywhere: UI copy, comments, strings.** Use a comma, colon, full stop or brackets instead; use a plain hyphen `-` for an empty-value placeholder (a missing rank, an unset number). One was removed everywhere in October 2026, so don't reintroduce them.
- **No emoji in the UI. Use icons.** `app/components/Icon.tsx` is the one icon set (Lucide, plus the custom `cheese` brand glyph): `<Icon name="trophy" />`, sized in `em` so it matches the surrounding text unless you give it `w-* h-*`; `<RankMedal rank={n} />` for podium places. Anything data-driven (nav items, the widget registry, notification kinds, overlay editor categories) stores an `IconName` string, never an emoji. Add a new icon by importing it from `lucide-react` and adding it to `ICONS`. Text glyphs such as ★ (rarity stars), ✓ in a `<option>` and the ✦ particles are fine; Discord messages keep emoji because Discord renders them. Shiny's short label is "SH" (Reverse Holo "RH", Full Art "FA"). The stream overlay's own look (e.g. the default `✨ Shiny Full Art` label and sparkle particles) is a design choice made in the Overlay Editor, not part of this rule.
- **A player-facing change adds or extends an entry in `lib/changelog.ts`** (the `/changelog` page) in the same PR. Written for players: what they can now do, "print" for a card copy, no em dashes. Staff-only and internal changes need none.
- `force-dynamic` on every admin page (KV reads must be fresh)
- `revalidatePath` after every mutation in server actions
- Server actions use `.bind(null, fixedArg)` to pre-fill arguments before passing to `<form action={}>`
- Image uploads go through `ImageUploadField` component → Vercel Blob
- Auth: staff sign in with Twitch and have a role (super / admin / mod), see "Staff: admin and mod panels" in docs/staff.md. `requireAdmin()` guards every admin server action; the old `ADMIN_SECRET` cookie is only the emergency password login
- **Wizards, not modals, for multi-step creation.** Packs and seasons are created in full-page flows (`PackFlow`, `SeasonFlow`). See *Drafts & wizards*. Dialogs remain for small one-shot forms (add one card).
- **Modal pattern**: pages stay as server components; a thin client wrapper component (e.g. `NewPackButton`) owns only the open/close boolean and renders the dialog. The dialog itself uses `<form action={serverAction}>`, redirects still work correctly.
- **NEVER add `onClick` or other event handlers to JSX in server components**, Next.js will throw at runtime even if the element is inside a client component's children prop. This applies to `<a>`, `<button>`, or any element rendered directly in a server component file.
- Users page reads from `getAllCollectionUsers()` in `lib/kv.ts` which aggregates across all seasons' legacy collections. `listAllUsers()` and the per-user pull-record helpers were removed. Nothing wrote to them.

## Git & PR workflow
- Work on a feature branch off an up-to-date `origin/main` (`git fetch && git checkout -b <branch> origin/main`), push it, and open a PR with `gh pr create --base main`. `gh` is installed and authenticated. Don't push to `main` directly and don't merge/close PRs unless the user asks.
- **One feature per PR, each branched from `main`.** Don't stack PRs on each other: merging stacked PRs out of order leaves commits out of `main` (this happened once and needed a combined PR to recover). If a fix lands on a branch *after* its PR merged, it is not in `main`. Open a new branch/PR with it.
- Commit messages end with the `Co-Authored-By` line and PR bodies with the "Generated with Claude Code" line given by the harness. Line endings are normalised by `.gitattributes` (`* text=auto`); the "LF will be replaced by CRLF" warnings on Windows are harmless.
- `Old/` and `olddata.txt` are pre-rewrite leftovers (original StreamElements overlay, Season 1 assets); ignore them.

## Testing locally
**`npm run verify`** runs the typecheck, every `scripts/check-*.mts` (`npm run check`, via `scripts/run-checks.mjs`: one fresh mock KV per file on a free port, `node scripts/run-checks.mjs trades serials` runs only matching files; a check that cannot run here prints `skipped: <reason>` and exits 0) and `node --check public/widget.js`. Run it before every PR. There is no browser test suite, so the rest of verification is: `npx tsc --noEmit` (run `rm -rf .next` first if you switched branches, stale `.next/types` give false errors), `node --check public/widget.js` (syntax only! it does not catch undefined identifiers, actually load the overlay), `npm run build`, and exercising the app by hand.

**Run the app against a fake database (never develop against production KV):**
1. `node scripts/mock-kv.cjs`, in-memory Upstash REST fake on `:4111`. Data is lost when it stops.
2. Create `.env.local` (gitignored; **delete it when you're done**):
   ```
   KV_REST_API_URL=http://localhost:4111
   KV_REST_API_TOKEN=dev
   KV_URL=redis://dev
   ADMIN_SECRET=testsecret
   ADMIN_PASSWORD=pw
   ```
3. `npx tsx scripts/seed-dev.mts`, seeds Season 1 (refuses any non-localhost KV URL).
4. `npm run dev` (or start it through the Claude app's `preview_start` with a `.claude/launch.json` entry running `npx next dev -p 3111`).
5. Log in: `POST /api/auth/login` with `{"password":"pw"}` sets the `admin-auth` cookie (setting `document.cookie` by hand doesn't work. It's httpOnly), then open `/admin`. Overlay: `/overlay.html` (add `?dev` for the test panel; `?preview` is the admin editor's isolated mode).
   - **Test panel (`?dev`)**: Pack / Card / Variant pickers (blank = random, exactly as a real draw), a count + **Draw**, **All 4 variants** (one card shown Regular → Shiny; random card if none picked), Show Collection, Clear queue, and switches: **Don't save (dry run, on by default)**, Mute, Quick timing (≤1.5s on screen). Keys: **D** draw · **A** all variants · **C** collection · **R/F/S** Reverse / Full Art / Shiny. A pinned variant is shown even where the pack has upgrades off. Reset buttons live in a collapsed Danger zone. Draw options are passed as `queueDraw(username, { packId, cardNumber, variant, dry })`; the `DEV` object in `widget.js` only changes behaviour when set from the panel.

   - **Website login locally**: also run `node scripts/mock-twitch.cjs` (fake Twitch on `:4222`) and add to `.env.local`: `SESSION_SECRET=any-16+-char-string`, `TWITCH_CLIENT_ID=x`, `TWITCH_CLIENT_SECRET=x`, `TWITCH_ID_URL=http://localhost:4222`, `TWITCH_API_URL=http://localhost:4222`, `SITE_URL=http://localhost:3111`. "Log in with Twitch" then approves instantly as `tester`; `curl "http://localhost:4222/__as?login=other"` changes who the next login becomes, and `/__revoked` shows revoked tokens. `curl "http://localhost:4222/__live?on=1"` (or `0`) makes the fake channel live/offline for the live indicator (the result is cached in KV for ~45s, so delete the `twitch:live` key to see a change immediately). The URL overrides are ignored in production builds.

- **Public-site sweep**: with the dev server, mock KV (seeded, with some pulls, a listing and `backfillSerials` run) and the fake Twitch running, `node scripts/sweep-public.mjs` loads every public page at 390px and 1280px, signed in and out, and flags horizontal overflow, a missing or duplicate `h1`, images without `alt`, unnamed buttons / links and console errors. It found the stats table overflowing on phones (grid children need `min-w-0` when they hold a scrolling table). Run it after a public-site change.
**Things that bite:**
- **Never turn off "Don't save" in the test panel (or call `drawCard` without `dry`) on the production overlay**. A saved draw `POST`s to `/api/collection` and writes a real pull for that username (once left a stray `tester` user in production data). Since ROADMAP 13.1 a save without a server-issued ticket is refused (401), so test-panel draws can no longer write pulls, and the Reset buttons need an admin session. The panel defaults to dry runs and shows a red warning while saving is on; still prefer the mock KV or `?preview`. The panel's Reset buttons always write real data.
- Run server-side TypeScript with `npx tsx script.mts` and **extensionless imports** (`../lib/kv`); plain `node --experimental-strip-types` can't resolve them. Set `KV_REST_API_URL` etc. *before* the dynamic `import()`.
- The Claude app's built-in browser pane is often **hidden**: `requestAnimationFrame` is paused, CSS background images aren't fetched and animations don't advance, so frame rate/smoothness can't be measured there. Instead scrub animations (`document.getAnimations()` → `pause()`/`currentTime`) and measure bounding boxes, or inspect computed styles. Be honest in PR descriptions about what wasn't checked in real OBS.
- Restore the browser pane afterwards (`resize_window` preset `desktop`), stop dev servers/mock processes, and remove `.env.local` / `.claude/launch.json` before committing.
- Port 4111 (mock KV) and 3111 (dev server) are the conventional test ports; check nothing stale is listening before starting.
- Real-environment checks that can't be done locally and are left to the user: OBS (stream status permission, real frame rate), Discord webhook delivery, Vercel Blob uploads, the Twitch panel inside Twitch.

## Local dev
`npm install` then `npx tsc --noEmit` / `npm run build` work locally. `node_modules/` is gitignored.
