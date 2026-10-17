# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller build for the Mini PC app.

Build from the repository root with minipc/build.ps1 (Windows), which also
wraps the result in an installer. Output: dist/MiniPC/MiniPC.exe.
"""

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_dynamic_libs, collect_submodules

ROOT = Path(SPECPATH).resolve().parent
HERE = ROOT / "minipc"
AGENT = ROOT / "camera-agent"
ICON = ROOT / "build" / "minipc.ico"

hiddenimports = ["agent", "sources", "vision", "websocket", "psutil"]
binaries = []
if sys.platform == "win32":
    hiddenimports += ["pystray._win32"] + collect_submodules("pyrealsense2")
    binaries += collect_dynamic_libs("pyrealsense2")

a = Analysis(
    [str(HERE / "minipc.py")],
    pathex=[str(HERE), str(AGENT)],
    binaries=binaries,
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "pytest", "ruff", "matplotlib"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="MiniPC",
    debug=False,
    strip=False,
    upx=False,
    # No console window: the projector shows the output, the tray the status,
    # and the log folder the details.
    console=False,
    icon=str(ICON) if ICON.exists() else None,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="MiniPC")
