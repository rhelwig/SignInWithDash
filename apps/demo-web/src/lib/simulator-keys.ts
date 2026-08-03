/**
 * Development-only fixture identities for M1 (no live Platform).
 * Private keys are deterministic test scalars — NEVER real wallet material.
 */
import {
  encodeIdentityId,
  hexToBytes,
  publicKeyFromPrivate,
  bytesToHex,
} from "@siwd/protocol";

function privFromByte(b: number): Uint8Array {
  const p = new Uint8Array(32);
  p[31] = b;
  return p;
}

function identityFromByte(b: number): { raw: Uint8Array; id: string } {
  const raw = new Uint8Array(32).fill(b);
  return { raw, id: encodeIdentityId(raw) };
}

const alice = identityFromByte(0x11);
const bob = identityFromByte(0x22);

const alicePriv = privFromByte(1);
const bobPriv = privFromByte(2);

export interface SimKey {
  keyId: number;
  keyPurpose: string;
  securityLevel: string;
  disabled: boolean;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface SimIdentity {
  identityId: string;
  dpnsName: string;
  unavailable?: boolean;
  dpnsStatus: "finalized" | "contested" | "unresolved";
  dpnsResolvedIdentityId: string;
  keys: SimKey[];
}

function makeHighKey(keyId: number, priv: Uint8Array): SimKey {
  return {
    keyId,
    keyPurpose: "AUTHENTICATION",
    securityLevel: "HIGH",
    disabled: false,
    publicKey: publicKeyFromPrivate(priv),
    privateKey: priv,
  };
}

const FIXTURES: SimIdentity[] = [
  {
    identityId: alice.id,
    dpnsName: "alice.dash",
    dpnsStatus: "finalized",
    dpnsResolvedIdentityId: alice.id,
    keys: [
      makeHighKey(2, alicePriv),
      // ineligible siblings for negative tests via API if needed
      {
        keyId: 0,
        keyPurpose: "AUTHENTICATION",
        securityLevel: "MASTER",
        disabled: false,
        publicKey: publicKeyFromPrivate(privFromByte(0x10)),
        privateKey: privFromByte(0x10),
      },
      {
        keyId: 1,
        keyPurpose: "AUTHENTICATION",
        securityLevel: "CRITICAL",
        disabled: false,
        publicKey: publicKeyFromPrivate(privFromByte(0x11)),
        privateKey: privFromByte(0x11),
      },
    ],
  },
  {
    identityId: bob.id,
    dpnsName: "bob.dash",
    dpnsStatus: "finalized",
    dpnsResolvedIdentityId: bob.id,
    keys: [makeHighKey(2, bobPriv)],
  },
];

export function listSimulatorIdentities(): Array<{
  identityId: string;
  dpnsName: string;
  keyId: number;
  publicKey_hex: string;
}> {
  return FIXTURES.map((f) => {
    const k = f.keys.find(
      (x) => x.securityLevel === "HIGH" && x.keyPurpose === "AUTHENTICATION",
    )!;
    return {
      identityId: f.identityId,
      dpnsName: f.dpnsName,
      keyId: k.keyId,
      publicKey_hex: bytesToHex(k.publicKey),
    };
  });
}

export function getSimulatorPlatform(
  identityId: string,
  dpnsName: string,
): SimIdentity | null {
  const byId = FIXTURES.find((f) => f.identityId === identityId);
  if (!byId) return null;
  // Name must match fixture binding for demo
  if (byId.dpnsName !== dpnsName) {
    return {
      ...byId,
      dpnsStatus: "finalized",
      dpnsResolvedIdentityId: "mismatch",
    };
  }
  return byId;
}

export function getSimulatorSigner(
  identityId: string,
): { privateKey: Uint8Array; keyId: number; dpnsName: string } | null {
  const f = FIXTURES.find((x) => x.identityId === identityId);
  if (!f) return null;
  const k = f.keys.find(
    (x) =>
      x.keyPurpose === "AUTHENTICATION" &&
      x.securityLevel === "HIGH" &&
      !x.disabled,
  );
  if (!k) return null;
  return { privateKey: k.privateKey, keyId: k.keyId, dpnsName: f.dpnsName };
}

export function simulatorTestKeyNote(): string {
  return (
    "Simulator uses deterministic test private keys (scalars 1 and 2), " +
    "not recovery phrases. These identities exist only in this demo process."
  );
}

// silence unused import if tree-shaken oddly
void hexToBytes;
