#!/usr/bin/env bash
# Build the desktop app for the current OS (Linux or macOS).
# Result: dist/ProjectorControl/ProjectorControl
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> frontend"
(cd frontend && npm ci --no-audit --no-fund && npm run build)
rm -rf backend/static && cp -r frontend/dist backend/static

echo "==> python environment"
PY=${PYTHON:-python3}
[ -d backend/.venv ] || "$PY" -m venv backend/.venv
backend/.venv/bin/pip install -q -r backend/requirements.txt -r desktop/requirements-desktop.txt

echo "==> pyinstaller"
rm -rf build dist
backend/.venv/bin/pyinstaller --noconfirm --clean desktop/projector-control.spec

echo
echo "Built: dist/ProjectorControl/ProjectorControl"
echo "Run it, and the dashboard opens in your browser."
