# Security and Threat Model

**Status:** Initial threat model  
**Scope:** Testnet prototype and the architecture required before mainnet

## 1. Security objective

The website should learn that the principal approving a particular,
short-lived, domain-bound request controls an active authentication key of the
Dash identity to which the selected DPNS name resolves. The principal may be a
person, organization, service, or autonomous agent.

It must not learn the recovery phrase or private key, gain payment authority,
or reuse the proof for a different domain, action, account, or time.

## 2. Recovery phrase risk

Importing a Dash recovery phrase is categorically different from entering a
30-second Authy code. An OTP seed usually controls one service credential. A
Dash wallet phrase may recover financial keys, Platform identities, and other
future capabilities.

Consequences:

- The app must be treated as wallet-grade security software even though its UI
  is an authenticator.
- Sideloading increases provenance and update risk.
- A testnet-only build must warn users never to enter a mainnet phrase.
- No production/mainnet phrase should be used until reproducible builds,
  dependency review, signed releases, secure updates, and an external security
  review exist.

The preferred eventual product path is native support in a trusted Dash wallet
or a dedicated site-login-only key. Phrase import and a wallet-fork demo show
feasibility; they are not automatically the ideal long-term production shape
for a separately promoted authenticator.

## 3. Key minimization

After phrase validation and identity discovery:

- Derive only the required identity authentication key.
- Do not retain master, transfer, withdrawal, encryption, L1 payment, or other
  unrelated derived keys.
- Do not implement generic derivation or arbitrary-signing APIs.
- Clear the phrase and unrelated derived material from reachable memory as
  promptly as the platform permits.
- Encrypt retained key material using an Android Keystore key configured to
  require local user authentication.
- Prevent Android backup and cloud transfer of secret storage.
- Delete stored secrets on local reset and failed migration.

Java/Kotlin cannot guarantee perfect memory zeroization. The implementation
must document that limitation and keep secret lifetime and copies minimal.

## 4. Principal threats and controls

| Threat | Required control |
| --- | --- |
| Database theft | Store no wallet secrets server-side; hash request nonces; encrypt phone key material |
| Capability URL theft | ≥256-bit token; short TTL; `Cache-Control: no-store` on request bodies; referrer policy; redacted logs; rate limits |
| Malicious QR | Fetch over HTTPS; validate schema, origin, expiry, and response URI before display |
| Phishing domain | Bind and prominently display normalized origin; reject insecure and lookalike parsing tricks; confusable-safe fonts |
| Login QR forwarding | Browser binding; short TTL; explicit “only if you started this login” warning; session history/revoke; do not claim phishing resistance |
| Remote live relay | Same residual risk as QR forwarding; proximity is optional future hardening, not MVP |
| Replay | Random nonce, short expiry, atomic one-time state transition |
| Request alteration | Include all security-relevant request and response fields in canonical signature |
| Wrong-name substitution | Sign the name and resolve it to the same identity at verification |
| Binding-policy substitution | Include the requested policy in the signed preimage and require an exact request match |
| Platform state | Trust successfully retrieved DAPI/SDK data as authoritative; if Platform is unavailable, login fails |
| Stale name ownership | Fresh, proved, finalized DPNS state before name-bound login or transfer |
| Contested/unresolved name | Reject; not eligible for SIWD |
| Former owner retains access | Atomically revoke sessions, pending requests, recovery methods, linked providers, and API credentials during transfer |
| Transfer during active session | Revalidate name control before sensitive actions; short sessions; event-driven or periodic checks where available |
| Transfer race or partial rebind | Serialize ownership changes; one transaction for controller, rights, revocations, audit |
| Disabled/stolen key | Query current key state at verification; reject disabled or disallowed keys |
| Account collision | Policy-specific unique provider key; transactional register/link/transfer |
| Session fixation | Rotate session ID after authentication; secure cookie attributes |
| Long-lived “remember me” theft | Demo default: browser-session cookies only (D-025); no multi-week refresh by default |
| User enumeration | Uniform errors and timing where practical |
| Clipboard leak | Prefer QR/App Links; never copy phrase automatically; clear copied auth URL where supported |
| Screenshots/recents | Use Android secure-window controls on phrase and approval screens |
| Accessibility malware | Require Android protected confirmation/biometric; never approve in background |
| Deep-link hijack | Verified App Links / Digital Asset Links for production hosts |
| Overlay / task hijacking | Trusted approval UI; device authentication; avoid fragile overlay assumptions |
| Rooted/debuggable device | Warn or block according to release policy; never rely on root detection as the sole control |
| Supply-chain compromise | Pin dependencies, generate SBOM, signed/reproducible APK goal, secret scanning |
| Store or service lock-in | Standalone app works without Play services; publish verifiable source and direct/F-Droid-compatible builds |
| Logging/crash telemetry | Redaction by construction; telemetry disabled on secret flows; tests inspect logs |
| Network confusion | Separate build/flavor and unmistakable testnet visuals; network included in signature |
| Clock manipulation | Server enforces lifetime; phone also warns/rejects clearly stale requests |
| Denial of service | Rate-limit create/fetch/respond/status/finish; cap payloads; expire pending records |
| Free-form UI social engineering | No free-form statement field; canned templates only |

