---
title: Copy page serial and edition layout
author: Joshua
date: 2026-10-20
branch: docs/readme-refresh
cost: { minutes: 2, tokens: 69278 }
touches:
  - "app/(entity)/copy/[seasonId]/[copyId]/page.tsx"
---

## Decided
Copy page (app/(entity)/copy/[seasonId]/[copyId]/page.tsx): serial number, edition and worth are tiles in the same dl grid as Held by / First recorded. Worth spans two columns. The edition number is shown once; the SerialChip in the worth box was dropped as a duplicate, and the "estimated number" badge became an amber "· estimated" note in the edition tile.
## Tried and ruled out
Keeping the serial and edition as inline lines under the title: it repeated the edition number and looked cluttered.
## Watch out
A copy with no serial number (uid) has an odd tile count, so the grid sits unevenly. Not yet checked in a browser.
