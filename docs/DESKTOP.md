# Running it as a desktop application

You do not have to run a server. The same program runs as an ordinary
application on a Windows, macOS or Linux computer: double-click it, the
dashboard opens in your browser, and everything — projectors, history,
schedules — lives in a folder in your user profile.

Under the hood it is still the same web application serving itself on
`localhost`; that is what lets the phone and tablet views keep working with
`--lan`. There is no Docker, no PostgreSQL and nothing to install beside the
program itself.

---

## When desktop mode is the right choice

- A laptop at the show, driving the projectors from the front-of-house desk.
- A single projector, or a small install with no rack to put a server in.
- Trying the platform out before committing to a server.

## When it is not

**Monitoring, alerts and scheduled automations run only while the program is
open and the computer is awake.** Close the window, let the laptop sleep, or
reboot for updates, and nothing is watching the projectors. A 20:30 startup
schedule will not fire from a closed laptop.

If you want 24/7 monitoring — alerts at 3 a.m. about an enclosure getting
hot, scheduled shows that run whether or not someone remembered to open an
app — run the [Docker deployment](DEPLOYMENT.md) on a machine that stays on,
or run the desktop build as a service (below). Both modes use identical code
and an identical database schema; you can start with one and move to the
other by copying the database file.

---

## Getting it

**On a Mac, download the ready-made app** instead of building: it installs
itself as an always-on service. See [MAC-SERVER.md](MAC-SERVER.md).

There is no pre-built download yet — PyInstaller cannot cross-compile, so
each operating system's build has to be made on that operating system. The
build takes about five minutes.

### Windows

1. Install [Python 3.12](https://www.python.org/downloads/) (tick *Add to
   PATH*) and [Node.js 22](https://nodejs.org/).
2. In PowerShell, from the repository folder:
   ```powershell
   .\desktop\build.ps1
   ```
3. The application is `dist\ProjectorControl\ProjectorControl.exe`. Copy the
   whole `ProjectorControl` folder wherever you like; the `.exe` inside it is
   what you run.

### macOS / Linux

```bash
./desktop/build.sh
./dist/ProjectorControl/ProjectorControl
```

### From source, no build

```bash
cd backend
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd ../frontend && npm ci && npm run build && cp -r dist ../backend/static
cd ../backend && .venv/bin/python -m app.desktop
```

---

## First run

A terminal window opens with the log, and your browser opens on the sign-in
page. The first time, the administrator password is written to
`FIRST-RUN-PASSWORD.txt` in the data folder (the log prints the full path).
Sign in as `admin`, change the password under **Settings**, and delete that
file.

The data folder is:

| OS | Location |
|---|---|
| Windows | `%LOCALAPPDATA%\ProjectorControl\` |
| macOS | `~/Library/Application Support/ProjectorControl/` |
| Linux | `~/.local/share/ProjectorControl/` |

It holds `projector-control.db` (everything), `secret.key` (what makes the
stored projector passwords readable — **back it up with the database**) and
`logs/`.

---

## Options

```
ProjectorControl --lan              reachable from mini PCs, tablets and phones on your network
ProjectorControl --port 9000        choose the port (default 8765)
ProjectorControl --timezone Europe/London
ProjectorControl --no-browser       do not open a browser window
ProjectorControl --data-dir D:\shows\projector-control
```

`--lan` binds to every network interface on the computer. Use it on a
trusted network and never port-forward it; the [network guidance](DEPLOYMENT.md#2-network-layout)
applies here too. Without `--lan`, only this computer can reach the UI.

---

## Keeping it running as a service

The honest fix for "it only works while the window is open" is to run it as
a service, which the operating system starts at boot and restarts if it
dies. Then desktop mode is a server in all but name — SQLite instead of
PostgreSQL is fine for a handful of projectors.

### Windows (NSSM)

```powershell
# https://nssm.cc — a small, well-known service wrapper
nssm install ProjectorControl "C:\ProjectorControl\ProjectorControl.exe" --no-browser --lan
nssm set ProjectorControl AppStdout C:\ProjectorControl\service.log
nssm set ProjectorControl AppStderr C:\ProjectorControl\service.log
nssm start ProjectorControl
```

Set `PROJECTOR_CONTROL_DATA` as a system environment variable first if the
service account should use a specific data folder.

### Linux (systemd user service)

```ini
# ~/.config/systemd/user/projector-control.service
[Unit]
Description=Projector Control
After=network-online.target

[Service]
ExecStart=%h/ProjectorControl/ProjectorControl --no-browser --lan
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

```bash
systemctl --user enable --now projector-control
loginctl enable-linger $USER     # keep it running when you log out
```

### macOS

Use the Mac app instead: it installs itself as a service that starts at
boot, restarts itself and updates from GitHub. See [MAC-SERVER.md](MAC-SERVER.md).

---

## Moving between desktop and server

Both modes share the schema. To move a desktop install onto the Docker
deployment, dump the SQLite database and load it into PostgreSQL with
[pgloader](https://pgloader.io/), copy `secret.key` into `SECRET_KEY` in
`.env`, and start the stack. To go the other way, point the desktop app at a
SQLite file and re-enter the projector passwords (they are encrypted with the
server's key).

---

## Troubleshooting

**The browser does not open.** The terminal window shows the URL; open it
by hand. On a locked-down Windows machine the default-browser association
can be missing.

**"Port in use".** Another copy is probably still running. Either close it,
or start with `--port 9000`.

**Windows Defender SmartScreen warns about the .exe.** The build is unsigned.
Click *More info → Run anyway*, or sign it with your own certificate if you
distribute it.

**Everything else** — connection problems, missing telemetry, confirmation
errors — is identical to the server deployment: see
[TROUBLESHOOTING.md](TROUBLESHOOTING.md). The log file is in the data
folder's `logs/` directory.
