; Shared by the production installer and the non-installing preview harness.
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Welcome to Brown AI"
!define MUI_WELCOMEPAGE_TEXT "Your local AI workspace.$\r$\n$\r$\nInstall Brown to chat, write, work with documents and create with compatible local models.$\r$\n$\r$\nModels are set up inside the app. Download them once, then use them offline.$\r$\n$\r$\nChoose Next to continue."
!define MUI_DIRECTORYPAGE_TEXT_TOP "Choose where Brown AI will be installed. Keep this folder dedicated to Brown."
!define MUI_FINISHPAGE_TITLE "Brown AI is ready"
!define MUI_FINISHPAGE_TEXT "Installation is complete.$\r$\n$\r$\nOpen Brown to choose a local model and finish setup. Existing chats and downloaded models are kept during upgrades."
!define MUI_UNWELCOMEPAGE_TITLE "Uninstall Brown AI"
!define MUI_UNWELCOMEPAGE_TEXT "This removes the Brown AI application and its shortcuts.$\r$\n$\r$\nYour chats, models, connectors and settings are kept. You can reinstall Brown later to use them again.$\r$\n$\r$\nChoose Uninstall to continue, or Cancel to keep Brown."
!define MUI_UNFINISHPAGE_TITLE "Brown AI has been removed"
!define MUI_UNFINISHPAGE_TEXT "The application has been removed.$\r$\n$\r$\nYour saved data and models have been kept. This process does not uninstall Ollama or remove its shared model files."

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
