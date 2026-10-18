# Update retries, signed builds, and security submissions

Checked against official guidance on 18 October 2026.

## What the apps now do

Both apps retain verified update installers in persistent app storage. Cancelling installation or encountering a security prompt must not delete those files. Reopen Software update and retry installation. Temporary read/permission failures do not trigger a fresh download. A missing, quarantined, modified, or incomplete installer must be downloaded again; the app cannot promise reuse after another program removes it.

Android caches APKs under the app's private documents/updates directory. The cache matches the release version and download URL and verifies stored size and MD5 for local corruption detection. This MD5 check is not proof of publisher identity: Android's APK signing checks remain authoritative. Windows caches the installer in userData/updates and verifies release SHA-512/SHA-256 before launching it. The updater does not disable Play Protect, SmartScreen, antivirus, or device policy.

## Build and stage the next release

Use PowerShell. Preparation builds and stages files locally; do not add --publish until tested and ready to release. Choose versions newer than the published releases. The two repositories use independent versions.

### Windows

1. Obtain a trusted Windows code-signing identity through your certificate provider or a supported signing service. Keep the same publisher identity across versions. Self-signed development certificates do not establish public trust.
2. Configure electron-builder signing. For an existing exportable certificate, set CSC_LINK to its PFX path and load CSC_KEY_PASSWORD through your normal secret-management process. Do not commit either the private key or its password. Hardware-backed and cloud certificates require the provider's signing integration; a PFX example is not applicable to every certificate.
3. Run:

```powershell
Set-Location D:\Ultron
$desktopVersion = Read-Host 'Next desktop version, newer than the published version'
npm run release:desktop -- --version $desktopVersion --require-signing
node scripts/verify-windows-release.cjs .\dist\Brown-AI-Setup.exe
Get-FileHash .\dist\Brown-AI-Setup.exe -Algorithm SHA256
```

The prepare script tests, builds Setup and portable editions, checks signatures, stages stable and versioned filenames, and regenerates latest.yml hashes. The verifier requires a trusted valid signature and a timestamp. Publish validation checks Setup and portable signatures again. Environment-based signing is no longer overridden by null certificate options.

For a local development build only, `npm run build:win` produces the NSIS installer. That command alone does not guarantee a signed or submission-ready release. Never sign or modify release assets after publishing latest.yml; rebuild/stage so the hashes match the final signed bytes.

Output: `D:\Ultron\dist\Brown-AI-Setup.exe`, versioned aliases, portable files, and `latest.yml`.

### Android

Keep `mobile/android/keystore.properties` and its referenced release keystore backed up privately. Keep the existing application ID `com.brown.mobile` and release signing key. Changing the key breaks in-place updates unless a supported signing-key migration is configured. The prepare script increments versionCode when the version changes.

```powershell
Set-Location D:\Ultron\mobile
$mobileVersion = Read-Host 'Next mobile version, newer than the published version'
npm run release:apk -- --version $mobileVersion
node scripts/verify-apk-release.cjs .\dist\Brown-AI-Mobile.apk
Get-FileHash .\dist\Brown-AI-Mobile.apk -Algorithm SHA256
```

The script builds arm64-v8a by default, verifies the APK using SDK apksigner, rejects a debug signing identity, and stages stable/versioned APKs. Set ANDROID_HOME if the SDK cannot be located. Optional: set ANDROID_RELEASE_CERT_SHA256 to the expected signing-certificate SHA-256 fingerprint (not the APK hash) to reject accidental key changes. The staged APK inspected during this work used certificate fingerprint `746b84b34953ea44b46083f151e25a0e1366a92bc2ee81b4159bf3563acc91a6`; confirm this is your intended long-term release key before pinning it.

Direct local build: `npm run build:apk`. Release signing no longer silently falls back to the Android debug key. The production manifest no longer explicitly requests the unused overlay permission; inspect the final merged APK permissions for each release.

Output: `D:\Ultron\mobile\dist\Brown-AI-Mobile.apk`, its versioned alias, and the original under `android/app/build/outputs/apk/release/`.

## Submit Windows false positives to Microsoft

A Defender malware detection, a SmartScreen unknown-reputation prompt, and Smart App Control are distinct. Microsoft's current guidance says consumer SmartScreen reputation cannot be manually pre-approved. Signing helps establish publisher identity but even EV signing does not guarantee an immediate warning-free install. Store-packaged distribution is the most reliable route for avoiding the SmartScreen download prompt. [Official SmartScreen guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

