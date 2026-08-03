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
identity. The demo implements and tests `identity_bound` first, then adds
`name_bound` before the MVP is complete.

## Project shape

The planned repository contains four related deliverables:

- **Demo website** — account registration, login, account linking, logout, and
  an authenticated profile.
- **Android authenticator** — testnet identity discovery, QR/deep-link handling,
  safe request review, and identity authentication signatures.
- **Protocol package** — canonical request/response types, encoding rules, and
  cross-language test vectors.
- **Server verifier** — reusable challenge issuance, Dash verification, replay
  prevention, and session integration.

The initial phone app is deliberately not a payment wallet. It derives only the
identity material required for authentication and exposes no payment,
withdrawal, identity-update, or arbitrary-signing interface.

The initial official-wallet modification is an MVP **demo** that shows how SIWD
*could* integrate into real wallets and informs a possible upstream pull
request. It is not a preferred production daily driver without wallet
maintainers' own security review. A future separately packaged SIWD
authenticator has additional portability requirements: it must work on
GrapheneOS without Google Play services and remain suitable for direct,
F-Droid-compatible, and Google Play/Aurora installation paths.

## Status

The project is in its specification and threat-model phase. No production-safe
authenticator exists yet. Testnet is the only planned network for the first
working milestone.

## Status

Protocol Draft 1 encoding and **numeric golden vectors** live under
`test-vectors/v1/` (generated and verified by `packages/protocol`).

```bash
cd packages/protocol && npm install && npm test
```

### Demo website (M1)

Localhost demo with QR login ceremony, public account list, and a **dev
simulator** (fixture keys; no live Platform yet):

```bash
cd apps/demo-web && npm install && npm run dev
# http://127.0.0.1:8787
```

See [docs/DEMO-SITE.md](docs/DEMO-SITE.md).

## Documentation

- [Authentication and message flows](docs/FLOWS.md)
- [Authentication-method comparison and positioning](docs/AUTHENTICATION-COMPARISON.md)
- [Product specification](docs/SPECS.md)
- [Authentication protocol (Draft 1)](docs/PROTOCOL.md)
- [Test vector layout](docs/TEST-VECTORS.md)
- [Security and threat model](docs/SECURITY.md)
- [Research and prior art](docs/RESEARCH-2026-07-27.md)
- [Yappr evaluation and key eligibility (2026-08-02)](docs/RESEARCH-2026-08-02-YAPPR-AND-KEYS.md)
- [Current implementation and signing inspection](docs/DASH-IMPLEMENTATION-INSPECTION-2026-07-27.md)
- [Implementation plan](docs/IMPLEMENTATION-PLAN.md)
- [Architecture decisions](docs/DECISIONS.md)
- [Demo website](docs/DEMO-SITE.md)

## License and contributions

SignInWithDash is available under the [MIT License](LICENSE). Contributions do
not require copyright assignment; contributors retain ownership of their work
while licensing it for unrestricted use under MIT. See
[CONTRIBUTING.md](CONTRIBUTING.md).
