# Brown AI — Autonomous Local-First Windows AI Agent

[![Website](https://img.shields.io/badge/Website-usebrown.online-7928CA?logo=vercel&logoColor=white)](https://usebrown.online/)
[![Release](https://img.shields.io/badge/Release-v1.0.2-0078D4?logo=github)](https://github.com/vedantwankhade123/Brown/releases/latest)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011%20(x64)-0078D4?logo=windows)](https://github.com/vedantwankhade123/Brown/releases)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)

<p align="center">
  <a href="https://usebrown.online/">
    <img src="Assets/Brown-black.png" alt="Brown AI Logo" width="160" />
  </a>
</p>

<p align="center">
  <strong><a href="https://usebrown.online/">usebrown.online</a></strong> — Official website with setup guides, docs, and direct downloads.
</p>

**Brown AI** is an autonomous, privacy-first, local-first artificial intelligence assistant engineered exclusively for **Windows** and **Android**. Powered by local on-device quantized LLMs (via Ollama, GGUF, and Hugging Face) and optional hybrid cloud intelligence (Gemini 2.5/3, Claude 3.7, DeepSeek R1, OpenAI), Brown executes system workflows, local code execution, document analysis, voice synthesis, and desktop orchestration with zero mandatory cloud telemetry.

> **Note on Platform Support**: Brown AI is designed and optimized strictly for **Windows (Windows 10 & 11, 64-bit)** and **Android (Android 10+)**. macOS, iOS, or other platforms are not supported.

---

## ⚡ Core Capabilities

- **🔒 100% Offline & Private**: Chat history, vector indices, and inference prompts stay strictly local on your silicon.
- **🧠 Autonomous Decision Engine**: Multi-step task planner (Analyze → Plan → Execute → Reflect), tool decomposition, and loop guard.
- **🎛️ Dynamic Performance Controls**: Switch between **Auto Adaptive**, **GPU Priority** (maximum VRAM offload), and **CPU Only** for power-efficient conversation.
- **🎙️ Sovereign Neural Voice**: Local Whisper STT and offline Kokoro TTS for ultra-low latency voice interaction without cloud endpoints.
- **📂 Local Knowledge RAG**: Ingest PDFs, markdown, and local files with hybrid BM25 + dense vector semantic retrieval.
- **📱 Companion Mobile Sync**: Pair securely with Brown Mobile (Android) over local Wi-Fi using PIN verification to sync sessions across devices.
- **🎨 Modern Dark & Light Theming**: High-contrast, accessibility-focused cyberpunk dark mode and refined daylight theme.

---

## 💾 Downloads & Installation

Official pre-compiled binaries are published in their respective repositories. The download links below use stable `latest` aliases, so they always resolve to the newest release:

| Build Type | Download | Platform | Description |
| :--- | :--- | :--- | :--- |
| **Setup Installer** | [`Brown-AI-Setup.exe`](https://github.com/vedantwankhade123/Brown/releases/latest/download/Brown-AI-Setup.exe) | Windows 10 / 11 (x64) | Guided installer with Start Menu & Desktop shortcuts. Auto-updates in place. |
| **Portable Binary** | [`Brown-AI-Portable.exe`](https://github.com/vedantwankhade123/Brown/releases/latest/download/Brown-AI-Portable.exe) | Windows 10 / 11 (x64) | Standalone executable. Runs immediately without installation. |
| **Android APK** | [`Brown-AI-Mobile.apk`](https://github.com/vedantwankhade123/Brown-Mobile/releases/latest/download/Brown-AI-Mobile.apk) | Android 10+ (arm64-v8a) | Direct APK install for phones and tablets. |

> **First launch**: binaries are not Authenticode-signed yet, so Windows SmartScreen may show *"Windows protected your PC"* — click **More info → Run anyway**. Android will warn about an unknown-source app; allow it for this installer only.

---

## 🔄 Release Pipeline

There is no CI. Every artifact is built, installed and tested on this machine first, then tagged
and published to GitHub Releases — which is what the website download buttons and the in-app
updater read.

| Step | Command |
| :--- | :--- |
| Bump, test, build, stage assets | `npm run release:desktop -- --version 1.0.3` |
| Install the staged `dist/Brown-AI-Setup.exe`, use it, confirm it works | by hand |
| Commit the version bump | `git commit -am "chore(release): v1.0.3"` |
| Tag, push the tag, publish the release | `npm run publish:desktop` |

[`scripts/release-desktop.js`](scripts/release-desktop.js) uploads a fixed set of asset names,
because those names are live links: `Brown-AI-Setup.exe` and `Brown-AI-Portable.exe` (the
version-free aliases the download page uses), `Brown-AI-Setup-vX.Y.Z.exe`, `Brown-AI-vX.Y.Z.exe`,
plus `latest.yml` for the auto-updater. Drop a `.release-notes-vX.Y.Z.md` in the repo to control the
release notes; without it the script drafts them from `git log` for you to edit before publishing.

The Android app follows the same shape in [`mobile/`](mobile) with `npm run release:apk` and
`npm run publish:apk`. After an APK release, commit the updated `mobile` submodule pointer here.

Publishing needs an authenticated `gh` (`gh auth status`); `--publish` refuses to run if the version
bump is not committed, so a tag never points at a build that cannot be reproduced.

---

## 🏛️ Monorepo Architecture

```
d:/Ultron/
├── src/                          # 🖥️ Windows Desktop Electron Application
│   ├── agent/                    # Autonomous agent engine, planner, memory & context
│   ├── main/                     # Electron main process, IPC handlers, RAG & hardware
│   ├── preload/                  # Secure IPC preload bridge
│   └── renderer/                 # Responsive UI, Chat UI, Visual Engine & Artifacts
├── mobile/                       # 📱 Mobile Companion App (React Native / Android)
├── brown-website/                # 🌐 Official Product Website (React / Vite)
├── python/                       # 🐍 Local Python Microservice (Inference & Scraping)
├── Assets/                       # 🎨 Brand Assets, Vector Logos & App Icons
├── docs/                         # 📚 System Architecture, PRD & Release Notes
├── scripts/                      # 🛠️ Build, Release, and Automation Utilities
└── tests/                        # 🧪 Desktop Automated Verification Test Suite
```

---

## 🚀 Developer Quick Start

### Prerequisites
- **Node.js**: v20 or v22 LTS
- **npm**: v10+
- **Local LLM Runner (Optional for offline)**: [Ollama](https://ollama.com/) or LM Studio

### Installation & Execution
```bash
# Clone the repository
git clone https://github.com/vedantwankhade123/Brown.git
cd Brown

# Install desktop dependencies
npm install

# Run automated tests
npm test

# Launch desktop app in development mode
npm start

# Package Windows NSIS installer and portable binary
npm run build:win
```

---

## 🧪 Testing & Validation

```bash
# Run security, agent loop, RAG, and platform test suites
npm test

# Verify agent context engine and entity tracking
node tests/verify-agent-pipeline.js
node tests/verify-context-platform.test.js
```

---

## 📚 Documentation Hub

- **[System Architecture](docs/architecture/SYSTEM_ARCHITECTURE.md)**: Multi-process topology, security sandbox, and model connectors.
- **[Technical Specifications](docs/architecture/DOCUMENTATION.md)**: IPC protocol, Kokoro TTS, Whisper STT, and sync specifications.
- **[Release Notes](docs/releases/RELEASE_NOTES.md)**: Detailed changelog of all desktop and mobile releases.

---

## 👨‍💻 Developer & Ownership

- **Lead Architect & Developer**: **Vedant Wankhade** (Full Stack Developer)
- **Portfolio**: [https://vedantwankhade.netlify.app/](https://vedantwankhade.netlify.app/)
- **LinkedIn**: [https://www.linkedin.com/in/vedant-wankhade123](https://www.linkedin.com/in/vedant-wankhade123)
- **GitHub Profile**: [https://github.com/vedantwankhade123](https://github.com/vedantwankhade123)
- **Email**: `vedantwankhade47@gmail.com`

---

## 📄 License & Intellectual Property

Brown AI and its applications are **Proprietary & Confidential Software**. All Rights Reserved.

- Copyright (c) 2026 Vedant Wankhade.
- Website: [https://usebrown.online](https://usebrown.online)
- Official Support & Inquiries: `contact@usebrown.online`
