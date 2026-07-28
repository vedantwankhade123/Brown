# System Architecture & Technical Specification: Ultron

Ultron is a high-fidelity, offline-first AI desktop assistant engineered specifically for Microsoft Windows. Built on an isolated **Electron + CommonJS Preload Sandbox** architecture, Ultron bridges local quantized Large Language Models (LLMs) via Ollama and optional cloud services (such as Google Gemini APIs) directly into native Windows APIs and system capabilities—all while maintaining privacy and data sovereignty.

---

## 1. System Architecture

Ultron employs a multi-tiered, decoupled architecture that separates presentation logic, main process control, security sandboxing, local LLM execution, and microservice capabilities.

### 1.1 Simple Visual System Architecture Diagram

```
+---------------------------------------------------------------------------------+
|                            ULTRON DESKTOP AGENT                                 |
+---------------------------------------------------------------------------------+
                                      |
         +----------------------------+----------------------------+
         |                                                         |
         v                                                         v
+-------------------------------+                       +-------------------------+
|         RENDERER UI           |                       |   PRELOAD IPC BRIDGE    |
| - Main Chat Interface         | <===================> | - Safe ContextBridge    |
| - Spotlight Overlay (Ctrl+K)  |                       | - Isolated IPC Channels |
| - Draggable Metrics Splitter  |                       +-------------------------+
| - User Validation Dialog      |                                    |
+-------------------------------+                                    v
                                                        +-------------------------+
                                                        |   ELECTRON MAIN CORE    |
                                                        | - App Lifecycle         |
                                                        | - Hardware Profiler     |
                                                        | - Security Engine       |
                                                        | - Session Memory        |
                                                        | - Start Menu Scanner    |
                                                        +-------------------------+
                                                                     |
         +------------------------------+----------------------------+
         |                              |                            |
         v                              v                            v
+------------------+          +------------------+          +-------------------+
|   LOCAL OLLAMA   |          |    GEMINI API    |          |  WINDOWS SYSTEM   |
| Offline AI Model |          | Cloud AI Option  |          | PowerShell / Shell|
| (localhost:11434)|          |                  |          | & Windows Sandbox |
+------------------+          +------------------+          +-------------------+
```

### 1.2 Interactive Mermaid Architecture Diagram

```mermaid
graph TD
    UI["🖥️ Renderer UI (Chat, Spotlight Overlay, Splitter)"]
    PRELOAD["🔒 Preload IPC Bridge (ContextBridge Security)"]
    MAIN["⚙️ Electron Main Process (Hardware, Security, Memory)"]
    OLLAMA["🤖 Local Ollama Engine (Offline LLM)"]
    GEMINI["☁️ Gemini API (Cloud Option)"]
    WIN["💻 Windows OS (PowerShell / WinGet / Sandbox)"]

    UI <-->|Safe IPC Calls| PRELOAD
    PRELOAD <-->|Bridge| MAIN
    MAIN <-->|REST API| OLLAMA
    MAIN <-->|API Key| GEMINI
    MAIN -->|Security Check| WIN
```

---

### 1.3 Component Architecture Breakdown

1. **Renderer Layer (`src/renderer/`):**
   - Implemented using HTML5, modern vanilla CSS with dark theme accents, and asynchronous JavaScript controllers.
   - Includes a full-screen **Spotlight Command Overlay (`Ctrl+K`)** for quick indexing and natural language command input.
   - Features a **Draggable Splitter** for dynamic middle chat panel resizing and collapsible system metrics monitoring.

2. **Preload Hook Layer (`src/preload/preload.js`):**
   - Enforces context isolation (`contextIsolation: true`, `nodeIntegration: false`).
   - Exposes safe, selective IPC channels via `window.electronAPI` to shield renderer scripts from direct Node.js API access.

3. **Electron Main Process (`src/main/`):**
   - **`index.js`:** Coordinates app initialization, configuration folder creation (`%APPDATA%/LocalAgent`), and BrowserWindow lifecycle.
   - **`ipc.js`:** Serves as the primary message broker between UI components and OS/LLM execution services.
   - **`hardware.js`:** Profiles system CPU threads, system RAM, and active GPU adapters to recommend an optimal LLM model.
   - **`security.js` & `sandbox.js`:** Implements path validation, command blacklists, security mode toggles (Strict, Adaptive, Unrestricted), and optional Windows Sandbox execution.

