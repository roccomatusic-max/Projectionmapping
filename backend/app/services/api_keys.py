"""API keys for optional outside services, entered once in Settings.

Each key lives in its own file next to the media folder, readable only by
the server's own account, and is never sent back to a browser: the UI only
learns that one is set and its last four characters. An environment
variable, when set, wins over the file.
"""

from __future__ import annotations

import contextlib
import os
from pathlib import Path

from app import config


class KeyStore:
    def __init__(self, filename: str, env: str) -> None:
        self.filename = filename
        self.env = env

    def path(self) -> Path:
        return Path(config.settings.media_dir).expanduser().resolve().parent / self.filename

    def stored(self) -> tuple[str | None, str | None]:
        """The key and where it came from: "environment" or "settings"."""
        env = os.environ.get(self.env, "").strip()
        if env:
            return env, "environment"
        with contextlib.suppress(OSError):
            key = self.path().read_text(encoding="utf-8").strip()
            if key:
                return key, "settings"
        return None, None

    def save(self, key: str) -> None:
        path = self.path()
        path.parent.mkdir(parents=True, exist_ok=True)
        partial = path.with_suffix(".part")
        fd = os.open(partial, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(key.strip())
        os.replace(partial, path)

    def forget(self) -> None:
        with contextlib.suppress(FileNotFoundError):
            self.path().unlink()
