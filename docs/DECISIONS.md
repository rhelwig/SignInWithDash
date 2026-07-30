# Architecture Decisions

This log records decisions that materially constrain the product, protocol, or
security model.

## D-001 — Working product name

**Decision:** Use **Sign in with Dash**.  
**Date:** 2026-07-27  
**Status:** Accepted

The protocol shorthand `SIWD` is provisional and may change if it conflicts
with an existing standard or project.

## D-002 — Testnet first

**Decision:** The first website, authenticator, and APK operate only on Dash
Platform testnet.  
**Date:** 2026-07-27  
**Status:** Accepted

Phrase import makes the app wallet-grade software. Mainnet requires explicit
security gates rather than a configuration toggle.

## D-003 — Identity ID is the account identifier

**Decision:** Store `(network, Dash identity ID)` as the stable authentication
provider key. Store the DPNS name as a verified public handle.  
**Date:** 2026-07-27  
**Status:** Superseded by D-013

An identity can have multiple names, so the name is unsuitable as the immutable
database key for an identity-bound account.

## D-004 — Off-chain authentication

**Decision:** Login uses a signed, server-issued challenge and does not submit a
Dash Platform state transition.  
**Date:** 2026-07-27  
**Status:** Accepted

This keeps login fast, avoids fees, and avoids publishing a public login trail.

## D-005 — Narrow signing capability

**Decision:** The SIWD component exposes only request validation and SIWD
approval. It has no payment, transfer, withdrawal, identity-update, document,
or arbitrary-message signing interface, even when hosted inside a full wallet.  
**Date:** 2026-07-27  
**Status:** Accepted

The host wallet necessarily has broader capabilities. The SIWD boundary must
not turn those capabilities into a general signing oracle.

## D-006 — HTTPS capability URL in QR

**Decision:** The QR and copy control carry a short-lived HTTPS request URL.
The app fetches the structured request and posts the response over TLS.  
**Date:** 2026-07-27  
**Status:** Provisional

This supports App Links and small QR codes. Draft 1 must still define protection
against request forwarding, cancellation, and origin confusion.

## D-007 — Native Android first

**Decision:** Start the phone authenticator as native Kotlin/Compose.  
**Date:** 2026-07-27  
**Status:** Provisional

Android is the initial sideloading target, and native APIs cover Keystore,
biometric approval, app links, camera, and secure-window behavior. Reuse of
Dash's current Rust/mobile wallet components remains under investigation.

## D-008 — Reuse the Platform Kotlin/Rust SDK

**Decision:** Base identity discovery, DPNS access, derivation, protected key
storage, and signing on the current Platform Kotlin SDK and unified Rust wallet.
Do not reimplement those primitives in application Kotlin.  
**Date:** 2026-07-27  
**Status:** Accepted

Source inspection found a current Android SDK, JNI bridge, keystore signer, and
mnemonic-backed identity discovery in the Platform monorepo. This supersedes
the earlier assumption that the authenticator would need to construct its own
wallet implementation.

## D-009 — Provisional signature primitive

**Decision:** Draft 1 uses the rust-dashcore/Platform convention:
double-SHA256 of canonical bytes and a 65-byte compact recoverable secp256k1
ECDSA signature, transported as unpadded base64url.  
**Date:** 2026-07-27  
**Status:** Provisional pending cross-language golden vectors

The JavaScript/WASM `wallet.signMessage` helper is explicitly not used because
it produces a different 64-byte, single-SHA256 format.

## D-010 — Prefer a high authentication key

**Decision:** Prefer an active, unbounded `AUTHENTICATION/HIGH` ECDSA identity
key for SIWD, normally key ID 2 in the current canonical identity layout.
Never use master, transfer, withdrawal, encryption, or voting keys.  
**Date:** 2026-07-27  
**Status:** Provisional pending historical-identity compatibility review

The verifier selects by purpose, level, type, bounds, and disabled state—not by
hard-coded key ID alone.

## D-011 — Android wallet integration first, portable protocol always

**Decision:** Demonstrate the first real signer by forking and extending the
official Dash Android wallet, with the work structured as a focused candidate
for an upstream pull request. Keep the protocol and conformance suite wholly
independent of that wallet and of Android.  
**Date:** 2026-07-27  
**Status:** Provisional pending fork/build and upstream-boundary inspection

This avoids duplicating identity recovery and wallet security code, tests SIWD
in a realistic host, and creates a possible path to user adoption. It does not
make the Android wallet repository the protocol definition. An independent
authenticator remains an option if upstream scope, release cadence, or security
review makes the wallet integration impractical.

## D-012 — Native hosts may differ; behavior must conform

**Decision:** Do not require shared mobile/desktop UI or a single application
framework. Require every host to consume the same request model, canonical
bytes, signing algorithm, origin rules, response format, and conformance
vectors.  
**Date:** 2026-07-27  
**Status:** Accepted

The official iOS wallet is a distinct Objective-C/Swift application, while
desktop wallets span Windows, macOS, and Linux. A language-neutral protocol
boundary preserves portability better than choosing a cross-platform UI stack.

## D-013 — Explicit account-binding policy

