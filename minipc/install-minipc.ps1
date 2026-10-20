# Installs or updates the Mini PC app on this Windows computer (the one beside
# a projector).
#
# Paste this one line into PowerShell (minipc/README.md):
#
#   [Net.ServicePointManager]::SecurityProtocol='Tls12'; irm https://github.com/roccomatusic-max/Projectionmapping/releases/download/minipc-latest/install-minipc.ps1 | iex
#
# It looks for Smart App Control first, because that blocks the unsigned
# MiniPC-Setup.exe before any of it runs and says only "An Application Control
# policy has blocked this file". Then it downloads MiniPC-Setup.exe from the
# minipc-latest release and runs it without questions. No administrator rights
# needed, and nothing is double-clicked, so SmartScreen does not appear either.
# Downloading MiniPC-Setup.exe by hand and running it still works.
#
# Published as a release file by .github/workflows/minipc.yml. For the build
# check, MINIPC_SETUP points at a local installer instead of the download, and
# MINIPC_APP_CONTROL stands in for the Smart App Control state in the registry.

function Show-AppControlBlock {
  Write-Host ''
  Write-Host 'Windows blocks the Mini PC app on this computer.' -ForegroundColor Red
  Write-Host 'Smart App Control (Windows 11) only lets programs signed with a paid certificate run,' -ForegroundColor Red
  Write-Host 'and it has no exception for one program. The Mini PC app is not signed.' -ForegroundColor Red
  Write-Host 'Turn it off on this mini PC: Windows Security > App & browser control >'
  Write-Host 'Smart App Control settings > Off. On many Windows versions it cannot be turned back'
  Write-Host 'on without resetting Windows, which is fine for a computer that only runs the show.'
  Write-Host 'Then run this line again.'
  Write-Host 'More: minipc/README.md, "Windows blocked it".'
}

function Install-MiniPC {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'   # Windows PowerShell downloads slowly with a progress bar
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $release = 'https://github.com/roccomatusic-max/Projectionmapping/releases/download/minipc-latest'

  if (-not [Environment]::Is64BitOperatingSystem) {
    Write-Host 'The Mini PC app needs 64-bit Windows 10 or 11.' -ForegroundColor Red
    $global:LASTEXITCODE = 1
    return
  }

  # Smart App Control: 1 = on (blocks unsigned programs), 2 = evaluating, 0 = off.
  if ($env:MINIPC_APP_CONTROL) {
    $state = [int]$env:MINIPC_APP_CONTROL
  } else {
    $state = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy' -Name VerifiedAndReputablePolicyState -ErrorAction SilentlyContinue).VerifiedAndReputablePolicyState
  }
  if ($state -eq 1) {
    Show-AppControlBlock
    $global:LASTEXITCODE = 1
    return
  }

  $work = Join-Path ([IO.Path]::GetTempPath()) ('MiniPC-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $work | Out-Null
  try {
    $setup = Join-Path $work 'MiniPC-Setup.exe'
    if ($env:MINIPC_SETUP) {
      Copy-Item -LiteralPath $env:MINIPC_SETUP -Destination $setup
    } else {
      Write-Host 'Downloading the Mini PC app...'
      Invoke-WebRequest -UseBasicParsing -Uri "$release/MiniPC-Setup.exe" -OutFile $setup
    }
    Unblock-File -LiteralPath $setup
    Write-Host 'Installing...'
    try {
      $run = Start-Process -FilePath $setup -ArgumentList @('/SILENT', '/SUPPRESSMSGBOXES', '/NORESTART') -PassThru
    } catch {
      # A company App Control (WDAC) policy blocks it the same way.
      if ($_.Exception.Message -match 'Application Control|policy has blocked') {
        Show-AppControlBlock
        $global:LASTEXITCODE = 1
        return
      }
      throw
    }
    # Only the installer itself: Start-Process -Wait would also wait for the
    # Mini PC app it starts at the end, which never exits.
    $null = $run.Handle
    $run.WaitForExit()
    $code = $run.ExitCode
    if ($code -ne 0) {
      Write-Host ''
      Write-Host "The install did not finish (exit code $code)." -ForegroundColor Red
      Write-Host 'If Microsoft Defender removed MiniPC.exe, see minipc/README.md, "Windows blocked it".' -ForegroundColor Red
      $global:LASTEXITCODE = $code
      return
    }
    Write-Host ''
    Write-Host 'The Mini PC app is installed and starting.' -ForegroundColor Green
    Write-Host 'In a moment the projector shows a six-letter code: approve it on Mapping > Players.'
    if ($state -eq 2) {
      Write-Host ''
      Write-Host 'Note: Smart App Control is still deciding whether to turn itself on here. If the Mini PC' -ForegroundColor Yellow
      Write-Host 'app ever stops starting, turn Smart App Control off (minipc/README.md, "Windows blocked it").' -ForegroundColor Yellow
    }
    $global:LASTEXITCODE = 0
  } finally {
    Set-Location -LiteralPath ([IO.Path]::GetTempPath())
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Install-MiniPC
