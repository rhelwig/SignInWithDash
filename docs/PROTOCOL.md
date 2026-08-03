# Sign in with Dash Authentication Protocol

**Working name:** SIWD  
**Protocol status:** Draft 1 (numeric golden vectors in `test-vectors/v1/`;
interoperable once other languages re-verify the same corpus)  
**Protocol version field:** `1`  
**Initial network:** testnet  

Companion documents:

- [`FLOWS.md`](FLOWS.md) — illustrated sequences  
- [`SECURITY.md`](SECURITY.md) — threat model  
- [`SPECS.md`](SPECS.md) — product requirements  
- [`TEST-VECTORS.md`](TEST-VECTORS.md) — golden-vector layout  

## 1. Protocol goal

SIWD lets a relying website ask a Dash identity owner to prove control of an
active authentication key and disclose a selected DPNS name. It is an off-chain
challenge/response protocol. Normal authentication does not publish a document
or state transition to Dash Platform.

A successful login means the relying party verified:

1. a domain-bound, single-use challenge was signed with an eligible key; and  
2. current Dash Platform state (via DAPI/SDK) shows that key and the selected
   DPNS name are valid for the claimed identity.

If either step cannot be completed, login has failed. There is no partial
success state that issues a session.

## 2. Terminology

| Term | Meaning |
| --- | --- |
| Relying party (RP) | Website that issues requests and verifies responses |
| Authenticator | Software that holds identity keys and produces SIWD signatures |
| Capability URL | Short-lived HTTPS URL containing a secret token used to fetch a request |
| Binding cookie | Browser cookie that authorizes finish for one request |
| Finish grant | Server-side one-time permission to exchange `approved` for a session |
| Provider key | Local unique key for the Dash auth provider row (`identity_bound` or `name_bound`) |
| Normalized DPNS name | DPNS name after Platform-compatible normalization (see §11) |

## 3. Trust assumptions

### 3.1 Dash Platform / DAPI

**Assumption (normative for SIWD v1):** When the relying party successfully
retrieves identity key state and DPNS resolution through its configured Dash
Platform SDK / DAPI client, SIWD treats that data as **valid authoritative
Platform state**, including name ownership. Implementations rely on the same
trust model as other correct Platform applications: the network, quorum, and
client software behave as Dash documents.

SIWD does **not** require the relying party to query every DAPI node or to
re-implement consensus. Default operation uses the pinned SDK’s normal endpoint
selection. Optional multi-endpoint sampling is a deployment hardening choice,
not a protocol requirement.

SDK-verified Platform proofs, when the pinned SDK exposes them for a query,
SHOULD be enabled. They strengthen confidence in the same assumption; they do
not replace it with a different trust root.

### 3.2 When Platform data cannot be obtained

If identity or DPNS state cannot be retrieved or verified (timeout, error,
empty unexpected result, client failure), the relying party **cannot complete
verification**. The authentication attempt fails: no session, no account
transfer, no elevation of privilege. The user may retry when Platform is
available again.

(This is ordinary “verification failed,” not a special mode.)

### 3.3 Other assumptions

- The authenticator device and OS protect keys as wallet-grade software.  
- TLS authenticates the relying party hostnames used in capability and response
  URLs.  
- The RP’s challenge store and cookie jar are not attacker-controlled.  
- Users may be phished into approving a real request for a site they did not
  open; MVP does not claim phishing resistance for that case (§16).

## 4. Transport model

The protocol separates signed content from transport.

- The QR encodes an HTTPS **capability URL**, not a recovery phrase, private
  key, or complete mutable JSON object.
- The same URL is used for **Copy link** and same-device app links.
- The authenticator **GETs** the structured request over TLS.
- The authenticator **POSTs** the signed response to `responseUri`.
- The browser polls status and finishes using the binding cookie; it never
  receives private key material.

### 4.1 Capability URL secrets

| Rule | Requirement |
| --- | --- |
| Token entropy | Capability token ≥ **256 bits** CSPRNG (32 raw bytes, unpadded base64url or 64 hex chars). |
| Distinct from `requestId` | Browser status must not rely on the capability token alone being secret from the creating browser; request fetch must not rely on `requestId` alone. |
| Lifetime | Valid only while request is `pending` and unexpired. Default TTL **120 s**; maximum **300 s**. |
| After terminal status | Fetch and respond MUST fail. |
| HTTPS | Required except development loopback HTTP. |

