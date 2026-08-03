/**
 * Generate SIWD v1 golden vectors under test-vectors/v1/.
 * Uses only deterministic test keys — never real recovery phrases.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  base64urlEncode,
  buildCanonicalBytes,
  bytesToHex,
  digestCanonical,
  encodeIdentityId,
  hexToBytes,
  sha256d,
} from "./encoding.js";
import { isKeyEligibleForSiwd } from "./eligibility.js";
import {
  forceHighS,
  publicKeyFromPrivate,
  signCanonical,
  signCanonicalBase64Url,
  verifyCanonical,
} from "./signature.js";
import type { Action, BindingPolicy, CanonicalInput, Network } from "./types.js";
import { ALGORITHM_ID, PROTOCOL_VERSION } from "./types.js";

const ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "test-vectors",
  "v1",
);

/** Deterministic test private key (NOT a wallet seed). All zeros is invalid; use 1. */
const TEST_PRIV = hexToBytes(
  "0000000000000000000000000000000000000000000000000000000000000001",
);
const TEST_PUB = publicKeyFromPrivate(TEST_PRIV);

/** Fixed 32-byte identity id for offline vectors. */
const IDENTITY_RAW = hexToBytes(
  "11".repeat(32).slice(0, 64), // 0x11 * 32
);
const IDENTITY_ID = encodeIdentityId(IDENTITY_RAW);

/** Second identity for name-mismatch negatives. */
const OTHER_IDENTITY_RAW = hexToBytes("22".repeat(32).slice(0, 64));
const OTHER_IDENTITY_ID = encodeIdentityId(OTHER_IDENTITY_RAW);

const NONCE = hexToBytes(
  "a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff00",
);

interface CaseBase {
  id: string;
  protocolVersion: number;
  expect: "accept" | "reject";
  comment: string;
  rejectReason?: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  canonical_hex: string;
  digest_sha256d_hex: string;
  platform: Record<string, unknown>;
  cryptoOnly?: boolean;
}

function baseRequest(overrides: Partial<{
  network: Network;
  requestId: string;
  origin: string;
  domain: string;
  action: Action;
  bindingPolicy: BindingPolicy;
  issuedAt: string;
  expiresAt: string;
  responseUri: string;
  nonce: Uint8Array;
}> = {}) {
  const network = overrides.network ?? "testnet";
  const origin = overrides.origin ?? "https://example.test";
  const domain = overrides.domain ?? "example.test";
  const action = overrides.action ?? "login";
  const bindingPolicy = overrides.bindingPolicy ?? "identity_bound";
  const requestId = overrides.requestId ?? "01TESTREQUEST00000000000000";
  const issuedAt = overrides.issuedAt ?? "2026-07-30T18:00:00.000Z";
  const expiresAt = overrides.expiresAt ?? "2026-07-30T18:02:00.000Z";
  const responseUri =
    overrides.responseUri ?? "https://example.test/dash-auth/v1/respond";
  const nonce = overrides.nonce ?? NONCE;

  return {
    type: "dash-auth-request",
    version: PROTOCOL_VERSION,
    network,
    requestId,
    nonce_b64url: base64urlEncode(nonce),
    origin,
    domain,
    action,
    bindingPolicy,
    issuedAt,
    expiresAt,
    responseUri,
    requestedClaims: ["dash_identity_id", "dpns_name"],
    _nonce: nonce,
  };
}

function canonicalFrom(
  req: ReturnType<typeof baseRequest>,
  identityId: string,
  dpnsName: string,
  keyId: number,
): CanonicalInput {
  return {
    network: req.network as Network,
    origin: req.origin,
    action: req.action as Action,
    bindingPolicy: req.bindingPolicy as BindingPolicy,
    requestId: req.requestId,
    nonce: req._nonce,
    issuedAt: req.issuedAt,
    expiresAt: req.expiresAt,
    identityId,
    dpnsName,
    keyId,
  };
}

function platformFixture(
  overrides: Partial<{
    identityId: string;
    keyId: number;
    keyPurpose: string;
    securityLevel: string;
    disabled: boolean;
    dpnsResolvedIdentityId: string;
    dpnsStatus: string;
    publicKey_hex_compressed: string;
  }> = {},
) {
  const identityId = overrides.identityId ?? IDENTITY_ID;
  return {
    identityId,
    publicKey_hex_compressed:
      overrides.publicKey_hex_compressed ?? bytesToHex(TEST_PUB),
    keyId: overrides.keyId ?? 2,
    keyPurpose: overrides.keyPurpose ?? "AUTHENTICATION",
    securityLevel: overrides.securityLevel ?? "HIGH",
    disabled: overrides.disabled ?? false,
    dpnsResolvedIdentityId: overrides.dpnsResolvedIdentityId ?? identityId,
    dpnsStatus: overrides.dpnsStatus ?? "finalized",
  };
}

