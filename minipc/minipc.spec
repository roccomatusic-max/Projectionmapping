# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller build for the Mini PC app.

Build from the repository root with minipc/build.ps1 (Windows), which also
wraps the result in an installer. Output: dist/MiniPC/MiniPC.exe.
"""

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_dynamic_libs, collect_submodules

ROOT = Path(SPECPATH).resolve().parent
HERE = ROOT / "minipc"
AGENT = ROOT / "camera-agent"
ICON = ROOT / "build" / "minipc.ico"

hiddenimports = ["agent", "sources", "simcam", "vision", "websocket", "psutil", "selfupdate", "stayawake", "screens"]
if (HERE / "_version.py").exists():  # written by build.ps1
    hiddenimports.append("_version")
binaries = []
datas = []
if sys.platform == "win32":
    hiddenimports += ["pystray._win32"] + collect_submodules("pyrealsense2")
    binaries += collect_dynamic_libs("pyrealsense2")
    # Orbbec and Luxonis SDKs: their DLLs, and the Orbbec extensions and
    # config file, which it looks for next to its own DLL.
    for package in ("pyorbbecsdk", "depthai"):
        package_datas, package_binaries, package_imports = collect_all(package)
        datas += package_datas
        binaries += package_binaries
        hiddenimports += package_imports

a = Analysis(
    [str(HERE / "minipc.py")],
    pathex=[str(HERE), str(AGENT)],
    binaries=binaries,
    datas=datas,
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
