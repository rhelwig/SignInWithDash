# Sign in with Dash: Product Specification

**Status:** Initial specification  
**Date:** 2026-07-27  
**Initial network:** Dash Platform testnet

## 1. Purpose

Sign in with Dash demonstrates that an ordinary website can create and
authenticate a local account using a Dash Platform identity and a DPNS name
instead of a password.

The project should also produce reusable protocol and verifier components for
other applications. A successful demo is not enough if each future website
would need to invent its own incompatible or unsafe login flow.

## 2. Product principles

- Signing in should take one click, one scan, one clear approval, and no typing
  in the normal cross-device flow. No confirmation codes between browser and
  phone.
- The relying website explicitly selects `identity_bound` or `name_bound`
  account ownership; the protocol never infers ownership semantics.
- In `identity_bound`, the immutable Dash identity ID is the provider
  identifier and a DPNS name is a verified public handle.
- In `name_bound`, the normalized DPNS name is the provider identifier and its
  current resolved identity controls the account.
- The website never receives the recovery phrase or a private key.
- The app never signs an opaque or arbitrary message.
- Approval copy uses only canned templates from structured fields; there is no
  free-form site-supplied statement.
- A login must not create a Dash Platform state transition or consume credits.
- Testnet and mainnet must never be visually confusable.
- Domains and names on approval screens use fonts that clearly distinguish
  confusable glyphs (for example `0` / `O` / `o`, `1` / `l` / `I`).
- Unresolved or contested DPNS names are not valid for authentication.
- Successfully retrieved DAPI/SDK Platform data (including names) is treated as
  valid. If Platform state cannot be retrieved, login fails.
- The demo may use SIWD as the only authentication method. If a site also
  offers other methods (for example passkeys), SIWD remains the
  superior/controlling method while linked. Unlinking SIWD without an explicit
  transfer to another sole method deactivates the account.
- SIWD authenticates a principal, which may be a person, organization, service,
  or autonomous agent; it does not require or imply proof of personhood.
- The demo issues **session cookies only** (no multi-week “remember me” by
  default). A fast QR/approval flow makes re-auth per browser session
  acceptable; persistent login is an optional site choice, not the default
  (see `DECISIONS.md` D-025).

## 3. Users and components

### End user

Owns a Dash recovery phrase associated with one or more Platform identities and
DPNS names. Uses the phone app to approve authentication requests.

### Relying website

Runs the demo or integrates the verifier package. It owns its local accounts,
authorization rules, application data, sessions, and recovery policy.

### Authenticator app

Imports identity material, discovers identities and names, scans or opens login
requests, obtains explicit approval, signs the canonical challenge, and sends
the response. The MVP includes a **demo** integration inside a fork of the
official Dash Android wallet to show how SIWD *could* be offered in a real
wallet. That fork is not a preferred everyday production path unless wallet
maintainers adopt and review it. A narrow protocol package and optional
standalone authenticator remain first-class.

### Dash Platform

Provides the current identity, public authentication keys, disabled-key state,
and DPNS name-to-identity relationship.

## 4. User journeys

### 4.1 First setup

1. Install the test APK from a documented release.
2. Confirm that the app is operating on testnet.
3. Enter or paste a testnet recovery phrase in a protected screen.
4. The app validates the phrase and derives standard Dash identity keys.
5. The app discovers matching Platform identities and DPNS names.
6. The user chooses which identity/name may be used for website login.
7. The app discards the phrase from UI state and retains only the minimum
   encrypted authentication material needed for later signing.
8. The app requires device authentication before it can approve a signature.

No phrase is transmitted for discovery. Logs and crash reports must exclude it.

### 4.2 Create a website account

1. Select **Create account with Dash**.
2. Scan the displayed QR code or open/copy the link.
3. Review the website domain, `register` action, selected Dash name, and expiry.
4. Approve locally.
5. The website verifies the response and current Platform state.
6. If the identity is not already linked, create the local account and session.
7. Display the authenticated Dash name and abbreviated identity ID.

The website may collect application-specific profile information afterward,
but Dash authentication itself does not require email or legal identity.
It may assign a separate site-local handle for all public display and content.
That hides the Dash name from ordinary visitors but not from the website, which
still receives the SIWD identity and name.

### 4.3 Return login

The flow is the same, with action `login`.

- Under `identity_bound`, the website finds the local account by network plus
  Dash identity ID. A transferred preferred name does not transfer the account.
- Under `name_bound`, the website finds the local account by network plus
  normalized DPNS name and requires the signer to be the identity to which the
  name currently resolves.

The demo site implements and tests `identity_bound` first.

### 4.4 Same-device login

