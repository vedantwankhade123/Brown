# 🚀 Ultron Windows Installer & Distribution Guide

This guide explains how to package, build, and distribute **Ultron AI Agent** as a professional Windows downloadable installer (`.exe`) with installation wizard steps, custom directory selection, desktop shortcuts, Start Menu integration, and Control Panel uninstaller management.

---

## 🛠️ Step 1: Prerequisites

Make sure you have Node.js and NPM installed on your machine. All required packaging tools have already been pre-configured in your `package.json`.

---

## 📦 Step 2: Build the Downloadable Windows Installer

Run the following command in your terminal inside the `d:\Ultron` folder:

```bash
# Install packaging tools (if not already installed)
npm install --save-dev electron-builder

# Compile and package downloadable Windows Installer (.exe)
npm run dist
```

---

## 📂 Output Artifacts Created

After running `npm run dist`, `electron-builder` will generate a `dist/` folder containing:

| File Name | Description |
| :--- | :--- |
| **`Ultron AI Agent Setup 1.0.0.exe`** | **Guided NSIS Windows Installer**. This is the file you distribute to users. When double-clicked, it launches the official Windows Setup Wizard. |
| **`Ultron AI Agent 1.0.0.exe`** | **Portable Standalone Executable**. A single `.exe` file that runs instantly without installation. |

---

## 🧙‍♂️ Setup Wizard Features Configured

The generated **`Ultron AI Agent Setup 1.0.0.exe`** is optimized for a fast, reliable Windows installation experience (`perMachine: true`):

1. **Direct Elevation & Guided Setup (`oneClick: false`, `perMachine: true`)**:
   - Prompts for Windows UAC permissions right at launch, avoiding UAC elevation hangs.
   - Omits the problematic multi-user choice screen, preventing installer freeze issues.
   - Shows clean welcome & directory selection dialogs (`C:\Program Files\Ultron AI Agent` or custom path).
2. **Desktop & Start Menu Shortcuts**:
   - Automatically creates a desktop icon and a Start Menu folder for Ultron.
3. **Control Panel Uninstaller Management**:
   - Registers Ultron into **Windows Settings > Installed Apps** / **Control Panel > Add or Remove Programs**.
   - Includes a clean `Uninstall Ultron AI Agent.exe` uninstaller script.

---

## 🔐 Step 3: Windows Code Signing & SmartScreen (Optional for Production)

To prevent Windows Defender / SmartScreen from showing *"Unknown Publisher"* warning popups when users download your `.exe`:

1. Acquire an EV or OV Code Signing Certificate (from Sectigo, DigiCert, or Certum).
2. Set environment variables before building:
   ```powershell
   $env:CSC_LINK="C:\path\to\your\certificate.pfx"
   $env:CSC_KEY_PASSWORD="your-certificate-password"
   npm run dist
   ```

---

## 🔄 Step 4: Auto-Updates Integration (Optional)

To enable automatic background updates for users whenever you release a new version on GitHub:

1. Install `electron-updater`:
   ```bash
   npm install electron-updater
   ```
2. In `src/main/index.js`, add:
   ```javascript
   const { autoUpdater } = require('electron-updater');
   app.on('ready', () => {
     autoUpdater.checkForUpdatesAndNotify();
   });
   ```
3. Add repository details to `package.json`:
   ```json
   "build": {
     "publish": [{ "provider": "github", "owner": "your-username", "repo": "Ultron" }]
   }
   ```

---

## 🎯 Summary Command Quick Sheet

```bash
# Build setup installer for distribution
npm run dist
```
Distribution ready files will be located at:
`d:\Ultron\dist\Ultron AI Agent Setup 1.0.0.exe`
