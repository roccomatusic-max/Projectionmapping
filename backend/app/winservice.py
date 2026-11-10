"""Projector Control as an always-on service on a Windows server.

The Windows counterpart of :mod:`app.macservice`. One PowerShell line
(docs/WINDOWS-SERVER.md) downloads the ``windows-server-latest`` release and
runs ``ProjectorControl.exe --install`` as an administrator, which

1. copies the program into ``C:\\Program Files\\Projector Control``,
2. registers a Windows service that starts when the computer boots, before
   anyone signs in, restarts it if it ever stops, and runs it with ``--lan``
   on port 8765 so mini PCs and the phone remote can reach it,
3. opens Windows Firewall for the dashboard (TCP 8765) and for mini PC
   discovery (UDP 8765),
4. keeps the data in ``C:\\ProgramData\\ProjectorControl``, readable only by
   the service and administrators,
5. waits for the server and opens the dashboard, printing the first-run
   administrator password if there is one.

Running it again installs that version over the old one, or just opens the
dashboard. Updates from GitHub stage the new copy and hand over to a small
PowerShell watcher (``WATCH_SCRIPT``) that stops the service, swaps the
folders, starts it again and puts the old copy back if the new one does not
answer within two minutes; see :mod:`app.services.updates`.

Whatever changes here has a twin in macservice.py: keep them in step
(docs/SERVER-PARITY.md).
"""

from __future__ import annotations

import contextlib
import ctypes
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

from app.macservice import PORT, SERVICE_ENV, first_run_credentials, server_version, version_key

SERVICE_NAME = "ProjectorControl"
DISPLAY_NAME = "Projector Control"
DESCRIPTION = ("Projector Control server: the dashboard, mapping shows, mini PCs and the "
               "phone remote. Starts at boot and restarts itself.")
FOLDER_NAME = "Projector Control"
EXECUTABLE = "ProjectorControl.exe"
#: Restart 5 s after a crash, every time; the count resets after a day.
RECOVERY = [5000, 5000, 10000]
RESET_AFTER = 24 * 60 * 60
#: Inbound rules: the dashboard and API, and the mini PCs' discovery broadcast.
FIREWALL_RULES = {
    "Projector Control (dashboard)": ("TCP", PORT),
    "Projector Control (mini PC discovery)": ("UDP", PORT),
}
SHORTCUT_NAME = "Projector Control.url"
#: Well-known SIDs, so the permissions work whatever language Windows is in.
SYSTEM_SID = "*S-1-5-18"
ADMINISTRATORS_SID = "*S-1-5-32-544"


# -- where things are ---------------------------------------------------------

def install_dir() -> Path:
    return Path(os.environ.get("PROGRAMFILES") or r"C:\Program Files") / FOLDER_NAME


def data_folder() -> Path:
    """Per-machine data: the service runs before anyone signs in."""
    return Path(os.environ.get("PROGRAMDATA") or r"C:\ProgramData") / "ProjectorControl"


def shortcut_path() -> Path:
    base = Path(os.environ.get("PROGRAMDATA") or r"C:\ProgramData")
    return base / "Microsoft" / "Windows" / "Start Menu" / "Programs" / SHORTCUT_NAME


def running_folder(executable: str | None = None) -> Path | None:
    """The program folder this process runs from, or None outside a build."""
    if executable is None and not getattr(sys, "frozen", False):
        return None
    exe = Path(executable or sys.executable).resolve()
    return exe.parent if exe.name.lower() == EXECUTABLE.lower() else None


def folder_executable(folder: Path) -> Path:
    return folder / EXECUTABLE


def folder_version(folder: Path) -> str:
    """The build number stamped into a program folder (PyInstaller's _internal)."""
    for candidate in (folder / "_internal" / "version.txt", folder / "version.txt"):
        with contextlib.suppress(OSError):
            return candidate.read_text(encoding="utf-8").strip() or "dev"
    return "dev"


def is_admin() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())  # type: ignore[attr-defined]
    except (AttributeError, OSError):
        return False


def run(*command: str, check: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(list(command), capture_output=True, text=True, check=check,
                          creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))


# -- the Windows service ----------------------------------------------------

def service_command(folder: Path) -> str:
    return f'"{folder_executable(folder)}" --windows-service'


def service_arguments(folder: Path) -> list[str]:
    """What the service runs: the same server as the Mac service."""
    return ["--serve", "--lan", "--no-browser", "--port", str(PORT), "--data-dir", str(folder)]


def recovery_command() -> list[str]:
    actions = "/".join(f"restart/{delay}" for delay in RECOVERY)
    # sc.exe wants each "name=" and its value as separate words.
    return ["sc.exe", "failure", SERVICE_NAME, "reset=", str(RESET_AFTER), "actions=", actions]