On a phone, selecting **Sign in with Dash** opens an application link. After
approval, the authenticator returns to the browser and the browser completes
the session. The copied HTTPS request URL remains usable when deep linking is
unavailable.

### 4.5 Account linking

Linking a Dash identity to an already authenticated conventional account is a
distinct `link` action. It requires:

- a fresh authenticated website session (step-up if the session is stale);
- a fresh Dash approval;
- an explicit confirmation showing both accounts;
- rejection if that Dash identity is already linked elsewhere.

Account linking must never be inferred from matching display names.

While SIWD is linked, it is the controlling authentication authority for the
account under the stored binding policy. Other methods must not silently
override SIWD ownership, binding policy, or post-transfer controller state.

### 4.5.1 Unlink and deactivation

Unlinking SIWD:

- If the user performs an **explicit** confirmed action to transfer the account
  to another allowed sole method (for example passkey-only), SIWD may be
  removed and that method becomes authoritative.
- Otherwise, unlinking SIWD **deactivates** the account: revoke sessions,
  reject further login, and leave reactivation to a separately documented
  policy. The account must not remain fully usable on a weaker leftover method
  by accident.

### 4.6 Name-bound ownership transfer

When a `name_bound` account's DPNS name resolves to a different identity, a
successful login by the new identity is an ownership transfer, not an ordinary
new-device login. The website must atomically:

- verify fresh finalized DPNS state from DAPI/SDK (login/transfer fails if
  unavailable);
- reject unresolved or contested names;
- record the former and new controlling identity IDs and state reference;
- rebind the provider to the new controlling identity;
- revoke all former-controller access (site-specific object list; see suggested
  checklist in [`SECURITY.md`](SECURITY.md) §10);
- transfer all current rights attached to account ownership; and
- preserve historical attribution and an auditable transfer record.

The former controller's cooperation is not required after a valid DPNS
transfer. A website must document any records or obligations that are
historical rather than transferable. Weaker linked recovery methods must not
restore the former controller after transfer.

### 4.7 Authenticator-initiated login

An early post-MVP extension may let the user select a known website in the
authenticator and choose **Open and sign in**. The app opens a verified HTTPS
login-start URL, receives a structured request, obtains approval, and returns
the user to the website.

This is not required for the first identity-bound demonstration. Version 1
must avoid assumptions that would prevent it, including requiring every
request to originate from a pre-existing browser page or QR scan.

## 5. Local account model

Minimum records:

### User

- internal random user ID;
- creation and last-login timestamps;
- application profile fields, if any.

### Authentication provider

- user ID;
- provider type `dash`;
- Dash network;
- binding policy: `identity_bound` or `name_bound`;
- current Dash identity ID;
- preferred DPNS name;
- normalized DPNS name used during verification;
- last verified identity key ID;
- last Platform verification time.

The unique provider key depends on the stored binding policy:

- `identity_bound`: `(network, identity_id)`;
- `name_bound`: `(network, normalized_dpns_name)`.

Changing an existing provider's binding policy requires an explicit,
separately designed migration; it must never happen as a side effect of login.
Name-bound providers also retain controller history and the Platform state
reference for each ownership transition.

### Authentication request

- server-generated request ID (not solely responsible for request-fetch
  secrecy);
- ≥256-bit capability token material for the request URL (or equivalent);
- hash of the random nonce (≥256 bits);
- relying-party origin;
- action;
- binding policy;
- issuance and expiration timestamps;
- status (`pending`, `approved`, `consumed`, `rejected`, `cancelled`,
  `expired`);
- browser-binding cookie reference and one-time finish grant when approved;
- optional authenticated linking-session binding;
- response metadata needed for a security audit.

Raw nonces should not be retained longer than the request lifetime. Capability
URLs and request bodies are secret-handled per [`PROTOCOL.md`](PROTOCOL.md)
§2.1–2.2. Terminal statuses never return to `pending`.

## 6. Functional requirements

### Website

- Issue registration, login, and link challenges with ≥256-bit capability
  tokens and ≥256-bit nonces.
- Render QR codes without third-party QR services (QR image caching of the
  short-lived URL is acceptable; request JSON must be `no-store`).
- Offer an accessible copy-link control and manual status refresh.
- Update automatically using polling initially; allow SSE later.
- Verify response signatures and current Platform identity/name state (trust
  successful DAPI/SDK reads; login fails if Platform is unavailable).
- Reject unresolved or contested DPNS names.
- Enforce the request's stored account-binding policy and the request state
  machine.
- Detect and process name-bound ownership changes atomically.
- Revoke former-controller access completely after a name-bound transfer
  (publish integrator checklist).
- Revalidate name-bound control before sensitive actions and keep sessions
  short-lived enough to bound stale-controller access between Platform checks.
