"""Home Assistant: the integration's account, pairing codes and download.

Home Assistant signs in as one dedicated operator account,
:data:`HA_USERNAME`. Its key is an ordinary long-lived token for that
account, so "disconnect" is deleting the account, and making a new key
re-creates it: a token issued before the account existed is refused
(:func:`app.core.security.token_predates`), which retires the old key.

The install line shown in Settings carries a pairing code, not the key. The
code is short-lived and works once: Home Assistant trades it for the key
when it is added. That way a key never sits in a shell history.

The integration itself (``custom_components/projector_control`` in the
repository) ships inside the server, so Home Assistant always downloads the
copy that matches the server it talks to.
"""

from __future__ import annotations

import io
import json
import secrets
import tarfile
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.db.models import Event, Role, Severity, User
from app.paths import homeassistant_integration_dir

#: The account Home Assistant acts as. Operator: it can run the show and
#: switch projectors, and cannot change settings or users.
HA_USERNAME = "home-assistant"
#: Keys last ten years; disconnecting is how one is retired.
KEY_DAYS = 3650
#: How long an install line's pairing code works.
PAIRING_MINUTES = 60
#: No 0/O or 1/I/L: the code may be read aloud or typed from a screen.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_CODE_LENGTH = 10
#: The integration's folder name inside Home Assistant's custom_components.
DOMAIN = "projector_control"


@dataclass
class _Pairing:
    code: str
    expires: float


class HomeAssistantLink:
    """In-memory state: the live pairing code and when Home Assistant last asked.

    Both are deliberately lost on restart. A pairing code outliving a
    restart buys nothing, and "last checked in" refills within seconds.
    """

    def __init__(self) -> None:
        self._pairing: _Pairing | None = None
        self.last_seen: datetime | None = None
        self.last_seen_version: str | None = None

    # -- pairing ---------------------------------------------------------

    def new_pairing_code(self) -> tuple[str, datetime]:
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LENGTH))
        self._pairing = _Pairing(code=code, expires=time.monotonic() + PAIRING_MINUTES * 60)
        return code, datetime.now(UTC) + timedelta(minutes=PAIRING_MINUTES)

    def take_pairing_code(self, code: str) -> bool:
        """True, once, for the current unexpired code."""
        pairing = self._pairing
        if pairing is None or time.monotonic() > pairing.expires:
            return False
        wanted = code.strip().upper().replace("-", "").replace(" ", "")
        if not secrets.compare_digest(wanted.encode(), pairing.code.encode()):
            return False
        self._pairing = None
        return True

    def forget_pairing(self) -> None:
        self._pairing = None

    # -- liveness ----------------------------------------------------------

    def seen(self, version: str | None) -> None:
        self.last_seen = datetime.now(UTC)
        self.last_seen_version = version


link = HomeAssistantLink()


async def ha_user(session: AsyncSession) -> User | None:
    return (await session.execute(
        select(User).where(User.username == HA_USERNAME)
    )).scalars().first()


async def issue_key(session: AsyncSession, *, by: str) -> tuple[str, datetime]:
    """(Re)create the Home Assistant account and return a new key for it.

    Any earlier key stops working: the account it belonged to is gone.
    """
    existing = await ha_user(session)
    if existing is not None:
        await session.delete(existing)
        await session.flush()
    # Nobody signs in with this password; it only has to be unguessable.
    user = User(username=HA_USERNAME, role=Role.OPERATOR.value,
                password_hash=hash_password(secrets.token_urlsafe(32)))
    session.add(user)
    session.add(Event(projector_id=None, severity=Severity.WARNING.value,
                      kind="service_token_issued",
                      message=f"{by} connected Home Assistant (a new key; any older one "
                              "stopped working)"))
    await session.commit()
    minutes = KEY_DAYS * 24 * 60
    # Issued after the commit, so its "issued at" is never before the account.
    token = create_access_token(HA_USERNAME, Role.OPERATOR.value, expires_minutes=minutes)
    return token, datetime.now(UTC) + timedelta(minutes=minutes)


async def disconnect(session: AsyncSession, *, by: str) -> bool:
    """Delete the account, which retires its key. False if there was none."""
    link.forget_pairing()
    user = await ha_user(session)
    if user is None:
        return False
    await session.delete(user)
    session.add(Event(projector_id=None, severity=Severity.WARNING.value,
                      kind="user_deleted",
                      message=f"{by} disconnected Home Assistant; its key no longer works"))
    await session.commit()
    link.last_seen = None
    return True


# -- the integration's files ------------------------------------------------


def integration_version() -> str | None:
    """The version in the bundled integration's manifest.json."""
    folder = homeassistant_integration_dir()
    if folder is None:
        return None
    try:
        manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    version = manifest.get("version")
    return str(version) if version else None