For a suspected false detection:

1. Finish signing the exact affected build. Record filename, version, SHA-256, publisher, download URL, Windows version, exact warning/detection, and a screenshot.
2. Open the [Microsoft Security Intelligence submission portal](https://www.microsoft.com/en-us/wdsi/filesubmission). Sign in and choose **Software developer**.
3. Choose the product actually reporting the problem: Defender Antivirus, Defender SmartScreen, or Smart App Control. Do not classify an unknown-reputation prompt as a malware detection.
4. Upload the exact flagged file. Complete company/contact fields, classification, and additional information. Explain Brown's purpose, distribution URL, reproduction steps, signing identity, and expected behavior. Include detection/definition versions when applicable.
5. Review, submit, retain the submission ID, and track Submission history. Follow up using the review result's support/contact options if needed.
6. The currently displayed upload limit is 50 MB. Existing Brown Setup files are about 131 MB, so do not assume the whole installer will upload. Submit the specific flagged component if it fits, reference the full installer's public download URL and SHA-256, and follow the portal/support instructions for oversized samples. Renaming or splitting an installer is not a trust fix.

A clean verdict addresses the reviewed detection; it is not a permanent whitelist for all later releases. For Microsoft Store packaging, first replace the placeholder appx publisher/identity values with those from Partner Center and follow that distribution channel's update requirements.

## Android Play Protect, developer verification, and Samsung

1. Verify the final release APK and record its SHA-256, certificate fingerprint, application ID, versionName/versionCode, public version-specific APK URL, device/Android version, and exact warning screenshot. Use an unauthenticated direct APK URL that reviewers can download.
2. Review [Google's warning-specific guidance](https://developers.google.com/android/play-protect/warning-dev-guidance). Resolve the reason shown; unknown-app scanning and harmful-app classification are different cases.
3. If classification is incorrect, open [Google's Play Protect appeal form](https://support.google.com/googleplay/android-developer/contact/protectappeals), sign in, and supply the requested package, APK link, explanation, and evidence. Follow the review correspondence. This is an appeal, not advance approval of every future APK.
4. Complete [Android developer verification](https://developer.android.com/developer-verification): use Android Developer Console for exclusive outside-Play distribution, or Play Console for Play and outside-Play distribution. Verify your identity, register the package, and prove signing-key ownership through the console's current workflow. Registration does not replace Play Protect review.
5. For the least install friction, distribute through an authorized store. Google Play prohibits using REQUEST_INSTALL_PACKAGES for ordinary self-updates: a Play variant must remove that permission and use Play's update mechanism. Keep Play app signing and external APK signing compatible with the intended upgrade path. [Permission policy](https://support.google.com/googleplay/android-developer/answer/12085295).
6. [Samsung Auto Blocker](https://www.samsung.com/us/support/answer/ANS10003636/) may block installations outside authorized sources even for a valid, clean APK. A Google appeal cannot override Samsung/device policy. Store distribution or the device owner's permitted policy choices control this; Brown must retain its downloaded APK rather than try to bypass the blocker.

No portal submission guarantees that all security warnings disappear. Do not instruct users to disable antivirus or Play Protect as the normal installation flow.

The current Android project targets API 34; it is not ready for a new Google Play submission as-is. Current phone-app submissions require API 36. That needs a tested Expo/React Native/Android toolchain migration, native-library compatibility checks, a Play app bundle, and Play policy/data-safety work, rather than just changing one number. These changes prepare the existing direct APK release path, not a complete Store migration. [Current target-API requirements](https://support.google.com/googleplay/android-developer/answer/11926878).

## Acceptance checks before publishing

- Install old release, download the new update once, cancel installation, reopen Update, retry; network download count stays one.
- Repeat after restarting Brown and after restarting the device.
- Repeat with a temporarily unreadable/locked file; retry uses the original file after access returns.
- Verify missing/corrupt files are rejected, and a different release reusing the same URL cannot install an old cached APK.
- Test on a real supported Android phone (including the reported Samsung policy) and a clean Windows machine with their normal protections enabled.
- Confirm upgrade retains data, versions increase, and final artifact signatures/hashes match the files actually published.

Automated verification covers simulated blocking/restart/lock cases. Actual third-party security approval and real-device installation must be checked separately. No release or security-portal submission was performed by these code changes.
