# SIWD Android authenticator (standalone, testnet)

Standalone **Sign in with Dash** phone app for approving website logins.
Designed as a **login authenticator**, not a payment wallet (D-014).

| Item | Choice |
| --- | --- |
| Network | **Testnet only** in this build |
| UI | Kotlin + Jetpack Compose |
| Protocol core | `:protocol` JVM module (shared encoder/signer) |
| Play services | **Not required** (CameraX + ZXing; GrapheneOS / F-Droid friendly path) |

## Modules

- **`protocol`** — SIWD Draft 1 canonical bytes, SHA256d, recoverable ECDSA,
  golden-vector tests (runs on JDK without Android SDK).
- **`app`** — Compose UI: paste or scan capability URL, approve with countdown,
  per-site last Dash name, known sites, BIP-39 import, dev fixtures (alice/bob).

## Build

**Java:** use **JDK 21** for this project (system default may be newer):

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64   # adjust for your OS
export PATH="$JAVA_HOME/bin:$PATH"
```

**Android SDK** — set `ANDROID_HOME` / `ANDROID_SDK_ROOT` and create
`local.properties` with `sdk.dir=…` (file is gitignored). Example:

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
```

### Protocol unit tests

```bash
cd apps/android-authenticator
./gradlew :protocol:test
```

### Debug APK

```bash
./gradlew :app:assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Sideload over USB or copy the APK to any compatible device/emulator.

Optional copy for a running demo-web downloads page (gitignored `*.apk`):

```bash
cp app/build/outputs/apk/debug/app-debug.apk \
  ../../demo-web/src/public/downloads/siwd-authenticator-testnet-debug.apk
```

## Dev flow with the demo website

1. Run `apps/demo-web` (`npm run dev` — default http://127.0.0.1:8792).
2. Open **Sign in with Dash**; copy or show the capability URL / QR.
3. In the authenticator: **scan the QR**, paste the URL, or open a deep link.
4. Approve with a fixture identity (alice/bob) **or** an imported testnet phrase.
5. Browser tab finishes login.

### Reaching demo-web from emulator or phone

| Setup | Typical origin in the capability URL |
| --- | --- |
| Browser on the same machine as demo-web | `http://127.0.0.1:8792` |
| Android **Emulator** | Emulator reaches the host via **`10.0.2.2`** (AOSP standard alias for host loopback), e.g. `http://10.0.2.2:8792` — **or** use `adb reverse` and keep `127.0.0.1` |
| Physical device over USB | `adb reverse tcp:8792 tcp:8792`, then use `http://127.0.0.1:8792` |
| Physical device over Wi‑Fi | Bind demo with `HOST=0.0.0.0`, set `SIWD_PUBLIC_ORIGIN=http://YOUR_LAN_IP:8792` (see [docs/LOCAL-DEV-CONFIG.md](../../docs/LOCAL-DEV-CONFIG.md)) |
| Public HTTPS demo | Real `https://…` origin; no cleartext config required |

Cleartext HTTP is only allowed for loopback / emulator hosts in
`network_security_config.xml`. Do not rely on a maintainer’s LAN IP; add your
own only for temporary debug if needed.

## Features (current)

1. **Camera QR scan** — CameraX + ZXing (no Play ML Kit).
2. **BIP-39 import** — 12–24 words + optional passphrase (13th/25th word);
   phrase used to discover identities then cleared; HIGH auth keys stored with
   EncryptedSharedPreferences / MasterKey.
3. **Live testnet discovery** — on-device DAPI path + public trusted quorums
   (`quorums.testnet.networks.dash.org`). Optional DPNS name assist.
   **Note:** native `Platform()` / dash-sdk init can still abort on some
   devices; discovery reliability is an ongoing work item.
4. **Device unlock on approve** — biometrics if enrolled, else PIN/pattern.
5. **Per-site last Dash name** — `SiteNamePrefs`.
6. **Known sites** — reopen a site origin after a successful approve.
7. **Dev fixtures** (alice/bob) for offline pairing with the demo simulator.

Signing always happens on the phone. The relying website verifies signatures on
its own backend (`platform` / `hybrid` / `simulator` modes).

## Branding

Testnet (orange) and mainnet (blue) launcher masters live under
`docs/branding/`. This build ships the **testnet** adaptive icon. When cutting a
mainnet flavor, regenerate mipmaps from the mainnet master PNG.

## Still to do

- Harden on-device Platform (error UX, retries, device matrix).
- Mainnet network flavor (gated; separate from testnet builds).
- Signed release + SBOM before wider distribution.

## Security notes

- No arbitrary message signing API.
- No mainnet network toggle in this testnet build.
- Backups disabled for app data in the manifest extraction rules.
- Fixture keys are **not** wallet seeds. Use **testnet-only** phrases for import.
- Never enter a mainnet recovery phrase.
