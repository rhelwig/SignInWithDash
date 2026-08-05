# Implementation Plan

**Status:** Initial plan  
**Strategy:** Protocol-first, testnet-only, portable core with an Android wallet
integration first

## 1. Proposed repository layout

```text
SignInWithDash/
├── README.md
├── AGENTS.md
├── docs/
├── apps/
│   ├── demo-web/
│   └── signer-simulator/
├── packages/
│   ├── protocol/
│   └── server/
├── integrations/
│   └── dash-wallet-android/
└── test-vectors/
```

Do not create implementation folders merely as placeholders. Add them with the
first working slice.

## 2. Initial technology direction

### Demo website and verifier

- TypeScript on a current supported Node.js release.
- Server-rendered HTML with minimal client JavaScript.
- SQLite for the local demo account/request store.
- A small framework may be selected after checking current dependencies; the
  protocol and verifier remain framework-neutral.
- QR generation occurs locally in the app, not through a third-party service.
- Current `@dashevo/evo-sdk` is the leading Platform integration candidate.

### First wallet integration (MVP demo)

- Fork the current official Dash Android wallet and add SIWD as a bounded
  **demo** feature that shows how SIWD *could* integrate into real wallets.
- Treat the fork as a testnet demonstration and upstream-evaluation artifact,
  not as a preferred production daily driver without wallet maintainers' own
  security review and adoption.
- Keep the integration as a separable module/change set suitable for an
  upstream pull request.
- Native Kotlin and the wallet's existing UI architecture.
- Android CameraX/ML Kit or a locally bundled QR decoder after dependency
  review.
- Android App Links for copied/same-device HTTPS request URLs.
- Reuse the wallet's identity discovery and protected key facilities, moving
  toward the current Platform Kotlin/Rust SDK where compatible.
- BiometricPrompt/device credential for every approval.
- No general-purpose signing API: the integration accepts only valid SIWD
  requests and displays their relying-party context with canned templates.

The protocol, canonical encoder, verifier behavior, and conformance vectors
must not depend on Android, Kotlin, Android App Links, or wallet-internal data
models. Native Android is the first host because it is available for
sideloading and already supports Dash Platform identities. Later integrations
may use the official iOS wallet, a desktop wallet, a browser-to-local-app
handoff, or an independent authenticator without changing the wire protocol.

The wallet fork remains a testnet demonstration and possible upstream change.
If a separately packaged Android authenticator is built, it must:

- work on GrapheneOS with no Google Play services installed;
- use standard Android or free/open-source implementations for all essential
  functions;
- avoid mandatory Play Integrity, Firebase, Google account, and Play-only
  delivery dependencies;
- support reproducible or independently verifiable direct APK builds;
- remain suitable for F-Droid-compatible packaging; and
- use the same signed package on Google Play where practical so Aurora Store
  users can retrieve it through that alternative Play client.

## 3. Milestones

### M0 — Research and protocol closure

- [x] Establish project intent, product scope, and initial references.
- [x] Draft product, protocol, and threat-model documents.
- [x] Inspect current Android DashPay and Platform wallet source.
- [x] Record capability-URL, DAPI trust, state machine, canned approval,
      SIWD-authority, and anti-relay decisions in `DECISIONS.md`.
- [x] Draft 1 protocol: canonical encoding, HTTP API, key/name rules, errors
      (`PROTOCOL.md`), test-vector schema (`TEST-VECTORS.md`).
- [x] Locate and evaluate current Yappr authentication work (DApp key
      bootstrap, not SIWD; see `RESEARCH-2026-08-02-YAPPR-AND-KEYS.md`).
- [x] Select the Dash signing primitive (Platform recoverable SHA256d).
- [x] Document eligible identity-key policy: AUTHENTICATION/HIGH only; never
      master/transfer/etc.; no CRITICAL fallback unless a later survey proves
      HIGH-less identities (`DECISIONS.md` D-010).
- [x] Generate numeric golden vectors from first encoder (`test-vectors/v1/`,
      TypeScript `@siwd/protocol`; critical positive/negative cases covered).
- [ ] Pin SDK versions and freeze DPNS normalizer vectors against live SDK.
- [ ] Re-verify golden vectors from Kotlin (and optionally Rust) once hosts land.

Exit: Kotlin and TypeScript can independently generate the same digest and
verify the same test signatures.

### M1 — Website request lifecycle with simulator

