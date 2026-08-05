# Local soak checklist — demo + authenticator

Operator notes for a **local** LAN/USB test pass before public deploy.
Substitute your own host addresses; do not treat example IPs as constants.

For host-agnostic guidance see [LOCAL-DEV-CONFIG.md](LOCAL-DEV-CONFIG.md).
For production host steps see [LIVE-TESTNET-DEPLOY-CHECKLIST.md](LIVE-TESTNET-DEPLOY-CHECKLIST.md).

## Common local pitfalls (historical)

1. **On-device DAPI** needs quorum public keys (masternode list). Without that, the
   native SDK may ban nodes (`quorum not found` / `NoAvailableAddresses`).
2. **`adb reverse` HTTP** can be flaky on some devices; Wi‑Fi LAN with
   `HOST=0.0.0.0` and `SIWD_PUBLIC_ORIGIN=http://YOUR_LAN_IP:PORT` is often easier.
3. Demo-web must bind **all interfaces** when a phone will use a LAN IP
   (`HOST=0.0.0.0`, not only `127.0.0.1`).
4. `SIWD_PUBLIC_ORIGIN` must match the origin the **browser** actually uses.

## Self-test on device (optional)

```bash
export PATH="$HOME/Android/Sdk/platform-tools:$PATH"   # if needed
# After adb reverse, or set proxy to your LAN origin:
adb shell am start -n org.siwd.authenticator.testnet.debug/.DebugSelfTestActivity \
  --es proxy http://127.0.0.1:8792
adb logcat -d -s SiwdSelfTest:I
```

## Start demo-web (LAN example)

```bash
cd apps/demo-web
export HOST=0.0.0.0
export PORT=8792
# Replace YOUR_LAN_IP with this machine’s address on the phone’s network:
export SIWD_PUBLIC_ORIGIN=http://YOUR_LAN_IP:8792
npm run dev
# laptop browser: same origin (or http://127.0.0.1:8792 if that matches PUBLIC_ORIGIN)
```

Discover LAN IP examples: `hostname -I`, or
`ip -4 route get 1.1.1.1 | awk '{print $7; exit}'`.

## Authenticator import (real testnet phrase)

1. Create/fund a **testnet** identity + DPNS name (e.g. testnet DashPay).
2. Import **only that testnet phrase** (optional BIP-39 passphrase if you set one).
3. Prefer on-device discovery; use DPNS name assist if public-key-hash lookup is flaky.
4. Never enter a mainnet phrase.

## End-to-end login

1. Browser: open the demo origin → **Sign in with Dash**.
2. Phone: scan QR or paste capability URL → approve.
3. Browser finishes → `/me` / accounts as expected.

## Before public host

- [ ] `SIWD_VERIFY_MODE=platform`
- [ ] `SIWD_ENABLE_SIMULATOR=false`
- [ ] `SIWD_SITE_OWNER_NAMES` set (not empty on a public host)
- [ ] HTTPS origin; secrets only on host env
- [ ] No personal LAN IPs committed in app configs
