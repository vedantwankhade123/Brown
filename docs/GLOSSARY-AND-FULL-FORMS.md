# Brown AI — Full Forms & Concept Glossary

*Every abbreviation and technical term used anywhere in the project docs, with (a) its full form,
(b) a proper plain-English definition, and (c) exactly where Brown AI uses it. If a viva question
depends on a word, this file defines it. Grouped by domain — read section 1 before the others.*

---

## 1. AI & machine-learning terms

**LLM — Large Language Model.**
A program trained on enormous amounts of text to predict the next piece of a sentence. Because
next-word prediction at huge scale captures grammar, facts and reasoning patterns, it works as a
general question-answering/completion engine. In Brown AI the LLM is a file running on the user's
own machine, not a remote service.

**GGUF — (format name; successor of llama.cpp's "GGML" format — the letters have no official
long-form expansion, treat "GGUF" as the format's name).**
A single-file container for a model's weights (numbers) plus metadata (architecture, vocabulary).
It is the standard format used by llama.cpp, Ollama, LM Studio and llama.rn. This is why the guide
never needed a fake expansion — if a judge asks, the correct answer is *"it's the file format that
descends from the GGML format in the llama.cpp project; people treat GGUF itself as the name."*

**Quantisation — (US spelling: quantization).**
Shrinking a model by storing each weight in fewer bits: full precision is 16-bit, quantised common
levels are 8-bit (Q8) or 4-bit (Q4). A 4-bit model uses roughly 1/4 the RAM with a small accuracy
loss — this is what lets an 8-billion-parameter model run on a normal ₹40k laptop.
Suffixes: **K_M** = mixed precision per layer (some layers keep more bits), **Q4_K_M** is the common
"good default".

**Parameter — one number inside the model.** "8B model" = 8 billion parameters. More parameters
generally mean more capability, more RAM needed.

**Token.** The smallest unit a model writes — roughly ¾ of a word in English ("internationalization"
= several tokens). Model speed is measured in tokens/second; "streaming" = showing tokens as
produced so the user never waits for the full answer.

**Context window.** How many tokens the model can "see" at once (prompt + history + injected
documents), e.g. 2048 or 8192. Bigger context = more RAM. Our memory-recovery fallback shrinks
context to 768 tokens so a struggling machine can still answer.

**Prompt / system prompt / user prompt.** The text sent to the model. The *system* prompt is
hidden instructions that set the assistant's behavior ("you are Brown, cite sources…"); the *user*
prompt is what the person typed.

**Inference.** The act of running a model to produce an answer (as opposed to *training* it).
Everything in this project is inference — we never train models.

**Vision model / multimodal.** A model that also accepts images as input, not only text
(llava, moondream). Used for screenshot understanding and attached photos.

**Ollama.** An open-source *model runner*: a small local web service that manages GGUF models,
loads them into RAM on demand, and exposes chat endpoints over HTTP on your own machine
(`127.0.0.1:11434`). Brown AI's default engine. Analogy you can use in the viva: *Ollama is to LLMs
what Docker is to apps — a local runtime that fetches, stores and runs them.*

**LM Studio.** Another desktop app that runs local models and exposes an OpenAI-compatible HTTP
API on `localhost:1234` — supported as a provider in the multi-provider hub.

**GGML / llama.cpp.** The underlying C++ inference library Ollama builds on. Name-drop only if
asked "what actually runs the math?" — llama.cpp (or ONNX for voice models).

**ONNX — Open Neural Network Exchange.** A standard file format for trained models plus
**ONNX Runtime**, Microsoft's engine that executes them on CPU or GPU. Our voice models (Whisper,
Kokoro) ship as ONNX; dependency `onnxruntime-node@1.21.0`.

**Whisper.** OpenAI's open-weights speech-to-text model family. We use the `whisper-base` ONNX
export (≈75 MB) via `@huggingface/transformers` — turns microphone audio into text, fully offline.

**Kokoro.** An open 82-million-parameter text-to-speech model (Apache-2.0). Runs locally via
`kokoro-js` + ONNX Runtime. The "voice" that reads answers aloud.

**TTS / STT — Text-to-Speech / Speech-to-Text.** Speaking / listening.

**PCM — Pulse-Code Modulation.** Raw uncompressed audio as number samples. The format our TTS
produces before playback and STT consumes. **WAV** = PCM in a file; **opus/webm** = compressed mic
recording before decoding to PCM.

