# Brown AI — the readable guide

*A plain-language walkthrough of what Brown AI is, what it does, and how it actually works.
Written for presenting: every section is one idea, short sentences, diagrams you can point at.*

---

## 1. The one-sentence version

**Brown AI is an AI assistant that runs on your own computer and your own phone — it answers,
reads your files, browses the web for you, speaks and listens, and it works with no internet
connection and no subscription.**

Everything else in this document explains that sentence.

---

## 2. The problem we set out to fix

Most AI tools today work like this: you type something, it flies to a far-away server, a
giant model answers, and it comes back.

That creates four everyday problems:

| Problem | What it feels like |
| --- | --- |
| Your data leaves the machine | You hesitate before pasting a contract, a report, a private note |
| It costs money forever | Monthly subscription, per-token bills, rate limits |
| It needs the internet | Flight, hostel with bad Wi-Fi, rural area → the assistant is a blank box |
| You don't control the model | It changes without asking, gets slower, gets censored, gets retired |

**Brown AI's answer: put the model on the device instead of in the cloud.**
The intelligence is a file on your disk. Your machine does the thinking. Nothing has to leave.

---

## 3. What the product actually is: three pieces, one brain

```
        ---------------------------------------------------------
        |                  BROWN  AI  ECOSYSTEM                 |
        ---------------------------------------------------------
             |                  |                    |
     +----------------+  +--------------+   +-----------------+
     |  DESKTOP APP   |  |  MOBILE APP  |   |   WEBSITE       |
     |  Windows 10/11 |  |  Android 10+ |   | usebrown.online |
     |  Electron      |  |  Expo / RN   |   |  React + Vite   |
     +----------------+  +--------------+   +-----------------+
             |                  |                    |
     the full assistant   the pocket version   marketing, docs,
     + local models       runs models on the   downloads, admin
                          phone itself
```

- **Desktop app** — the main product. Chat, files, knowledge base, browser agent, voice, charts.
- **Mobile app** — the same assistant in your pocket, running models on the phone's own chip.
- **Website** — where people read about it and download it, plus a small admin panel.

They are three separate code repositories, released independently, and the phone and desktop
can talk to each other over your home Wi-Fi (section 9).

---

## 4. What it can do (the feature tour)

**Talk to it.** Normal chat, streaming word-by-word, with a session rail that keeps every
conversation, its title and its summary.

**Use whatever model you own.** Pick the model per chat. Local models via Ollama or LM Studio,
or cloud providers if you plug in a key. The app routes by intent: a math question, a diagram
request, and a "summarise this PDF" don't all go to the same model.

**Read your files.** Drop in PDFs, documents, code. Brown indexes them locally and answers with
citations, so you can check which page it read.

**Draw and compute.** Real math (rendered equations, not raw LaTeX), tables, and charts — bar,
line, area, scatter, histogram, box-plot, radar — plus flow diagrams. It also draws its own
task checklist while working on a multi-step request.

**Browse the web for you.** A built-in browser the agent controls. It opens pages, reads them,
clicks, and reports back — inside an isolated window, with an approval step you can see.

**Listen and speak.** Hold the mic button, talk, it transcribes; ask it to read the answer, and
a real voice speaks it. Both happen on your hardware.

**Remember a workspace.** Attach a project folder, mention files, and the assistant keeps that
context in one place instead of re-uploading every time.

**Update itself.** The desktop checks GitHub Releases in the background and offers a one-click
upgrade; the phone offers to download the new APK.

---

## 5. How a question travels through the app

This is the single most useful diagram to present. One prompt, start to finish:

```
   YOU TYPE / SAY SOMETHING
            |
            v
   [1] UNDERSTAND   what kind of job is this?  (math? file? web? diagram? plain chat?)
            |
            v
   [2] PLAN        break it into steps, decide which tools are needed
            |
            v
   [3] RETRIEVE    pull context: knowledge base, attached files, browser page, history
            |
            v
   [4] GENERATE   the model writes the answer  ->  streams out token by token
            |
            v
   [5] TYPESET     math becomes equations, data becomes charts, diagrams become pictures
            |
            v
   [6] VERIFY      loop guards + completion checks: did it actually finish the job?
            |
            v
   YOU SEE THE ANSWER (+ citations in the rail if files were used)
```

Nothing in that pipeline requires the internet. Step 3 *can* open a browser, but only when the
task needs a live page, and only through the guarded browser described next.

---

## 6. The agent: a brain with hands, and a leash

"Chatbot" means it answers. "Agent" means it *does things*. Brown's agent loop has three parts.

```
   +--------------------+        +---------------------+
   |   AGENT HARNESS    | -----> |  TOOLS (the hands)  |
   |  plan -> act ->    |        |  read file / search |
   |  observe -> repair |        |  index docs / fetch |
   +--------------------+        |  browser open/click |
            |                    |  run command        |
            v                    +----------+----------+
   +--------------------+                   |
   |   POLICY + GUARDS  | <-----------------+
   |  approval required |
   |  loop guard (no    |     every action is audited -> agent-audit log
   |  infinite retry)   |
   |  network policy    |
   +--------------------+
```

