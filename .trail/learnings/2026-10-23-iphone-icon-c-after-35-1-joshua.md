---
title: "iPhone icon C after 35.1: server is right, device cache suspected"
author: Joshua
date: 2026-10-23
branch: main
cost: { minutes: 2, tokens: 73873 }
---

## Decided
- 2026-10-23: no code change. A screen recording (iOS 26 Safari) showed the share sheet thumbnail with the mascot, but the Add to Home Screen sheet (Open as Web App on, URL /?source=pwa from the manifest start_url) showed the "C".
- Next step is on the device: add from a Private tab; if the mascot shows, clear all Safari history and website data (not the per-site entry) and re-add.

## Tried and ruled out
- Production checked again: /closed head has one apple-touch-icon link to /apple-touch-icon-v3.png; the manifest lists it; all icons are 200 opaque RGB 180px PNGs with plain headers.
- Bot protection or cookie gating on icon fetches: icons return 200 PNG with no cookies and with CFNetwork, empty and curl user agents.

## Watch out
- The -v3 rename did not change the result, so the stale "C" is likely cached per site, not per icon URL; another rename will not help.
- The share sheet uses a different icon path (link previews), so a mascot there does not prove Add to Home Screen will get it.
