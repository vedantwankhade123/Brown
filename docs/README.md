# Brown AI Documentation Hub

Welcome to the central documentation index for the **Brown AI Ecosystem** (Windows Desktop Application, Mobile App, and Web Application).

---

## 📚 Documentation Index

### 1. 🏛️ [Architecture & Technical Specifications](architecture/)
- **[System Architecture](architecture/SYSTEM_ARCHITECTURE.md)**: Master architecture document detailing the offline-first desktop agent loop, multi-process topology, security sandbox, and model connectors.
- **[Technical Documentation](architecture/DOCUMENTATION.md)**: In-depth technical guide covering IPC interfaces, model providers (Ollama, HF, Cloud), Kokoro TTS, Whisper STT, and desktop companion synchronization.

### 2. 📖 [Guides & Operations](guides/)
- **[Windows Distribution Guide](guides/WINDOWS_DISTRIBUTION_GUIDE.md)**: End-to-end guide on building portable executables, NSIS setup installers, and auto-update pipelines.
- **[Microsoft Store Guide](guides/MICROSOFT_STORE_GUIDE.md)**: Packaging, MSIX/APPX conversion, manifest schemas, and Windows Store submission walkthrough.
- **[Executable & Setup Explained](guides/EXECUTABLE_AND_SETUP_EXPLAINED.md)**: Technical breakdown of packaged binaries, asar unpack rules, and runtime initialization.
- **[Features & Improvements](guides/FEATURES_AND_IMPROVEMENTS.md)**: Comprehensive catalog of UI features, agent tools, connectors, and autonomy capabilities.

### 3. 🎯 [Product & Roadmap](product/)
- **[Roadmap & PRD](product/ROADMAP_AND_PRD.md)**: Product Requirements Document and multi-phase milestone plan (Phase 1 Mobile, Phase 2 Windows Enhancements, Phase 3 Cross-Platform).

### 4. 🚀 [Releases & Changelogs](releases/)
- **[Release Notes](releases/RELEASE_NOTES.md)**: Official release notes and distribution changelogs.

### 5. 🔬 [Research & Papers](research/)
- **[Research Paper](research/RESEARCH_PAPER.md)**: Academic and technical paper on local agentic reasoning, constrained planning, and on-device privacy.
- **[Research Paper PDF](research/Research%20Paper.pdf)**: Formatted PDF document of the published research paper.
- **[Research Progress Log](research/RESEARCH_PROGRESS.md)**: Detailed historical experiment log, benchmark runs, and model evaluations.

### 6. ⚡ [Enhancements & Architecture](enhancements/)
- **[AI Enhancement Guide](enhancements/AI-ENHANCEMENT-GUIDE.md)**: Comprehensive architecture and implementation guide for the thinking engine, autonomous execution, loop guards, and multi-provider models.

---

## 🧭 Repository Projects

- **[Windows Desktop App](../src/)**: Electron + Node.js + Local AI Agent loop
- **[Mobile App (React Native / Expo)](../mobile/)**: Cross-platform mobile companion
- **[Website (React / Firebase)](../Ultron%20Website/)**: Official website and web portal
- **[Python AI Service](../python/)**: Local Python microservice for custom scrapers and inference
- **[Scripts & Tooling](../scripts/)**: Installer generation, voice tools, and maintenance scripts
