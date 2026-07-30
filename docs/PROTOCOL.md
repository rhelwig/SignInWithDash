# Sign in with Dash Authentication Protocol

**Working name:** SIWD  
**Protocol status:** Draft 0; not interoperable or production-ready  
**Initial network:** testnet

For an illustrated browser/server/authenticator walkthrough, read
[`FLOWS.md`](FLOWS.md) alongside this protocol.

## 1. Protocol goal

SIWD lets a relying website ask a Dash identity owner to prove control of an
active authentication key and disclose a selected DPNS name. It is an off-chain
challenge/response protocol. Normal authentication does not publish a document
or state transition to Dash Platform.

## 2. Transport model

The protocol separates the signed content from transport.

- The QR contains an HTTPS request URL, not secrets or a complete mutable JSON
  object.
- The same URL is exposed by **Copy link** and Android App Links.
- The authenticator retrieves the request over TLS.
- The authenticator submits the signed response to the HTTPS response endpoint.
- The browser polls the relying website by request ID and never receives the
  phone's private material.

This keeps QR codes small, permits server-side cancellation, and avoids making
the QR itself an authorization bearer token. The request URL still contains a
high-entropy capability and must be treated as sensitive and short-lived.

## 3. Authentication request

Conceptual fields:

```json
{
  "type": "dash-auth-request",
  "version": 1,
  "network": "testnet",
  "requestId": "01K...",
  "nonce": "<32 random bytes, base64url>",
  "origin": "https://example.test",
  "domain": "example.test",
  "action": "login",
  "bindingPolicy": "identity_bound",
  "statement": "Sign in to Example",
  "issuedAt": "2026-07-27T18:00:00Z",
  "expiresAt": "2026-07-27T18:02:00Z",
  "responseUri": "https://example.test/dash-auth/v1/respond",
  "requestedClaims": ["dash_identity_id", "dpns_name"]
}
```

Normative direction:

- `nonce` is at least 256 bits from a cryptographic RNG.
- `origin` is a normalized HTTPS origin with no path, query, fragment, userinfo,
  or wildcard. Loopback HTTP may be allowed only in development mode.
- `domain` is derived from `origin`, never independently trusted.
- `action` is an enumerated value: `register`, `login`, or `link`.
- `bindingPolicy` is an enumerated value: `identity_bound` or `name_bound`.
  The relying party selects it, stores it with the request, and may not reinterpret
  the response under another policy.
- Lifetime defaults to two minutes and must not exceed five minutes.
- `responseUri` must have the same origin as `origin` in version 1.
- Unknown required fields or unsupported versions fail closed.
- Free-form statements are display-only and cannot weaken structured checks.

The response endpoint must not be sufficient to approve the browser session
without a valid signed response.

The short lifetime prevents stockpiling and delayed reuse and narrows the
coordination window for an attacker. It does not stop a prepared live relay
that obtains approval before expiration.

## 4. Canonical signed message

JSON text is not signed directly. Implementations will use a specified,
length-prefixed binary encoding with a domain-separation prefix:

```text
Sign in with Dash
Protocol: 1
Network: testnet
Origin: https://example.test
Action: login
Binding Policy: identity_bound
Request ID: 01K...
Nonce: ...
Issued At: ...
Expires At: ...
Identity ID: ...
DPNS Name: alice.dash
Key ID: 1
```

The readable form above is the required approval presentation, not yet the
final byte encoding. Draft 1 must define:

- UTF-8 normalization;
- integer encoding;
- field order;
- length prefixes;
- exact domain-separation bytes;
- the exact relationship between the display form and signed binary fields;
- low-S and recovery-ID rules, if applicable;
- cross-language positive and negative test vectors.

No implementation may ship based only on the illustrative text above.

### 4.1 Provisional signature algorithm

Source inspection selected the current Dash Platform/Rust convention as the
Draft 1 candidate:

```text
algorithm = dash-platform-ecdsa-recoverable-sha256d
digest = SHA256(SHA256(canonical_siwd_bytes))
signature = 65-byte recoverable compact secp256k1 ECDSA
transport = unpadded base64url(signature)
```

For compressed keys, byte 0 is `27 + recovery_id + 4`; bytes 1–64 are compact
`r || s`. The server verifies this against the public key stored on the
identity.

This is provisional until Rust, Kotlin/JNI, and TypeScript pass identical
golden vectors. The JavaScript Evo SDK's current `wallet.signMessage` helper is
not compatible: it uses a single SHA-256 and a 64-byte non-recoverable
signature.

