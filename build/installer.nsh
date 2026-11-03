; ==============================================================================
; Brown AI NSIS Installer Hook Script
; Preserve install-relative storage while replacing application binaries.
; ==============================================================================

!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "getProcessInfo.nsh"
!include "${BUILD_RESOURCES_DIR}\installer-ui.nsh"
Var pid

!ifndef BUILD_UNINSTALLER
Var brownStorageBackup

!macro BrownRestoreItem ITEM
  ${If} ${FileExists} "$brownStorageBackup\${ITEM}"
    ClearErrors
    Rename "$brownStorageBackup\${ITEM}" "$INSTDIR\${ITEM}"
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONSTOP "Your saved data is safe in $brownStorageBackup. Restore ${ITEM} to $INSTDIR before opening Brown." /SD IDOK
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
      MessageBox MB_OK|MB_ICONSTOP "Brown could not protect its saved data. Close programs using files in $INSTDIR and try again. Your existing installation has not been removed." /SD IDOK
      SetErrorLevel 1
      Quit
    ${EndIf}
  ${EndIf}
!macroend

Function .onGUIEnd
  Call BrownRestoreStorage
FunctionEnd

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
        MessageBox MB_OK|MB_ICONSTOP "A previous update backup exists at $INSTDIR.brown-update-backup. Restore that data before retrying this installation." /SD IDOK
        SetErrorLevel 1
        Quit
      ${EndIf}
      StrCpy $brownStorageBackup "$INSTDIR.brown-update-backup"
      ClearErrors
      CreateDirectory "$brownStorageBackup"
      ${If} ${Errors}
        StrCpy $brownStorageBackup ""
        MessageBox MB_OK|MB_ICONSTOP "Brown cannot create a safe update backup beside $INSTDIR. Choose a writable installation folder and retry." /SD IDOK
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
  SetOutPath "$INSTDIR"
  ; electron-builder owns shortcut creation and respects user preferences.
!macroend

!macro customRemoveFiles
  ; Remove only application-owned files. Never recursively remove INSTDIR:
  ; install-relative chats/models and unrelated files must survive uninstall.
  ${GetRoot} "$INSTDIR" $R0
  ${If} $INSTDIR == $R0
    Abort "Brown cannot uninstall from a drive root."
  ${EndIf}
  ClearErrors
  Delete "$INSTDIR\Brown AI.exe"
  ${If} ${Errors}
    Abort "Close Brown AI and retry uninstalling. Your saved data has not been removed."
  ${EndIf}
  StrCpy $R1 "0"
  !insertmacro BrownDeleteBinary "chrome_100_percent.pak"
  !insertmacro BrownDeleteBinary "chrome_200_percent.pak"
  !insertmacro BrownDeleteBinary "d3dcompiler_47.dll"
  !insertmacro BrownDeleteBinary "ffmpeg.dll"
  !insertmacro BrownDeleteBinary "icudtl.dat"
  !insertmacro BrownDeleteBinary "libEGL.dll"
  !insertmacro BrownDeleteBinary "libGLESv2.dll"
  !insertmacro BrownDeleteBinary "resources.pak"
  !insertmacro BrownDeleteBinary "snapshot_blob.bin"
  !insertmacro BrownDeleteBinary "v8_context_snapshot.bin"
  !insertmacro BrownDeleteBinary "vk_swiftshader.dll"
  !insertmacro BrownDeleteBinary "vk_swiftshader_icd.json"
  !insertmacro BrownDeleteBinary "vulkan-1.dll"
  !insertmacro BrownDeleteBinary "LICENSE.electron.txt"
  !insertmacro BrownDeleteBinary "LICENSES.chromium.html"
  !insertmacro BrownDeleteBinary "uninstallerIcon.ico"
  RMDir /r "$INSTDIR\locales"
  ${If} ${FileExists} "$INSTDIR\locales"
    StrCpy $R1 "1"
  ${EndIf}
  !insertmacro BrownDeleteBinary "resources\app.asar"
  RMDir /r "$INSTDIR\resources\app.asar.unpacked"
  ${If} ${FileExists} "$INSTDIR\resources\app.asar.unpacked"
    StrCpy $R1 "1"
  ${EndIf}
  ${If} $R1 == "1"
    SetErrorLevel 1
    Abort "Some Brown application files are in use. Close Brown and retry. Saved data is kept."
  ${EndIf}
  RMDir "$INSTDIR\resources"
  Delete "$INSTDIR\Uninstall Brown AI.exe"
  ; Non-empty folders (including saved data) remain in place.
  RMDir "$INSTDIR"
!macroend

!macro BrownDeleteBinary NAME
  ClearErrors
  Delete "$INSTDIR\${NAME}"
  ${If} ${Errors}
    StrCpy $R1 "1"
  ${EndIf}
!macroend

!macro customUnInstall
  ; Remove obsolete known shortcuts without deleting user-added menu entries.
  Delete "$DESKTOP\Ultron AI.lnk"
  Delete "$SMPROGRAMS\Brown AI\Uninstall Brown AI.lnk"
  RMDir "$SMPROGRAMS\Brown AI"
  RMDir "$SMPROGRAMS\Ultron AI"
!macroend