- [x] Create protocol TypeScript package.
- [x] Implement SQLite challenge store with full state machine (pending →
      approved → consumed / reject / cancel / expire).
- [x] Issue ≥256-bit capability tokens; `no-store` request bodies; rate limits.
- [x] Render login/register pages, QR, copy link, status, and expiry.
- [x] Browser-binding cookie, finish, session cookie rotation (session-only).
- [x] Development-only signer simulator with generated test keys.
- [x] Smoke test: register → sign → finish → /me + public accounts.
- [ ] Expand automated tests: replay, double-respond, double-finish, binding
      mismatch (partially covered by smoke; add unit suite).
- [x] Cross-device “only approve if you started this login” warning on ceremony
      + simulator.
- [x] Document residual QR-forwarding risk on `/security` and ceremony page.
- [x] Session history / revoke UI on `/me`.
- [x] `identity_bound` in SQLite (name_bound deferred).
- [x] Deactivate account revokes sessions (unlink/deactivate demo policy).
- [x] Public accounts directory, about / how-it-works / get-started pages.

Exit: the entire user journey works locally without claiming Dash verification.
**Met** for simulator mode (`docs/DEMO-SITE.md`).

### M2 — Real Platform verification

- [x] Connect verifier to Dash Platform testnet (`SIWD_VERIFY_MODE=platform|hybrid`).
- [x] Retrieve identity and eligible active authentication key (HIGH auth).
- [x] Resolve DPNS name for display/binding (contested edge cases still limited).
- [x] Verify real testnet signatures (E2E with imported testnet identity).
- [x] Retrieve Platform identity/DPNS state via worker/SDK path (login fails
      hard when mode is `platform` and Platform is unavailable).
- [ ] Optional sampled multi-endpoint cross-check configuration (not full
      fan-out).
- [ ] Add dedicated network outage / unavailable Platform automated tests.
- [x] Dev simulator can import a real testnet phrase and sign (session only).

Exit: a signer using a real testnet identity can authenticate against the demo.
**Met** for hybrid/platform local demos; public-host soak still pending.

### M3a — Standalone Android authenticator (primary path)

- [x] Scaffold Compose app + pure Kotlin protocol module under
      `apps/android-authenticator`.
- [x] Kotlin golden-vector tests pass against `test-vectors/v1`.
- [x] Dev fixture identities (alice/bob) + paste capability URL + approve UI.
- [x] Per-site last Dash name preference (`SiteNamePrefs`).
- [x] Camera QR scan without Play services (CameraX + ZXing).
- [x] BIP-39 testnet phrase import + encrypted storage (+ optional passphrase).
- [x] Live Platform identity/DPNS discovery path (on-device + trusted quorums;
      native SDK stability still partial on some devices).
- [x] Biometric/device credential gate on approval.
- [x] Debug APK build + sideload on a physical Android device.
- [x] Known-sites list after successful approve.
- [x] Testnet launcher branding (mainnet masters reserved for a future flavor).

### M3 — Dash Android wallet integration (demo, optional)

- [ ] Fork and reproducibly build the current Dash Android wallet.
- [ ] Add a bounded testnet SIWD **demo** module with no arbitrary-signing API.
- [ ] Document clearly that the fork is an integration demonstration, not a
      production recommendation without upstream review.
- [ ] Reuse the wallet's existing restored identity and DPNS name selection.
- [ ] Resolve an eligible identity authentication key through a narrow adapter.
- [ ] Canned approval UI with confusable-safe fonts; cross-device initiation
      warning; no confirmation codes.
- [ ] Require device authentication for each SIWD signature.
- [ ] Verify no secrets in logs, backup, screenshots, or process recreation.

Exit: a locally built wallet fork safely selects an existing testnet identity
and produces a golden-vector-compatible SIWD signature.

### M4 — QR login

- [x] Scan and parse request URLs (QR + paste + HTTPS deep link).
- [x] Fetch and validate request.
- [x] Trusted approval UI + device authentication.
- [x] Sign canonical challenge.
- [x] Submit response; browser status/finish completes session.
- [x] Registration/login auto-create for `identity_bound` demo accounts.
- [ ] Complete name-change / rebind tests for `identity_bound` display updates.
- [ ] Run fuller adversarial QR and race-condition automated suite.
- [x] Manual desktop↔phone testnet login with real identity (local).

