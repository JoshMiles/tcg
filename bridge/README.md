# TCG Bridge

A small Windows app for the stream PC. Mix It Up's Developer API only listens on that PC (`http://localhost:8911`), so the TCG site, which runs in the cloud, cannot reach it. TCG Bridge sits in the tray, asks the site for jobs (balance, take or give currency, chat viewers, a chat line), runs them against Mix It Up and posts the answers back. Site side and job details: [docs/admin/mixitup.md](../docs/admin/mixitup.md).

## Install and pair

1. On the site open Admin > Mix It Up and press **Download TCG Bridge** (or take the newest `bridge-v*` release from [GitHub releases](https://github.com/JoshMiles/tcg/releases?q=bridge-v&expanded=true)). Run `TCG-Bridge-Setup-<version>.exe`.
2. **The installer is not code-signed.** Windows SmartScreen says it "protected your PC": press **More info**, then **Run anyway**.
3. In Mix It Up switch the Developer API on: Services > Developer API > Connect.
4. On the site press **Pair TCG Bridge** and type the code into the app (the site address is `https://cheesytcg.app`). The app turns green when the site and Mix It Up both answer.

It starts with Windows and lives in the tray; closing the window keeps it running. Quit from the tray menu. The window has its own title bar: minimise, and close (which only hides it to the tray). A rail on the left switches between Status, Settings and About; the Site, Mix It Up and OBS links are cards, each with a coloured dot and a one-line state in words.

The three tray icons differ by badge shape as well as colour: a dot for connected, a half-filled ring for partly connected, a cross for offline.

## Start-up and updates (0.5.0)

Every start opens a small start-up window first (also when Windows starts the app minimised, where it then leaves only the tray). It checks the latest GitHub release: "Checking for updates", then "Downloading update x.y.z" with a bar, then "Installing update" (the app restarts by itself) or "Starting". With no internet, or a check slower than 8 seconds, it starts anyway and the main window says "Couldn't check for updates". A download that fails (or stalls for 30 seconds) starts the current version and is tried again at the next 6-hour check. While the app runs it checks every 6 hours; a found update downloads and shows "ready, restart to update" in the window (it also installs when you quit). The start-up logic is `src/startup.ts`, a small state machine with no Electron imports (`npm run check` covers it).

## OBS (optional)

The app can also watch OBS on the same PC: it tells the site when the stream starts and stops, which scene is on air and whether the TCG overlay browser source is in that scene and visible, and the site's **Refresh overlay in OBS** button (Admin > Settings > OBS Overlay) presses "Refresh cache of current page" on it.

1. In OBS (28 or newer) open Tools > WebSocket Server Settings, tick **Enable WebSocket server** and copy the **Server Password**.
2. In the app's OBS card tick **Talk to OBS**, check the address (`ws://127.0.0.1:4455` is the OBS default), paste the password and press Save. The password is stored encrypted on this PC and is never sent to the site, and only `ws://localhost` and `ws://127.0.0.1` addresses are accepted.

**Big pulls (0.6.0).** A pull rule on the site can also save a clip, switch to a scene for a few seconds, or show a source while a pack opens. The app does only those three things, only with scene and source names it reported itself. A clip needs the OBS replay buffer running (Settings > Output > Replay Buffer in OBS); if it is off, the site's log says so. Tick **Start the replay buffer when the stream starts** in the OBS card to have the app start it for you (off by default).

**Control from the PC (0.7.0).** The **Control** tab has a switch to pause pulls (also in the tray menu), a list of Stream Deck buttons with **Copy**, three global hotkeys (empty by default; a clash is shown next to the field) and a **Pull queue** section with **Skip next pull** and **Clear queue** (a skipped paid pull is refunded). The buttons are web addresses on `127.0.0.1:47653` with a random key in the path, answered only to GET without a browser Origin: in the Stream Deck app add a "Website" action, paste the address and tick "GET request in background". If another program holds the port the tab says so. The queue is read only while its section is open, at most every 5 seconds.

**Chat and Brie Bucks (0.8.0).** Everything here is switched on from the site's Mix It Up page (Chat and Brie Bucks tab, and a rule's "Say in chat" line) and is off until then. The app posts the lines the site sends to chat (the start and end of a stream, and a big pull's shout, which the site sends on the card reveal). It can save every viewer's Brie Bucks to a CSV at the start and end of a stream, in `Documents\TCG Bridge\backups`, keeping the newest 30; **Open backups** on the Settings tab opens the folder. It also keeps a ledger of every charge and refund it ran (`ledger.json` in its data folder, the last 2000), which the site asks for at the end of a stream to compare with its own record; balances are not compared. Viewers are read from Mix It Up's top-users list, which leaves out bots.

The overlay is the browser source whose address is `<paired site>/overlay.html?...`; only its name is reported, never the address or key. An overlay inside a nested scene is not seen; an overlay inside a group is.

## Alerts, tests and the log

- **Alerts.** A Windows notification when the site link, Mix It Up or OBS drops while OBS says the stream is live (or any time OBS is switched off in the app), and one when it comes back. A part must be down 15 seconds first, and a part alerts at most once every 2 minutes. The "Alert me when a link drops while live" switch in the window turns the notifications off.
- **Tests** (buttons in the window, each answers in words): **Test Mix It Up** (Developer API, version, the chosen currency by id and name, a balance for a Twitch name, prefilled with the channel name), **Send test chat message**, **Check OBS**.
- **Start Mix It Up.** When Mix It Up is not found the window offers **Start Mix It Up**. It launches only `MixItUp.exe` from the path you chose with **Choose MixItUp.exe...**, else from Mix It Up's default install folder (`%LocalAppData%\MixItUp`). The **Start Mix It Up with TCG Bridge** switch (off by default) does it when the app starts.
- **Log.** One file a day in the app's logs folder (**Open log folder**), kept 7 days: connects, drops, jobs (kind, result, time) and errors. It never holds the pairing token, the OBS password, the pair code or the overlay key. **Copy diagnostics** copies the versions, the statuses and the last 20 jobs as text, redacted the same way, for a bug report.
- **Mix It Up commands (0.4.0).** The app lists your enabled Mix It Up commands to the site (on start, every 5 minutes and when Mix It Up comes back) so a rule on the Mix It Up page can pick one, and it runs a command for a big pull only if it is in that list. The command gets the viewer, card, rarity and version as arguments.
- **Updates.** The About tab shows the version and a **Check for updates** button. After an update the Status tab says "Updated to x.y.z" once, with a link to the release notes.

## Develop

```
cd bridge
npm install
npm run typecheck   # tsc --noEmit
npm run check       # fake Mix It Up, fake OBS and fake site, no Electron needed
npm start           # build, then run the app
npm run dist        # build the installer into release/ (not committed)
npm run icons       # redraw the app icon and tray PNGs from the site's icon (public/brand/icon.png)
```

`npm start -- --demo-startup` (ignored in the installed app) walks the start-up window through its states, then shows the window with made-up data; add `--shots=<folder>` to save a PNG of each and quit. `src/demo.ts` holds it and is left out of the installer.

`TCG_BRIDGE_DATA=<folder>` keeps the app's settings in that folder instead of the real user data folder, which is handy against a local site (`http://localhost:3000` is allowed as a site address; anything else must be https).

- `src/site.ts`, `src/mixitup.ts`, `src/obs.ts`, `src/jobs.ts`, `src/service.ts`, `src/settings.ts`, `src/alerts.ts`, `src/selftest.ts`, `src/launch.ts`, `src/log.ts`, `src/diagnostics.ts`, `src/update.ts`, `src/startup.ts`, `src/control.ts`: plain TypeScript with no Electron imports, so the checks run under Node.
- `src/main.ts`, `src/preload.ts` and `src/splash-preload.ts`: the Electron glue (tray, windows, auto start, updates, encrypted token).
- `renderer/`: the main window (`index.html`, `style.css`, `renderer.js`) and the start-up window (`splash.*`), plain HTML, CSS and JS with no framework and no network fetches. Colours are the site's cheesy theme as CSS variables. Fonts are the site's own, Fredoka and Nunito, bundled in `renderer/fonts/` (SIL OFL 1.1, licence files beside them). Icons are Lucide as inline SVG; licences in `renderer/LICENSES.txt`.
- `scripts/make-icons.ts` writes the app icon and the tray icons from the site's own icon, `public/brand/icon.png`, adding the status badge to each tray icon (the installer turns `build/icon.png` into the Windows icon).

To release: bump `version` in `package.json`, merge, then push a tag `bridge-v<version>`. `.github/workflows/bridge.yml` builds the installer on `windows-latest` and attaches it to a release of that tag.