def service_state() -> str | None:
    """'RUNNING', 'STOPPED', … or None when the service is not installed."""
    try:
        import win32service
        import win32serviceutil
    except ImportError:
        return None
    try:
        status = win32serviceutil.QueryServiceStatus(SERVICE_NAME)[1]
    except Exception:  # noqa: BLE001 - pywintypes.error: not installed
        return None
    names = {
        win32service.SERVICE_STOPPED: "STOPPED",
        win32service.SERVICE_START_PENDING: "START_PENDING",
        win32service.SERVICE_STOP_PENDING: "STOP_PENDING",
        win32service.SERVICE_RUNNING: "RUNNING",
    }
    return names.get(status, str(status))


def register_service(folder: Path) -> None:
    """Create the service, or point an existing one at ``folder``."""
    import win32service

    manager = win32service.OpenSCManager(None, None, win32service.SC_MANAGER_ALL_ACCESS)
    try:
        try:
            handle = win32service.OpenService(manager, SERVICE_NAME,
                                              win32service.SERVICE_ALL_ACCESS)
            win32service.ChangeServiceConfig(
                handle, win32service.SERVICE_WIN32_OWN_PROCESS,
                win32service.SERVICE_AUTO_START, win32service.SERVICE_ERROR_NORMAL,
                service_command(folder), None, 0, None, None, None, DISPLAY_NAME)
        except Exception:  # noqa: BLE001 - not installed yet
            handle = win32service.CreateService(
                manager, SERVICE_NAME, DISPLAY_NAME, win32service.SERVICE_ALL_ACCESS,
                win32service.SERVICE_WIN32_OWN_PROCESS, win32service.SERVICE_AUTO_START,
                win32service.SERVICE_ERROR_NORMAL, service_command(folder),
                None, 0, None, None, None)
        try:
            win32service.ChangeServiceConfig2(
                handle, win32service.SERVICE_CONFIG_DESCRIPTION, DESCRIPTION)
            # Restart after a crash and after an exit with an error, not after a stop.
            win32service.ChangeServiceConfig2(
                handle, win32service.SERVICE_CONFIG_FAILURE_ACTIONS, {
                    "ResetPeriod": RESET_AFTER, "RebootMsg": None, "Command": None,
                    "Actions": [(win32service.SC_ACTION_RESTART, delay) for delay in RECOVERY],
                })
            win32service.ChangeServiceConfig2(
                handle, win32service.SERVICE_CONFIG_FAILURE_ACTIONS_FLAG, True)
        finally:
            win32service.CloseServiceHandle(handle)
    finally:
        win32service.CloseServiceHandle(manager)


def start_service() -> None:
    import win32serviceutil

    with contextlib.suppress(Exception):  # already running
        win32serviceutil.StartService(SERVICE_NAME)


def stop_service(timeout: float = 60.0) -> None:
    """Stop the service and wait until its program has let go of its files."""
    import win32serviceutil

    if service_state() in (None, "STOPPED"):
        return
    with contextlib.suppress(Exception):
        win32serviceutil.StopService(SERVICE_NAME)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline and service_state() not in (None, "STOPPED"):
        time.sleep(0.5)
    # One stuck in start-up may never stop on a polite request.
    run("taskkill", "/F", "/IM", EXECUTABLE, "/FI", f"SERVICES eq {SERVICE_NAME}")
    time.sleep(1)


def delete_service() -> None:
    import win32serviceutil

    stop_service()
    with contextlib.suppress(Exception):
        win32serviceutil.RemoveService(SERVICE_NAME)


# -- the rest of the machine --------------------------------------------------

def protect_data_folder(folder: Path) -> None:
    """Only the service (SYSTEM) and administrators may read the database and key."""
    folder.mkdir(parents=True, exist_ok=True)
    # The folder only: "/T" here would strip every file's inherited access,
    # and the folder's (OI)(CI) grants cannot be set on a file, leaving the
    # database readable by nobody, not even the service.
    run("icacls", str(folder), "/inheritance:r",
        "/grant:r", f"{SYSTEM_SID}:(OI)(CI)F", f"{ADMINISTRATORS_SID}:(OI)(CI)F", "/C", "/Q")
    # Whatever is already inside (an earlier install, data copied from a Mac)
    # takes the folder's permissions.
    if any(folder.iterdir()):
        run("icacls", str(folder / "*"), "/reset", "/T", "/C", "/Q")


def open_firewall() -> bool:
    ok = True
    for name, (protocol, port) in FIREWALL_RULES.items():
        run("netsh", "advfirewall", "firewall", "delete", "rule", f"name={name}")
        added = run("netsh", "advfirewall", "firewall", "add", "rule", f"name={name}",
                    "dir=in", "action=allow", f"protocol={protocol}", f"localport={port}",
                    "profile=any", "enable=yes")
        ok = ok and added.returncode == 0
    return ok


