# The Windows server, end to end, on a fresh Windows machine (a GitHub runner).
#
# Installs the built zip with the same PowerShell line Rocco pastes, then checks
# everything the Mac app does: service at boot, restart after a crash, --lan on
# 8765, firewall, discovery by mini PCs, the phone remote's address, the
# first-run password, password reset, keep-awake, update, rollback of a broken
# update, and uninstall. Each check prints "ok" or stops the job.
#
#   pwsh desktop/windows/ci/check-windows-server.ps1 -Zip dist\ProjectorControl-Windows-Server.zip -Version 1.0.123

param(
  [Parameter(Mandatory)] [string] $Zip,
  [Parameter(Mandatory)] [string] $Version
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Zip = (Resolve-Path $Zip).Path
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$Service = 'ProjectorControl'
$Install = Join-Path $env:ProgramFiles 'Projector Control'
$Exe = Join-Path $Install 'ProjectorControl.exe'
$Data = Join-Path $env:ProgramData 'ProjectorControl'
$Base = 'http://127.0.0.1:8765'
$Report = [System.Collections.Generic.List[string]]::new()

function Check([bool] $ok, [string] $what) {
  if (-not $ok) { Write-Host "FAILED: $what" -ForegroundColor Red; Show-Logs; throw "FAILED: $what" }
  Write-Host "ok  $what"
  $Report.Add("| $what | ok |")
}
function Note([string] $what) { Write-Host "--  $what"; $Report.Add("| $what | noted |") }
function Show-Logs {
  foreach ($log in 'service.log', 'projector-control.log') {
    $path = Join-Path $Data "logs\$log"
    if (Test-Path $path) { Write-Host "---- $log"; Get-Content $path -Tail 60 }
  }
  $watch = Join-Path $Data 'updates\watch-update.log'
  if (Test-Path $watch) { Write-Host '---- watch-update.log'; Get-Content $watch }
}
function Health { try { Invoke-RestMethod "$Base/api/health" -TimeoutSec 3 } catch { $null } }
function Wait-Version([string] $wanted, [int] $seconds = 120) {
  for ($i = 0; $i -lt $seconds; $i++) {
    $h = Health
    if ($h -and $h.version -eq $wanted) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}
function Service-Pid { (Get-CimInstance Win32_Service -Filter "Name='$Service'").ProcessId }
function Login([string] $password) {
  try {
    $body = @{ username = 'admin'; password = $password } | ConvertTo-Json
    (Invoke-RestMethod "$Base/api/auth/login" -Method Post -ContentType 'application/json' -Body $body).access_token
  } catch { $null }
}
function Api([string] $token, [string] $path, [string] $method = 'Get', $body = $null) {
  $options = @{ Uri = "$Base/api$path"; Method = $method; Headers = @{ Authorization = "Bearer $token" } }
  if ($null -ne $body) { $options.ContentType = 'application/json'; $options.Body = ($body | ConvertTo-Json) }
  Invoke-RestMethod @options
}
function Run-Installer {
  # Exactly the line from docs/WINDOWS-SERVER.md, in Windows PowerShell 5.1, from a local zip.
  $env:PROJECTOR_CONTROL_ZIP = $Zip
  $env:PROJECTOR_CONTROL_NO_BROWSER = '1'
  $script = Join-Path $Root 'desktop\windows\install-windows-server.ps1'
  $output = powershell.exe -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; Get-Content -Raw '$script' | iex" 2>&1 | Out-String
  Write-Host $output
  return $output
}
function Rezip([string] $newVersion, [string] $target, [scriptblock] $change = $null) {
  $work = Join-Path $env:RUNNER_TEMP ("rezip-" + $newVersion)
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
  Expand-Archive -LiteralPath $Zip -DestinationPath $work
  Set-Content -Path (Join-Path $work 'Projector Control\_internal\version.txt') -Value $newVersion -NoNewline -Encoding ASCII
  if ($change) { & $change (Join-Path $work 'Projector Control') }
  & python (Join-Path $Root 'desktop\windows\make_zip.py') (Join-Path $work 'Projector Control') $target
  if ($LASTEXITCODE) { throw 'rezip failed' }
}

Write-Host "Windows: $((Get-CimInstance Win32_OperatingSystem).Caption) $([Environment]::OSVersion.Version)"
$Report.Add("| Windows | $((Get-CimInstance Win32_OperatingSystem).Caption) |")

# -- install ------------------------------------------------------------------
$output = Run-Installer
Check (Wait-Version $Version) "the install line installs $Version and the dashboard answers on port 8765"
$password = [regex]::Match($output, 'password:\s+(\S+)').Groups[1].Value
Check ($password.Length -ge 12) 'the installer prints the first-run admin password'
Check ((Get-Content (Join-Path $Data 'FIRST-RUN-PASSWORD.txt') -Raw) -match [regex]::Escape($password)) 'the password is also in C:\ProgramData\ProjectorControl\FIRST-RUN-PASSWORD.txt'
Check ($output -match 'http://\d+\.\d+\.\d+\.\d+:8765') 'the installer prints the address for other devices'

$svc = Get-CimInstance Win32_Service -Filter "Name='$Service'"
Check ($svc.State -eq 'Running') 'the Windows service is running'
Check ($svc.StartMode -eq 'Auto') 'it starts when Windows starts (Automatic), before anyone signs in'
Check ($svc.StartName -eq 'LocalSystem') 'it runs as the system account'
Check ($svc.PathName -like "*Program Files\Projector Control\ProjectorControl.exe*--windows-service*") "it runs the copy in C:\Program Files\Projector Control"
$failure = (sc.exe qfailure $Service) -join "`n"
Check (([regex]::Matches($failure, 'RESTART')).Count -ge 3) 'Windows restarts it after a crash'
Check (((sc.exe qfailureflag $Service) -join ' ') -match 'TRUE') 'and after an exit with an error'

$token = Login $password
Check ([bool] $token) 'admin signs in with the first-run password'

foreach ($rule in 'Projector Control (dashboard)', 'Projector Control (mini PC discovery)') {
  $r = Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue
  $port = $r | Get-NetFirewallPortFilter
  Check ($r -and $r.Enabled -eq 'True' -and $r.Direction -eq 'Inbound' -and $port.LocalPort -eq '8765') "firewall rule '$rule' lets port $($port.Protocol) 8765 in"
}
Check (Test-Path (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Projector Control.url')) 'Start menu has Projector Control (opens the dashboard)'

foreach ($file in 'projector-control.db', 'secret.key', 'logs\projector-control.log', 'logs\service.log') {
  Check (Test-Path (Join-Path $Data $file)) "C:\ProgramData\ProjectorControl\$file exists"
}
$sids = (Get-Acl $Data).Access | ForEach-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } | Sort-Object -Unique
Check (-not ($sids | Where-Object { $_ -notin 'S-1-5-18', 'S-1-5-32-544' })) "only SYSTEM and Administrators may read the data folder ($($sids -join ', '))"

$requests = (powercfg /requests) -join "`n"
Check ($requests -match 'ProjectorControl') 'it keeps Windows from sleeping while it runs (powercfg /requests)'

# -- the network: mini PCs and the phone remote ---------------------------------
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127|169\.254)\.' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1).IPAddress
$remote = try { Invoke-RestMethod "http://${ip}:8765/api/health" -TimeoutSec 5 } catch { $null }
Check ($remote -and $remote.version -eq $Version) "the dashboard answers on the network address http://${ip}:8765"
$network = Api $token '/mapping/players/network'
Check ($network.address -like 'http://*:8765' -and -not $network.local_only) "the phone remote's QR code points at $($network.address)"
Check ($network.server_os -eq 'windows') 'the phone remote page knows the server is Windows (Tailscale link)'
$found = & python -c "import sys; sys.path.insert(0, r'$Root\minipc'); import discovery; print(discovery.find_server(timeout=3, targets=[('$ip', 8765)]))"
Check ($found -eq "http://${ip}:8765") "a mini PC asking on the network finds the server ($found)"
$broadcast = & python -c "import sys; sys.path.insert(0, r'$Root\minipc'); import discovery; print(discovery.find_server(timeout=3))"
Note "mini PC broadcast from this same machine found: $broadcast"
try {
  $mdns = Resolve-DnsName -Name "$($env:COMPUTERNAME).local" -Type A -ErrorAction Stop | Select-Object -First 1
  Note "$($env:COMPUTERNAME).local resolves here to $($mdns.IPAddress) (not proof for other devices)"
} catch { Note "$($env:COMPUTERNAME).local does not resolve on this machine" }

# -- updates: the panel, a real check against GitHub ----------------------------
$status = Api $token '/system/updates'
Check ($status.supported -and $status.system -eq 'windows' -and $status.current -eq $Version) 'Settings, App updates is shown, with this version'
Check ($status.auto -eq $true) 'Install updates by themselves is on by default'
$github = Api $token '/system/updates?check=true'
Note "the update check against GitHub answered: latest=$($github.latest) error=$($github.error)"

# -- a crash ----------------------------------------------------------------------
$before = Service-Pid
Stop-Process -Id $before -Force
Start-Sleep -Seconds 2
$back = $false
for ($i = 0; $i -lt 90 -and -not $back; $i++) { Start-Sleep 1; $h = Health; $back = $h -and (Service-Pid) -ne $before -and (Service-Pid) -ne 0 }
Check $back 'after the program is killed, Windows starts it again by itself'

# -- password reset ---------------------------------------------------------------
$reset = & $Exe --reset-admin-password 2>&1 | Out-String
Write-Host $reset
$newPassword = [regex]::Match($reset, 'password:\s+(\S+)').Groups[1].Value
Check ($newPassword.Length -ge 12 -and (Login $newPassword)) '--reset-admin-password prints a new password that signs in, with the service running'
Check (-not (Login $password)) 'the old password no longer signs in'
$token = Login $newPassword

# -- running the install line again -------------------------------------------------
$again = Run-Installer
Check ((Wait-Version $Version) -and (Get-Service $Service).Status -eq 'Running') 'running the install line again keeps it running'

# -- an update from the release ----------------------------------------------------
$parts = $Version.Split('.')
$next = "$($parts[0]).$($parts[1]).$([int]$parts[2] + 1)"
$broken = "$($parts[0]).$($parts[1]).$([int]$parts[2] + 2)"
$nextZip = Join-Path $env:RUNNER_TEMP 'next.zip'
Rezip $next $nextZip
$fake = Start-Process python -ArgumentList @((Join-Path $PSScriptRoot 'fake_release.py'), '8799', $next, $nextZip) -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2
# Point the service's update checks at the stand-in release, the way UPDATE_REPOSITORY could.
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\$Service" -Name Environment -Type MultiString -Value @('UPDATE_API_BASE=http://127.0.0.1:8799')
Restart-Service $Service
Check (Wait-Version $Version) 'the service restarts cleanly (Restart-Service)'
$token = Login $newPassword
$offer = Api $token '/system/updates?check=true'
Check ($offer.available -and $offer.latest -eq $next) "Check now offers $next"
$started = Api $token '/system/updates/install' 'Post' @{ confirm = $true }
Check ($started.installing) 'Install starts'
Check (Wait-Version $next 180) "the service comes back as $next by itself"
Start-Sleep -Seconds 3
Check ((Get-Content (Join-Path $Data 'updates\last-result.txt') -Raw).Trim() -eq "installed $next") 'the update is recorded as installed'
Check (-not (Test-Path (Join-Path $env:ProgramFiles '.Projector Control.previous'))) 'the previous copy is cleaned up'
Check ((((sc.exe qfailure $Service) -join "`n") | Select-String -Pattern 'RESTART' -AllMatches).Matches.Count -ge 3) 'crash restarts are switched back on after the update'
$token = Login $newPassword
Check ([bool] $token) 'the same password still signs in after the update (data kept)'
Stop-Process -Id $fake.Id -Force

# -- a broken update is rolled back -----------------------------------------------
$brokenZip = Join-Path $env:RUNNER_TEMP 'broken.zip'
# Starts far enough to say its version, then fails: no SQLite.
Rezip $broken $brokenZip { param($folder) Remove-Item (Join-Path $folder '_internal\_sqlite3.pyd') -Force }
$fake = Start-Process python -ArgumentList @((Join-Path $PSScriptRoot 'fake_release.py'), '8799', $broken, $brokenZip) -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2
$offer = Api $token '/system/updates?check=true'
Check ($offer.available -and $offer.latest -eq $broken) "Check now offers the broken $broken"
$started = Api $token '/system/updates/install' 'Post' @{ confirm = $true }
Check ($started.installing) 'Install of the broken version starts'
Start-Sleep -Seconds 20
$rolled = $false
for ($i = 0; $i -lt 240 -and -not $rolled; $i++) {
  Start-Sleep 1
  $result = Get-Content (Join-Path $Data 'updates\last-result.txt') -Raw -ErrorAction SilentlyContinue
  $rolled = $result -and $result.Trim() -eq "rolled-back $broken"
}
Check $rolled 'a version that does not start is rolled back by itself'
Check (Wait-Version $next 120) "the previous version $next is running again"
$token = Login $newPassword
$after = Api $token '/system/updates'
Check ($after.last_result -eq "rolled-back $broken") 'Settings, App updates says the update was put back'
Check ((((sc.exe qfailure $Service) -join "`n") | Select-String -Pattern 'RESTART' -AllMatches).Matches.Count -ge 3) 'crash restarts are on after the rollback'
Stop-Process -Id $fake.Id -Force
Remove-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\$Service" -Name Environment

# -- uninstall ----------------------------------------------------------------------
$removed = & $Exe --uninstall 2>&1 | Out-String
Write-Host $removed
Check (-not (Get-Service $Service -ErrorAction SilentlyContinue)) '--uninstall removes the service'
Check (-not (Get-NetFirewallRule -DisplayName 'Projector Control (dashboard)' -ErrorAction SilentlyContinue)) 'and its firewall rules'
Check (-not (Health)) 'and the server is stopped'
Check ((Test-Path $Exe) -and (Test-Path (Join-Path $Data 'projector-control.db'))) 'the program and the data are kept'

Write-Host ''
Write-Host 'Every check passed.'
if ($env:GITHUB_STEP_SUMMARY) {
  @("### Windows server check: $Version", '', '| Check | Result |', '|---|---|') + $Report | Add-Content $env:GITHUB_STEP_SUMMARY
}
