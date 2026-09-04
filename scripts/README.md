# Ultron Scripts & Automation Tooling

This directory contains build, graphics generation, voice testing, and maintenance automation scripts for the Ultron monorepo.

---

## 📁 Directory Structure

```
scripts/
├── build/
│   ├── generate-installer-graphics.py   # Generates NSIS installer sidebar and header bitmaps
│   └── regenerate-splash.py             # Regenerates high-DPI splash and branding screens
├── voice/
│   ├── windows-stt-transcribe.ps1       # Native Windows.Media.SpeechRecognition PowerShell harness
│   └── test-whisper.js                  # Node.js Whisper STT engine test harness
└── archive/
    ├── fix-file-regex.js                # Migration utility for regex cleanup
    └── fix-regex-again.js               # Secondary regex migration utility
```

---

## 🛠️ Usage

### Build & Graphics
- **Generate NSIS Installer Bitmaps**:
  ```bash
  python scripts/build/generate-installer-graphics.py
  ```
- **Regenerate Splash Screen Assets**:
  ```bash
  python scripts/build/regenerate-splash.py
  ```

### Voice & Speech-To-Text
- **Run Windows Native STT Harness**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/voice/windows-stt-transcribe.ps1
  ```
- **Test Whisper Local Transcriber**:
  ```bash
  node scripts/voice/test-whisper.js
  ```
