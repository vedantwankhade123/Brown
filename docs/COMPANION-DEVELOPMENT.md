# Brown phone–desktop connections

The Android companion pairs once through the desktop QR. The QR includes a temporary 256-bit bootstrap key; scanning it authorizes this desktop. After code verification, the phone stores the long-lived device credential in its secure store. Unpairing or desktop revocation invalidates it. Legacy PIN-only pairings keep their existing behavior; scan a fresh QR to enable encrypted roaming.

All new companion requests and responses use AES-256-GCM authenticated envelopes, random 96-bit nonces, direction-separated authenticated metadata, request IDs, request expiry and replay rejection. The relay forwards ciphertext and cannot read profile keys, prompts, responses, chats, or microphone recordings. This is an application encryption protocol, not an independently audited messaging protocol; TLS is also required for public remote endpoints. Browser and Expo Go do not contain the native encryption module; use the Android APK/native development build.

## Local development

1. Run `npm start` in `D:\Ultron` to start the desktop from source. An already-running desktop must be restarted to load these changes.
2. Keep mobile access enabled in desktop Connection.
3. Connect the desktop to your phone hotspot, connect both to a router, or enable USB tethering. The phone does not need to join its own hotspot.
4. Generate a fresh pairing QR and scan it in Mobile → Connection. It contains all desktop IPv4 addresses and the actual listening port.
5. The phone tries authenticated local routes concurrently, preferring them over remote routes. It scans the phone's actual IPv4 subnets after saved addresses stop working. Discovery itself contains no credentials.

For USB debugging without tethering, run `D:\sdk-comps\platform-tools\adb.exe reverse tcp:49200 tcp:49200`. This forwards the phone's localhost to the desktop. If desktop Connection shows 49201–49203, use that port on both sides instead. USB reverse is a development bridge and may need recreating after unplugging/restarting either device.

The phone reconnects on native connectivity/link changes and foreground entry, with a 15-second health interval while automatic connection is enabled. Offline status keeps the pairing. A disconnect/account reset cancels late reconnection results. Inference requests are not silently replayed after a failed connection, avoiding duplicate work or duplicate chat imports.

## Direct remote access

Desktop Connection → Remote access accepts a reachable HTTPS base address for the desktop sync service. Terminate TLS at a reverse proxy and forward to the desktop's listening port. Do not forward the Ollama port itself. Alternatively, use Tailscale on phone and desktop: a desktop address in 100.64.0.0/10 is an encrypted companion candidate. Tailscale manages its own direct/relay connectivity; Brown cannot tell whether a Tailscale connection itself is direct.

This implementation attempts reachable direct endpoints. It does **not** implement WebRTC/STUN NAT hole punching, discover a public IP automatically, or configure router port forwarding. When the direct endpoint cannot be reached, Brown falls back to its configured relay.

## Self-hosted relay

Start locally with `node scripts/companion-relay.js`. It listens on 127.0.0.1:49300 by default. `BROWN_RELAY_PORT` and `BROWN_RELAY_HOST` override that. It is a development/reference service, with payload/concurrency limits, owner-authenticated desktop registration and WebSocket heartbeat; add infrastructure rate limits and monitoring before public hosting.

Host the Node process on an internet-reachable server, or behind an existing HTTPS reverse proxy that supports WebSocket upgrades. A domain alone is insufficient: a running server is required. For example, a separate `relay.your-domain` subdomain can route to this service. No deployment or DNS change is performed by this code.

In desktop Connection → Remote access, save `wss://relay.your-domain`. The desktop establishes an outbound connection and retries with exponential backoff after disconnection. Generate a fresh QR **after saving** so the phone receives the relay address and desktop routing identity. Later endpoint changes are delivered through authenticated session responses when an existing route is reachable; if all saved routes have changed, rescan the QR.

For local USB development, start the relay locally, forward its port with `adb reverse tcp:49300 tcp:49300`, and configure `ws://127.0.0.1:49300` on the desktop. HTTP/WS is accepted only for local development addresses. Public endpoints must use HTTPS/WSS. To exercise relay fallback, the phone must have no working local/direct desktop route; merely configuring a relay will not override a faster local connection.

## Verification

- `npm test` in the root: real HTTP/WebSocket integration of the mobile transport with the desktop handler, pairing, changed subnet, local/direct/relay ordering, authenticated response IDs, replay protection, revocation and disabled mobile access.
- `node tests/companion-reconnect.test.cjs` in mobile: persisted credentials, network-change route switching, concurrent reconnect coalescing and disconnect races.
- `npm run typecheck` and `npm test` in mobile: existing app regressions.
- `android\gradlew.bat -p android assembleRelease`: signed installable Android build with the native companion module.

Physical hotspot/USB switching and two independently connected internet networks must also be tested. Tests using localhost do not establish that a public relay has been deployed or that a particular phone permits hotspot-host communication.

## Android pairing troubleshooting

The release manifest must retain `android:usesCleartextTraffic="true"`, because changing local IPv4 peers do not have public TLS certificates. `withLocalCompanionNetwork.js` preserves this through Expo prebuild. The HTTP carrier carries AES-GCM encrypted application payloads for QR pairings; permitting the carrier does not disable the companion's authentication or encryption. Direct public URLs still require HTTPS.

If a phone can reach `/discover` outside the app but the release app reports `Network request failed`, inspect this manifest flag. Also restart a development desktop after changing main-process code: the running server can otherwise advertise an old QR/protocol even though files on disk are updated. Generate a new QR after restarting. Connection selection supports React Native's fallback Promise runtime as well as Hermes.