Example capability URL shape (illustrative path; RP may choose equivalent):

```text
https://example.test/dash-auth/v1/r/{capabilityToken}
```

### 4.2 Caching, logging, transport hygiene

| Control | Requirement |
| --- | --- |
| Request JSON | `Cache-Control: no-store` (and no shared-cache storage) for bodies containing `nonce` or secrets |
| QR image | Caching the QR that encodes the short-lived URL is allowed |
| Referrer | Capability routes SHOULD use `Referrer-Policy: no-referrer` or `strict-origin` so the token does not leak via `Referer` |
| Logs | MUST NOT retain full capability URLs; fingerprint or omit the secret segment |
| Clipboard | Prefer app links; clear capability URLs from clipboard when practical |
| Rate limits | Separate limits for create, fetch, respond, status, finish; cap pending requests; expire with a sweeper |

## 5. HTTP API (relying party)

Paths are normative for the demo and recommended for interoperable RPs. Hosts
MAY mount under a prefix if `origin` and `responseUri` remain consistent.

All JSON uses UTF-8 and `Content-Type: application/json; charset=utf-8`.

### 5.1 Create request

```http
POST /dash-auth/v1/requests
```

**Browser → RP.** Establishes binding cookie and pending request.

Request body:

```json
{
  "action": "login",
  "bindingPolicy": "identity_bound"
}
```

| Field | Type | Notes |
| --- | --- | --- |
| `action` | string enum | `register` \| `login` \| `link` |
| `bindingPolicy` | string enum | `identity_bound` \| `name_bound` |

For `link`, the browser MUST already have an authenticated session; the server
binds the request to that session user id.

Response `200`:

```json
{
  "requestId": "01JQ...",
  "capabilityUrl": "https://example.test/dash-auth/v1/r/...",
  "expiresAt": "2026-07-30T18:02:00.000Z",
  "status": "pending"
}
```

Set cookie (see §14):

```http
Set-Cookie: siwd_bind=...; Path=/dash-auth/v1; Secure; HttpOnly; SameSite=Strict; Max-Age=180
```

### 5.2 Fetch request (authenticator)

```http
GET /dash-auth/v1/r/{capabilityToken}
```

Response `200` — authentication request object (§6). Headers MUST include
`Cache-Control: no-store`.

Errors: `404` (unknown/terminal/expired), `429` rate limit. Do not distinguish
“never existed” vs “expired” more than necessary.

### 5.3 Respond (authenticator)

```http
POST /dash-auth/v1/respond
```

Body: authentication response object (§7).  
`responseUri` in the request MUST be this absolute URL (same origin as
`origin`).

Success `200`:

```json
{
  "status": "approved",
  "requestId": "01JQ..."
}
```

Same-device optional field: `returnUrl` (same origin only) for navigation back
to the RP; navigation is not proof of auth.

### 5.4 Status (browser)

```http
GET /dash-auth/v1/status?requestId={requestId}
```

Requires binding cookie. Response:

```json
{
  "status": "pending",
  "expiresAt": "2026-07-30T18:02:00.000Z"
}
```

When `approved`, MAY include `"finishReady": true`. Unbound clients get uniform
`401`/`404` without leaking existence if practical.

### 5.5 Finish (browser)

```http
POST /dash-auth/v1/finish
```

```json
{
  "requestId": "01JQ..."
}
```

Requires binding cookie and unspent finish grant. **GET MUST NOT finish.**

Success: set session cookie; body may redirect URL or user profile summary.
Request becomes `consumed`.

### 5.6 Cancel (browser, optional)

```http
POST /dash-auth/v1/cancel
```

```json
{ "requestId": "01JQ..." }
```

Requires binding cookie. Transitions `pending` → `cancelled` (or no-ops if
already terminal).

### 5.7 Authenticator rejection (optional)

```http
POST /dash-auth/v1/reject
```

```json
{ "requestId": "01JQ...", "capabilityToken": "..." }
```

Transitions `pending` → `rejected`. Capability or equivalent proof of fetch
required so random parties cannot reject arbitrary ids.

## 6. Authentication request object

Returned by fetch; fields stored server-side at create time.

```json
{
  "type": "dash-auth-request",
  "version": 1,
  "network": "testnet",
  "requestId": "01JQ...",
  "nonce": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "origin": "https://example.test",
  "domain": "example.test",
  "action": "login",
  "bindingPolicy": "identity_bound",
  "issuedAt": "2026-07-30T18:00:00.000Z",
  "expiresAt": "2026-07-30T18:02:00.000Z",
  "responseUri": "https://example.test/dash-auth/v1/respond",
  "requestedClaims": ["dash_identity_id", "dpns_name"]
}
```

