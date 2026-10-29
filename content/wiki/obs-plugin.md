---
title: The OBS plugin
summary: Installing the TCG dock in OBS from TCG Bridge, and what each control in it does.
order: 44
covers: obs-plugin/**, bridge/src/obsinstall.ts
---

The OBS plugin adds a dock called **TCG** inside OBS, so the live controls are on the same screen as your scenes. Like the [Stream Deck plugin](/admin/wiki/stream-deck), it does not talk to the site. It talks to [TCG Bridge](/admin/wiki/tcg-bridge) on the same PC, and TCG Bridge does the work. It is built for Windows and for OBS 31, and also runs in OBS 32.

## Install

The plugin ships inside TCG Bridge, so there is nothing to download separately.

1. **Close OBS.** OBS loads plugins only when it starts.
2. In TCG Bridge open Setup, Connections, **OBS**, and find the **TCG dock for OBS** part. Press **Install OBS plugin**.
3. If OBS is still running, a window says "Close OBS before installing the plugin" with **Try again** and **Cancel**. TCG Bridge never closes OBS for you. Close it completely (also from the tray) and press **Try again**.
4. When it says "Installed. Start OBS, then open View > Docks > TCG.", start OBS.
5. In OBS open **View**, **Docks**, **TCG**. Drag the dock where you want it.

The plugin goes into `%ProgramData%\obs-studio\plugins\tcg-obs`. That folder is read by OBS for every user on the PC and needs no administrator rights. If Windows refuses the copy, the button says why: the folder was probably made by another Windows user or an administrator, so give your user full control of it, or delete it, and try again.

Installing also switches on TCG Bridge's Stream Deck link, because the dock talks through it. The state of the install is shown next to the button:

| State | Button |
| --- | --- |
| OBS not found | **Install OBS plugin**. Install OBS, or press **Choose obs64.exe...** on the same page. |
| Not installed | **Install OBS plugin** |
| Installed (up to date) | **Reinstall OBS plugin** |
| Installed (older) | **Update OBS plugin** |

After a TCG Bridge update the plugin shows "Installed (older)": close OBS, press **Update OBS plugin** and start OBS again. The plugin always has the same version as TCG Bridge; the dock's footer shows "Plugin x.y.z".

### The "OBS is newer than 31" warning

TCG Bridge reads the version of the OBS that is installed. The plugin is built for OBS 31 and also loads in OBS 32 (tried in 32.2.2). If the major version is newer than 32, the part shows something like "OBS 33.0.1 is newer than this plugin has been tried with (32). It may not load". The plugin still installs. If the dock does not appear in View, Docks after an OBS update, tell Josh; the plugin has to be rebuilt for the new OBS.

## The dock

The header shows a coloured dot and the state. A green dot with "Live" or "Offline" and "TCG Bridge connected" means all is well; Live follows OBS's stream status.

### Not running, and update TCG Bridge

- **TCG Bridge not running** (red dot): the body says "The dock needs TCG Bridge" and to open TCG Bridge on this PC. The dock connects by itself as soon as the app starts, and it keeps retrying. **Try again** retries at once. Pulls, the queue and the overlay keep working on the site; only the dock's buttons wait.
- **TCG Bridge needs an update** (amber dot): the dock needs TCG Bridge 0.43.0 or newer and says which version this PC runs. Update TCG Bridge (About, **Check for updates**); the dock connects by itself afterwards.

### Pulls

Two large buttons:

- **Pulls**: green "Pulls on / Press to pause" or amber "Pulls paused / Press to resume".
- **Awards**: the same for channel point awards, "Awards on" or "Awards paused". See [Twitch connection](/admin/wiki/twitch).

Until the site has answered, a button reads "Waiting for the site" and cannot be pressed. A line under them shows the pause reason, for example "scene BRB" when an OBS scene paused pulls.

### Happy hour

While one is running, the dock shows its name and "N min left" with **End**. Three presets are always there: **Free 15 min**, **Free 30 min** and **50% off 30 min**. Starting one while another runs replaces it.

### Queue

**QUEUE (n)** lists the pulls waiting: the viewer, what they are opening, and "showing" for the pull on screen or how long it has waited. It says "Nothing waiting" when empty.

- **Skip** skips the pull on screen. A paid pull is refunded.
- **Clear** empties the queue after asking "Clear the whole queue?". Paid pulls are refunded.

### Feed

The filter chips **All**, **Pulls**, **Requests**, **Events** and **Problems** pick what the list shows (one at a time). Lines are newest first with the local time; problems are red.

### Keyboard and screen readers

Tab goes through the buttons and chips from top to bottom, Space or Enter presses, and every button has a spoken name such as "Pulls on. Press to pause". If a press fails, the reason shows in red under the Pulls buttons.

There is no link to the Stream page in the dock. Use the browser for that.
