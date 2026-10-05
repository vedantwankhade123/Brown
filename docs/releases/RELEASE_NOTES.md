# Brown AI Release History

Official binaries live in GitHub Releases — [Brown](https://github.com/vedantwankhade123/Brown/releases)
for Windows, [Brown-Mobile](https://github.com/vedantwankhade123/Brown-Mobile/releases) for Android.
Every release publishes versioned files **and** stable aliases (`Brown-AI-Setup.exe`,
`Brown-AI-Portable.exe`, `Brown-AI-Mobile.apk`) that always point at the newest build.

## Brown AI Desktop v1.0.8 (Latest)

## Changes
- Focus this release on offline AI chat; hide unfinished automation, CRUD tools and approval controls.
- Improve charts, diagrams, tables, mathematical notation, code answers and visual generation progress.
- Search the web before composing an answer, with intent-based queries, cited sources and verified product information. Online search requires an internet connection.
- Create background spoken summaries for rich answers that cannot be read directly by offline voice.
- Simplify onboarding: remove email, date of birth and the supplementary helper model.
- Refine dark and light themes, sidebar spacing, settings contrast, voice controls, knowledge search and Help & Support typography.
- Verify update integrity, interrupted download recovery, concurrent checks/downloads and installer launch failure handling.

## Windows downloads
- Brown-AI-Setup.exe: recommended Windows 10/11 x64 installer.
- Brown-AI-Portable.exe: portable edition; replace the executable manually to update.
- latest.yml: update manifest with installer SHA-512 and size.

## Verification
Desktop automated tests pass, including updater regressions. Mobile source tests and type checking are run separately; this release does not publish a new Android APK. Packaged Windows smoke checks and live release verification are recorded in docs/releases/RELEASE_QA_v1.0.8.md.

## Requirements and scope
Model downloads and optional web/cloud services require internet access; installed local models can answer offline. The Windows binaries are not Authenticode signed. A clean-machine installation and a complete installed-app upgrade are not certified by automated updater tests.

## 🌟 Brown AI v1.0.2

Agent, answer-quality and voice release. Full notes: [v1.0.2 on GitHub](https://github.com/vedantwankhade123/Brown/releases/tag/v1.0.2).

- **Agent browser** — Brown browses, reads and acts in a docked pane with per-action approval and public-address-only networking.
- **Session rail** — Tasks / Tools / Output / Pages / Sources follow the conversation; uploads appear only once sent.
- **Rewritten math typesetting** — shared KaTeX pass, progressive rendering while streaming, repaired LaTeX before Markdown.
- **Rich output** — extended chart engine (area, scatter, histogram, boxplot, radar, multi-series) and more Mermaid diagram types.
- **Intent-based routing** — diagrams and heavy text go to capable models; everyday chat stays local and fast. Every path streams.
- **Settings rebuilt** — Sounds / Performance / Storage on one card system, live GPU + memory + CPU telemetry, three-way **App speed** toggle.
- **Auto-updates hardened** — direct GitHub download fallback plus native Windows and Android notifications.
- **QR pairing rebuilt** — real scannable QR, code-only verification, 120 s auto-regenerating codes, port fallback.
- **Real voice** — offline Kokoro TTS and Whisper STT run on the desktop and serve the phone; true PCM capture.
- **Mobile** — ChatGPT-style chat screen with header model picker, reworked drawer, empty states, keyboard-aware composer, animated Brown mark.
- **Light theme** — full visibility pass across every rebuilt surface.

| File | Platform | Notes |
|------|----------|-------|
| **`Brown-AI-Setup.exe`** | Windows 10 / 11 x64 | Recommended NSIS installer |
| **`Brown-AI-Portable.exe`** | Windows 10 / 11 x64 | Portable, no install |
| **`Brown-AI-Mobile.apk`** | Android 10+ (arm64-v8a) | Direct APK, versionCode 4 |

## Brown AI v1.0.1

- First-run onboarding guaranteed on fresh installs and reinstalls.
- NSIS installer resets setup markers so personalization always runs.
- Onboarding state written only after all steps complete, so interrupted setup resumes cleanly.
- In-app auto-updater unified onto the official GitHub Releases feed.

## Brown AI v1.0

Production release for Windows Desktop and Android Mobile with native GitHub releases and auto-updates.

- Desktop setup installer + portable executable.
- Android direct APK with on-device models and voice.
- Shared auto-update feed for both apps.
- Brown branding and launcher icon.
