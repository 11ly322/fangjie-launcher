Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"

!ifndef PROJECT_ROOT
  !error "PROJECT_ROOT is required"
!endif

!define APP_NAME "方界启动器"
!ifndef APP_VERSION
  !define APP_VERSION "0.0.3-beta"
!endif
!ifndef APP_VERSION_NUMERIC
  !define APP_VERSION_NUMERIC "0.0.3.0"
!endif
!define APP_PUBLISHER "11ly322"
!define APP_EXE "Fangjie.exe"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\FangjieLauncher"

!if /FileExists "${PROJECT_ROOT}\release\Fangjie-win32-x64\Fangjie.exe"
!else
  !error "Portable build not found. Run npm run package first."
!endif

Name "${APP_NAME} ${APP_VERSION}"
OutFile "${PROJECT_ROOT}\release\Fangjie-Launcher-${APP_VERSION}-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\Fangjie Launcher"
InstallDirRegKey HKCU "${UNINSTALL_KEY}" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID zlib
BrandingText "${APP_NAME} · ${APP_VERSION}"

VIProductVersion "${APP_VERSION_NUMERIC}"
VIAddVersionKey /LANG=2052 "ProductName" "${APP_NAME}"
VIAddVersionKey /LANG=2052 "ProductVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=2052 "FileDescription" "${APP_NAME} 安装程序"
VIAddVersionKey /LANG=2052 "FileVersion" "${APP_VERSION_NUMERIC}"
VIAddVersionKey /LANG=2052 "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey /LANG=2052 "LegalCopyright" "MIT License"

!define MUI_ICON "${PROJECT_ROOT}\resources\icon.ico"
!define MUI_UNICON "${PROJECT_ROOT}\resources\icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "启动方界启动器"
!define MUI_FINISHPAGE_LINK "项目主页：github.com/11ly322/fangjie-launcher"
!define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/11ly322/fangjie-launcher"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${PROJECT_ROOT}\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"

Section "安装方界启动器" SecInstall
  SetShellVarContext current
  SetRegView 64
  SetOutPath "$INSTDIR"
  File /r "${PROJECT_ROOT}\release\Fangjie-win32-x64\*.*"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\方界启动器"
  CreateShortcut "$SMPROGRAMS\方界启动器\方界启动器.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortcut "$SMPROGRAMS\方界启动器\卸载方界启动器.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\方界启动器.lnk" "$INSTDIR\${APP_EXE}"

  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "URLInfoAbout" "https://github.com/11ly322/fangjie-launcher"
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1

  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  SetRegView 64

  Delete "$DESKTOP\方界启动器.lnk"
  RMDir /r "$SMPROGRAMS\方界启动器"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"

  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR"
SectionEnd
