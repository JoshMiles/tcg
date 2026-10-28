# TCG, CLAUDE.md

## Canary

- Start every reply with "Josh," with no exceptions, including short replies and tool summaries. If the name stops showing up, instructions are being dropped.
- If you can no longer recall the earlier parts of this session clearly, or the conversation has become very long, say so at the start of your reply and suggest a fresh session.
- **Hand off through files, not chat.** `HANDOFF.md` at the repo root holds the current task (commit it with the work; the repo is public, so anything that shouldn't be public goes in the gitignored `SECRETS.md` instead, and real keys stay in `.env.local`): Goal, Done, Left, Key files, Open questions, and an append-only dated Decisions list. On multi-step work keep it current as you go, bring it up to date before suggesting `/clear`, `/compact` or a fresh session, and read it first in a new session. Delete it when the task ships. Planned work belongs in `ROADMAP.md`, lasting lessons in a trail learning.

## The project

A trading card game played live on stream: an OBS overlay where viewers pull cards, an admin panel (seasons, packs, cards), a public site (profiles, binder, dex, leaderboard, trading) and a Twitch Extension panel. Production: `https://cheesytcg.app` (Vercel, Next.js 16, KV + Blob). Data is Seasons → Packs → Cards in KV (see [docs/data-architecture.md](docs/data-architecture.md)). Open work and the rules in force live in `ROADMAP.md` (short, open items only); read it before starting anything non-trivial.

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

Full rules in [docs/model-workflow.md](docs/model-workflow.md); read it before delegating.

- **Opus plans and reviews, Sonnet writes code, Haiku does grunt work** (searches, verify runs, CI logs, PR state, mechanical edits a brief spells out). Pick the cheapest model that fits; one- or two-command jobs are done inline.
- **A fresh subagent per roadmap item**, with a self-contained brief. When an agent suggests `/clear`, its next task goes to a fresh agent.
- **Plan gate:** Sonnet and Haiku need an Opus-approved plan (`ROADMAP.md` or the brief) before writing code; design questions go back to Opus. Exempt: typos, copy edits, one-line bug fixes, docs.

## Area docs

Read the doc that matches what you are changing **before** you change it; each starts with a line saying when it applies. `docs/admin.md` and `docs/public-site.md` are indexes: read only the topic file they point to. `docs/archive/` is history; read it only when asked or when you need why something was decided.

| Doc | Read it when you touch |
|-----|------------------------|
| [docs/data-architecture.md](docs/data-architecture.md) | how seasons, packs, cards, collections and profiles are stored in KV |
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
| [docs/git-and-prs.md](docs/git-and-prs.md) | pushing, opening or merging a PR, PR bodies, review comments |
| [docs/model-workflow.md](docs/model-workflow.md) | planning, delegating to subagents, writing a brief |
| [docs/reference.md](docs/reference.md) | which file does what (key files), the API routes |
| [docs/archive/roadmap-history.md](docs/archive/roadmap-history.md) | only when you need the original plan behind a finished roadmap item ("ROADMAP 13.1") |

## Keeping context small

- Read the part of a file you need (search first, then read a line range); the big ones (`public/widget.js`, `OverlayEditor.tsx`) cost 12k to 20k tokens whole.
- Send wide searches across many files to a subagent (Explore) so only the answer comes back.
- **Remind the user to reset context.** When a task is finished (PR merged, or the user moves to an unrelated task), end your reply with one line suggesting `/clear`. When a session is running long but the task isn't done (many files read, several PR rounds), update `HANDOFF.md`, then suggest `/compact` and name what the summary should keep (branch, PR, open items). Say it once per break point, not every turn.
- When you change behaviour, update the matching doc to say what the code does now. History belongs in PR descriptions and `docs/archive/`, not in the area docs.
- When a PR updates `ROADMAP.md`, only bump the date on the **Last updated** line. Never add a shipped log there.

## Conventions

- **No em dashes (the long dash character) anywhere**: UI copy, comments, strings. Use a comma, colon, full stop or brackets; a plain hyphen `-` for an empty-value placeholder.
- **No emoji in the UI; use icons.** `app/components/Icon.tsx` is the one icon set (Lucide plus the custom `cheese` glyph): `<Icon name="trophy" />`, sized in `em` unless given `w-* h-*`; `<RankMedal rank={n} />` for podium places. Data-driven things (nav items, widget registry, notification kinds, editor categories) store an `IconName` string. Add an icon by importing it from `lucide-react` into `ICONS`. Allowed: text glyphs like ★ (rarity), ✓ in an `<option>`, ✦ particles; emoji in Discord messages; the overlay's own look set in the Overlay Editor. Short labels: Reverse Holo "RH", Full Art "FA", Full Art Holo "FH", Golden "GD".
- **Player-facing PRs fill the `## Changelog` section** of the PR template; `/changelog` is built from merged PRs (`scripts/build-changelog.mjs`), so never edit `lib/changelog.ts`. Write for players, say "edition" for a card copy, write `none` for staff-only or internal changes, and never name a tool or author (the line is dropped and the check fails).
- TypeScript strict; no `any` unless unavoidable. daisyUI `cheesy` theme; use `btn`/`card`/`input`, not raw utilities.
- Client components only when truly required (e.g. `AdminNav` for `usePathname`, dialog triggers, dialogs).
- **Never put `onClick` or other event handlers in JSX in a server component file**, even inside a client component's children; Next.js throws at runtime.
- **Rendering is Cache Components** (`cacheComponents: true`, see docs/hosting.md): there is no `export const dynamic`. Reading cookies, headers, the session or KV makes the part that reads it dynamic; it must sit inside `<Suspense>` or the route sets `export const instant = false` (every admin and mod page does). Never put a KV read in `'use cache'` unless the sandbox id is an argument (docs/sandbox.md).
- Admin pages: `revalidatePath` after every mutation; `requireAdmin()` guards every admin server action (staff sign in with Twitch and have a role, see docs/staff.md; the emergency password login uses `ADMIN_PASSWORD` and `ADMIN_COOKIE_SECRET`, not `ADMIN_SECRET`).
- Server actions take fixed arguments via `.bind(null, arg)` before going into `<form action={}>`.
- Image uploads go through `ImageUploadField` → Vercel Blob.
- **Packs use the pack workspace (`/admin/packs/[packId]`); multi-step season creation uses the full-page wizard** (`SeasonFlow`), not a modal. Dialogs are for small one-shot forms (e.g. `NewPackButton` asks only for a pack name, calls `createDraftPack`, and opens the workspace): the page stays a server component, and a thin client wrapper owns the open/close state.

## Git and PRs

Full rules, including the comment-reading command, in [docs/git-and-prs.md](docs/git-and-prs.md); read it before pushing or merging.

- Branch off an up-to-date `origin/main`; **every push gets a PR**; never push to `main`. One feature per PR, never stacked; never push new work onto a merged PR's branch.
- **PR bodies follow `.github/pull_request_template.md` exactly** (`## Changelog`, `## Summary`, `## Docs`, `## Test plan`); the `PR description` check fails otherwise.
- **Before merging, read all three comment lists**: `claude-review` posts bugs as inline comments that `gh pr view` doesn't show.

## Gotchas

- **IMPORTANT: never write real data from local work.** Develop against the mock KV, never production KV. On the production overlay, never turn off "Don't save" in the test panel or call `drawCard` without `dry`: a saved draw writes a real pull (it once left a stray `tester` user). Saves now need a server ticket, but the panel's Reset buttons always write real data.
- Before committing: stop dev servers and mock processes, and delete `.env.local` and `.claude/launch.json`.
- **TCG Bridge version rule:** a PR that changes anything under `bridge/` except `bridge/README.md` must raise the minor of `bridge/package.json` above `main`'s with patch 0 (0.11.0 to 0.12.0) and keep `bridge/package-lock.json`'s two version fields equal; CI fails otherwise, and the merge to `main` builds and publishes the `bridge-v<version>` release by itself (no hand tag).
- **Docs stay current with code:** `docs/doc-map.json` ties each doc (README, CLAUDE.md, `docs/**`, `bridge/README.md`) to the code it describes, and each `content/wiki/*.md` page lists its code in a `covers:` front matter line. A PR that changes mapped code without updating the doc fails the `PR description` workflow unless the body's `## Docs` section has `No change needed: <doc>: <reason>` for it (details in docs/git-and-prs.md). A new doc must be added to the map.
- The Claude app's browser pane can't measure frame rate or animation (see docs/local-dev.md). Say plainly in PR descriptions what wasn't checked in real OBS.
- Left to the user (can't be checked locally): OBS (stream status permission, real frame rate), Discord webhook delivery, Vercel Blob uploads, the Twitch panel inside Twitch.
