# Brown AI — Install Destinations & Data Folders

Every folder and file Brown AI (Windows desktop app) creates or uses on a machine,
with the code that owns each path. Environment variables: `%LOCALAPPDATA%` =
`C:\Users\<User>\AppData\Local`, `%USERPROFILE%` = `C:\Users\<User>`, `%TEMP%` = temp dir.

## 1. Application install (NSIS setup: `Brown.AI.Setup.vX.exe`)

| Path | What |
|---|---|
| `%LOCALAPPDATA%\Programs\Brown AI\` | Default per-user install dir (user can change during setup). Contains `Brown AI.exe`, app resources, uninstaller. |
| `<install dir>\resources\app.asar` | Packaged app code. |
| `<install dir>\app-update.yml` | electron-updater config; auto-update feed = GitHub `vedantwankhade123/Brown-Releases`. |

In **production** the unified data root defaults to the install folder itself
(data lives next to the binary). See §3.

## 2. Electron user-data (app cache & config)

| Path | What |
|---|---|
| `%LOCALAPPDATA%\UltronData\` | Packaged app `userData` (Electron cache, GPU cache, `ultron-config.json`). |
| `%LOCALAPPDATA%\UltronDataDev\` | Same, for unpackaged dev runs (`npm start`). |

`ultron-config.json` (inside the above) stores the onboarding profile
(name, birthdate, email) and `setupCompleted` flag.

> Note: the on-disk folder name is still `UltronData` (legacy internal name kept
> for installed-user continuity); only the product/brand is Brown.

## 3. Unified data root (conversations, connectors, models)

Resolved by `src/main/paths.js` (`getDefaultUltronRoot`), persisted in
`<root>\data\storage-config.json`:

| Mode | Root |
|---|---|
| Dev (`npm start`) | `{repo}\brown-local\` |
| Production | install folder (fallback: `%LOCALAPPDATA%\UltronData`) |

Layout created under the root (`ensureUltronStorageLayout`):

```
<root>\
├── data\                  # agent data (agentDataDir)
│   ├── conversations.json # saved chat sessions
│   ├── storage-config.json# persisted layout paths
│   ├── memory\            # agent execution memory
│   └── temp\
├── connectors\            # MCP / API connector state
└── models\                # model weights & caches (also OLLAMA_MODELS)
```

## 4. Local AI engines & voice caches

| Path | What |
|---|---|
| `<root>\models\` | GGUF/Ollama-managed weights (`OLLAMA_MODELS` env points here). |
| `%USERPROFILE%\.ollama\` | Ollama's own install/models if Ollama runs standalone (`%LOCALAPPDATA%\Programs\Ollama\ollama.exe` or `C:\Program Files\Ollama\`). |
| `<root>\models\tts-cache\kokoro-*\` | Kokoro neural TTS engine cache (Heart/Michael voices). |
| `<root>\models\tts-cache\stt-whisper\` | Local Whisper STT model cache (`Xenova/whisper-tiny.en`, HuggingFace cache). |

## 5. Windows UI Automation MCP server

| Path | What |
|---|---|
| `%LOCALAPPDATA%\UltronData\mcp-windows-uia\` | Downloaded/extracted UI-automation MCP server (`src/main/mcp-windows-uia.js`). |

## 6. Temporary helpers (`%TEMP%`)

| Path | What |
|---|---|
| `%TEMP%\ultron-stt-live\` | Compiled C# live speech helper (`ultron-stt-live.exe`) + version marker. |
| `%TEMP%\ultron-windows-stt.ps1` | Fallback PowerShell STT script (only if bundled script missing). |
| `%TEMP%\ultron-stt-*.wav` | Short-lived WAV files for one-shot transcription. |

## 7. Renderer local storage (Chromium profile inside `%LOCALAPPDATA%\UltronData`)

Keys (prefix `ultron-`): `ultron-device-id`, `ultron-user-email`, `ultron-user-name`,
`ultron-privacy-accepted(-at)`, `ultron-privacy-version`, `ultron-setup-completed`,
`ultron-memory-enabled`, performance/voice settings, provider API keys (DPAPI-encrypted).

## 8. Backend (website / admin portal, Firebase project `ultron-da7a0`)

| Firestore collection | What |
|---|---|
| `deviceAppSync/{deviceId}` | Desktop telemetry: email, name, appVersion, `privacyAccepted` + timestamp, lastOnlineAt — shown in Admin → Downloads ("App Verified", "✓ Privacy & Terms Accepted"). |
| `uniqueDownloads/{deviceId}` | Per-device download tracking. |
| `users/{uid}`, `earlyAccessRequests`, `contactMessages` | Website accounts / requests / messages. |

## 9. Repo-local dev folders (this repository)

| Path | What |
|---|---|
| `brown-local\` | Dev unified data root (§3). |
| `brown-website\` | Website source (separate repo `Brown-Website`). |
| `dist\` | Build output: `Brown.AI.Setup.vX.exe`, `Brown.AI.vX.exe` (portable), `latest.yml`. |
| `mobile\` | Android companion app (separate repo `Brown-Mobile`, Expo/React Native). |

### Local development servers & caches

| What | Where / command |
|---|---|
| Desktop app (dev) | `npm start` at repo root (Electron). Dev `userData` = `%LOCALAPPDATA%\UltronDataDev\`. |
| Website dev server | `cd brown-website && npm run dev` → `http://127.0.0.1:5173`. |
| Website preview (built) | `cd brown-website && npm run preview` → `http://127.0.0.1:4173` (serves `brown-website\dist\`). |
| Website build output | `brown-website\dist\` (Vite) — deployed to Vercel (`usebrown.online`). |
| Website deps / cache | `brown-website\node_modules\`, `brown-website\node_modules\.vite`. |
| Whisper STT cache (dev) | `brown-local\models\tts-cache\stt-whisper\`. |
| Live-speech helper (dev) | `%TEMP%\ultron-stt-live\`. |

### Admin panel & routing

- Production admin URL: `https://usebrown.online/#admin` (hash) — or `https://usebrown.online/admin`
  now that `brown-website\vercel.json` rewrites `/admin` → `/index.html`.
- Requires Google sign-in with an account in the Firestore admins list.
- `vercel.json` rewrites live in `brown-website\vercel.json`; Vercel redeploys on push to `Brown-Website` `main`.
