# 🚀 Ultron AI — BETA v1.0.0 Release Notes

We are thrilled to announce **Ultron AI BETA v1.0.0**, our milestone release delivering hybrid intelligence, dedicated GPU/CPU/Auto performance controls, zero-lag background metrics, full autonomous execution loops, multi-provider model integration, local neural voice (Kokoro TTS + Whisper STT), Gemini Live bidirectional audio, and mobile device synchronization.

---

## ✨ Key Features & Highlights in BETA v1

### ⚡ GPU / CPU / Auto Performance Engine
- **Top-Right Quick Toggle**: An interactive glassmorphism switcher in the top-right header that lets users manually select their hardware acceleration mode or set it to Auto:
  - **⚡ Auto Adaptive (Recommended)**: Dynamically detects dedicated GPUs, available VRAM, and RAM to balance inference layers automatically.
  - **🚀 GPU Priority**: Forces maximum GPU offloading (`num_gpu: 999`) for lightning-fast LLM generation, embeddings, and neural TTS.
  - **⚙️ CPU Only**: Executes models purely on the CPU (`num_gpu: 0`) to prevent VRAM allocation, lower temperatures, and conserve battery.
- **Real-Time Hardware Telemetry**: Live display of active GPU controller, VRAM, and memory load in the performance dropdown.

### 🚀 Zero-Lag Anti-Freeze Optimization
- **Native CPU Telemetry**: Replaced synchronous background WMI queries with microsecond-level native CPU load delta calculations, completely eliminating UI stuttering, process locks, and freezes.
- **Intelligent Profile Caching**: Added hardware profile caching with TTL to eliminate redundant system calls during multi-tasking.

### 🧠 Autonomous Execution Loop & Task Decomposition
- **Autonomous Decision Engine**: Multi-step task planner, tool decomposition, loop guard, safety risk matrix, and screen perception.
- **Interactive Code Canvas**: Split-view workspace for live code generation, HTML/JS sandbox preview, and integrated terminal.

### 🎙️ Sovereign Local Voice & Gemini Live
- **Local Kokoro TTS & Whisper STT**: Ultra-low latency offline voice synthesis and speech recognition without cloud dependencies.
- **Gemini Live Dialog**: Bidirectional real-time voice and vision conversations.

### 📱 Ultron Mobile Companion & Sync
- **P2P Sync Server**: Local WebSocket synchronization with PIN pairing to transfer chats and synchronize sovereign agent memory between PC and smartphone.

### 🌐 Official Feedback & Community
- **Instagram**: Follow [@usebrown.online](https://www.instagram.com/usebrown.online) for product updates and feature previews.
- **Developer Email**: Contact `contact@usebrown.online` for direct inquiries and feedback.

---

## 📦 Downloads & Installation

| Asset | Type | Description |
| :--- | :--- | :--- |
| **`Ultron.AI.Setup.v1.0.14.exe`** | **Installer** | Recommended. Standard Windows NSIS Setup Wizard with custom path, start menu, and desktop shortcuts. |
| **`Ultron.AI.v1.0.14.exe`** | **Portable** | Standalone portable executable. Runs directly without installation. |

---

## 🛠️ System Requirements

- **Operating System**: Windows 10 / 11 (64-bit, x64)
- **Memory**: 8 GB RAM (16 GB Recommended for 8B+ local models)
- **Local Neural Engine**: [Ollama](https://ollama.com/) / LM Studio for offline models
- **Cloud Providers (Optional)**: Google Gemini, Anthropic Claude, OpenAI, OpenRouter, DeepSeek, Groq
