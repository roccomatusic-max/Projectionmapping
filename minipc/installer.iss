; Installer for the Mini PC app. Built by minipc\build.ps1 with Inno Setup 6.
;
; Installs for the signed-in user (no administrator needed), starts the app
; when that user signs in, and starts it straight away when done.

#ifndef Version
  #define Version "0.0.0"
#endif

[Setup]
AppId={{6B0F6C52-3E2A-4F0B-9B1E-5A8C2D7E41A3}
AppName=Mini PC
AppVerName=Mini PC {#Version}
AppVersion={#Version}
AppPublisher=Projection Mapping
DefaultDirName={localappdata}\Programs\Mini PC
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=MiniPC-Setup
SetupIconFile=..\build\minipc.ico
UninstallDisplayIcon={app}\MiniPC.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; An update replaces a running copy.
CloseApplications=force
RestartApplications=no

[Files]
Source: "..\dist\MiniPC\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{userprograms}\Mini PC"; Filename: "{app}\MiniPC.exe"
Name: "{userstartup}\Mini PC"; Filename: "{app}\MiniPC.exe"

[Run]
; Every 5 minutes Windows starts the app if it is not running (after a crash,
; or an update that did not bring it back), or restarts it if it is stuck.
; It keeps the output window that is open. For this user only, no
; administrator needed. Quit in the tray menu keeps it off.
Filename: "{sys}\schtasks.exe"; Parameters: "/Create /F /TN ""Mini PC watchdog"" /SC MINUTE /MO 5 /TR ""\""{app}\MiniPC.exe\"" --watchdog"""; Flags: runhidden waituntilterminated
Filename: "{app}\MiniPC.exe"; Description: "Start Mini PC now"; Flags: nowait postinstall

[UninstallRun]
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /F /TN ""Mini PC watchdog"""; Flags: runhidden; RunOnceId: "StopWatchdog"
Filename: "{sys}\taskkill.exe"; Parameters: "/IM MiniPC.exe /F"; Flags: runhidden; RunOnceId: "StopMiniPC"