4. **Inference & Backend Runtime (`python/`, Ollama REST):**
   - **Ollama Engine:** Runs locally on `http://localhost:11434` for 100% offline inference.
   - **Gemini API Adapter:** Provides optional cloud fallback/enhancement for multi-modal or ultra-complex reasoning tasks.
   - **Python Microservice (`server.py`):** Provides specialized web scraping (`scraper.py`) and custom Python ML inference execution (`inference.py`).

---

## 2. Proposed & Operational Methodology

The system operates via a continuous, asynchronous feedback loop comprising system discovery, prompt enrichment, local/cloud routing, security verification, and output streaming.

### 2.1 Simple Step-by-Step Workflow Diagram

```
===================================================================================
STEP 1: APP STARTUP & HARDWARE PROFILING
===================================================================================
[ Launch App ] ---> [ Profile CPU / RAM / GPU ] ---> [ Recommend Local AI Model (e.g. phi4) ]

===================================================================================
STEP 2: PROMPT ENRICHMENT
===================================================================================
[ User Input ] ---> [ Inject Time & Geo Context ] ---> [ Route to Selected Engine ]

===================================================================================
STEP 3: AI PROCESSING
===================================================================================
                    +---> [ LOCAL MODE  : Run Ollama Offline Engine ] ---+
                    |                                                     |
[ Inference ] ------+                                                     +---> [ Stream Answer ]
                    |                                                     |
                    +---> [ CLOUD MODE  : Run Gemini API ] --------------+

===================================================================================
STEP 4: COMMAND SECURITY & HUMAN-IN-THE-LOOP CHECK
===================================================================================
[ Does Answer Contain System Execution Command? ]
         |
         +---> NO  ---> [ Save Chat & Auto-Summarize Topic Header ]
         |
         +---> YES ---> [ Check Command Blacklist & Paths ]
                             |
                             +---> UNSAFE ---> [ Block Command & Show Security Alert ]
                             |
                             +---> SAFE   ---> [ Ask User Approval (Pop-Up Modal) ]
                                                     |
                                                     +---> Denied   ---> [ Cancel Command ]
                                                     +---> Approved ---> [ Run in PowerShell / Sandbox ]
```

---

### 2.2 Interactive Master Workflow Flowchart

```mermaid
flowchart TD
    START([🚀 App Launch]) --> PROF[📊 Profile Hardware & Discover Models]
    PROF --> SCAN[🔍 Scan Start Menu Shortcuts & Brand Logos]
    SCAN --> INPUT[💬 User Types Prompt in Chat / Spotlight Overlay]

    INPUT --> ENRICH[🌐 Add Time, Date & Geo Context]
    ENRICH --> ROUTE{Choose AI Engine}

    ROUTE -->|Offline| OLLAMA[🤖 Ollama Local Inference]
    ROUTE -->|Cloud| GEMINI[☁️ Gemini Cloud API]

    OLLAMA --> STREAM[⚡ Stream Response to UI]
    GEMINI --> STREAM

    STREAM --> CMD_CHECK{System Command Requested?}
    CMD_CHECK -->|No| SAVE[💾 Save Chat & Auto-Summarize Title]
    CMD_CHECK -->|Yes| SEC_CHECK{Pass Security Blacklist?}

    SEC_CHECK -->|No| BLOCK[⛔ Block Command & Alert User]
    SEC_CHECK -->|Yes| MODAL{User Approved Modal?}

    MODAL -->|Denied| CANCEL[❌ Cancel Command Execution]
    MODAL -->|Approved| EXEC[💻 Run Command in PowerShell / Sandbox]
    EXEC --> SAVE
```

---

## 3. Technology Stack

| Layer / Subsystem | Technology | Purpose |
| :--- | :--- | :--- |
| **Desktop Shell** | Electron.js (v34+) | Native Windows desktop windowing, OS integration, lifecycle management. |
| **Runtime Environment** | Node.js (v20+) | Main process execution, file system access, process spawning. |
| **Frontend UI** | HTML5, Vanilla CSS, JS | Gemini-themed dark interface, Spotlight overlay, dynamic resizable layout. |
| **Preload Security** | Electron ContextBridge | Context-isolated IPC interface (`window.electronAPI`). |
| **Markdown Parser** | `marked.cjs` | Client-side rendering of rich markdown formatting and code blocks. |
| **Local LLM Engine** | Ollama REST API | Offline local LLM inference execution (`http://localhost:11434`). |
| **Cloud LLM API** | Google Gemini API | Cloud multi-modal & high-capacity inference option. |
| **Microservice Backend**| Python 3.10+, FastAPI / Flask | Local web scraping (`scraper.py`), Python script execution. |
| **System Orchestration**| PowerShell, WinGet CLI | Automatic dependency installation, desktop program scanning. |
| **Sandbox Environment**| Windows Sandbox CLI | Isolated containerized execution for untrusted scripts. |

