/**
 * BIP-39 seed + DIP-9 Platform identity key derivation for the dev simulator.
 * Mirrors apps/android-authenticator IdentityDerivation (testnet).
 *
 * Path: m/9'/coin'/5'/0'/0'/identityIndex'/keyIndex'
 * Testnet coin type = 1.
 */
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, publicKeyFromPrivate } from "@siwd/protocol";

const HARDENED = 0x80000000;
const N = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141",
);

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function int32be(v: number): Uint8Array {
  const u = v >>> 0;
  return new Uint8Array([
    (u >>> 24) & 0xff,
    (u >>> 16) & 0xff,
    (u >>> 8) & 0xff,
    u & 0xff,
  ]);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function biTo32(n: bigint): Uint8Array {
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const raw = new Uint8Array(hex.length / 2);
  for (let i = 0; i < raw.length; i++) {
    raw[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  if (raw.length === 32) return raw;
  if (raw.length > 32) return raw.slice(raw.length - 32);
  const out = new Uint8Array(32);
  out.set(raw, 32 - raw.length);
  return out;
}

interface ExtKey {
  key: Uint8Array;
  chainCode: Uint8Array;
}

function masterFromSeed(seed: Uint8Array): ExtKey {
  const i = hmac(sha512, utf8("Bitcoin seed"), seed);
  return { key: i.slice(0, 32), chainCode: i.slice(32) };
}

function ckdPriv(parent: ExtKey, index: number): ExtKey {
  const hardened = (index >>> 0) >= HARDENED;
  const data = hardened
    ? concat(new Uint8Array([0]), parent.key, int32be(index))
    : concat(publicKeyFromPrivate(parent.key), int32be(index));
  const i = hmac(sha512, parent.chainCode, data);
  const il = i.slice(0, 32);
  const ir = i.slice(32);
  const parseIl = BigInt("0x" + bytesToHex(il));
  if (parseIl >= N || parseIl === 0n) {
    throw new Error("invalid child key");
  }
  const parentN = BigInt("0x" + bytesToHex(parent.key));
  const ki = (parseIl + parentN) % N;
  if (ki === 0n) throw new Error("invalid child key zero");
  return { key: biTo32(ki), chainCode: ir };
}

function derivePath(master: ExtKey, path: string): ExtKey {
  let key = master;
  const body = path.replace(/^m\//i, "");
  if (!body) return key;
  for (const part of body.split("/")) {
    if (!part) continue;
    const hardened = part.endsWith("'") || part.endsWith("h") || part.endsWith("H");
    const num = parseInt(part.replace(/['hH]$/, ""), 10);
    const index = num + (hardened ? HARDENED : 0);
    key = ckdPriv(key, index);
  }
  return key;
}

export function mnemonicToSeed(phrase: string, passphrase = ""): Uint8Array {
  const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  return pbkdf2(sha512, utf8(normalized), utf8("mnemonic" + passphrase), {
    c: 2048,
    dkLen: 64,
  });
}

export function identityPath(
  identityIndex: number,
  keyIndex: number,
  testnet = true,
): string {
  const coin = testnet ? 1 : 5;
  return `m/9'/${coin}'/5'/0'/0'/${identityIndex}'/${keyIndex}'`;
}

export function derivePrivateKey(
  seed: Uint8Array,
  identityIndex: number,
  keyIndex: number,
  testnet = true,
): Uint8Array {
  const master = masterFromSeed(seed);
  return derivePath(master, identityPath(identityIndex, keyIndex, testnet)).key;
}

export function publicKeyHash160(compressedPub: Uint8Array): Uint8Array {
  return ripemd160(sha256(compressedPub));
}

export function compressedPubFromPriv(priv: Uint8Array): Uint8Array {
  return publicKeyFromPrivate(priv);
}

/** Ensure scalar is valid secp256k1 private key. */
export function assertPriv(priv: Uint8Array): void {
  if (priv.length !== 32) throw new Error("private key must be 32 bytes");
  // noble throws if invalid
  secp256k1.getPublicKey(priv, true);
}
