# Installs or updates the Projector Control server on this Windows computer.
#
# Paste this one line into PowerShell (docs/WINDOWS-SERVER.md):
#
#   [Net.ServicePointManager]::SecurityProtocol='Tls12'; irm https://github.com/roccomatusic-max/Projectionmapping/releases/download/windows-server-latest/install-windows-server.ps1 | iex
#
# It downloads the windows-server-latest release, unpacks it in a temporary
# folder and runs "ProjectorControl.exe --install", which copies it into
# C:\Program Files\Projector Control and sets it up as a Windows service.
# This is the main server, not the Mini PC app (MiniPC-Setup.exe).
#
# Published as a release file by .github/workflows/mac.yml. For the build
# check, PROJECTOR_CONTROL_ZIP points at a local zip instead of the download,
# and PROJECTOR_CONTROL_NO_BROWSER=1 skips opening the dashboard.

function Install-ProjectorControlServer {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'   # Windows PowerShell downloads slowly with a progress bar
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $release = 'https://github.com/roccomatusic-max/Projectionmapping/releases/download/windows-server-latest'

  $identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'Projector Control needs administrator rights once, to start with Windows.'
    Write-Host 'Answer Yes on the prompt; the install continues in a new window.'
    $line = "[Net.ServicePointManager]::SecurityProtocol='Tls12'; irm $release/install-windows-server.ps1 | iex"
    Start-Process -FilePath powershell.exe -Verb RunAs -ArgumentList @('-NoProfile', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $line)
    return
  }
  if (-not [Environment]::Is64BitOperatingSystem) {
    Write-Host 'Projector Control needs 64-bit Windows 10, 11 or Windows Server 2016 or newer.' -ForegroundColor Red
    return
  }

  $work = Join-Path ([IO.Path]::GetTempPath()) ('ProjectorControl-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $work | Out-Null
  try {
    $zip = Join-Path $work 'ProjectorControl-Windows-Server.zip'
    if ($env:PROJECTOR_CONTROL_ZIP) {
      Copy-Item -LiteralPath $env:PROJECTOR_CONTROL_ZIP -Destination $zip
    } else {
      Write-Host 'Downloading Projector Control for Windows server...'
      Invoke-WebRequest -UseBasicParsing -Uri "$release/ProjectorControl-Windows-Server.zip" -OutFile $zip
    }
    Unblock-File -LiteralPath $zip
    Write-Host 'Unpacking...'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($zip, $work)
    $exe = Join-Path $work 'Projector Control\ProjectorControl.exe'
    if (-not (Test-Path -LiteralPath $exe)) { throw "The download has no ProjectorControl.exe." }
    $arguments = @('--install')
    if ($env:PROJECTOR_CONTROL_NO_BROWSER -eq '1') { $arguments += '--no-browser' }
    & $exe @arguments
    $code = $LASTEXITCODE
    if ($code -ne 0) {
      Write-Host ''
      Write-Host "The install did not finish (exit code $code). The messages above say why." -ForegroundColor Red
      Write-Host 'Logs: C:\ProgramData\ProjectorControl\logs' -ForegroundColor Red
    }
    $global:LASTEXITCODE = $code
  } finally {
    Set-Location -LiteralPath ([IO.Path]::GetTempPath())
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Install-ProjectorControlServer
