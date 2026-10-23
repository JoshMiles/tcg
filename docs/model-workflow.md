# Model workflow

> Read this when you plan work, delegate to a subagent, or write a brief for one.

Work is split between three models. Follow your role.

- **Opus plans.** High-level planning, architecture, trade-off analysis, reviewing, and writing or updating `ROADMAP.md`. Opus does not write feature code; it hands execution to subagents (`model: sonnet` or `model: haiku`) with a self-contained brief.
- **Sonnet executes.** Functions, boilerplate, refactoring, terminal commands, tests. Sonnet does not make architectural decisions or edit the roadmap.
- **Haiku supports.** Focused, well-bounded tasks with a clear brief: searching the codebase and reporting where something lives, reading CI logs or scanner output and summarising the failure, running `npm run verify` or named checks and reporting results, mechanical edits the brief spells out (renames, copy fixes, swapping one call for another). Haiku does not design, write new logic or decide what a finding means; anything that needs judgement goes back to Sonnet or Opus.
- **Pick the cheapest model that fits, and default grunt work to Haiku.** Lookups, log reading and check runs go to Haiku; code changes go to Sonnet; Opus keeps only planning, review and decisions.
- **Haiku is the first choice for grunt tasks, not a last resort.** Before giving anything to Sonnet or doing it yourself, ask whether a Haiku brief would do: codebase searches, running `npm run verify` and reporting the result, reading CI output, checking a PR's state, rebasing a branch onto `main` and re-running verify, mechanical edits and doc or copy fixes the brief spells out, cleanup after a session (dev servers, `.env.local`, stray logs). Split a Sonnet task so its mechanical parts (the verify run, the doc update, the cleanup) go to Haiku. Escalate to Sonnet only when the brief can't spell the change out.
- **A fresh agent per item.** Opus starts a new Sonnet (or Haiku) subagent for each roadmap item or split, with a self-contained brief; it does not keep resuming one long-lived agent across a track, because a long context is re-read on every turn and costs far more than a fresh start. The brief carries what the agent needs (the roadmap section, what just merged, the rules, the hand-back). Resume an agent only to finish its own item (a review fix, a usage-limit reset). **When an agent suggests `/clear` or reports a long session, its next task goes to a fresh agent.** Opus does not stay on as the conductor: it returns to read each PR's diff before it merges.
- **Inline beats delegating for small jobs.** A job of one or two commands (a PR's state, `git status`, one grep) is done inline; delegating costs more than it saves. Haiku gets multi-step grunt work.
- **Haiku stops at the edge of its brief.** On a merge conflict, a failing check, or anything the brief doesn't cover, Haiku stops and reports back instead of fixing it.
- **Plan gate.** Before executing code, Sonnet and Haiku check that an Opus-approved plan covers the task (in `ROADMAP.md` or the task's brief). If none exists, stop and ask for an Opus planning pass.
- **Escalate, don't improvise.** A design question the plan doesn't answer (data model, API shape, a change to the architecture in [data-architecture.md](data-architecture.md)) goes back to Opus, not into code.
- **Exempt:** typos, copy edits, one-line bug fixes and documentation updates.