def close_firewall() -> None:
    for name in FIREWALL_RULES:
        run("netsh", "advfirewall", "firewall", "delete", "rule", f"name={name}")


def write_shortcut() -> None:
    """Start menu → Projector Control opens the dashboard, like opening the Mac app."""
    path = shortcut_path()
    with contextlib.suppress(OSError):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"[InternetShortcut]\r\nURL=http://localhost:{PORT}/\r\n",
                        encoding="utf-8")


def port_reserved_by_windows(port: int = PORT) -> bool:
    """Hyper-V, WSL or Docker can reserve port ranges that nobody may then use."""
    result = run("netsh", "interface", "ipv4", "show", "excludedportrange", "protocol=tcp")
    for line in result.stdout.splitlines():
        parts = line.split()
        if (len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit()
                and int(parts[0]) <= port <= int(parts[1])):
            return True
    return False


def addresses() -> list[str]:
    """How other devices on the network reach this server."""
    from app.services.discovery import lan_address

    found = []
    ip = lan_address()
    if ip:
        found.append(f"http://{ip}:{PORT}")
    name = socket.gethostname()
    if name:
        found += [f"http://{name}:{PORT}", f"http://{name.lower()}.local:{PORT}"]
    return found


# -- copying the program into place -------------------------------------------

def replace_folder(source: Path, target: Path) -> None:
    """Put a copy of ``source`` at ``target``; the service must be stopped."""
    staging = target.with_name(f".{FOLDER_NAME}.installing")
    previous = target.with_name(f".{FOLDER_NAME}.previous")
    for leftover in (staging, previous):
        shutil.rmtree(leftover, ignore_errors=True)
    shutil.copytree(source, staging)
    if target.exists():
        # A virus scanner may still hold a file of the old copy for a moment.
        for attempt in range(30):
            try:
                target.rename(previous)
                break
            except OSError:
                if attempt == 29:
                    raise
                time.sleep(1)
    staging.rename(target)
    shutil.rmtree(previous, ignore_errors=True)


# -- talking to the person ---------------------------------------------------

def owns_console() -> bool:
    """Whether this window closes when we exit (opened by a double-click or elevation)."""
    try:
        processes = (ctypes.c_uint * 4)()
        return ctypes.windll.kernel32.GetConsoleProcessList(processes, 4) <= 1  # type: ignore[attr-defined]
    except (AttributeError, OSError):
        return False


def pause_if_window_closes() -> None:
    if owns_console():
        with contextlib.suppress(EOFError, OSError):
            input("\nPress Enter to close this window.")


def open_dashboard() -> None:
    """Through Explorer, so the browser opens as the signed-in person, not as administrator."""
    url = f"http://localhost:{PORT}/"
    try:
        subprocess.Popen(["explorer.exe", url])  # noqa: S603, S607
    except OSError:
        webbrowser.open(url)


def relaunch_as_admin(args: list[str]) -> int:
    """Ask Windows (the UAC prompt) to run this program again as administrator."""
    params = subprocess.list2cmdline(args)
    result = ctypes.windll.shell32.ShellExecuteW(  # type: ignore[attr-defined]
        None, "runas", sys.executable, params, None, 1)
    if result <= 32:
        print("Projector Control needs to run as administrator once, to set itself up "
              "to start with Windows. Answer Yes on the prompt, or run PowerShell as "
              "administrator and try again.")
        return 1
    return 0


# -- entry points -------------------------------------------------------------