## 5. Authentication response

Conceptual fields:

```json
{
  "type": "dash-auth-response",
  "version": 1,
  "requestId": "01K...",
  "network": "testnet",
  "bindingPolicy": "identity_bound",
  "identityId": "<Dash Platform identity ID>",
  "dpnsName": "alice.dash",
  "keyId": 1,
  "algorithm": "dash-platform-ecdsa-recoverable-sha256d",
  "signature": "<unpadded base64url of 65 raw bytes>"
}
```

The binding policy, identity ID, name, and key ID are included in the signed
preimage. Changing any of them invalidates the response.

## 6. Server verification

The verifier performs all checks before changing request or session state:

1. Load the request and require status `pending`.
2. Compare protocol version, network, request ID, origin, action, binding
   policy, and time bounds.
3. Reconstruct the canonical signed bytes from the stored request and response.
4. Retrieve the identity and current keys from Dash Platform, preferably with
   SDK-verified Platform proofs.
5. Require that `keyId` belongs to the claimed identity, is an authentication
   key at an allowed security level, and is not disabled at the verification
   time.
6. Verify the cryptographic signature.
7. Resolve the normalized DPNS name and require that it maps to the same
   identity.
8. Apply registration, login, linking, and account-binding policy:
   - `identity_bound`: select the provider by `(network, identity ID)`;
   - `name_bound`: select the provider by `(network, normalized DPNS name)` and
     treat a changed resolved identity as an atomic ownership transfer.
9. Atomically change the request from `pending` to `approved`, bind the
   resulting local user ID, and perform any name-bound controller rebind,
   rights transfer, access revocation, and audit insertion in the same local
   transaction.
10. Let the waiting browser exchange its original browser-bound state for a
    session, then mark the request consumed.

If any check fails, no session is created. Retrying must not turn an expired or
terminal request back into a pending request.

Name-bound sites must also define how they detect transfers between logins.
At minimum they revalidate current name control before sensitive actions and
use short-lived sessions to bound access by a former controller. Event-driven
or periodic monitoring may reduce that window when Platform interfaces support
it.

## 7. Browser binding

The browser that created the request receives a separate random binding cookie.
The phone response alone approves the request but does not receive the browser
session cookie. Only the browser holding the binding cookie may finish that
login.

This prevents the phone response or request URL alone from becoming a bearer
credential for a web session. It does not stop an attacker from creating a
login in the attacker's own browser and persuading a victim to approve that
QR: the attacker still holds the binding cookie. QR forwarding therefore needs
an additional defense, such as clear transaction intent plus a browser/phone
confirmation value or another ceremony that binds approval to the user's
browser. The authenticator must always show and sign the true domain.

For a cross-device request, the approval presentation must also tell the user
to continue only if they personally initiated a login for the displayed domain
moments ago.

## 8. Authenticator-initiated extension

Version 1 reserves authenticator-initiated login as a compatible extension.
Conceptually, the authenticator selects a previously verified or explicitly
entered relying party, opens its HTTPS login-start endpoint, receives an SIWD
request, and completes the normal signed response flow.

Draft 1 need not standardize this endpoint or trusted-site registry. It must
not require QR scanning or assume that only a browser can initiate every
request. Discovery, return routing, session handoff, and phishing properties
require a separate specification before implementation.

## 9. Privacy

- The requested claims are explicit and minimal.
- Version 1 discloses a stable Dash identity ID and DPNS name to the relying
  party. That enables correlation if a user chooses the same identity at
  multiple sites.
- The UI must state this limitation. Site-specific derived or
  contract-bounded keys may reduce risk in a future protocol version, but are
  not assumed available for the first milestone.
- Authentication events are not written to Dash Platform.

## 10. Open protocol questions

- Can every supported historical/restored identity supply an active,
  unbounded `AUTHENTICATION/HIGH` ECDSA key, or must SIWD define a controlled
  fallback policy?
- Can current SDK proof APIs prove both identity key state and DPNS resolution
  efficiently in the server runtime?
- Should a later version use per-site derived authentication keys?
- Is direct same-LAN response useful, or is HTTPS relay/polling sufficient?
- What Platform finality/proof reference and optional safety delay should a
  name-bound ownership transition require?
- What authenticated discovery and return mechanism should
  authenticator-initiated login use?
- Can cross-device physical proximity be added without requiring proprietary
  mobile services?

These questions block declaring Draft 1 stable, not building the UI simulator.
