!macro customInit
  ; Terminate any running Ultron processes before installing so no files are locked
  nsExec::Exec 'taskkill /F /IM "Ultron AI.exe" /IM "Ultron.exe" /T'

  ; Clean up user desktop shortcut
  Delete "$DESKTOP\Ultron AI.lnk"
  Delete "$DESKTOP\Ultron.lnk"

  ; Clean up public desktop shortcut safely via cmd to avoid NSIS variable compilation errors
  nsExec::Exec 'cmd /c del /f /q "C:\Users\Public\Desktop\Ultron AI.lnk" "C:\Users\Public\Desktop\Ultron.lnk"'
!macroend

!macro customInstall
  ; Clean any leftover shortcuts before writing the fresh one
  Delete "$DESKTOP\Ultron AI.lnk"
  Delete "$DESKTOP\Ultron.lnk"
  nsExec::Exec 'cmd /c del /f /q "C:\Users\Public\Desktop\Ultron AI.lnk" "C:\Users\Public\Desktop\Ultron.lnk"'

  ; Create fresh Desktop shortcut pointing directly to the installed executable
  CreateShortcut "$DESKTOP\Ultron AI.lnk" "$INSTDIR\Ultron AI.exe" "" "$INSTDIR\Ultron AI.exe" 0
!macroend

!macro customUnInstall
  Delete "$DESKTOP\Ultron AI.lnk"
  Delete "$DESKTOP\Ultron.lnk"
  nsExec::Exec 'cmd /c del /f /q "C:\Users\Public\Desktop\Ultron AI.lnk" "C:\Users\Public\Desktop\Ultron.lnk"'
!macroend
