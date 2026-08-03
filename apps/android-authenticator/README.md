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

## Features (current)

1. **Camera QR scan** — CameraX + ZXing (no Play ML Kit / Google services).
2. **BIP-39 import** — phrase used once to discover identities; only HIGH auth
   keys stored via EncryptedSharedPreferences / MasterKey.
3. **Live testnet names** — discovery via demo-web Platform proxy
   (`/dash-auth/v1/platform/*` using Evo SDK against Dash testnet). Real DPNS
   names resolve (e.g. `alice` → identity on testnet).
4. **Device unlock on approve** — biometrics if enrolled, otherwise PIN/pattern
   (BiometricPrompt + DEVICE_CREDENTIAL).
5. **Per-site last Dash name** — `SiteNamePrefs`.
6. Dev fixtures (alice/bob) still available for offline demo simulator keys.

### Platform proxy URL

On the home screen, set **Platform discovery proxy** to the machine running
`apps/demo-web`:

| Device | Example |
| --- | --- |
| Emulator | `http://10.0.2.2:8787` |
| Physical phone (same LAN) | `http://192.168.x.x:8787` |

Demo-web must be running (`npm run dev`) for phrase discovery and live name
lookup. Signing still happens only on the phone.

## Still to do

- Embed DAPI/Platform SDK on-device (drop dependency on demo-web proxy).
- Signed release + SBOM before sharing outside the development group.

## Security notes

- No arbitrary message signing API.
- No mainnet network toggle in this scaffold.
- Backups disabled for app data in the manifest extraction rules.
- Fixture keys are **not** wallet seeds; phrase import is not enabled yet.
