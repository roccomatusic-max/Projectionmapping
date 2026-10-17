"""The Mac app's service definition and its GitHub updater."""

from __future__ import annotations

from pathlib import Path

import pytest

from app import macservice
from app.services.updates import ASSETS, UpdateError, Updater

BUNDLE = Path("/Applications/Projector Control.app")


def test_running_bundle_is_found_from_the_executable():
    exe = "/Applications/Projector Control.app/Contents/MacOS/ProjectorControl"
    assert macservice.running_bundle(exe) == BUNDLE
    assert macservice.running_bundle("/home/x/dist/ProjectorControl/ProjectorControl") is None


def test_service_starts_at_boot_restarts_and_serves_the_network(tmp_path):
    job = macservice.service_definition(BUNDLE, tmp_path, "rocco", "/Users/rocco")
    args = job["ProgramArguments"]
    assert args[0] == str(BUNDLE / "Contents/MacOS/ProjectorControl")
    assert "--serve" in args and "--lan" in args and "--no-browser" in args
    assert args[args.index("--port") + 1] == "8765"
    assert args[args.index("--data-dir") + 1] == str(tmp_path)
    assert job["RunAtLoad"] is True and job["KeepAlive"] is True
    assert job["UserName"] == "rocco"
    assert job["EnvironmentVariables"][macservice.SERVICE_ENV] == "1"


def test_version_ordering():
    key = macservice.version_key
    assert key("1.0.10") > key("1.0.9")
    assert key("dev") < key("1.0.1")


def make_updater(tmp_path, current="1.0.5", machine="arm64"):
    return Updater(tmp_path, BUNDLE, current=current, machine=machine, managed=True)


def release(version="1.0.7"):
    return {
        "name": f"Projector Control for Mac {version}",
        "assets": [
            {"name": name, "url": f"https://api.github.com/assets/{arch}"}
            for arch, name in ASSETS.items()
        ],
    }


def test_newer_release_is_offered_for_this_chip(tmp_path):
    updater = make_updater(tmp_path, machine="x86_64")
    updater.apply_release(200, release("1.0.7"))
    assert updater.latest == "1.0.7"
    assert updater.asset_url.endswith("/x86_64")
    assert updater.available and updater.error is None


def test_same_version_is_not_offered(tmp_path):
    updater = make_updater(tmp_path, current="1.0.7")
    updater.apply_release(200, release("1.0.7"))
    assert not updater.available


def test_private_repository_without_a_key_asks_for_one(tmp_path):
    updater = make_updater(tmp_path)
    updater.apply_release(404, {})
    assert updater.needs_key and not updater.available


def test_rejected_key_asks_for_a_new_one(tmp_path):
    updater = make_updater(tmp_path)
    updater.save_key("github_pat_x")
    updater.apply_release(401, {})
    assert updater.needs_key and "access key" in updater.error


def test_key_is_kept_private_and_can_be_removed(tmp_path):
    updater = make_updater(tmp_path)
    updater.save_key("  github_pat_x \n")
    assert updater.key() == "github_pat_x"
    assert (updater.key_path.stat().st_mode & 0o777) == 0o600
    assert updater._headers()["Authorization"] == "Bearer github_pat_x"
    updater.save_key("")
    assert updater.key() is None and updater.status()["has_key"] is False


async def test_outside_the_mac_app_nothing_is_checked_or_installed(tmp_path):
    updater = Updater(tmp_path, None, current="dev", managed=False)
    status = await updater.check(force=True)
    assert status["supported"] is False and status["latest"] is None
    with pytest.raises(UpdateError):
        await updater.install()


async def test_automatic_update_installs_only_when_quiet(tmp_path, monkeypatch):
    monkeypatch.setattr(Updater, "supported", property(lambda self: True))  # tests run on Linux
    updater = make_updater(tmp_path)
    assert updater.auto is True  # on unless switched off
    installs = []

    async def fake_check(*, force=False):
        updater.apply_release(200, release("1.0.7"))
        return updater.status()

    async def fake_install():
        installs.append(updater.latest)

    monkeypatch.setattr(updater, "check", fake_check)
    monkeypatch.setattr(updater, "install", fake_install)

    async def busy():
        return "a mapping show is playing"

    async def quiet():
        return None

    await updater.auto_tick(busy)
    assert installs == [] and updater.status()["waiting"] == "a mapping show is playing"
    await updater.auto_tick(quiet)
    assert installs == ["1.0.7"] and updater.waiting is None

    # A version that failed and was rolled back is not retried by itself.
    updater.work_dir.mkdir(parents=True, exist_ok=True)
    updater.result_path.write_text("rolled-back 1.0.7")
    await updater.auto_tick(quiet)
    assert installs == ["1.0.7"]

    updater.set_auto(False)
    updater.result_path.unlink()
    await updater.auto_tick(quiet)
    assert installs == ["1.0.7"] and updater.status()["auto"] is False


def test_reset_admin_password_without_a_database(tmp_path, capsys):
    from app.desktop import reset_admin_password

    assert reset_admin_password(tmp_path / "missing") == 1
    assert "No Projector Control database" in capsys.readouterr().out
    assert not (tmp_path / "missing").exists()
