# Ultron AI Desktop Agent — Strategic Enhancements & Feature Roadmap

**System Architecture Evolution & Next-Generation Feature Specification**

---

## 1. 🧠 Agentic & Autonomous Core Improvements

### 🔹 Full Multimodal "Computer Use" / Vision Agent Loop
* **Current state:** Ultron captures screenshots and uses OCR/coordinate heuristics for app interaction.
* **Enhancement:** Implement a continuous Vision-Action Perception Loop (supporting local vision models like `Qwen2-VL` / `UI-TARS` or cloud models like `Gemini 2.5 Flash` / `Claude 3.7 Computer Use`).
* **Capabilities:**
  * Ultron can visually locate buttons, canvas elements, icons, and menus inside complex software (Photoshop, Excel, Blender, VS Code) without requiring accessibility tree hooks.
  * **Self-correcting UI actions:** If a click fails or a modal pops up unexpectedly, Ultron detects it visually and retries or adapts.

### 🔹 Local Vector Memory & Semantic File Search (Local RAG)
* **Current state:** Conversations are stored in JSON flat files.
* **Enhancement:** Embed a 100% offline vector database (e.g., `sqlite-vec` or `@xenova/transformers` with `bge-small-en-v1.5` / `all-MiniLM-L6-v2`).
* **Capabilities:**
  * **Personal Knowledge Base:** Index user folders (`Documents`, `Projects`, `Notes`, `PDFs`, `.md`).
  * Ask Ultron *"Find that invoice from last month and summarize the expenses"* or *"What was the API endpoint we discussed in the auth service last week?"* with zero cloud data transmission.

### 🔹 Autonomous Scheduled Tasks & Background Proactive Agents
* **Background Cron/Scheduler:** Allow Ultron to run recurring workflows even when minimized to the system tray.
* **Examples:**
  * **Daily Briefing:** Every morning at 8:30 AM, fetch the weather, calendar events, check unread emails, and read it out via TTS.
  * **Dev Workspace Guard:** Clean up temp files, check disk health, or ping local servers/docker containers and alert on failures.
  * **Automated Web/Market Watcher:** Monitor a price or website change and notify the user when an event occurs.

---

## 2. 🎙️ Real-Time Voice & Conversational Experience

### 🔹 Hands-Free Local Wake Word Engine ("Hey Ultron")
* Integrate a lightweight on-device wake-word detection engine (like `openWakeWord` or `Porcupine`) running efficiently in a background thread.
* Allows hands-free activation from across the room without clicking any button or pressing hotkeys.

### 🔹 Full-Duplex Real-Time Voice Mode (with Voice Activity Detection & Barge-In)
* **VAD (Silero VAD):** Real-time voice interruption. If Ultron is speaking and you start talking, Ultron immediately cuts off TTS audio and listens to your new command (just like OpenAI Advanced Voice Mode / Gemini Live).
* **Low-Latency Streaming TTS:** Stream sentences to Kokoro TTS chunk-by-chunk for near-instant audio feedback rather than waiting for the entire LLM response to complete.

### 🔹 Dynamic Personas & Voice Profiles
* Presets for different styles (e.g., *Ultron Sci-Fi Assistant*, *Concise Executive Assistant*, *Senior Code Reviewer*, *Tutor*).
* Custom pitch, rate, and voice cloning support for Kokoro TTS.

---

## 3. 🖥️ Native Windows OS Superpowers

### 🔹 Lightweight Mini-Launcher / Floating Pill (Raycast / Spotlight Bar)
* In addition to the full dashboard, add an ultra-lightweight floating input bar (`Alt + Space`, `Win + Space`, or `Ctrl + Space`).
* Performs instant math, app launching, clipboard transforms, and 1-line agent actions without bringing up the heavy main window.

### 🔹 AI-Powered Smart Clipboard Manager
* Local clipboard history with semantic search.
* **Quick actions on copied text:** *"Summarize clipboard"*, *"Translate clipboard"*, *"Convert JSON to TypeScript interfaces"*, or *"Fix grammar"*.