### 6.1 Field requirements

| Field | Type | Rules |
| --- | --- | --- |
| `type` | string | Constant `dash-auth-request` |
| `version` | integer | `1` for this draft; unknown versions → reject |
| `network` | string | `testnet` \| `mainnet` (mainnet disabled in MVP builds) |
| `requestId` | string | Server-generated ULID or equivalent; unique per RP; not the capability secret |
| `nonce` | string | Unpadded base64url of **exactly 32** random bytes |
| `origin` | string | Normalized HTTPS origin (§10) |
| `domain` | string | Host derived from `origin` (no port if default); never trusted independently of `origin` |
| `action` | string | `register` \| `login` \| `link` |
| `bindingPolicy` | string | `identity_bound` \| `name_bound` |
| `issuedAt` | string | UTC RFC 3339 with millisecond precision preferred |
| `expiresAt` | string | `issuedAt` + TTL; TTL ∈ [30, 300] seconds; default **120** |
| `responseUri` | string | Absolute HTTPS URL; same origin as `origin`; path as in §5.3 |
| `requestedClaims` | string[] | v1 fixed: `["dash_identity_id","dpns_name"]` only |

There is **no** free-form `statement` field. Approval UI uses canned templates
from these fields only (§15).

Server storage:

- Store **SHA-256** of the raw nonce (or raw nonce only until expiry, then
  delete). Prefer hash-at-rest after issue if the plaintext nonce is only needed
  in the fetch response once.
- Store capability token hash; compare in constant time.
- Store binding cookie id / finish grant material hashed at rest when practical.

## 7. Authentication response object

```json
{
  "type": "dash-auth-response",
  "version": 1,
  "requestId": "01JQ...",
  "network": "testnet",
  "bindingPolicy": "identity_bound",
  "identityId": "4EfA9Jrvv3njEBYJ89bF9WAqHeFMhQ9p7c8cX8YxK8aZ",
  "dpnsName": "alice.dash",
  "keyId": 2,
  "algorithm": "dash-platform-ecdsa-recoverable-sha256d",
  "signature": "H...."
}
```

| Field | Type | Rules |
| --- | --- | --- |
| `type` | string | `dash-auth-response` |
| `version` | integer | Must match request version `1` |
| `requestId` | string | Exact match to pending request |
| `network` | string | Exact match |
| `bindingPolicy` | string | Exact match to stored request |
| `identityId` | string | Dash Platform identity id in **Base58** form used by current Platform SDKs; decodes to 32 bytes |
| `dpnsName` | string | Normalized eligible name ending in `.dash` (§11) |
| `keyId` | integer | Unsigned 32-bit identity key id |
| `algorithm` | string | Exactly `dash-platform-ecdsa-recoverable-sha256d` |
| `signature` | string | Unpadded base64url of **65** raw signature bytes (§9) |

## 8. Canonical signed bytes

JSON is **not** signed. Both sides construct an identical byte string, then
double-SHA-256, then ECDSA.

### 8.1 Domain separation and layout

All multi-byte integers are **big-endian**.  
String fields are UTF-8 without BOM.  
Length prefixes are `uint16` byte lengths (max 65535).

```text
canonical_siwd_bytes =
    magic ||
    version ||
    network ||
    origin_len || origin ||
    action ||
    binding_policy ||
    request_id_len || request_id ||
    nonce_32 ||
    issued_at_unix ||
    expires_at_unix ||
    identity_id_32 ||
    dpns_name_len || dpns_name ||
    key_id
```

| Component | Size / encoding |
| --- | --- |
| `magic` | 4 bytes: `0x53 0x49 0x57 0x44` (`SIWD`) |
| `version` | `uint32` = `1` |
| `network` | `uint8`: `0` = `testnet`, `1` = `mainnet` |
| `origin_len` + `origin` | `uint16` + UTF-8 of normalized origin (§10) |
| `action` | `uint8`: `1`=`register`, `2`=`login`, `3`=`link` |
| `binding_policy` | `uint8`: `1`=`identity_bound`, `2`=`name_bound` |
| `request_id_len` + `request_id` | `uint16` + UTF-8 of `requestId` as issued |
| `nonce_32` | 32 raw nonce bytes (not base64) |
| `issued_at_unix` | `int64` Unix time in **seconds** (floor of `issuedAt`) |
| `expires_at_unix` | `int64` Unix time in **seconds** (floor of `expiresAt`) |
| `identity_id_32` | 32 raw identity id bytes (Base58-decoded) |
| `dpns_name_len` + `dpns_name` | `uint16` + UTF-8 of **normalized** DPNS name |
| `key_id` | `uint32` identity key id |

