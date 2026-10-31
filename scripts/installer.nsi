Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"

!ifndef PROJECT_ROOT
  !error "PROJECT_ROOT is required"
!endif

!define APP_NAME "unflod bindery launcher"
!ifndef APP_VERSION
  !define APP_VERSION "0.0.11"
!endif
!ifndef APP_VERSION_NUMERIC
  !define APP_VERSION_NUMERIC "0.0.11.0"
!endif
!define APP_PUBLISHER "11ly322"
!define APP_EXE "UBL.exe"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\UBLLauncher"

!if /FileExists "${PROJECT_ROOT}\release\UBL-win32-x64\UBL.exe"
!else
  !error "Portable build not found. Run npm run package first."
!endif

Name "${APP_NAME} ${APP_VERSION}"
OutFile "${PROJECT_ROOT}\release\UBL-Launcher-${APP_VERSION}-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\UBL"
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
!define MUI_FINISHPAGE_RUN_TEXT "启动 unflod bindery launcher"
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

Section "安装 unflod bindery launcher" SecInstall
  SetShellVarContext current
  SetRegView 64
  SetOutPath "$INSTDIR"
  File /r "${PROJECT_ROOT}\release\UBL-win32-x64\*.*"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\UBL"
  CreateShortcut "$SMPROGRAMS\UBL\unflod bindery launcher.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortcut "$SMPROGRAMS\UBL\卸载 UBL.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\unflod bindery launcher.lnk" "$INSTDIR\${APP_EXE}"

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

  Delete "$DESKTOP\unflod bindery launcher.lnk"
  RMDir /r "$SMPROGRAMS\UBL"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"

  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR"
SectionEnd
