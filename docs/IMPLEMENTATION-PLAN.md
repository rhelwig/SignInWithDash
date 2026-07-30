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

### First wallet integration

- Fork the current official Dash Android wallet and add SIWD as a bounded
  feature rather than creating a second wallet implementation immediately.
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
  requests and displays their relying-party context.

The protocol, canonical encoder, verifier behavior, and conformance vectors
must not depend on Android, Kotlin, Android App Links, or wallet-internal data
models. Native Android is the first host because it is available for
sideloading and already supports Dash Platform identities. Later integrations
may use the official iOS wallet, a desktop wallet, a browser-to-local-app
handoff, or an independent authenticator without changing the wire protocol.

The wallet fork is only a testnet demonstration and possible upstream change.
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
- [ ] Locate and evaluate current Yappr/Yapper authentication work.
- [x] Select the provisional Dash signing primitive.
- [ ] Finalize the eligible identity-key policy across historical identities.
- [ ] Define canonical binary encoding.
- [ ] Publish cross-language test vectors.
- [ ] Include `bindingPolicy` in requests, responses, canonical bytes, and
      negative vectors.
- [ ] Record decisions in `DECISIONS.md`.

Exit: Kotlin and TypeScript can independently generate the same digest and
verify the same test signatures.

### M1 — Website request lifecycle with simulator

- [ ] Create protocol TypeScript package.
- [ ] Implement in-memory then SQLite challenge store.
- [ ] Render login/register pages, QR, copy link, status, and expiry.
- [ ] Implement browser-binding cookie and atomic request states.
- [ ] Build a development-only signer simulator with generated test keys.
- [ ] Add replay, expiry, mutation, and browser-binding tests.
- [ ] Add the explicit cross-device “only approve if you started this login”
      warning to simulator approval fixtures and tests.
- [ ] Select and test an additional defense against attacker-originated QR
      forwarding; do not treat browser binding alone as sufficient.
- [ ] Prototype an ephemeral browser/authenticator channel with BLE or
      equivalent proximity proof and compare it with authenticator-initiated
      login.
- [ ] Model both provider-key policies in SQLite, with `identity_bound` enabled
      first in the demo.

Exit: the entire user journey works locally without claiming Dash verification.

### M2 — Real Platform verification

- [ ] Connect verifier to Dash Platform testnet.
- [ ] Retrieve identity and eligible active authentication key.
- [ ] Resolve and normalize DPNS name.
- [ ] Verify real test signatures.
- [ ] Request SDK-verified proofs where supported.
- [ ] Add network outage/stale data/error behavior.

Exit: a command-line signer using a generated testnet phrase can authenticate.

### M3 — Dash Android wallet integration

- [ ] Fork and reproducibly build the current Dash Android wallet.
- [ ] Add a bounded testnet SIWD feature/module with no arbitrary-signing API.
- [ ] Reuse the wallet's existing restored identity and DPNS name selection.
- [ ] Resolve an eligible identity authentication key through a narrow adapter.
- [ ] Require device authentication for each SIWD signature.
- [ ] Verify no secrets in logs, backup, screenshots, or process recreation.

Exit: a locally built wallet fork safely selects an existing testnet identity
and produces a golden-vector-compatible SIWD signature.

### M4 — QR login

- [ ] Scan and parse request URLs.
- [ ] Fetch and validate request.
- [ ] Implement trusted approval UI and device authentication.
- [ ] Sign canonical challenge.
- [ ] Submit response and return to browser.
- [ ] Complete registration, login, link, logout, and unlink flows.
- [ ] Complete the demo site's `identity_bound` policy and name-change tests.
- [ ] Run adversarial QR and race-condition tests.

Exit: desktop-to-phone testnet identity-bound login meets the applicable
success criteria in `SPECS.md`.

### M5 — Name-bound ownership

- [ ] Enable `name_bound` as an explicit relying-party policy.
- [ ] Detect a changed DPNS controller using fresh, preferably proved, finalized
      Platform state.
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
- [ ] Add vulnerability reporting and privacy documentation.
- [ ] Document sideloading, testnet funding/identity prerequisites, reset, and
      uninstall.
- [ ] Produce a repeatable end-to-end manual test checklist.
- [ ] Obtain an independent security review appropriate to the audience.

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

1. Resolve Yappr/Yapper project identity and compare its QR flow.
2. Write Draft 1 canonical encoding and cross-language test vectors.
3. Verify the Kotlin SDK artifact/JNI packaging and the phrase-deletion
   lifecycle, and map it against the current Android wallet's own key storage,
   without writing application UI.
4. Confirm Evo SDK identity/DPNS proof APIs for the server verifier.
5. Inspect Android upstream contribution boundaries and identify the smallest
   SIWD module/change set that could plausibly be reviewed.

Implementation remains paused until the existing documentation and the new
source-inspection findings have been reviewed.

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