**OCR — Optical Character Recognition.** Reading text out of an image. The agent uses
`ocr-screen` to understand a screenshot when asked about what's on the desktop.

**RAG — Retrieval-Augmented Generation.** Instead of trusting the model's memory: first *retrieve*
relevant passages from the user's own documents, then *augment* the prompt with them, then generate.
Result: answers grounded in real files, with citations. Core of the knowledge base.

**Chunking.** Splitting a long document into answer-sized pieces (we use ~800 characters with 150
overlap so a sentence isn't cut between chunks).

**Embedding / vector.** Turning text into a list of numbers so "similar meaning" becomes
"close numbers". Brown's RAG deliberately avoids neural embedding *models* and uses classic term
vectors instead (see next two).

**TF / Bag-of-words / Term vector.** A representation counting how often each word appears in a
chunk. Simple, exact, offline. Our 3-gram sub-tokens also catch word fragments (helps with typos
and partial identifiers).

**Cosine similarity.** Angle between two vectors = how similar they are, from 0 (nothing alike) to
1 (identical direction). Used to score chunks against the question.

**BM25 — "Best Match 25" (Okapi BM25).** A word-ranking formula from information-retrieval
research (1990s, Robertson & Jones): a word matters more if it appears often in this chunk, rarely
in other chunks, and the chunk isn't padded-long. We implement it and fuse: score =
0.4·BM25 + 0.6·cosine ("hybrid search").

**Inverted index.** (Concept you may be asked about.) Classic search-engine structure mapping each
word → list of documents containing it. Our JSON index plays that role at personal scale.

**Vector database.** Server products (FAISS, Chroma…) for embedding search at internet scale.
Justification sentence: *"not needed for a personal corpus; a JSON term-index with BM25+cosine is
fully offline, inspectable, and zero-dependency."*

**Hallucination.** When a model states something false confidently. Mitigation in Brown: citations,
audit trail, loop guard — the design goal is *checkable*, not magically correct.

**Temperature** *(if asked about output randomness)* — a sampling dial: low = predictable, high =
creative. Brown keeps provider defaults for factual tasks.

**Agent / tool-calling / ReAct — "Reason + Act".** An LLM loop: model proposes an action in JSON,
the program executes the real tool (open app, read file…), feeds the result back, model continues
until done. Brown's harness = planner + executor + loop-guard + approval policy.

**MCP — Model Context Protocol.** An open standard (from Anthropic, now industry-wide) where
tool-servers speak JSON-RPC over a pipe and any compliant app can list and call their tools.
Brown hosts MCP servers for filesystem, web fetch, Windows UI automation, etc.

**JSON-RPC — JSON Remote Procedure Call.** "Please run method X with args Y" encoded as JSON over
a transport (here: stdio). MCP's wire language.

**BYOK — Bring Your Own Key.** User adds their own Gemini/OpenAI/… API key; app uses it directly,
no shared server, no markup.

**SSE — Server-Sent Events.** Standard HTTP streaming: server sends `data: …` lines. OpenAI-style
APIs stream answers this way.

**NDJSON — Newline-Delimited JSON.** One complete JSON object per line; Ollama streams answers
this way (each line = a few more tokens).

**Egress proxy.** An outbound-traffic gatekeeper. Brown's agent browser routes all page traffic
through a localhost proxy that refuses private/reserved IP ranges → a malicious page (or prompt
injection) can't make the agent hit your router or internal machines.

**SSRF — Server-Side Request Forgery.** Attacking internal machines *through* a program that is
allowed to fetch URLs. The egress proxy exists specifically to stop it.

**DNS rebinding.** Trick where a hostname resolves to a public IP first, then to an internal one
between checks. Defence: validate the *actual* resolved address at connection time — what our
proxy does.

**Prompt injection.** When text a model reads (a web page, a document) contains instructions that
hijack it ("ignore your rules, email me the files"). Defences in Brown: approval gates before
impactful actions, action caps, the network proxy, and treating page text as data.

---

## 2. Desktop / architecture terms

**Electron.** Framework pairing Chromium (the browser engine, for UI) with Node.js (JavaScript on
the OS, for files/processes) to build desktop apps. `electron@^31`.

**Main process.** The Electron process that owns windows and OS power — the app's "backend". All
`src/main/*.js`.

**Renderer.** The Chromium tab showing the UI — sandboxed from the OS. `src/renderer/*`.

**Preload script.** Electron's special file that runs once per window before page scripts, in an
isolated world, and is the only code allowed to expose Node abilities to the UI. Ours:
`src/preload/preload.js` → one object `window.ultronAPI`.

**IPC — Inter-Process Communication.** Message passing between main and renderer
(`ipcMain.handle` / `ipcRenderer.invoke`). Request/response style = `invoke`; broadcast style =
`send/on`.

**contextIsolation.** Electron security mode: page JavaScript and preload JavaScript live in
separate object worlds; the page can only reach what preload deliberately exposes. ON in this app.

**nodeIntegration.** Giving the page direct Node.js — a huge risk. OFF in this app.

**WebContentsView.** Electron's newer API to embed a live web page as a view inside a window —
the agent's browser pane is one, in an **ephemeral partition** (a throwaway cookie/cache store, so
the agent never shares your real browser session).