**Decision:** SIWD supports two relying-party account-binding policies:
`identity_bound` and `name_bound`. The requested policy is bound into the
signed authentication exchange and stored with the local authentication
provider. Implement and test `identity_bound` first; include both policies in
the MVP.  
**Date:** 2026-07-29  
**Status:** Accepted

For `identity_bound`, `(network, identity ID)` is the stable provider key and a
DPNS name is a verified public handle. A later name transfer does not transfer
the website account.

For `name_bound`, `(network, normalized DPNS name)` is the stable provider key
and its current resolved identity controls the website account. A finalized
name transfer transfers the account and its associated rights to the new
identity. The website must atomically rebind control, revoke the former
controller's sessions and recovery paths, and preserve an audit trail without
rewriting historical attribution.

The demo site and immediate use cases use `identity_bound`. Binding policy is
explicit and persistent; it is never inferred from a display name or silently
changed for an existing provider.

## D-014 — Standalone Android distribution remains portable

**Decision:** A future standalone SIWD authenticator must run on GrapheneOS
without requiring Google Play services and must remain eligible for
distribution through F-Droid-compatible repositories and direct signed APK
release. If published on Google Play, it should also be installable through
Aurora Store as an alternative Play client.  
**Date:** 2026-07-29  
**Status:** Accepted

This requirement applies to a separately packaged SIWD authentication/login
app. It does not constrain the initial experimental fork of the official Dash
Android wallet, which is a testnet demonstration and upstream-integration
candidate rather than an independently promoted application.

The standalone app therefore avoids mandatory proprietary SDKs, Google account
requirements, Play Integrity, Firebase-only services, and Play-only delivery.
Its core authentication, QR scanning, app links, secure storage, device
authentication, networking, and updates must have free/open-source and
standard-Android paths. Store-specific integrations, if any, remain optional
build variants and may not be required for authentication.

## D-015 — Principals, public identity, and economic abuse friction

**Decision:** SIWD authenticates a cryptographic principal, not necessarily a
human. People, organizations, services, and autonomous agents may intentionally
participate. Identity/name creation cost is useful baseline abuse friction when
combined with site-specific controls, but it is not proof of personhood and
SIWD does not attempt to provide proof of personhood.  
**Date:** 2026-07-29  
**Status:** Accepted

A relying site may issue a site-local display handle and keep the Dash name out
of public content. This provides public pseudonymity but not relying-party
unlinkability: the site still sees the stable Dash identity and name during
SIWD, and cooperating sites can correlate reused identifiers. Users who want
recognition may deliberately reuse one public identity. Stronger unlinkability
requires separate site-specific identities or a future privacy-preserving
protocol.

Mnemonic recovery is a central portability benefit. A conforming wallet should
be able to rediscover deterministically derived identity keys from the recovery
phrase and reconstruct Platform relationships. This does not back up website
content, local handles, recovery overrides, or nonstandard external state, and
the phrase's ability to recover financial keys increases both the incentive to
protect it and the consequence of compromise.

The MVP authenticator still requires explicit user approval for each signature.
Unattended autonomous agents require a later, distinct signer profile using
site- or contract-bounded delegated keys, expiration, rate limits, and narrow
actions. They must not automate approval with the wallet's general identity key.

## D-016 — Layer anti-relay controls without blocking the first demo

**Decision:** Keep requests short-lived, single-use, and browser-bound in the
MVP, but do not describe those controls alone as complete phishing resistance.
Add a direct cross-device approval warning. Design authenticator-initiated
login as an early post-MVP extension; session-management UI and proximity
transport do not block the first identity-bound demonstration.  
**Date:** 2026-07-29  
**Status:** Accepted

The two-minute default materially limits stockpiling, delayed reuse, accidental
disclosure, and the coordination window for phishing. It does not stop a
prepared attacker from forwarding a fresh legitimate request and obtaining
approval within that window.

The authenticator must say, in substance: “Only approve if you personally
started this login to `<domain>` in a browser moments ago.” This is an intent
check, not a cryptographic anti-relay claim.

Authenticator-initiated login lets the user choose a previously verified or
explicitly entered site in the authenticator, which opens the site's HTTPS
login-start endpoint. Version 1 keeps room for this flow, but the first MVP
need not implement trusted-site storage, discovery, return routing, or session
handoff.

## D-017 — Agent authentication is a separate constrained signer profile

**Decision:** Future autonomous-agent support uses a separate authenticator
application, wallet component, or narrowly scoped MCP server. It may control
the agent's own wallet and identity, but SIWD authentication authority remains
separate from payment, transfer, withdrawal, master, and arbitrary-signing
authority.  
**Date:** 2026-07-29  
**Status:** Accepted

An unattended signer requires an allowlist of relying-party domains and
actions, site- or contract-bounded delegated keys where available, expiration,
rate and budget limits, revocation, and an immutable audit trail. An MCP
integration exposes structured SIWD operations rather than a recovery phrase,
private key, or generic `sign(bytes)` capability.

Human wallet integration and agent automation share the wire protocol and
verifier behavior, not necessarily the same approval policy or application.
