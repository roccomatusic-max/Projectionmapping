"""Settings → Backup: backups, the nightly one, restoring, and the setup guide."""

# The api fixture is shared with test_api; tests take it as a parameter.
# ruff: noqa: F811

from __future__ import annotations

import json
import sqlite3
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from cryptography.fernet import Fernet

from app import backups
from tests.test_api import add_projector, api, login  # noqa: F401 - fixture


def _service():
    import app.services.backups as service  # reloaded by the api fixture

    return service


def _secret():
    from app import config

    return config.settings.secret_key


async def _backup(api, headers, **body) -> dict:
    made = await api.post("/api/backups", headers=headers, json=body)
    assert made.status_code == 201, made.text
    return made.json()


# -- making and listing ---------------------------------------------------------------

async def test_a_backup_holds_the_settings_and_not_the_history(api):
    headers = await login(api)
    await add_projector(api, headers, "House Left", username="admin1", password="web-login")
    show = (await api.post("/api/mapping/shows", headers=headers, json={"name": "Halloween"})).json()
    assert show["id"]
    where = _service().place()
    # Some reading history, which stays out.
    conn = sqlite3.connect(where.database)
    conn.execute("INSERT INTO telemetry (projector_id, metric, value_num, recorded_at) "
                 "VALUES (1, 'temperature.intake', 30, '2026-10-26 12:00:00')")
    conn.commit()
    conn.close()
    (where.folder / "openai-api-key").write_text("sk-test", encoding="utf-8")
    (where.media / "abc.png").write_bytes(b"picture")

    listed = (await api.get("/api/backups", headers=headers)).json()
    assert listed["supported"] and listed["backups"] == []
    assert listed["media_files"] == 1 and listed["media_bytes"] == 7

    entry = await _backup(api, headers)
    assert entry["kind"] == "manual" and entry["problem"] is None
    assert entry["contents"]["projectors"] == 1 and entry["contents"]["shows"] == 1
    assert entry["contents"]["users"] == 1
    assert not entry["media_included"]
    assert "secret_key" not in json.dumps(entry)  # never shown to the page

    path = where.backups / entry["name"]
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        assert {"backup.json", "projector-control.db", "READ-ME.txt", "SETUP-GUIDE.txt",
                "keys/openai-api-key"} <= names
        assert not any(n.startswith("media/") for n in names)
        manifest = json.loads(archive.read("backup.json"))
        guide = archive.read("SETUP-GUIDE.txt").decode()
        archive.extract("projector-control.db", path.parent / "check")
    assert manifest["secret_key"] == _secret()
    assert manifest["schema"]
    assert "House Left" in guide and "web-login" not in guide
    copy = sqlite3.connect(path.parent / "check" / "projector-control.db")
    assert copy.execute("SELECT count(*) FROM telemetry").fetchone()[0] == 0
    assert copy.execute("SELECT count(*) FROM projectors").fetchone()[0] == 1
    assert copy.execute("PRAGMA journal_mode").fetchone()[0] == "delete"
    copy.close()

    with_media = await _backup(api, headers, include_media=True)
    assert with_media["media_included"] and with_media["media_files"] == 1
    with zipfile.ZipFile(where.backups / with_media["name"]) as archive:
        assert archive.read("media/abc.png") == b"picture"

    listed = (await api.get("/api/backups", headers=headers)).json()
    assert [b["name"] for b in listed["backups"]] == [with_media["name"], entry["name"]]


async def test_backups_are_for_admins_only(api):
    headers = await login(api)
    made = await api.post("/api/auth/users", headers=headers,
                          json={"username": "viewer", "password": "viewer-password", "role": "viewer"})
    assert made.status_code == 201, made.text
    viewer = await login(api, "viewer", "viewer-password")
    for method, path in (("get", "/api/backups"), ("post", "/api/backups"),
                         ("get", "/api/setup-guide")):
        kwargs = {"json": {}} if method == "post" else {}
        refused = await getattr(api, method)(path, headers=viewer, **kwargs)
        assert refused.status_code == 403, (path, refused.text)


