# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller build for the desktop launcher.

Build from the repository root with desktop/build.sh or desktop/build.ps1,
which first compile the web UI into backend/static. Output: dist/ProjectorControl/,
and on macOS also "dist/Projector Control.app" (see docs/MAC-SERVER.md).
APP_VERSION in the environment stamps the build number.
"""

import os
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

ROOT = Path(SPECPATH).resolve().parent
BACKEND = ROOT / "backend"

VERSION = os.environ.get("APP_VERSION", "dev")
version_file = ROOT / "build" / "version.txt"
version_file.parent.mkdir(exist_ok=True)
version_file.write_text(VERSION, encoding="utf-8")

static = BACKEND / "static"
if not static.is_dir():
    raise SystemExit(
        "backend/static is missing: build the frontend first (desktop/build.sh does this)."
    )

hiddenimports = (
    collect_submodules("app")
    + collect_submodules("uvicorn")
    + collect_submodules("alembic")
    + collect_submodules("sqlalchemy.dialects.sqlite")
    + ["aiosqlite", "argon2", "argon2.low_level", "_cffi_backend", "jwt", "httpx",
       "websockets", "websockets.legacy", "email.mime.text", "multipart"]
)

datas = (
    [(str(static), "static"), (str(BACKEND / "alembic"), "alembic"),
     (str(version_file), ".")]
    + collect_data_files("tzdata")
    + collect_data_files("certifi")
)

a = Analysis(
    [str(BACKEND / "app" / "desktop.py")],
    pathex=[str(BACKEND)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "pytest", "ruff", "asyncpg", "psycopg2"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="ProjectorControl",
    debug=False,
    strip=False,
    upx=False,
    # Keep the console: it is where errors go when the browser does not open.
    console=True,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="ProjectorControl")

if sys.platform == "darwin":
    icon = ROOT / "build" / "ProjectorControl.icns"
    app = BUNDLE(
        coll,
        name="Projector Control.app",
        icon=str(icon) if icon.exists() else None,
        bundle_identifier="com.projectorcontrol.server",
        version=VERSION,
        info_plist={
            "CFBundleDisplayName": "Projector Control",
            "CFBundleShortVersionString": VERSION,
            "CFBundleVersion": VERSION,
            # No Dock icon: opening it installs or opens the dashboard, then quits.
            "LSUIElement": True,
            "LSMinimumSystemVersion": "12.0",
            "NSLocalNetworkUsageDescription":
                "Projector Control talks to your projectors, mini PCs and phone "
                "remote on this network.",
        },
    )
