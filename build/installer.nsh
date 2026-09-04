; ==============================================================================
; Brown AI NSIS Installer Hook Script
; Provides aggressive cleanup of stale processes & shortcuts, robust file replacement,
; and fresh shortcut creation for all Windows Desktop / OneDrive / Start Menu paths.
; ==============================================================================

!macro customInit
  ; 1. Terminate any running Brown/Ultron processes before installing so no files are locked
  nsExec::Exec 'taskkill /F /IM "Brown AI.exe" /IM "Brown.exe" /IM "Ultron AI.exe" /IM "Ultron.exe" /IM "electron.exe" /T'

  ; 2. Clean up user desktop shortcuts
  Delete "$DESKTOP\Brown AI.lnk"
  Delete "$DESKTOP\Brown.lnk"
  Delete "$DESKTOP\Ultron AI.lnk"
  Delete "$DESKTOP\Ultron.lnk"

  ; 3. Clean up user profile desktop and OneDrive desktop if redirected
  Delete "$PROFILE\Desktop\Brown AI.lnk"
  Delete "$PROFILE\Desktop\Brown.lnk"
  Delete "$PROFILE\Desktop\Ultron AI.lnk"
  Delete "$PROFILE\Desktop\Ultron.lnk"
  Delete "$PROFILE\OneDrive\Desktop\Brown AI.lnk"
  Delete "$PROFILE\OneDrive\Desktop\Brown.lnk"
  Delete "$PROFILE\OneDrive\Desktop\Ultron AI.lnk"
  Delete "$PROFILE\OneDrive\Desktop\Ultron.lnk"

  ; 4. Clean up public desktop shortcuts
  Delete "C:\Users\Public\Desktop\Brown AI.lnk"
  Delete "C:\Users\Public\Desktop\Brown.lnk"
  Delete "C:\Users\Public\Desktop\Ultron AI.lnk"
  Delete "C:\Users\Public\Desktop\Ultron.lnk"
  nsExec::Exec 'cmd /c del /f /q "C:\Users\Public\Desktop\Brown AI.lnk" "C:\Users\Public\Desktop\Ultron AI.lnk"'

  ; 5. Clean up Start Menu shortcuts
  Delete "$SMPROGRAMS\Brown AI.lnk"
  Delete "$SMPROGRAMS\Brown.lnk"
  Delete "$SMPROGRAMS\Brown AI\Brown AI.lnk"
  Delete "$SMPROGRAMS\Ultron AI.lnk"
  Delete "$SMPROGRAMS\Ultron.lnk"
  Delete "$SMPROGRAMS\Ultron AI\Ultron AI.lnk"
!macroend

!macro customInstallMode
  ; Skip "Select Users" (All Users vs Current User) dialog and proceed directly to folder selection
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customInstall
  ; 1. Ensure any leftover stale shortcuts are purged before creating new ones
  Delete "$DESKTOP\Brown AI.lnk"
  Delete "$DESKTOP\Ultron AI.lnk"
  Delete "$PROFILE\Desktop\Brown AI.lnk"
  Delete "$PROFILE\Desktop\Ultron AI.lnk"
  Delete "$PROFILE\OneDrive\Desktop\Brown AI.lnk"
  Delete "$PROFILE\OneDrive\Desktop\Ultron AI.lnk"
  Delete "C:\Users\Public\Desktop\Brown AI.lnk"
  Delete "C:\Users\Public\Desktop\Ultron AI.lnk"
  nsExec::Exec 'cmd /c del /f /q "C:\Users\Public\Desktop\Brown AI.lnk" "C:\Users\Public\Desktop\Ultron AI.lnk"'

  ; 2. Set working directory to $INSTDIR for proper runtime context
  SetOutPath "$INSTDIR"

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
  ; 1. Terminate running instances
  nsExec::Exec 'taskkill /F /IM "Brown AI.exe" /IM "Brown.exe" /IM "Ultron AI.exe" /IM "Ultron.exe" /IM "electron.exe" /T'

  ; 2. Delete all desktop shortcuts
  Delete "$DESKTOP\Brown AI.lnk"
  Delete "$DESKTOP\Ultron AI.lnk"
  Delete "$PROFILE\Desktop\Brown AI.lnk"
  Delete "$PROFILE\Desktop\Ultron AI.lnk"
  Delete "$PROFILE\OneDrive\Desktop\Brown AI.lnk"
  Delete "$PROFILE\OneDrive\Desktop\Ultron AI.lnk"
  Delete "C:\Users\Public\Desktop\Brown AI.lnk"
  Delete "C:\Users\Public\Desktop\Ultron AI.lnk"
  nsExec::Exec 'cmd /c del /f /q "C:\Users\Public\Desktop\Brown AI.lnk" "C:\Users\Public\Desktop\Ultron AI.lnk"'

  ; 3. Delete Start Menu shortcuts and folder
  Delete "$SMPROGRAMS\Brown AI\Brown AI.lnk"
  Delete "$SMPROGRAMS\Brown AI\Uninstall Brown AI.lnk"
  Delete "$SMPROGRAMS\Brown AI.lnk"
  RMDir /r "$SMPROGRAMS\Brown AI"
  RMDir /r "$SMPROGRAMS\Ultron AI"
!macroend
