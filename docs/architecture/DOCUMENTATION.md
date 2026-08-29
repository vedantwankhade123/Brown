# Brown AI Agent: Comprehensive Technical Documentation & Architecture Manual

Welcome to the official technical documentation for **Brown AI Agent**, an autonomous, privacy-focused offline AI desktop assistant built specifically for Microsoft Windows. 

This documentation covers system architecture, technology stack, local model selection strategies via Ollama, cloud API fallbacks, installation instructions, and complete configuration manuals.

---

## 📑 Table of Contents
1. [Overview & Key Features](#1-overview--key-features)
2. [Complete Technology Stack](#2-complete-technology-stack)
3. [System Architecture & Data Flow](#3-system-architecture--data-flow)
4. [Ollama Integration & Hardware-Aware Model Allocation](#4-ollama-integration--hardware-aware-model-allocation)
   - [High-End Tier (12GB+ VRAM / 32GB+ RAM)](#high-end-hardware-tier-12gb-vram--32gb-ram)
   - [Mid-Range Tier (8GB VRAM / 16GB RAM)](#mid-range-hardware-tier-8gb-vram--16gb-ram)
   - [Low-End Tier (Integrated GPU / 8GB RAM / CPU-only)](#low-end--budget-hardware-tier-integrated-gpu--8gb-ram--cpu-only)
5. [Online & Hybrid Cloud Model Connectors](#5-online--hybrid-cloud-model-connectors)
6. [Windows Installation & Deployment Guide](#6-windows-installation--deployment-guide)
7. [Configuration & Customization Manual](#7-configuration--customization-manual)
8. [Directory Structure & Application Storage](#8-directory-structure--application-storage)

---

## 1. Overview & Key Features

**Brown AI** is designed to bridge the gap between natural language AI reasoning and local Windows desktop control. Unlike cloud-bound assistants that stream user keystrokes and code snippets to remote servers, Brown runs local quantized Large Language Models (LLMs) on host hardware.

### 🌟 Key Features

* **100% Offline & Private Inference:** Powered by local Ollama model execution on `localhost:11434`. Zero data leaves the local machine.
* **Dynamic Hardware Profiler:** Scans host CPU threads, total system RAM, and active GPU vRAM on boot to automatically allocate the optimal model footprint (e.g. `phi4`, `llama3.2`, `qwen2.5`).
* **Human-in-the-Loop (HITL) Security Boundary:** A security validation system that prompts explicit user authorization dialogs before executing any terminal, PowerShell, or file-modifying subprocesses.
* **Spotlight Command Overlay (`Ctrl+K`):** A full-screen (`100vw x 100vh`) blur-backdrop search overlay supporting debounced natural language indexing over session history and system shortcuts.
* **Windows Start Menu Program Parser:** Automatically indexes user and system shortcut paths (`.lnk`), resolves absolute target `.exe` binaries, and renders authentic brand logos (Chrome, VS Code, Brave, AnyDesk, etc.).
* **Dynamic Chat Session Summarizer:** Asynchronously generates 2–3 word topic headers in real-time for session sidebar feeds using lightweight local inference calls.
* **Draggable Splitter Layout:** Allows real-time mouse-dragging to resize middle chat frames and collapse system metrics panels.
* **Hybrid Cloud Connector:** Optional fallback to Google Gemini 1.5 Pro / Flash APIs for complex online tasks when enabled by the user.

---

## 2. Complete Technology Stack

| Layer | Technology / Library | Purpose & Details |
| :--- | :--- | :--- |
| **Desktop Shell** | **Electron v31.0.0** | Chromium rendering engine + Node.js runtime environment for Windows desktop binaries. |
| **Security Bridge** | **CommonJS Preload & ContextBridge** | Enforces context isolation between Renderer DOM and main system processes. |
| **Frontend UI** | **HTML5 / Vanilla CSS3 / JavaScript** | Modern Gemini-esque dark theme UI, CSS glassmorphism, responsive grid layouts, and visual animations. |
| **Markdown Parser** | **Marked.js v18.0.6** | Formats streaming LLM output with syntax-highlighted code blocks and tables. |
| **System Profiler** | **Systeminformation v5.23.5** | Queries native Windows OS hardware (CPU load, RAM utilization, GPU adapter details, disk IO). |
| **Local Inference** | **Ollama REST API** | Manages quantized GGUF model execution, model pulling, and streaming HTTP tokens on `http://127.0.0.1:11434`. |
| **Python Sidecar** | **Python 3.x + WebSockets / REST** | Optional Python engine (`inference.py`, `server.py`, `scraper.py`) for specialized agentic tools, RAG, and web scraping. |
| **Package & Dist** | **Electron Builder v24.13.3 + NSIS** | Compiles single-file Portable `.exe` and standard guided Windows Setup `.exe` installers. |

---

## 3. System Architecture & Data Flow

Ultron enforces a strict three-tier architecture ensuring complete separation between the web view, IPC security bridge, and native operating system APIs.

### 🏛️ System Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                         ULTRON DESKTOP SYSTEM ARCHITECTURE                        |
+-----------------------------------------------------------------------------------+
                                          |
          +-------------------------------+-------------------------------+
          |                                                               |
          v                                                               v
+-----------------------------------+                           +-------------------+
|            RENDERER UI            |                           | PRELOAD SECURITY  |
| - Chat Feed & Code Highlighting   | <=======================> | - ContextBridge   |
| - Spotlight Overlay (Ctrl+K)      |     Safe IPC Call Bridge  | - Isolated Channels|
| - Draggable Metrics Splitter      |                           +-------------------+
| - Human-in-the-Loop Dialog Modal  |                                     |
+-----------------------------------+                                     v
                                                                +-------------------+
                                                                | ELECTRON MAIN CORE|
                                                                | - App Lifecycle   |
                                                                | - HW Profiler     |
                                                                | - Start Menu Scan |
                                                                | - HITL Auditor    |
                                                                +-------------------+
                                                                          |
          +---------------------------------+-----------------------------+
          |                                 |                             |
          v                                 v                             v
+--------------------+            +--------------------+        +-------------------+
| LOCAL OLLAMA ENGINE|            | HYBRID GEMINI API  |        | WINDOWS OS LAYER  |
| (localhost:11434)  |            | (Optional Cloud)   |        | PowerShell / Shell|
+--------------------+            +--------------------+        +-------------------+
```

### 🔒 IPC Security Boundary & Data Flow

1. **User Action:** User inputs a command or triggers an automated task in Renderer UI.
2. **IPC Dispatch:** Renderer calls exposed `window.ultronAPI` bridge functions defined in `preload.js`.
3. **Main Process Audit:** Electron Main process (`ipc.js`) receives request. If the action involves system commands, file edits, or terminal scripts, it triggers the **Human-in-the-Loop Validation Modal**.
4. **User Verification:** If approved by user, command is executed in a controlled PowerShell/CMD sandbox.
5. **LLM Reasoning Loop:** Prompt is forwarded to Local Ollama endpoint (`http://127.0.0.1:11434/api/generate`) or Google Gemini API. Tokens are streamed back in real-time to the Renderer UI.

---

## 4. Ollama Integration & Hardware-Aware Model Allocation

Ultron integrates directly with **Ollama**, an open-source local LLM runner. During startup, Ultron checks if Ollama is running; if missing, it can orchestrate a silent background installation using Windows `winget install Ollama.Ollama`.

### 🧠 Model Selection Matrix by Hardware Tier

Ultron profiles hardware on boot and recommends the best model parameters for optimal token generation speed (tokens per second) and memory stability.

#### 🚀 High-End Hardware Tier (12GB+ VRAM / 32GB+ System RAM)
Designed for workstations with dedicated NVIDIA RTX GPUs (3080/4070/4080/4090) or high-capacity system memory.

| Recommended Model | Quantization | Context Window | Best Use Case | Command to Pull |
| :--- | :--- | :--- | :--- | :--- |
| **`phi4:14b`** | Q4_K_M / Q8_0 | 16K–32K | **Default Recommended.** Superior reasoning, coding, and logical execution. | `ollama pull phi4` |
| **`qwen2.5:32b`** | Q4_K_M | 32K | Advanced software engineering, multi-step agent planning, complex math. | `ollama pull qwen2.5:32b` |
| **`llama3.3:70b`** | Q4_K_M | 8K–16K | Enterprise-grade reasoning (requires 24GB+ VRAM or 64GB RAM). | `ollama pull llama3.3:70b` |
| **`deepseek-r1:32b`** | Q4_K_M | 16K | Complex chain-of-thought mathematical and algorithmic problem solving. | `ollama pull deepseek-r1:32b` |

#### ⚖️ Mid-Range Hardware Tier (8GB VRAM / 16GB System RAM)
Designed for modern gaming laptops, mid-tier desktop GPUs (RTX 3060/4060, RX 6700), or fast DDR5 system memory.

| Recommended Model | Quantization | Context Window | Best Use Case | Command to Pull |
| :--- | :--- | :--- | :--- | :--- |
| **`phi4:14b`** | Q4_K_M | 8K–16K | Balanced execution speed (~25-40 t/s) and high analytical accuracy. | `ollama pull phi4` |
| **`llama3.1:8b`** | Q4_K_M | 8K–16K | Excellent all-rounder for general conversation, coding, and summarization. | `ollama pull llama3.1` |
| **`qwen2.5:14b`** | Q4_K_M | 16K | High coding precision and structured JSON/tool output capability. | `ollama pull qwen2.5:14b` |
| **`deepseek-r1:8b`** | Q4_K_M | 8K | Reasoning and analytical logic with low memory footprint. | `ollama pull deepseek-r1:8b` |
| **`mistral:7b`** | Q4_K_M | 8K | Fast, reliable instruct-following model. | `ollama pull mistral` |

#### 💻 Low-End / Budget Hardware Tier (Integrated GPU / 8GB System RAM / CPU-only)
Designed for ultrabooks, office laptops (Intel Iris Xe, AMD Radeon 680M/780M), or budget desktops running on CPU threads.

| Recommended Model | Quantization | Context Window | Best Use Case | Command to Pull |
| :--- | :--- | :--- | :--- | :--- |
| **`llama3.2:3b`** | Q4_K_M | 4K–8K | **Recommended for Low RAM.** Fast execution (~30+ t/s on CPU), minimal RAM usage (~2.2GB). | `ollama pull llama3.2:3b` |
| **`qwen2.5:3b`** | Q4_K_M | 4K–8K | Lightweight coding, command parsing, and fast response generation. | `ollama pull qwen2.5:3b` |
| **`phi3.5:3.8b`** | Q4_K_M | 4K | Strong reasoning capability for ultra-lightweight hardware footprints. | `ollama pull phi3.5` |
| **`deepseek-r1:1.5b`**| Q4_K_M | 4K | Ultra-fast logic reasoning engine requiring under 1.5GB RAM. | `ollama pull deepseek-r1:1.5b` |

---

## 5. Online & Hybrid Cloud Model Connectors

While Ultron prioritizes offline local privacy, users can enable **Hybrid Cloud Mode** in **Settings > API Connectors** for complex web search, multi-modal vision tasks, or when running on ultra-low spec hardware without Ollama.

### Supported Cloud Providers
* **Google Gemini API:** Supports `gemini-1.5-pro` and `gemini-1.5-flash` endpoints.
* **OpenAI Compatible Endpoint:** Connects to any standard OpenAI-compatible API base URL (Groq, Together AI, OpenRouter, LM Studio remote instances).

### Security of Cloud Credentials
All API keys entered in Settings are encrypted locally using Windows DPAPI / Electron `safeStorage` before saving to `AppData\Roaming\ultron\Local Storage`. Keys are never transmitted anywhere except directly to the official provider endpoint via HTTPS.

---

## 6. Windows Installation & Deployment Guide

Ultron supports two distribution executable options for Microsoft Windows (x64).

### Option A: Guided Installer (`Ultron AI Agent Setup 1.0.0.exe`)
1. Download `Ultron AI Agent Setup 1.0.0.exe`.
2. Double-click the file to launch the **NSIS Guided Installation Wizard**.
3. Select installation directory (default: `C:\Program Files\Ultron AI Agent\`).
4. Click **Install**. Shortcuts will automatically be created on the **Desktop** and **Start Menu**.
5. Launch Ultron from the Start Menu.

### Option B: Standalone Portable Binary (`Ultron AI Agent 1.0.0.exe`)
1. Download `Ultron AI Agent 1.0.0.exe`.
2. Move the binary to any directory or USB flash drive.
3. Double-click to execute instantly — **zero installation required**.

### Option C: Building from Source
For developers wishing to modify or build Ultron manually:

```bash
# 1. Clone the repository
git clone https://github.com/vedantwankhade123/Ultron.git
cd Ultron

# 2. Install Node.js dependencies
npm install

# 3. Start application in development mode
npm start

# 4. Package Windows Executables (NSIS Setup & Portable binaries)
npm run dist
```
*Compiled binaries will be generated inside the `dist/` directory.*

---

## 7. Configuration & Customization Manual

Ultron provides extensive customization options accessible via the **Settings Panel** (`Ctrl+,` or sidebar gear icon).

### ⚙️ Settings Manual Breakdown

* **Model & Provider Connector:**
  * **Inference Mode:** Toggle between `Local Ollama` and `Cloud API`.
  * **Ollama Endpoint:** Default is `http://127.0.0.1:11434`. Can be pointed to a remote Ollama server on local network.
  * **Selected Model:** Dropdown list auto-populated from currently pulled Ollama models.
* **Security & Authorization Boundary:**
  * **Human-in-the-Loop Mode:** Enforce dialog confirmation for system execution commands (`Strict`, `Moderate`, or `Disabled`).
  * **Allowed Command Whitelist:** Pre-approve trusted PowerShell / CMD scripts for seamless execution.
* **Interface & Customization:**
  * **Spotlight Hotkey:** Customize the global overlay shortcut (default: `Ctrl+K`).
  * **UI Theme Accent:** Toggle Gemini Dark accenting, opacity glassmorphism intensity, and font scaling.
  * **Metrics Panel Display:** Choose whether host hardware CPU/RAM meters are visible in the right sidebar.

---

## 8. Directory Structure & Application Storage

### 📁 Source Code Directory Layout
```
Ultron/
├── Assets/                        # Branding images, icons, logo SVGs
├── src/
│   ├── main/                      # Electron Main Process
│   │   ├── index.js               # App entry point & window lifecycle
│   │   ├── ipc.js                 # IPC handlers, Start Menu scanner, system APIs
│   │   ├── hardware.js            # Hardware profiler (CPU/RAM/GPU)
│   │   ├── sandbox.js             # Terminal command execution sandbox
│   │   └── security.js            # Security rules & HITL dialog manager
│   ├── preload/
│   │   └── preload.js             # Preload ContextBridge security bridge
│   └── renderer/                  # Frontend UI Layer
│       ├── index.html             # Main DOM layout & Spotlight modal
│       ├── index.css              # Custom CSS design system (Dark mode)
│       └── renderer.js            # Chat stream controller & UI logic
├── python/                        # Python Sidecar Services
│   ├── server.py                  # WebSocket / REST sidecar server
│   ├── inference.py               # Python AI agent logic & tools
│   └── scraper.py                 # RAG web search scraping module
├── dist/                          # Compiled executable outputs
└── package.json                   # Dependencies & build configuration
```

### 💾 Persistent User Storage Paths (Windows)
- **Application Binaries:** `C:\Program Files\Ultron AI Agent\`
- **Persistent Data & Chat History:** `C:\Users\<Username>\AppData\Roaming\ultron\`
  - `conversations_store.json`: Saved chat session threads.
  - `learned_memory.json`: Agent execution history and indexed system commands.
- **Local Ollama Model Weights:** `C:\Users\<Username>\.ollama\models\`
