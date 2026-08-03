# `@siwd/protocol`

TypeScript implementation of the Sign in with Dash **Draft 1** canonical
encoding, SHA256d digest, and recoverable secp256k1 signatures.

## Commands

```bash
cd packages/protocol
npm install
npm run generate-vectors   # write test-vectors/v1/*
npm run verify-vectors     # re-check golden corpus
npm run build              # emit dist/
```

## Scope

- Canonical bytes (`SIWD` magic, fixed field order)
- Digest: `SHA-256(SHA-256(canonical))`
- Signature: 65-byte Dash recoverable compact (header 31–34, low-S)
- Origin normalization helpers
- Key eligibility: AUTHENTICATION / HIGH only

Not included: HTTP server, Platform DAPI client, or Android host.

## Golden vectors

Authoritative numeric fixtures live in `../../test-vectors/v1/`. Other
languages should verify that corpus without regenerating it.
