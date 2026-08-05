# Sign in with Dash

Sign in with Dash is a reference project for passwordless website accounts
backed by Dash Platform identities and human-readable DPNS names.

The intended experience is:

1. A person selects **Sign in with Dash** on a website.
2. The website shows a QR code and a copyable link.
3. The person scans or opens the request in the Sign in with Dash phone app.
4. The app shows the real website domain, requested action, expiration, and the
   Dash name that will be disclosed.
5. After explicit local approval, the app signs a short-lived challenge.
6. The website verifies the signature and current Dash identity/name state,
   consumes the challenge, and creates an ordinary secure web session.

No password, email address, recovery phrase, or private key is sent to the
website.

The MVP supports two explicit account-ownership policies. `identity_bound`
accounts remain with one Dash identity even if its displayed name changes.
`name_bound` accounts follow ownership of a DPNS name, including an atomic
transfer of the website account's rights when that name moves to a new
identity. The demo implements and tests `identity_bound` first; `name_bound`
remains planned before the MVP is complete.

## Project shape

- **Demo website** — registration/login (auto-create), sessions, invites,
  contact form, optional public deploy.
- **Android authenticator** — testnet identity discovery, QR/deep-link handling,
  safe request review, and identity authentication signatures.
- **Protocol package** — canonical request/response types, encoding rules, and
  cross-language test vectors.
- **Server verifier** — challenge issuance, Dash verification modes, replay
  prevention, and session integration (embedded in the demo today).

The phone app is deliberately not a payment wallet. It derives only the
identity material required for authentication and exposes no payment,
withdrawal, identity-update, or arbitrary-signing interface.

Wallet integration remains an optional future demo path (not required to use
SIWD). A standalone authenticator should remain usable without Google Play
services where practical.

## Status

**Active development / testnet.** Not production-mainnet ready. Do not enter
mainnet recovery phrases into this software.

| Area | State |
| --- | --- |
| Protocol Draft 1 + golden vectors | Working (`packages/protocol`, `test-vectors/v1/`) |
| Demo website | Working locally; hybrid/platform verify; invites, contact, privacy pages |
| Android authenticator | Working testnet build: QR, fixtures, BIP-39 import (+ optional passphrase), device unlock, known sites |
| On-device Platform discovery | Partial (trusted quorums path; native SDK still flaky on some devices) |
| Public host | Subdomain/TLS prep documented; full app deploy checklist in docs |

```bash
cd packages/protocol && npm install && npm test
```

### Demo website

```bash
cd apps/demo-web && npm install && npm run dev
# default: http://127.0.0.1:8792
```

Verify modes: `simulator` | `hybrid` (default) | `platform`. See
[docs/DEMO-SITE.md](docs/DEMO-SITE.md) and
[docs/LOCAL-DEV-CONFIG.md](docs/LOCAL-DEV-CONFIG.md) for ports, LAN, and env.

### Android authenticator

```bash
cd apps/android-authenticator
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64   # or another JDK 21+
./gradlew :protocol:test
./gradlew :app:assembleDebug   # needs Android SDK
```

Sideload the debug APK to any compatible Android device or emulator. See
[apps/android-authenticator/README.md](apps/android-authenticator/README.md).

## Documentation

- [Local network / host-specific config](docs/LOCAL-DEV-CONFIG.md)
- [Demo website](docs/DEMO-SITE.md)
- [Live testnet deploy checklist](docs/LIVE-TESTNET-DEPLOY-CHECKLIST.md)
- [Authentication and message flows](docs/FLOWS.md)
- [Authentication-method comparison](docs/AUTHENTICATION-COMPARISON.md)
- [Product specification](docs/SPECS.md)
- [Authentication protocol (Draft 1)](docs/PROTOCOL.md)
- [Test vector layout](docs/TEST-VECTORS.md)
- [Security and threat model](docs/SECURITY.md)
- [Implementation plan](docs/IMPLEMENTATION-PLAN.md)
- [Architecture decisions](docs/DECISIONS.md)
- [Research and prior art](docs/RESEARCH-2026-07-27.md)
- [Yappr evaluation and key eligibility (2026-08-02)](docs/RESEARCH-2026-08-02-YAPPR-AND-KEYS.md)
- [Current implementation and signing inspection](docs/DASH-IMPLEMENTATION-INSPECTION-2026-07-27.md)

## License and contributions

SignInWithDash is available under the [MIT License](LICENSE). Contributions do
not require copyright assignment; contributors retain ownership of their work
while licensing it for unrestricted use under MIT. See
[CONTRIBUTING.md](CONTRIBUTING.md).
