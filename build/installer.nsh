!macro customInit
  ; Close any running Ultron processes before installing so files are never locked
  nsExec::Exec 'taskkill /F /IM "Ultron AI.exe" /IM "Ultron.exe" /T'

  ; Clean up any stale public and user desktop shortcuts from older versions
  Delete "$COMMONDESKTOP\Ultron AI.lnk"
  Delete "$COMMONDESKTOP\Ultron.lnk"
  Delete "$DESKTOP\Ultron.lnk"
!macroend

!macro customInstall
  ; Remove any lingering stale shortcuts before creating fresh one
  Delete "$COMMONDESKTOP\Ultron AI.lnk"
  Delete "$COMMONDESKTOP\Ultron.lnk"
  Delete "$DESKTOP\Ultron.lnk"

  ; Create fresh Desktop shortcut pointing directly to the newly installed binary
  CreateShortcut "$DESKTOP\Ultron AI.lnk" "$INSTDIR\Ultron AI.exe" "" "$INSTDIR\Ultron AI.exe" 0
!macroend

!macro customUnInstall
  Delete "$DESKTOP\Ultron AI.lnk"
  Delete "$COMMONDESKTOP\Ultron AI.lnk"
  Delete "$DESKTOP\Ultron.lnk"
  Delete "$COMMONDESKTOP\Ultron.lnk"
!macroend
