# Running Projector Control on a Windows server

A Windows computer that stays on (a machine in the rack is ideal) can be the
main server, exactly like the Mac server: the dashboard, the mapping shows,
the mini PCs beside the projectors and the phone remote all talk to it. The
Windows server sets that up by itself:

- it starts when Windows starts, before anyone signs in,
- it restarts itself if it ever stops,
- it is reachable from the mini PCs and the phone remote (it runs with `--lan`
  on port 8765, and opens Windows Firewall for it),
- it keeps Windows from going to sleep while it runs (the screen can still turn off),
- it updates itself from GitHub with one button in **Settings → App updates**.

It is the same program as the Mac app, built from the same code with the same
version number every time a change is merged (see
[SERVER-PARITY.md](SERVER-PARITY.md)). There is no git or build step on the
server.

> **Which download is which.** This page is the **main server**
> (`ProjectorControl-Windows-Server.zip`, release `windows-server-latest`).
> The **Mini PC app** (`MiniPC-Setup.exe`, release `minipc-latest`) is
> different: it goes on the small computers beside each projector and shows
> the picture. Never install the Mini PC app on the server, or the server
> install on a mini PC.

**Tested:** every step on this page, from the install line to uninstalling,
runs on fresh Windows Server 2022 and Windows Server 2025 machines for every
change (GitHub's build machines; the checklist is
[`desktop/windows/ci/check-windows-server.ps1`](../desktop/windows/ci/check-windows-server.ps1)).
Not yet exercised: Windows 10 or 11 desktop editions, a real reboot (the
service is set to start automatically, but build machines cannot be
rebooted), and reaching it from a real iPhone or mini PC.

Needs 64-bit Windows 10, Windows 11, or Windows Server 2016 or newer.

---

## Install it

You need an administrator account on the server once.

**1. Open PowerShell.** Click **Start**, type `PowerShell` and press Enter.

**2. Paste this one line** and press Enter:

```powershell
[Net.ServicePointManager]::SecurityProtocol='Tls12'; irm https://github.com/roccomatusic-max/Projectionmapping/releases/download/windows-server-latest/install-windows-server.ps1 | iex
```

**3. Answer Yes** when Windows asks whether to allow PowerShell to make
changes. A second PowerShell window opens and carries on: it downloads the
newest version, copies it into `C:\Program Files\Projector Control`, sets it
up to start with Windows and starts it.

**4. Sign in.** The window shows that it is running, the addresses other
devices can use, and on the very first install the administrator username
and password. The dashboard opens in your browser. Sign in, and change the
password under **Settings**.