Unknown enum values are invalid. Implementations MUST reject overflows and
truncated fields.

### 8.2 Digest

```text
digest = SHA-256( SHA-256( canonical_siwd_bytes ) )
```

### 8.3 Display form (not signed as text)

Authenticators MUST show a human-readable summary equivalent to:

```text
Sign in with Dash
Network: testnet
Domain: example.test
Action: Sign in
Binding: Identity-bound account
Name: alice.dash
Expires: <local or remaining time>
```

The binary layout above is authoritative for signatures. Display strings are
canned and localizable; they MUST NOT add site-authored prose.

## 9. Signature algorithm

```text
algorithm id = dash-platform-ecdsa-recoverable-sha256d
curve        = secp256k1
digest       = SHA256d(canonical_siwd_bytes)
signature    = 65-byte compact recoverable ECDSA
transport    = unpadded base64url(signature)
```

### 9.1 Wire format (65 bytes)

| Offset | Content |
| --- | --- |
| 0 | Header: `27 + recovery_id + 4` for compressed public keys → values **31–34** |
| 1–32 | `r` (32 bytes) |
| 33–64 | `s` (32 bytes) |

This matches the Dash Platform / rust-dashcore recoverable compact convention
documented in the implementation inspection.

### 9.2 Verification

1. Decode base64url → 65 bytes.  
2. Parse header → `recovery_id` ∈ {0,1,2,3}.  
3. Require **low-S**: `s <= n/2` (secp256k1 order half). High-S signatures are
   rejected (malleability reduction).  
4. Compute `digest` as in §8.2.  
5. Verify ECDSA against the **Platform public key** for `(identityId, keyId)`
   obtained in §12—not against a recovered key alone without that match.
   Recoverability may be used as an implementation aid but the key must equal
   the Platform key material for that id.

### 9.3 Explicit non-algorithm

Do **not** use the JavaScript/WASM `wallet.signMessage` helper (single SHA-256,
64-byte non-recoverable). That format is incompatible.

## 10. Origin and domain normalization

Apply in order; failure → reject request creation and reject any response
referencing a non-normalized stored origin.

1. Parse as absolute URL. Reject if parse fails.  
2. Scheme MUST be `https`, except development mode MAY allow
   `http://127.0.0.1` or `http://localhost` (and optional port).  
3. Reject userinfo, path other than empty, query, fragment, and credentials.  
4. Host:  
   - Convert Unicode hosts to **A-labels** (IDNA / punycode).  
   - Lowercase ASCII A-labels / LDH labels.  
   - Reject empty host and reject hosts ending with a trailing dot (no
     strip-and-accept: trailing-dot hosts are invalid for SIWD v1).  
5. Port: omit if default for scheme (`443` for https, `80` for dev http);
   otherwise include as `host:port`.  
6. `origin` string is `scheme://host[:port]` with no trailing slash.  
7. `domain` for display is the host **without** port (A-label form).  
8. Authenticator display MUST use a font that distinguishes confusable glyphs
   (`0`/`O`/`o`, `1`/`l`/`I`, etc.) and MUST show the same host that appears in
   the signed origin (plus human-readable action labels).

## 11. DPNS names

### 11.1 Normalization

SIWD v1 uses **the same normalization rules as the current Dash Platform DPNS
implementation** for the pinned SDK version. Conforming implementations SHOULD
call the SDK normalizer rather than re-coding rules by hand.

Until golden vectors freeze a pin:

- Names are UTF-8.  
- Comparison and unique keys use the normalized form.  
- The signed `dpnsName` is the normalized form including the `.dash` parent
  label as returned by resolution (e.g. `alice.dash`).

Cross-language golden vectors (§18) include normalized and rejected inputs.

### 11.2 Eligibility

A name is eligible for SIWD only if Platform resolution (assumed valid when
returned—§3.1) shows it is:

- currently owned / resolved to exactly one identity; and  
- **not** unresolved, missing, contested, pending contest, or otherwise
  non-final under Platform rules for that name.

