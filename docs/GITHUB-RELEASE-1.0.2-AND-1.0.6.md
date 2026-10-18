# GitHub releases: desktop 1.0.2 and mobile 1.0.6

Source changes and version bumps are already pushed. Microsoft Store submission 1.0.1 is separate and should remain in review.

## Build (PowerShell)

Desktop:
```powershell
Set-Location D:\Ultron
node scripts/release-desktop.js
```

Android (uses the existing release keystore; never replace it):
```powershell
Set-Location D:\Ultron\mobile
node scripts/release-apk.js --keep-version
```

These commands build and stage files without uploading. Do not run another build while one is already running. Test the installers before publishing.

## Publish manually

Desktop direct downloads are unsigned. This explicit option permits publishing without claiming Microsoft Store signing applies to these files. Windows may show SmartScreen warnings.

```powershell
Set-Location D:\Ultron
node scripts/release-desktop.js --publish --allow-unsigned
```

```powershell
Set-Location D:\Ultron\mobile
node scripts/release-apk.js --publish
```

The scripts upload through draft releases and then mark them latest. This changes website downloads and offers updates to existing direct-download users. They do not update the Microsoft Store package.

Stable website downloads:
- https://github.com/vedantwankhade123/Brown/releases/latest/download/Brown-AI-Setup.exe
- https://github.com/vedantwankhade123/Brown-Mobile/releases/latest/download/Brown-AI-Mobile.apk

Desktop output: `D:\Ultron\dist`. Mobile output: `D:\Ultron\mobile\dist`. Do not upload the Store `.appx` as a replacement for the EXE: that local Store submission package is unsigned.
