# Morning checklist — local SIWD demo + authenticator

**Last overnight work:** 2026-08-04 night  
**Goal:** working testnet phrase import + login, then public-host prep.

## What was broken (and fixed)

1. **On-device DAPI** needs quorum public keys (masternode list). Without that, the
   native SDK bans all nodes (`quorum not found` / `NoAvailableAddresses`) and
   reports “no identities.” This is **not** a “wait for the name to propagate” issue.
2. **`adb reverse` HTTP** is unreliable on this tablet (nc got empty responses).
   **Prefer Wi‑Fi LAN:** tablet → `http://10.0.0.58:8792` (this machine’s `eno1`).
3. Demo-web must bind **all interfaces**: `HOST=0.0.0.0` (not only 127.0.0.1).
4. Misleading UI error said “could not reach Platform” when the real problem was
   proxy/SDK setup; error text improved.

## Working state verified on tablet (SiwdSelfTest)

```text
[PASS] healthz http://10.0.0.58:8792
[PASS] platform/resolve alice → real testnet identity id
[PASS] platform/discover shape
[PASS] key derivation
```

Command (re-run anytime):

```bash
export PATH="$HOME/Android/Sdk/platform-tools:$PATH"
adb shell am start -n org.siwd.authenticator.testnet.debug/org.siwd.authenticator.DebugSelfTestActivity \
  --es proxy http://10.0.0.58:8792
adb logcat -d -s SiwdSelfTest:I
```

## Start demo-web (LAN)

```bash
cd ~/Projects/SignInWithDash/apps/demo-web
export HOST=0.0.0.0
export PORT=8792
export SIWD_PUBLIC_ORIGIN=http://10.0.0.58:8792
# contact form from .env already loads
npm run dev
# open http://10.0.0.58:8792/  (or 127.0.0.1:8792 on the laptop)
```

If your LAN IP changed: `ip -4 route get 1.1.1.1` and update the authenticator
proxy field + `DEFAULT_PLATFORM_PROXY` if needed.

## Authenticator import (real testnet phrase)

1. Install latest debug APK if needed:

```bash
cd ~/Projects/SignInWithDash/apps/android-authenticator
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME=$HOME/Android/Sdk
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

2. On tablet: **Platform discovery proxy** = `http://10.0.0.58:8792` (Save).
3. Same Wi‑Fi as the laptop; demo-web running.
4. Import **testnet** recovery phrase (words space-separated; “Show phrase” on).
5. Expect identities only if DashPay finished **identity + name** on testnet for
   that phrase.

## Login ceremony

1. Laptop browser: `http://10.0.0.58:8792/register` or `/login`  
   (origin must match what the phone can fetch — LAN is fine for local).
2. Scan QR or paste capability URL on the phone.
3. Approve; browser should finish session.

For **real Platform verify** (not fixtures):

```bash
export SIWD_VERIFY_MODE=platform
# restart demo-web
```

## Publish later (not laptop)

| Piece | Production shape |
| --- | --- |
| Demo site | Public HTTPS origin, process manager, no simulator on public host |
| Contact form | `SIWD_CONTACT_TO` + SMTP in host env only |
| Authenticator | Discovery via on-device MNL/quorum **or** a public Platform gateway — not a home PC |
| Mainnet | Separate gated build |

## Remaining code gaps

- [ ] On-device discovery with real quorum/MNL (or proof-free API).
- [ ] Don’t hardcode `10.0.0.58` long-term (detect or settings only).
- [ ] Phrase import after identity exists — end-to-end manual pass.
- [ ] Public host deploy notes for `dashlogin.…` if still desired.

## Yes — tablet iteration via adb works

You can build → `adb install` → `am start` DebugSelfTestActivity → `logcat -s SiwdSelfTest`
without touching the UI. Use that loop for connectivity and proxy regressions.