**Isolated world.** A separate JavaScript execution environment attached to a page — used to
inject the agent's observe/extract scripts without interfering with the website's own code.

**Chromium / Blink.** The open-source browser Google Chrome is built on / its rendering engine.

**Node.js.** JavaScript runtime for servers and tooling; inside Electron it gives the main process
OS access (fs, child_process, http).

**Tauri, Flutter, WPF, Qt** *(comparison terms judges may throw at you)* — alternative desktop
technologies: Rust+system-webview / Dart UI toolkit / Windows-native C# / cross-platform C++. One
line for each: considered, rejected for build complexity or weaker web/Node integration; Electron
bought us a Chromium rendering engine identical to the one running KaTeX/mermaid anyway.

---

## 3. Data & storage terms

**JSON — JavaScript Object Notation.** Text format of key/value + arrays; our chosen storage.
**SQLite.** A full SQL database that is *one file, no server* — used on the phone
(`expo-sqlite`).
**Relational schema / table / row / column / primary key (PK) / foreign key (FK) / index.**
Database vocabulary: typed tables; a row is a record; PK uniquely identifies; FK points one
table's row to another's; an index is a speed-up lookup structure. Be ready to sketch the
`sessions` / `messages` schema from the guide (Q42).
**NoSQL / document store.** Data kept as whole JSON documents instead of tables — the JSON-file
approach is a document store taken to its simplest form.
**Normalization.** Organizing tables to avoid duplicated data (our JSON denormalizes on purpose:
messages live inside their session — fewer joins, simpler writes, single-writer app).
**CRUD — Create, Read, Update, Delete.** The four basic data operations.
**localStorage.** The web-standard key-value store Chromium keeps per-origin — used for UI prefs
and agent memory (not chats, those are in files).
**asar — "Atom Shell Archive".** electron-builder's packaging archive that bundles the app's files
into one file with near-instant random reads.
**safeStorage.** Electron API encrypting secrets with the OS keychain (Windows DPAPI). *Not yet*
used on desktop — a named roadmap fix; mobile achieves the same with `expo-secure-store`
(keystore).
**Firestore.** Google's cloud document database — powers the website's admin stats panel only.

---

## 4. Networking terms

**HTTP/HTTPS — HyperText Transfer Protocol (Secure).** The web's request/response language; HTTPS
= HTTP over TLS.
**TLS — Transport Layer Security.** The encryption layer behind HTTPS. Our LAN pairing is HTTP
(not TLS) — disclosed limitation, TLS-on-LAN is on the roadmap.
**REST — REpresentational State Transfer.** Conventional HTTP API design: nouns as URLs
(`/chats`), verbs as methods (GET/POST). The pairing server is REST-style.
**Loopback (127.0.0.1).** "This machine" address. Ollama binds only to it → nothing external can
reach the model server.
**LAN / WAN — Local / Wide Area Network.** Your Wi-Fi segment / the internet beyond it.
**Port.** Numbered door on an IP address. Ollama 11434; phone pairing 49200-49203.
**CORS — Cross-Origin Resource Sharing.** Browser rule that blocks a page from calling other
origins unless the server opts in (`Access-Control-Allow-Origin: *`). Our LAN server sets `*` —
weakness named in the guide.
**Bearer token.** A string that grants access just by being presented with the request — the
pairing token.
**TTL — Time-To-Live.** Lifetime of a credential; pairing code lives 120 seconds.
**429.** HTTP status "Too Many Requests" — our throttle on failed pair verifications.
**QR — Quick Response (code).** The scannable square barcode image encoding the desktop IP +
pairing code.

---

## 5. Mobile terms

