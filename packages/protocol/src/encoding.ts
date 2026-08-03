import bs58 from "bs58";
import { sha256 } from "@noble/hashes/sha2.js";
import type {
  Action,
  BindingPolicy,
  CanonicalInput,
  Network,
} from "./types.js";
import { PROTOCOL_VERSION } from "./types.js";

export const MAGIC = new Uint8Array([0x53, 0x49, 0x57, 0x44]); // "SIWD"

const NETWORK_BYTE: Record<Network, number> = {
  testnet: 0,
  mainnet: 1,
};

const ACTION_BYTE: Record<Action, number> = {
  register: 1,
  login: 2,
  link: 3,
};

const BINDING_BYTE: Record<BindingPolicy, number> = {
  identity_bound: 1,
  name_bound: 2,
};

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function u8(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 0xff) {
    throw new Error(`u8 out of range: ${n}`);
  }
  return new Uint8Array([n]);
}

export function u16be(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 0xffff) {
    throw new Error(`u16 out of range: ${n}`);
  }
  return new Uint8Array([(n >>> 8) & 0xff, n & 0xff]);
}

export function u32be(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) {
    throw new Error(`u32 out of range: ${n}`);
  }
  return new Uint8Array([
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ]);
}

/** Signed big-endian int64. */
export function i64be(n: bigint): Uint8Array {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setBigInt64(0, n, false);
  return new Uint8Array(buf);
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function lengthPrefixedUtf8(s: string): Uint8Array {
  const bytes = utf8(s);
  if (bytes.length > 0xffff) {
    throw new Error(`UTF-8 field too long: ${bytes.length}`);
  }
  return concatBytes(u16be(bytes.length), bytes);
}

/**
 * Floor RFC 3339 / ISO-8601 timestamp to Unix seconds.
 * Rejects invalid dates.
 */
export function unixSecondsFromRfc3339(iso: string): bigint {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`invalid timestamp: ${iso}`);
  }
  return BigInt(Math.floor(ms / 1000));
}

/**
 * Decode a Dash Platform identity id (Base58 of 32 raw bytes).
 * Accepts the Base58 alphabet used by current Platform SDKs (bs58).
 */
export function decodeIdentityId(identityId: string): Uint8Array {
  let raw: Uint8Array;
  try {
    raw = bs58.decode(identityId);
  } catch {
    throw new Error(`invalid identity id Base58: ${identityId}`);
  }
  if (raw.length !== 32) {
    throw new Error(
      `identity id must decode to 32 bytes, got ${raw.length}`,
    );
  }
  return raw;
}

export function encodeIdentityId(raw: Uint8Array): string {
  if (raw.length !== 32) {
    throw new Error(`identity id raw must be 32 bytes, got ${raw.length}`);
  }
  return bs58.encode(raw);
}

/**
 * Build canonical SIWD bytes per PROTOCOL.md §8.
 * JSON is never signed; only this layout is.
 */
export function buildCanonicalBytes(input: CanonicalInput): Uint8Array {
  if (input.nonce.length !== 32) {
    throw new Error(`nonce must be 32 bytes, got ${input.nonce.length}`);
  }
  if (!Number.isInteger(input.keyId) || input.keyId < 0 || input.keyId > 0xffffffff) {
    throw new Error(`invalid keyId: ${input.keyId}`);
  }

  const network = NETWORK_BYTE[input.network];
  if (network === undefined) {
    throw new Error(`unknown network: ${input.network}`);
  }
  const action = ACTION_BYTE[input.action];
  if (action === undefined) {
    throw new Error(`unknown action: ${input.action}`);
  }
  const binding = BINDING_BYTE[input.bindingPolicy];
  if (binding === undefined) {
    throw new Error(`unknown bindingPolicy: ${input.bindingPolicy}`);
  }

  const identityRaw = decodeIdentityId(input.identityId);
  const issued = unixSecondsFromRfc3339(input.issuedAt);
  const expires = unixSecondsFromRfc3339(input.expiresAt);

  return concatBytes(
    MAGIC,
    u32be(PROTOCOL_VERSION),
    u8(network),
    lengthPrefixedUtf8(input.origin),
    u8(action),
    u8(binding),
    lengthPrefixedUtf8(input.requestId),
    input.nonce,
    i64be(issued),
    i64be(expires),
    identityRaw,
    lengthPrefixedUtf8(input.dpnsName),
    u32be(input.keyId),
  );
}

/** digest = SHA-256(SHA-256(canonical_siwd_bytes)) */
export function sha256d(data: Uint8Array): Uint8Array {
  return sha256(sha256(data));
}

export function digestCanonical(input: CanonicalInput): Uint8Array {
  return sha256d(buildCanonicalBytes(input));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("hex length must be even");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Unpadded base64url encode. */
export function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return Buffer.from(bin, "binary")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** Unpadded base64url decode. */
export function base64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const buf = Buffer.from(padded + pad, "base64");
  return new Uint8Array(buf);
}
