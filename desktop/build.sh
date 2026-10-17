#!/usr/bin/env bash
# Build the desktop app for the current OS (Linux or macOS).
# Result: dist/ProjectorControl/ProjectorControl
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> frontend"
(cd frontend && npm ci --no-audit --no-fund && npm run build)
rm -rf backend/static && cp -r frontend/dist backend/static

echo "==> python environment"
# macOS ships Python 3.9, which is too old. Prefer an explicit PYTHON, then
# the newest 3.12/3.13 on PATH (Homebrew installs these as python3.12 etc.).
PY=${PYTHON:-}
if [ -z "$PY" ]; then
  for candidate in python3.13 python3.12 python3; do
    if command -v "$candidate" >/dev/null 2>&1 && \
       "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)'; then
      PY=$candidate; break
    fi
  done
fi
if [ -z "$PY" ]; then
  echo "Python 3.12 or newer is required. On macOS: brew install python@3.12" >&2
  exit 1
fi
echo "    using $("$PY" --version) at $(command -v "$PY")"
[ -d backend/.venv ] || "$PY" -m venv backend/.venv
backend/.venv/bin/pip install -q -r backend/requirements.txt -r desktop/requirements-desktop.txt

echo "==> pyinstaller"
rm -rf build dist
backend/.venv/bin/pyinstaller --noconfirm --clean desktop/projector-control.spec

echo
echo "Built: dist/ProjectorControl/ProjectorControl"
echo "Run it, and the dashboard opens in your browser."
