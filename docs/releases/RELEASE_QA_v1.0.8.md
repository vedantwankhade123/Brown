# Brown AI Desktop v1.0.8 verification

Date: 5 October 2026.

- Desktop automated suite: passed, including updater checksum/size checks, partial-download cleanup and retry, concurrent-check/download coalescing, notification deduplication and installer launch failure recovery.
- Mobile tests and TypeScript checks: passed. No Android binary is released in this task.
- Update feed: official vedantwankhade123/Brown GitHub Releases; stable Setup/Portable aliases and latest.yml accompany versioned binaries.
- Packaging, live update-download verification and website verification are recorded below after completion.
- Limitations: no fresh Windows-machine test or full installed-app upgrade/rollback certification. Binaries are unsigned.

## Local Windows package

- NSIS installer and portable build succeeded locally. Installer size: 130,558,166 bytes; portable size: 130,241,834 bytes.
- Installer passed Windows executable-header, exact-size and SHA-512 checks against latest.yml.
- Packaged app opened onboarding with email, date of birth and helper-model fields absent.
- Packaged renderer produced a table, KaTeX formula and SVG chart; chart background matched the sidebar.
- Packaged v1.0.8 update check correctly returned not-available before the new version was published.
- New files were copied to Downloadable Files/Desktop App before the previous v1.0.7 installers were deleted.
- Website production build, download-tracking tests and SEO checks passed.

The live release download is verified with node scripts/verify-desktop-release.cjs --download after publication; this checks discovery, actual download and integrity without launching an installer.
