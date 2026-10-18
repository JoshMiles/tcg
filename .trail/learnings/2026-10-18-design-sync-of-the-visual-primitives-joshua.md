---
title: Design sync of the visual primitives to Claude Design
author: Joshua
date: 2026-10-18
branch: main
cost: { minutes: 17, tokens: 282354 }
touches:
  - ".design-sync/NOTES.md"
  - ".design-sync/config.json"
  - ".design-sync/conventions.md"
  - ".design-sync/entry.ts"
  - ".design-sync/fonts.css"
  - ".design-sync/previews/ArmedButton.tsx"
  - ".design-sync/previews/Avatar.tsx"
  - ".design-sync/previews/CardTile.tsx"
  - ".design-sync/previews/Dialog.tsx"
  - ".design-sync/previews/DraftChip.tsx"
---

## Decided
- Sync only the self-contained visual primitives (Icon, RankMedal, Avatar, CardTile, SerialChip, StaffBadge, Dialog, StatusChip, DraftChip, ArmedButton, Spinner) to the Claude Design project "Cheesy TCG Design System". Inputs live in `.design-sync/` (config, entry.ts, previews, conventions.md, NOTES.md).
- Use a safelisted Tailwind config (`.design-sync/tailwind.config.ts`) for the synced CSS, because the app build purges unused classes.

## Tried and ruled out
- Auto component discovery found nothing in a Next.js app, so components are pinned with `componentSrcMap` and prop types are written by hand in `dtsPropsFor`.

## Watch out
- `lib/site.ts` reads `process.env` when it loads. Any browser bundle of app components needs a `process` shim imported first.
- CardTile needs `relative` in its className, because its overlays are absolute.
- Read `.design-sync/NOTES.md` (Re-sync risks) before re-syncing.
