# System Overview: Local Windows AI Agent

## Core Architecture
This project is a 100% local, privacy-focused autonomous AI agent designed exclusively as a native desktop application for the Windows operating system. The engine operates entirely offline without sending telemetry or chat context to external servers.

### Technical Foundation
*   **Desktop Shell:** Electron + Tailwind CSS (Native Windows Client layout utilizing Fluent/Mica acrylic presentation wrappers).
*   **Orchestration Engine:** Node.js + Python runtime environment communicating via secure Local Inter-Process Communication channels (`127.0.0.1`).
*   **Inference Loop:** Local Ollama API server integration running offline quantized model footprints (`llama3`, `phi4`).
*   **Data Isolation:** All chat threads, vector indices, and persistent session state variables are strictly preserved locally within the absolute path configuration specified during the application onboarding flow (`%AppData%/LocalAgent/`).

## Local Inference & Hardware Integration
1.  **Onboarding Profiler:** During installation, the system interrogates local hardware configurations (available CPU threads, GPU VRAM, physical system RAM) to determine system performance parameters.
2.  **Ollama Binding:** The engine queries the local Ollama backend to list previously installed weights.
3.  **Model Recommendations:** The application compares system profiling parameters against target architecture footprints to suggest appropriate local configurations, prioritizing lower-parameter quantized builds (e.g., 3B or 8B profiles) if system memory limits are constrained.

## Core Rules for the AI IDE (Antigravity Context)
*   **Deterministic Safety:** Never write low-level scripts that modify root system directories (`C:\Windows\`) without cross-referencing against the explicitly active security boundary state.
*   **Isolated Operations:** Network sockets are strictly bound to local interfaces. Web scraping modules via Playwright operate on local execution contexts without relaying telemetry data.