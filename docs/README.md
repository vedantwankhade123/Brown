# Brown AI Documentation Hub

Welcome to the central documentation index for the **Brown AI Ecosystem** (Windows Desktop Application, Mobile App, and Web Application).

---

## 📚 Documentation Index

### 1. 🏛️ [Architecture & Technical Specifications](architecture/)
- **[System Architecture](architecture/SYSTEM_ARCHITECTURE.md)**: Master architecture document detailing the offline-first desktop agent loop, multi-process topology, security sandbox, and model connectors.
- **[Technical Documentation](architecture/DOCUMENTATION.md)**: In-depth technical guide covering IPC interfaces, model providers (Ollama, HF, Cloud), Kokoro TTS, Whisper STT, and desktop companion synchronization.

### 2. 🎯 [Product & Roadmap](product/)
- **[Roadmap & PRD](product/ROADMAP_AND_PRD.md)**: Product Requirements Document and multi-phase milestone plan (Phase 1 Mobile, Phase 2 Windows Enhancements).

### 3. 🚀 [Releases & Changelogs](releases/)
- **[Release Notes](releases/RELEASE_NOTES.md)**: Official release notes and distribution changelogs.

### 4. 🔬 [Research & Papers](research/)
- **[Research Paper](research/RESEARCH_PAPER.md)**: Academic and technical paper on local agentic reasoning, constrained planning, and on-device privacy.
- **[Research Paper PDF](research/Research%20Paper.pdf)**: Formatted PDF document of the published research paper.
- **[Research Progress Log](research/RESEARCH_PROGRESS.md)**: Detailed historical experiment log, benchmark runs, and model evaluations.

### 5. ⚡ [Enhancements & Architecture](enhancements/)
- **[AI Enhancement Guide](enhancements/AI-ENHANCEMENT-GUIDE.md)**: Comprehensive architecture and implementation guide for the thinking engine, autonomous execution, loop guards, and multi-provider models.

---

## 🧭 Repository Projects

- **[Windows Desktop App](../src/)**: Electron + Node.js + Local AI Agent loop (Windows 10 / 11 64-bit)
- **[Mobile App (React Native / Expo)](../mobile/)**: Native Android companion app (Android 10+)
- **[Website (React / Vite)](../brown-website/)**: Official website and web portal
- **[Python AI Service](../python/)**: Local Python microservice for custom scrapers and inference
- **[Scripts & Tooling](../scripts/)**: Installer generation, voice tools, and maintenance scripts
