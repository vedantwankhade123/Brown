# 🏬 Ultron Microsoft Store Submission & Update Guide

This guide provides step-by-step instructions to build, submit, and update **Ultron AI** on the **Microsoft Store** for free.

---

## 📋 Table of Contents
1. [Developer Account Setup](#1-developer-account-setup)
2. [Configuring Identity Credentials](#2-configuring-identity-credentials)
3. [Building the Store Package (.appx / .msix)](#3-building-the-store-package-appx--msix)
4. [Submitting to the Microsoft Store](#4-submitting-to-the-microsoft-store)
5. [Publishing Updates](#5-publishing-updates)

---

## 1. Developer Account Setup

1. Register for a **Microsoft Partner Center** account at [partner.microsoft.com](https://partner.microsoft.com/dashboard/registration/signup).
2. Choose **Individual Account** (one-time ~$19 USD account fee, no recurring fees).
3. Once registered, navigate to **Apps & Services** → **Create a new app**.
4. Reserve your app name: **`Ultron AI`**.

---

## 2. Configuring Identity Credentials

Go to Partner Center → **Ultron AI** → **App management** → **App identity** and copy the following 3 fields:

1. **Package/Identity/Name** (e.g. `12345YourName.UltronAI`)
2. **Publisher ID** (e.g. `CN=12345678-ABCD-1234-ABCD-1234567890AB`)
3. **Publisher Display Name** (e.g. `Vedant Wankhade`)

Open `package.json` in Ultron and replace the placeholder fields under `"appx"`:

```json
"appx": {
  "applicationId": "UltronAI",
  "identityName": "PASTE_PACKAGE_IDENTITY_NAME_HERE",
  "publisher": "PASTE_PUBLISHER_ID_HERE",
  "publisherDisplayName": "Vedant Wankhade",
  "displayName": "Ultron AI",
  "languages": ["en-US"]
}
```

---

## 3. Building the Store Package (.appx / .msix)

Run the following command in the `Ultron` directory:

```bash
npm run build:store
```

`electron-builder` will compile the application and generate the store package inside the `dist/` directory:
- `dist/Ultron AI 1.0.0.appx` (or `.msix`)

---

## 4. Submitting to the Microsoft Store

1. In Partner Center, click **Start your submission**.
2. **Pricing and Availability**: Set Price to **Free** and Markets to **All markets**.
3. **Properties**: Select Category (e.g. *Productivity* or *Developer Tools*).
4. **Age Ratings**: Complete the quick rating questionnaire.
5. **Packages**: Drag and drop `dist/Ultron AI 1.0.0.appx`.
6. **Store Listing**:
   - Add app description.
   - Upload app icon (512x512 PNG from `Assets/ultron-logo.png`).
   - Upload at least 1 screenshot of Ultron UI.
   - Add Privacy Policy URL.
7. Click **Submit to the Store**.

Certification review takes between 2 to 24 hours.

---

## 5. Publishing Updates

When releasing a new version (e.g. `v1.1.0`):

1. Update `"version": "1.1.0"` in `package.json`.
2. Build the updated package:
   ```bash
   npm run build:store
   ```
3. Go to Partner Center → **Ultron AI** → **Update**.
4. Upload `dist/Ultron AI 1.1.0.appx` under **Packages**.
5. Click **Submit to the Store**.

> **Note**: Windows automatically updates Ultron in the background for all installed users worldwide within hours of approval!