Ineligible names MUST be rejected at verification. Authenticators SHOULD avoid
offering them for selection when discovery already knows status.

## 12. Identity key eligibility

Eligible signing key (MVP / Draft 1):

1. Active key with purpose **AUTHENTICATION**, security level **HIGH**, type
   **ECDSA_SECP256K1**, not disabled, not contract/bounds-restricted in a way
   that forbids this off-chain use (if bounds exist, only keys that permit
   general authentication).  
2. Canonical new-identity layout typically uses **key id 2** for HIGH auth;
   verifiers MUST select by metadata, not hard-coded id alone.  
3. **No CRITICAL fallback** in this draft. DIP 11 requires HIGH at identity
   creation and replacement-on-disable; canonical layouts always include HIGH
   alongside CRITICAL. Identities without an eligible HIGH key cannot complete
   SIWD until a qualifying key is present. A future protocol version or RP
   extension may add CRITICAL only if a live survey proves a real gap and
   golden vectors cover it.

**Never** eligible: Master authentication; transfer; withdrawal; encryption;
decryption; voting; disabled keys; unknown ids; wrong purpose or type.

Disabled keys, unknown key ids, wrong purpose, or wrong type → reject.

## 13. Server verification algorithm

Perform all checks before mutating account or session state. On any failure,
leave the request in a safe state (`pending` if still valid, or unchanged
terminal) and return an error—**no session**.

1. Load request by `requestId`; require status `pending` and not past
   `expiresAt` (server clock).  
2. Match `version`, `network`, `bindingPolicy` to stored request.  
3. Reject if `issuedAt` is more than **60 seconds** in the future (server
   clock).  
4. Decode `nonce` from stored request material; rebuild `canonical_siwd_bytes`
   from **stored** request fields plus response `identityId`, `dpnsName`,
   `keyId` (normalized name).  
5. Retrieve identity and keys from Platform/DAPI (§3). If retrieval fails →
   authentication fails.  
6. Require `keyId` eligible (§12) on that identity.  
7. Verify signature (§9).  
8. Resolve normalized `dpnsName`; require eligible (§11) and resolved identity
   equals `identityId`. If resolution fails → authentication fails.  
9. Apply account policy:  
   - `identity_bound`: provider key `(network, identityId)`;  
   - `name_bound`: provider key `(network, normalizedName)`; if controller
     identity changed, run atomic ownership transfer + revocation (product
     rules in `SPECS.md` / `SECURITY.md`).  
10. Atomically: `pending` → `approved`; bind local user id; create finish grant;
    for transfers, complete rebind + revocation in the same DB transaction.  
11. Browser later finishes (§14); then `approved` → `consumed`.

## 14. Request state machine, cookies, finish

### 14.1 Statuses

| Status | Meaning |
| --- | --- |
| `pending` | Awaiting authenticator |
| `approved` | Signature accepted; await browser finish |
| `consumed` | Session issued / finish done (terminal) |
| `rejected` | User/app rejected (terminal) |
| `cancelled` | Browser/RP cancelled (terminal) |
| `expired` | TTL or finish window elapsed (terminal) |

Transitions:

```text
pending  → approved | rejected | cancelled | expired
approved → consumed | expired | cancelled
```

No terminal status returns to `pending`/`approved`.

Concurrency:

- Exactly one successful respond wins.  
- Exactly one successful finish wins.  
- Respond idempotent only for identical body while still `approved`.

### 14.2 Binding cookie

| Property | Value |
| --- | --- |
| Name | `siwd_bind` (demo); production RPs MAY namespace |
| Entropy | ≥ 256 bits |
| Flags | `Secure; HttpOnly; SameSite=Strict` |
| Path | Prefer `/dash-auth/v1` |
| Max-Age | `TTL + finish_grace` seconds |

`finish_grace` default: **60 seconds** after `expiresAt` for completing finish
only (respond still requires unexpired `expiresAt` at respond time).

### 14.3 Finish

On `approved`, store a one-time finish grant bound to binding cookie +
`requestId` (≥ 128 bits random, hashed at rest).

Finish (`POST /finish`):

1. Status `approved`, grant unspent, within finish window.  
2. Binding cookie matches.  
3. POST only.  
4. Rotate session id; set session cookie `Secure; HttpOnly; SameSite=Lax` or
   `Strict` per site navigation needs (document choice).  
5. Mark request `consumed`; invalidate grant and binding cookie.

