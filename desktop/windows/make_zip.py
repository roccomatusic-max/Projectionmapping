"""Zip the built program folder as the Windows server download.

Inside the zip the folder is called "Projector Control", the name it gets
under C:\\Program Files; the installer and the updater both expect that.

    python desktop/windows/make_zip.py dist/ProjectorControl dist/ProjectorControl-Windows-Server.zip
"""

from __future__ import annotations

import sys
import zipfile
from pathlib import Path

FOLDER = "Projector Control"


def make_zip(source: Path, target: Path) -> None:
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(source.rglob("*")):
            archive.write(path, Path(FOLDER) / path.relative_to(source))


if __name__ == "__main__":
    make_zip(Path(sys.argv[1]), Path(sys.argv[2]))