function makePositive(
  id: string,
  comment: string,
  reqOverrides: Parameters<typeof baseRequest>[0] = {},
  keyId = 2,
  dpnsName = "alice.dash",
): CaseBase {
  const req = baseRequest(reqOverrides);
  const canon = canonicalFrom(req, IDENTITY_ID, dpnsName, keyId);
  const canonical = buildCanonicalBytes(canon);
  const digest = sha256d(canonical);
  const signature = signCanonicalBase64Url(canon, TEST_PRIV);
  if (!verifyCanonical(canon, signature, TEST_PUB)) {
    throw new Error(`self-check failed for ${id}`);
  }
  const { _nonce, ...requestPublic } = req;
  return {
    id,
    protocolVersion: PROTOCOL_VERSION,
    expect: "accept",
    comment,
    request: requestPublic,
    response: {
      type: "dash-auth-response",
      version: PROTOCOL_VERSION,
      requestId: req.requestId,
      network: req.network,
      bindingPolicy: req.bindingPolicy,
      identityId: IDENTITY_ID,
      dpnsName,
      keyId,
      algorithm: ALGORITHM_ID,
      signature_b64url: signature,
    },
    canonical_hex: bytesToHex(canonical),
    digest_sha256d_hex: bytesToHex(digest),
    platform: platformFixture({ keyId }),
    cryptoOnly: true,
  };
}

function makeNegativeCrypto(
  id: string,
  comment: string,
  rejectReason: string,
  mutate: (ctx: {
    req: ReturnType<typeof baseRequest>;
    canon: CanonicalInput;
    signature: string;
    platform: ReturnType<typeof platformFixture>;
  }) => {
    req?: ReturnType<typeof baseRequest>;
    canon?: CanonicalInput;
    signature?: string;
    platform?: ReturnType<typeof platformFixture>;
    skipSign?: boolean;
  },
): CaseBase {
  const req0 = baseRequest();
  const canon0 = canonicalFrom(req0, IDENTITY_ID, "alice.dash", 2);
  const signature0 = signCanonicalBase64Url(canon0, TEST_PRIV);
  const platform0 = platformFixture();
  const m = mutate({
    req: req0,
    canon: canon0,
    signature: signature0,
    platform: platform0,
  });
  const req = m.req ?? req0;
  const canon = m.canon ?? canon0;
  const signature = m.signature ?? signature0;
  const platform = m.platform ?? platform0;
  const canonical = buildCanonicalBytes(canon);
  const digest = digestCanonical(canon);
  const { _nonce, ...requestPublic } = req;
  return {
    id,
    protocolVersion: PROTOCOL_VERSION,
    expect: "reject",
    comment,
    rejectReason,
    request: requestPublic,
    response: {
      type: "dash-auth-response",
      version: PROTOCOL_VERSION,
      requestId: req.requestId,
      network: req.network,
      bindingPolicy: req.bindingPolicy,
      identityId: canon.identityId,
      dpnsName: canon.dpnsName,
      keyId: canon.keyId,
      algorithm: ALGORITHM_ID,
      signature_b64url: signature,
    },
    // canonical_hex is the bytes of the *mutated* signing input (what attacker
    // would have needed to sign for accept). Verifier rebuilds from stored
    // request + response fields; negatives document the mismatch path.
    canonical_hex: bytesToHex(canonical),
    digest_sha256d_hex: bytesToHex(digest),
    platform,
    cryptoOnly: true,
  };
}

