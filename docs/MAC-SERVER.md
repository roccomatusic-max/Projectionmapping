# Running Projector Control on a Mac server

A Mac that stays on (a Mac mini is ideal) can be the main server: the
dashboard, the mapping shows, the mini PCs beside the projectors and the phone
remote all talk to it. The Mac app sets that up by itself:

- it starts when the Mac turns on, before anyone logs in,
- it restarts itself if it ever stops,
- it is reachable from the mini PCs and the phone remote (it runs with `--lan`),
- it keeps the Mac from going to sleep while it runs (the screen can still turn off),
- it updates itself from GitHub with one button in **Settings → App updates**.

There is no Terminal, git or build step on the server.

The same server also runs on a Windows computer: see
[WINDOWS-SERVER.md](WINDOWS-SERVER.md). Both are built from every change with
the same version number ([SERVER-PARITY.md](SERVER-PARITY.md)).

**Tested:** installed on a real Mac server on 2026-10-17 by following the
steps below: the download, the one-line Terminal step, the password prompt,
the first sign-in and the dashboard all worked. Not yet exercised there:
starting after a reboot, and installing an update from GitHub.

---

## Install it

You need the Mac's password once.

**1. Download it.** On the server Mac, open
the [Mac app release](https://github.com/roccomatusic-max/Projectionmapping/releases/tag/mac-latest).
Download the zip for the Mac's chip. To check which chip it has: Apple menu
→ **About This Mac**. "Apple M1/M2/M3/M4…" → `ProjectorControl-Mac-AppleSilicon.zip`;
"Intel" → `ProjectorControl-Mac-Intel.zip`.

**2. Open it.** Open Terminal (Applications → Utilities → Terminal), paste
this one line and press Return:

```bash
cd ~/Downloads && { [ -d "Projector Control.app" ] || ditto -x -k ProjectorControl-Mac-*.zip . ; } && xattr -cr "Projector Control.app" && open "Projector Control.app"
```

It unzips the download if Safari has not already, tells macOS you trust it,
and opens it. (The app is not signed with a paid Apple Developer account,
so macOS would otherwise refuse to open it. If you prefer clicking: double-click
the zip, double-click **Projector Control**, press **Done** on the warning,
then go to System Settings → **Privacy & Security**, scroll down, press
**Open Anyway** and enter your password.)

**3. Enter the Mac's password** when asked. That lets it start by itself
when the Mac turns on.

**4. Sign in.** A message shows that it is running, and on the very first
install it shows the administrator username and password. The dashboard then
opens in your browser. Sign in, and change the password under **Settings**.
Once you have, opening the app no longer shows the first password.

The app now lives in **Applications** and you can delete the download. Opening
**Projector Control** again any time just opens the dashboard.

### Getting to the dashboard

It has no Dock or menu bar icon while it runs in the background.

- **On the server Mac:** open **Projector Control** (Applications, or ⌘ Space
  and type "Projector"). Drag it into the Dock for one click. Or bookmark
  `http://localhost:8765`.
- **Other computers on the network:** `http://YOUR-MAC.local:8765`, where
  YOUR-MAC is the **Local hostname** shown at the bottom of System Settings →
  General → Sharing on the server Mac.
- **Phone, from anywhere:** scan the QR code on the **Phone remote** page.

### Settings on the server Mac

In System Settings:

- **Energy** (or Energy Saver): turn on **Start up automatically after a power
  failure**, so a power cut does not leave the server off.
- If **FileVault** is on, the Mac waits at a password screen after every
  restart before anything can start. Either turn FileVault off for this
  dedicated server, or plan to type the password after a restart.

### The phone remote from anywhere

Install [Tailscale](https://tailscale.com/download/mac) on the server Mac and
sign in with the same account as your iPhone. Then open **Phone remote** in
the dashboard and scan the new QR code with the phone to pair it with this
server once.

### Mini PCs

Nothing to do: they find the new server on the network by themselves.
Approve them on the **Players** tab if they ask.

---

## Updates

Every change merged on GitHub publishes a new version. In the dashboard, go
to **Settings → App updates**:

- **Install** appears when a new version is ready. It restarts Projector
  Control, so the dashboard and phone remote are offline for about a minute.
  Do it between shows.
- If the new version does not start properly, the previous version is put
  back by itself and the panel says so.
- **Install updates by themselves** is on unless you switch it off. Every
  15 minutes it looks for a new version and installs it only when no mapping
  show is playing, paused or blacked out, no automation is running, and nobody
  has controlled the projectors for 10 minutes. The panel says what it is
  waiting for. A version that failed to start is not retried by itself.

No GitHub key or sign-in is needed: the repository is public, so the Mac
reads its releases directly. (If the repository is ever made private again,
the panel asks for a read-only GitHub key and links to the page that makes
one: choose **Only select repositories** → Projectionmapping, leave
**Contents** on **Read-only**, press **Generate token** and paste it in.)

You can also update by hand. First clear the old download out of the way
(otherwise step 2 opens the old copy again), by pasting this in Terminal:

```bash
find ~/Downloads -maxdepth 1 \( -name 'Projector Control*.app' -o -name 'ProjectorControl-Mac-*.zip' \) -exec rm -rf {} +
```

Then download the newest zip and run step 2 again: opening a newer copy
installs it over the old one.

---

## Backups and the setup guide

**Settings → Backup** in the dashboard:

- **Back up and download** saves everything the server is set up with into
  one zip file and downloads it: projectors, shows, cues, scenes, scene
  groups, saved maps, the calendar, mini PCs, automations, users and
  settings. Tick **Also include the pictures and videos** for a copy that
  works on a new server by itself (it shows how big that is). Keep the file
  on a USB stick or in your own cloud storage, never posted or sent to
  anyone: it holds the projector passwords and the server's secret key.
- The server also makes a backup by itself **every night after 3 AM**, when
  no show is playing (and one a few minutes after it first starts). It keeps
  the last 14, in `~/Library/Application Support/ProjectorControl/backups`. These leave the pictures and videos out.
- **Restore** on any backup in the list, or **Choose a backup file** under
  *Restore from a file*, shows what is in it and puts it back. Everything on
  the server is replaced, including the users and passwords; how things were
  is saved first as a *before a restore* backup. The server restarts and is back in about a minute; launchd starts it again by itself. Stop the show
  first if one is playing.
- The projector readings history and the command log stay out of backups.
  A backup made by a newer version than the server is refused until the
  server is updated.
- **Open the setup guide to print** shows one page with the whole system:
  addresses, versions, every projector and mini PC, the install lines and
  what to do if something breaks just before the show. Press **Print or save
  as PDF**. It has no passwords. Every backup has the same list inside, as
  `SETUP-GUIDE.txt`.

The same works on the Windows server ([WINDOWS-SERVER.md](WINDOWS-SERVER.md)), and a backup from one restores on the other.

---

## Moving your existing setup to the server

Easiest: on the old server, **Settings → Backup → Back up and download**
with the pictures and videos ticked; on the new one, install it, sign in and
use **Restore from a file**. Or copy the folder by hand. Projectors, shows,
media and users live in one folder. To bring them over from the Mac you use
today, on the **old** Mac quit Projector Control, then
copy the folder `~/Library/Application Support/ProjectorControl` onto the
server Mac at the same place **before** step 2 above. (In Finder: Go menu →
Go to Folder… → paste `~/Library/Application Support`.)

---

## Stopping it

To stop it starting by itself (the app and your data stay), paste this in
Terminal:

```bash
"/Applications/Projector Control.app/Contents/MacOS/ProjectorControl" --uninstall
```

Opening the app again sets it up again.

---

## When something is wrong

- **Forgot the admin password:** paste this in Terminal on the server Mac;
  it prints a new password for `admin`:
  `"/Applications/Projector Control.app/Contents/MacOS/ProjectorControl" --reset-admin-password`
- **The dashboard does not open:** open **Projector Control** again; it waits
  for the server and says if it is not answering.
- **The log** is in `~/Library/Application Support/ProjectorControl/logs/`
  (`projector-control.log`, and `service.log` for start-up errors).
- **The Terminal version is still running:** close that Terminal window
  first. Both want port 8765; the app retries every few seconds until it is
  free.
- **macOS asks whether Projector Control may find devices on your local
  network:** press **Allow**, or it cannot reach the projectors.
- **macOS asks about "App Management"** during an update or reinstall: allow
  it in System Settings → Privacy & Security → App Management.
- **macOS says "Background Items Added"**: that is the start-at-boot service;
  leave it on. If it is switched off under System Settings → General →
  Login Items (Allow in the Background), Projector Control cannot start by
  itself: switch ProjectorControl back on.
- **The dashboard does not come back after an update:** install the newest
  version by hand (end of **Updates** above). Opening it puts it in place and
  restarts the service.

## How it works

`backend/app/macservice.py` is the installer that runs when the app is
opened: it copies the bundle into /Applications, writes
`/Library/LaunchDaemons/com.projectorcontrol.server.plist` (a daemon that runs
as your user, `RunAtLoad` and `KeepAlive`) and starts it. The service runs the
same executable with `--serve --lan`. `backend/app/services/updates.py`
downloads updates from the `mac-latest` release, which
`.github/workflows/mac.yml` builds on Apple Silicon and Intel runners for
every merge to the default branch.
