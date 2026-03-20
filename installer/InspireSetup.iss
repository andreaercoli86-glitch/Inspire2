; InspireMe2 — Inno Setup Script
; Builds InspireMe2-Setup.exe for Windows 10+ x64
; Requires: Node.js pre-installed, Ollama handled by in-app setup wizard

[Setup]
AppName=InspireMe2
AppVersion=1.0.0
AppPublisher=InspireMe Project
AppPublisherURL=https://github.com
DefaultDirName={userdocs}\InspireMe2
DefaultGroupName=InspireMe2
OutputBaseFilename=InspireMe2-Setup
OutputDir=output
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupIconFile=..\assets\inspire.ico
UninstallDisplayIcon={app}\assets\inspire.ico
DisableProgramGroupPage=yes
LicenseFile=..\LICENSE

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl"

[Files]
; Frontend
Source: "..\public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs

; Backend
Source: "..\inspire-server\server.js"; DestDir: "{app}\inspire-server"; Flags: ignoreversion
Source: "..\inspire-server\search.js"; DestDir: "{app}\inspire-server"; Flags: ignoreversion
Source: "..\inspire-server\db.js"; DestDir: "{app}\inspire-server"; Flags: ignoreversion
Source: "..\inspire-server\package.json"; DestDir: "{app}\inspire-server"; Flags: ignoreversion
Source: "..\inspire-server\package-lock.json"; DestDir: "{app}\inspire-server"; Flags: ignoreversion
Source: "..\inspire-server\data\concept-map.json"; DestDir: "{app}\inspire-server\data"; Flags: ignoreversion

; Launchers
Source: "..\InspireMe-Start.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\InspireMe-Install.bat"; DestDir: "{app}"; Flags: ignoreversion

; Icon
Source: "..\assets\inspire.ico"; DestDir: "{app}\assets"; Flags: ignoreversion

; Data directory placeholder
Source: "..\data\.gitkeep"; DestDir: "{app}\data"; Flags: ignoreversion skipifsourcedoesntexist

[Dirs]
Name: "{app}\data"
Name: "{app}\inspire-server\data"

[Icons]
; Desktop shortcut — runs the start script minimized, with nice icon
Name: "{autodesktop}\InspireMe2"; Filename: "{app}\InspireMe-Start.bat"; IconFilename: "{app}\assets\inspire.ico"; Comment: "Launch InspireMe2 — AI Book & Movie Recommendations"; WorkingDir: "{app}"
; Start Menu
Name: "{group}\InspireMe2"; Filename: "{app}\InspireMe-Start.bat"; IconFilename: "{app}\assets\inspire.ico"; WorkingDir: "{app}"
Name: "{group}\InspireMe2 Setup"; Filename: "{app}\InspireMe-Install.bat"; IconFilename: "{app}\assets\inspire.ico"; WorkingDir: "{app}"
Name: "{group}\Uninstall InspireMe2"; Filename: "{uninstallexe}"

[Run]
; Post-install: run npm install
Filename: "cmd.exe"; Parameters: "/c cd /d ""{app}\inspire-server"" && npm install"; StatusMsg: "Installing Node.js dependencies..."; Flags: runhidden waituntilterminated
; Post-install: optionally launch the app
Filename: "{app}\InspireMe-Install.bat"; Flags: nowait postinstall shellexec; Description: "Launch InspireMe2 first-time setup"; WorkingDir: "{app}"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\inspire-server\node_modules"
Type: filesandordirs; Name: "{app}\data"

[Code]
// Check Node.js is available before proceeding
function IsNodeInstalled(): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec('cmd.exe', '/c node --version', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

function InitializeSetup(): Boolean;
var
  ErrorCode: Integer;
begin
  Result := True;
  if not IsNodeInstalled() then
  begin
    if MsgBox('Node.js is required but was not found.' + #13#10 + #13#10 +
              'Would you like to download it now?' + #13#10 +
              '(Install Node.js, then run this setup again)',
              mbConfirmation, MB_YESNO) = IDYES then
    begin
      ShellExec('open', 'https://nodejs.org', '', '', SW_SHOWNORMAL, ewNoWait, ErrorCode);
    end;
    Result := False;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // Check if database exists, if not show message
    if not FileExists(ExpandConstant('{app}\data\inspire.db')) then
    begin
      MsgBox('The database file (inspire.db) is not yet installed.' + #13#10 + #13#10 +
             'On first launch, the setup wizard will guide you through downloading it.' + #13#10 + #13#10 +
             'Alternatively, download it manually from the GitHub Releases page' + #13#10 +
             'and place it in:' + #13#10 +
             ExpandConstant('{app}\data\'),
             mbInformation, MB_OK);
    end;
  end;
end;