def integration_package() -> bytes | None:
    """The integration as a .tar.gz holding ``projector_control/``.

    Built on request (a few kilobytes), skipping caches, so it is always
    exactly what this server carries.
    """
    folder = homeassistant_integration_dir()
    if folder is None:
        return None
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        for path in sorted(folder.rglob("*")):
            if not path.is_file() or "__pycache__" in path.parts or path.suffix == ".pyc":
                continue
            info = archive.gettarinfo(str(path), arcname=f"{DOMAIN}/{_relative(path, folder)}")
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            info.mode = 0o644
            with path.open("rb") as handle:
                archive.addfile(info, handle)
    return buffer.getvalue()


def _relative(path: Path, folder: Path) -> str:
    return path.relative_to(folder).as_posix()


def install_script(base_url: str, code: str | None) -> str:
    """The shell script behind the install line in Settings.

    Runs in Home Assistant's Terminal add-on (BusyBox sh, curl or wget).
    It downloads the integration from this server, puts it in
    ``custom_components``, leaves the server address and pairing code for
    the setup form to fill itself in, and restarts Home Assistant.
    ``base_url`` and ``code`` must already be validated: they are pasted
    into the script.
    """
    pairing = json.dumps({"url": base_url, "code": code or ""})
    return (_INSTALL_SCRIPT
            .replace("@@SERVER@@", base_url)
            .replace("@@PAIRING@@", pairing)
            .replace("@@DOMAIN@@", DOMAIN))


# Kept here rather than in a .sh file so the desktop builds carry it
# without a data-file entry. Plain words: the person running it is not a
# developer and reads every line it prints.
_INSTALL_SCRIPT = r"""#!/bin/sh
# Installs the Projector Control integration into Home Assistant.
SERVER='@@SERVER@@'
DOMAIN='@@DOMAIN@@'

say() { printf '%s\n' "$*"; }
fail() { say ""; say "Not installed: $*"; exit 1; }

CONFIG=""
for dir in /config /homeassistant "$PWD"; do
  if [ -f "$dir/configuration.yaml" ]; then CONFIG="$dir"; break; fi
done
[ -n "$CONFIG" ] || fail "this is not Home Assistant's Terminal. In Home Assistant open \
Settings > Add-ons > Terminal & SSH > Open Web UI, and paste the line there."

TMP="$(mktemp -d 2>/dev/null || echo /tmp/projector-control-install)"
mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

say "Downloading the Projector Control integration from $SERVER ..."
URL="$SERVER/api/integration/homeassistant/package.tar.gz"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL --max-time 60 "$URL" -o "$TMP/package.tar.gz" || DOWNLOAD_FAILED=1
else
  wget -q -T 60 -O "$TMP/package.tar.gz" "$URL" || DOWNLOAD_FAILED=1
fi
[ -z "$DOWNLOAD_FAILED" ] || fail "Home Assistant could not reach $SERVER. Check the \
Projector Control server is on, and that Home Assistant is on the same network."

mkdir -p "$TMP/unpacked"
tar -xzf "$TMP/package.tar.gz" -C "$TMP/unpacked" 2>/dev/null \
  || fail "the download from $SERVER was not the integration. Try again."
[ -f "$TMP/unpacked/$DOMAIN/manifest.json" ] \
  || fail "the download from $SERVER was not the integration. Try again."

# The setup form reads this to fill in the server and sign in by itself.
cat > "$TMP/unpacked/$DOMAIN/pairing.json" <<'PAIRING'
@@PAIRING@@
PAIRING

mkdir -p "$CONFIG/custom_components"
TARGET="$CONFIG/custom_components/$DOMAIN"
rm -rf "$TARGET.old"
[ ! -d "$TARGET" ] || mv "$TARGET" "$TARGET.old" || fail "could not replace the old copy."
if ! mv "$TMP/unpacked/$DOMAIN" "$TARGET"; then
  [ ! -d "$TARGET.old" ] || mv "$TARGET.old" "$TARGET"
  fail "could not write to $CONFIG/custom_components."
fi
rm -rf "$TARGET.old"
say "Installed in $TARGET"
say ""

NEXT="Then in Home Assistant: Settings > Devices & services > Add integration \
> search Projector Control > Submit."
if command -v ha >/dev/null 2>&1; then
  say "Restarting Home Assistant now. The page goes blank for about a minute."
  say "$NEXT"
  ha core restart >/dev/null 2>&1 || say "Restart it yourself: Settings > System > Restart."
else
  say "Now restart Home Assistant: Settings > System > Restart (top right)."
  say "$NEXT"
fi
"""