async def test_download_links_work_once_made_and_only_for_that_backup(api):
    headers = await login(api)
    entry = await _backup(api, headers)
    other = await _backup(api, headers)
    link = (await api.post(f"/api/backups/{entry['name']}/link", headers=headers)).json()
    got = await api.get(link["url"])  # no sign-in header: a plain browser link
    assert got.status_code == 200
    assert got.content[:2] == b"PK"
    assert entry["name"] in got.headers["content-disposition"]

    wrong = link["url"].replace(entry["name"], other["name"], 1)
    assert (await api.get(wrong)).status_code == 403
    assert (await api.get(f"/api/backups/{entry['name']}/file?key=nonsense")).status_code == 403
    # A link is not a sign-in.
    key = link["url"].split("key=")[1]
    assert (await api.get("/api/backups", headers={"Authorization": f"Bearer {key}"})).status_code == 401
    sneaky = await api.post("/api/backups/..%2Fsecret.key/link", headers=headers)
    assert sneaky.status_code in (404, 405)
    for name in ("../secret.key", "secret.key", "ProjectorControl-backup-x.zip"):
        with pytest.raises(backups.BackupError):
            backups.backup_path(_service().place(), name)

    gone = await api.delete(f"/api/backups/{entry['name']}", headers=headers)
    assert gone.status_code == 204
    assert (await api.get(link["url"])).status_code == 404


async def test_an_uploaded_backup_is_checked_and_listed(api):
    headers = await login(api)
    entry = await _backup(api, headers)
    where = _service().place()
    data = (where.backups / entry["name"]).read_bytes()

    up = await api.post("/api/backups/upload", headers=headers, content=data)
    assert up.status_code == 201, up.text
    assert up.json()["kind"] == "uploaded" and up.json()["made_as"] == "manual"

    for junk in (b"not a zip", _zip({"hello.txt": "hi"})):
        refused = await api.post("/api/backups/upload", headers=headers, content=junk)
        assert refused.status_code == 409, refused.text
    assert (await api.post("/api/backups/upload", headers=headers, content=b"")).status_code == 400

    newer = _rewrite(data, schema="ffffffffffff", app_version="1.0.999")
    refused = await api.post("/api/backups/upload", headers=headers, content=newer)
    assert refused.status_code == 409 and "1.0.999" in refused.json()["detail"]
    assert len((await api.get("/api/backups", headers=headers)).json()["backups"]) == 2
    assert not list(where.backups.glob(".*.part"))


async def test_restore_needs_confirming_and_a_stopped_show(api, monkeypatch):
    headers = await login(api)
    entry = await _backup(api, headers)
    path = f"/api/backups/{entry['name']}/restore"
    assert (await api.post(path, headers=headers, json={})).status_code == 428

    from app.services.mapping import transport

    class Playing:
        status = "playing"

    monkeypatch.setattr(transport, "snapshot", lambda: Playing())
    refused = await api.post(path, headers=headers, json={"confirm": True})
    assert refused.status_code == 409 and "Stop it" in refused.json()["detail"]
    monkeypatch.undo()

    staged = await api.post(path, headers=headers, json={"confirm": True})
    assert staged.status_code == 200, staged.text
    # Started by hand, not by the Mac or Windows service: it cannot restart itself.
    assert staged.json()["restarting"] is False
    assert "open it again" in staged.json()["message"]
    where = _service().place()
    assert backups.has_pending(where)
    kinds = [b["kind"] for b in (await api.get("/api/backups", headers=headers)).json()["backups"]]
    assert "before-restore" in kinds


