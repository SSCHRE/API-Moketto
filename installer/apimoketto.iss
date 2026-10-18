; Inno Setup script for the Windows installer.
; Run `npm run build` first, then compile this file with Inno Setup 6:
;   iscc installer\apimoketto.iss
; Pass /DAppVersion=x.y.z to match package.json if it changed.

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#define AppName "ApiMoketto"
#define AppExe "apimoketto.exe"
#define BuildDir "..\dist\apimoketto-" + AppVersion + "-windows-x64"

[Setup]
AppId={{6B1E2C5A-4F0D-4C8E-9A57-2D3B8E1F7A40}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=SSCHRE
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
; Per-user install by default (no admin prompt); the user can still pick all users.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
ChangesEnvironment=yes
OutputDir=..\dist
OutputBaseFilename=apimoketto-{#AppVersion}-setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#AppExe}

[Tasks]
Name: "addtopath"; Description: "Add apimoketto to PATH (use it from any terminal)"
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#BuildDir}\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#BuildDir}\README.md"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "{#BuildDir}\LICENSE"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Dirs]
; mock.json is read from the working directory, so shortcuts start here instead of the install folder.
Name: "{userdocs}\{#AppName}"; Flags: uninsneveruninstall

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"; Parameters: "--open"; WorkingDir: "{userdocs}\{#AppName}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Parameters: "--open"; WorkingDir: "{userdocs}\{#AppName}"; Tasks: desktopicon

[Registry]
Root: HKA; Subkey: "{code:EnvKey}"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}"; Tasks: addtopath; Check: NotInPath(ExpandConstant('{app}'))

[Run]
Filename: "{app}\{#AppExe}"; Parameters: "--open"; WorkingDir: "{userdocs}\{#AppName}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent

[Code]
function EnvKey(Param: String): String;
begin
  if IsAdminInstallMode then
    Result := 'SYSTEM\CurrentControlSet\Control\Session Manager\Environment'
  else
    Result := 'Environment';
end;

function EnvRoot: Integer;
begin
  if IsAdminInstallMode then Result := HKEY_LOCAL_MACHINE else Result := HKEY_CURRENT_USER;
end;

function NotInPath(Dir: String): Boolean;
var
  Path: String;
begin
  if not RegQueryStringValue(EnvRoot, EnvKey(''), 'Path', Path) then
    Result := True
  else
    Result := Pos(';' + Uppercase(Dir) + ';', ';' + Uppercase(Path) + ';') = 0;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Path, Dir: String;
  P: Integer;
begin
  if CurUninstallStep <> usPostUninstall then Exit;
  if not RegQueryStringValue(EnvRoot, EnvKey(''), 'Path', Path) then Exit;
  Dir := ExpandConstant('{app}');
  Path := ';' + Path + ';';
  P := Pos(';' + Uppercase(Dir) + ';', Uppercase(Path));
  if P = 0 then Exit;
  Delete(Path, P, Length(Dir) + 1);
  Path := Copy(Path, 2, Length(Path) - 2);
  RegWriteExpandStringValue(EnvRoot, EnvKey(''), 'Path', Path);
end;
