# Mac server and Windows server: the same thing, side by side

The main server comes in two separate downloads, the Mac app
([MAC-SERVER.md](MAC-SERVER.md)) and the Windows server
([WINDOWS-SERVER.md](WINDOWS-SERVER.md)). They are one program: the same
backend, the same dashboard, the same database, the same version number.
Only the part that hooks it into the operating system differs.

## The rule for every change

Anything that changes for the Mac changes for Windows, and the other way
round:

- **One build, one version.** `.github/workflows/mac.yml` builds both from
  the same commit, as `1.0.<run number>`, and publishes `mac-latest` and
  `windows-server-latest` together, only when both builds and the Windows
  install check have passed. A change that breaks one of them reaches
  neither.
- **The operating-system part lives in two twin files**, `backend/app/macservice.py`
  and `backend/app/winservice.py`. A change to what the service does (its
  flags, port, restart policy, data folder, first-run password, keep-awake)
  is made in both. `backend/tests/test_windows_service.py` fails if the two
  services stop running the server with the same flags and port.
- **Updates** (`backend/app/services/updates.py`) share every rule: when to
  check, when it is quiet enough to install, the two-minute rollback, never
  retrying a rolled-back version. Only the download name and the swap differ.
- **Docs:** a change to MAC-SERVER.md that a Windows user would also notice
  goes into WINDOWS-SERVER.md, and the table below is kept true.

## Feature by feature

Checked on 2026-10-19. "CI" is the Windows install check that runs on fresh
Windows Server 2022 and 2025 machines for every change
(`desktop/windows/ci/check-windows-server.ps1`).

| What | Mac app | Windows server | How the Windows side was checked |
|---|---|---|---|
| Download | `mac-latest` release, zip per chip | `windows-server-latest` release, one zip (x64; Windows on Arm runs it too) | CI builds and publishes it |
| Install | one Terminal line, then the Mac's password | one PowerShell line, then Yes on the Windows prompt | CI runs the same line in Windows PowerShell 5.1 |
| Unsigned-app warning | Gatekeeper, cleared by the Terminal line | SmartScreen does not appear with the PowerShell line; by hand: More info → Run anyway | the line never double-clicks anything |
| Blocked outright | (no Mac equivalent: Gatekeeper can always be cleared) | Smart App Control (Windows 11) blocks unsigned programs with no exception; the installer says so and how to proceed | unsigned builds; signing would need a paid certificate |
| Where the program goes | `/Applications/Projector Control.app` | `C:\Program Files\Projector Control` | CI |
| Starts at boot, before sign-in | launchd daemon, `RunAtLoad` | Windows service, Automatic start | CI checks the setting; a real reboot is not possible on build machines |
| Restarts if it stops | `KeepAlive`, 10 s throttle | recovery: restart after 5 s, every time, also after an exit with an error | CI kills the program and sees it come back |
| Runs with `--lan` on port 8765 | yes | yes, same flags | unit test compares the two; CI reaches it on the network address |
| Account it runs as | your Mac user | the system account (no sign-in needed) | CI |
| Data folder | `~/Library/Application Support/ProjectorControl` | `C:\ProgramData\ProjectorControl`, readable only by the service and administrators | CI checks the permissions |
| First-run password | dialog, and `FIRST-RUN-PASSWORD.txt` in the data folder | printed in the install window, and the same file | CI signs in with it |
| Password reset | `--reset-admin-password` in Terminal | the same flag, in PowerShell as administrator | CI: new password signs in, old one does not |
| Keep awake | `caffeinate -i -s` | Windows "system required" power request | CI sees it in `powercfg /requests` |
| Firewall | macOS asks once (local network) | install adds inbound rules for TCP 8765 (dashboard) and UDP 8765 (mini PC discovery) | CI checks both rules |
| Mini PCs find it | UDP broadcast answer | the same code, through the firewall rule | CI asks on the network address the way a mini PC does |
| Phone remote QR code | network address | the same network address | CI reads it from the Phone remote page's data |
| Name on the network | `name.local` (Bonjour) | `NAME` from other Windows PCs; `name.local` may work, not confirmed; the number always does | noted in CI, not provable from one machine |
| Tailscale link on the Phone remote page | Mac download | Windows download | CI checks the server reports Windows to that page |
| Settings → App updates | yes | yes, same panel | CI shows it with the right version |
| Settings → Home Assistant (integration bundled in the app, install line, key) | yes | yes, same files and endpoints | both builds' `--check` downloads the bundled integration; Home Assistant itself tested on Linux CI only |
| Settings → Phone alerts (ntfy or Pushover; `phone-alerts.json` in the data folder) | yes | yes, same code and file; outbound HTTPS only, no firewall change | unit tests (shared) |
| Install updates by themselves | on, quiet rules, every 15 min | same code | unit tests (shared) |
| Check now → Install, then refresh | swaps the bundle, launchd restarts | stages the new copy; a watcher stops the service, swaps, starts | CI installs a newer build through the panel's API |
| Rollback within 2 minutes | yes | yes | CI installs a broken build and sees the old one come back |
| Settings → Backup: back up, nightly backups, restore, setup guide | yes; restarts through launchd's KeepAlive | yes, same code; restarts through the service's recovery settings | CI backs up, restores and sees the service come back with the backup (`desktop/ci/check_backup.py`, also run on the built Mac app) |
| Backups kept in | `~/Library/Application Support/ProjectorControl/backups` | `C:\ProgramData\ProjectorControl\backups` | CI |
| Install again over an existing one | open a newer download | paste the line again | CI |
| Hands new Mini PC app versions to the mini PCs (Players → App) | yes | yes, same code | unit tests (shared); the mini PC side's install script runs in the Mini PC CI |
| Mini PC logs on the Players page (Get the log, sent after every update) | yes, kept in `minipc-logs/` beside `minipc-app/` | yes, same code and folder | unit tests (shared); the Mini PC CI checks a real update sends it |
| Stop starting by itself | `--uninstall` | `--uninstall` (also removes firewall rules and the Start menu entry) | CI |
| Logs | `logs/projector-control.log`, `logs/service.log` | the same, plus `updates/watch-update.log` | CI prints them when a check fails |
| Get to the dashboard on the server | open the app | Start → Projector Control | CI checks the entry exists |
| After a power cut | Energy setting | BIOS "Restore on AC power loss" | documented |
| Tonight's show times (Dashboard) | the Mac's time zone | the Windows clock's time zone | the same code; unit tests (shared) |

Not tried anywhere yet, on either system: a real reboot of the server, and
the whole path with real mini PCs, phones and projectors on the Windows
server.