Exit: desktop-to-phone testnet identity-bound login meets the applicable
success criteria in `SPECS.md`. **Largely met** locally; expand automated
adversarial coverage and public-host E2E.

### M5 — Name-bound ownership

- [ ] Enable `name_bound` as an explicit relying-party policy.
- [ ] Detect a changed DPNS controller using fresh finalized Platform state
      (login fails if Platform unavailable).
- [ ] Atomically rebind account control and transfer account rights.
- [ ] Revoke former-controller sessions, pending requests, linked providers,
      recovery paths, and API credentials.
- [ ] Revalidate name control for sensitive actions and define session lifetime
      plus event-driven or periodic transfer detection.
- [ ] Preserve controller history and Platform state references.
- [ ] Test transfer races, stale state, rollback/finality behavior, collisions,
      former-session use, recovery bypass, and policy substitution.
- [ ] Add clear owner, administrator, buyer, and seller documentation.

Exit: both binding policies pass end-to-end testnet tests, and a simulated or
native DPNS ownership change safely transfers a name-bound account.

### M6 — Shareable test release

- [ ] Add signed APK build and checksum instructions.
- [ ] Generate SBOM and dependency/license report.
- [x] Short privacy page + footer notice on demo-web (`/privacy`).
- [x] Document sideloading, testnet-only rules, APK download path (debug).
- [x] Manual E2E checklists (`LIVE-TESTNET-DEPLOY-CHECKLIST`, local smoke).
- [ ] Obtain an independent security review appropriate to the audience.
- [ ] Public host running demo-web with hardened env (owners, no simulator).

Exit: a small external test group can verify provenance and safely use generated
testnet credentials.

### M7 — Reusable integration

- [ ] Extract documented server middleware/adapters.
- [ ] Provide a minimal relying-party example.
- [ ] Version protocol and compatibility policy.
- [ ] Evaluate integration into DecentSite and other local projects.
- [ ] Prepare the Android integration as a focused upstream pull request.
- [ ] Write iOS and desktop integration notes against the same conformance
      suite.
- [ ] Decide whether an independent authenticator remains useful after wallet
      integration testing.
- [ ] If proceeding with a standalone Android app, add a GrapheneOS/no-Play
      test matrix and direct, F-Droid-compatible, and Play/Aurora distribution
      plan.
- [ ] Specify authenticator-initiated login as an optional V1.x flow.
- [ ] Evaluate session history, new-session notification, and revocation UI.
- [ ] Specify a separate constrained agent authenticator/MCP profile with
      delegated keys, domain/action policies, limits, and audit records.

Mainnet remains a separate gated decision.

## 4. Immediate next work

1. [Done] Draft 1 encoding + TypeScript golden vectors (`packages/protocol`,
   `test-vectors/v1/`).
2. [Done] **M1** demo website + simulator (`apps/demo-web`, see
   `docs/DEMO-SITE.md`). Expand automated edge-case tests as needed.
3. [Done enough for demos] **M2** hybrid/platform verification + real testnet
   identity login; finish outage tests and multi-endpoint options later.
4. [Done enough for demos] **M3a / M4** standalone authenticator QR + import +
   approve; harden on-device discovery; optional mainnet flavor later.
5. **Public testnet host**: deploy demo-web with HTTPS, `SIWD_VERIFY_MODE=platform`,
   simulator off, `SIWD_SITE_OWNER_NAMES` set (see
   `docs/LIVE-TESTNET-DEPLOY-CHECKLIST.md`).
6. Optional: wallet integration demo (M3) and fuller automated adversarial suite.
7. Optional later: align SIWD URI scheme with wallet maintainers; GrapheneOS matrix.

Next build slice: **deploy and smoke the public testnet demo**, then on-device
Platform discovery reliability.

## 5. Verification strategy

- Unit tests for parsing, canonicalization, signatures, state transitions, and
  account constraints.
- Property/fuzz tests for protocol decoders.
- Golden vectors shared by TypeScript and Kotlin.
- A language-neutral conformance corpus usable from Swift/Objective-C and
  C++/Rust as well as Kotlin and TypeScript.
- Integration tests against a pinned local/testnet Platform configuration.
- Android instrumentation tests for secret screens and approval lifecycle.
- Manual two-device tests with hostile QR forwarding and network interruption.
- Log, database, Android backup, and HTTP capture inspections for seeded canary
  secrets.
