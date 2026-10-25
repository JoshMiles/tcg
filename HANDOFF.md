# HANDOFF: ROADMAP 43.1 (Next.js 15.5 to 16.4)

## Goal
Upgrade Next to ^16.4.3 (Turbopack build, webpack analyze), React 19.latest, docs updated. Branch `next-16-upgrade`. Committed locally; not pushed, no PR (Josh asks for pushes).

## Done
- Installed next 16.4.3, react/react-dom 19.3.1, @types/react and @types/react-dom 19.3.0, @next/bundle-analyzer 16.4.3.
- `analyze` script is `next build --webpack`; `build` stays on Turbopack. Plain build ignores the analyzer (enabled only for the `analyze` lifecycle event).
- `next build` rewrote tsconfig.json (jsx react-jsx, `.next/dev/types` include); kept.
- `npm run verify` 84/84, `npm run build` ok, `npm run analyze` writes .next/analyze/client.html.
- Mock KV checks: public sweep clean, mod access clean, admin sweep clean except the item below, overlay `?dev` loads with no console errors, share images, build stamp, wiki trace, styles all fine.
- Vercel project `tcg` runs Node 24.x.
- Docs: hosting.md, local-dev.md, README (Next 16).

## Left
- Opus: decide the open questions below; mark 43.1 Done in ROADMAP once the preview deployment is checked.

## Key files
package.json, package-lock.json, tsconfig.json, docs/hosting.md, docs/local-dev.md, README.md, ROADMAP.md

## Open questions
- `next dev` writes an untracked AGENTS.md ("This is NOT the Next.js you know"). Not committed. Options: `agentRules: false` in next.config.ts, or commit it.
- On 16, `/mod/users/<unknown>` (a `notFound()` inside the mod layout renders the root not-found with SiteShell) logs a dev console error "Encountered a script tag while rendering React component" (CookieNotice's inline script). Clean on 15.5. Dev-only warning, staff-only page.
- `middleware` deprecation warning at dev and build is expected (43.3).

## Decisions
- 2026-10-25: middleware.ts untouched (panel freeze).
- 2026-10-25: 43.1 left at Ready in ROADMAP (not Done): a preview deployment check and the two open questions remain.