Windows SmartScreen does not appear with this line, because nothing is
double-clicked. (If you download `ProjectorControl-Windows-Server.zip` by hand
from the [release page](https://github.com/roccomatusic-max/Projectionmapping/releases/tag/windows-server-latest)
instead, unzip it and double-click `ProjectorControl.exe` in the
`Projector Control` folder: Windows says **"Windows protected your PC"**
because the program is not signed with a paid certificate. Press
**More info**, then **Run anyway**, then **Yes**.)

### Windows blocked it

If the window says **"Windows blocked Projector Control on this computer"**
(or, from an older install line, *"An Application Control policy has blocked
this file"*), that computer has **Smart App Control** on. It is a Windows 11
feature that only lets programs signed with a paid certificate run, and it
has no "allow this one program" button. Projector Control is not signed, the
same as the Mac app. Pick one:

- **Install on another machine.** Windows Server never has Smart App Control,
  and most PCs that were upgraded rather than freshly installed have it off.
- **Turn it off on this one:** Windows Security → **App & browser control** →
  **Smart App Control settings** → **Off**, then run the line again. On many
  Windows versions it cannot be turned back on without resetting Windows.

To see whether it is on, paste this into PowerShell: `1` means on, `0` off.

```powershell
(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy').VerifiedAndReputablePolicyState
```

The same message on a work-managed PC with Smart App Control off means the
company's App Control policy blocks it; its IT admin would have to allow it.

If Microsoft Defender or another virus scanner removes `ProjectorControl.exe`
during the install, that is a false alarm that unsigned Python programs often
get. In **Windows Security → Virus & threat protection → Protection history**,
open the entry, choose **Allow on device**, and run the line again.

### Getting to the dashboard

- **On the server:** Start → **Projector Control**, or bookmark
  `http://localhost:8765`.
- **Other computers, phones and tablets on the network:** the address the
  install window printed, like `http://192.168.1.20:8765`. The number is the
  server's address on your network. So that it never changes, give the server
  a fixed address in UniFi: **UniFi Network → Client Devices → the server →
  Settings → Fixed IP Address**.
- **By name:** `http://SERVERNAME:8765` (the computer name, shown in Settings →
  System → About) works from other Windows computers.
  `http://servername.local:8765`, the form the Mac uses, may also work from
  iPhones and Macs, because recent Windows versions answer it, but this has
  not been tried on your network; the number always works.
- **Phone, from anywhere:** scan the QR code on the **Phone remote** page. It
  uses the number, so it works whether or not the name does.

### Settings on the server

- **After a power cut:** in the computer's BIOS or UEFI setup, set
  **Restore on AC power loss** (or "AC Back", "Power On after power failure")
  to **Power On**, so a power cut does not leave the server off. This is the
  Windows counterpart of the Mac's "Start up automatically after a power failure".
- **Windows Update** restarts the computer from time to time; Projector
  Control starts again by itself, nobody has to sign in. Set **active hours**
  (Settings → Windows Update → Advanced options) to cover your show times.
- If **BitLocker** asks for a PIN at start-up, the server waits at that
  screen after every restart before anything can start, like FileVault on a
  Mac. Use BitLocker without a start-up PIN on this dedicated server.

### The phone remote from anywhere

Install [Tailscale](https://tailscale.com/download/windows) on the server and
sign in with the same account as your iPhone. Then open **Phone remote** in
the dashboard and scan the new QR code with the phone to pair it with this
server once.

### Mini PCs

Nothing to do: they find the server on the network by themselves (the
install opened Windows Firewall for that). Approve them on the **Players**
tab if they ask.

Run **one** main server on the show network at a time. If the Mac server and
the Windows server are both on, a mini PC may connect to either.

---

## Updates

Exactly as on the Mac. Every change merged on GitHub publishes a new version,
for the Mac and for Windows together, with the same number. In the
dashboard, go to **Settings → App updates**:

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

No GitHub key or sign-in is needed: the repository is public. (If it is ever
made private, the panel asks for a read-only GitHub key, as on the Mac.)

You can also update by hand: paste the install line again. It installs the
newest version over the old one and keeps all your data.

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
  the last 14, in `C:\ProgramData\ProjectorControl\backups`. These leave the pictures and videos out.
- **Restore** on any backup in the list, or **Choose a backup file** under
  *Restore from a file*, shows what is in it and puts it back. Everything on
  the server is replaced, including the users and passwords; how things were
  is saved first as a *before a restore* backup. The server restarts and is back in about a minute; the service's recovery settings start it again by themselves. Stop the show
  first if one is playing.
- The projector readings history and the command log stay out of backups.
  A backup made by a newer version than the server is refused until the
  server is updated.
- **Open the setup guide to print** shows one page with the whole system:
  addresses, versions, every projector and mini PC, the install lines and
  what to do if something breaks just before the show. Press **Print or save
  as PDF**. It has no passwords. Every backup has the same list inside, as
  `SETUP-GUIDE.txt`.

The same works on the Mac app ([MAC-SERVER.md](MAC-SERVER.md)), and a backup from one restores on the other.

---

## Moving your existing setup to the server

Easiest: on the Mac, **Settings → Backup → Back up and download** with the
pictures and videos ticked; on the Windows server, sign in and use **Restore
from a file**. Or copy the folder by hand. Projectors, shows, media and users
live in one folder, and it works the same on a Mac and on Windows. To bring
them over from the Mac server:

1. Install the Windows server as above, so the folder exists.
2. On the Mac, stop the server so nothing changes while you copy:
   `"/Applications/Projector Control.app/Contents/MacOS/ProjectorControl" --uninstall`
3. Copy everything inside `~/Library/Application Support/ProjectorControl` on
   the Mac (in Finder: Go menu → Go to Folder… → paste that path) onto a USB
   stick, into a folder called `ProjectorControl`.
4. On the Windows server, open PowerShell as administrator (right-click
   Start → **Terminal (Admin)** or **Windows PowerShell (Admin)**) and paste,
   replacing `E:` with the USB stick's drive letter:

   ```powershell
   Stop-Service ProjectorControl; Copy-Item -Recurse -Force E:\ProjectorControl\* C:\ProgramData\ProjectorControl\; Start-Service ProjectorControl
   ```

Sign in with the Mac's admin password afterwards. The mini PCs find the new
server by themselves; scan the phone remote's QR code again.

---

## Stopping it

To stop it starting by itself (the program and your data stay), paste this in
PowerShell opened as administrator:

```powershell
& "C:\Program Files\Projector Control\ProjectorControl.exe" --uninstall
```

That also removes its firewall rules and its Start menu entry. Running the
install line again sets it up again. To remove it completely afterwards, also
delete the folders `C:\Program Files\Projector Control` and
`C:\ProgramData\ProjectorControl` (the second one holds all your data).

---

## When something is wrong

The commands below go in PowerShell opened **as administrator** (right-click
Start → **Terminal (Admin)** or **Windows PowerShell (Admin)**): the data
folder is readable only by administrators, because it holds the projector
passwords' key.

- **Forgot the admin password:** this prints a new password for `admin`,
  while the server keeps running:
  `& "C:\Program Files\Projector Control\ProjectorControl.exe" --reset-admin-password`
- **Lost the first-run password before signing in:**
  `Get-Content C:\ProgramData\ProjectorControl\FIRST-RUN-PASSWORD.txt`
- **The dashboard does not open:** paste the install line again; it waits for
  the server and says if it is not answering.
- **Is it running?** `Get-Service ProjectorControl` says Running or Stopped.
  `Restart-Service ProjectorControl` restarts it.
- **The log** is in `C:\ProgramData\ProjectorControl\logs\`
  (`projector-control.log`, and `service.log` for start-up errors).
  Updates write `C:\ProgramData\ProjectorControl\updates\watch-update.log`.
- **Another copy is running:** a copy started by hand in a window holds port
  8765 and the service waits, retrying every few seconds. Close that window.
- **"Windows has reserved port 8765"** (the install window says so): Hyper-V,
  WSL or Docker on this computer took a block of ports that includes 8765.
  This usually fixes it, in PowerShell as administrator, then restart the
  computer:
  `net stop winnat; netsh int ipv4 add excludedportrange protocol=tcp startport=8765 numberofports=1; net start winnat`
- **Mini PCs or phones cannot reach it:** check that the firewall rules are
  there: `Get-NetFirewallRule -DisplayName "Projector Control*"` should list
  two. Paste the install line again to put them back. A separate firewall or
  antivirus suite may need port 8765 (TCP and UDP) allowed by hand.
- **The dashboard does not come back after an update:** paste the install
  line again. It puts the newest version in place and restarts the service.

## How it works

`backend/app/winservice.py` is the installer that `ProjectorControl.exe
--install` runs: it copies the program into `C:\Program Files\Projector
Control`, protects `C:\ProgramData\ProjectorControl` so only the service and
administrators can read it, registers the Windows service `ProjectorControl`
(Automatic start, runs as the system account, restart 5 seconds after any
crash), adds the inbound firewall rules for TCP and UDP 8765 and the Start
menu shortcut, and starts it. Windows starts the same program with
`--windows-service`, which runs the server with the same flags as the Mac
service (`--serve --lan --no-browser --port 8765`).
`backend/app/services/updates.py` downloads updates from the
`windows-server-latest` release; because Windows cannot move a running
program's folder, a small PowerShell watcher stops the service, swaps the
folders, starts it again, and swaps back if the new version does not answer
within two minutes. `.github/workflows/mac.yml` builds the Mac app and the
Windows server from every merge and publishes both only when both pass.
