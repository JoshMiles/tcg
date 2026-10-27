# TCG Bridge

A small Windows app for the stream PC. Mix It Up's Developer API only listens on that PC (`http://localhost:8911`), so the TCG site, which runs in the cloud, cannot reach it. TCG Bridge sits in the tray, asks the site for jobs (balance, take or give currency, chat viewers, a chat line), runs them against Mix It Up and posts the answers back. Site side and job details: [docs/admin/mixitup.md](../docs/admin/mixitup.md).

## Install and pair

1. On the site open Admin > Mix It Up and press **Download TCG Bridge** (or take the newest `bridge-v*` release from [GitHub releases](https://github.com/JoshMiles/tcg/releases?q=bridge-v&expanded=true)). Run `TCG-Bridge-Setup-<version>.exe`.
2. **The installer is not code-signed.** Windows SmartScreen says it "protected your PC": press **More info**, then **Run anyway**.
3. In Mix It Up switch the Developer API on: Services > Developer API > Connect.
4. On the site press **Pair TCG Bridge** and type the code into the app (the site address is `https://cheesytcg.app`). The app turns green when the site and Mix It Up both answer.

It starts with Windows and lives in the tray; closing the window keeps it running. Quit from the tray menu. It updates itself from the latest GitHub release (checked on start and every 6 hours, installed when you quit).

## OBS (optional)

The app can also watch OBS on the same PC: it tells the site when the stream starts and stops, which scene is on air and whether the TCG overlay browser source is in that scene and visible, and the site's **Refresh overlay in OBS** button (Admin > Settings > OBS Overlay) presses "Refresh cache of current page" on it.

1. In OBS (28 or newer) open Tools > WebSocket Server Settings, tick **Enable WebSocket server** and copy the **Server Password**.
2. In the app's OBS card tick **Talk to OBS**, check the address (`ws://127.0.0.1:4455` is the OBS default), paste the password and press Save. The password is stored encrypted on this PC and is never sent to the site, and only `ws://localhost` and `ws://127.0.0.1` addresses are accepted.

The overlay is the browser source whose address is `<paired site>/overlay.html?...`; only its name is reported, never the address or key. An overlay inside a nested scene is not seen; an overlay inside a group is.

## Alerts, tests and the log

- **Alerts.** A Windows notification when the site link, Mix It Up or OBS drops while OBS says the stream is live (or any time OBS is switched off in the app), and one when it comes back. A part must be down 15 seconds first, and a part alerts at most once every 2 minutes. The "Alert me when a link drops while live" switch in the window turns the notifications off.
- **Tests** (buttons in the window, each answers in words): **Test Mix It Up** (Developer API, version, the chosen currency by id and name, a balance for a Twitch name, prefilled with the channel name), **Send test chat message**, **Check OBS**.
- **Start Mix It Up.** When Mix It Up is not found the window offers **Start Mix It Up**. It launches only `MixItUp.exe` from the path you chose with **Choose MixItUp.exe...**, else from Mix It Up's default install folder (`%LocalAppData%\MixItUp`). The **Start Mix It Up with TCG Bridge** switch (off by default) does it when the app starts.
- **Log.** One file a day in the app's logs folder (**Open log folder**), kept 7 days: connects, drops, jobs (kind, result, time) and errors. It never holds the pairing token, the OBS password, the pair code or the overlay key. **Copy diagnostics** copies the versions, the statuses and the last 20 jobs as text, redacted the same way, for a bug report.
- **Mix It Up commands (0.4.0).** The app lists your enabled Mix It Up commands to the site (on start, every 5 minutes and when Mix It Up comes back) so a rule on the Mix It Up page can pick one, and it runs a command for a big pull only if it is in that list. The command gets the viewer, card, rarity and version as arguments.
- **Updates.** The window shows the version and a **Check for updates** button. After an update it says "Updated to x.y.z" once, with a link to the release notes.

## Develop

```
cd bridge
npm install
npm run typecheck   # tsc --noEmit
npm run check       # fake Mix It Up, fake OBS and fake site, no Electron needed
npm start           # build, then run the app
npm run dist        # build the installer into release/ (not committed)
```

`TCG_BRIDGE_DATA=<folder>` keeps the app's settings in that folder instead of the real user data folder, which is handy against a local site (`http://localhost:3000` is allowed as a site address; anything else must be https).

- `src/site.ts`, `src/mixitup.ts`, `src/obs.ts`, `src/jobs.ts`, `src/service.ts`, `src/settings.ts`, `src/alerts.ts`, `src/selftest.ts`, `src/launch.ts`, `src/log.ts`, `src/diagnostics.ts`, `src/update.ts`: plain TypeScript with no Electron imports, so the checks run under Node.
- `src/main.ts` and `src/preload.ts`: the Electron glue (tray, window, auto start, updates, encrypted token).
- `renderer/`: the window, plain HTML, CSS and JS.

To release: bump `version` in `package.json`, merge, then push a tag `bridge-v<version>`. `.github/workflows/bridge.yml` builds the installer on `windows-latest` and attaches it to a release of that tag.
