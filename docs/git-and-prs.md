# Git and PRs

> Read this before you push, open a PR, or merge one.

- Branch off an up-to-date `origin/main`, push, open a PR against `main`. **Every push to GitHub gets a PR**: open one straight away if the branch has none. Don't push to `main`.
- **PR bodies follow `.github/pull_request_template.md` exactly** (`## Changelog`, `## Summary`, `## Test plan` in that order; Changelog is `none` or Audience, Tags and `- ` bullets only). The `PR description` check fails otherwise; test a body first with `gh pr view N --json body --jq .body | node scripts/check-pr-body.mjs`.
- **Before pushing to a branch that has a PR, check whether that PR is merged.** If it is, start again from `origin/main` (rebase any unmerged commits onto it) and open a new PR; never stack new work on a merged PR.
- **Merging:** Opus may merge PRs and delete their branches when necessary (CI green, no open review asks). Sonnet and Haiku don't merge or close PRs unless the user asks.
- **Before merging, read all three comment lists**; the `claude-review` bot posts bugs as **inline** comments, which `gh pr view --json comments,reviews` does not show. Run `for k in pulls/N/comments pulls/N/reviews issues/N/comments; do gh api repos/JoshMiles/tcg/$k --jq '.[] | "\(.user.login) \(.path // "") \(.line // "")\n\(.body)\n---"'; done` (N = PR number) and fix or answer every finding first. A green `claude-review` check does not mean it found nothing.
- **One feature per PR, each branched from `main`.** Never stack PRs: merging them out of order drops commits. A fix that lands after its PR merged needs a new branch and PR.
- Commit messages and PR bodies end with the attribution lines the harness gives.
- CRLF warnings on Windows are harmless (`.gitattributes`). The pre-rewrite `Old/` folder and `olddata.txt` are only in git history now (gitignored).
