# Brown AI — Autonomous Local-First Windows AI Agent

[![Website](https://img.shields.io/badge/Website-usebrown.online-7928CA?logo=vercel&logoColor=white)](https://usebrown.online/)
[![Release](https://img.shields.io/badge/Release-v1.0-0078D4?logo=github)](https://github.com/vedantwankhade123/Brown-Releases/releases)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011%20(x64)-0078D4?logo=windows)](https://github.com/vedantwankhade123/Brown-Releases/releases)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)

<p align="center">
  <a href="https://usebrown.online/">
    <img src="Assets/Brand-Assets/brown-logo.png" alt="Brown AI Logo" width="160" />
  </a>
</p>

<p align="center">
  <strong><a href="https://usebrown.online/">usebrown.online</a></strong> — Official website with setup guides, docs, and direct downloads.
</p>

**Brown AI** is an autonomous, privacy-first, local-first artificial intelligence assistant engineered for Windows. Powered by local on-device quantized LLMs (via Ollama, GGUF, and Hugging Face) and optional hybrid cloud intelligence (Gemini 2.5/3, Claude 3.7, DeepSeek R1, OpenAI), Brown executes system workflows, local code execution, document analysis, voice synthesis, and desktop orchestration with zero mandatory cloud telemetry.

---

## ⚡ Core Capabilities

- **🔒 100% Offline & Private**: Chat history, vector indices, and inference prompts stay strictly local on your silicon.
- **🧠 Autonomous Decision Engine**: Multi-step task planner (Analyze → Plan → Execute → Reflect), tool decomposition, and loop guard.
- **🎛️ Dynamic Performance Controls**: Switch between **Auto Adaptive**, **GPU Priority** (maximum VRAM offload), and **CPU Only** for power-efficient conversation.
- **🎙️ Sovereign Neural Voice**: Local Whisper STT and offline Kokoro TTS for ultra-low latency voice interaction without cloud endpoints.
- **📂 Local Knowledge RAG**: Ingest PDFs, markdown, and local files with hybrid BM25 + dense vector semantic retrieval.
- **📱 Companion Mobile Sync**: Pair securely with Brown Mobile over local Wi-Fi using PIN verification to sync sessions across devices.
- **🎨 Modern Dark & Light Theming**: High-contrast, accessibility-focused cyberpunk dark mode and refined daylight theme.

---

## 💾 Downloads & Installation

Official pre-compiled binaries are published in the **[Brown-Releases](https://github.com/vedantwankhade123/Brown-Releases/releases)** repository:

| Build Type | File Name | Platform | Description |
| :--- | :--- | :--- | :--- |
| **Setup Installer** | [`Brown-AI-Setup-v1.0.exe`](https://github.com/vedantwankhade123/Brown-Releases/releases/download/v1.0/Brown-AI-Setup-v1.0.exe) | Windows 10 / 11 (x64) | Standard guided installer with Start Menu & Desktop shortcuts. |
| **Portable Binary** | [`Brown-AI-v1.0.exe`](https://github.com/vedantwankhade123/Brown-Releases/releases/download/v1.0/Brown-AI-v1.0.exe) | Windows 10 / 11 (x64) | Standalone executable. Runs immediately without installation. |
| **Android APK** | [`Brown-AI-Mobile-v1.0.apk`](https://github.com/vedantwankhade123/Brown-Releases/releases/download/v1.0/Brown-AI-Mobile-v1.0.apk) | Android 11+ | Direct APK install for phones and tablets. |

---

## 🏛️ Monorepo Architecture

```
d:/Ultron/
├── src/                          # 🖥️ Windows Desktop Electron Application
│   ├── agent/                    # Autonomous agent engine, planner, memory & context
│   ├── main/                     # Electron main process, IPC handlers, RAG & hardware
│   ├── preload/                  # Secure IPC preload bridge
│   └── renderer/                 # Responsive UI, Chat UI, Visual Engine & Artifacts
├── mobile/                       # 📱 Mobile Companion App (React Native / Expo)
├── brown-website/                # 🌐 Official Product Website (React / Vite)
├── brown-releases/               # 📦 Release Hub for Windows and Android Binaries
├── python/                       # 🐍 Local Python Microservice (Inference & Scraping)
├── Assets/                       # 🎨 Brand Assets, Vector Logos & App Icons
├── docs/                         # 📚 System Architecture, PRD, Guides & Release Notes
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
- **[Folder Structure & Data Paths](docs/guides/BROWN_INSTALL_AND_DATA_FOLDERS.md)**: Complete guide to app data and model cache locations.

---

## 📄 License & Intellectual Property

Brown AI and its desktop and mobile applications are **Proprietary & Confidential Software**. All Rights Reserved.

- Copyright (c) 2026 Vedant Wankhade.
- Website: [https://usebrown.online](https://usebrown.online)
- Inquiries: `contact@usebrown.online`
