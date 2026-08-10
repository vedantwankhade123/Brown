# Ultron: An Autonomous AI Agent for Operating Systems

[![Website](https://img.shields.io/badge/Website-ultron--brown--mu.vercel.app-7928CA?logo=vercel&logoColor=white)](https://ultron-brown-mu.vercel.app/)
[![Release](https://img.shields.io/github/v/release/vedantwankhade123/Ultron?color=blue&label=Latest%20Release)](https://github.com/vedantwankhade123/Ultron/releases/latest)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D4?logo=windows)](https://github.com/vedantwankhade123/Ultron/releases)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Ultron is a premium, high-fidelity offline AI desktop assistant built specifically for Windows. Utilizing local LLMs powered by Ollama, Ultron serves as an autonomous interface agent capable of scanning configurations, executing system commands inside controlled sandbox parameters, and performing natural language operations—all while keeping your data entirely local and private.

---

## 💾 Downloads & Executables

Download pre-built ready-to-run Windows binaries directly from the official website or GitHub release:

🌐 **Official Website**: [ultron-brown-mu.vercel.app](https://ultron-brown-mu.vercel.app/)

<table width="100%">
  <thead>
    <tr>
      <th align="left" width="20%">Build Type</th>
      <th align="left" width="35%">File Name</th>
      <th align="left" width="45%">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><b>Installer</b></td>
      <td><a href="https://github.com/vedantwankhade123/Ultron/releases/download/v1.0.1/Ultron-AI-Setup-1.0.1.exe"><code>Ultron-AI-Setup-1.0.1.exe</code></a></td>
      <td>Standard Windows setup installer wizard with Start Menu and Desktop shortcuts.</td>
    </tr>
    <tr>
      <td><b>Portable</b></td>
      <td><a href="https://github.com/vedantwankhade123/Ultron/releases/download/v1.0.1/Ultron-AI-1.0.1.exe"><code>Ultron-AI-1.0.1.exe</code></a></td>
      <td>Standalone executable file. Runs immediately on Windows without installation.</td>
    </tr>
  </tbody>
</table>

> 🔗 Or view all assets on the [Official Releases Page](https://github.com/vedantwankhade123/Ultron/releases/tag/v1.0.1).

---

## Key Features

- **Seamless Free Auto-Updates:** Integrates `electron-updater` directly with GitHub Releases. Automatically checks for updates on launch, downloads patches in the background, and prompts to restart & install seamlessly.
- **Local AI recommendation Engine:** Automatically profiles host hardware specs (CPU threads, total RAM size, active GPU adapter) on boot to recommend and allocate the optimal local quantized LLM footprint (e.g. `phi4`).
- **One-Click Ollama Installer:** Silent background winget orchestration that detects, downloads, and boots local Ollama binding instances on the fly.
- **Spotlight command Overlay:** A premium, blur-backdrop full-screen command search overlay (`width: 100vw; height: 100vh`) supporting debounced natural language indexing queries over historical chat memory.
- **Dynamic AI-Driven Session Summarizer:** Automatically analyzes incoming prompt requests to summarize conversations into a concise 2-3 word topic header inside sidebar list feeds in real-time.
- **Windows Start Menu Program Scan:** Scans user and system shortcut paths (`.lnk`) and automatically resolves their absolute `.exe` targets to fetch and render **real, colored program brand logos** (like Chrome, VS Code, Brave, AnyDesk, etc.) next to setting checkable options.
- **Draggable metrics Splitter:** Real-time mouse dragging dividers to resize middle chat frames and collapse system metrics panels completely if dragged below `120px` constraints.
- **Human-in-the-Loop Validation:** High-security adaptive authorization boundary dialogs requesting human verification prior to launching command subprocesses.

## Technical Architecture

Built on a secure **Electron + CommonJS Preload Sandbox** runtime:
- **Main Process:** Handles Windows API bindings, start menu directory indexes, winget package integrations, and secure subprocess execution streams.
- **Preload Hook Layer:** Safeguards DOM accesses by exposing isolated, context-bridged IPC handlers.
- **Renderer UI:** Written in standard HTML5, custom vanilla CSS (Gemini-esque dark theme accenting), and structured Javascript controllers.

## Prerequisites

- **OS:** Windows 10/11 (Local PowerShell & WinGet enabled).
- **Inference Runtime:** [Ollama](https://ollama.com/) (Automatically installable inside settings connectors).

## Building from Source

If you prefer building from source rather than downloading the pre-compiled `.exe` binaries:

1. Clone the repository:
   ```bash
   git clone https://github.com/vedantwankhade123/Ultron.git
   cd Ultron
   ```

2. Install node dependencies:
   ```bash
   npm install
   ```

3. Build Windows Executables:
   ```bash
   npm run build:win
   ```
   *The built installer and portable binaries will be generated inside the `dist/` folder.*

4. Launch the desktop application locally:
   ```bash
   npm start
   ```

