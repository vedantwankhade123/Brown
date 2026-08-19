# Ultron: Features & UI/UX Improvements Specification

This document details all the architectural features, design specifications, and UI/UX improvements engineered for the **Ultron Desktop Companion** and **Ultron Autonomous AI Agent**.

---

## 1. Ambient Desktop Mini-Pill System

### 1.1 Overview
A persistent, lightweight desktop widget (`216px × 52px`) that hovers unobtrusively above the Windows taskbar, providing instant access to Ultron while preserving 100% OS interactivity for background applications.

### 1.2 Key Features & Visual Improvements
* **Pure Black Aesthetic:** Designed with a deep, solid black capsule background (`#000000`) and a subtle dark border (`#27272a`), creating a high-contrast obsidian finish.
* **Original Crisp White Emblem:** Features the official Ultron geometric logo rendered in crisp, high-resolution white (`#ffffff`).
* **Metallic Text Sweep Animation:** The *"Ask Ultron"* text features an ambient, continuous shimmer sweep gradient (`linear-gradient(90deg, #ffffff, #94a3b8, #ffffff)`) animated smoothly over a 4.5s loop.
* **Micro-Interactions & Spring Feedback:**
  * **Hover Lift:** Glides upward subtly on mouse hover (`transform: translateY(-2px) scale(1.02)`).
  * **Active Click Spring:** Compresses with a tactile spring response (`transform: scale(0.96)`) before instantly expanding the full companion bar.
* **External Floating Close Button (`✕`):** A sleek circular dismiss button that appears on hover, allowing users to cleanly close the widget.
* **Dynamic OS Click-Through Bounds:** Seamlessly resizes the underlying Electron BrowserWindow between `216px × 52px` (mini mode) and `780px × 580px` (full mode), ensuring no invisible transparent window captures mouse clicks meant for background desktop apps.

---

## 2. Desktop Floating Companion Bar

### 2.1 Overview
An expandable, hardware-accelerated floating command bar (`Ctrl+Space`) anchored above the Windows taskbar for instantaneous query dispatch, voice input, model selection, and tool execution.

### 2.2 Separated Floating Island Pills
* **Dynamic Island Architecture:** The top option triggers float gracefully with a clean **`8px` gap** above the main prompt input capsule:
  * **Model Selector Pill (`[ 🦙 phi3:latest ▾ ]`):** Located on the left side of the top row, displaying active model name, offline Ollama icon, and dropdown chevron.
  * **Authorization Selector Pill (`[ 🛡 Smart Auto-Approval ▾ ]`):** Located on the right side of the top row, displaying the active security level and status indicator.
* **Pristine 360° Symmetrical Focus Ring:** Decoupling the top pills from the main input capsule enables a continuous, uninterrupted 360° rounded focus glow when typing into the prompt field.
* **Auto-Minimization on Screen Blur:** Clicking anywhere else on the screen (or switching focus to any external app) automatically minimizes the full companion bar into the compact **Ask Ultron** mini-pill widget.

---

## 3. Ultron Action Authorization Hierarchy

### 3.1 Overview
A deterministic, three-tier security and execution boundary implemented across both the Floating Companion and the Main Application Window.

### 3.2 Security Tiers (Title Case Standard)
1. **Prompt Every Action (Strict Mode):**
   * *Description:* Requires explicit user confirmation modal before editing files, running shell commands, or accessing the web.
   * *Icon:* High-contrast crisp white shield check (`#ffffff`).
2. **Smart Auto-Approval (Adaptive Mode - Default):**
   * *Description:* Automatically approves routine read-only system operations while prompting for potentially risky destructive actions.
   * *Icon:* Electric blue shield pulse (`#3b82f6`).
3. **Full Autonomous Mode (Trusted Pipeline):**
   * *Description:* Grants unrestricted background execution for seamless automated workflows and batch tasks.
   * *Icon & Accents:* Vivid security warning orange (`#f97316`).

---

## 4. Upward-Opening Popover Ecosystem

### 4.1 Plus Menu (`+`) - Attachments & Agent Capabilities
* **File Attachments:** Upload text, source code files, or image screenshots directly to prompt payloads.
* **Live Capability Toggles:**
  * **Agent Tools:** Enable/disable local file operations and terminal scripts.
  * **Screen Aware:** Enable/disable desktop screenshot analysis for multimodal vision tasks.
  * **Web Search:** Enable/disable live internet lookups.

### 4.2 Offline Model Selector (`#model-dropdown`)
* **Constrained Icon Alignment:** Standardized `18px × 18px` icon dimensions preventing oversized image overflow bugs.
* **Dynamic Ollama Sync:** Automatically reads and lists all locally installed GGUF models (`phi3`, `llama3`, `mistral`, `gemma`, `qwen`).
* **Download Models Shortcut:** Integrated quick-action item triggering direct model retrieval from Ollama library.

### 4.3 50% Expanded AI Response Card (`#answer-card`)
* **Multi-Format Markdown Renderer:** Renders tables, bullet trees, inline LaTeX math, and syntax-highlighted code blocks.
* **Streaming Waveform Indicator:** Real-time generation feedback while tokens stream from local LLM inference engines.
* **Session Hand-Off & One-Click Copy:** Expand complete conversation threads directly into the Main Window dashboard.

---

## 5. Main Window & Settings Overhaul

### 5.1 Advanced Options Consolidation
* **Tightened Header Spacing:** Optimized vertical rhythm, eliminating redundant top/bottom gaps around system resource configuration.
* **Modern Action Iconography:**
  * `📄` File document icons across all Sound Event custom file pickers.
  * `📥` Download button with loading spinner for Windows UI Automation connector installation.
  * `🔄` Refresh status button for real-time connector heartbeat checks.
  * `+` Add Workflow, `▶` Run Workflow, `📅` Schedule, and `🗑` Delete action buttons.
* **UI Controls & Desktop Companion:** Toggle setting to enable/disable persistent mini-pill display on window minimize.
* **Generous Bottom Spacing:** Expanded tab-pane bottom clearance (`padding-bottom: 44px`) across all settings panels.

---

## 6. Architecture & Security Infrastructure

* **Deterministic Path Blacklist Interceptor:** Hardcoded protection preventing writes or deletions targeting sensitive Windows system paths (`C:\Windows\`, `C:\Program Files\`, `AppData\Local\Microsoft\Windows\`).
* **Model Context Protocol (MCP) Integration:** Extensible stdio daemon architecture connecting `mcp-windows` (named pipes UI automation) and `windows-mcp` (cursor & screen control).
* **100% Offline Data Sovereignty:** Zero cloud telemetry, zero remote log exfiltration, and full on-device execution.