async def test_restore_restarts_the_service(api, monkeypatch):
    headers = await login(api)
    entry = await _backup(api, headers)
    monkeypatch.setenv("PROJECTOR_CONTROL_SERVICE", "1")
    asked = []
    from app import desktop

    monkeypatch.setattr(desktop, "request_restart", lambda: asked.append(True))
    staged = await api.post(f"/api/backups/{entry['name']}/restore", headers=headers,
                            json={"confirm": True})
    assert staged.json()["restarting"] is True
    import asyncio

    await asyncio.sleep(1.7)
    assert asked == [True]


async def test_the_nightly_backup(api, monkeypatch):
    service = _service()
    from app import config

    zone = config.settings.tz
    first = await service.nightly_tick()
    assert first and first["kind"] == "nightly"  # the very first one straight away
    made = datetime.fromisoformat(first["created_at"])
    afternoon = made.astimezone(zone).replace(hour=15, minute=0) + timedelta(days=1)
    assert await service.nightly_tick(afternoon.astimezone(UTC)) is None
    night = made.astimezone(zone).replace(hour=3, minute=30) + timedelta(days=1)
    from app.services.mapping import transport

    class Playing:
        status = "playing"

    real = transport.snapshot
    monkeypatch.setattr(transport, "snapshot", lambda: Playing())
    assert await service.nightly_tick(night.astimezone(UTC)) is None
    monkeypatch.setattr(transport, "snapshot", real)
    second = await service.nightly_tick(night.astimezone(UTC))
    assert second and second["kind"] == "nightly"
    # The same night again: not due.
    assert await service.nightly_tick(night.astimezone(UTC) + timedelta(minutes=30)) is None


async def test_the_setup_guide(api):
    headers = await login(api)
    await add_projector(api, headers, "Garage", username="admin1", password="web-login",
                        location="Garage roof")
    guide = await api.get("/api/setup-guide", headers=headers)
    assert guide.status_code == 200, guide.text
    body = guide.json()
    assert body["projectors"][0]["name"] == "Garage"
    assert body["projectors"][0]["has_password"] is True
    assert "web-login" not in guide.text and "password_enc" not in guide.text
    assert body["sign_in"]["admins"] == ["admin"]
    assert "install-minipc.ps1" in body["install"]["minipc"]
    assert body["steps"] and body["last_backup"] is None
    await _backup(api, headers)
    body = (await api.get("/api/setup-guide", headers=headers)).json()
    assert body["last_backup"]["kind"] == "manual"


# -- putting one back -------------------------------------------------------------------

def _zip(files: dict[str, str]) -> bytes:
    import io

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, text in files.items():
            archive.writestr(name, text)
    return buffer.getvalue()


def _rewrite(data: bytes, **changes) -> bytes:
    import io

    source = zipfile.ZipFile(io.BytesIO(data))
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for info in source.infolist():
            content = source.read(info)
            if info.filename == "backup.json":
                content = json.dumps({**json.loads(content), **changes}).encode()
            archive.writestr(info, content)
    return buffer.getvalue()


def _server(tmp_path: Path, name: str) -> backups.Place:
    folder = tmp_path / name
    (folder / "media").mkdir(parents=True)
    database = folder / "projector-control.db"
    conn = sqlite3.connect(database)
    conn.executescript("""
        CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL);
        INSERT INTO alembic_version VALUES ('abc');
        CREATE TABLE projectors (id INTEGER PRIMARY KEY, name TEXT, password_enc TEXT,
                                 pjlink_password_enc TEXT);
        CREATE TABLE heaters (id INTEGER PRIMARY KEY, plug_secret_enc TEXT);
        CREATE TABLE telemetry (id INTEGER PRIMARY KEY, value_num REAL);
        CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT);
        INSERT INTO telemetry (value_num) VALUES (1), (2);
        INSERT INTO users (username) VALUES ('admin'), ('player-1-abc');
    """)
    conn.commit()
    conn.close()
    return backups.Place(folder=folder, database=database, media=folder / "media")


