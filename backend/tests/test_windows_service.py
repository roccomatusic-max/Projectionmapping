"""The Windows server's service definition, its updater, and parity with the Mac app.

The Windows-only parts (the service itself, the firewall, the folder swap) run
on Windows runners in .github/workflows/mac.yml; these run everywhere.
"""

from __future__ import annotations

import io
import sys
import zipfile
from pathlib import Path

import pytest

from app import desktop, macservice, winservice
from app.services import updates
from app.services.updates import WINDOWS_ASSET, Updater

INSTALL = Path(r"C:\Program Files\Projector Control")


def windows_updater(tmp_path, current="1.0.5", machine="AMD64", bundle=INSTALL):
    return Updater(tmp_path, bundle, current=current, machine=machine, managed=True,
                   system="win32")


def windows_release(version="1.0.7"):
    return {
        "name": f"Projector Control for Windows server {version}",
        "assets": [
            {"name": WINDOWS_ASSET, "url": "https://api.github.com/assets/windows"},
            {"name": "install-windows-server.ps1", "url": "https://api.github.com/assets/ps1"},
        ],
    }


# -- parity with the Mac app -----------------------------------------------------

def test_the_service_runs_the_server_exactly_as_the_mac_service_does(tmp_path):
    """Same flags, same port: what one service does, the other does."""
    mac = macservice.service_definition(Path("/Applications/Projector Control.app"),
                                        tmp_path, "rocco", "/Users/rocco")["ProgramArguments"][1:]
    windows = winservice.service_arguments(tmp_path)
    assert windows == mac
    assert winservice.PORT == macservice.PORT == 8765


def test_both_services_offer_the_same_actions():
    for action in ("uninstall", "keep_awake", "server_version", "first_run_credentials"):
        assert callable(getattr(macservice, action))
        assert callable(getattr(winservice, action))
    assert callable(winservice.install) and callable(macservice.launch)
    assert callable(winservice.launch)


def test_updates_come_from_each_systems_own_release(tmp_path):
    mac = Updater(tmp_path, Path("/Applications/Projector Control.app"), managed=True,
                  system="darwin", machine="arm64")
    windows = windows_updater(tmp_path)
    assert mac.release_tag == "mac-latest"
    assert windows.release_tag == "windows-server-latest"
    assert mac.status()["system"] == "mac" and windows.status()["system"] == "windows"
    assert mac.supported and windows.supported


# -- the service definition ------------------------------------------------------

def test_the_service_starts_the_installed_program():
    command = winservice.service_command(INSTALL)
    assert command == rf'"{INSTALL}\ProjectorControl.exe" --windows-service' \
        or command == f'"{INSTALL / "ProjectorControl.exe"}" --windows-service'


def test_windows_restarts_it_after_every_crash():
    command = winservice.recovery_command()
    assert command[:3] == ["sc.exe", "failure", winservice.SERVICE_NAME]
    # sc.exe wants "name=" and the value as separate words.
    assert command[3:5] == ["reset=", str(24 * 60 * 60)]
    assert command[5] == "actions="
    assert command[6] == "restart/5000/restart/5000/restart/10000"


def test_firewall_lets_in_the_dashboard_and_mini_pc_discovery():
    from app.config import Settings

    rules = set(winservice.FIREWALL_RULES.values())
    assert ("TCP", 8765) in rules
    assert ("UDP", Settings().discovery_port) in rules


def test_the_running_program_folder_is_found_from_the_executable(tmp_path):
    exe = tmp_path / "Projector Control" / "ProjectorControl.exe"
    assert winservice.running_folder(str(exe)) == tmp_path / "Projector Control"
    assert winservice.running_folder("/home/x/dist/ProjectorControl/ProjectorControl") is None


def test_the_version_is_read_from_the_program_folder(tmp_path):
    (tmp_path / "_internal").mkdir()
    (tmp_path / "_internal" / "version.txt").write_text("1.0.42\n")
    assert winservice.folder_version(tmp_path) == "1.0.42"
    assert winservice.folder_version(tmp_path / "missing") == "dev"


