# 📁 Ultron AI Agent: Executable, Setup & Folder Structure Deep-Dive

This document provides a comprehensive, highly detailed breakdown of how **Ultron AI Agent** installs, runs, and manages data on a Windows machine.

---

## 🛠️ 1. Distribution Executable Types

When you run `npm run dist`, `electron-builder` packages Ultron into two distinct Windows executable formats located in `d:\Ultron\dist`:

### **A. Guided Windows Setup Installer (`Ultron AI Agent Setup 1.0.0.exe`)**
- **Type**: Standard NSIS Windows Installer Wizard.
- **Use Case**: Recommended for end-user distribution.
- **Features**:
  - Interactive welcome screen.
  - Custom installation folder selection.
  - Automatically creates Desktop and Start Menu shortcuts.
  - Registers Ultron into **Windows Settings > Installed Apps** / **Control Panel > Add or Remove Programs** with a clean uninstaller script (`Uninstall Ultron AI Agent.exe`).

### **B. Standalone Portable Executable (`Ultron AI Agent 1.0.0.exe`)**
- **Type**: Single self-contained binary.
- **Use Case**: For USB drives or running without administrative privileges.
- **Features**: Requires zero installation steps — double-click and run instantly.

---

## 📂 2. Where Installation & Application Files are Stored

### **A. Program Installation Directory (App Binaries & Assets)**
When a user installs Ultron via `Ultron AI Agent Setup 1.0.0.exe`, the core software binaries, Electron runtime, and compiled frontend assets are placed in:

```
C:\Program Files\Ultron AI Agent\
├── Ultron AI Agent.exe          # Main application executable
├── chrome_100_percent.pak        # Chromium rendering engine asset
├── resources/
│   └── app.asar                  # Encrypted/packaged app code (src/, Assets/, package.json)
├── v8_context_snapshot.bin       # V8 JavaScript JIT engine snapshot
├── ffmpeg.dll                    # Audio/Video codec library
├── Uninstall Ultron AI Agent.exe # Uninstaller executable
```
*(If installed for the current user only, the path is `C:\Users\<Username>\AppData\Local\Programs\Ultron AI Agent\`)*

---

### **B. Application Data & Persistent Memory Location**
All persistent conversation histories, learned task memories, custom configurations, and logs created by Ultron are saved in:

```
C:\Users\<Username>\AppData\Roaming\ultron\
├── Local Storage/                # Saved API keys, theme settings, authorized apps list
├── Session Storage/              # Active chat session state
├── conversations_store.json      # Persistent conversation threads & history
├── learned_memory.json           # Self-learning task execution memory
└── logs/                         # App execution logs and trace outputs
```
> 💡 *Note: Users can customize or relocate this storage folder at any time from **Settings > Storage & Memory**.*

---

### **C. Local Ollama AI Models Location**
When using local offline models (e.g. `llama3`, `mistral`, `qwen`), Ollama stores downloaded model weights in:

```
C:\Users\<Username>\.ollama\models\
├── manifests/                    # Model tags and metadata
└── blobs/                        # GGUF quantized model weight binaries
```

---

## 🖥️ 3. Windows Shortcuts & Registry Integration

### **A. Desktop Shortcut**
```
C:\Users\<Username>\Desktop\Ultron AI Agent.lnk
```

### **B. Start Menu Programs Folder**
```
C:\Users\<Username>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Ultron AI Agent\
├── Ultron AI Agent.lnk
└── Uninstall Ultron AI Agent.lnk
```

### **C. Windows Add/Remove Programs Registry Key**
```
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.ultron.desktop
```
- **DisplayName**: Ultron AI Agent
- **DisplayVersion**: 1.0.0
- **Publisher**: Vedant Wankhade
- **UninstallString**: `"C:\Program Files\Ultron AI Agent\Uninstall Ultron AI Agent.exe"`

---

## ⚙️ 4. Runtime Architecture & Security

When **`Ultron AI Agent.exe`** is launched:

1. **Main Process (`src/main/index.js`)**:
   - Initializes the Electron window (`BrowserWindow`).
   - Registers IPC handlers (`src/main/ipc.js`) for hardware profiling, web search, system diagnostics, and file operations.
   - Configures native microphone permissions (`media`, `audioCapture`).

2. **Preload Security Bridge (`src/preload/preload.js`)**:
   - Exposes safe `window.ultronAPI` methods to the UI layer using `contextBridge.exposeInMainWorld`.
   - Prevents unsafe direct Node.js access from web scripts.

3. **Renderer UI Engine (`src/renderer/renderer.js`)**:
   - Renders the dark glassmorphic UI, voice audio visualizer, chat streams, and settings configuration panel.
   - Queries Google Gemini 3.0 Cloud API or local Ollama REST endpoints (`http://127.0.0.1:11434`).

---

## 🧹 5. How Uninstallation Works

When a user uninstalls Ultron via **Control Panel > Add or Remove Programs**:
1. It runs `Uninstall Ultron AI Agent.exe`.
2. Removes all binary files from `C:\Program Files\Ultron AI Agent`.
3. Deletes Desktop and Start Menu shortcuts.
4. Removes the Windows Registry uninstall entries.
5. User conversation data in `AppData\Roaming\ultron` is preserved unless manually deleted, ensuring zero accidental data loss.

---

## 🛡️ 6. Troubleshooting Common Installation & Startup Issues

### **A. "Windows protected your PC" (SmartScreen Warning)**
- **Why it occurs**: Windows Defender SmartScreen blocks unrecognized `.exe` files created without a purchased digital Code Signing Certificate (EV/Authenticode).
- **User Solution**: Click **"More info"** on the SmartScreen dialog, then click **"Run anyway"**.
- **Developer Solution**: To eliminate this warning permanently, sign the output executable in `package.json` / `electron-builder` using a valid digital certificate (`CSC_LINK` environment variable).

### **B. Executable Unable to Launch / Fails to Open After Installation**
- **Root Cause Fixed**: Previously, `src/main/index.js` attempted to create a writable directory inside `app.getAppPath()` (`C:\Program Files\Ultron AI Agent\resources\app.asar\memory`), throwing an unhandled `ENOTDIR` / `EACCES` exception on app startup.
- **Fix Applied**: `initializeDataDirectories()` and `get-default-data-dir` now strictly use `app.getPath('userData')` (`%LOCALAPPDATA%\UltronData\memory`), wrapped in safe error fallback handlers so the window always opens cleanly.

### **C. Retrieving Old Chats on Fresh Installations**
- **Root Cause Fixed**: Dev test sessions in `memory/conversations.json` were previously tracked in Git or referenced globally via `%APPDATA%\LocalAgent\config.json`.
- **Fix Applied**: `conversations.json` has been reset to clean `{}` and added to `.gitignore`. New installations automatically spin up a fresh, isolated conversation state without loading developer/test chat logs.
