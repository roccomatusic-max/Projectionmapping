# Mini PC app

One program for each Windows computer beside a projector. Install it once,
and every time the computer signs in it:

- finds the main server on the network by itself,
- fills the projector with the output in a kiosk window: no tabs, no
  address bar, no window frame, and reopened if it ever closes,
- keeps the show's media on its own disk, so the network only carries the
  small control messages during the show,
- runs the camera when one is plugged in, for calibration and people,
- keeps the screen and the computer from going to sleep.

The first time, the projector shows a six-letter code. Approve it on
**Mapping → Players** and pick the output. A camera plugged into the mini PC
is approved with it and shows up on **Mapping → Camera**.

## Before you start

This is the app for the computers **beside the projectors**. The main server
is a different download: the [Mac app](../docs/MAC-SERVER.md) or the
[Windows server](../docs/WINDOWS-SERVER.md), which both accept mini PCs from
the network already.

If you run the main program by hand instead, it has to accept connections
from the network. Start it with `--lan`:

```bash
./dist/ProjectorControl/ProjectorControl --lan        # macOS / Linux
ProjectorControl.exe --lan                            # Windows
```

Without it the Players tab says that no mini PC can reach it.

## Install

On each mini PC, signed in as the user that will run the show:

**1. Open PowerShell.** Click **Start**, type `PowerShell` and press Enter.

**2. Paste this one line** and press Enter:

```powershell
[Net.ServicePointManager]::SecurityProtocol='Tls12'; irm https://github.com/roccomatusic-max/Projectionmapping/releases/download/minipc-latest/install-minipc.ps1 | iex
```

It first checks that Windows will let the app run (see
[Windows blocked it](#windows-blocked-it)), then downloads the newest
**MiniPC-Setup.exe**, installs it and starts it. No administrator rights
needed, and Windows SmartScreen does not appear, because nothing is
double-clicked.

**3. Approve it.** The projector shows a six-letter pairing code. Approve it
on **Mapping → Players** and pick the output.

Without PowerShell: download **MiniPC-Setup.exe** from the
[minipc-latest release](https://github.com/roccomatusic-max/Projectionmapping/releases/tag/minipc-latest)
(no GitHub account needed; a USB stick works too) and double-click it.
Windows says **"Windows protected your PC"** because the installer is not
signed with a paid certificate: press **More info**, then **Run anyway**.

### Windows blocked it

If the PowerShell window says **"Windows blocks the Mini PC app on this
computer"**, or double-clicking MiniPC-Setup.exe says *"An Application
Control policy has blocked this file"* with no Run anyway button, that mini
PC has **Smart App Control** on. It is a Windows 11 feature that only lets
programs signed with a paid certificate run, and it has no "allow this one
program" button. The Mini PC app is not signed, the same as the main server.
Freshly reset Windows 11 PCs, which refurbished mini PCs often are, can have
it on.

**Turn it off on the mini PC:** Windows Security → **App & browser control**
→ **Smart App Control settings** → **Off**, then run the line again. On many
Windows versions it cannot be turned back on without resetting Windows, which
is fine for a computer that only runs the show.

To see whether it is on, paste this into PowerShell: `1` means on, `0` off,
`2` means Windows is still deciding (the app installs, and if it ever stops
starting, turn Smart App Control off as above).

```powershell
(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy').VerifiedAndReputablePolicyState
```

The same message on a work-managed PC with Smart App Control off means the
company's App Control policy blocks it; its IT admin would have to allow it.

If Microsoft Defender or another virus scanner removes `MiniPC.exe` during
the install, that is a false alarm that unsigned Python programs often get.
In **Windows Security → Virus & threat protection → Protection history**,
open the entry, choose **Allow on device**, and run the line again.

### After the install

It installs for the signed-in user and starts whenever that user signs in.
For the show to come back by itself after a power cut, Windows has to sign
in without a password prompt: run `netplwiz` and untick *Users must enter a
user name and password* (on Windows 11, first turn off *Settings → Accounts
→ Sign-in options → For improved security, only allow Windows Hello
sign-in*).

Plug the projector in as the computer's only display, or as its main one,
and set it to the projector's native resolution.

## Everyday use

- **To reach the desktop**: press the Windows key, click the Mini PC icon by
  the clock (under the ^ arrow) and choose **Quit**. It starts again at the
  next sign-in, or from the Start menu.
- **Restart the output** in the same menu reopens the window.
- **From the Players page** (Mapping → Players, on any computer or phone):
  each mini PC has Restart output, Restart computer, Shut down and, once it
  is off, Turn on (Wake-on-LAN, if its BIOS allows it), plus test pictures
  and an info overlay for its projector. Restart computer and Shut down
  need a Mini PC app installed after these controls arrived: paste the
  install line once.
- **Updating**: paste the install line again (or run the new MiniPC-Setup.exe
  over the old one). It does not update by itself.
- **Removing**: Settings → Apps → Mini PC → Uninstall.

## Options

Add them to the Mini PC shortcut (Start menu and Startup folder) after
`MiniPC.exe`. Each one is remembered, so it only has to be given once.

| Option | |
|---|---|
| `--server http://192.168.1.10:8765` | Use this address instead of looking for the server. `--server auto` looks again |
| `--name "Left tower"` | How this computer is listed on the Players tab (default: its computer name) |
| `--camera off` | Never use a camera. Also `realsense`, `orbbec`, `oak`, `webcam`, `webcam:0`, `webcam:1`; default `auto` (a depth camera if one is plugged in, otherwise a webcam) |
| `--browser "C:\path\to\chrome.exe"` | Chrome or Edge somewhere unusual. Default: Chrome if installed, otherwise Edge |

Settings and logs are in `%LOCALAPPDATA%\ProjectionMapping MiniPC`
(**Open the log folder** in the tray menu). `config.json` there holds this
computer's identity; delete it to pair the computer as a new one.

## How it works

- **Finding the server.** It broadcasts on UDP port 8765; the server
  answers with its HTTP port (`backend/app/services/discovery.py`). It tries
  the last server it found first, and looks again if the server stops
  answering for 15 seconds, so a main computer that gets a new address
  overnight is found again.
- **The window.** Chrome or Edge in kiosk mode, on a profile of its own, at
  a local page that waits for the server and then moves on to
  `http://<server>/player`. One page pixel is one projector pixel, whatever
  Windows' display scaling says. The server's address is marked secure so
  the player can cache media offline.
- **One machine, one approval.** The app makes one secret for the computer.
  The player page gets it in the address fragment (which browsers never
  send to the server), and the camera uses the same secret, so the server
  knows they are one machine.
- **The camera** is the [camera agent](../camera-agent/README.md), run in
  the background whenever a camera answers; it is looked for again every 30
  seconds.

## Building

The installer is built by GitHub Actions (`.github/workflows/minipc.yml`) on
every change to this folder, and published to the `minipc-latest` release
when the change is merged. To build it on a Windows computer instead, with
Python 3.12 and [Inno Setup 6](https://jrsoftware.org/isdl.php):

```powershell
.\minipc\build.ps1
```

Result: `dist\MiniPC-Setup.exe`.

## Developing

It runs on Linux and macOS too, which is how it is tested (no tray icon
there; Chrome or Chromium is needed):

```bash
cd minipc
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt pytest ruff
.venv/bin/python minipc.py --verbose
.venv/bin/python -m pytest -q tests
```
