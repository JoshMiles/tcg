---
title: Site speed field data via the Vercel MCP (40.1)
author: Joshua
date: 2026-10-23
branch: main
cost: { minutes: 2, tokens: 129535 }
---

## Decided
- Speed Insights field data IS readable through the Vercel MCP: `create_observability_query` with metric `vercel.speed_insights.lcp_ms` / `ttfb_ms` / `inp_ms` (aggregation p75), counts via `..._count` + sum, groupBy `route` and `device_type`. Scope `{type: "project", ownerId: <team id>, projectIds: [<tcg project id>]}`; get the ids from `list_projects` (slug `joshmiles-projects`, search `tcg`).
- Server-side timing: `vercel.function_invocation.ttfb_ms` grouped by route.
- 30-day field numbers (to 2026-10-23): home `/` LCP p75 3.5 s, TTFB 838 ms, 105 phone + 30 desktop samples (the only route with a trustworthy sample). Warm function TTFB 20 to 70 ms but hourly spikes of 300 to 750 ms (looks like cold starts). This points at 40.2e (cache signed-out pages) before 40.2f (`/cards` LCP 1.6 s already).
- For lab traces, the recommendation is Google's `chrome-devtools-mcp` (perf trace, LCP element breakdown, Lighthouse) against a local `next start` on mock KV, not a new npm dependency.

## Tried and ruled out
- Remote lab tools (PageSpeed Insights, WebPageTest): production redirects to `/closed` under the gate, and previews sit behind Vercel SSO; a bypass token in a URL would leak it.

## Watch out
- The query returns every hourly bucket; read only the `summary` array (it is huge otherwise, and `summaryOnly` was ignored).
- Most routes have under 15 samples; don't plan from them.
- AdGuard on the user's machine injects into every Chrome page, including a DevTools-MCP Chrome; pause or exclude it while tracing.
