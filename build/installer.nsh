; ==============================================================================
; Ultron AI NSIS Installer Hook Script
; Provides aggressive cleanup of stale processes & shortcuts, robust file replacement,
; and fresh shortcut creation for all Windows Desktop / OneDrive / Start Menu paths.
; ==============================================================================

!macro customInit
  ; 1. Terminate any running Ultron processes before installing so no files are locked
  nsExec::Exec 'taskkill /F /IM "Ultron AI.exe" /IM "Ultron.exe" /IM "electron.exe" /T'

  ; 2. Clean up user desktop shortcuts
  Delete "$DESKTOP\Ultron AI.lnk"
  Delete "$DESKTOP\Ultron.lnk"

  ; 3. Clean up user profile desktop and OneDrive desktop if redirected
  Delete "$PROFILE\Desktop\Ultron AI.lnk"
  Delete "$PROFILE\Desktop\Ultron.lnk"
  Delete "$PROFILE\OneDrive\Desktop\Ultron AI.lnk"
  Delete "$PROFILE\OneDrive\Desktop\Ultron.lnk"

  ; 4. Clean up public desktop shortcuts
  Delete "C:\Users\Public\Desktop\Ultron AI.lnk"
  Delete "C:\Users\Public\Desktop\Ultron.lnk"
  nsExec::Exec 'cmd /c del /f /q "C:\Users\Public\Desktop\Ultron AI.lnk" "C:\Users\Public\Desktop\Ultron.lnk"'

  ; 5. Clean up Start Menu shortcuts
  Delete "$SMPROGRAMS\Ultron AI.lnk"
  Delete "$SMPROGRAMS\Ultron.lnk"
  Delete "$SMPROGRAMS\Ultron AI\Ultron AI.lnk"
  Delete "$SMPROGRAMS\Ultron AI\Ultron.lnk"
!macroend

!macro customInstall
  ; 1. Ensure any leftover stale shortcuts are purged before creating new ones
  Delete "$DESKTOP\Ultron AI.lnk"
  Delete "$DESKTOP\Ultron.lnk"
  Delete "$PROFILE\Desktop\Ultron AI.lnk"
  Delete "$PROFILE\Desktop\Ultron.lnk"
  Delete "$PROFILE\OneDrive\Desktop\Ultron AI.lnk"
  Delete "$PROFILE\OneDrive\Desktop\Ultron.lnk"
  Delete "C:\Users\Public\Desktop\Ultron AI.lnk"
  Delete "C:\Users\Public\Desktop\Ultron.lnk"
  nsExec::Exec 'cmd /c del /f /q "C:\Users\Public\Desktop\Ultron AI.lnk" "C:\Users\Public\Desktop\Ultron.lnk"'

  ; 2. Set working directory to $INSTDIR for proper runtime context
  SetOutPath "$INSTDIR"

  ; 3. Create fresh Desktop shortcut pointing directly to the newly installed executable
  CreateShortcut "$DESKTOP\Ultron AI.lnk" "$INSTDIR\Ultron AI.exe" "" "$INSTDIR\Ultron AI.exe" 0 "" "" "Ultron AI - Autonomous Local AI Agent"

  ; 4. If OneDrive Desktop exists, also create/sync the shortcut there
  IfFileExists "$PROFILE\OneDrive\Desktop" 0 +2
  CreateShortcut "$PROFILE\OneDrive\Desktop\Ultron AI.lnk" "$INSTDIR\Ultron AI.exe" "" "$INSTDIR\Ultron AI.exe" 0 "" "" "Ultron AI - Autonomous Local AI Agent"

  ; 5. Create fresh Start Menu shortcuts
  CreateDirectory "$SMPROGRAMS\Ultron AI"
  CreateShortcut "$SMPROGRAMS\Ultron AI\Ultron AI.lnk" "$INSTDIR\Ultron AI.exe" "" "$INSTDIR\Ultron AI.exe" 0 "" "" "Ultron AI - Autonomous Local AI Agent"
  CreateShortcut "$SMPROGRAMS\Ultron AI\Uninstall Ultron AI.lnk" "$INSTDIR\Uninstall Ultron AI.exe" "" "$INSTDIR\Uninstall Ultron AI.exe" 0
!macroend

!macro customUnInstall
  ; 1. Terminate running instances
  nsExec::Exec 'taskkill /F /IM "Ultron AI.exe" /IM "Ultron.exe" /IM "electron.exe" /T'

  ; 2. Delete all desktop shortcuts
  Delete "$DESKTOP\Ultron AI.lnk"
  Delete "$DESKTOP\Ultron.lnk"
  Delete "$PROFILE\Desktop\Ultron AI.lnk"
  Delete "$PROFILE\Desktop\Ultron.lnk"
  Delete "$PROFILE\OneDrive\Desktop\Ultron AI.lnk"
  Delete "$PROFILE\OneDrive\Desktop\Ultron.lnk"
  Delete "C:\Users\Public\Desktop\Ultron AI.lnk"
  Delete "C:\Users\Public\Desktop\Ultron.lnk"
  nsExec::Exec 'cmd /c del /f /q "C:\Users\Public\Desktop\Ultron AI.lnk" "C:\Users\Public\Desktop\Ultron.lnk"'

  ; 3. Delete Start Menu shortcuts and folder
  Delete "$SMPROGRAMS\Ultron AI\Ultron AI.lnk"
  Delete "$SMPROGRAMS\Ultron AI\Uninstall Ultron AI.lnk"
  Delete "$SMPROGRAMS\Ultron AI.lnk"
  RMDir /r "$SMPROGRAMS\Ultron AI"
!macroend