---

## 4. Key Features & Capabilities

- **Hardware-Aware Model Recommendation Engine:** Automatically measures RAM and GPU capabilities on boot to recommend appropriate quantized models.
- **One-Click Winget Ollama Installer:** Silent background installation and service startup for local Ollama runtimes via Windows WinGet.
- **Spotlight Command Overlay (`Ctrl+K`):** Global full-screen search and command bar supporting instant historical chat queries.
- **Draggable Metrics Splitter:** Dynamic, resizable chat panels with collapsible system performance monitoring.
- **Human-in-the-Loop Security Boundary:** Interactive validation dialogs requiring explicit user authorization before running terminal commands.
- **Windows Start Menu Program Scan:** Indexing of system `.lnk` shortcuts with automatic extraction of colored brand logos.
- **Real-Time Session Summarization:** Automatic conversion of long chat threads into 2-3 word topic headers in sidebar feeds.
- **Context Injection:** Automatic enrichment of prompts with localized time, ISO week, and geo-location metrics.

---

## 5. Hardware Requirements

Ultron supports two operational modes: **Local Offline Inference (via Ollama)** and **Cloud Hybrid Inference (via Gemini APIs)**.

### A. Local Offline Inference (Ollama)

| Requirement | Minimum Specs (Basic 3B–7B Models e.g. `llama3.2:3b`, `phi3:mini`) | Recommended Specs (Normal / Standard 7B–14B Models e.g. `phi4`, `llama3.2`, `qwen2.5:7b`) | High-Performance (14B–32B+ Models or Heavy Multi-Modal) |
| :--- | :--- | :--- | :--- |
| **CPU** | Quad-Core x64 Intel / AMD | 8+ Core x64 Processor (Intel i7/i9, AMD Ryzen 7/9) | 12+ Core High-Performance x64 Processor |
| **System RAM** | 8 GB RAM | 16 GB – 32 GB RAM | 32 GB – 64 GB RAM |
| **VRAM / GPU** | Integrated Graphics (Intel Iris Xe / AMD Radeon) | 6 GB – 8 GB Dedicated VRAM (NVIDIA RTX 3060/4060 or higher) | 12 GB+ Dedicated VRAM (NVIDIA RTX 3080/4080/4090) |
| **Storage** | 10 GB Free SSD Storage | 30 GB Free NVMe SSD Storage | 50 GB+ Free NVMe SSD Storage |
| **Operating System**| Windows 10/11 64-bit | Windows 10/11 64-bit (PowerShell + WinGet enabled) | Windows 11 64-bit |

### B. Cloud Hybrid Inference (Gemini API Integration)

When configured to leverage cloud APIs (such as Gemini 1.5 Flash / Pro):

- **System RAM:** 4 GB Minimum (8 GB Recommended)
- **CPU:** Dual-Core x64 or ARM64 Processor
- **Network:** Active Broadband Internet Connection
- **API Key:** Valid Gemini API Key configured in settings

---

## 6. Future Scope & Roadmap

1. **Multi-Modal Local Vision Integration:** Support for local multi-modal models (e.g. `llama3.2-vision`, `bakllava`) to process screenshots, diagrams, and local images directly.
2. **Autonomous Tool & Agent Expansion:** Extending Human-in-the-Loop workflows to multi-step agent actions (e.g. automated file reorganization, local git workflow automation, browser subagent automation).
3. **Encrypted Local Vector Memory:** Integrating a local vector database (such as SQLite-vec or LanceDB) for semantic retrieval across historical user conversations and local documents.
4. **Cross-Platform Compatibility:** Porting Windows system integrations (Start Menu shortcut parser, PowerShell bindings) to macOS (`.app` indexer) and Linux (`.desktop` entries).
5. **Custom Fine-Tuned Local Models:** Providing fine-tuned GGUF weights optimized specifically for Windows administrative and automation tasks.

---

## 7. Expected Outcomes & Impact

- **100% Data Sovereignty:** Sensitive prompt data and user inputs remain local to the host machine.
- **Zero Ongoing API Costs:** Offline execution via Ollama eliminates subscription and token costs for local workloads.
- **Sub-Second Response Times:** Direct local execution and quantized models deliver immediate responsiveness.
- **Secure System Automation:** Human-in-the-loop authorization gates prevent unintended command execution or data modification.
