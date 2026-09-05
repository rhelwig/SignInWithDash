# SIWD Android authenticator (standalone)

Standalone **Sign in with Dash** phone app for approving website logins.
Designed as a **login authenticator**, not a payment wallet (D-014).

Two product flavors, **separate application ids** (can be installed side by side):

| Flavor | Application id | Network | Icon |
| --- | --- | --- | --- |
| `dashTestnet` | `org.siwd.authenticator.testnet` | Dash Platform testnet | Orange |
| `dashMainnet` | `org.siwd.authenticator` | Dash Platform mainnet | Blue |

Mainnet is a **private experimental** build for the owner's devices only. It is
not a public release and does not satisfy the mainnet security gates in
`docs/SECURITY.md`.

| Item | Choice |
| --- | --- |
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

### Signed releases

Current builds: **0.1.2-testnet** and **0.1.2-mainnet-private**, both version
code **5**. Installed as in-place updates on the operator's phone. The operator
confirmed successful testing of both networks and the logout fixes on
2026-09-05. Mainnet distribution remains private.

```bash
./gradlew :protocol:test :app:assembleDashTestnetRelease :app:assembleDashMainnetRelease
../../tools/sign-authenticator-release.sh
```

The signing script stores the persistent release key outside the repository,
in `~/Projects/.secrets/siwd-release/`, and writes signed APKs under
`app/build/outputs/signed/`. Back up that signing directory securely: future
updates must use the same key. Do not include it in source control or uploads.
The website App Links fingerprints must match this release certificate.

Publish only the signed testnet release to the demo download directory with
file mode 0644. Mainnet release distribution remains private. Debug builds
are for generated test identities only and have separate application IDs.
A release installation cannot read identities stored in the debug sandbox.

Private-key decryption now requires an OS-authenticated cryptographic
operation. Android 11+ supports strong biometrics or device credentials;
older supported versions require strong biometrics. Disabling device security
or invalidating the wrapping key may require reimport from your own backup.
Screenshots and ordinary screen capture are blocked. Release builds exclude
the debug self-test activity.

An isolated synthetic test passed on the attached phone on 2026-09-05:
wrapped-key persistence across process restart, rejection before OS approval,
correct decryption after approval, and a fresh-approval requirement for the
next decryption. The operator also confirmed the release-app recovery/login tests on both
networks. Separate biometric and PIN coverage, legacy migration and key
invalidation still need dedicated tests.

A Dash name is an optional shortcut to compare derived keys
locally across identity positions 0–19 and key positions 0–31. Platform key IDs
are matched by their public keys rather than assumed to be derivation indexes.
Only active, unbounded AUTHENTICATION/HIGH ECDSA keys can be imported. A
successful name lookup with no matching key is reported separately. The
BIP-39 passphrase field means the original optional seed passphrase, not the
wallet's unlock PIN/password; leave it empty if no seed passphrase was used.

Version 0.1.2 adds app-owned recovery-word entry with local BIP-39 suggestions,
progressive name-free discovery and preservation of found identities when
further scanning fails or reaches its time limit. See
[the security fix report](../../docs/SECURITY-FIXES-2026-09-05.md).

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
4. **Device unlock on approve** — authenticated key decryption, using strong biometrics or (Android 11+) device credentials.
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
