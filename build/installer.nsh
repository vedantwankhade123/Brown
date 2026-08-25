; ==============================================================================
; Ultron AI NSIS Installer Hook Script
; Path normalization, orphan drive-root cleanup, Fresh/Merge conflict UI,
; aggressive shortcut cleanup, and UltronData wipe on Fresh / uninstall.
; ==============================================================================

; Guard: electron-builder includes this file in the script header and again from
; installSection.nsh (!include installer.nsh).
!ifndef ULTRON_INSTALLER_NSH_INCLUDED
!define ULTRON_INSTALLER_NSH_INCLUDED

!include "LogicLib.nsh"

; APP_FILENAME / PRODUCT_FILENAME / APP_GUID / UNINSTALL_APP_KEY come from makensis -D.
!define ULTRON_APP_FOLDER "${APP_FILENAME}"
!define ULTRON_EXE "${PRODUCT_FILENAME}.exe"
!define ULTRON_UNINSTALLER "Uninstall ${PRODUCT_FILENAME}.exe"
!define ULTRON_DATA_DIR "$LOCALAPPDATA\UltronData"
!define ULTRON_INSTALL_REG "Software\${APP_GUID}"
!define ULTRON_UNINSTALL_REG "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"

; ------------------------------------------------------------------------------
; Helpers (macros - safe to expand from customInit / customInstall / etc.)
; ------------------------------------------------------------------------------

!macro UltronKillProcesses
  nsExec::Exec 'taskkill /F /IM "${PRODUCT_FILENAME}.exe" /IM "Ultron.exe" /IM "electron.exe" /T'
!macroend

!macro UltronDeleteShortcuts
  Delete "$DESKTOP\${PRODUCT_FILENAME}.lnk"
  Delete "$DESKTOP\Ultron.lnk"
  Delete "$PROFILE\Desktop\${PRODUCT_FILENAME}.lnk"
  Delete "$PROFILE\Desktop\Ultron.lnk"
  Delete "$PROFILE\OneDrive\Desktop\${PRODUCT_FILENAME}.lnk"
  Delete "$PROFILE\OneDrive\Desktop\Ultron.lnk"
  Delete "C:\Users\Public\Desktop\${PRODUCT_FILENAME}.lnk"
  Delete "C:\Users\Public\Desktop\Ultron.lnk"
  nsExec::Exec 'cmd /c del /f /q "C:\Users\Public\Desktop\${PRODUCT_FILENAME}.lnk" "C:\Users\Public\Desktop\Ultron.lnk"'
  Delete "$SMPROGRAMS\${PRODUCT_FILENAME}.lnk"
  Delete "$SMPROGRAMS\Ultron.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_FILENAME}\${PRODUCT_FILENAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_FILENAME}\Ultron.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_FILENAME}\Uninstall ${PRODUCT_FILENAME}.lnk"
  RMDir "$SMPROGRAMS\${PRODUCT_FILENAME}"
!macroend

; Installer-only code. BUILD_UNINSTALLER compiles this file without Page macros, and
; electron-builder treats "function not referenced" warnings as errors.
!ifndef BUILD_UNINSTALLER

Var UltronHadExisting
Var UltronDriveRoot
Var UltronOrphanPath
Var UltronParentDir
Var UltronSuffix
Var UltronRegPath
Var UltronCmdPos
Var UltronCmdSlice

; Ensure $INSTDIR ends with "\<APP_FILENAME>" (single product folder).
Function UltronNormalizeInstDir
  StrLen $0 "\${ULTRON_APP_FOLDER}"
  IntOp $0 $0 * -1
  StrCpy $UltronSuffix $INSTDIR "" $0
  ${If} $UltronSuffix == "\${ULTRON_APP_FOLDER}"
    Return
  ${EndIf}

  StrCpy $INSTDIR "$INSTDIR\${ULTRON_APP_FOLDER}"
FunctionEnd

; Warn when final path is a bare drive-root install (e.g. D:\Ultron AI).
Function UltronWarnDriveRootInstall
  StrLen $0 "\${ULTRON_APP_FOLDER}"
  IntOp $0 $0 * -1
  StrCpy $UltronParentDir $INSTDIR $0
  StrLen $0 $UltronParentDir
  ${If} $0 == 2
    MessageBox MB_YESNO|MB_ICONEXCLAMATION \
      "You selected a drive root. Ultron AI will install to:$\r$\n$\r$\n$INSTDIR$\r$\n$\r$\nContinue with this location?" \
      IDYES ultron_drive_ok
    Quit
    ultron_drive_ok:
  ${EndIf}
FunctionEnd

; Remove empty orphan "<drive>:\Ultron AI" when it is not the chosen $INSTDIR.
Function UltronCleanupOrphanRoot
  StrCpy $UltronDriveRoot $INSTDIR 2
  StrCpy $UltronOrphanPath "$UltronDriveRoot\${ULTRON_APP_FOLDER}"

  ${If} $UltronOrphanPath == $INSTDIR
    Return
  ${EndIf}

  IfFileExists "$UltronOrphanPath" 0 ultron_orphan_done
    RMDir "$UltronOrphanPath"
  ultron_orphan_done:
FunctionEnd

; electron-updater passes /updated. Avoid StdUtils ${isUpdated} - installer.nsh is
; !include'd before StdUtils is available (Plugin not found).
Function UltronIsUpdaterInstall
  StrCpy $UltronCmdPos 0
ultron_upd_loop:
  StrCpy $UltronCmdSlice $CMDLINE 8 $UltronCmdPos
  ${If} $UltronCmdSlice == "/updated"
    StrCpy $0 "1"
    Return
  ${EndIf}
  ${If} $UltronCmdSlice == ""
    StrCpy $0 "0"
    Return
  ${EndIf}
  IntOp $UltronCmdPos $UltronCmdPos + 1
  Goto ultron_upd_loop
