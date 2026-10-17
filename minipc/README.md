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

On the main computer, Projector Control has to accept connections from the
network. Start it with `--lan`:

```bash
./dist/ProjectorControl/ProjectorControl --lan        # macOS / Linux
ProjectorControl.exe --lan                            # Windows
```

Without it the Players tab says that no mini PC can reach it.

## Install

1. Download **MiniPC-Setup.exe** from the repository's
   [minipc-latest release](https://github.com/roccomatusic-max/Projectionmapping/releases/tag/minipc-latest)
   (no GitHub account needed). Copying it to the mini PC on a USB stick
   works too.
2. Run it on the mini PC. Windows may say it protected the PC, because the
   installer is not signed: **More info → Run anyway**.
3. The projector shows a pairing code. Approve it on **Mapping → Players**.

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
- **Updating**: run the new MiniPC-Setup.exe over the old one.
- **Removing**: Settings → Apps → Mini PC → Uninstall.

## Options

Add them to the Mini PC shortcut (Start menu and Startup folder) after
`MiniPC.exe`. Each one is remembered, so it only has to be given once.

| Option | |
|---|---|
| `--server http://192.168.1.10:8765` | Use this address instead of looking for the server. `--server auto` looks again |
| `--name "Left tower"` | How this computer is listed on the Players tab (default: its computer name) |
| `--camera off` | Never use a camera. Also `realsense`, `webcam:0`, `webcam:1`; default `auto` |
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
