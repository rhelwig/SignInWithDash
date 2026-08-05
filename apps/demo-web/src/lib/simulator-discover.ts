/**
 * Discover real testnet Platform identities from a recovery phrase for the
 * dev simulator only. Uses the same Platform worker + DIP-9 derivation as the
 * authenticator. Phrase is not persisted.
 */
import {
  bytesToHex,
  hexToBytes,
} from "@siwd/protocol";
import {
  compressedPubFromPriv,
  derivePrivateKey,
  mnemonicToSeed,
  publicKeyHash160,
} from "./identity-derivation.js";
import {
  discoverByPublicKeyHashes,
  fetchIdentitySummary,
  resolveDpnsName,
} from "./platform.js";

export interface DiscoveredSimIdentity {
  identityId: string;
  dpnsName: string;
  keyId: number;
  identityIndex: number;
  /** Hex private key for HIGH (or matched) auth key — browser session only. */
  privateKeyHex: string;
  publicKeyHex: string;
  usernames: string[];
}

function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Discover identities for a mnemonic. Optional DPNS name assist.
 */
export async function discoverSimulatorIdentities(input: {
  phrase: string;
  hintName?: string | null;
  maxIdentityIndex?: number;
  /** Optional BIP-39 passphrase (13th/25th word). Empty = none. */
  passphrase?: string;
}): Promise<DiscoveredSimIdentity[]> {
  const phrase = normalizePhrase(input.phrase);
  const words = phrase.split(" ");
  if (![12, 15, 18, 21, 24].includes(words.length)) {
    throw new Error("Recovery phrase must be 12–24 BIP-39 words");
  }
  const seed = mnemonicToSeed(phrase, input.passphrase ?? "");
  const maxIdx = input.maxIdentityIndex ?? 3;

  // Optional name assist first
  const hint = input.hintName?.trim();
  if (hint) {
    const label = hint.replace(/\.dash$/i, "");
    try {
      const resolved = await resolveDpnsName(label);
      if (resolved.identityId) {
        const summary = await fetchIdentitySummary(resolved.identityId);
        if (summary) {
          const matched = matchSummary(summary, seed, maxIdx);
          if (matched) return [matched];
        }
      }
    } catch {
      /* fall through to hash discovery */
    }
  }

  // Derive candidate hashes (identity 0..max, key 0..5)
  const cands: Array<{
    identityIndex: number;
    keyId: number;
    priv: Uint8Array;
    pub: Uint8Array;
    hashHex: string;
  }> = [];
  for (let i = 0; i <= maxIdx; i++) {
    for (let k = 0; k <= 5; k++) {
      const priv = derivePrivateKey(seed, i, k, true);
      const pub = compressedPubFromPriv(priv);
      cands.push({
        identityIndex: i,
        keyId: k,
        priv,
        pub,
        hashHex: bytesToHex(publicKeyHash160(pub)),
      });
    }
  }

  const hashes = [...new Set(cands.map((c) => c.hashHex))];
  const result = await discoverByPublicKeyHashes(hashes);
  const out: DiscoveredSimIdentity[] = [];
  const seen = new Set<string>();

  for (const idSummary of result.identities || []) {
    if (seen.has(idSummary.identityId)) continue;
    const matched = matchSummary(idSummary, seed, maxIdx);
    if (matched) {
      seen.add(matched.identityId);
      out.push(matched);
    } else {
      // Fallback: use first matching hash candidate + prefer key id 1 (HIGH)
      for (const f of result.found || []) {
        if (!f.identityIds?.includes(idSummary.identityId)) continue;
        const cand = cands.find((c) => c.hashHex === f.publicKeyHash);
        if (!cand) continue;
        const preferKey = cand.keyId === 0 ? 1 : cand.keyId;
        const priv = derivePrivateKey(seed, cand.identityIndex, preferKey, true);
        const pub = compressedPubFromPriv(priv);
        const names = idSummary.usernames?.length
          ? idSummary.usernames
          : ["unnamed.dash"];
        seen.add(idSummary.identityId);
        out.push({
          identityId: idSummary.identityId,
          dpnsName: names[0]!.endsWith(".dash")
            ? names[0]!
            : `${names[0]}.dash`,
          keyId: preferKey,
          identityIndex: cand.identityIndex,
          privateKeyHex: bytesToHex(priv),
          publicKeyHex: bytesToHex(pub),
          usernames: names,
        });
        break;
      }
    }
  }

  return out;
}

function matchSummary(
  summary: {
    identityId: string;
    keys: Array<{
      id: number;
      purpose: string;
      securityLevel: string;
      disabled: boolean;
      publicKeyHex?: string;
    }>;
    usernames: string[];
  },
  seed: Uint8Array,
  maxIdx: number,
): DiscoveredSimIdentity | null {
  const keys = [...(summary.keys || [])].sort((a, b) => {
    const rank = (s: string) =>
      s.toUpperCase().includes("HIGH")
        ? 0
        : s.toUpperCase().includes("CRITICAL")
          ? 1
          : 2;
    return rank(a.securityLevel) - rank(b.securityLevel);
  });
  for (const k of keys) {
    if (k.disabled) continue;
    const purpose = (k.purpose || "").toUpperCase();
    if (purpose && !purpose.includes("AUTH") && purpose !== "0") continue;
    const level = (k.securityLevel || "").toUpperCase();
    if (level.includes("MASTER")) continue;
    const reported = (k.publicKeyHex || "").toLowerCase().replace(/^0x/, "");
    for (let idx = 0; idx <= maxIdx; idx++) {
      const priv = derivePrivateKey(seed, idx, k.id, true);
      const pub = compressedPubFromPriv(priv);
      const pubHex = bytesToHex(pub);
      if (reported && reported !== pubHex) continue;
      if (!reported && level && !level.includes("HIGH") && level !== "2") {
        continue;
      }
      const names = summary.usernames?.length
        ? summary.usernames.map((n) => (n.endsWith(".dash") ? n : `${n}.dash`))
        : ["unnamed.dash"];
      return {
        identityId: summary.identityId,
        dpnsName: names[0]!,
        keyId: k.id,
        identityIndex: idx,
        privateKeyHex: bytesToHex(priv),
        publicKeyHex: pubHex,
        usernames: names,
      };
    }
  }
  return null;
}

export function parseCustomSigner(body: {
  privateKeyHex?: string;
  identityId?: string;
  dpnsName?: string;
  keyId?: number;
}): { privateKey: Uint8Array; keyId: number; dpnsName: string; identityId: string } | null {
  const privHex = String(body.privateKeyHex || "").replace(/^0x/, "");
  const identityId = String(body.identityId || "");
  const dpnsName = String(body.dpnsName || "");
  const keyId = Number(body.keyId);
  if (!/^[0-9a-fA-F]{64}$/.test(privHex) || !identityId || !dpnsName) {
    return null;
  }
  if (!Number.isFinite(keyId) || keyId < 0) return null;
  return {
    privateKey: hexToBytes(privHex),
    keyId,
    dpnsName: dpnsName.endsWith(".dash") ? dpnsName : `${dpnsName}.dash`,
    identityId,
  };
}
