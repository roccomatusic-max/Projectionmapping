# Build the Windows server on Windows. Results:
#   dist\ProjectorControl\ProjectorControl.exe     the program
#   dist\ProjectorControl-Windows-Server.zip       the download (docs/WINDOWS-SERVER.md)
# Requires: Python 3.12+ (python.org), Node.js 22. APP_VERSION stamps the build number.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
function Step($what) { if ($LASTEXITCODE) { throw "$what failed (exit code $LASTEXITCODE)" } }

Write-Host "==> frontend"
Push-Location frontend
npm ci --no-audit --no-fund; Step "npm ci"
npm run build; Step "npm run build"
Pop-Location
if (Test-Path backend\static) { Remove-Item -Recurse -Force backend\static }
Copy-Item -Recurse frontend\dist backend\static

Write-Host "==> python environment"
if (-not (Test-Path backend\.venv)) { python -m venv backend\.venv; Step "python -m venv" }
backend\.venv\Scripts\python -m pip install -q -r backend\requirements.txt -r desktop\requirements-desktop.txt
Step "pip install"

Write-Host "==> pyinstaller"
if (Test-Path build) { Remove-Item -Recurse -Force build }
if (Test-Path dist)  { Remove-Item -Recurse -Force dist }
backend\.venv\Scripts\pyinstaller --noconfirm --clean desktop\projector-control.spec
Step "pyinstaller"

Write-Host "==> zip"
backend\.venv\Scripts\python desktop\windows\make_zip.py dist\ProjectorControl dist\ProjectorControl-Windows-Server.zip
Step "zip"

Write-Host ""
Write-Host "Built: dist\ProjectorControl\ProjectorControl.exe"
Write-Host "       dist\ProjectorControl-Windows-Server.zip"
Write-Host "Run ProjectorControl.exe --install as administrator to install it as a service,"
Write-Host "or ProjectorControl.exe --serve to run it in this window instead."