## 5. Capability URLs and caching

The QR and copy-link URL contain a **≥256-bit** capability token. Treat it like
a password-reset token:

- Fetching the request reveals the nonce and other fields needed to craft a
  signature payload (the private key still never leaves the phone).
- Request **JSON bodies** and any response containing secrets: `Cache-Control:
  no-store`; no shared-cache storage.
- **QR images** that merely encode the short-lived HTTPS URL may be cached for
  ordinary performance; the secret is the URL/token and the fetched body, not
  the image format. Avoid long-lived HTML pages that embed still-valid
  capability URLs in ways that outlive the request.
- Referrer policies and access-log redaction are mandatory for capability
  routes (see [`PROTOCOL.md`](PROTOCOL.md) §2.1–2.2).

## 6. Platform / DAPI trust

### 6.1 What the signature does not prove

After the phone signs, the website must still learn from Dash Platform:

- Is this public key still an active authentication key on identity *I*?
- Does DPNS name *N* currently resolve to *I*?
- Is the name finalized and not contested?

The signature only proves control of a private key for a claimed key id. Key
status and name ownership come from Platform via DAPI (through the SDK).

### 6.2 Normative assumption

**SIWD v1 assumes that successfully retrieved DAPI/SDK Platform data is valid
authoritative state**, including identity keys and DPNS name resolution. That
is the same class of assumption other correct Platform applications make: the
network, quorums, and client stack behave as Dash documents. SIWD does not
try to second-guess consensus by querying every DAPI node on every login.

When Platform state is obtained, the verifier applies it as truth for that
attempt (subject to ordinary eligibility rules: key purpose, disabled flag,
contested/unresolved names, and so on).

SDK-verified proofs SHOULD be enabled when the pinned SDK exposes them. They
strengthen the same assumption; they are not a separate product promise that
DAPI is untrusted by default.

### 6.3 When Platform cannot be reached

If identity or DPNS state cannot be retrieved, verification is incomplete, so
**login fails** (no session, no name-bound transfer). The user can retry when
Platform is available. There is no “skip Platform checks” mode.

### 6.4 Operational load

Default: the pinned SDK’s normal endpoint path once per respond. Optional
deployment choices (not protocol requirements): sample a second endpoint, or
cross-check on name-bound transfers. Do not broadcast to all public DAPI nodes
per login.

Normative protocol text: [`PROTOCOL.md`](PROTOCOL.md) §3.

## 7. Cross-device phishing and QR forwarding

### 7.1 Attack that still works

1. Attacker opens `example.com` and starts a real SIWD login.
2. Attacker sends the real QR/capability URL to the victim.
3. Victim's authenticator correctly shows `example.com`.
4. Victim approves.
5. Attacker's browser holds the binding cookie and receives the session.

Nothing was forged; the victim authorized the attacker's ceremony.

### 7.2 MVP posture

| Control | MVP role |
| --- | --- |
| Domain-bound signature | Stops fake-domain credential harvesting |
| Browser binding cookie | Stops bare URL/response from becoming a session |
| ≥256-bit capability + short TTL | Limits stockpiling and delayed reuse |
| Explicit initiation warning | Intent check; not cryptographic binding |
| Session history / revoke on demo site | Detection and recovery |
| BLE / proximity | **Not required** for MVP; optional future research |
| Confirmation codes between browser and phone | **Not used**; extra friction without cryptographic anti-relay value against an active forwarder |

Do not market the MVP cross-device flow as phishing-resistant. Passkeys with
proximity or authenticator-bound ceremonies remain the benchmark for that
claim. Authenticator-initiated login is a later extension that can reduce
QR-delivery risk without forcing radio proximity.

## 8. Approval UX requirements

Every signing prompt shows canned, structured copy only:

- the exact normalized relying-party domain (confusable-safe font);
- `Create account`, `Sign in`, or `Link account` in plain language from
  `action`;
- selected `name.dash`;
- binding policy in plain language when it affects ownership;
- testnet/mainnet;
- requested disclosures (identity ID and DPNS name in version 1);
- remaining lifetime;
- an explicit cancel action.

For cross-device login it also states that the user should approve only if they
personally started a login for the displayed domain moments ago.

Rules:

- No free-form site-supplied statement field.
- No untrusted logos or site-supplied styling that can imitate the
  authenticator's trusted chrome.
- Canned templates may be localized; they must not accept site-authored prose
  into the approval surface.

## 9. Account authority when multiple methods exist