FunctionEnd

; Detect prior install / user data and prompt Fresh (default) / Merge / Cancel.
Function UltronPromptExistingInstall
  Call UltronIsUpdaterInstall
  ${If} $0 == "1"
    Return
  ${EndIf}

  StrCpy $UltronHadExisting "0"

  IfFileExists "$INSTDIR\${ULTRON_EXE}" 0 +2
    StrCpy $UltronHadExisting "1"
  IfFileExists "$INSTDIR\${ULTRON_UNINSTALLER}" 0 +2
    StrCpy $UltronHadExisting "1"
  IfFileExists "${ULTRON_DATA_DIR}" 0 +2
    StrCpy $UltronHadExisting "1"

  ReadRegStr $UltronRegPath HKCU "${ULTRON_INSTALL_REG}" InstallLocation
  ${If} $UltronRegPath != ""
    StrCpy $UltronHadExisting "1"
  ${EndIf}
  ReadRegStr $UltronRegPath HKLM "${ULTRON_INSTALL_REG}" InstallLocation
  ${If} $UltronRegPath != ""
    StrCpy $UltronHadExisting "1"
  ${EndIf}

  ReadRegStr $UltronRegPath HKCU "${ULTRON_UNINSTALL_REG}" DisplayName
  ${If} $UltronRegPath != ""
    StrCpy $UltronHadExisting "1"
  ${EndIf}
  ReadRegStr $UltronRegPath HKLM "${ULTRON_UNINSTALL_REG}" DisplayName
  ${If} $UltronRegPath != ""
    StrCpy $UltronHadExisting "1"
  ${EndIf}

  ${If} $UltronHadExisting == "0"
    Return
  ${EndIf}

  IfSilent ultron_do_fresh

  MessageBox MB_YESNOCANCEL|MB_ICONQUESTION|MB_DEFBUTTON1 \
    "An existing Ultron AI installation or local data was found.$\r$\n$\r$\nYes = Fresh Installation (recommended)$\r$\n  Wipe app files at:$\r$\n  $INSTDIR$\r$\n  and local data at:$\r$\n  ${ULTRON_DATA_DIR}$\r$\n  then install clean.$\r$\n$\r$\nNo = Merge Installation$\r$\n  Overwrite app files; keep chats, settings, and models.$\r$\n$\r$\nCancel = Abort setup." \
    IDYES ultron_do_fresh IDNO ultron_do_merge
  Quit

  ultron_do_merge:
    Return

  ultron_do_fresh:
    !insertmacro UltronKillProcesses
    !insertmacro UltronDeleteShortcuts
    RMDir /r "$INSTDIR"
    RMDir /r "${ULTRON_DATA_DIR}"
FunctionEnd

Function UltronAfterDirPage
  Call UltronNormalizeInstDir
  Call UltronWarnDriveRootInstall
  Call UltronCleanupOrphanRoot
  Call UltronPromptExistingInstall
  Abort
FunctionEnd

Function UltronAfterDirPageLeave
FunctionEnd

!macro customPageAfterChangeDir
  Page custom UltronAfterDirPage UltronAfterDirPageLeave
!macroend

!macro customInit
  !insertmacro UltronKillProcesses
  !insertmacro UltronDeleteShortcuts
  ; Silent installs skip customPageAfterChangeDir — normalize / Fresh here.
  Call UltronNormalizeInstDir
  IfSilent 0 ultron_custom_init_ui
    Call UltronCleanupOrphanRoot
    Call UltronPromptExistingInstall
    Goto ultron_custom_init_done
  ultron_custom_init_ui:
  ultron_custom_init_done:
!macroend

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customInstall
  Call UltronCleanupOrphanRoot

  !insertmacro UltronDeleteShortcuts

  SetOutPath "$INSTDIR"

  CreateShortcut "$DESKTOP\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${ULTRON_EXE}" "" "$INSTDIR\${ULTRON_EXE}" 0 "" "" "Ultron AI - Autonomous Local AI Agent"

  IfFileExists "$PROFILE\OneDrive\Desktop" 0 +2
  CreateShortcut "$PROFILE\OneDrive\Desktop\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${ULTRON_EXE}" "" "$INSTDIR\${ULTRON_EXE}" 0 "" "" "Ultron AI - Autonomous Local AI Agent"

  CreateDirectory "$SMPROGRAMS\${PRODUCT_FILENAME}"
  CreateShortcut "$SMPROGRAMS\${PRODUCT_FILENAME}\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${ULTRON_EXE}" "" "$INSTDIR\${ULTRON_EXE}" 0 "" "" "Ultron AI - Autonomous Local AI Agent"
  CreateShortcut "$SMPROGRAMS\${PRODUCT_FILENAME}\Uninstall ${PRODUCT_FILENAME}.lnk" "$INSTDIR\${ULTRON_UNINSTALLER}" "" "$INSTDIR\${ULTRON_UNINSTALLER}" 0
!macroend

!endif ; BUILD_UNINSTALLER

!macro customUnInstall
  !insertmacro UltronKillProcesses
  !insertmacro UltronDeleteShortcuts

  ; App uses %LOCALAPPDATA%\UltronData (not %APPDATA%\Ultron AI).
  ; deleteAppDataOnUninstall only clears Roaming APPDATA paths - wipe UltronData here.
  RMDir /r "${ULTRON_DATA_DIR}"
!macroend

!endif ; ULTRON_INSTALLER_NSH_INCLUDED