## 15. Approval UX (authenticator)

Show only canned, localizable strings for:

| Structured input | Example English label |
| --- | --- |
| `action=register` | Create account |
| `action=login` | Sign in |
| `action=link` | Link account |
| `domain` | Domain line |
| `network` | Testnet / Mainnet (unmistakable) |
| `bindingPolicy` | Identity-bound / Name-bound ownership |
| `dpnsName` | Selected Dash name |
| claims | “This site will receive your Dash identity id and name.” |
| expiry | Remaining time |
| cross-device | “Only approve if you personally started this on \<domain\> moments ago.” |

Cancel must be available. No untrusted logos or site CSS on the trusted
approval surface. No confirmation codes. No required BLE.

## 16. Residual QR-forwarding risk

Browser binding stops bare URL/response theft from becoming a session. It does
not stop: attacker starts real login → victim approves real domain → attacker’s
browser finishes.

MVP mitigations: domain display + canned warning + short TTL + session
history/revoke. Do not claim phishing resistance. No confirmation codes; no
required proximity.

## 17. Privacy

- v1 discloses stable identity id + DPNS name to the RP.  
- UI MUST disclose correlation risk if the same identity is reused across sites.  
- Auth events are not written to Platform.  
- Capability tokens and nonces are not analytics events.

## 18. Test vectors and conformance

See [`TEST-VECTORS.md`](TEST-VECTORS.md). Draft 1 is implementable when:

- Rust (or rust-dashcore-compatible), Kotlin/JNI, and TypeScript produce
  identical digests and verify the same signatures for published vectors; and  
- Negative vectors cover wrong origin, network, action, policy, name, key,
  expiry, high-S, truncated fields, contested name, and Platform-unavailable
  simulation.

## 19. Error codes (stable)

Returned in JSON as `"error": { "code": "...", "message": "..." }` with
non-enumerating messages where practical.

| Code | Typical HTTP | Meaning |
| --- | --- | --- |
| `invalid_request` | 400 | Malformed body/fields |
| `unsupported_version` | 400 | Unknown protocol version |
| `expired` | 400/409 | Request or finish window elapsed |
| `not_pending` | 409 | Wrong status for respond |
| `not_approved` | 409 | Wrong status for finish |
| `binding_mismatch` | 401 | Missing/wrong binding cookie |
| `signature_invalid` | 401 | Crypto failure |
| `key_ineligible` | 401 | Key disabled/wrong purpose |
| `name_ineligible` | 401 | Name unresolved/contested/mismatch |
| `platform_unavailable` | 503 | Cannot retrieve Platform state |
| `policy_mismatch` | 400 | bindingPolicy mismatch |
| `conflict` | 409 | Account/link collision |
| `rate_limited` | 429 | Rate limit |
| `cancelled` | 409 | Request cancelled |
| `internal_error` | 500 | Unexpected server error |

## 20. Extensions (non-MVP wire)

Reserved without breaking v1:

- Authenticator-initiated login discovery and login-start URLs  
- Additional `requestedClaims` under a new protocol version  
- Optional proximity profiles  
- Per-site derived keys / pairwise identifiers  

Extensions MUST use new `version` or negotiated capability flags; unknown
required fields in v1 fail verification.

## 21. Remaining implementation pins (not protocol ambiguity)

These do not block writing code against this draft but must be pinned at
build time:

| Item | Action |
| --- | --- |
| Exact Platform SDK versions | Pin Evo SDK + Kotlin SDK revisions |
| Identity id Base58 alphabet | Match pinned SDK decode |
| DPNS normalizer | Call pinned SDK; freeze vectors |
| Historical identities without HIGH keys | Sample on testnet at M2; expect none under DIP 11 — HIGH-only policy unless survey proves otherwise (see D-010) |
| Name-transfer finality fields | Use whatever the pinned SDK returns as “current resolved owner” |

## 22. Changelog

| Date | Change |
| --- | --- |
| 2026-07-27 | Draft 0 conceptual protocol |
| 2026-07-30 | Security decisions: capability tokens, state machine, canned approval |
| 2026-07-30 | Draft 1: full encoding, HTTP API, DAPI trust assumption, key/name rules, errors |
| 2026-08-02 | Key eligibility: HIGH-only (no CRITICAL fallback); Yappr research closed |
| 2026-08-02 | Numeric golden vectors generated (`test-vectors/v1/`); session-only default (D-025) |
