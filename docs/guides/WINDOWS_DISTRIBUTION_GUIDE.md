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

## 🔄 Step 4: Free GitHub Releases Auto-Updates

Ultron is pre-configured with `electron-updater` to check for new releases hosted on GitHub Releases (`vedantwankhade123/Ultron`) 10 seconds after launch.

### How to Publish a New Update (100% Free)
When you build new features and want to push an update to all installed users:

1. **Bump version in `package.json`**:
   Change `"version": "1.0.1"` (or `"1.1.0"`).
2. **Publish Release to GitHub**:
   Set your GitHub Personal Access Token (`GH_TOKEN`) and run `electron-builder`:
   ```powershell
   $env:GH_TOKEN="your_github_personal_access_token"
   npx electron-builder --win --publish always
   ```
3. `electron-builder` will build the new installer and automatically upload `Ultron AI Agent Setup 1.0.1.exe` and `latest.yml` to GitHub Releases.
4. When users open Ultron, it will detect the update and prompt them to download and install it!


---

## 🎯 Summary Command Quick Sheet

```bash
# Build setup installer (.exe) for direct web distribution
npm run dist

# Build Microsoft Store installer package (.appx / .msix)
npm run build:store
```
Distribution ready files will be located at:
- `d:\Ultron\dist\Ultron AI Agent Setup 1.0.0.exe` (Web Installer)
- `d:\Ultron\dist\Ultron AI 1.0.0.appx` (Microsoft Store Package)

> For full Microsoft Store setup and submission steps, see [MICROSOFT_STORE_GUIDE.md](file:///d:/Ultron/MICROSOFT_STORE_GUIDE.md).
