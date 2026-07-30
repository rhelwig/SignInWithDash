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

The preferred eventual design is native support in a trusted Dash wallet or a
way to provision a dedicated, site-login-only key. Phrase import is the bridge
for the demonstrator, not automatically the ideal final product.

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
| Malicious QR | Fetch over HTTPS; validate schema, origin, expiry, and response URI before display |
| Phishing domain | Bind and prominently display normalized origin; reject insecure and lookalike parsing tricks |
| Login QR forwarding | Browser binding is insufficient; require and test an additional browser/phone confirmation or equivalent intent-binding ceremony |
| Remote relay of a legitimate request | Investigate an ephemeral encrypted browser/app channel plus BLE or equivalent proximity proof; fail closed in high-assurance mode |
| Replay | Random nonce, short expiry, atomic one-time state transition |
| Request alteration | Include all security-relevant request and response fields in canonical signature |
| Wrong-name substitution | Sign the name and resolve it to the same identity at verification |
| Binding-policy substitution | Include the requested policy in the signed preimage and require an exact request match |
| Stale name ownership | Use fresh, preferably proved, finalized DPNS state before a name-bound login or transfer |
| Former owner retains access | Atomically revoke sessions, pending requests, recovery methods, linked providers, and API credentials during transfer |
| Transfer occurs during an active session | Revalidate name control before sensitive actions; use short sessions and event-driven or periodic checks where available |
| Transfer race or partial rebind | Serialize ownership changes and update controller, rights, revocations, and audit record in one transaction |
| Disabled/stolen key | Query current key state; reject disabled or disallowed keys |
| Account collision | Policy-specific unique provider key; transactional register/link/transfer |
| Session fixation | Rotate session ID after authentication; secure cookie attributes |
| User enumeration | Uniform errors and timing where practical |
| Clipboard leak | Prefer QR/App Links; never copy phrase automatically; clear copied auth URL where supported |
| Screenshots/recents | Use Android secure-window controls on phrase and approval screens |
| Accessibility malware | Require Android protected confirmation/biometric; never approve in background |
| Rooted/debuggable device | Warn or block according to release policy; never rely on root detection as the sole control |
| Supply-chain compromise | Pin dependencies, generate SBOM, signed/reproducible APK goal, secret scanning |
| Store or service lock-in | Standalone app works without Play services; publish verifiable source and direct/F-Droid-compatible builds |
| Logging/crash telemetry | Redaction by construction; telemetry disabled on secret flows; tests inspect logs |
| Network confusion | Separate build/flavor and unmistakable testnet visuals; network included in signature |
| Clock manipulation | Server enforces lifetime; phone also warns/rejects clearly stale requests |
| Live relay within request lifetime | Short expiry limits the window but is not sufficient; show an initiation warning and investigate proximity or authenticator initiation |
| Denial of service | Rate-limit issuance/response, cap payloads, expire pending records |

## 5. Approval UX requirements

Every signing prompt shows:

- the exact normalized relying-party domain;
- `Create account`, `Sign in`, or `Link account` in plain language;
- selected `name.dash`;
- testnet/mainnet;
- requested disclosures;
- remaining lifetime;
- an explicit cancel action.

For cross-device login it also states that the user should approve only if they
personally started a login for the displayed domain moments ago.

The approval screen must not display untrusted logos or site-supplied styling in
a way that can imitate the authenticator's trusted UI.

## 6. Forbidden behavior

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
- Inferring or silently changing an account's binding policy during login.
- Treating a name-bound controller change as an ordinary login without
  revoking the former controller.
- Enabling mainnet by changing a hidden flag in the test APK.

## 7. Security gates

Before a testnet APK is shared:

- threat-model review;
- deterministic protocol test vectors;
- secret-storage and backup inspection;
- log/network inspection with seeded canary secrets;
- malicious QR corpus;
- attacker-originated legitimate-QR relay tests;
- attacker-originated legitimate-QR relay tests;
- dependency and license inventory;
- signed APK and checksum publication;
- clear uninstall/reset instructions.

Before mainnet:

- external cryptographic and mobile security review;
- reproducible-build procedure;
- secure update channel;
- recovery and key-rotation behavior;
- a reviewed cross-device proximity or equivalent anti-relay design, or an
  explicit decision not to claim phishing resistance;
- a reviewed cross-device proximity or equivalent anti-relay design, or an
  explicit decision not to claim phishing resistance;
- standalone GrapheneOS test pass without sandboxed Google Play installed;
- reproducible or independently verifiable standalone builds suitable for
  direct and F-Droid-compatible distribution;
- independent verification against current Dash standards;
- decision on whether phrase import remains acceptable.

## 8. Future agent signer profile

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

## 9. Reporting

A vulnerability-reporting channel and coordinated disclosure policy must be
added before distributing an APK outside the immediate development group.
