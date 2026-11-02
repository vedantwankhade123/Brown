# Ultron directory guide

This workspace contains Brown AI's desktop app, mobile app, website checkouts, creative work, documentation, and local development data.

## Application and development

| Location | Contents |
| --- | --- |
| `src/` | Desktop application source; entry point: `src/main/index.js` |
| `mobile/` | Android companion project and Git submodule |
| `brown-website/` | Separate website checkout |
| `python/` | Python services and tools |
| `scripts/` | Build, release, and maintenance scripts |
| `tests/` | Desktop test suite |
| `Assets/` | Application images, icons, sounds, and installer artwork |
| `voices/` | Local voice model binaries |
| `node_modules/` | Installed dependencies |

Keep these folder names stable: source code, tooling, and build configuration refer to them.

## Documentation and reports

| Location | Contents |
| --- | --- |
| `docs/README.md` | Documentation index |
| `docs/DIRECTORY-GUIDE.md` | Workspace directory guide |
| `docs/releases/desktop/` | Versioned desktop release notes |
| `docs/architecture/` | System design and technical documentation |
| `docs/product/` | Product requirements and roadmap |
| `docs/research/` | Research papers and experiment history |
| `docs/enhancements/` | Enhancement specifications |
| `docs/releases/` | Release history and verification |
| `docs/guides/` | Private local guides, excluded from Git |
| `docs/` | Overview, thesis, presentation, interview preparation, glossary, and development guides |
| `Project Reports/` | Project report documents, PDFs, and supporting assets |
| `.agent-docs/` | Agent architecture and implementation references |

## Creative work

| Location | Contents |
| --- | --- |
| `creative/store-assets/` | Store icons, box art, poster, and trailer thumbnail |
| `creative/source-media/audio/` | Original Elara and Brown narration recordings |
| `creative/source-media/video/` | Original launch video |
| `creative/brown-launch*/` | Preserved launch film versions, source files, and exports |
| `screenshots/` | Captured application screenshots |

Put new marketing exports in `creative/`, rather than beside `package.json`. Keep application assets in `Assets/` because they are packaged with the app.

## Builds, downloads, and local data

| Location | Contents |
| --- | --- |
| `build/` | Installer resources, including the referenced `installer.nsh` |
| `dist/` | Desktop build output and release staging |
| `dist-store/` | Store package output |
| `Downloadable Files/` | Staged desktop/mobile downloads and related deployment material |
| `brown-releases/` | Separate release checkout |
| `releases/` | Release support files and signing material |
| `keystore-backup/` | Private Android signing backups; excluded from Git |
| `brown-local/` | Local runtime and model data |
| `UltronDataDev-migrated-from-C/` | Preserved migrated development data |
| `output/pdf/` | Generated PDF output |
| `output/logs/desktop/` | Desktop build, upload, and release logs |
| `output/logs/mobile/` | Android build and upload logs |
| `output/organization/` | File move manifest with original paths and SHA-256 hashes |
| `tmp/` | Scratch scripts, previews, validation output, and temporary working files |

Build and release directories retain their existing paths because publishing scripts rely on them. Versioned desktop release notes are stored in `docs/releases/desktop/v*.md`. The release script reads them there and generates the working `docs/releases/desktop/draft.md`, which is excluded from Git.

## Workspace metadata

`.git/`, `.gitmodules`, and `.gitignore` control repository state. `.agents/`, `.codex/`, `.qoder/`, `.expo/`, `.research/`, `.ppt-format/`, and `.verify-screens/` hold tool configuration, caches, research, or verification work. Their locations are preserved.

The root also retains `README.md`, `LICENSE`, `NOTICE`, `package.json`, `package-lock.json`, and `electron-builder.store.cjs`.

## Organization record — 22 October 2026

Moved 17 root logs into desktop/mobile log folders, six store images into `creative/store-assets/`, two narration recordings into `creative/source-media/audio/`, and one launch video into `creative/source-media/video/`. Updated the creative source scripts and metadata that referenced the narration recordings.

All 26 moved files were checked against their original SHA-256 hashes. No files were deleted or overwritten. The complete move record is in `output/organization/2026-10-22-moves.json`; its `From` and `To` paths are relative to this workspace.
