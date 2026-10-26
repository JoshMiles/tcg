---
title: iPhone home screen letter icon is device-wide
author: Joshua
date: 2026-10-24
branch: fix/tab-bar-pending
cost: { minutes: 15, tokens: 18082 }
---

## Decided
- 2026-10-24: github.com added to the home screen also gets a letter ("G") instead of its icon, so the "C" on cheesytcg.app is a phone-side problem, not this site. No code change for ROADMAP 35.1; the closed-gate redirect theory is not needed to explain it.
- Next checks are on the phone: Safari extensions and content blockers, VPN/DNS or ad-blocking profiles, Lockdown Mode, Private Relay, Screen Time web content limits, then another Apple device on the same account.

## Tried and ruled out
- Server-side causes (icons, manifest, head tags, gate on icon paths) were already ruled out on 2026-10-20 and 2026-10-23.

## Watch out
- If another site also gets a letter, stop changing the site's icon code.
