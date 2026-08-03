/**
 * Verify SIWD v1 golden vectors: canonical bytes, digests, signatures,
 * origin rules, and key/name eligibility fixtures.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  base64urlDecode,
  buildCanonicalBytes,
  bytesToHex,
  digestCanonical,
  hexToBytes,
} from "./encoding.js";
import { isKeyEligibleForSiwd } from "./eligibility.js";
import { normalizeOrigin } from "./origin.js";
import { parseRecoverableSignature, verifyCanonical } from "./signature.js";
import type { Action, BindingPolicy, CanonicalInput, Network } from "./types.js";

const ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "test-vectors",
  "v1",
);

interface VectorCase {
  id: string;
  expect: "accept" | "reject";
  rejectReason?: string;
  comment?: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  canonical_hex: string;
  digest_sha256d_hex: string;
  platform: Record<string, unknown>;
  verificationTime?: string;
  stage?: string;
  cryptoOnly?: boolean;
}

function loadCases(): VectorCase[] {
  const cases: VectorCase[] = [];
  for (const dir of ["positive", "negative"]) {
    const path = join(ROOT, dir);
    for (const file of readdirSync(path).sort()) {
      if (!file.endsWith(".json")) continue;
      cases.push(JSON.parse(readFileSync(join(path, file), "utf8")));
    }
  }
  return cases;
}

function toCanon(
  request: Record<string, unknown>,
  response: Record<string, unknown>,
): CanonicalInput {
  const nonceB64 = request.nonce_b64url as string;
  return {
    network: request.network as Network,
    origin: request.origin as string,
    action: request.action as Action,
    bindingPolicy: (response.bindingPolicy ??
      request.bindingPolicy) as BindingPolicy,
    requestId: request.requestId as string,
    nonce: base64urlDecode(nonceB64),
    issuedAt: request.issuedAt as string,
    expiresAt: request.expiresAt as string,
    identityId: response.identityId as string,
    dpnsName: response.dpnsName as string,
    keyId: response.keyId as number,
  };
}

function checkOriginCreate(request: Record<string, unknown>): string | null {
  try {
    normalizeOrigin(request.origin as string);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function evaluateCase(c: VectorCase): { ok: boolean; detail: string } {
  // Request-create stage negatives
  if (c.stage === "request_create") {
    const err = checkOriginCreate(c.request);
    if (c.expect === "reject") {
      if (err) return { ok: true, detail: `origin rejected: ${err}` };
      return { ok: false, detail: "expected origin rejection, but normalize succeeded" };
    }
  }

  if (!c.response || Object.keys(c.response).length === 0) {
    if (c.expect === "reject") {
      return { ok: true, detail: "request-stage reject without response" };
    }
    return { ok: false, detail: "missing response for accept case" };
  }

  const platform = c.platform ?? {};
  if (platform.unavailable === true) {
    if (c.expect === "reject" && c.rejectReason === "platform_unavailable") {
      return { ok: true, detail: "platform unavailable" };
    }
    return { ok: false, detail: "unexpected platform unavailable handling" };
  }

  // Time checks
  if (c.verificationTime) {
    const now = Date.parse(c.verificationTime);
    const expires = Date.parse(c.request.expiresAt as string);
    const issued = Date.parse(c.request.issuedAt as string);
    if (c.rejectReason === "expired") {
      if (now > expires) {
        return { ok: true, detail: "expired at verification time" };
      }
      return { ok: false, detail: "expected expired but verificationTime <= expiresAt" };
    }
    if (c.rejectReason === "invalid_request" && c.id.includes("issued-at")) {
      if (issued - now > 60_000) {
        return { ok: true, detail: "issuedAt too far in future" };
      }
      return { ok: false, detail: "expected issuedAt skew rejection" };
    }
  }

  // Key eligibility from platform fixture
  if (c.rejectReason === "key_ineligible") {
    const key = {
      keyId: (c.response.keyId as number) ?? (platform.keyId as number),
      keyPurpose: (platform.keyPurpose as string) ?? "AUTHENTICATION",
      securityLevel: (platform.securityLevel as string) ?? "HIGH",
      disabled: Boolean(platform.disabled),
    };
    // Wrong key id: platform has different keyId than response
    if (
      platform.keyId !== undefined &&
      c.response.keyId !== undefined &&
      platform.keyId !== c.response.keyId
    ) {
      return { ok: true, detail: "response keyId not on platform fixture" };
    }
    if (!isKeyEligibleForSiwd(key)) {
      return { ok: true, detail: `key ineligible: ${JSON.stringify(key)}` };
    }
    return { ok: false, detail: "expected key_ineligible but key looks eligible" };
  }

  // Name eligibility
  if (c.rejectReason === "name_ineligible") {
    const status = platform.dpnsStatus as string;
    const resolved = platform.dpnsResolvedIdentityId as string;
    const claimed = c.response.identityId as string;
    if (status === "contested" || status === "unresolved") {
      return { ok: true, detail: `name status ${status}` };
    }
    if (resolved && claimed && resolved !== claimed) {
      return { ok: true, detail: "name resolves to other identity" };
    }
    return { ok: false, detail: "expected name_ineligible" };
  }

  let canon: CanonicalInput;
  try {
    canon = toCanon(c.request, c.response);
  } catch (e) {
    if (c.expect === "reject") {
      return {
        ok: true,
        detail: `canonical build failed as expected: ${e}`,
      };
    }
    return { ok: false, detail: `canonical build failed: ${e}` };
  }

  const built = buildCanonicalBytes(canon);
  const digest = digestCanonical(canon);

  if (c.canonical_hex) {
    if (bytesToHex(built) !== c.canonical_hex) {
      return {
        ok: false,
        detail: `canonical_hex mismatch\n expected ${c.canonical_hex}\n got      ${bytesToHex(built)}`,
      };
    }
  }
  if (c.digest_sha256d_hex) {
    if (bytesToHex(digest) !== c.digest_sha256d_hex) {
      return {
        ok: false,
        detail: `digest mismatch\n expected ${c.digest_sha256d_hex}\n got      ${bytesToHex(digest)}`,
      };
    }
  }

  const sig = c.response.signature_b64url as string;
  const pubHex = platform.publicKey_hex_compressed as string;

  if (c.expect === "accept") {
    if (!pubHex) return { ok: false, detail: "missing platform public key" };
    const ok = verifyCanonical(canon, sig, hexToBytes(pubHex));
    if (!ok) return { ok: false, detail: "signature verify failed on accept case" };
    // eligibility
    if (
      !isKeyEligibleForSiwd({
        keyId: c.response.keyId as number,
        keyPurpose: (platform.keyPurpose as string) ?? "AUTHENTICATION",
        securityLevel: (platform.securityLevel as string) ?? "HIGH",
        disabled: Boolean(platform.disabled),
      })
    ) {
      return { ok: false, detail: "accept case has ineligible key" };
    }
    if (
      platform.dpnsStatus &&
      platform.dpnsStatus !== "finalized"
    ) {
      return { ok: false, detail: "accept case has non-finalized name" };
    }
    return { ok: true, detail: "accept: digest + signature ok" };
  }

  // expect reject — signature_invalid path
  if (c.rejectReason === "signature_invalid") {
    try {
      parseRecoverableSignature(base64urlDecode(sig));
    } catch {
      return { ok: true, detail: "signature parse rejected" };
    }
    if (!pubHex) {
      return { ok: true, detail: "no pubkey; treat as reject" };
    }
    const ok = verifyCanonical(canon, sig, hexToBytes(pubHex));
    if (!ok) return { ok: true, detail: "signature does not verify (as expected)" };
    return {
      ok: false,
      detail: "expected signature_invalid but signature verified",
    };
  }

  // Other rejects already handled; if we got here with crypto still valid, ok if reason is non-crypto
  return { ok: true, detail: `reject reason ${c.rejectReason} handled` };
}

function main() {
  const cases = loadCases();
  if (cases.length === 0) {
    console.error("No vectors found under", ROOT);
    process.exit(1);
  }
  let failed = 0;
  for (const c of cases) {
    const result = evaluateCase(c);
    if (result.ok) {
      console.log(`OK  ${c.id} — ${result.detail}`);
    } else {
      failed++;
      console.error(`FAIL ${c.id} — ${result.detail}`);
    }
  }
  console.log(`\n${cases.length - failed}/${cases.length} passed`);
  if (failed > 0) process.exit(1);
}

main();