def install(*, open_browser: bool = True) -> int:
    """Install or update the service from the program folder this runs from."""
    source = running_folder()
    if source is None:
        print("Run this from the downloaded Projector Control folder.")
        return 1
    if not is_admin():
        args = ["--install"] + ([] if open_browser else ["--no-browser"])
        return relaunch_as_admin(args)

    target = install_dir()
    folder = data_folder()
    print(f"Installing Projector Control {folder_version(source)} as a Windows service...")
    protect_data_folder(folder)
    (folder / "logs").mkdir(exist_ok=True)

    copied = False
    if source.resolve() != target.resolve():
        installed = folder_version(target) if target.exists() else None
        if installed is None or version_key(folder_version(source)) >= version_key(installed):
            stop_service()
            try:
                replace_folder(source, target)
            except OSError as exc:
                print(f"\nCould not copy Projector Control into {target}:\n  {exc}\n\n"
                      "Close any window that has a file from that folder open and run the "
                      "install line again.")
                start_service()
                return 1
            copied = True
        else:
            print(f"Version {installed} is already installed, which is newer; keeping it.")

    first_install = service_state() is None
    register_service(target)
    if not open_firewall():
        print("\nWARNING: Windows Firewall did not accept the rules for port 8765, so mini PCs "
              "and phones may not reach this server. See docs/WINDOWS-SERVER.md.")
    write_shortcut()
    if port_reserved_by_windows():
        print(f"\nWARNING: Windows has reserved port {PORT} for Hyper-V, WSL or Docker, so "
              "Projector Control cannot use it. See docs/WINDOWS-SERVER.md, section "
              "'When something is wrong'.")
    start_service()

    print("Starting Projector Control...")
    expected = folder_version(target)
    answered = server_version(expected)
    if answered is None:
        print(f"\nProjector Control is installed but the server has not answered yet.\n"
              f"Its log is in {folder / 'logs'}. Run the install line again in a minute "
              "to check.")
        return 1
    if answered != expected:
        print(f"\nAnother copy of Projector Control (version {answered}) is using port {PORT}, "
              "so the installed one cannot start. It is usually one started by hand in a "
              "window: close that window. The service then starts by itself within a few "
              "seconds.")
        return 1

    lines = ["", f"Projector Control {expected} is running on this computer.",
             "It starts by itself whenever Windows starts and restarts itself if it ever stops.",
             "", "Dashboard on this computer:  http://localhost:8765"]
    others = addresses()
    if others:
        lines += ["From other devices on the network:"] + [f"  {a}" for a in others]
    password = first_run_credentials(folder)
    if password:
        lines += ["", "First sign-in:", "    username: admin", f"    password: {password}",
                  "", "Change the password under Settings after you sign in."]
    elif first_install or copied:
        lines += ["", "Sign in with your existing admin account."]
    print("\n".join(lines))
    if open_browser:
        open_dashboard()
    return 0


def launch() -> int:
    """Double-clicking ProjectorControl.exe: install, or open the dashboard."""
    if service_state() == "RUNNING" and running_folder() == install_dir():
        open_dashboard()
        return 0
    code = install()
    pause_if_window_closes()
    return code


def uninstall() -> int:
    """Stop the service and remove it. Leaves the program and all data in place."""
    if not is_admin():
        print("Run this in PowerShell opened as administrator "
              "(right-click Start, then Terminal (Admin) or Windows PowerShell (Admin)).")
        return 1
    delete_service()
    close_firewall()
    with contextlib.suppress(OSError):
        shortcut_path().unlink(missing_ok=True)
    print("Projector Control no longer starts by itself. The program is still in "
          f"{install_dir()} and your data in {data_folder()}.")
    return 0


# -- inside the service ---------------------------------------------------------

def keep_awake() -> None:
    """Stop Windows from sleeping while the server runs (the display still may)."""
    # ES_CONTINUOUS | ES_SYSTEM_REQUIRED: holds for as long as this thread lives,
    # and shows in "powercfg /requests" like caffeinate does in pmset.
    flags = 0x80000000 | 0x00000001

    def hold() -> None:
        while True:
            with contextlib.suppress(AttributeError, OSError):
                ctypes.windll.kernel32.SetThreadExecutionState(flags)  # type: ignore[attr-defined]
            time.sleep(3600)

    threading.Thread(target=hold, name="keep-awake", daemon=True).start()


def run_service() -> int:
    """Entry point when Windows starts the service (``--windows-service``)."""
    import servicemanager
    import win32service
    import win32serviceutil

    from app import desktop

    class Service(win32serviceutil.ServiceFramework):
        _svc_name_ = SERVICE_NAME
        _svc_display_name_ = DISPLAY_NAME

        def SvcStop(self) -> None:  # noqa: N802 - pywin32's name
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING, waitHint=30_000)
            desktop.request_stop()

        def SvcDoRun(self) -> None:  # noqa: N802 - pywin32's name
            folder = data_folder()
            logs = folder / "logs"
            with contextlib.suppress(OSError):
                logs.mkdir(parents=True, exist_ok=True)
                # Start-up errors land here, like the Mac's service.log.
                stream = (logs / "service.log").open("a", encoding="utf-8", buffering=1)
                sys.stdout = sys.stderr = stream
            os.environ[SERVICE_ENV] = "1"
            try:
                code = desktop.main(service_arguments(folder))
            except BaseException:  # noqa: BLE001 - logged, then restarted below
                import traceback

                traceback.print_exc()
                code = 1
            if not desktop.stop_requested():
                # Ended by itself: leave without telling Windows we stopped, so its
                # recovery settings start us again, as launchd's KeepAlive does.
                print(f"server ended by itself (exit code {code}); Windows restarts it",
                      flush=True)
                os._exit(1)

    servicemanager.Initialize()
    servicemanager.PrepareToHostSingle(Service)
    servicemanager.StartServiceCtrlDispatcher()
    return 0