function writeJson(rel: string, data: unknown) {
  const path = join(ROOT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log("wrote", path);
}

function main() {
  mkdirSync(join(ROOT, "positive"), { recursive: true });
  mkdirSync(join(ROOT, "negative"), { recursive: true });
  mkdirSync(join(ROOT, "keys"), { recursive: true });

  writeJson("keys/test-secp256k1-1.json", {
    id: "test-secp256k1-1",
    comment:
      "Deterministic offline test key. Private scalar is 1 (hex 00..01). NOT a wallet seed.",
    curve: "secp256k1",
    privateKey_hex:
      "0000000000000000000000000000000000000000000000000000000000000001",
    publicKey_hex_compressed: bytesToHex(TEST_PUB),
    identityId_fixture: IDENTITY_ID,
    identityId_raw_hex: bytesToHex(IDENTITY_RAW),
  });

  const positives: CaseBase[] = [
    makePositive(
      "v1/positive/001-login-identity-bound",
      "Minimal login, identity_bound",
    ),
    makePositive(
      "v1/positive/002-register-identity-bound",
      "Register action",
      { action: "register" },
    ),
    makePositive(
      "v1/positive/003-link-identity-bound",
      "Link action",
      { action: "link" },
    ),
    makePositive(
      "v1/positive/004-login-name-bound",
      "Login with name_bound policy",
      { bindingPolicy: "name_bound" },
    ),
    makePositive(
      "v1/positive/005-nondefault-https-port",
      "Origin with non-default HTTPS port",
      {
        origin: "https://example.test:8443",
        domain: "example.test",
        responseUri: "https://example.test:8443/dash-auth/v1/respond",
      },
    ),
    makePositive(
      "v1/positive/006-key-id-not-2",
      "Eligible HIGH key at key id 7 (metadata selection, not hard-coded id 2)",
      {},
      7,
    ),
    makePositive(
      "v1/positive/007-long-dpns-name",
      "Longer normalized DPNS name within reasonable UTF-8 limits",
      {},
      2,
      "alice-with-a-fairly-long-label.dash",
    ),
  ];

  // Negative: signature was produced for stored request A, but verifier
  // rebuilds with mismatched field B → signature_invalid (or specific reason).
  const negatives: CaseBase[] = [];

  // wrong origin: sign with wrong origin in response path
  {
    const stored = baseRequest({ origin: "https://example.test", domain: "example.test" });
    const attackerCanon = canonicalFrom(
      baseRequest({ origin: "https://evil.test", domain: "evil.test" }),
      IDENTITY_ID,
      "alice.dash",
      2,
    );
    // Signature for evil origin; server rebuilds with stored example.test
    const badSig = signCanonicalBase64Url(attackerCanon, TEST_PRIV);
    const verifyCanon = canonicalFrom(stored, IDENTITY_ID, "alice.dash", 2);
    const { _nonce, ...requestPublic } = stored;
    negatives.push({
      id: "v1/negative/001-wrong-origin",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "Signature bound to a different origin than the stored request",
      rejectReason: "signature_invalid",
      request: requestPublic,
      response: {
        type: "dash-auth-response",
        version: PROTOCOL_VERSION,
        requestId: stored.requestId,
        network: stored.network,
        bindingPolicy: stored.bindingPolicy,
        identityId: IDENTITY_ID,
        dpnsName: "alice.dash",
        keyId: 2,
        algorithm: ALGORITHM_ID,
        signature_b64url: badSig,
      },
      canonical_hex: bytesToHex(buildCanonicalBytes(verifyCanon)),
      digest_sha256d_hex: bytesToHex(digestCanonical(verifyCanon)),
      platform: platformFixture(),
      cryptoOnly: true,
    });
  }

  // wrong network
  {
    const stored = baseRequest({ network: "testnet" });
    const signed = canonicalFrom(
      baseRequest({ network: "mainnet" }),
      IDENTITY_ID,
      "alice.dash",
      2,
    );
    const badSig = signCanonicalBase64Url(signed, TEST_PRIV);
    const verifyCanon = canonicalFrom(stored, IDENTITY_ID, "alice.dash", 2);
    const { _nonce, ...requestPublic } = stored;
    negatives.push({
      id: "v1/negative/002-wrong-network",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "Signature produced for mainnet against a testnet request",
      rejectReason: "signature_invalid",
      request: requestPublic,
      response: {
        type: "dash-auth-response",
        version: PROTOCOL_VERSION,
        requestId: stored.requestId,
        network: "testnet",
        bindingPolicy: stored.bindingPolicy,
        identityId: IDENTITY_ID,
        dpnsName: "alice.dash",
        keyId: 2,
        algorithm: ALGORITHM_ID,
        signature_b64url: badSig,
      },
      canonical_hex: bytesToHex(buildCanonicalBytes(verifyCanon)),
      digest_sha256d_hex: bytesToHex(digestCanonical(verifyCanon)),
      platform: platformFixture(),
      cryptoOnly: true,
    });
  }

  // wrong action
  {
    const stored = baseRequest({ action: "login" });
    const signed = canonicalFrom(
      baseRequest({ action: "register" }),
      IDENTITY_ID,
      "alice.dash",
      2,
    );
    const badSig = signCanonicalBase64Url(signed, TEST_PRIV);
    const verifyCanon = canonicalFrom(stored, IDENTITY_ID, "alice.dash", 2);
    const { _nonce, ...requestPublic } = stored;
    negatives.push({
      id: "v1/negative/003-wrong-action",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "Signature bound to register against a login request",
      rejectReason: "signature_invalid",
      request: requestPublic,
      response: {
        type: "dash-auth-response",
        version: PROTOCOL_VERSION,
        requestId: stored.requestId,
        network: stored.network,
        bindingPolicy: stored.bindingPolicy,
        identityId: IDENTITY_ID,
        dpnsName: "alice.dash",
        keyId: 2,
        algorithm: ALGORITHM_ID,
        signature_b64url: badSig,
      },
      canonical_hex: bytesToHex(buildCanonicalBytes(verifyCanon)),
      digest_sha256d_hex: bytesToHex(digestCanonical(verifyCanon)),
      platform: platformFixture(),
      cryptoOnly: true,
    });
  }

  // wrong binding policy
  {
    const stored = baseRequest({ bindingPolicy: "identity_bound" });
    const signed = canonicalFrom(
      baseRequest({ bindingPolicy: "name_bound" }),
      IDENTITY_ID,
      "alice.dash",
      2,
    );
    const badSig = signCanonicalBase64Url(signed, TEST_PRIV);
    const verifyCanon = canonicalFrom(stored, IDENTITY_ID, "alice.dash", 2);
    const { _nonce, ...requestPublic } = stored;
    negatives.push({
      id: "v1/negative/004-wrong-binding-policy",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "Policy substitution: signed name_bound, stored identity_bound",
      rejectReason: "signature_invalid",
      request: requestPublic,
      response: {
        type: "dash-auth-response",
        version: PROTOCOL_VERSION,
        requestId: stored.requestId,
        network: stored.network,
        bindingPolicy: "identity_bound",
        identityId: IDENTITY_ID,
        dpnsName: "alice.dash",
        keyId: 2,
        algorithm: ALGORITHM_ID,
        signature_b64url: badSig,
      },
      canonical_hex: bytesToHex(buildCanonicalBytes(verifyCanon)),
      digest_sha256d_hex: bytesToHex(digestCanonical(verifyCanon)),
      platform: platformFixture(),
      cryptoOnly: true,
    });
  }

  // wrong requestId
  {
    const stored = baseRequest({ requestId: "01TESTREQUEST00000000000000" });
    const signed = canonicalFrom(
      baseRequest({ requestId: "01OTHERREQUEST0000000000000" }),
      IDENTITY_ID,
      "alice.dash",
      2,
    );
    const badSig = signCanonicalBase64Url(signed, TEST_PRIV);
    const verifyCanon = canonicalFrom(stored, IDENTITY_ID, "alice.dash", 2);
    const { _nonce, ...requestPublic } = stored;
    negatives.push({
      id: "v1/negative/005-wrong-request-id",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "Signature bound to a different requestId",
      rejectReason: "signature_invalid",
      request: requestPublic,
      response: {
        type: "dash-auth-response",
        version: PROTOCOL_VERSION,
        requestId: stored.requestId,
        network: stored.network,
        bindingPolicy: stored.bindingPolicy,
        identityId: IDENTITY_ID,
        dpnsName: "alice.dash",
        keyId: 2,
        algorithm: ALGORITHM_ID,
        signature_b64url: badSig,
      },
      canonical_hex: bytesToHex(buildCanonicalBytes(verifyCanon)),
      digest_sha256d_hex: bytesToHex(digestCanonical(verifyCanon)),
      platform: platformFixture(),
      cryptoOnly: true,
    });
  }

  // wrong nonce
  {
    const stored = baseRequest();
    const otherNonce = hexToBytes("ff".repeat(32));
    const signed = canonicalFrom(
      baseRequest({ nonce: otherNonce }),
      IDENTITY_ID,
      "alice.dash",
      2,
    );
    const badSig = signCanonicalBase64Url(signed, TEST_PRIV);
    const verifyCanon = canonicalFrom(stored, IDENTITY_ID, "alice.dash", 2);
    const { _nonce, ...requestPublic } = stored;
    negatives.push({
      id: "v1/negative/006-wrong-nonce",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "Signature bound to a different nonce",
      rejectReason: "signature_invalid",
      request: requestPublic,
      response: {
        type: "dash-auth-response",
        version: PROTOCOL_VERSION,
        requestId: stored.requestId,
        network: stored.network,
        bindingPolicy: stored.bindingPolicy,
        identityId: IDENTITY_ID,
        dpnsName: "alice.dash",
        keyId: 2,
        algorithm: ALGORITHM_ID,
        signature_b64url: badSig,
      },
      canonical_hex: bytesToHex(buildCanonicalBytes(verifyCanon)),
      digest_sha256d_hex: bytesToHex(digestCanonical(verifyCanon)),
      platform: platformFixture(),
      cryptoOnly: true,
    });
  }

  // expired: crypto valid but expiredAt in the past relative to verification time
  {
    const stored = baseRequest({
      issuedAt: "2026-07-30T17:00:00.000Z",
      expiresAt: "2026-07-30T17:02:00.000Z",
    });
    const canon = canonicalFrom(stored, IDENTITY_ID, "alice.dash", 2);
    const sig = signCanonicalBase64Url(canon, TEST_PRIV);
    const { _nonce, ...requestPublic } = stored;
    negatives.push({
      id: "v1/negative/007-expired",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment:
        "Request past expiresAt at verification time (fixture assumes now > 2026-07-30T17:02:00Z)",
      rejectReason: "expired",
      request: requestPublic,
      response: {
        type: "dash-auth-response",
        version: PROTOCOL_VERSION,
        requestId: stored.requestId,
        network: stored.network,
        bindingPolicy: stored.bindingPolicy,
        identityId: IDENTITY_ID,
        dpnsName: "alice.dash",
        keyId: 2,
        algorithm: ALGORITHM_ID,
        signature_b64url: sig,
      },
      canonical_hex: bytesToHex(buildCanonicalBytes(canon)),
      digest_sha256d_hex: bytesToHex(digestCanonical(canon)),
      platform: platformFixture(),
      verificationTime: "2026-07-30T18:00:00.000Z",
      cryptoOnly: true,
    } as CaseBase & { verificationTime: string });
  }

  // issuedAt far future
  {
    const stored = baseRequest({
      issuedAt: "2099-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:02:00.000Z",
    });
    const canon = canonicalFrom(stored, IDENTITY_ID, "alice.dash", 2);
    const sig = signCanonicalBase64Url(canon, TEST_PRIV);
    const { _nonce, ...requestPublic } = stored;
    negatives.push({
      id: "v1/negative/008-issued-at-far-future",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "issuedAt more than 60s ahead of server clock",
      rejectReason: "invalid_request",
      request: requestPublic,
      response: {
        type: "dash-auth-response",
        version: PROTOCOL_VERSION,
        requestId: stored.requestId,
        network: stored.network,
        bindingPolicy: stored.bindingPolicy,
        identityId: IDENTITY_ID,
        dpnsName: "alice.dash",
        keyId: 2,
        algorithm: ALGORITHM_ID,
        signature_b64url: sig,
      },
      canonical_hex: bytesToHex(buildCanonicalBytes(canon)),
      digest_sha256d_hex: bytesToHex(digestCanonical(canon)),
      platform: platformFixture(),
      verificationTime: "2026-07-30T18:00:00.000Z",
      cryptoOnly: true,
    } as CaseBase & { verificationTime: string });
  }

  // high-S
  {
    const stored = baseRequest();
    const canon = canonicalFrom(stored, IDENTITY_ID, "alice.dash", 2);
    const low = signCanonical(canon, TEST_PRIV);
    const high = forceHighS(low);
    const { _nonce, ...requestPublic } = stored;
    negatives.push({
      id: "v1/negative/009-high-s-signature",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "High-S malleable signature must be rejected",
      rejectReason: "signature_invalid",
      request: requestPublic,
      response: {
        type: "dash-auth-response",
        version: PROTOCOL_VERSION,
        requestId: stored.requestId,
        network: stored.network,
        bindingPolicy: stored.bindingPolicy,
        identityId: IDENTITY_ID,
        dpnsName: "alice.dash",
        keyId: 2,
        algorithm: ALGORITHM_ID,
        signature_b64url: base64urlEncode(high),
      },
      canonical_hex: bytesToHex(buildCanonicalBytes(canon)),
      digest_sha256d_hex: bytesToHex(digestCanonical(canon)),
      platform: platformFixture(),
      cryptoOnly: true,
    });
  }

  // truncated signature
  {
    const stored = baseRequest();
    const canon = canonicalFrom(stored, IDENTITY_ID, "alice.dash", 2);
    const full = signCanonical(canon, TEST_PRIV);
    const trunc = full.subarray(0, 64);
    const { _nonce, ...requestPublic } = stored;
    negatives.push({
      id: "v1/negative/010-truncated-signature",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "Signature not 65 bytes",
      rejectReason: "signature_invalid",
      request: requestPublic,
      response: {
        type: "dash-auth-response",
        version: PROTOCOL_VERSION,
        requestId: stored.requestId,
        network: stored.network,
        bindingPolicy: stored.bindingPolicy,
        identityId: IDENTITY_ID,
        dpnsName: "alice.dash",
        keyId: 2,
        algorithm: ALGORITHM_ID,
        signature_b64url: base64urlEncode(trunc),
      },
      canonical_hex: bytesToHex(buildCanonicalBytes(canon)),
      digest_sha256d_hex: bytesToHex(digestCanonical(canon)),
      platform: platformFixture(),
      cryptoOnly: true,
    });
  }

  // wrong key id (platform key id 2, response claims 99 without matching key)
  {
    const stored = baseRequest();
    const canon = canonicalFrom(stored, IDENTITY_ID, "alice.dash", 99);
    const sig = signCanonicalBase64Url(canon, TEST_PRIV);
    const { _nonce, ...requestPublic } = stored;
    negatives.push({
      id: "v1/negative/011-wrong-key-id",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "Response keyId not present / not eligible on identity fixture",
      rejectReason: "key_ineligible",
      request: requestPublic,
      response: {
        type: "dash-auth-response",
        version: PROTOCOL_VERSION,
        requestId: stored.requestId,
        network: stored.network,
        bindingPolicy: stored.bindingPolicy,
        identityId: IDENTITY_ID,
        dpnsName: "alice.dash",
        keyId: 99,
        algorithm: ALGORITHM_ID,
        signature_b64url: sig,
      },
      canonical_hex: bytesToHex(buildCanonicalBytes(canon)),
      digest_sha256d_hex: bytesToHex(digestCanonical(canon)),
      platform: platformFixture({ keyId: 2 }),
      cryptoOnly: true,
    });
  }

  // disabled key
  {
    const stored = baseRequest();
    const canon = canonicalFrom(stored, IDENTITY_ID, "alice.dash", 2);
    const sig = signCanonicalBase64Url(canon, TEST_PRIV);
    const { _nonce, ...requestPublic } = stored;
    negatives.push({
      id: "v1/negative/012-disabled-key",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "Platform key is disabled",
      rejectReason: "key_ineligible",
      request: requestPublic,
      response: {
        type: "dash-auth-response",
        version: PROTOCOL_VERSION,
        requestId: stored.requestId,
        network: stored.network,
        bindingPolicy: stored.bindingPolicy,
        identityId: IDENTITY_ID,
        dpnsName: "alice.dash",
        keyId: 2,
        algorithm: ALGORITHM_ID,
        signature_b64url: sig,
      },
      canonical_hex: bytesToHex(buildCanonicalBytes(canon)),
      digest_sha256d_hex: bytesToHex(digestCanonical(canon)),
      platform: platformFixture({ disabled: true }),
      cryptoOnly: true,
    });
  }

  // name resolves to other identity
  {
    const stored = baseRequest();
    const canon = canonicalFrom(stored, IDENTITY_ID, "alice.dash", 2);
    const sig = signCanonicalBase64Url(canon, TEST_PRIV);
    const { _nonce, ...requestPublic } = stored;
    negatives.push({
      id: "v1/negative/013-name-other-identity",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "DPNS name currently resolves to a different identity",
      rejectReason: "name_ineligible",
      request: requestPublic,
      response: {
        type: "dash-auth-response",
        version: PROTOCOL_VERSION,
        requestId: stored.requestId,
        network: stored.network,
        bindingPolicy: stored.bindingPolicy,
        identityId: IDENTITY_ID,
        dpnsName: "alice.dash",
        keyId: 2,
        algorithm: ALGORITHM_ID,
        signature_b64url: sig,
      },
      canonical_hex: bytesToHex(buildCanonicalBytes(canon)),
      digest_sha256d_hex: bytesToHex(digestCanonical(canon)),
      platform: platformFixture({
        dpnsResolvedIdentityId: OTHER_IDENTITY_ID,
      }),
      cryptoOnly: true,
    });
  }

  // contested name
  {
    const stored = baseRequest();
    const canon = canonicalFrom(stored, IDENTITY_ID, "alice.dash", 2);
    const sig = signCanonicalBase64Url(canon, TEST_PRIV);
    const { _nonce, ...requestPublic } = stored;
    negatives.push({
      id: "v1/negative/014-contested-name",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "Contested DPNS name is not eligible",
      rejectReason: "name_ineligible",
      request: requestPublic,
      response: {
        type: "dash-auth-response",
        version: PROTOCOL_VERSION,
        requestId: stored.requestId,
        network: stored.network,
        bindingPolicy: stored.bindingPolicy,
        identityId: IDENTITY_ID,
        dpnsName: "alice.dash",
        keyId: 2,
        algorithm: ALGORITHM_ID,
        signature_b64url: sig,
      },
      canonical_hex: bytesToHex(buildCanonicalBytes(canon)),
      digest_sha256d_hex: bytesToHex(digestCanonical(canon)),
      platform: platformFixture({ dpnsStatus: "contested" }),
      cryptoOnly: true,
    });
  }

  // unresolved name
  {
    const stored = baseRequest();
    const canon = canonicalFrom(stored, IDENTITY_ID, "alice.dash", 2);
    const sig = signCanonicalBase64Url(canon, TEST_PRIV);
    const { _nonce, ...requestPublic } = stored;
    negatives.push({
      id: "v1/negative/015-unresolved-name",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "Unresolved DPNS name is not eligible",
      rejectReason: "name_ineligible",
      request: requestPublic,
      response: {
        type: "dash-auth-response",
        version: PROTOCOL_VERSION,
        requestId: stored.requestId,
        network: stored.network,
        bindingPolicy: stored.bindingPolicy,
        identityId: IDENTITY_ID,
        dpnsName: "alice.dash",
        keyId: 2,
        algorithm: ALGORITHM_ID,
        signature_b64url: sig,
      },
      canonical_hex: bytesToHex(buildCanonicalBytes(canon)),
      digest_sha256d_hex: bytesToHex(digestCanonical(canon)),
      platform: platformFixture({
        dpnsStatus: "unresolved",
        dpnsResolvedIdentityId: "",
      }),
      cryptoOnly: true,
    });
  }

  // master key
  {
    const stored = baseRequest();
    const canon = canonicalFrom(stored, IDENTITY_ID, "alice.dash", 0);
    const sig = signCanonicalBase64Url(canon, TEST_PRIV);
    const { _nonce, ...requestPublic } = stored;
    negatives.push({
      id: "v1/negative/016-master-key",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "Master authentication key is never eligible for SIWD",
      rejectReason: "key_ineligible",
      request: requestPublic,
      response: {
        type: "dash-auth-response",
        version: PROTOCOL_VERSION,
        requestId: stored.requestId,
        network: stored.network,
        bindingPolicy: stored.bindingPolicy,
        identityId: IDENTITY_ID,
        dpnsName: "alice.dash",
        keyId: 0,
        algorithm: ALGORITHM_ID,
        signature_b64url: sig,
      },
      canonical_hex: bytesToHex(buildCanonicalBytes(canon)),
      digest_sha256d_hex: bytesToHex(digestCanonical(canon)),
      platform: platformFixture({
        keyId: 0,
        securityLevel: "MASTER",
      }),
      cryptoOnly: true,
    });
  }

  // transfer key purpose
  {
    const stored = baseRequest();
    const canon = canonicalFrom(stored, IDENTITY_ID, "alice.dash", 3);
    const sig = signCanonicalBase64Url(canon, TEST_PRIV);
    const { _nonce, ...requestPublic } = stored;
    negatives.push({
      id: "v1/negative/017-transfer-key",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "Transfer keys are never eligible for SIWD",
      rejectReason: "key_ineligible",
      request: requestPublic,
      response: {
        type: "dash-auth-response",
        version: PROTOCOL_VERSION,
        requestId: stored.requestId,
        network: stored.network,
        bindingPolicy: stored.bindingPolicy,
        identityId: IDENTITY_ID,
        dpnsName: "alice.dash",
        keyId: 3,
        algorithm: ALGORITHM_ID,
        signature_b64url: sig,
      },
      canonical_hex: bytesToHex(buildCanonicalBytes(canon)),
      digest_sha256d_hex: bytesToHex(digestCanonical(canon)),
      platform: platformFixture({
        keyId: 3,
        keyPurpose: "TRANSFER",
        securityLevel: "CRITICAL",
      }),
      cryptoOnly: true,
    });
  }

  // CRITICAL auth key (HIGH-only policy)
  {
    const stored = baseRequest();
    const canon = canonicalFrom(stored, IDENTITY_ID, "alice.dash", 1);
    const sig = signCanonicalBase64Url(canon, TEST_PRIV);
    const { _nonce, ...requestPublic } = stored;
    negatives.push({
      id: "v1/negative/018-critical-auth-key",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "AUTHENTICATION/CRITICAL is not eligible in Draft 1 (HIGH-only)",
      rejectReason: "key_ineligible",
      request: requestPublic,
      response: {
        type: "dash-auth-response",
        version: PROTOCOL_VERSION,
        requestId: stored.requestId,
        network: stored.network,
        bindingPolicy: stored.bindingPolicy,
        identityId: IDENTITY_ID,
        dpnsName: "alice.dash",
        keyId: 1,
        algorithm: ALGORITHM_ID,
        signature_b64url: sig,
      },
      canonical_hex: bytesToHex(buildCanonicalBytes(canon)),
      digest_sha256d_hex: bytesToHex(digestCanonical(canon)),
      platform: platformFixture({
        keyId: 1,
        securityLevel: "CRITICAL",
      }),
      cryptoOnly: true,
    });
  }

  // platform unavailable (fixture flag)
  {
    const stored = baseRequest();
    const canon = canonicalFrom(stored, IDENTITY_ID, "alice.dash", 2);
    const sig = signCanonicalBase64Url(canon, TEST_PRIV);
    const { _nonce, ...requestPublic } = stored;
    negatives.push({
      id: "v1/negative/019-platform-unavailable",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "Platform identity/DPNS state could not be retrieved",
      rejectReason: "platform_unavailable",
      request: requestPublic,
      response: {
        type: "dash-auth-response",
        version: PROTOCOL_VERSION,
        requestId: stored.requestId,
        network: stored.network,
        bindingPolicy: stored.bindingPolicy,
        identityId: IDENTITY_ID,
        dpnsName: "alice.dash",
        keyId: 2,
        algorithm: ALGORITHM_ID,
        signature_b64url: sig,
      },
      canonical_hex: bytesToHex(buildCanonicalBytes(canon)),
      digest_sha256d_hex: bytesToHex(digestCanonical(canon)),
      platform: {
        ...platformFixture(),
        unavailable: true,
      },
      cryptoOnly: true,
    });
  }

  // trailing-dot host (invalid at request creation)
  {
    negatives.push({
      id: "v1/negative/020-trailing-dot-host",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "Trailing-dot hosts are invalid for SIWD v1 origin normalization",
      rejectReason: "invalid_request",
      request: {
        type: "dash-auth-request",
        version: PROTOCOL_VERSION,
        network: "testnet",
        requestId: "01TESTREQUEST00000000000000",
        nonce_b64url: base64urlEncode(NONCE),
        origin: "https://example.test.",
        domain: "example.test.",
        action: "login",
        bindingPolicy: "identity_bound",
        issuedAt: "2026-07-30T18:00:00.000Z",
        expiresAt: "2026-07-30T18:02:00.000Z",
        responseUri: "https://example.test./dash-auth/v1/respond",
        requestedClaims: ["dash_identity_id", "dpns_name"],
      },
      response: {},
      canonical_hex: "",
      digest_sha256d_hex: "",
      platform: {},
      cryptoOnly: true,
      stage: "request_create",
    } as CaseBase & { stage: string });
  }

  // http non-loopback
  {
    negatives.push({
      id: "v1/negative/021-http-non-loopback",
      protocolVersion: PROTOCOL_VERSION,
      expect: "reject",
      comment: "HTTP origins are only allowed for loopback development",
      rejectReason: "invalid_request",
      request: {
        type: "dash-auth-request",
        version: PROTOCOL_VERSION,
        network: "testnet",
        requestId: "01TESTREQUEST00000000000000",
        nonce_b64url: base64urlEncode(NONCE),
        origin: "http://example.test",
        domain: "example.test",
        action: "login",
        bindingPolicy: "identity_bound",
        issuedAt: "2026-07-30T18:00:00.000Z",
        expiresAt: "2026-07-30T18:02:00.000Z",
        responseUri: "http://example.test/dash-auth/v1/respond",
        requestedClaims: ["dash_identity_id", "dpns_name"],
      },
      response: {},
      canonical_hex: "",
      digest_sha256d_hex: "",
      platform: {},
      cryptoOnly: true,
      stage: "request_create",
    } as CaseBase & { stage: string });
  }

  // eligibility self-check for positive key policy
  if (
    !isKeyEligibleForSiwd({
      keyId: 2,
      keyPurpose: "AUTHENTICATION",
      securityLevel: "HIGH",
      disabled: false,
    })
  ) {
    throw new Error("eligibility self-check failed for HIGH");
  }

  for (const c of positives) {
    const name = c.id.split("/").pop() + ".json";
    writeJson(join("positive", name!), c);
  }
  for (const c of negatives) {
    const name = c.id.split("/").pop() + ".json";
    writeJson(join("negative", name!), c);
  }

  const manifest = {
    schemaVersion: 1,
    protocolVersion: PROTOCOL_VERSION,
    algorithm: ALGORITHM_ID,
    generator: "@siwd/protocol TypeScript",
    generatedAt: new Date().toISOString(),
    cases: [...positives, ...negatives].map((c) => ({
      id: c.id,
      expect: c.expect,
      rejectReason: c.rejectReason ?? null,
      file: c.id.replace("v1/", "") + ".json",
    })),
  };
  writeJson("manifest.json", manifest);

  console.log(
    `Generated ${positives.length} positive and ${negatives.length} negative vectors.`,
  );
}

main();