def test_the_windows_build_keeps_its_data_where_the_service_finds_it(monkeypatch):
    monkeypatch.delenv("PROJECTOR_CONTROL_DATA", raising=False)
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setenv("PROGRAMDATA", r"C:\ProgramData")
    assert str(desktop.data_dir()).replace("/", "\\").endswith(r"C:\ProgramData\ProjectorControl")
    monkeypatch.setattr(sys, "frozen", False)
    monkeypatch.setenv("LOCALAPPDATA", r"C:\Users\x\AppData\Local")
    assert "ProgramData" not in str(desktop.data_dir())


def test_a_reserved_port_range_is_noticed(monkeypatch):
    table = """
Protocol tcp Port Exclusion Ranges

Start Port    End Port
----------    --------
      8700        8799
     50000       50059     *
"""
    monkeypatch.setattr(winservice, "run", lambda *a, **k: type("R", (), {"stdout": table})())
    assert winservice.port_reserved_by_windows(8765) is True
    assert winservice.port_reserved_by_windows(9000) is False


def test_a_stop_while_starting_ends_the_server_cleanly():
    desktop._stop.clear()
    assert desktop.stop_requested() is False
    desktop.request_stop()
    assert desktop.stop_requested() is True
    desktop._stop.clear()


# -- updates ---------------------------------------------------------------------

def test_newer_windows_release_is_offered(tmp_path):
    updater = windows_updater(tmp_path)
    updater.apply_release(200, windows_release("1.0.7"))
    assert updater.latest == "1.0.7"
    assert updater.asset_url.endswith("/windows")
    assert updater.available and updater.error is None


def test_windows_on_arm_runs_the_x64_build(tmp_path):
    updater = windows_updater(tmp_path, machine="ARM64")
    updater.apply_release(200, windows_release("1.0.7"))
    assert updater.available


def test_a_missing_windows_release_says_which_one(tmp_path):
    updater = windows_updater(tmp_path)
    updater.apply_release(404, {}, public=True)
    assert "Windows server" in updater.error and not updater.needs_key


def test_the_check_asks_for_the_windows_release(tmp_path, monkeypatch):
    updater = windows_updater(tmp_path)
    asked = []

    class Response:
        status_code = 200
        headers: dict = {}
        content = b"{}"

        def json(self):
            return windows_release("1.0.9")

    class Client:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url, headers=None):
            asked.append(url)
            return Response()

    monkeypatch.setattr(updates.httpx, "AsyncClient", Client)
    import asyncio

    status = asyncio.run(updater.check(force=True))
    assert asked[0].endswith("/releases/tags/windows-server-latest")
    assert status["latest"] == "1.0.9" and status["available"]


def fake_program(folder: Path, version: str) -> None:
    """A stand-in for the built program folder."""
    (folder / "_internal").mkdir(parents=True)
    (folder / "_internal" / "version.txt").write_text(version)
    (folder / "ProjectorControl.exe").write_text("stand-in")


class Probe:
    """``ProjectorControl.exe --version`` of the unpacked copy."""

    def __init__(self, returncode=0):
        self.returncode = returncode
        self.commands = []

    def __call__(self, command, **options):
        self.commands.append(command)
        return type("Done", (), {"returncode": self.returncode, "stderr": "boom"})()


def zipped(source: Path) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for path in sorted(source.rglob("*")):
            archive.write(path, Path("Projector Control") / path.relative_to(source))
    return buffer.getvalue()


def test_a_downloaded_windows_build_is_unpacked_and_checked(tmp_path, monkeypatch):
    build = tmp_path / "build"
    fake_program(build, "1.0.7")
    updater = windows_updater(tmp_path / "data")
    updater.latest = "1.0.7"
    updater.work_dir.mkdir(parents=True)
    archive = updater.work_dir / "download.zip"
    archive.write_bytes(zipped(build))
    probe = Probe()
    monkeypatch.setattr(updates.subprocess, "run", probe)
    unpacked = updater._unpack(archive)
    assert unpacked.name == "Projector Control"
    assert winservice.folder_version(unpacked) == "1.0.7"
    assert probe.commands == [[str(unpacked / "ProjectorControl.exe"), "--version"]]
    assert not archive.exists()


