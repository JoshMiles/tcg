# TCG, GEMINI.md

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

## Role and subagent workflow

Work is split across planning, execution and support roles. Follow the discipline for the task at hand:

- **Planning (Lead / Pro).** High-level planning, architecture, trade-off analysis, reviewing, and writing or updating `ROADMAP.md`. When delegating execution to subagents (`invoke_subagent` with `self`), provide a self-contained brief.
- **Execution.** Functions, boilerplate, refactoring, terminal commands, tests. Execution follows the approved design in `ROADMAP.md` and does not make unapproved architectural decisions or edit the roadmap on its own.
- **Support (`research` subagent).** Focused, well-bounded lookup tasks with a clear brief: searching the codebase and reporting where something lives, reading CI logs or scanner output and summarising the failure, or surveying docs across files. The `research` subagent does not design or decide what a finding means; anything that needs judgement comes back to the main agent.
- **Keep subagent model inheritance clean.** When invoking subagents via `invoke_subagent`, use `Model: 'inherit'` unless the user explicitly requests a different model or tier.
- **Plan gate.** Before executing code, check that an approved plan covers the task (marked `Ready` in `ROADMAP.md` or specified in the user's brief). If an item is marked `Needs design`, `Needs a decision`, or `Blocked` (such as items under the Twitch panel freeze), or if no plan exists for non-trivial work, stop and do a planning pass with the user first.
- **Escalate, don't improvise.** A design question the plan doesn't answer (data model, API shape, a change to the architecture below) goes back to planning / the user, not into code.
- **Exempt:** typos, copy edits, one-line bug fixes and documentation updates.

## Area docs

Read the doc that matches what you are changing **before** you change it; each starts with a line saying when it applies. `docs/admin.md` and `docs/public-site.md` are indexes: read only the topic file they point to. `docs/archive/` is history; read it only when asked or when you need why something was decided.

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
| [docs/archive/roadmap-history.md](docs/archive/roadmap-history.md) | only when you need the original plan behind a finished roadmap item ("ROADMAP 13.1") |

## Keeping context small

- Read the part of a file you need (search first with `grep_search`, then read a line range with `view_file` `StartLine`/`EndLine`); the big ones (`public/widget.js`, `OverlayEditor.tsx`) cost 12k to 20k tokens whole.
- Send wide searches across many files to a `research` subagent (`invoke_subagent`) so only the answer comes back.
- **Remind the user to manage context.** When a session is running long but the task isn't done (many files read, several PR rounds), suggest `/compact` and name what the summary should keep (branch, PR, open items). Say it once per break point, not every turn.
- When you change behaviour, update the matching doc to say what the code does now. History belongs in PR descriptions and `docs/archive/`, not in the area docs.
- When a PR updates `ROADMAP.md`, only bump the date on the **Last updated** line. Never add a shipped log there.

## Data architecture

Three tiers in Vercel KV: **Seasons → Packs → Cards**.

- **Seasons** (`season:{id}`, index `seasons:list`): metadata + `packIds: string[]`. One season active at a time.
- **Packs** (`pack:{id}`, index `packs:list`): global, not owned by a season; one pack can be in several seasons. Cards live at `pack:{id}:cards`.
- **Legacy collection** (`tcg_{collectionName}`): `{ username: number[] }`. **The source of truth for user data**, written by the overlay via `/api/collection`. Duplicates are intentional: each entry is one pull. Unique count is `new Set(array).size`; everywhere that shows cards builds a `Map<number, count>` and shows a `×N` badge when count > 1.
- **User profiles** (`user:{username}:profile`) and **Twitch opaque mapping** (`twitch_opaque:{opaqueId}` → lowercase username).
- Users are read with `getAllCollectionUsers()` in `lib/kv.ts` (aggregates every season's legacy collection).
- `normalizeSeason` / `normalizePack` in `lib/kv.ts` handle legacy shapes on read, so KV never needs manual migrations.

## Conventions

- **No em dashes (the long dash character) anywhere**: UI copy, comments, strings, docs. Use a comma, colon, full stop or brackets; a plain hyphen `-` for an empty-value placeholder.
- **No emoji in the UI; use icons.** `app/components/Icon.tsx` is the one icon set (Lucide plus the custom `cheese` glyph): `<Icon name="trophy" />`, sized in `em` unless given `w-* h-*`; `<RankMedal rank={n} />` for podium places. Data-driven things (nav items, widget registry, notification kinds, editor categories) store an `IconName` string. Add an icon by importing it from `lucide-react` into `ICONS`. Allowed: text glyphs like ★ (rarity), ✓ in an `<option>`, ✦ particles; emoji in Discord messages; the overlay's own look set in the Overlay Editor. Short labels: Shiny "SH", Reverse Holo "RH", Full Art "FA".
- **Glossary (ROADMAP 25.2):** A person's copy of a card is an **edition**, not a print ("your recent editions"). The game-wide id is **Edition #1023381** (`Copy.uid`). The sequence line is **Print #24 of 28** (`Copy.n`), and the points bonus is the **print bonus**. Code, KV and URLs keep saying `copy`, `serial` and `uid`. `scripts/check-words.mts` enforces these words. (The Twitch panel still says print for a copy while the panel freeze is in force.)
- **Player-facing PRs fill the `## Changelog` section** of the PR template; `/changelog` is built from merged PRs (`scripts/build-changelog.mjs`), so never edit `lib/changelog.ts`. Write for players, say "edition" for a card copy, write `none` for staff-only or internal changes, and never name a tool or author (the line is dropped and the check fails).
- TypeScript strict; no `any` unless unavoidable. daisyUI `cheesy` theme; use `btn`/`card`/`input`, not raw utilities.
- Client components only when truly required (e.g. `AdminNav` for `usePathname`, dialog triggers, dialogs).
- **Never put `onClick` or other event handlers in JSX in a server component file**, even inside a client component's children; Next.js throws at runtime.
- Admin pages: `force-dynamic` on every page; `revalidatePath` after every mutation; `requireAdmin()` guards every admin server action (staff sign in with Twitch and have a role, see `docs/staff.md`; the emergency password login uses `ADMIN_PASSWORD` and `ADMIN_COOKIE_SECRET`, not `ADMIN_SECRET`).
- Server actions take fixed arguments via `.bind(null, arg)` before going into `<form action={}>`.
- Image uploads go through `ImageUploadField` → Vercel Blob.
- **Packs use the pack workspace (`/admin/packs/[packId]`); multi-step season creation uses the full-page wizard** (`SeasonFlow`), not a modal. Dialogs are for small one-shot forms (e.g. `NewPackButton` asks only for a pack name, calls `createDraftPack`, and opens the workspace): the page stays a server component, and a thin client wrapper owns the open/close state.

## Git and PRs

- Branch off an up-to-date `origin/main`, push, open a PR against `main`. **Every push to GitHub gets a PR**: open one straight away if the branch has none. Don't push to `main`.
- **Before pushing to a branch that has a PR, check whether that PR is merged.** If it is, start again from `origin/main` (rebase any unmerged commits onto it) and open a new PR; never stack new work on a merged PR.
- **Merging:** Only merge PRs and delete their branches when CI is green and there are no open review asks (or when the user asks).
- **One feature per PR, each branched from `main`.** Never stack PRs: merging them out of order drops commits. A fix that lands after its PR merged needs a new branch and PR.
- CRLF warnings on Windows are harmless (`.gitattributes`). The pre-rewrite `Old/` folder and `olddata.txt` are only in git history now (gitignored).

## Gotchas

- **IMPORTANT: never write real data from local work.** Develop against the mock KV, never production KV. On the production overlay, never turn off "Don't save" in the test panel or call `drawCard` without `dry`: a saved draw writes a real pull (it once left a stray `tester` user). Saves now need a server ticket, but the panel's Reset buttons always write real data.
- **Twitch panel freeze:** While the extension is under Twitch review (see `ROADMAP.md`), do not touch `public/twitch-panel/*`, `scripts/lib/twitch-package.mjs`, the behaviour or response shape of `/api/twitch/*`, or the CORS rules in `middleware.ts` until the user lifts the freeze.
- Before committing: stop dev servers and mock processes, and delete `.env.local` and `.claude/launch.json`.
- Browser previews can't measure real OBS frame rate or animation (see `docs/local-dev.md`). Say plainly in PR descriptions what wasn't checked in real OBS.
- Left to the user (can't be checked locally): OBS (stream status permission, real frame rate), Discord webhook delivery, Vercel Blob uploads, the Twitch panel inside Twitch.
