# TCG, CLAUDE.md

A trading card game played live on stream: an OBS overlay where viewers pull cards, an admin panel (seasons, packs, cards), a public site (profiles, binder, dex, leaderboard, trading) and a Twitch Extension panel. Production: `https://cheesytcg.app` (Vercel, Next.js 15, KV + Blob). Open work and the rules in force live in `ROADMAP.md` (short, open items only); read it before starting anything non-trivial.

**The game runs only on the Cheesygidds Twitch channel (https://www.twitch.tv/cheesygidds).** Say so in public copy (FAQ, Terms, Privacy, home, footer) and use `CHANNEL_NAME` / `CHANNEL_URL` from `lib/site.ts`, never a hard-coded name or URL.

## Commands

- `npm run verify`: typecheck, every `scripts/check-*.mts` and `node --check public/widget.js`. **Run it before every PR.**
- `node scripts/run-checks.mjs trades serials`: only the matching check files (each gets a fresh mock KV; a check that can't run prints `skipped: <reason>` and exits 0).
- `npx tsc --noEmit`: typecheck (run `rm -rf .next` first if you switched branches; stale `.next/types` give false errors).
- `npm run build`: production build.
- `npx tsx script.mts`: run server-side TypeScript. Use **extensionless imports** (`../lib/kv`) and set `KV_REST_API_URL` etc. *before* the dynamic `import()`.
- Local app against a fake database (mock KV, seeding, login, overlay test panel, fake Twitch, public-site sweep): see [docs/local-dev.md](docs/local-dev.md).

There is no browser test suite. Beyond `verify`, check changes by running the app. `node --check public/widget.js` only checks syntax; load the overlay to catch undefined identifiers.

## How to work

Behavioural guidelines to reduce common coding mistakes (from [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md)). They bias toward caution over speed; for trivial tasks, use judgment.

**1. Think before coding.** Don't assume. Don't hide confusion. Surface tradeoffs.
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them; don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

**2. Simplicity first.** Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked. No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it. Would a senior engineer call it overcomplicated? Then simplify.

**3. Surgical changes.** Touch only what you must. Clean up only your own mess.
- Don't "improve" adjacent code, comments or formatting. Don't refactor what isn't broken. Match existing style.
- Unrelated dead code: mention it, don't delete it.
- Remove imports, variables and functions that *your* change made unused; leave pre-existing dead code unless asked.
- The test: every changed line traces directly to the request.

**4. Goal-driven execution.** Define success criteria. Loop until verified.
- Turn tasks into verifiable goals: "fix the bug" → reproduce it in a `scripts/check-*.mts` (or by hand against the mock KV), then make it pass; "refactor X" → `npm run verify` passes before and after.
- For multi-step tasks, state a brief plan: `1. [step] → verify: [check]`.

## Model workflow

Work is split between two models. Follow your role.

- **Opus plans.** High-level planning, architecture, trade-off analysis, and writing or updating `ROADMAP.md`. Opus does not write feature code.
- **Sonnet executes.** Functions, boilerplate, refactoring, terminal commands, tests. Sonnet does not make architectural decisions or edit the roadmap.
- **Plan gate.** Before executing code, Sonnet checks that an Opus-approved plan covers the task (in `ROADMAP.md` or the task's approved plan). If none exists, stop and ask for an Opus planning pass.
- **Escalate, don't improvise.** A design question the plan doesn't answer (data model, API shape, a change to the architecture below) goes back to Opus, not into code.
- **Exempt:** typos, copy edits, one-line bug fixes and documentation updates.

## Area docs

Read the doc that matches what you are changing **before** you change it; each starts with a line saying when it applies.

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
| [docs/local-dev.md](docs/local-dev.md) | running the app locally, the overlay test panel, website login against the fake Twitch |
| [docs/reference.md](docs/reference.md) | which file does what (key files), the API routes |
| [docs/roadmap-history.md](docs/roadmap-history.md) | only when you need the original plan behind a finished roadmap item ("ROADMAP 13.1") |

## Data architecture

Three tiers in Vercel KV: **Seasons → Packs → Cards**.

- **Seasons** (`season:{id}`, index `seasons:list`): metadata + `packIds: string[]`. One season active at a time.
- **Packs** (`pack:{id}`, index `packs:list`): global, not owned by a season; one pack can be in several seasons. Cards live at `pack:{id}:cards`.
- **Legacy collection** (`tcg_{collectionName}`): `{ username: number[] }`. **The source of truth for user data**, written by the overlay via `/api/collection`. Duplicates are intentional: each entry is one pull. Unique count is `new Set(array).size`; everywhere that shows cards builds a `Map<number, count>` and shows a `×N` badge when count > 1.
- **User profiles** (`user:{username}:profile`) and **Twitch opaque mapping** (`twitch_opaque:{opaqueId}` → lowercase username).
- Users are read with `getAllCollectionUsers()` in `lib/kv.ts` (aggregates every season's legacy collection).
- `normalizeSeason` / `normalizePack` in `lib/kv.ts` handle legacy shapes on read, so KV never needs manual migrations.

## Conventions

- **No em dashes (the long dash character) anywhere**: UI copy, comments, strings. Use a comma, colon, full stop or brackets; a plain hyphen `-` for an empty-value placeholder.
- **No emoji in the UI; use icons.** `app/components/Icon.tsx` is the one icon set (Lucide plus the custom `cheese` glyph): `<Icon name="trophy" />`, sized in `em` unless given `w-* h-*`; `<RankMedal rank={n} />` for podium places. Data-driven things (nav items, widget registry, notification kinds, editor categories) store an `IconName` string. Add an icon by importing it from `lucide-react` into `ICONS`. Allowed: text glyphs like ★ (rarity), ✓ in an `<option>`, ✦ particles; emoji in Discord messages; the overlay's own look set in the Overlay Editor. Short labels: Shiny "SH", Reverse Holo "RH", Full Art "FA".
- **Player-facing PRs fill the `## Changelog` section** of the PR template; `/changelog` is built from merged PRs (`scripts/build-changelog.mjs`), so never edit `lib/changelog.ts`. Write for players, say "print" for a card copy, write `none` for staff-only or internal changes, and never name a tool or author (the line is dropped and the check fails).
- TypeScript strict; no `any` unless unavoidable. Tailwind dark theme: gray-950 background, gray-900 cards, yellow-500 accent.
- Client components only when truly required (e.g. `AdminNav` for `usePathname`, dialog triggers, dialogs).
- **Never put `onClick` or other event handlers in JSX in a server component file**, even inside a client component's children; Next.js throws at runtime.
- Admin pages: `force-dynamic` on every page; `revalidatePath` after every mutation; `requireAdmin()` guards every admin server action (staff sign in with Twitch and have a role, see docs/staff.md; `ADMIN_SECRET` is only the emergency password login).
- Server actions take fixed arguments via `.bind(null, arg)` before going into `<form action={}>`.
- Image uploads go through `ImageUploadField` → Vercel Blob.
- **Multi-step creation uses full-page wizards** (`PackFlow`, `SeasonFlow`), not modals. Dialogs are for small one-shot forms: the page stays a server component, a thin client wrapper (e.g. `NewPackButton`) owns the open/close state, and the dialog uses `<form action={serverAction}>`.

## Git and PRs

- Branch off an up-to-date `origin/main`, push, open a PR against `main`. **Every push to GitHub gets a PR**: open one straight away if the branch has none. Don't push to `main` and don't merge or close PRs unless asked.
- **One feature per PR, each branched from `main`.** Never stack PRs: merging them out of order drops commits. A fix that lands after its PR merged needs a new branch and PR.
- Commit messages and PR bodies end with the attribution lines the harness gives.
- Ignore `Old/` and `olddata.txt` (pre-rewrite leftovers). CRLF warnings on Windows are harmless (`.gitattributes`).

## Gotchas

- **IMPORTANT: never write real data from local work.** Develop against the mock KV, never production KV. On the production overlay, never turn off "Don't save" in the test panel or call `drawCard` without `dry`: a saved draw writes a real pull (it once left a stray `tester` user). Saves now need a server ticket, but the panel's Reset buttons always write real data.
- Before committing: stop dev servers and mock processes, and delete `.env.local` and `.claude/launch.json`.
- The Claude app's browser pane can't measure frame rate or animation (see docs/local-dev.md). Say plainly in PR descriptions what wasn't checked in real OBS.
- Left to the user (can't be checked locally): OBS (stream status permission, real frame rate), Discord webhook delivery, Vercel Blob uploads, the Twitch panel inside Twitch.