def _add(place: backups.Place, name: str, password: str, secret: str) -> None:
    conn = sqlite3.connect(place.database)
    conn.execute("INSERT INTO projectors (name, password_enc) VALUES (?, ?)",
                 (name, Fernet(backups.fernet_key(secret)).encrypt(password.encode()).decode()))
    conn.commit()
    conn.close()


def _projectors(place: backups.Place, secret: str) -> dict[str, str]:
    conn = sqlite3.connect(place.database)
    rows = conn.execute("SELECT name, password_enc FROM projectors").fetchall()
    conn.close()
    fernet = Fernet(backups.fernet_key(secret))
    return {name: fernet.decrypt(value.encode()).decode() for name, value in rows}


def _add_heater(place: backups.Place, password: str, secret: str) -> None:
    conn = sqlite3.connect(place.database)
    conn.execute("INSERT INTO heaters (plug_secret_enc) VALUES (?)",
                 (Fernet(backups.fernet_key(secret)).encrypt(password.encode()).decode(),))
    conn.commit()
    conn.close()


def _heater_secrets(place: backups.Place, secret: str) -> list[str]:
    conn = sqlite3.connect(place.database)
    rows = conn.execute("SELECT plug_secret_enc FROM heaters").fetchall()
    conn.close()
    fernet = Fernet(backups.fernet_key(secret))
    return [fernet.decrypt(value.encode()).decode() for (value,) in rows]


def _known(revision):
    return revision == "abc"


def test_the_password_key_matches_the_servers():
    from app.core import security

    assert backups.fernet_key("some secret") == \
        security.base64.urlsafe_b64encode(security.hashlib.sha256(b"some secret").digest())
    token = security.encrypt_secret("hello")
    assert Fernet(backups.fernet_key(_secret())).decrypt(token.encode()) == b"hello"


@pytest.mark.parametrize("keeps_key_in_file", [True, False])
def test_restoring_onto_another_server(tmp_path, keeps_key_in_file):
    old = _server(tmp_path, "old")
    _add(old, "House Left", "web-login", "old-secret")
    _add_heater(old, "plug-pass", "old-secret")
    (old.folder / "anthropic-api-key").write_text("sk-ant", encoding="utf-8")
    (old.folder / "phone-alerts.json").write_text('{"service": "ntfy"}', encoding="utf-8")
    (old.media / "show.mp4").write_bytes(b"video")
    entry = backups.create(old, kind="manual", include_media=True, secret_key="old-secret",
                           app_version="1.0.300")
    assert entry["contents"] == {"projectors": 1, "users": 1}
    path = old.backups / entry["name"]

    new = _server(tmp_path, "new")
    _add(new, "Leftover", "x", "new-secret")
    (new.media / "kept.png").write_bytes(b"kept")
    new_db = Path(f"{new.database}-wal")
    new_db.write_bytes(b"stale log")  # must not be replayed onto the restored database

    backups.stage_restore(new, path, _known)
    assert backups.has_pending(new)
    secret_file = new.folder / "secret.key"
    secret_file.write_text("new-secret", encoding="utf-8")
    result = backups.apply_pending(new, secret_file=secret_file if keeps_key_in_file else None,
                                   current_secret="new-secret")
    assert result["ok"], result
    assert result["name"] == entry["name"] and result["media_added"] == 1
    assert not backups.has_pending(new) and not (new.folder / backups.PENDING).exists()
    assert not new_db.exists()

    if keeps_key_in_file:
        # The Mac and Windows apps: the old key comes along, so nothing needs signing in again.
        assert secret_file.read_text(encoding="utf-8") == "old-secret"
        assert _projectors(new, "old-secret") == {"House Left": "web-login"}
        assert _heater_secrets(new, "old-secret") == ["plug-pass"]
    else:
        # A key from the environment stays; the passwords are encrypted with it.
        assert secret_file.read_text(encoding="utf-8") == "new-secret"
        assert _projectors(new, "new-secret") == {"House Left": "web-login"}
        assert _heater_secrets(new, "new-secret") == ["plug-pass"]
    assert (new.folder / "anthropic-api-key").read_text(encoding="utf-8") == "sk-ant"
    assert (new.folder / "phone-alerts.json").read_text(encoding="utf-8") == '{"service": "ntfy"}'
    assert (new.media / "show.mp4").read_bytes() == b"video"
    assert (new.media / "kept.png").exists()
    assert backups.last_restore(new)["ok"] is True
    # Applying again does nothing.
    assert backups.apply_pending(new, current_secret="new-secret") is None