The important design choices, in plain words:

- **Approval before impact.** Anything that touches the outside world or changes your machine
  asks first. You see what it wants to do.
- **A separate browser, not your browser.** The agent drives its own window. It cannot wander
  into your logged-in sessions.
- **Network rules, not trust.** Outbound addresses are validated, private/loopback targets and
  DNS-rebinding tricks are refused. If a page is disallowed, the tool simply fails.
- **Loop guard.** If the model keeps repeating a failing attempt, the harness stops it instead
  of burning your CPU forever.
- **Everything is logged**, so "what did it actually do?" has an answer.

---

## 7. The knowledge base: how it reads your files

```
  your PDF / doc / code
        |
        v
  [extract text] -> [split into chunks] -> [vector for each chunk] -> local index
        |                                                                 |
        |                                                                 v
  question  ->  [hybrid search: keywords 40% + vector similarity 60%]  ->  top chunks
        |
        v
  answer written FROM those chunks, with citations you can click
```

Two things worth saying out loud in a presentation:

1. **The index lives on your disk**, not on a server. It survives offline, and deleting it is
   one click.
2. **Search is hybrid.** Pure vector search is bad at exact names and error codes; pure keyword
   search is bad at synonyms. Fusing both is what makes answers reliable on real documents.

---

## 8. Voice: hearing and speaking, on-device

```
  YOUR VOICE --> [record PCM/WAV] --> [Whisper model] --> text --> into the chat
  ANSWER TEXT ---------------------> [Kokoro model]   --> audio --> speaker
```

- Recording uses a small custom Android module; on desktop it captures straight into the app.
- **Whisper** turns speech into text. **Kokoro** turns text into speech, with several voices,
  including male ones.
- Both are ONNX models running locally. No audio is uploaded anywhere.
- On the phone, heavy transcription can be proxied to the paired desktop, because the desktop
  has the bigger chip and the spare power.

---

## 9. Phone + PC pairing: the handshake

The phone is not a remote control; it is a full app. Pairing simply lets it borrow the desktop's
muscle (bigger models, transcription, your files).

```
   DESKTOP                        PHONE
      |                              |
      |  shows QR + 4-char code        |
      |  (code expires in 120 s) --->|  you scan / type it
      |                              |
      |<---- pair request -----------|
      |---- request id + TTL ------->|
      |                              |
      |<---- verify(code) -----------|
      |---- token + profile ------->|   (wrong code: rejected, 5 tries then lock)
      |                              |
      |======  encrypted-ish LAN session over your Wi-Fi  ======
                threads, models, voice, files
```

Design details that make this demo-able and safe:

- The code is short-lived (120 seconds) and regenerates automatically.
- The token is stored in the phone's **secure store**, not a plain file.
- If the desktop isn't on the default port, discovery falls back through candidates and retries
  on other addresses; a 30-second health loop notices when the desktop disappears.
- If pairing fails, the phone shows the real error. There is no "success" screen for a
  connection that didn't happen.

---

## 10. The stack, and why each piece

| Piece | Tech | Why this choice |
| --- | --- | --- |
| Desktop shell | **Electron** + Node main process, plain JS renderer | Ship one app for Windows; the heavy work runs in the Node process, the UI stays light |
| Local models | **Ollama / LM Studio** (GGUF models) on desktop, **llama.rn** on Android | Industry-standard runtimes for models on consumer hardware; no GPU requirement |
| Cloud (optional) | Vercel AI SDK (`ai`, `@ai-sdk/openai`) + provider adapters for Gemini / Groq / OpenAI | One interface, swap providers without rewriting the app |
| Math | **KaTeX** shared typesetting pass | Render real equations, and stream them progressively |
| Charts + diagrams | custom chart engine + **mermaid** | Offline, no CDN, full control of the look |
| Knowledge base | **pdf-parse** + own indexing + BM25/cosine hybrid search | Keeps the whole retrieval path local and inspectable |
| Voice | **kokoro-js** (TTS), **Whisper** via ONNX Runtime | Both fully on-device |
| Agent tooling | **MCP SDK** (filesystem + fetch servers) | Standard protocol, so tools are interchangeable |
| Phone | **Expo / React Native**, `llama.rn`, `onnxruntime-react-native`, `expo-secure-store`, `expo-sqlite` | Real native inference on the handset, secure credential storage |
| Website | **React 19** + **Vite**, three.js hero, Firebase for a few extras | Static and fast, deployed on Vercel |
| Releases | **electron-builder** (NSIS + portable) and Gradle `assembleRelease`, run locally and published by `scripts/release-desktop.js` / `scripts/release-apk.js` | Built and tested on the author's machine before upload |

**No CDN anywhere.** Everything is bundled into the app; that is a deliberate rule, because a
content delivery network is an internet dependency inside an offline-first product.

---

## 11. Privacy and safety boundaries (the honest list)

- Chats, models, the knowledge index and settings live in a local app-data folder
  (`%LOCALAPPDATA%\UltronData` on Windows).