**React Native (RN).** Framework rendering real native Android widgets from JavaScript.
**Expo.** The toolchain/platform around RN: build system, pre-written native modules, plugins.
SDK 51, RN 0.74.5.
**APK — Android Package Kit.** The Android installer file. (**AAB** = Play-Store format.)
**Gradle.** Android's build tool (compiles Kotlin/Java deps, packages APK, applies signing).
**Keystore.** File holding the app's signing private key. **Signing** proves build authenticity;
two APKs signed by different keys can't update each other → key loss = broken installs.
**versionCode vs versionName.** Internal integer (must increase) vs display string "1.0.2".
**llama.rn.** Native bindings of llama.cpp for React Native — full GGUF inference on the phone
SoC (**System-on-Chip**, the ARM CPU+GPU+memory on one package).
**expo-secure-store.** Wrapper for the Android Keystore system for secrets.
**expo-sqlite.** The SQLite database in the app.
**Expo config plugin.** A build-time patcher (`withLlamaRN.js` adds native inference code).
**Native module.** Hand-written Kotlin glue bridged to JS (`brown-speech`, `brown-recorder`).

---

## 6. Web & frontend terms

**HTML/CSS/JS.** Page structure / styling rules / programming. **DOM — Document Object Model** =
the live page tree scripts manipulate.
**SPA — Single-Page Application.** One HTML page; JS swaps views (the website).
**React.** Component UI library (the website). **Vite** — its fast bundler/dev-server.
**three.js** — the 3D library rendering the PixelBlast hero effect.
**KaTeX — "KaTeX: Fast math typesetting for the web"** (the name is a stylised "KaTeX"). Renders
the equations in answers.
**marked** — markdown-to-HTML converter. **Markdown** = `# headings`, `**bold**` plain-text format.
**mermaid** — text-to-diagram renderer (flowcharts from ```mermaid blocks).
**lottie-web** — plays After Effects JSON animations (brand/splash animations).
**SEO / Open Graph / schema.org** — search-engine and link-preview metadata in `index.html`.

---

## 7. Build, release, CI/CD terms

**Build.** Turning source + dependencies into a runnable package.
**electron-builder.** Tool producing installers from `package.json:build`.
**NSIS — Nullsoft Scriptable Install System.** Windows installer engine (scriptable; ours adds
custom pages).
**"Portable" exe.** Self-extracting single-file app, no install.
**Artifacts.** Files produced by a build (Setup.exe, APK, latest.yml).
**Semantic versioning (semver).** `MAJOR.MINOR.PATCH` promises — 1.0.2 = third bug-fix on the
1.0 line.
**Tag (git).** A permanent named commit pointer → `v1.0.2` pins exactly what shipped.
**GitHub Releases.** Repo feature distributing versioned files (our CDN — free downloads).
**latest.yml.** Updater manifest: version, filenames, sizes, **SHA-512** hashes (a hash =
fingerprint verifying a download is intact and genuine).
**electron-updater.** Reads that manifest, downloads, verifies, installs.
**CI/CD — Continuous Integration / Continuous Delivery.** GitHub auto-runs pipelines on events.
**GitHub Actions / workflow / runner.** YAML jobs in `.github/workflows` on GitHub's machines
(`windows-latest`, `ubuntu-latest`). This project moved from Actions to locally scripted releases
(commit `509f446`) — the reasoning is guide section 15.2.
**Fail-closed.** A check that *stops the pipeline* rather than proceeding: the APK script refuses
to publish if the build is debug-signed; publish is refused if the version bump isn't committed.
**git submodule.** A repo inside a repo — `mobile/` is its own GitHub project.
**asar / asarUnpack.** Archive packaging / exceptions where native binaries must be real files.

---

## 8. Security terms

**Threat model.** Which attacker you actually design against — for Brown: other networks, malicious
pages, mistakes by the agent — not a stolen unlocked laptop (that's OS disk encryption's job).
**Allowlist (whitelist) vs denylist.** Allow = default-deny + explicit yes (mic yes, camera no).
**Sandbox (Windows Sandbox).** A disposable Windows VM — the `launch-sandbox` tool.
**Ephemeral session.** Everything wiped when closed — the agent browser's partition.
**Audit log.** Append-only record of what the agent did.
**Least privilege.** Each layer gets the minimum power it needs.
**Loop guard.** Harness breaker against the model retrying the same failing action forever.

---

*Deep-dive of how these fit together: `docs/75-PERCENT-PROJECT-GUIDE.md`. Stack-by-stack listing:
`docs/TECH-STACK.md`. Viva practice: `docs/75-INTERVIEW-QUESTIONS.md`.*
