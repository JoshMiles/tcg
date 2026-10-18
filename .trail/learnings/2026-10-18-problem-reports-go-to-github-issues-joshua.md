---
title: Problem reports go to GitHub issues
author: Joshua
date: 2026-10-18
branch: feat/report-problem-github
cost: { minutes: 9, tokens: 89841 }
touches:
  - app/(site)/faq/sections/help.tsx
  - app/(site)/feedback/FeedbackForm.tsx
  - app/(site)/feedback/page.tsx
  - app/components/site/BetaBanner.tsx
  - app/components/site/SiteShell.tsx
  - app/error.tsx
  - docs/public-site/accounts.md
  - docs/public-site/closed-beta.md
  - lib/site.ts
---

## Decided
- "Report a problem" is a prefilled GitHub new-issue link on the public repo JoshMiles/tcg, built by reportProblemUrl(from?) in lib/site.ts. No daily limit. /feedback?kind=bug (or ?from= alone) redirects there; the in-app form is suggestions only.
## Tried and ruled out
- Server-side issue filing from the in-app form (needs a GitHub token, still public): the user picked plain links instead.
## Watch out
- Issues are public and need a GitHub account; the FAQ says so. The API still accepts kind 'bug' and the admin inbox shows older bug items.
- check-words and check-twitch-assets already failed on main on 2026-10-18, unrelated to this.
