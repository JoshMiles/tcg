---
title: iPhone icon C is not the device cache
author: Joshua
date: 2026-10-23
branch: main
cost: { minutes: 1, tokens: 14441 }
touches:
  - middleware.ts
---

## Decided
- 2026-10-23: the user cleared all Safari history and website data and tried a Private tab; both still showed the "C". The device-cache theory from the earlier learning today is wrong.
- Lead suspect: the Add to Home Screen sheet (iOS 26, Open as Web App on) uses the manifest start_url /?source=pwa, but for a logged-out visitor the closed gate in middleware.ts 307-redirects that to /closed, so the web app is made for a URL that never loaded with the icon.

## Tried and ruled out
- Metadata streamed into body: the apple-touch-icon, manifest and title tags are all in <head> on / and /closed (Next 15.5.28), for both iPhone and bot user agents.
- Broken manifest icons: all five manifest icons, favicon.png and favicon.ico serve 200 valid PNG/ICO at their stated sizes.

## Watch out
- Confirm on the phone before changing code: log in, open /?source=pwa directly, then Add to Home Screen; and try another site to rule out a device-wide problem (content blocker, iOS bug).
- A likely fix if confirmed: have the gate rewrite to /closed instead of redirecting, so the URL stays the start_url.