The demo may treat SIWD as the only authentication method. When a site also
offers passkeys or other providers:

- **SIWD is the superior/controlling method** for account ownership while it
  remains linked under the stored binding policy.
- Weaker methods must not silently override SIWD control, change binding
  policy, or re-attach a former `name_bound` controller after transfer.
- **Unlinking SIWD** without an explicit user action that transfers the account
  to another surviving method (for example passkey-only) **deactivates** the
  account: existing sessions are revoked and login fails until a defined
  recovery or reactivation policy runs.
- Explicit transfer to passkey-only (or another allowed sole method) is a
  distinct, confirmed user action, not a side effect of unlink.

Break-glass support override of SIWD ownership is out of scope for the demo and
must be documented as weakening the model if a production site ever adds it.

## 10. Name-bound revocation guidance for site developers

Exact objects to revoke are site-specific. SIWD requires atomic rebind plus
revocation of former-controller access. Suggested checklist for integrators:

- browser sessions and session-store entries;
- remember-me / long-lived cookies;
- pending SIWD requests and finish grants;
- API keys, personal access tokens, and OAuth tokens issued to the user;
- linked login providers and recovery emails/phones that could restore the
  former controller;
- WebSocket or SSE tickets and CSRF secrets tied to old sessions;
- admin or elevated grants tied to the old controller;
- device enrollments and push endpoints used for auth notifications;
- export jobs, inbox tokens, or magic links still valid for the old principal.

Preserve historical attribution (who did what before transfer). Do not rewrite
audit history as if the buyer performed past actions.

## 11. Android host controls

In addition to Keystore and key minimization:

- Use verified App Links (Digital Asset Links) for production request hosts.
- Secure-window flags on phrase and approval screens.
- No backup of secret stores; no cloud backup of mnemonics.
- Device authentication (biometric or credential) for every SIWD signature.
- No background or notification-only approval.
- Release builds non-debuggable; secret storage fails closed after Keystore
  invalidation.
- Consider work-profile / multi-user exposure in test plans.
- Wallet-fork **demo** builds must still expose no arbitrary identity-key
  signing API through the SIWD entry point.

## 12. Forbidden behavior

- Background or notification-only approval.
- Automatic approval based on a previously trusted site.
- Giving an unattended process a mnemonic, general identity key, or arbitrary
  signing interface through SIWD or MCP.
- Signing raw bytes, arbitrary text, transactions, or Platform state
  transitions through the SIWD handler.
- Accepting redirect or response endpoints on a different origin in version 1.
- Putting a phrase or private key into WebView, JavaScript, analytics, crash
  telemetry, QR data, or website storage.
- Treating a DPNS name as proof of age, legal identity, uniqueness of a human,
  or good standing.
- Accepting unresolved or contested DPNS names.
- Inferring or silently changing an account's binding policy during login.
- Treating a name-bound controller change as an ordinary login without
  revoking the former controller.
- Issuing a session when Platform identity/DPNS state could not be retrieved.
- Enabling mainnet by changing a hidden flag in the test APK.
- Claiming MVP cross-device login is phishing-resistant.

## 13. Security gates

Before a testnet APK is shared:

- threat-model review;
- deterministic protocol test vectors;
- secret-storage and backup inspection;
- log/network inspection with seeded canary secrets (including capability URL
  redaction);
- malicious QR corpus;
- attacker-originated legitimate-QR relay tests;
- dependency and license inventory;
- signed APK and checksum publication;
- clear uninstall/reset instructions.

Before mainnet:

- external cryptographic and mobile security review;
- reproducible-build procedure;
- secure update channel;
- recovery and key-rotation behavior;
- explicit written decision on residual QR-forwarding risk and whether any
  optional proximity or authenticator-initiated defenses ship;
- standalone GrapheneOS test pass without sandboxed Google Play installed;
- reproducible or independently verifiable standalone builds suitable for
  direct and F-Droid-compatible distribution;
- independent verification against current Dash standards;
- decision on whether phrase import remains acceptable;
- confirmed Platform lookup path for identity and DPNS queries, including
  correct failure when DAPI is unavailable.

## 14. Future agent signer profile

Autonomous agents are valid SIWD principals, but unattended execution changes
the threat model. A future agent authenticator or MCP server must:

- use a separate identity or delegated authentication key where practical;
- restrict domains and SIWD actions by explicit policy;
- prefer site- or contract-bounded keys;
- define expiration, rate limits, and revocation;
- keep an append-only security audit trail;
- separate authentication authority from payment budgets and financial keys;
- reject arbitrary bytes and unknown message types; and
- keep recovery phrases and raw private keys outside the MCP interface.

An agent may own a wallet and exercise financial autonomy through a separately
governed component. That does not justify exposing payment or master keys to
the website-login surface.

## 15. Reporting

A vulnerability-reporting channel and coordinated disclosure policy must be
added before distributing an APK outside the immediate development group.