def test_a_download_that_does_not_run_is_refused(tmp_path, monkeypatch):
    build = tmp_path / "build"
    fake_program(build, "1.0.7")
    updater = windows_updater(tmp_path / "data")
    updater.latest = "1.0.7"
    updater.work_dir.mkdir(parents=True)
    archive = updater.work_dir / "download.zip"
    archive.write_bytes(zipped(build))
    monkeypatch.setattr(updates.subprocess, "run", Probe(returncode=1))
    with pytest.raises(updates.UpdateError, match="did not start"):
        updater._unpack(archive)


def test_a_download_of_the_wrong_version_is_refused(tmp_path, monkeypatch):
    build = tmp_path / "build"
    fake_program(build, "1.0.6")
    updater = windows_updater(tmp_path / "data")
    updater.latest = "1.0.7"
    updater.work_dir.mkdir(parents=True)
    archive = updater.work_dir / "download.zip"
    archive.write_bytes(zipped(build))
    with pytest.raises(updates.UpdateError, match="expected 1.0.7"):
        updater._unpack(archive)


def test_the_new_copy_is_staged_beside_the_old_and_the_watcher_swaps_them(tmp_path, monkeypatch):
    install = tmp_path / "Program Files" / "Projector Control"
    install.mkdir(parents=True)
    new = tmp_path / "data" / "updates" / "new" / "Projector Control"
    fake_program(new, "1.0.7")
    updater = windows_updater(tmp_path / "data", bundle=install)
    updater.latest = "1.0.7"
    started = []

    class Popen:
        pid = 42

        def __init__(self, command, **options):
            started.append((command, options))

    monkeypatch.setattr(updates.subprocess, "Popen", Popen)
    updater._swap_in(new)

    staging = install.with_name(".Projector Control.installing")
    assert staging.is_dir() and install.is_dir()  # the old copy is untouched until the stop
    command, options = started[0]
    assert command[0] == "powershell.exe" and "-File" in command
    script = Path(command[command.index("-File") + 1])
    text = script.read_text(encoding="utf-8")
    # Every named argument is a parameter the script declares.
    declared = text.split("param(", 1)[1].split(")", 1)[0]
    script_args = command[command.index("-File") + 2:]
    for flag in [a for a in script_args if a.startswith("-") and a[1:2].isupper()]:
        assert f"${flag[1:]}" in declared, flag
    assert command[command.index("-Staging") + 1] == str(staging)
    assert command[command.index("-Version") + 1] == "1.0.7"
    assert command[command.index("-Recovery") + 1] == \
        "reset= 86400 actions= restart/5000/restart/5000/restart/10000"
    assert options["creationflags"] & 0x00000200  # own process group: outlives the service
    for step in ("Stop-Service", "Start-Service", "rolled-back $Version", "installed $Version",
                 "/api/health"):
        assert step in text


async def test_installing_on_windows_leaves_the_stop_to_the_watcher(tmp_path, monkeypatch):
    updater = windows_updater(tmp_path)
    killed = []

    async def fake_check(*, force=False):
        updater.apply_release(200, windows_release("1.0.7"))
        return updater.status()

    async def fake_download():
        return tmp_path / "new"

    monkeypatch.setattr(updater, "check", fake_check)
    monkeypatch.setattr(updater, "_download", fake_download)
    monkeypatch.setattr(updater, "_swap_in", lambda bundle: None)
    monkeypatch.setattr(updates.os, "kill", lambda *a: killed.append(a))
    status = await updater.install()
    assert status["installing"] is True
    import asyncio

    await asyncio.sleep(2)
    assert killed == []