def test_a_restore_cut_short_is_never_applied(tmp_path):
    old = _server(tmp_path, "old")
    entry = backups.create(old, kind="manual", include_media=False, secret_key="s",
                           app_version="1.0.300")
    new = _server(tmp_path, "new")
    backups.stage_restore(new, old.backups / entry["name"], _known)
    (new.folder / backups.PENDING / "ready").unlink()  # as if the power went mid-unpack
    before = new.database.read_bytes()
    assert backups.apply_pending(new, current_secret="s") is None
    assert new.database.read_bytes() == before
    assert not (new.folder / backups.PENDING).exists()


def test_a_damaged_or_newer_backup_is_refused(tmp_path):
    old = _server(tmp_path, "old")
    entry = backups.create(old, kind="manual", include_media=False, secret_key="s",
                           app_version="1.0.300")
    path = old.backups / entry["name"]
    new = _server(tmp_path, "new")
    with pytest.raises(backups.BackupError, match="newer"):
        backups.stage_restore(new, path, lambda revision: False)
    damaged = tmp_path / "damaged.zip"
    damaged.write_bytes(path.read_bytes()[: len(path.read_bytes()) // 2])
    with pytest.raises(backups.BackupError):
        backups.stage_restore(new, damaged, _known)
    later = tmp_path / "later.zip"
    later.write_bytes(_rewrite(path.read_bytes(), format_version=99))
    with pytest.raises(backups.BackupError, match="newer"):
        backups.read_manifest(later)
    assert not backups.has_pending(new)


def test_old_backups_are_cleared_by_kind(tmp_path):
    place = _server(tmp_path, "server")
    start = datetime(2026, 10, 1, 3, 0, tzinfo=UTC)
    for day in range(backups.KEEP["nightly"] + 3):
        backups.create(place, kind="nightly", include_media=False, secret_key="s",
                       app_version="1", now=start + timedelta(days=day))
    backups.create(place, kind="manual", include_media=False, secret_key="s", app_version="1",
                   now=start)
    listed = backups.list_backups(place)
    assert sum(e["kind"] == "nightly" for e in listed) == backups.KEEP["nightly"]
    assert sum(e["kind"] == "manual" for e in listed) == 1
    # The newest nightly ones are the ones kept.
    assert listed[0]["created_at"].startswith("2026-10-17")
    # Two in the same minute get different names.
    a = backups.create(place, kind="manual", include_media=False, secret_key="s",
                       app_version="1", now=start)
    assert a["name"] != listed[-1]["name"]


def test_the_desktop_apps_restore_before_the_server_starts(tmp_path, monkeypatch):
    from app import desktop

    old = _server(tmp_path, "old")
    _add(old, "House Left", "web-login", "old-secret")
    entry = backups.create(old, kind="manual", include_media=False, secret_key="old-secret",
                           app_version="1.0.300")
    new = _server(tmp_path, "new")
    (new.folder / "secret.key").write_text("new-secret", encoding="utf-8")
    backups.stage_restore(new, old.backups / entry["name"], _known)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.delenv("MEDIA_DIR", raising=False)
    result = desktop.apply_restore(new.folder, new.database)
    assert result and result["ok"]
    # The launcher then reads the restored key, as it does on every start.
    assert desktop.ensure_secret_key(new.folder) == "old-secret"
    assert _projectors(new, "old-secret") == {"House Left": "web-login"}
