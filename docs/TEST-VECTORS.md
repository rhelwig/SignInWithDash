# SIWD Test Vectors and Conformance Layout

**Status:** Draft 1 layout + **numeric golden vectors generated** (2026-08-02)
by `@siwd/protocol` (TypeScript). Regenerate with
`npm run generate-vectors` in `packages/protocol`; verify with
`npm run verify-vectors`.

## 1. Goals

- Bit-exact agreement on `canonical_siwd_bytes` and digests across languages.  
- Signature verify interoperability using
  `dash-platform-ecdsa-recoverable-sha256d`.  
- Negative cases for security-relevant mutations.  
- No real recovery phrases, mainnet keys, or production secrets.

## 2. Repository layout (when implemented)

```text
test-vectors/
  README.md                 # points here
  v1/
    manifest.json           # list of cases and schema version
    positive/
      001-login-identity-bound.json
      ...
    negative/
      001-wrong-origin.json
      ...
    keys/
      test-secp256k1-1.json  # public only + encrypted or deterministic test seed ref
```

## 3. Case file schema

```json
{
  "id": "v1/positive/001-login-identity-bound",
  "protocolVersion": 1,
  "expect": "accept",
  "comment": "Minimal login, identity_bound",
  "request": {
    "type": "dash-auth-request",
    "version": 1,
    "network": "testnet",
    "requestId": "01TESTREQUEST00000000000000",
    "nonce_b64url": "...",
    "origin": "https://example.test",
    "domain": "example.test",
    "action": "login",
    "bindingPolicy": "identity_bound",
    "issuedAt": "2026-07-30T18:00:00.000Z",
    "expiresAt": "2026-07-30T18:02:00.000Z",
    "responseUri": "https://example.test/dash-auth/v1/respond",
    "requestedClaims": ["dash_identity_id", "dpns_name"]
  },
  "response": {
    "identityId": "...",
    "dpnsName": "alice.dash",
    "keyId": 2,
    "algorithm": "dash-platform-ecdsa-recoverable-sha256d",
    "signature_b64url": "..."
  },
  "canonical_hex": "...",
  "digest_sha256d_hex": "...",
  "platform": {
    "identityId": "...",
    "publicKey_hex_compressed": "...",
    "keyId": 2,
    "keyPurpose": "AUTHENTICATION",
    "securityLevel": "HIGH",
    "disabled": false,
    "dpnsResolvedIdentityId": "...",
    "dpnsStatus": "finalized"
  }
}
```

For offline crypto-only tests, `platform` is a fixture. Integration tests replace
it with live testnet reads.

Negative cases set `"expect": "reject"` and `"rejectReason"` to one of the
stable error families in `PROTOCOL.md` §19 (e.g. `signature_invalid`,
`name_ineligible`).

## 4. Required positive cases

| ID | Coverage |
| --- | --- |
| login identity_bound | Minimal happy path |
| register identity_bound | Action enum |
| link identity_bound | Link action |
| login name_bound | Policy byte |
| nondefault https port | Origin with `:8443` |
| max-length name within limits | DPNS length boundary if known |
| key id not equal to 2 | Metadata-based key selection |

## 5. Required negative cases

| ID | Coverage |
| --- | --- |
| wrong origin | Domain binding |
| wrong network | testnet/mainnet confusion |
| wrong action | Action binding |
| wrong bindingPolicy | Policy substitution |
| wrong requestId | Binding to challenge |
| wrong nonce | Challenge binding |
| expired | Time bounds |
| issuedAt far future | Clock skew (>60s) |
| high-S signature | Malleability policy |
| truncated signature | Parse fail |
| wrong key id | Platform key match |
| disabled key | Key eligibility |
| name → other identity | Name/identity match |
| contested name | `dpnsStatus` fixture |
| unresolved name | Missing resolution |
| master/transfer key | Never eligible |
| critical auth key | Never eligible in Draft 1 (HIGH-only; D-010) |
| platform unavailable | Simulated; expect `platform_unavailable` / auth failure |
| trailing-dot host | Origin normalization |
| http non-loopback | Origin scheme |

## 6. Generation rules

1. Use only deterministic test secp256k1 keys generated for SIWD.  
2. Publish public keys and signatures; keep private keys in a clearly marked
   test-only module, never in screenshots or production configs.  
3. One “primary” language generates vectors; others verify. Prefer Rust
   (rust-dashcore-compatible) as the first generator.  
4. CI: TypeScript and Kotlin must pass the full `v1` corpus.

## 7. Status

| Item | Status |
| --- | --- |
| Schema and required cases | Specified (this doc) |
| Numeric golden vectors | **Present** under `test-vectors/v1/` (7 positive, 21 negative) |
| Generator / verifier | `packages/protocol` (`@siwd/protocol`) |
| Live testnet integration vectors | Pending M2 |
| Cross-language re-verify (Kotlin/Rust) | Pending host implementations |
