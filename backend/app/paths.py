"""Filesystem locations that differ between a checkout and a frozen bundle."""

from __future__ import annotations

import sys
from pathlib import Path


def resource_root() -> Path:
    """Directory holding ``alembic/`` and ``static/``.

    In a source checkout that is ``backend/``. Inside a PyInstaller bundle
    the data files are unpacked under ``sys._MEIPASS``.
    """
    frozen = getattr(sys, "_MEIPASS", None)
    if frozen:
        return Path(frozen)
    return Path(__file__).resolve().parent.parent


def alembic_dir() -> Path:
    return resource_root() / "alembic"


def static_dir() -> Path:
    return resource_root() / "static"


def app_version() -> str:
    """The build number stamped by the release workflow, or ``dev`` for a checkout."""
    try:
        value = (resource_root() / "version.txt").read_text(encoding="utf-8").strip()
    except OSError:
        return "dev"
    return value or "dev"