- The assistant reads **only** what you attach or point it at; the agent asks before acting.
- Network access is policy-checked; private and loopback targets are refused.
- Cloud providers are opt-in and only used when you add your own key.
- The phone stores its pairing token in the OS keystore.
- Usage telemetry: none. The one cloud sync is the account/device stats sent to Firestore when a
  user sets an onboarding email (it feeds the website admin panel) — no chats, files or prompts.
  If a feature needs the internet, the app says so on screen.

---

## 12. How the product gets built and shipped

Three repositories, built and shipped from the author's own machine — there is no CI.

```
  built locally, tested by hand, then tagged and published
        |
        +--> Desktop (Brown.git)
        |      npm test -> electron-builder -> Setup.exe + Portable.exe
        |      -> latest.yml -> git tag v1.0.3 -> gh release -> GitHub Releases
        |
        +--> Mobile (Brown-Mobile.git)
        |      tsc + tests -> Gradle assembleRelease (local release keystore)
        |      -> APK signer verified -> Brown-AI-Mobile.apk -> tag -> Release
        |
        +--> Website (Brown-Website.git)
               npm run build -> Vercel -> usebrown.online
```

- **Releases use two names for the same file**: a versioned one
  (`Brown-AI-Setup-v1.0.2.exe`) and a permanent alias (`Brown-AI-Setup.exe`).
  The website and the READMEs link the alias, so links never rot after a new version.
- **Desktop auto-update** reads `latest.yml` and hashes, so a corrupted download is rejected.
- **The APK release fails closed**: if `android/keystore.properties` is missing, or the finished
  APK's signing block says `Android Debug`, the script refuses to publish a debug-signed APK
  pretending to be a release.
- **A tag never points at an unrepeatable build**: `--publish` stops unless the version bump is
  already committed, so what is on GitHub Releases can be rebuilt from the tag.

Current live state: **v1.0.2** on both desktop and mobile, website deployed and pointing at it.

---

## 13. Two-minute demo script (if you get to show it live)

1. Open the app → point out the session rail and the model picker. *"This is a local model."*
2. Ask a math question → equations render live, token by token.
3. Ask for a chart from small data → chart appears in the answer.
4. Attach a PDF → answer cites the source; open the rail to show citations.
5. Start a browser task → show the approval prompt, then the agent reading a page.
6. Pair the phone (QR or 4-character code) → show the desktop appearing on the phone.
7. Press and hold the mic → speak → text → "read it back" → voice.
8. Turn **Airplane mode on** and do one more question. That is the whole pitch in one move.

---

## 14. Questions you will be asked (with 30-second answers)

**"How good can a local model be?"**
Depends on the model you install. Brown is a runtime and a workflow, not a single model. Small
quantised models handle chat, summarising and structured output well; you can swap in a bigger
one, or add a cloud provider for the hard jobs.

**"Isn't Electron heavy?"**
Yes, and it is the right trade: one codebase, full access to the file system and to local
model processes, and it installs like a normal Windows program. The alternative — a native UI —
would cost months for the same features.

**"What if the answer is wrong?"**
Citations and sources make it checkable, the agent records what tools it used, and the loop
guard prevents endless confident retrying. Brown aims to be auditable, not magically correct.

**"Why not just use ChatGPT?"**
Different job. ChatGPT is the strongest general model; Brown is the assistant that can touch
your files, your folders and your hardware without uploading them, keep working on a train, and
let you change the brain underneath.

**"Where is the line between offline and online?"**
Default is offline. The app goes online only for three things you trigger: fetching live web
pages, cloud model providers you configure, and checking for app updates.

---

## 15. Glossary (for the awkward questions)

| Term | Plain meaning |
| --- | --- |
| **LLM / model** | The text-generating brain; here it is a file running on your machine |
| **GGUF** | The standard file format for those local model files |
| **Quantised** | A model compressed so consumer hardware can run it |
| **Tokens** | Pieces of words; streaming shows them as they are produced |
| **RAG** | Retrieval-Augmented Generation: find relevant chunks of your documents, then answer from them |
| **Embedding / vector** | Numbers that represent meaning, so "similar" can be measured |
| **BM25** | Classic keyword scoring; paired with vectors for hybrid search |
| **Agent harness** | The loop that plans, calls tools, reads results and repairs mistakes |
| **MCP** | Model Context Protocol — a standard way to hand an assistant tools |
| **STT / TTS** | Speech-to-text / text-to-speech |
| **ONNX Runtime** | The engine that runs voice and embedding models efficiently |
| **Electron / Expo** | The frameworks for the desktop app and the phone app |
| **latest.yml** | The manifest the auto-updater reads to know what's new and to verify the download |

---

*Sources for the technical claims in this document: `package.json` build and dependency
configuration, `src/main/*` (agent harness, RAG engine, voice, browser, sync server),
`mobile/src/*` (screens, sync, updater, voice), and the release scripts
`scripts/release-desktop.js` and `mobile/scripts/release-apk.js`.*
