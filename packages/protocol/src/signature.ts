import { secp256k1 } from "@noble/curves/secp256k1.js";
import {
  base64urlDecode,
  base64urlEncode,
  buildCanonicalBytes,
  sha256d,
} from "./encoding.js";
import type { CanonicalInput } from "./types.js";

/** secp256k1 curve order n. */
const N = secp256k1.Point.CURVE().n;
const HALF_N = N >> 1n;

const NO_PREHASH = { prehash: false } as const;

/**
 * Compact recoverable signature: header || r || s (65 bytes).
 * Header = 27 + recovery_id + 4 for compressed keys → 31–34.
 * Matches Dash Platform / rust-dashcore recoverable compact convention.
 */
export function packRecoverableSignature(
  r: bigint,
  s: bigint,
  recoveryId: number,
): Uint8Array {
  if (recoveryId < 0 || recoveryId > 3) {
    throw new Error(`recovery_id out of range: ${recoveryId}`);
  }
  if (s > HALF_N) {
    throw new Error("high-S signatures are not allowed on the wire");
  }
  const header = 27 + recoveryId + 4;
  const out = new Uint8Array(65);
  out[0] = header;
  out.set(bigintTo32(r), 1);
  out.set(bigintTo32(s), 33);
  return out;
}

function bigintTo32(n: bigint): Uint8Array {
  const hex = n.toString(16).padStart(64, "0");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToBigint(bytes: Uint8Array): bigint {
  let hex = "0x";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return BigInt(hex);
}

/** Convert Dash header form (31–34 || r || s) to noble recovered form (0–3 || r || s). */
export function toNobleRecovered(sig65: Uint8Array): Uint8Array {
  const { recoveryId, compact } = parseRecoverableSignature(sig65);
  const out = new Uint8Array(65);
  out[0] = recoveryId;
  out.set(compact, 1);
  return out;
}

export function parseRecoverableSignature(sig65: Uint8Array): {
  recoveryId: number;
  r: bigint;
  s: bigint;
  compact: Uint8Array;
} {
  if (sig65.length !== 65) {
    throw new Error(`signature must be 65 bytes, got ${sig65.length}`);
  }
  const header = sig65[0]!;
  if (header < 31 || header > 34) {
    throw new Error(`invalid recoverable header: ${header}`);
  }
  const recoveryId = header - 31;
  const r = bytesToBigint(sig65.subarray(1, 33));
  const s = bytesToBigint(sig65.subarray(33, 65));
  if (s > HALF_N) {
    throw new Error("high-S signature rejected");
  }
  return { recoveryId, r, s, compact: sig65.subarray(1, 65) };
}

/**
 * Sign canonical SIWD input with a 32-byte secp256k1 private key.
 * Returns 65-byte recoverable compact signature (low-S, Dash header 31–34).
 */
export function signCanonical(
  input: CanonicalInput,
  privateKey: Uint8Array,
): Uint8Array {
  if (privateKey.length !== 32) {
    throw new Error("private key must be 32 bytes");
  }
  const digest = sha256d(buildCanonicalBytes(input));
  // noble: recovery_id (0–3) || r || s; digest is already SHA256d so prehash:false
  const recovered = secp256k1.sign(digest, privateKey, {
    format: "recovered",
    prehash: false,
  });
  if (recovered.length !== 65) {
    throw new Error(`unexpected recovered signature length: ${recovered.length}`);
  }
  const recoveryId = recovered[0]!;
  if (recoveryId > 3) {
    throw new Error(`unexpected recovery id: ${recoveryId}`);
  }
  const out = new Uint8Array(65);
  out[0] = 27 + recoveryId + 4;
  out.set(recovered.subarray(1), 1);
  const s = bytesToBigint(out.subarray(33, 65));
  if (s > HALF_N) {
    throw new Error("signer produced high-S signature");
  }
  return out;
}

export function signCanonicalBase64Url(
  input: CanonicalInput,
  privateKey: Uint8Array,
): string {
  return base64urlEncode(signCanonical(input, privateKey));
}

/**
 * Verify signature against an expected compressed public key (33 bytes).
 * Checks low-S and that recovered key equals the Platform key.
 */
export function verifyCanonical(
  input: CanonicalInput,
  signatureB64url: string,
  expectedPublicKeyCompressed: Uint8Array,
): boolean {
  if (expectedPublicKeyCompressed.length !== 33) {
    throw new Error("expected compressed public key (33 bytes)");
  }
  let sig65: Uint8Array;
  try {
    sig65 = base64urlDecode(signatureB64url);
  } catch {
    return false;
  }
  if (sig65.length !== 65) {
    return false;
  }

  let parsed: { recoveryId: number; compact: Uint8Array };
  try {
    parsed = parseRecoverableSignature(sig65);
  } catch {
    return false;
  }

  const digest = sha256d(buildCanonicalBytes(input));
  try {
    const nobleRec = toNobleRecovered(sig65);
    const recovered = secp256k1.recoverPublicKey(nobleRec, digest, NO_PREHASH);
    // recoverPublicKey returns compressed 33-byte key in this noble version
    const recoveredCompressed =
      recovered.length === 33
        ? recovered
        : secp256k1.Point.fromBytes(recovered).toBytes(true);
    if (!bytesEqual(recoveredCompressed, expectedPublicKeyCompressed)) {
      return false;
    }
    return secp256k1.verify(
      parsed.compact,
      digest,
      expectedPublicKeyCompressed,
      NO_PREHASH,
    );
  } catch {
    return false;
  }
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

export function publicKeyFromPrivate(privateKey: Uint8Array): Uint8Array {
  return secp256k1.getPublicKey(privateKey, true);
}

/**
 * Force high-S form for negative test vectors only.
 * Flips s → n - s and toggles recovery id parity.
 */
export function forceHighS(sig65: Uint8Array): Uint8Array {
  const recoveryId = sig65[0]! - 31;
  const r = bytesToBigint(sig65.subarray(1, 33));
  let s = bytesToBigint(sig65.subarray(33, 65));
  if (s > HALF_N) {
    return new Uint8Array(sig65);
  }
  s = N - s;
  const newRecovery = recoveryId ^ 1;
  const out = new Uint8Array(65);
  out[0] = 31 + newRecovery;
  out.set(bigintTo32(r), 1);
  out.set(bigintTo32(s), 33);
  return out;
}

export { base64urlEncode, base64urlDecode };