- Enforce one-time consumption atomically; POST-only finish with binding cookie
  (`Secure`, `HttpOnly`, `SameSite=Strict` preferred) and session rotation.
- Rate-limit create, fetch, respond, status, and finish; redact capability
  tokens from logs.
- Provide logout, controlled unlink, and deactivation-on-SIWD-unlink behavior.
- Prefer session history and revoke UI on the demo site.
- Explain when the phone app is required.
- Provide a simulator only in an unmistakable development mode.

### Signer host

- Obtain identities, DPNS names, and eligible identity keys through the host
  wallet's protected facilities.
- Scan QR codes and accept verified application links.
- Parse and validate requests before showing approval UI.
- Display domain, action, binding policy, disclosures, network, and expiry
  using canned templates and confusable-safe fonts.
- For cross-device requests, warn the user to approve only a login they
  personally started for the displayed domain moments ago.
- Select among eligible identities/names; exclude contested/unresolved names.
- Require platform-appropriate user authentication for each signature.
- Sign only the protocol's canonical digest.
- Remove secrets from clipboard and UI memory as promptly as practical.
- Provide no arbitrary-message or opaque-payload signing entry point.
- Do not require BLE proximity or confirmation codes.

The initial Android integration uses Android links, camera, and device
authentication. Those mechanisms are host-specific and must not appear in the
wire protocol.

### Portability

- Specify all signed data and protocol fields independently of programming
  language, UI toolkit, operating system, and transport-launch mechanism.
- Publish byte-exact positive and negative conformance vectors.
- Define equivalent cross-device QR and same-device link flows without
  requiring Android App Links specifically.
- Permit native secure storage and approval mechanisms on Android, iOS,
  Windows, macOS, and Linux.
- Keep server verification independent of which conforming wallet or
  authenticator produced the response.
- A separately packaged Android authenticator must operate on GrapheneOS
  without Google Play services.
- Standalone core functionality must not depend on Google account sign-in,
  Play Integrity, Firebase-only services, or Play-only delivery.
- Keep a standalone build compatible with direct signed APK distribution and
  F-Droid-compatible free/open-source build requirements.

These standalone distribution requirements do not apply to the experimental
official Dash Android wallet fork. That fork is an MVP **demo** of how SIWD
could integrate into real wallets so upstream maintainers can evaluate the
idea; it is not a preferred regular production authenticator without their own
security review and adoption.

### Verifier package

- Framework-neutral TypeScript interfaces for request creation and response
  verification.
- Constant-time comparisons where applicable.
- Pluggable challenge storage.
- Pluggable Platform lookup provider; authentication fails if state cannot be
  retrieved.
- Canonical encoding shared with Android.
- Stable error codes that do not leak account existence.
- Test vectors and negative tests (including contested/unresolved names and
  Platform unavailability).

## 7. Non-goals for the first release

- Dash payments or balance display.
- Creating identities or registering names.
- Identity top-ups, transfers, withdrawals, or key updates.
- Mainnet operation.
- Treating the wallet-fork demo as a production-recommended daily driver
  without upstream review.
- Implementing unattended agent signing in the human MVP authenticator.
- Authenticator-initiated trusted-site browsing and session-management UI in
  the first identity-bound demonstration.
- BLE or other proximity proofs as a login requirement.
- Browser/phone confirmation codes.
- Free-form site-authored approval statements.
- Requiring a single shared application codebase across Android, iOS, and
  desktop.
- Arbitrary text, transaction, document, or file signing.
- Custodial key backup or cloud synchronization.
- Claiming that a DPNS name proves a legal-world identity.
- Claiming that a Dash identity proves a unique human or excluding autonomous
  agents merely because they are not human.
- Claiming MVP cross-device login is phishing-resistant.
- Replacing website authorization, moderation, or account recovery policy.

## 8. Success criteria

The first milestone succeeds when:

- a testnet identity can be restored in the Android app;
- its DPNS name and appropriate active authentication key are discovered;
- a desktop browser displays a short-lived QR login with a ≥256-bit capability
  URL;
- the app scans, validates, displays canned approval copy, and signs after
  local approval without confirmation codes;
- the website verifies the signature and live identity/name relationship
  (login fails if Platform state cannot be retrieved);
- the browser finishes via binding cookie and session rotation without manual
  code entry;
- replay, expiry, wrong origin, wrong network, wrong name, contested name,
  altered request, wrong binding policy, disabled key, Platform outage, and
  duplicate linking tests all fail safely;
- identity-bound name changes do not transfer accounts;
- name-bound transfers move account control and rights to the new identity
  while revoking the former controller;
- no phrase, private key, or full capability token appears in logs, network
  traces intended for retention, or persisted plaintext storage.
