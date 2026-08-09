!macro customPageBeforeDirectory
  GetDlgItem $0 $HWNDPARENT 1
  EnableWindow $0 1
!macroend

!macro customPageAfterDirectory
  Push $R0
  StrCpy $R0 $INSTDIR "" -1
  ${If} $R0 == "\"
    StrCpy $INSTDIR "$INSTDIRUltron AI"
  ${ElseIf} $R0 == ":"
    StrCpy $INSTDIR "$INSTDIR\Ultron AI"
  ${ElseIf} $INSTDIR == "D:"
    StrCpy $INSTDIR "D:\Ultron AI"
  ${ElseIf} $INSTDIR == "D:\"
    StrCpy $INSTDIR "D:\Ultron AI"
  ${ElseIf} $INSTDIR == "C:"
    StrCpy $INSTDIR "C:\Ultron AI"
  ${ElseIf} $INSTDIR == "C:\"
    StrCpy $INSTDIR "C:\Ultron AI"
  ${EndIf}
  Pop $R0
!macroend
