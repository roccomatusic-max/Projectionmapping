# Build the desktop app on Windows. Result: dist\ProjectorControl\ProjectorControl.exe
# Requires: Python 3.12+ (python.org), Node.js 22, run from a Developer PowerShell.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "==> frontend"
Push-Location frontend
npm ci --no-audit --no-fund
npm run build
Pop-Location
if (Test-Path backend\static) { Remove-Item -Recurse -Force backend\static }
Copy-Item -Recurse frontend\dist backend\static

Write-Host "==> python environment"
if (-not (Test-Path backend\.venv)) { python -m venv backend\.venv }
backend\.venv\Scripts\pip install -q -r backend\requirements.txt -r desktop\requirements-desktop.txt

Write-Host "==> pyinstaller"
if (Test-Path build) { Remove-Item -Recurse -Force build }
if (Test-Path dist)  { Remove-Item -Recurse -Force dist }
backend\.venv\Scripts\pyinstaller --noconfirm --clean desktop\projector-control.spec

Write-Host ""
Write-Host "Built: dist\ProjectorControl\ProjectorControl.exe"
Write-Host "Double-click it and the dashboard opens in your browser."
