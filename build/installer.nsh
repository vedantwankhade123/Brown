; ==============================================================================
; Brown AI NSIS Installer Hook Script
; Preserve install-relative storage while replacing application binaries.
; ==============================================================================

!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "getProcessInfo.nsh"
Var pid

!ifndef BUILD_UNINSTALLER
Var brownStorageBackup

!macro BrownRestoreItem ITEM
  ${If} ${FileExists} "$brownStorageBackup\${ITEM}"
    ClearErrors
    Rename "$brownStorageBackup\${ITEM}" "$INSTDIR\${ITEM}"
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONSTOP "Your saved data is safe in $brownStorageBackup. Restore ${ITEM} to $INSTDIR before opening Brown."
      SetErrorLevel 1
      Quit
    ${EndIf}
  ${EndIf}
!macroend

Function BrownRestoreStorage
  ${If} $brownStorageBackup != ""
    CreateDirectory "$INSTDIR"
    !insertmacro BrownRestoreItem "data"
    !insertmacro BrownRestoreItem "models"
    !insertmacro BrownRestoreItem "connectors"
    !insertmacro BrownRestoreItem ".ultron-firstrun"
    RMDir "$brownStorageBackup"
    StrCpy $brownStorageBackup ""
  ${EndIf}
FunctionEnd

!macro BrownProtectItem ITEM
  ${If} ${FileExists} "$INSTDIR\${ITEM}"
    ClearErrors
    Rename "$INSTDIR\${ITEM}" "$brownStorageBackup\${ITEM}"
    ${If} ${Errors}
      Call BrownRestoreStorage
      MessageBox MB_OK|MB_ICONSTOP "Brown could not protect its saved data. Close programs using files in $INSTDIR and try again. Your existing installation has not been removed."
      SetErrorLevel 1
      Quit
    ${EndIf}
  ${EndIf}
!macroend

Function .onInstFailed
  Call BrownRestoreStorage
FunctionEnd
!endif

!macro customCheckAppRunning
  !insertmacro _CHECK_APP_RUNNING
  !ifndef BUILD_UNINSTALLER
    ; A sibling folder is on the same volume, so large model files are moved,
    ; not copied. Older uninstallers otherwise delete these directories.
    ${If} $brownStorageBackup == ""
      ${If} ${FileExists} "$INSTDIR.brown-update-backup"
        MessageBox MB_OK|MB_ICONSTOP "A previous update backup exists at $INSTDIR.brown-update-backup. Restore that data before retrying this installation."
        SetErrorLevel 1
        Quit
      ${EndIf}
      StrCpy $brownStorageBackup "$INSTDIR.brown-update-backup"
      ClearErrors
      CreateDirectory "$brownStorageBackup"
      ${If} ${Errors}
        StrCpy $brownStorageBackup ""
        MessageBox MB_OK|MB_ICONSTOP "Brown cannot create a safe update backup beside $INSTDIR. Choose a writable installation folder and retry."
        SetErrorLevel 1
        Quit
      ${EndIf}
      !insertmacro BrownProtectItem "data"
      !insertmacro BrownProtectItem "models"
      !insertmacro BrownProtectItem "connectors"
      !insertmacro BrownProtectItem ".ultron-firstrun"
    ${EndIf}
  !endif
!macroend

!macro customInit
  ; Leave process coordination to electron-builder. Killing the app tree here
  ; can terminate the updater-launched installer itself.
!macroend

!macro customInstallMode
  ; Skip "Select Users" (All Users vs Current User) dialog and proceed directly to folder selection
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customInstall
  Call BrownRestoreStorage
  ; 1. Ensure any leftover stale shortcuts are purged before creating new ones
  Delete "$DESKTOP\Brown AI.lnk"
  Delete "$DESKTOP\Ultron AI.lnk"
  Delete "$PROFILE\Desktop\Brown AI.lnk"
  Delete "$PROFILE\Desktop\Ultron AI.lnk"
  Delete "$PROFILE\OneDrive\Desktop\Brown AI.lnk"
  Delete "$PROFILE\OneDrive\Desktop\Ultron AI.lnk"
  Delete "C:\Users\Public\Desktop\Brown AI.lnk"
  Delete "C:\Users\Public\Desktop\Ultron AI.lnk"

  ; 2. Set working directory to $INSTDIR for proper runtime context
  SetOutPath "$INSTDIR"

  ; Preserve existing onboarding and user data on upgrades.

  ; 3. Create fresh Desktop shortcut pointing directly to the newly installed executable
  CreateShortcut "$DESKTOP\Brown AI.lnk" "$INSTDIR\Brown AI.exe" "" "$INSTDIR\Brown AI.exe" 0 "" "" "Brown AI - Autonomous Local AI Agent"

  ; 4. If OneDrive Desktop exists, also create/sync the shortcut there
  IfFileExists "$PROFILE\OneDrive\Desktop" 0 +2
  CreateShortcut "$PROFILE\OneDrive\Desktop\Brown AI.lnk" "$INSTDIR\Brown AI.exe" "" "$INSTDIR\Brown AI.exe" 0 "" "" "Brown AI - Autonomous Local AI Agent"

  ; 5. Create fresh Start Menu shortcuts
  CreateDirectory "$SMPROGRAMS\Brown AI"
  CreateShortcut "$SMPROGRAMS\Brown AI\Brown AI.lnk" "$INSTDIR\Brown AI.exe" "" "$INSTDIR\Brown AI.exe" 0 "" "" "Brown AI - Autonomous Local AI Agent"
  CreateShortcut "$SMPROGRAMS\Brown AI\Uninstall Brown AI.lnk" "$INSTDIR\Uninstall Brown AI.exe" "" "$INSTDIR\Uninstall Brown AI.exe" 0
!macroend

!macro customUnInstall
  ; 2. Delete all desktop shortcuts
  Delete "$DESKTOP\Brown AI.lnk"
  Delete "$DESKTOP\Ultron AI.lnk"
  Delete "$PROFILE\Desktop\Brown AI.lnk"
  Delete "$PROFILE\Desktop\Ultron AI.lnk"
  Delete "$PROFILE\OneDrive\Desktop\Brown AI.lnk"
  Delete "$PROFILE\OneDrive\Desktop\Ultron AI.lnk"
  Delete "C:\Users\Public\Desktop\Brown AI.lnk"
  Delete "C:\Users\Public\Desktop\Ultron AI.lnk"

  ; 3. Delete Start Menu shortcuts and folder
  Delete "$SMPROGRAMS\Brown AI\Brown AI.lnk"
  Delete "$SMPROGRAMS\Brown AI\Uninstall Brown AI.lnk"
  Delete "$SMPROGRAMS\Brown AI.lnk"
  RMDir /r "$SMPROGRAMS\Brown AI"
  RMDir /r "$SMPROGRAMS\Ultron AI"
!macroend