### 🔹 Direct Windows System Controls
* Native IPC tools for:
  * **Volume & Audio Device Switching:** (e.g., switch audio output from Speakers to Headphones).
  * **Display & Brightness Controls:** Multi-monitor window snapping.
  * **Power Operations:** (Sleep, Lock Workstation, Restart).
  * **Media Playback:** (Play/Pause, Next Track across Spotify/YouTube).

---

## 4. 🌐 Expanded LLM & Provider Ecosystem

### 🔹 Multi-Provider Model Hub
* Expand beyond Ollama and Gemini to include:
  * OpenAI (`GPT-4o`, `o3-mini`)
  * Anthropic (`Claude 3.7 Sonnet` / `Haiku`)
  * DeepSeek API (`DeepSeek-R1` / `V3`)
  * Groq / Cerebras for ultra-fast (300+ tokens/sec) reasoning.
  * LM Studio & vLLM local server connectors.

### 🔹 In-App Model Store & Quantization Downloader
* A visual UI inside Settings to browse, search, and download Ollama GGUFs / Hugging Face models with 1 click, showing recommended hardware compatibility badges based on the user's detected GPU/VRAM.

### 🔹 Smart Model Routing (Hybrid Reasoning)
* Use a lightweight, blazing-fast local model (like `qwen2.5:0.5b` or `phi4-mini`) for intent classification, voice transcription cleanup, and tool selection.
* Route heavy coding, complex reasoning, or deep research to bigger models (`DeepSeek-R1`, `llama-3.3-70b`, or `Gemini Cloud`).

---

## 5. 🛠️ Developer & Power User Tools

### 🔹 Sidecar Playwright/Puppeteer Browser Agent
* A dedicated headless/headed browser instance for the agent to execute real web navigation, fill forms, download files, and scrape dynamic SPAs without interfering with the user's personal browser tabs.

### 🔹 Canvas / Artifacts Split-View Panel
* Interactive side-by-side workspace (similar to Claude Artifacts / ChatGPT Canvas):
  * Live HTML/CSS/JS preview sandbox.
  * Live Markdown document editing with export to PDF / DOCX.
  * Interactive Mermaid.js diagrams & charts.

### 🔹 Community / User Custom Skills Engine
* An open YAML/JSON or Python-based skill format where users can write their own playbooks or import community skills (e.g., `git-pr-review`, `excel-data-cleaner`, `docker-orchestrator`, `spotify-controller`).

### 🔹 Extended Model Context Protocol (MCP) Ecosystem
* Pre-configured, one-click MCP servers for:
  * GitHub MCP (PRs, issues, commits).
  * PostgreSQL / SQLite MCP (natural language database querying).
  * Slack / Discord MCP.
  * Google Drive / Notion MCP.

---

## 6. 🚀 Performance & Architecture Optimizations

| Area | Current Approach | Proposed Optimization |
| :--- | :--- | :--- |
| **Startup Time** | Initializes all modules and hardware checks eagerly | Lazy-load heavy modules (Kokoro ONNX, Whisper STT) on first request or in background worker threads. |
| **RAM Footprint** | Stays in full memory when closed to background | Put Renderer into power-saver/idle state when minimized to system tray, releasing unused Chromium heap. |
| **Tool Execution Safety** | Sandbox & HITL modal dialogs | Add reversible action rollbacks (snapshotting files before batch editing or running shell scripts) + dry-run previews. |

---

## 💡 Recommended Next Steps (Priority Order)

1. **Floating Quick-Action Bar (`Alt + Space` / `Ctrl + Space`)** — Instantly makes Ultron 10x more accessible throughout the daily workflow. *(Implemented & Active)*
2. **Local Vector Knowledge Base (RAG)** — Turns Ultron into an intelligent personal second brain for local documents and notes.
3. **Real-time Voice VAD / Wake Word** — Elevates the assistant experience to feel like a true hands-free desktop companion.
4. **Interactive Artifacts / Canvas Panel** — Makes coding and document generation significantly more usable.
