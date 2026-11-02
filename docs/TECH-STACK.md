# Brown AI — Complete Tech Stack, Layer by Layer

*Every technology used in this project, organized the way a judge will think about it: frontend →
backend → database/data → AI layer → networking → mobile → website → build/release/devops →
testing → design/asset tools. Each entry: **full form**, **what it is in one line**, **what it
does HERE**, **where in the code**.*

Related files: plain definitions & abbreviations → `docs/GLOSSARY-AND-FULL-FORMS.md`;
architecture + honest status → `docs/75-PERCENT-PROJECT-GUIDE.md`.

---

## 0. The stack at a glance

```
┌───────────────────────── FRONTEND (what users see) ─────────────────────────┐
│ Desktop UI: HTML + CSS + vanilla JavaScript (Electron renderer)             │
│ Mobile UI:  React Native + TypeScript (Expo)                                │
│ Website UI: React + Vite                                                    │
│ Rendering libs: marked (markdown) · KaTeX (math) · mermaid (diagrams) ·     │
│                 custom chart engine · lottie-web (animations)               │
├───────────────────────── BACKEND (where work happens) ──────────────────────┤
│ Desktop "backend" = Electron MAIN PROCESS (Node.js):                        │
│   IPC handlers · agent harness · RAG engine · voice engines ·               │
│   pairing HTTP server · MCP manager · updater                               │
│ AI backend = Ollama (separate local service, HTTP 127.0.0.1:11434)          │
│ Website backend = Firebase Firestore (download/device stats only)           │
│ (there is deliberately NO central company server)                           │
├───────────────────────── DATA LAYER ────────────────────────────────────────┤
│ Desktop: structured JSON files (conversations, config, RAG index)           │
│ Mobile:  SQLite via expo-sqlite + Android keystore via expo-secure-store   │
│ Website: Firestore (stats only) · localStorage (UI prefs)                   │
├───────────────────────── AI / MODEL LAYER ──────────────────────────────────┤
│ Ollama + GGUF models (llava, llama3.2, phi4, qwen2.5, deepseek-r1, …)      │
│ ONNX Runtime: Whisper (STT) · Kokoro (TTS) · @huggingface/transformers      │
│ Vercel AI SDK (ai + @ai-sdk/openai) for cloud providers · multi-provider hub│
│ MCP SDK for agent tools                                                     │
├───────────────────────── DEVOPS / RELEASE ──────────────────────────────────┤
│ electron-builder (NSIS + portable) · electron-updater · GitHub Releases     │
│ scripts/release-desktop.js · Gradle + release keystore (APK) · Vercel       │
│ git submodules · GitHub Actions (history: retired to local builds)          │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Frontend — desktop UI

| Tech | Full form / meaning | Role in Brown AI | Where |
| --- | --- | --- | --- |
| **HTML5** | HyperText Markup Language v5 | Structure of every screen (chat, settings, onboarding, floating bar) | `src/renderer/index.html` (~3,200 lines), `floating-bar.html` |
| **CSS3** | Cascading Style Sheets | All styling + **design tokens as CSS custom properties** (`--bg-primary`…) → one `data-theme` attribute flips dark/light | `src/renderer/index.css` |
| **Vanilla JavaScript (ES2020+)** | plain JS, no framework | All UI logic, ~35 global script files + `renderer.js` (~26,500 lines); view switching by classList, no router | `src/renderer/*.js`, `src/agent/*.js` |
| **marked** | markdown → HTML converter | Renders AI answers (headings, lists, code fences) — vendored into preload | `src/preload/marked.cjs` |
| **KaTeX** | fast math typesetting library | Renders real equations from `$…$` as streaming arrives; a shared scanner protects math spans from markdown repairs | `renderer.js:2330-2545`, vendored in `node_modules/katex` |
| **mermaid** | text-to-diagram JS | Flow/sequence diagrams from ```mermaid blocks | vendored, offline |
| **lottie-web** | After-Effects JSON animation player | Brand/splash micro-animations | `package.json:dependencies` |
| **Custom chart engine** | own SVG/canvas code | bar/line/area/scatter/histogram/box/radar charts in answers, offline, on-brand | `src/renderer/canvas-artifacts.js` |
| **Fonts: Outfit + JetBrains Mono** | Google-licensed fonts | UI font + code font — **bundled in-app, no CDN** (offline rule) | `src/renderer` assets |
| **Inline SVG icons** | vector icons in markup | 115 stroke icons from the real app, recolored by `currentColor` | `index.html` / `app.js` |

**What is NOT here (know this cold):** no React/Vue/Angular, no Tailwind, no bundler/transpiler,
no CDN at runtime in the desktop app. Why → guide Q57; risks & mitigations → Q12.

## 2. Frontend — Electron runtime & bridge

| Tech | Full form | Role | Where |
| --- | --- | --- | --- |
| **Electron 31** | Chromium + Node.js desktop framework | The whole desktop app shell; two windows (main + transparent always-on-top floating bar) | `package.json:devDependencies`, `src/main/index.js:61-180` |
| **Node.js** | JS runtime for servers/tools | Powers the main process: fs, child_process (spawns Ollama/MCP/the NSIS installer), http server | all of `src/main/` |
| **Preload + contextBridge** | Electron's secure bridge pattern | Exposes ONE object, `window.ultronAPI` (~140 typed async methods) — the UI's entire view of the OS | `src/preload/preload.js` |
| **ipcMain / ipcRenderer** | Electron IPC APIs | Every UI action (`invoke`) and every push event (`send/on`) between processes | `src/main/ipc.js:1050-4185` |
| **WebContentsView** | Electron embedded-web-view API | The agent's browser pane, in an ephemeral partition with sandbox+isolation | `src/main/agent-browser.js` |

## 3. "Backend" — the main-process services

(Desktop-app inversion: the **backend runs inside the same install** — there is no company server.)

| Component | What it does | Where |
| --- | --- | --- |
| **IPC handler layer** | ~140 endpoints grouped: chat persistence, files, models, voice, RAG, browser, sync, security, updates | `src/main/ipc.js`, `updater.js`, `agent-browser.js` |
| **Agent harness** | plan→act→observe→repair loop, loop guard, approvals, audit log | `src/main/agent-harness-*.js`, `src/agent/` |
| **RAG engine** | chunking, TF vectors, BM25+cosine hybrid search, citations | `src/main/rag-engine.js` |
| **Voice engines** | Whisper ONNX STT, Kokoro ONNX TTS, Windows live dictation fallback, model download managers | `src/main/voice-*.js` |
| **Desktop sync server** | LAN HTTP server: pairing, chat sync, model proxy, STT proxy | `src/main/desktop-sync-server.js` |
| **MCP manager** | spawns/queries MCP tool servers over stdio | `src/main/mcp-manager.js` |
| **Hardware profiler** | CPU/RAM/GPU audit → model recommendation, ONNX device choice | `src/main/hardware.js`, `gpu-config.js` |
| **Updater** | electron-updater feed + fallback direct download | `src/main/updater.js` |
| **Security/policy** | command/path blacklist, security modes, Windows Sandbox launcher | `src/main/security.js`, `sandbox.js` |

## 4. AI / model layer

| Tech | Full form / meaning | Role |
| --- | --- | --- |
| **Ollama** | open-source local model runner | Default engine; HTTP on `127.0.0.1:11434`; NDJSON streaming; model pull/load/unload; auto-started |
| **GGUF models via Ollama** | model file format + weights | `llava:latest` default (vision) + catalog: llama3.2/3, mistral(-nemo), phi3/phi4, gemma2:2b, qwen2.5(+coder), deepseek-r1, codellama, starcoder2, smollm2, tinyllama, hermes3, granite3, moondream, bakllava, vicuna + Ollama-Cloud variants |
| **@huggingface/transformers 3.8** | JS ML library (transformers.js) | Runs Whisper ONNX in-process for STT |
| **onnxruntime-node 1.21** | Microsoft's ONNX inference engine (native addon) | Executes voice models on CPU/GPU; the ONLY native `.node` binary shipped |
| **kokoro-js 1.2** | Kokoro-82M TTS wrapper | Local voice output, 4+ voices |
| **ai 7 + @ai-sdk/openai 4** | Vercel AI SDK (TypeScript provider toolkit) | Unified interface for OpenAI-compatible providers used by the harness (`agent-harness-provider.js`) |
| **multi-provider hub (custom)** | provider adapters | Gemini / OpenAI / Anthropic / DeepSeek / Groq / LM Studio BYOK, SSE parsing, model capability filtering |
| **zod 4** | TypeScript schema validator ("zod") | Validates model/tool JSON shapes where used |
| **MCP SDK 1.30 + server-filesystem + mcp-fetch-server** | Model Context Protocol implementations | Pluggable agent tools (files, web fetch) over stdio |
| **pdf-parse 2.4** | PDF text extraction (pdf.js-based) | Attachments + RAG ingest; with a hand-written zlib PDF fallback (`ipc.js:8-176`) |

## 5. Data layer (database question lives here)

| Store | Technology | Contents | Why this tech |
| --- | --- | --- | --- |
| `conversations.json` | JSON file | all chats: sessions → messages | single-writer, inspectable, survives updates, zero native deps |
| `ultron-config.json` | JSON file | profile, settings, provider keys, pair tokens | same |
| `rag_knowledge_index.json` | JSON file (custom document store) | sources + chunks + term vectors | fully offline, deletable in one click |
| `mcp-config.json`, voice state JSONs | JSON files | connector/voice install state | same |
| renderer `localStorage` | Chromium key-value store | UI prefs, agent memory keys (`ultron-agent-*`) | built into Electron |
| **Mobile app** | **SQLite** (`expo-sqlite`) | relational chats/messages with indexes | real RDBMS where concurrency needs it — shows both sides of the JSON-vs-SQL trade |
| Mobile secrets | Android keystore (`expo-secure-store`) | pairing token, cloud keys | OS-level encryption |
| Website stats | **Firestore** (Google cloud NoSQL document DB) | download counts, device/app stats | cheap, realtime, feeds admin panel |
| Distribution | GitHub Releases + `latest.yml` | installers + signed manifests | free CDN + hash verification |

**SQL concepts to cite if pushed:** tables/rows/PK/FK/index/normalization/ACID → the phone's
schema uses them (`sessions(id PK…)`, `messages(id PK, session_id FK…)`); the desktop chose a
document-store shape instead — that's a database *design* choice, not absence of knowledge.

## 6. Networking layer

| Tech | Role |
| --- | --- |
| **HTTP + fetch (undici/Node http)** | renderer↔Ollama loopback, provider calls, sync server, update checks |
| **Node `http` module** | the LAN pairing server (`desktop-sync-server.js`, ports 49200-49203) |
| **qrcode 1.5** | generates the pairing QR matrix |
| **ws 8** | WebSocket support for tool transports |
| **systeminformation 5.23** | OS/hardware audit (not network, sits here as the system-info dep) |
| **agent-browser egress proxy** | custom 127.0.0.1 proxy validating every outbound IP (blocks private/reserved ranges) |

## 7. Mobile stack (`mobile/`, git submodule → Brown-Mobile)

| Tech | Full form | Role |
| --- | --- | --- |
| **Expo SDK 51** | React Native toolchain/platform | build system, config plugins, dev client |
| **React Native 0.74.5** | native UI from JS | all 5 screens (Chat, Model Store, Desktop Sync, Onboarding, Settings) |
| **TypeScript 5.3** | typed superset of JS | whole app |
| **llama.rn 0.13-rc** | llama.cpp bindings for RN | on-device GGUF inference (via `plugins/withLlamaRN.js`) |
| **onnxruntime-react-native** | ONNX on mobile | Kokoro TTS engine |
| **expo-sqlite 14** | SQLite wrapper | app database |
| **expo-secure-store 13** | keystore wrapper | pairing tokens/API keys |
| **expo-camera / expo-av / expo-speech** | camera, audio, system TTS | QR scanner, playback, fallback voice |
| **native modules: brown-speech, brown-recorder** | hand-written Kotlin | Android SpeechRecognizer STT + mic capture |
| **Gradle + keystore.properties** | Android build tool + signing key file | release APKs, signature-verified publishing |
| **GitHubUpdateService (custom)** | checks `Brown-Mobile/releases/latest` | in-app APK updates |

## 8. Website stack (`brown-website/` → usebrown.online)

| Tech | Full form | Role |
| --- | --- | --- |
| **React (latest) + Vite (latest)** | component UI library / fast bundler | SPA: hero, features, architecture, download, docs, blog, admin, privacy, terms |
| **three.js 0.186** | 3D library on WebGL | PixelBlast dithered hero background effect |
| **firebase SDK 12 (Firestore)** | Google cloud backend | download/device stats + `firestore.rules` |
| **`app.js` (vanilla, bundled)** | legacy script | terminal simulator, FAQ accordions, visualizer, stars button |
| **brownVideo.js** | custom player layer | branded video UI over the MP4 |
| **Vercel (`vercel.json`)** | hosting platform | SPA rewrites, immutable asset caching, deploys |
| **SEO/OG/schema.org meta** | search & link-preview markup | canonical `https://usebrown.online` |

## 9. Build / release / DevOps stack

| Tech | Full form | Role |
| --- | --- | --- |
| **electron-builder 24.13** | packaging tool | NSIS Setup + portable exe, asar, native unpack rules, installer art |
| **NSIS** | Nullsoft Scriptable Install System | the Windows installer (custom `installer.nsh`) |
| **electron-updater 6.3** | auto-update lib | GitHub feed, 30-min checks, sha512 verify, direct-download fallback |
| **GitHub Releases** | file distribution on repos | the CDN — versioned file + permanent alias + `latest.yml` |
| **scripts/release-desktop.js** | custom Node release orchestrator | test-gate → build → stage → tag → `gh release`; refuses uncommitted version bumps |
| **mobile/scripts/release-apk.js** | custom | Gradle release + signing verification (fails closed on debug signer) |
| **GitHub Actions (YAML)** | CI/CD platform | history: `ci.yml`/`release.yml`/`build-apk.yml` existed; retired 2026-09-30 to local builds (guide §15.2 — have the trade-off answer ready) |
| **git + submodules** | version control | desktop repo, `Brown-Mobile`, `Brown-Website` as independent repos/tags |
| **gh CLI** | GitHub command-line | release creation from scripts |

## 10. Testing & tooling stack

| Tech | Role |
| --- | --- |
| **tests/run.js** | hand-rolled Node test runner — `npm test`, the gate before every release |
| **CDP (Chrome DevTools Protocol)** | live Electron debugging: attach to the running app, evaluate DOM/state, screenshots — used throughout UI QA (method notes in `docs/`) |
| **Mock-API harnesses** | the sandbox technique used for the design tooling (a fake `figma`/API surface in plain Node to smoke-test generators before running in the real app) |
| **PowerShell + System.Drawing / csc.exe** | asset resizing; compiling the tiny C# WinRT speech helper on first run |

## 11. Design & asset tooling (honest note)

- **Figma plugin route: tried, abandoned 2026-10-01.** A generated plugin rebuilt all 43 screens,
  but never rendered clean in Figma; folder deleted. Lesson captured: asset generation must not
  depend on iterating inside a third-party GUI.
- **Current route for the launch video:** capture real screens from the running app (CDP
  screenshots / high-res exports) and reuse `Assets/` + Lottie files.
- Fonts (Outfit, JetBrains Mono), icons (inline SVG), logo PNGs, installer BMP art — all local.

## 12. One-line answers for "what is X?" flashcards

Electron → Chromium+Node desktop framework · Node.js → JS runtime outside browsers · IPC →
process-to-process messaging · preload → the only sanctioned bridge · Ollama → local model server ·
GGUF → model file format · quantisation → compressing model weights to run on small hardware ·
RAG → retrieve-then-answer from your files · BM25 → keyword ranking formula · ONNX → model file
format+runtime for voice · MCP → standard way to give an agent tools · SQLite → serverless SQL
database file · Firestore → cloud document database · Expo → React Native toolchain · APK → Android
installer file · NSIS → Windows installer engine · electron-updater → auto-update via
latest.yml+hashes · Vite → web bundler · Vercel → web host · GitHub Releases → file CDN · CI/CD →
automated build-test-ship · KaTeX → math renderer · semver → version-number promise.

---

*Versions verified from `package.json` files on 2026-10-01. Deep architecture + the honest
"what's not done" board: `docs/75-PERCENT-PROJECT-GUIDE.md`.*
