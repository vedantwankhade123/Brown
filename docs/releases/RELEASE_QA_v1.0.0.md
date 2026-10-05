# Brown AI Desktop v1.0.0 verification

Date: 6 October 2026. First public desktop release, published as **Brown v1**.
Release: https://github.com/vedantwankhade123/Brown/releases/tag/v1.0.0

## Automated suite

`npm test` passed as part of the prepare step, including the updater regressions: checksum and
size validation, interrupted-download cleanup and retry, concurrent check/download coalescing,
notification deduplication, installer launch confirmation and launch-failure recovery.
Also passing: planner decomposition, search ranker, browser network policy (public-address
validation, DNS-rebinding denial), streaming-visual and product-price rules, chart/diagram intent
separation, multi-file code agent actions, onboarding privacy checks (no email, DOB or helper
model), and the chat-only release gate.

## Published build

- NSIS installer: 130,562,246 bytes — SHA-256 `c083a01580d2cedee44339a85e4817916d859db6ce1a766efe61fee169c5500f`
- Portable edition: 130,245,919 bytes — SHA-256 `df895d84d23b98c8617d1062eac9a2bae31014870369475c03b0d22d17c7bff1`
- Packaged executable metadata reports ProductName "Brown AI", FileVersion and ProductVersion 1.0.0.
- The packaged `app.asar` contains this release's renderer changes (`createSmoothStreamPainter`,
  `convertPipeBulletRunsToTableRows`), so the shipped binary is the audited source, not an older build.

## Live release feed (verified against GitHub, not local files)

`node scripts/verify-desktop-release.cjs --installer=dist/Brown-AI-Setup.exe --download` — both
assertions passed:

1. `releases/latest` resolves to tag `v1.0.0`; all five assets
   (`Brown-AI-Setup.exe`, `Brown-AI-Portable.exe`, `latest.yml`, `Brown-AI-Setup-v1.0.0.exe`,
   `Brown-AI-v1.0.0.exe`) are in state `uploaded`; the live `latest.yml` declares version 1.0.0,
   path `Brown-AI-Setup.exe`, and its SHA-512 and size match the local installer byte-for-byte.
2. Running the real `src/main/updater.js` against the public feed discovered v1.0.0, downloaded
   the actual installer from GitHub Releases to a temporary profile, streamed 0→100% progress and
   validated the checksum. The installer was never launched and nothing was installed.

Public download link confirmed reachable:
`https://github.com/vedantwankhade123/Brown/releases/latest/download/Brown-AI-Setup.exe` (HTTP 206
on a ranged request through the release asset CDN).

## Verification defect found and fixed during this run

The download check initially failed. The script simulated an installed app at **1.0.7**, which is
semantically newer than the newly published 1.0.0, so the updater correctly answered
"not available" and the assertion expected "available". The product behaved right; the fixture was
wrong. `scripts/verify-desktop-release.cjs` now simulates a build older than the release under
verification (`--installed=`, default `0.0.1`), so the discovery, download and checksum path is
genuinely exercised.

## Consequence of publishing 1.0.0 as Brown v1

Version numbers above 1.0.0 (1.0.1–1.0.17) exist only as local tags and placeholder update feeds;
none were ever published. Any machine still running one of those hand-built binaries sees
`Brown v1` as an **older** release and will not offer it as an update — those installs need the
installer downloaded from the website once. Fresh installs and future releases are unaffected,
since the next version is strictly higher than 1.0.0.

## Not certified

- No clean-machine Windows installation test and no full installed-app upgrade/rollback run.
- Windows binaries are not Authenticode signed, so SmartScreen may warn on first launch.
- Model downloads and optional web/cloud features need internet; installed local models answer offline.
- No Android APK is published in this release; mobile source tests and type checking run separately.
