; Folio · Windows 安装包脚本（Inno Setup 6）
; 用法：安装 Inno Setup 后运行  build-win-setup.bat  或用 ISCC.exe 编译本文件
#define MyAppName "Folio"
#define MyAppVersion "2.1.0"
#define MyAppPublisher "XiaoWang-SXAU-Lab"
#define MyAppURL "https://github.com/XiaoWang-SXAU-Lab/folio"
#define MyAppExeName "Folio.exe"

[Setup]
AppId={{8F3A2E71-6B4C-4D5E-9A1F-F0110ED17A01}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
; 输出
OutputDir=dist
OutputBaseFilename=Folio-{#MyAppVersion}-windows-x64-setup
SetupIconFile=app\AppIcon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
; 压缩
Compression=lzma2/ultra64
SolidCompression=yes
; 界面
WizardStyle=modern
ShowLanguageDialog=auto
; 权限：装到 Program Files 需要管理员
PrivilegesRequired=admin
; 架构
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0

[Languages]
Name: "chs"; MessagesFile: "app\ChineseSimplified.isl"
Name: "en";  MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "dist\Folio.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "demo\*"; DestDir: "{app}\demo"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\卸载 {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
