# HANDOFF: Track 43, framework upgrade (43.1, 43.2, 43.4)

## Goal
Run ROADMAP Track 43 in order, one PR each, merged when CI passes (Josh's go-ahead on 2026-10-25): 43.1 Next 16.4, 43.2 page skeletons, 43.4 other packages. 43.3 stays blocked (panel freeze).

## Done
- npm CLI on Josh's machine updated to 12.2.1.
- 43.1 on branch `next-16-upgrade`: next 16.4.3, react/react-dom 19.3.1, @types/react(-dom) 19.3.0, @next/bundle-analyzer 16.4.3; `analyze` is `next build --webpack`; `agentRules: false`; docs (hosting, local-dev, README). verify 84/84, build ok, analyze ok, public/mod sweeps clean, overlay, share images (Geist Sans), build stamp, wiki trace, styles checked on the mock KV. Vercel project `tcg` runs Node 24.x.

## Left
- 43.1: push, PR, check the preview deployment, merge on green CI.
- 43.2, then 43.4 (each from fresh `origin/main`).
- Delete this file when 43.4 ships.

## Key files
package.json, package-lock.json, tsconfig.json, next.config.ts, docs/hosting.md, docs/local-dev.md, ROADMAP.md (Track 43)

## Open questions
- `npm audit`: 4 high findings, all `zod < 4.6.6` (transitive). Look at it in 43.4.

## Decisions
- 2026-10-25: middleware.ts untouched in 43.1 (panel freeze).
- 2026-10-25: `agentRules: false` in next.config.ts; CLAUDE.md is the agent guide, no generated AGENTS.md.
- 2026-10-25: CookieNotice's inline script logs a dev-only React warning when a `notFound()` inside a layout renders the root not-found on the client (seen on `/mod/users/<unknown>`). Left as is: dev-only, staff-only page, and the script is meant to run only from the server HTML.
