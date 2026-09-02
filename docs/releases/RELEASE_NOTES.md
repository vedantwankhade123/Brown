# 🚀 Brown AI — BETA v1.0.15 Release Notes

We are thrilled to announce **Brown AI BETA v1.0.15**, our milestone release delivering hybrid intelligence, dedicated GPU/CPU/Auto performance controls, zero-lag background metrics, full autonomous execution loops, multi-provider model integration, fully offline neural voice (Kokoro TTS + Whisper STT), light/dark/system theming, topbar command dropdowns, and mobile device synchronization.

---

## ✨ Key Features & Highlights in BETA v1

### ⚡ GPU / CPU / Auto Performance Engine
- **Settings → Advanced Options**: An interactive switcher that lets users manually select their hardware acceleration mode or set it to Auto (re-homed from the topbar to keep the top bar minimal):
  - **⚡ Auto Adaptive (Recommended)**: Dynamically detects dedicated GPUs, available VRAM, and RAM to balance inference layers automatically.
  - **🚀 GPU Priority**: Forces maximum GPU offloading (`num_gpu: 999`) for lightning-fast LLM generation, embeddings, and neural TTS.
  - **⚙️ CPU Only**: Executes models purely on the CPU (`num_gpu: 0`) to prevent VRAM allocation, lower temperatures, and conserve battery.
- **Real-Time Hardware Telemetry**: Live display of active GPU controller, VRAM, and memory load in the performance panel.

### 🚀 Zero-Lag Anti-Freeze Optimization
- **Native CPU Telemetry**: Replaced synchronous background WMI queries with microsecond-level native CPU load delta calculations, completely eliminating UI stuttering, process locks, and freezes.
- **Intelligent Profile Caching**: Added hardware profile caching with TTL to eliminate redundant system calls during multi-tasking.

### 🧠 Autonomous Execution Loop & Task Decomposition
- **Autonomous Decision Engine**: Multi-step task planner (analyze → plan → execute → reflect), tool decomposition, loop guard, safety risk matrix, and screen perception with context retention.
- **Interactive Code Canvas**: Split-view workspace for live code generation, HTML/JS sandbox preview, and integrated terminal.

### 🎙️ Sovereign Offline-Only Voice
- **Local Whisper STT**: Primary speech recognition runs fully on-device (multilingual `whisper-base`, warmed up at startup) — no cloud transcription, no online STT providers.
- **Kokoro Neural TTS**: Ultra-low latency offline voice synthesis; cloud voice sections removed. Voice is 100% offline.
- **In-Input Recording Capsule**: The mic transforms into a compact recording pill inside the input row (waveform, timer, circular stop) while input, attach, model selector, and send stay visible.

### 🌗 Light / Dark / System Theming
- **Appearance Settings**: Full light theme alongside the default dark theme, plus system-follow mode. Light mode sweeps cover settings, cards, inputs, dropdowns, and the title bar (brand logo switches to the black variant automatically).

### 🎛️ Topbar Command Dropdowns
- **One-Click Dropdown Hub**: Models, Apps, Sync, Knowledge, and Automation open as smooth in-place dropdowns (icon rows, animated open/close) instead of jumping into Settings — the topbar stays minimal with just chat navigation, update widget, Sync/Settings/Help.

### 📱 Brown Mobile Companion & Sync
- **P2P Sync Server**: Local WebSocket synchronization with PIN pairing to transfer chats and synchronize sovereign agent memory between PC and smartphone.
- **Pair-Code + QR Dropdown**: Generate a 30-second pairing code and QR directly from the topbar Sync dropdown — no settings visit needed.

### 🌐 Official Feedback & Community
- **Instagram**: Follow [@usebrown.online](https://www.instagram.com/usebrown.online) for product updates and feature previews.
- **Developer Email**: Contact `contact@usebrown.online` for direct inquiries and feedback.

---

## 📦 Downloads & Installation

| Asset | Type | Description |
| :--- | :--- | :--- |
| **`Ultron.AI.Setup.v1.0.15.exe`** | **Installer** | Recommended. Standard Windows NSIS Setup Wizard with custom path, start menu, and desktop shortcuts. |
| **`Ultron.AI.v1.0.15.exe`** | **Portable** | Standalone portable executable. Runs directly without installation. |

---

## 🛠️ System Requirements

- **Operating System**: Windows 10 / 11 (64-bit, x64)
- **Memory**: 8 GB RAM (16 GB Recommended for 8B+ local models)
- **Local Neural Engine**: [Ollama](https://ollama.com/) / LM Studio for offline models
- **Cloud Providers (Optional)**: Google Gemini, Anthropic Claude, OpenAI, OpenRouter, DeepSeek, Groq
