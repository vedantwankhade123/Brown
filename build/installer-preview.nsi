Unicode true
Name "Brown AI - design preview"
OutFile "..\output\Brown-Installer-Preview-v1.0.21.exe"
RequestExecutionLevel user
Icon "..\Assets\Brown.ico"
BrandingText "Brown AI"
InstallDir "$LOCALAPPDATA\Programs\Brown AI"
!include "MUI2.nsh"
!define MUI_ICON "..\Assets\Brown.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "..\Assets\installer\sidebar.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "..\Assets\installer\header.bmp"
!include "installer-ui.nsh"
!insertmacro customWelcomePage
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"
InstallButtonText "Preview"
Section
  DetailPrint "Design preview only - no application files, shortcuts or settings are installed."
  Sleep 1000
SectionEnd
