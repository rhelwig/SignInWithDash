# SIWD Android authenticator (standalone, testnet)

Standalone **Sign in with Dash** phone app for approving website logins.
Designed as a **login authenticator**, not a payment wallet (D-014 / demo notes).

| Item | Choice |
| --- | --- |
| First device | Samsung Galaxy A7 (sideload) |
| Network | **Testnet only** in this scaffold |
| UI | Kotlin + Jetpack Compose |
| Protocol core | `:protocol` JVM module (shared encoder/signer) |
| Play services | **Not required** (GrapheneOS / F-Droid path) |

## Modules

- **`protocol`** — SIWD Draft 1 canonical bytes, SHA256d, recoverable ECDSA,
  golden-vector tests (runs on JDK without Android SDK).
- **`app`** — Compose UI: paste capability URL, approve with countdown, per-site
  last Dash name preference, dev fixture identities (alice/bob matching the
  demo website).

## Build

**Java:** Android builds use **JDK 21** only for this project. Your system
default can stay on Java 25 (e.g. Minecraft mods). Always prefix:

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export PATH="$JAVA_HOME/bin:$PATH"
```

**Android SDK** (installed under `~/Android/Sdk` on this machine):

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
# local.properties is gitignored and points at sdk.dir
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

Sideload to the Samsung Galaxy A7 over USB or copy the APK.

## Dev flow with localhost demo

1. Run `apps/demo-web` (`npm run dev` → http://127.0.0.1:8787).
2. Open Register/Sign in; copy the capability URL.
3. On the phone (or emulator), paste the URL into the authenticator.
   - Emulator can reach host machine via `10.0.2.2` instead of `127.0.0.1`.
4. Choose fixture identity (alice/bob), confirm name, approve.
5. Browser tab finishes login.

## Roadmap (this app)

1. Camera QR scan (CameraX + offline decoder; no Play ML Kit required).
2. BIP-39 testnet phrase import + encrypted storage (Android Keystore).
3. Platform Kotlin/Rust SDK for identity/DPNS discovery (live testnet).
4. Device credential / biometric gate on every approve.
5. Per-site remembered name (already stubbed via `SiteNamePrefs`).
6. Signed release + SBOM before sharing outside the development group.

## Security notes

- No arbitrary message signing API.
- No mainnet network toggle in this scaffold.
- Backups disabled for app data in the manifest extraction rules.
- Fixture keys are **not** wallet seeds; phrase import is not enabled yet.
