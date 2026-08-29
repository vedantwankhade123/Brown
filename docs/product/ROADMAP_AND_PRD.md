# Ultron AI — Strategic Product Requirements Document (PRD) & Engineering Roadmap

**Document Version:** 2.0.0  
**Author:** Vedant Wankhade & Core Engineering Contributors  
**Status:** Approved & Active Roadmap  
**Target Platforms:** Windows 10/11 (Active), Mobile iOS & Android (Phase 1), macOS Desktop (Phase 3)  

---

## 1. Executive Summary & Vision

**Ultron** is an autonomous, privacy-first AI ecosystem built to liberate personal computing from cloud surveillance and centralized telemetry. The project is structured across three synchronized execution phases:

1. **Phase 1 (Immediate Focus): Ultron Mobile (iOS & Android)** — A dedicated, lightweight on-device conversational AI application (comparable to ChatGPT/Gemini) running quantized Small Language Models (SLMs) completely offline without OS-level destructive automation.
2. **Phase 2: Core Windows Desktop Enhancements** — Implementing next-generation strategic capabilities outlined in the system evolution roadmap (Local Vector RAG, Full-Duplex Real-Time Voice with VAD, Canvas/Artifacts Panel, Vision-Action Computer Use, Multi-Provider Model Hub, and Background Scheduled Agents). *(Note: The Floating Quick-Action Bar `Alt+Space` is already deployed in v1.0.13).*
3. **Phase 3: Cross-Platform macOS Desktop Port** — Expanding the desktop agent to macOS (Apple Silicon M1/M2/M3/M4 & Intel x64) utilizing AppleScript, JXA, and macOS Accessibility APIs via a single unified codebase.

---

## 2. Phase 1 PRD: Ultron Mobile (iOS & Android)

### 2.1 Scope & Product Definition
Unlike the desktop edition which possesses deep operating system automation and shell execution tools, **Ultron Mobile is strictly scoped as a pure conversational intelligence companion and Q&A engine**. It allows users to query, brainstorm, chat, summarize, and draft content 100% offline with zero battery drain from idle network requests.

### 2.2 Functional Requirements

| Requirement ID | Feature | Specification |
|:--|:--|:--|
| **MOB-01** | **On-Device SLM Inference** | Execute local quantized GGUF models (`Llama 3.2 1B/3B`, `Gemma 2 2B`, `Qwen 2.5 1.5B/3B`) directly on mobile hardware. |
| **MOB-02** | **Hardware Acceleration** | Utilize Apple Neural Engine / Metal via `llama.rn` on iOS, and Vulkan / OpenCL / NPU on Android. |
| **MOB-03** | **Zero-Telemetry Policy** | 100% air-gapped; no prompts, responses, or analytics leave the mobile device. |
| **MOB-04** | **Voice Interaction** | Mobile on-device Whisper STT voice input and native neural Text-to-Speech audio readout. |
| **MOB-05** | **Encrypted Local Storage** | Chat history stored in local SQLite / WatermelonDB encrypted via iOS Keychain / Android Keystore. |
| **MOB-06** | **Model Manager** | In-app visual downloader to switch and manage quantized model weights based on available device RAM (1GB, 2GB, or 3GB budget). |
| **MOB-07** | **Optional Desktop Sync** | Optional local Wi-Fi pairing to query the user's desktop Ultron instance when at home/office. |

### 2.3 Mobile Technology Stack
- **Framework:** React Native with TypeScript (Expo / Bare Workflow)
- **AI Core:** `llama.rn` (llama.cpp React Native bindings for GGUF execution)
- **Speech Engine:** `@react-native-voice/voice` + Local Whisper ONNX Mobile
- **UI Components:** Dark minimalist aesthetic matching Ultron design tokens
- **Target OS:** iOS 16+ (iPhone / iPad), Android 11+ (API 30+)

---

## 3. Phase 2: Core Windows Desktop Strategic Enhancements

Based on the architectural evolution roadmap, the following features represent the desktop development plan:

```
+-------------------------------------------------------------------------------+
|                      ULTRON DESKTOP ENHANCEMENT SUITE                         |
|                                                                               |
|  [COMPLETED]                                                                  |
|   ✓ Floating Quick-Action Bar (Alt + Space Spotlight Mini-Launcher)           |
|                                                                               |
|  [PRIORITY 1: KNOWLEDGE & REASONING]                                          |
|   ├── Local Vector Knowledge Base & Semantic File Search (Local RAG)          |
|   └── Canvas / Artifacts Split-View Interactive Workspace                     |
|                                                                               |
|  [PRIORITY 2: PERCEPTION & VOICE]                                             |
|   ├── Full-Duplex Real-Time Voice Mode (Silero VAD + Barge-In)                 |
|   ├── Hands-Free Wake Word Detection ("Hey Ultron" via openWakeWord)          |
|   └── Full Multimodal "Computer Use" Vision-Action Perception Loop            |
|                                                                               |
|  [PRIORITY 3: ECOSYSTEM & AUTOMATION]                                         |
|   ├── Multi-Provider Model Hub & Visual Quantization Store                    |
|   ├── Autonomous Background Scheduled Tasks & Web Watchers                    |
|   └── Sidecar Playwright/Puppeteer Browser Automation Agent                   |
+-------------------------------------------------------------------------------+
```

### 3.1 Feature Specifications

