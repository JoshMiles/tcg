---
title: Edition and serial wording
author: Joshua
date: 2026-10-20
branch: chore/edition-serial-wording
cost: { minutes: 2, tokens: 74656 }
touches:
  - "app/(entity)/cards/[card]/copies/page.tsx"
  - "app/(entity)/copy/[seasonId]/[copyId]/page.tsx"
  - app/(entity)/copy/actions.ts
  - app/(site)/account/page.tsx
  - app/(site)/faq/blocks.tsx
  - app/(site)/faq/context.ts
  - app/admin/activity/EventDetail.tsx
  - app/admin/dashboard/widgets.tsx
  - app/admin/feedback/FeedbackInbox.tsx
  - "app/admin/sandbox/[id]/page.tsx"
---

## Decided
Joshua (2026-10-20): in UI text a card copy is an edition. Copy.n is "Edition 7 of 12" / "Edition #7" (edition number); Copy.uid is "Serial #1023381" (serial number); the bonus is the "Edition bonus"; "Print of the week" is "Edition of the week". Replaces the 2026-10-19 wording (Print #n / Edition #uid).
## Tried and ruled out
Renaming code identifiers, URLs, KV keys, card-back tokens {printNumber}/{edition}, or chat placeholders {prints}/{printsMade}: kept, renaming breaks saved data and streamer replies.
## Watch out
Twitch panel is frozen and still says "print". scripts/check-words.mts bans "Print #", "print bonus" and "Edition #" before a uid. Convert uid strings before n strings so nothing is converted twice.
