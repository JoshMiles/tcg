---
title: "Overlay Editor save guard and draft recovery (38.13, 38.14)"
author: Joshua
date: 2026-10-21
branch: overlay-draft-recovery
cost: { minutes: 1, tokens: 17891 }
touches:
  - ROADMAP.md
  - app/admin/overlay/EditorMenus.tsx
  - app/admin/overlay/EditorTopBar.tsx
  - app/admin/overlay/OverlayEditorContext.tsx
  - app/admin/overlay/editor-controls.tsx
  - docs/overlay.md
  - lib/overlay-versions.ts
---

## Decided
- Save conflict guard: the editor sends `expectedVersion` (newest `overlay:versions` id it loaded); `versionConflict()` in lib/overlay-versions.ts refuses when the newest id differs, `force=on` is Overwrite. Every editor save records a version, so the version list is the conflict clock (no separate counter).
- Draft recovery: one localStorage entry `overlay-editor-draft` with the whole editor snapshot, its base version id and time; written 1 s after a change while dirty, removed when the editor is clean.
## Tried and ruled out
- Showing the draft time in local time: `check-locale` fails client date formatting without `timeZone: 'UTC'`, so it shows UTC.
## Watch out
- The check-then-write is not atomic; two saves in the same instant can still both land.
- ROADMAP deletes shipped items rather than marking them, so parallel item branches conflict on adjacent ROADMAP lines; resolve by deleting both.
