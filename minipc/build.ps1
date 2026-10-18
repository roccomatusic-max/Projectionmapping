# Build the Mini PC app and its installer on Windows.
# Result: dist\MiniPC-Setup.exe (and the app itself in dist\MiniPC\).
# Requires: Python 3.12 (python.org). Inno Setup 6 for the installer
# (winget install JRSoftware.InnoSetup); without it only dist\MiniPC is built.
param([string]$Version = "0.0.0")
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "==> python environment"
# A failing program does not stop the script by itself ($ErrorActionPreference
# covers only PowerShell's own commands): each step checks its exit code, so
# a package that did not install never ends up as an installer without it.
if (-not (Test-Path minipc\.venv)) {
  python -m venv minipc\.venv
  if ($LASTEXITCODE -ne 0) { throw "could not make the python environment" }
}
minipc\.venv\Scripts\python -m pip install -q --upgrade pip
minipc\.venv\Scripts\pip install -q -r minipc\requirements-build.txt
if ($LASTEXITCODE -ne 0) { throw "pip could not install minipc\requirements-build.txt" }

Write-Host "==> pyinstaller"
if (Test-Path build) { Remove-Item -Recurse -Force build }
if (Test-Path dist)  { Remove-Item -Recurse -Force dist }
New-Item -ItemType Directory build | Out-Null
minipc\.venv\Scripts\python minipc\minipc.py --write-icon build\minipc.ico
if ($LASTEXITCODE -ne 0) { throw "could not write the icon" }
minipc\.venv\Scripts\pyinstaller --noconfirm --clean minipc\minipc.spec
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed" }

Write-Host "==> installer"
$iscc = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles}\Inno Setup 6\ISCC.exe",
  "${env:LOCALAPPDATA}\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($iscc) {
  & $iscc /Q "/DVersion=$Version" minipc\installer.iss
  if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed" }
  Write-Host ""
  Write-Host "Built: dist\MiniPC-Setup.exe"
} else {
  Write-Host ""
  Write-Host "Built: dist\MiniPC\MiniPC.exe (install Inno Setup 6 for the installer)"
}