#### 1. Local Vector Memory & Semantic File Search (Local RAG)
- **Engine:** `sqlite-vec` or `@xenova/transformers` running `bge-small-en-v1.5` / `all-MiniLM-L6-v2`.
- **Functionality:** Indexes user-selected folders (`Documents`, `Projects`, `.md`, `PDFs`, `.csv`) into local vector embeddings.
- **User Experience:** Natural language queries like *"Find that invoice from last month and extract the total"* or *"What was the API endpoint we discussed in the auth service last week?"* execute instantly offline.

#### 2. Full-Duplex Real-Time Voice & Wake Word
- **Voice Activity Detection (Silero VAD):** Real-time audio interruption (barge-in). If Ultron is speaking and the user talks, TTS audio cuts off instantly to receive new input.
- **Low-Latency Streaming TTS:** Kokoro TTS renders sentences chunk-by-chunk in real-time.
- **Wake Word:** Background `openWakeWord` thread listening for *"Hey Ultron"* with minimal CPU footprint (<1%).

#### 3. Canvas & Interactive Artifacts Split-View
- **Workspace Panel:** Side-by-side interactive canvas inspired by Claude Artifacts / ChatGPT Canvas.
- **Features:** Live HTML/CSS/JS sandbox execution, live Markdown document editor with PDF/DOCX export, and interactive Mermaid.js architecture diagrams.

#### 4. Multimodal "Computer Use" Vision Agent Loop
- **Perception:** Screenshot capture fed into vision models (local `Qwen2-VL` / `UI-TARS` or cloud `Gemini 2.5 Flash` / `Claude 3.7 Computer Use`).
- **Capability:** Visually navigates complex software (Photoshop, Blender, VS Code, Excel) without requiring accessibility tree hooks. Includes self-correcting click validation.

#### 5. Multi-Provider Model Hub & Quantization Store
- **Expanded Providers:** Native API connectors for OpenAI (`gpt-4o`), Anthropic (`claude-3-7-sonnet`), DeepSeek (`deepseek-r1`), Groq (`300+ tokens/sec`), and LM Studio / vLLM local servers.
- **In-App Store:** One-click GGUF model downloader with auto-detected GPU/VRAM hardware recommendation badges.

#### 6. Autonomous Background Tasks & Browser Agent
- **Background Cron:** Scheduled daily briefings (weather, calendar, unread summary at 8:30 AM) and dev workspace health checks.
- **Playwright Sidecar:** Dedicated headless browser for autonomous web research, form filling, and dynamic scraping without disturbing personal tabs.

---

## 4. Phase 3: macOS Cross-Platform Desktop Port

### 4.1 Architecture Strategy
Ultron will maintain a **single unified codebase** serving both Windows and macOS through clean platform abstraction layers (`src/main/platform/`):

```
src/
├── main/
│   ├── platform/
│   │   ├── index.js          # Platform router (process.platform === 'win32' | 'darwin')
│   │   ├── windows.js        # PowerShell, WinUIA, DPAPI safeStorage
│   │   └── macos.js          # AppleScript, JXA, AXUIElement, Keychain safeStorage
│   ├── index.js              # Shared Electron Window & Lifecycle Manager
│   ├── updater.js            # Dual latest.yml / latest-mac.yml Auto-Updater
│   └── ...
```

### 4.2 macOS Implementation Details
- **System Automation:** AppleScript / JavaScript for Automation (JXA) for native Mac apps (Safari, Music, Terminal, Finder, System Settings).
- **Shortcut Bindings:** `Option + Space` (Spotlight Quick Bar) and `Cmd + Shift + Space`.
- **Target Packaging:**
  - `Ultron.AI.Setup.dmg` (macOS Disk Image)
  - Universal binary / `arm64` (Apple Silicon M1/M2/M3/M4) + `x64` (Intel).
- **CI/CD Build Matrix:** Dual-runner GitHub Actions (`windows-latest` & `macos-latest`) building and publishing release artifacts simultaneously.

---

## 5. Execution Timeline & Milestones

```
+------------------------------------------------------------------------------+
| 2026 ROADMAP TIMELINE                                                        |
+------------------------------------------------------------------------------+
| [Month 1 - Immediate] PHASE 1: ULTRON MOBILE MVP                            |
| ├── Initialize React Native Expo + TypeScript workspace                     |
| ├── Integrate llama.rn on-device GGUF inference (Llama 3.2 1B / Gemma 2B)   |
| ├── Build dark-mode conversational UI & encrypted local SQLite thread store  |
| └── Test Android APK & iOS TestFlight distribution                         |
|                                                                              |
| [Month 2 - Month 3] PHASE 2: WINDOWS STRATEGIC CORE ENHANCEMENTS            |
| ├── Milestone 2.1: Local Vector Knowledge Base (sqlite-vec RAG)              |
| ├── Milestone 2.2: Full-Duplex Real-Time Voice Mode (Silero VAD + Wake Word) |
| ├── Milestone 2.3: Interactive Canvas / Artifacts Split Panel                |
| ├── Milestone 2.4: Multimodal Computer Use & Vision Perception Loop          |
| └── Milestone 2.5: Multi-Provider Model Hub & Quantization Store Downloader  |
|                                                                              |
| [Month 4] PHASE 3: MACOS DESKTOP PORT                                       |
| ├── Milestone 3.1: macOS AppleScript/JXA automation adapter                  |
| ├── Milestone 3.2: package.json DMG / ARM64 build configuration              |
| └── Milestone 3.3: Dual-runner GitHub Actions CI/CD matrix integration       |
+------------------------------------------------------------------------------+
```
